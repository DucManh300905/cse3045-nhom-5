import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getErrorCode, getErrorDetail, getErrorMessage } from '../api/client';
import { menuApi } from '../api/menu';
import { newIdempotencyKey, ordersApi, type PlaceOrderInput } from '../api/orders';
import { usersApi } from '../api/users';
import { vouchersApi } from '../api/vouchers';
import AppHeader from '../components/AppHeader';
import CartLines from '../components/CartLines';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import type { Address, FulfillmentType, OrderPreview, PaymentMethod, PaymentMethods, PublicVoucher, Restaurant, VoucherFundedBy } from '../types';
import { formatPrice, PHONE_REGEX } from '../utils/format';
import { closedReason } from '../utils/openingHours';
import { LocationPicker } from '../components/LazyMap';
import { formatKm, fromPoint, type LatLng } from '../utils/geo';
import { describeVoucher, FUNDED_LABEL, isVoucherError, PAYMENT_LABEL, voucherErrorMessage, voucherMethods } from '../utils/voucher';

const STEPS = ['Chọn món', 'Thông tin giao hàng', 'Hoàn tất'];
const MAX_ADDRESSES = 5;
/** Chọn "địa chỉ khác" thay vì địa chỉ đã lưu */
const NEW_ADDRESS = 'new';
/** Lỗi do dữ liệu trong giỏ đã cũ (suất / tùy chọn / quán đóng) -> tải lại menu để cập nhật giỏ */
const STALE_CART_CODES = ['ITEM_OUT_OF_STOCK', 'INVALID_OPTIONS', 'MULTIPLE_RESTAURANTS', 'RESTAURANT_CLOSED'];

