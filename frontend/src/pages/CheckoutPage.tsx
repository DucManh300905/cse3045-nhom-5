import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getErrorCode, getErrorMessage } from '../api/client';
import { menuApi } from '../api/menu';
import { newIdempotencyKey, ordersApi, type PlaceOrderInput } from '../api/orders';
import { usersApi } from '../api/users';
import AppHeader from '../components/AppHeader';
import CartLines from '../components/CartLines';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import type { Address, FulfillmentType, OrderPreview, Restaurant } from '../types';
import { formatPrice, PHONE_REGEX } from '../utils/format';

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
  const [form, setForm] = useState({
    receiverName: user?.fullName ?? '',
    phone: user?.phone ?? '',
    address: '',
    note: '',
  });
  const [saveAddress, setSaveAddress] = useState(true);
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

  // Tiền do server tính (BR-31): gọi lại khi giỏ hoặc hình thức nhận hàng đổi
  useEffect(() => {
    if (!shopId || !items.length) return;
    let ignore = false;
    const t = window.setTimeout(() => {
      ordersApi.preview({ restaurantId: shopId, items, fulfillmentType: fulfillment })
        .then(p => { if (!ignore) { setPreview(p); setPreviewError(''); } })
        .catch(err => {
          if (ignore) return;
          setPreview(null);
          setPreviewError(getErrorMessage(err));
        });
    }, 250);
    return () => { ignore = true; window.clearTimeout(t); };
  }, [shopId, items, fulfillment]);

  const closed = !!restaurant && !restaurant.canAcceptOrders;
  const subtotal = preview?.subtotal ?? lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !cartShop) return;
    if (!lines.length) return setError('Giỏ hàng đang trống.');
    if (closed) return setError('Quán hiện không nhận đơn.');

    const input: PlaceOrderInput = { restaurantId: cartShop.id, items, fulfillmentType: fulfillment, paymentMethod: 'COD' };
    const saved = addresses.find(a => a.id === addressId);
    let newAddress: { receiverName: string; phone: string; addressLine: string } | null = null;

    if (fulfillment === 'DELIVERY') {
      if (saved) {
        input.addressId = saved.id;
        input.delivery = { note: form.note.trim() || undefined };
      } else {
        if (!form.receiverName.trim()) return setError('Vui lòng nhập tên người nhận.');
        if (!PHONE_REGEX.test(form.phone)) return setError('Vui lòng nhập số điện thoại liên hệ hợp lệ (10 chữ số, bắt đầu bằng 0).');
        if (form.address.trim().length < 5) return setError('Vui lòng nhập địa chỉ giao hàng cụ thể.');
        newAddress = { receiverName: form.receiverName.trim(), phone: form.phone, addressLine: form.address.trim() };
        input.delivery = { ...newAddress, note: form.note.trim() || undefined };
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
        usersApi.createAddress(newAddress).catch(err => notify(`Chưa lưu được địa chỉ: ${getErrorMessage(err)}`));
      }

      navigate('/orders', { state: { placedCode: order.code, placedId: order.id } });
      clear();
      notify(`Đặt món thành công! Mã đơn ${order.code}`);
    } catch (err) {
      // Server đã trả lời (từ chối) -> lần sau là yêu cầu mới; mạng lỗi -> giữ key để gửi lại an toàn
      if (axios.isAxiosError(err) && err.response) idempotencyKey.current = null;
      setError(getErrorMessage(err));
      if (STALE_CART_CODES.includes(getErrorCode(err) ?? '')) setMenuVersion(v => v + 1);
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

              <div className="pay-method">
                <div>
                  <b>Tiền mặt khi nhận hàng</b>
                  <small>{fulfillment === 'PICKUP' ? 'Thanh toán tại quán khi lấy món' : 'Thanh toán trực tiếp cho người giao'}</small>
                </div>
              </div>
            </section>

            <section className="panel summary">
              <div className="summary-head">
                <h2>{cartShop?.name ?? 'Đơn của bạn'}</h2>
                {cartShop && <Link to={`/restaurants/${cartShop.slug}`} className="link-btn">+ Thêm món</Link>}
              </div>
              {closed && <div className="form-error">Quán đang tạm ngưng nhận đơn.</div>}
              <CartLines />
              <div className="totals">
                <div><span>Tạm tính ({count} món)</span><span>{formatPrice(subtotal)}</span></div>
                <div><span>Phí giao hàng</span><span className="free">Miễn phí</span></div>
                {previewError && <div className="warn-line"><span>{previewError}</span></div>}
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