export default function CheckoutPage() {
  const { user } = useAuth();
  const { restaurant: cartShop, lines, count, refresh, clear } = useCart();
  const notify = useToast();
  const navigate = useNavigate();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState(NEW_ADDRESS);
  const [fulfillment, setFulfillment] = useState<FulfillmentType>('DELIVERY');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [methods, setMethods] = useState<PaymentMethods | null>(null);
  // Voucher: tối đa 1 voucher quán + 1 voucher MAK (kind = loại của từng mã đã chọn)
  const [voucherCodes, setVoucherCodes] = useState<string[]>([]);
  const [voucherKinds, setVoucherKinds] = useState<Record<string, VoucherFundedBy>>({});
  const [available, setAvailable] = useState<PublicVoucher[]>([]);
  const [codeInput, setCodeInput] = useState('');
  const [voucherNotice, setVoucherNotice] = useState('');
  const [applying, setApplying] = useState(false);
  const [form, setForm] = useState({
    receiverName: user?.fullName ?? '',
    phone: user?.phone ?? '',
    address: '',
    note: '',
  });
  const [saveAddress, setSaveAddress] = useState(true);
  // Vị trí nơi nhận vừa ghim (địa chỉ mới, hoặc địa chỉ trong sổ chưa có vị trí)
  const [pin, setPin] = useState<LatLng | null>(null);
  const [outOfRange, setOutOfRange] = useState(false);
  const fillAddress = useCallback((a: string) => setForm(f => (f.address.trim() ? f : { ...f, address: a })), []);
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [menuVersion, setMenuVersion] = useState(0);
  /** Giữ nguyên khi mạng lỗi để bấm lại không tạo đơn thứ 2 (BR-38) */
  const idempotencyKey = useRef<string | null>(null);
  const setField = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Menu mới nhất của quán: cập nhật giá / suất còn lại trong giỏ, trạng thái nhận đơn
  const shopId = cartShop?.id;
  useEffect(() => {
    if (!shopId) return;
    menuApi.getRestaurantMenu(shopId)
      .then(res => {
        setRestaurant(res.restaurant);
        refresh(res.categories.flatMap(c => c.items));
      })
      .catch(err => setError(getErrorMessage(err)));
  }, [shopId, refresh, menuVersion]);

  // Chuyển khoản chỉ hiện khi MAK đã bật (có tài khoản nhận + webhook SePay)
  useEffect(() => {
    ordersApi.methods().then(setMethods).catch(() => setMethods(null));
  }, []);

  // Voucher dùng được ở quán đang đặt (đổi quán -> bỏ voucher đã chọn)
  useEffect(() => {
    setVoucherCodes([]);
    setVoucherNotice('');
    if (!shopId) return;
    vouchersApi.available(shopId).then(setAvailable).catch(() => setAvailable([]));
  }, [shopId]);

  // Sổ địa chỉ: chọn sẵn địa chỉ mặc định
  useEffect(() => {
    usersApi.listAddresses()
      .then(list => {
        setAddresses(list);
        const def = list.find(a => a.isDefault) ?? list[0];
        if (def) setAddressId(def.id);
      })
      .catch(() => setAddresses([]));
  }, []);

  const items = useMemo(
    () => lines.map(l => ({ menuItemId: l.menuItemId, variantId: l.variantId, optionIds: l.optionIds, qty: l.qty })),
    [lines]
  );

  const savedAddress = addresses.find(a => a.id === addressId);
  // Vị trí nơi nhận (BR-81): địa chỉ trong sổ đã ghim, hoặc điểm vừa ghim trên bản đồ
  const deliveryPoint: LatLng | null = fulfillment === 'DELIVERY' ? (fromPoint(savedAddress?.location) ?? pin) : null;
  const pointKey = deliveryPoint ? `${deliveryPoint.lat.toFixed(5)},${deliveryPoint.lng.toFixed(5)}` : '';

  // Đổi địa chỉ -> bỏ điểm đã ghim cho địa chỉ trước
  useEffect(() => { setPin(null); }, [addressId]);

  // Quán giao bằng tài xế MAK: giao tận nơi chỉ nhận chuyển khoản trước (BR-91)
  // Quán "Theo lịch": server báo đúng lúc này có giao bằng tài xế MAK không (preview.prepaidRequired)
  const platformDelivery = fulfillment === 'DELIVERY'
    && (preview ? preview.prepaidRequired : (restaurant?.deliveryModeNow ?? restaurant?.deliveryMode) === 'PLATFORM');
  useEffect(() => {
    if (platformDelivery && paymentMethod === 'COD' && methods?.BANK_TRANSFER) setPaymentMethod('BANK_TRANSFER');
  }, [platformDelivery, paymentMethod, methods]);

  // Tiền do server tính (BR-31): gọi lại khi giỏ hoặc hình thức nhận hàng đổi
  useEffect(() => {
    if (!shopId || !items.length) return;
    let ignore = false;
    const t = window.setTimeout(() => {
      ordersApi.preview({ restaurantId: shopId, items, fulfillmentType: fulfillment, voucherCodes, paymentMethod, delivery: deliveryPoint ?? undefined })
        .then(p => { if (!ignore) { setPreview(p); setPreviewError(''); setOutOfRange(false); } })
        .catch(err => {
          if (ignore) return;
          // Giỏ đổi làm voucher không còn hợp lệ (vd dưới đơn tối thiểu) -> bỏ mã đó, tính lại
          if (isVoucherError(err) && voucherCodes.length) {
            const bad = String(getErrorDetail(err)?.code ?? '');
            setVoucherNotice(`${bad ? `${bad}: ` : ''}${voucherErrorMessage(err)} Đã bỏ mã khỏi đơn.`);
            setVoucherCodes(codes => (bad && codes.includes(bad) ? codes.filter(c => c !== bad) : []));
            return;
          }
          setPreview(null);
          // Ngoài bán kính giao: nói rõ quãng đường + gợi ý tự đến lấy
          if (getErrorCode(err) === 'OUT_OF_DELIVERY_RANGE') {
            const d = getErrorDetail(err);
            setOutOfRange(true);
            setPreviewError(`Nơi nhận cách quán ${formatKm(Number(d?.distanceKm ?? 0))}, quán chỉ giao trong ${formatKm(Number(d?.maxKm ?? 0))}.`);
            return;
          }
          setOutOfRange(false);
          setPreviewError(getErrorMessage(err));
        });
    }, 250);
    return () => { ignore = true; window.clearTimeout(t); };
    // pointKey: chỉ gọi lại khi vị trí nơi nhận đổi thật (tiết kiệm lượt gọi định tuyến)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, items, fulfillment, voucherCodes, paymentMethod, pointKey]);

  /** Thêm mã: kiểm tra riêng mã đó để biết loại, rồi thay mã cùng loại đang chọn (mỗi loại tối đa 1) */
  const applyCode = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code || !shopId) return;
    if (voucherCodes.includes(code)) return setVoucherNotice(`Mã ${code} đã được áp dụng.`);
    setApplying(true);
    setVoucherNotice('');
    try {
      const p = await ordersApi.preview({ restaurantId: shopId, items, fulfillmentType: fulfillment, voucherCodes: [code], paymentMethod });
      const kind = p.vouchers[0]?.fundedBy;
      if (!kind) return;
      setVoucherKinds(k => ({ ...k, [code]: kind }));
      setVoucherCodes(codes => [...codes.filter(c => voucherKinds[c] !== kind), code]);
      setCodeInput('');
    } catch (err) {
      setVoucherNotice(voucherErrorMessage(err));
    } finally {
      setApplying(false);
    }
  };
  const removeCode = (code: string) => setVoucherCodes(codes => codes.filter(c => c !== code));

  const closed = !!restaurant && !restaurant.canAcceptOrders;
  const subtotal = preview?.subtotal ?? lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !cartShop) return;
    if (!lines.length) return setError('Giỏ hàng đang trống.');
    if (closed) return setError('Quán hiện không nhận đơn.');

    const input: PlaceOrderInput = { restaurantId: cartShop.id, items, fulfillmentType: fulfillment, paymentMethod, voucherCodes };
    const saved = addresses.find(a => a.id === addressId);
    let newAddress: { receiverName: string; phone: string; addressLine: string } | null = null;

    if (fulfillment === 'DELIVERY') {
      if (!deliveryPoint) return setError('Vui lòng ghim vị trí nhận hàng trên bản đồ.');
      if (saved) {
        input.addressId = saved.id;
        // Địa chỉ cũ chưa có vị trí: gửi điểm vừa ghim (server lưu luôn vào sổ)
        input.delivery = { note: form.note.trim() || undefined, ...(fromPoint(saved.location) ? {} : deliveryPoint) };
      } else {
        if (!form.receiverName.trim()) return setError('Vui lòng nhập tên người nhận.');
        if (!PHONE_REGEX.test(form.phone)) return setError('Vui lòng nhập số điện thoại liên hệ hợp lệ (10 chữ số, bắt đầu bằng 0).');
        if (form.address.trim().length < 5) return setError('Vui lòng nhập địa chỉ giao hàng cụ thể.');
        newAddress = { receiverName: form.receiverName.trim(), phone: form.phone, addressLine: form.address.trim() };
        input.delivery = { ...newAddress, note: form.note.trim() || undefined, ...deliveryPoint };
      }
    }

    setError('');
    setSubmitting(true);
    idempotencyKey.current ??= newIdempotencyKey();

    try {
      const order = await ordersApi.place(input, idempotencyKey.current);
      idempotencyKey.current = null;

      // Lưu sổ địa chỉ sau khi đặt xong; lỗi ở đây không ảnh hưởng đơn
      if (newAddress && saveAddress && addresses.length < MAX_ADDRESSES) {
        usersApi.createAddress({ ...newAddress, ...(deliveryPoint ?? {}) }).catch(err => notify(`Chưa lưu được địa chỉ: ${getErrorMessage(err)}`));
      }

      clear();
      if (order.status === 'PENDING_PAYMENT') {
        // Trả trước: sang trang quét mã, đơn tới quán khi tiền về
        navigate(`/orders/${order.id}/pay`);
        notify(`Đã tạo đơn ${order.code} — vui lòng chuyển khoản`);
      } else {
        navigate('/orders', { state: { placedCode: order.code, placedId: order.id } });
        notify(`Đặt món thành công! Mã đơn ${order.code}`);
      }
    } catch (err) {
      // Server đã trả lời (từ chối) -> lần sau là yêu cầu mới; mạng lỗi -> giữ key để gửi lại an toàn
      if (axios.isAxiosError(err) && err.response) idempotencyKey.current = null;
      setError(isVoucherError(err) ? voucherErrorMessage(err) : getErrorMessage(err));
      if (STALE_CART_CODES.includes(getErrorCode(err) ?? '')) setMenuVersion(v => v + 1);
      // Voucher vừa hết lượt / hết hạn -> bỏ mã để khách đặt lại được
      if (isVoucherError(err)) {
        const bad = String(getErrorDetail(err)?.code ?? '');
        setVoucherCodes(codes => (bad ? codes.filter(c => c !== bad) : []));
        vouchersApi.available(cartShop.id).then(setAvailable).catch(() => {});
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="app">
      <AppHeader />
      <main className="container page-body">
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < 1 ? 'done' : i === 1 ? 'current' : ''}>
              <span>{i + 1}</span>{s}
            </li>
          ))}
        </ol>

        <h1 className="page-title">Xác nhận đặt món</h1>

        {lines.length === 0 ? (
          <div className="empty-state">
            <h2>Giỏ hàng đang trống</h2>
            <p>Hãy chọn vài món ngon trước khi đặt nhé.</p>
            <Link to="/menu" className="btn-primary">Xem thực đơn</Link>
          </div>
        ) : (
          <form className="checkout-grid" onSubmit={submit} noValidate>
            <section className="panel form-panel">
              <div className="segmented" role="radiogroup" aria-label="Hình thức nhận hàng">
                <button type="button" className={fulfillment === 'DELIVERY' ? 'active' : ''} onClick={() => setFulfillment('DELIVERY')}>
                  Giao tận nơi
                </button>
                <button type="button" className={fulfillment === 'PICKUP' ? 'active' : ''} onClick={() => setFulfillment('PICKUP')}>
                  Tự đến lấy
                </button>
              </div>

              {fulfillment === 'PICKUP' ? (
                <div className="pickup-info">
                  <h2>Đến lấy tại quán</h2>
                  <p><b>{restaurant?.name ?? cartShop?.name}</b></p>
                  {restaurant && <p className="muted">{restaurant.address} · {restaurant.phone}</p>}
                  <p className="muted">Quán sẽ báo khi món sẵn sàng để bạn qua lấy.</p>
                </div>
              ) : (
                <>
                  <h2>Giao đến đâu?</h2>

                  {addresses.length > 0 && (
                    <div className="address-picker" role="radiogroup" aria-label="Địa chỉ giao hàng">
                      {addresses.map(a => (
                        <label key={a.id} className={addressId === a.id ? 'address-option active' : 'address-option'}>
                          <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                          <span>
                            <b>{a.label || a.receiverName}{a.isDefault && <em className="tag">Mặc định</em>}</b>
                            <small>{a.receiverName} · {a.phone}</small>
                            <small>{a.addressLine}</small>
                          </span>
                        </label>
                      ))}
                      <label className={addressId === NEW_ADDRESS ? 'address-option active' : 'address-option'}>
                        <input type="radio" name="address" checked={addressId === NEW_ADDRESS} onChange={() => setAddressId(NEW_ADDRESS)} />
                        <span><b>Giao đến địa chỉ khác</b></span>
                      </label>
                    </div>
                  )}

                  {savedAddress && !fromPoint(savedAddress.location) && (
                    <div className="field">
                      <span className="warn-line">Địa chỉ này chưa có vị trí trên bản đồ — ghim một lần, MAK lưu lại cho lần sau.</span>
                      <LocationPicker value={pin} onChange={setPin} />
                    </div>
                  )}

                  {addressId === NEW_ADDRESS && (
                    <>
                      <label>
                        <span>Địa chỉ giao hàng *</span>
                        <textarea
                          value={form.address}
                          onChange={e => setField('address', e.target.value)}
                          placeholder="vd: Phòng 305, KTX Đại học Việt Nhật, Khu CNC Hòa Lạc"
                          rows={3}
                          maxLength={255}
                        />
                      </label>
                      <div className="field">
                        <span>Vị trí nhận hàng trên bản đồ *</span>
                        <LocationPicker value={pin} onChange={setPin} onAddress={fillAddress} />
                      </div>
                      <div className="form-grid">
                        <label>
                          <span>Tên người nhận *</span>
                          <input value={form.receiverName} onChange={e => setField('receiverName', e.target.value)} autoComplete="name" maxLength={100} />
                        </label>
                        <label>
                          <span>Số điện thoại liên hệ *</span>
                          <input type="tel" inputMode="numeric" value={form.phone} onChange={e => setField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0912345678" autoComplete="tel" />
                        </label>
                      </div>
                      {addresses.length < MAX_ADDRESSES && (
                        <label className="check-row">
                          <input type="checkbox" checked={saveAddress} onChange={e => setSaveAddress(e.target.checked)} />
                          <span>Lưu vào sổ địa chỉ</span>
                        </label>
                      )}
                    </>
                  )}

                  <label>
                    <span>Ghi chú cho quán / người giao</span>
                    <input value={form.note} onChange={e => setField('note', e.target.value)} placeholder="vd: Ít cay, gọi trước khi đến" maxLength={200} />
                  </label>
                </>
              )}

              <div className="pay-methods" role="radiogroup" aria-label="Hình thức thanh toán">
                <button
                  type="button"
                  role="radio"
                  aria-checked={paymentMethod === 'COD'}
                  className={`pay-method ${paymentMethod === 'COD' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('COD')}
                  disabled={platformDelivery}
                >
                  <div>
                    <b>Tiền mặt khi nhận hàng</b>
                    <small>
                      {platformDelivery
                        ? 'Không áp dụng: quán giao bằng tài xế MAK, cần chuyển khoản trước'
                        : fulfillment === 'PICKUP' ? 'Thanh toán tại quán khi lấy món' : 'Thanh toán trực tiếp cho người giao'}
                    </small>
                  </div>
                </button>
                {methods?.BANK_TRANSFER && (
                  <button type="button" role="radio" aria-checked={paymentMethod === 'BANK_TRANSFER'} className={`pay-method ${paymentMethod === 'BANK_TRANSFER' ? 'active' : ''}`} onClick={() => setPaymentMethod('BANK_TRANSFER')}>
                    <div>
                      <b>Chuyển khoản VietQR (trả trước)</b>
                      <small>Quét mã trong {methods.paymentTimeoutMinutes} phút, tự xác nhận khi tiền về. Đơn bị hủy sẽ được hoàn tiền</small>
                    </div>
                  </button>
                )}
              </div>
              {platformDelivery && (
                <p className={methods?.BANK_TRANSFER ? 'muted small-note' : 'form-error'}>
                  🛵 {restaurant?.deliveryMode === 'SCHEDULED' && restaurant.platformWindowsToday?.length
                    ? <>Từ {restaurant.platformWindowsToday.map(w => `${w.start} đến ${w.end}`).join(', ')} quán giao bằng <b>tài xế MAK</b></>
                    : <>Quán giao bằng <b>tài xế MAK</b></>} — miễn phí ship, theo dõi tài xế trên bản đồ.
                  {methods?.BANK_TRANSFER ? ' Đơn giao tận nơi thanh toán chuyển khoản trước.' : ' Hiện MAK chưa nhận chuyển khoản, bạn hãy chọn "Tự đến lấy".'}
                </p>
              )}
            </section>

            <section className="panel summary">
              <div className="summary-head">
                <h2>{cartShop?.name ?? 'Đơn của bạn'}</h2>
                {cartShop && <Link to={`/restaurants/${cartShop.slug}`} className="link-btn">+ Thêm món</Link>}
              </div>
              {closed && restaurant && <div className="form-error">{closedReason(restaurant)?.full ?? 'Quán đang tạm ngưng nhận đơn'}. Chưa đặt được đơn lúc này.</div>}
              <CartLines />

              <div className="voucher-box">
                <b>Mã giảm giá</b>
                <div className="voucher-input">
                  <input
                    value={codeInput}
                    onChange={e => setCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCode(codeInput); } }}
                    placeholder="Nhập mã"
                    maxLength={20}
                    aria-label="Mã giảm giá"
                  />
                  <button type="button" className="btn-soft" onClick={() => applyCode(codeInput)} disabled={applying || !codeInput.trim()}>
                    Áp dụng
                  </button>
                </div>
                {voucherNotice && <small className="warn-line">{voucherNotice}</small>}
                {available.length > 0 && (
                  <ul className="voucher-list">
                    {available.map(v => {
                      const chosen = voucherCodes.includes(v.code);
                      const short = subtotal < v.minOrderAmount ? v.minOrderAmount - subtotal : 0;
                      const methods = voucherMethods(v);
                      const wrongMethod = !methods.includes(paymentMethod);
                      return (
                        <li key={v.id} className={chosen ? 'chosen' : ''}>
                          <div>
                            <small className={`voucher-kind k-${v.fundedBy}`}>{FUNDED_LABEL[v.fundedBy]}</small>
                            <b className="mono">{v.code}</b>
                            <small>{describeVoucher(v)}{v.description ? ` · ${v.description}` : ''}</small>
                            {short > 0 && <small className="muted">Mua thêm {formatPrice(short)} để dùng</small>}
                            {wrongMethod && <small className="muted">Chọn thanh toán {methods.map(m => PAYMENT_LABEL[m]).join(' / ')} để dùng</small>}
                          </div>
                          {chosen
                            ? <button type="button" className="link-btn" onClick={() => removeCode(v.code)}>Bỏ</button>
                            : <button type="button" className="btn-outline" disabled={applying || short > 0 || wrongMethod} onClick={() => applyCode(v.code)}>Dùng</button>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="totals">
                <div><span>Tạm tính ({count} món)</span><span>{formatPrice(subtotal)}</span></div>
                <div><span>Phí giao hàng</span><span className="free">Miễn phí</span></div>
                {preview?.route && (
                  <div className="route-line">
                    <span>Quãng đường giao</span>
                    <span>
                      {formatKm(preview.route.distanceKm)} · ~{preview.route.durationMinutes} phút
                      {preview.route.source === 'ESTIMATE' && <small className="muted"> (ước lượng)</small>}
                    </span>
                  </div>
                )}
                {preview?.estimatedDeliveryMinutes && (
                  <div className="route-line"><span>Dự kiến nhận hàng</span><span>khoảng {preview.estimatedDeliveryMinutes} phút sau khi quán nhận đơn</span></div>
                )}
                {preview?.vouchers.map(v => (
                  <div key={v.code} className="discount-line">
                    <span>
                      {FUNDED_LABEL[v.fundedBy]} <b className="mono">{v.code}</b>{' '}
                      <button type="button" className="link-btn small" onClick={() => removeCode(v.code)} aria-label={`Bỏ mã ${v.code}`}>✕</button>
                    </span>
                    <span>−{formatPrice(v.discount)}</span>
                  </div>
                ))}
                {previewError && (
                  <div className="warn-line">
                    <span>{previewError}</span>
                    {outOfRange && <button type="button" className="link-btn" onClick={() => setFulfillment('PICKUP')}>Chuyển sang tự đến lấy</button>}
                  </div>
                )}
                <div className="grand"><span>Tổng cộng</span><strong>{preview ? formatPrice(preview.total) : '...'}</strong></div>
              </div>
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="btn-primary wide" type="submit" disabled={submitting || closed || !preview}>
                {submitting ? 'Đang đặt món...' : preview ? `Đặt món · ${formatPrice(preview.total)}` : 'Đặt món'}
              </button>
            </section>
          </form>
        )}
      </main>
    </div>
  );
}
