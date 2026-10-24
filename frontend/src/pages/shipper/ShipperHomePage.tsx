import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { shipperApi } from '../../api/shipper';
import { TrackMap } from '../../components/LazyMap';
import type { TrackPoint } from '../../components/LocationPicker';
import { useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import type { ShipperOrder, ShipperState } from '../../types';
import { playChime, preloadChime, stopChime, unlockChime } from '../../utils/chime';
import { DELIVERY_STATUS_LABEL, compressImage, decodePolyline, etaText } from '../../utils/delivery';
import { formatPrice } from '../../utils/format';
import { directionsUrl, formatKm, fromPoint, type LatLng } from '../../utils/geo';
import { useShipper } from './ShipperLayout';

/** Nhịp gửi vị trí (kế hoạch mục 6): 5 giây khi đang giao, 30 giây khi rảnh — tiết kiệm pin */
const BUSY_INTERVAL = 5000;
const IDLE_INTERVAL = 30000;

type PhotoAction = { kind: 'delivered' } | { kind: 'failed'; reason: string };

export default function ShipperHomePage() {
  const { profile, setProfile } = useShipper();
  const notify = useToast();
  const [state, setState] = useState<ShipperState | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [gps, setGps] = useState<{ at: LatLng | null; error: string }>({ at: null, error: '' });
  const [photo, setPhoto] = useState<{ action: PhotoAction; blob: Blob; url: string } | null>(null);
  const [failReason, setFailReason] = useState<string | null>(null);
  const position = useRef<LatLng | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingAction = useRef<PhotoAction | null>(null);

  const approved = profile?.status === 'APPROVED';
  // Tải sẵn file âm báo cho lời mời nhận đơn
  useEffect(() => { preloadChime(); }, []);
  const online = state?.shipper.isOnline ?? profile?.isOnline ?? false;
  const order = state?.activeOrder ?? null;
  const offer = order ? null : state?.offer ?? null;

  const load = useCallback(async () => {
    try {
      const s = await shipperApi.state();
      setState(s);
      setProfile(s.shipper);
    } catch (err) {
      notify(getErrorMessage(err));
    }
  }, [notify, setProfile]);

  useEffect(() => {
    if (approved) load();
  }, [approved, load]);

  // Đồng hồ cho đếm ngược lời mời
  useEffect(() => {
    if (!offer) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [offer]);

  // Realtime: lời mời mới / bị thu hồi / đơn đổi bước / mất kết nối
  useSocketEvent('dispatch:offer', () => {
    playChime(2);
    load();
  });
  useSocketEvent('dispatch:cancelled', e => {
    stopChime();
    if (e.reason === 'ORDER_CANCELLED') notify(`Đơn ${e.code ?? ''} đã bị hủy`);
    load();
  });
  useSocketEvent('delivery:changed', () => load());
  useSocketEvent('order:status_changed', () => load());
  useSocketEvent('reconnected', () => load());

  // GPS: theo dõi liên tục khi trực tuyến; gửi lên theo nhịp bận / rảnh
  useEffect(() => {
    if (!online || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      p => {
        position.current = { lat: p.coords.latitude, lng: p.coords.longitude };
        setGps({ at: position.current, error: '' });
      },
      err => setGps(g => ({ ...g, error: err.code === err.PERMISSION_DENIED ? 'Bạn chưa cho phép truy cập vị trí' : 'Không lấy được vị trí GPS' })),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [online]);

  const hasOrder = !!order;
  useEffect(() => {
    if (!online) return;
    const send = () => {
      if (position.current) shipperApi.location(position.current).catch(() => {});
    };
    send();
    const t = window.setInterval(send, hasOrder ? BUSY_INTERVAL : IDLE_INTERVAL);
    return () => window.clearInterval(t);
  }, [online, hasOrder]);

  // Giữ màn hình sáng khi đang trực tuyến (trình duyệt hỗ trợ)
  useEffect(() => {
    if (!online) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then(l => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [online]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) notify(ok);
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusy(false);
      load();
    }
  };

  const toggleOnline = async () => {
    // Bấm nút = cử chỉ người dùng -> mở khóa âm báo lời mời
    unlockChime().catch(() => {});
    if (online) {
      await run(() => shipperApi.offline(), 'Đã nghỉ — không nhận lời mời mới');
      return;
    }
    setBusy(true);
    let at: LatLng | undefined;
    try {
      at = await new Promise<LatLng>((resolve, reject) =>
        navigator.geolocation
          ? navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), reject, { enableHighAccuracy: true, timeout: 15000 })
          : reject(new Error('no geolocation'))
      );
      position.current = at;
    } catch {
      notify('Không lấy được vị trí — hãy bật GPS và cho phép truy cập vị trí để nhận đơn gần bạn.');
    }
    setBusy(false);
    await run(() => shipperApi.online(at), 'Đã trực tuyến — chờ lời mời nhận đơn');
  };

  // ---- Ảnh xác nhận giao / giao thất bại: mở camera sau ----
  const askPhoto = (action: PhotoAction) => {
    pendingAction.current = action;
    fileInput.current?.click();
  };
  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const action = pendingAction.current;
    if (!file || !action) return;
    const blob = await compressImage(file);
    setPhoto({ action, blob, url: URL.createObjectURL(blob) });
  };
  const sendPhoto = async () => {
    if (!photo || !order) return;
    const { action, blob, url } = photo;
    await run(
      () => (action.kind === 'delivered' ? shipperApi.delivered(order.id, blob) : shipperApi.failed(order.id, blob, action.reason)),
      action.kind === 'delivered' ? `Đã giao đơn ${order.code} · +${formatPrice(order.shipperFee)}` : 'Đã báo giao không thành công, MAK sẽ liên hệ'
    );
    URL.revokeObjectURL(url);
    setPhoto(null);
    setFailReason(null);
  };

  if (!profile || !approved) {
    return (
      <div className="empty-state">
        <h2>{profile?.status === 'SUBMITTED' ? 'Hồ sơ đang chờ duyệt' : profile?.status === 'BLOCKED' ? 'Tài khoản tài xế đang bị khóa' : 'Bạn chưa thể nhận đơn'}</h2>
        <p>{profile?.status === 'SUBMITTED' ? 'MAK sẽ báo cho bạn ngay khi hồ sơ được duyệt.' : 'Hoàn thiện hồ sơ và giấy tờ để MAK duyệt.'}</p>
        <Link to="/shipper/profile" className="btn-primary">Xem hồ sơ</Link>
      </div>
    );
  }

  const blockedUntil = state?.shipper.dispatchBlockedUntil && new Date(state.shipper.dispatchBlockedUntil) > new Date() ? state.shipper.dispatchBlockedUntil : null;

  return (
    <div className="shipper-work">
      <section className={`panel online-card ${online ? 'is-online' : ''}`}>
        <div>
          <b>{online ? 'Đang trực tuyến' : 'Đang nghỉ'}</b>
          <small>
            {online
              ? gps.error || (gps.at ? `GPS: ${gps.at.lat.toFixed(5)}, ${gps.at.lng.toFixed(5)}` : 'Đang lấy vị trí GPS...')
              : !(state?.shipper ?? profile).portrait
                ? 'Cần tải ảnh chân dung ở trang Hồ sơ trước khi bật trực tuyến'
                : blockedUntil
                ? `Tạm khóa nhận đơn tới ${new Date(blockedUntil).toLocaleString('vi-VN')} (${state?.shipper.dispatchBlockReason === 'WITHDRAWALS' ? 'trả 3 đơn liên tiếp' : 'vi phạm ca làm'}) — xem trang Ca làm`
                : 'Bật trực tuyến để nhận lời mời giao đơn gần bạn'}
          </small>
        </div>
        <button className={online ? 'btn-outline' : 'btn-primary'} onClick={toggleOnline} disabled={busy || (!online && (!!blockedUntil || !(state?.shipper ?? profile).portrait)) || (online && hasOrder)}>
          {online ? 'Nghỉ' : 'Trực tuyến'}
        </button>
      </section>

      {offer && <OfferCard offer={offer} now={now} busy={busy}
        onAccept={() => { stopChime(); run(() => shipperApi.accept(offer.offerId), `Đã nhận đơn ${offer.code}`); }}
        onDecline={() => { stopChime(); run(() => shipperApi.decline(offer.offerId)); }} />}

      {order && (
        <ActiveOrder
          order={order}
          me={gps.at}
          busy={busy}
          onArrived={() => run(() => shipperApi.arrived(order.id), 'Đã báo quán bạn tới')}
          onPickedUp={() => {
            if (order.status === 'PREPARING' && !window.confirm('Quán chưa bấm "Món đã xong". Bạn đã nhận đủ món chưa?')) return;
            run(() => shipperApi.pickedUp(order.id), 'Đã lấy hàng — bắt đầu giao');
          }}
          onDelivered={() => askPhoto({ kind: 'delivered' })}
          onFailed={() => setFailReason('')}
          onWithdraw={() => {
            const reason = window.prompt('Lý do trả đơn (đơn sẽ được giao cho tài xế khác). Hủy nhiều lần trong ngày sẽ bị tạm ngưng nhận đơn:');
            if (reason === null) return;
            run(async () => {
              const r = await shipperApi.withdraw(order.id, reason.trim() || undefined);
              if (r.blocked) notify('Bạn đã hủy quá số lần cho phép trong 24 giờ — tạm ngưng nhận đơn.');
            }, 'Đã trả đơn');
          }}
        />
      )}

      {failReason !== null && order && (
        <section className="panel">
          <h2>Giao không thành công</h2>
          <p className="muted small">Chờ khách ít nhất 10 phút và gọi điện trước. Chụp ảnh tại nơi giao làm bằng chứng.</p>
          <textarea value={failReason} onChange={e => setFailReason(e.target.value)} maxLength={300} rows={3} placeholder="vd: Gọi 3 lần không nghe máy, chờ 10 phút" />
          <div className="form-actions">
            <button className="btn-outline" onClick={() => setFailReason(null)}>Quay lại</button>
            <button className="btn-primary danger" disabled={!failReason.trim()} onClick={() => askPhoto({ kind: 'failed', reason: failReason.trim() })}>Chụp ảnh & báo</button>
          </div>
        </section>
      )}

      {photo && (
        <div className="photo-modal" role="dialog" aria-modal="true">
          <div className="panel photo-confirm">
            <h2>{photo.action.kind === 'delivered' ? 'Xác nhận đã giao' : 'Báo giao không thành công'}</h2>
            <img src={photo.url} alt="Ảnh vừa chụp" />
            <div className="form-actions">
              <button className="btn-outline" disabled={busy} onClick={() => { URL.revokeObjectURL(photo.url); setPhoto(null); askPhoto(photo.action); }}>Chụp lại</button>
              <button className="btn-primary" disabled={busy} onClick={sendPhoto}>{busy ? 'Đang gửi...' : 'Gửi ảnh'}</button>
            </div>
          </div>
        </div>
      )}

      {/* capture: mở thẳng camera sau trên điện thoại */}
      <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />

      {online && !offer && !order && (
        <div className="empty-state compact">
          <h2>Đang chờ đơn...</h2>
          <p>Giữ app mở và bật GPS. Lời mời sẽ hiện ở đây kèm âm báo, bạn có 30 giây để nhận.</p>
        </div>
      )}
    </div>
  );
}

function OfferCard({ offer, now, busy, onAccept, onDecline }: {
  offer: NonNullable<ShipperState['offer']>; now: number; busy: boolean; onAccept: () => void; onDecline: () => void;
}) {
  const left = Math.max(0, Math.ceil((new Date(offer.expiresAt).getTime() - now) / 1000));
  const points = useMemo<TrackPoint[]>(() => {
    const list: TrackPoint[] = [];
    const store = fromPoint(offer.restaurant.location);
    const drop = fromPoint(offer.dropoff.location);
    if (store) list.push({ ...store, kind: 'store', label: offer.restaurant.name });
    if (drop) list.push({ ...drop, kind: 'customer', label: 'Nơi giao' });
    return list;
  }, [offer]);

  return (
    <section className="panel offer-card" aria-live="assertive">
      <div className="offer-head">
        <b>Đơn mới {offer.code}</b>
        <span className={left <= 10 ? 'countdown urgent' : 'countdown'}>{left}s</span>
      </div>
      <div className="offer-fee">{formatPrice(offer.fee)}</div>
      <ul className="offer-route">
        <li><span className="map-pin pin-store">Q</span><div><b>{offer.restaurant.name}</b><small>{offer.restaurant.address} · cách bạn {formatKm(offer.toStoreKm)} (~{offer.toStoreMinutes} phút)</small></div></li>
        <li><span className="map-pin pin-customer">K</span><div><b>{offer.dropoff.addressLine}</b><small>{offer.tripKm != null ? `quán → khách ${formatKm(offer.tripKm)}` : ''} · {offer.itemsCount} món · khách đã thanh toán</small></div></li>
      </ul>
      {points.length > 0 && <TrackMap points={points} height={170} />}
      <div className="offer-actions">
        <button className="btn-outline" onClick={onDecline} disabled={busy || left === 0}>Bỏ qua</button>
        <button className="btn-primary" onClick={onAccept} disabled={busy || left === 0}>Nhận đơn</button>
      </div>
    </section>
  );
}

function ActiveOrder({ order, me, busy, onArrived, onPickedUp, onDelivered, onFailed, onWithdraw }: {
  order: ShipperOrder; me: LatLng | null; busy: boolean;
  onArrived: () => void; onPickedUp: () => void; onDelivered: () => void; onFailed: () => void; onWithdraw: () => void;
}) {
  const s = order.delivery.status;
  const toCustomer = s === 'PICKED_UP';
  const target = toCustomer ? order.dropoff.location : order.store.location;
  const points = useMemo<TrackPoint[]>(() => {
    const list: TrackPoint[] = [];
    if (order.store.location) list.push({ ...order.store.location, kind: 'store', label: order.store.name });
    if (order.dropoff.location) list.push({ ...order.dropoff.location, kind: 'customer', label: 'Nơi giao' });
    if (me) list.push({ ...me, kind: 'driver', label: 'Bạn' });
    return list;
  }, [order.store.location, order.dropoff.location, me]);
  const path = useMemo(() => (order.route?.polyline ? decodePolyline(order.route.polyline) : undefined), [order.route?.polyline]);

  return (
    <section className="panel active-order">
      <div className="offer-head">
        <b>Đơn {order.code}</b>
        <span className={`delivery-status d-${s}`}>{s ? DELIVERY_STATUS_LABEL[s] : ''}</span>
      </div>
      {order.delivery.eta && <small className="muted">{etaText(order.delivery.eta)}</small>}

      <TrackMap points={points} path={path} height={230} />

      <ol className="trip-steps">
        <li className={toCustomer ? 'done' : 'current'}>
          <b>Lấy tại {order.store.name}</b>
          <small>{order.store.address}</small>
          {!toCustomer && (
            <div className="step-links">
              {order.store.location && <a className="btn-soft" href={directionsUrl(order.store.location)} target="_blank" rel="noreferrer">🧭 Chỉ đường</a>}
              {order.store.phone && <a className="btn-outline" href={`tel:${order.store.phone}`}>Gọi quán</a>}
            </div>
          )}
          {s === 'ARRIVED_AT_STORE' && (
            <p className={order.status === 'READY' ? 'ok-note' : 'muted'}>{order.status === 'READY' ? 'Quán báo món đã xong — nhận món và bấm "Đã lấy hàng".' : 'Quán đang làm món, vui lòng chờ.'}</p>
          )}
        </li>
        <li className={toCustomer ? 'current' : ''}>
          <b>Giao cho {order.dropoff.receiverName}</b>
          <small>{order.dropoff.addressLine}{order.dropoff.note && <> · <i>“{order.dropoff.note}”</i></>}</small>
          {toCustomer && (
            <div className="step-links">
              {target && <a className="btn-soft" href={directionsUrl(target)} target="_blank" rel="noreferrer">🧭 Chỉ đường</a>}
              {order.dropoff.phone && <a className="btn-outline" href={`tel:${order.dropoff.phone}`}>Gọi khách</a>}
            </div>
          )}
        </li>
      </ol>

      <details className="trip-items">
        <summary>{order.items.reduce((n, i) => n + i.qty, 0)} món · {order.paymentMethod === 'BANK_TRANSFER' ? 'khách đã thanh toán — KHÔNG thu tiền' : `thu ${formatPrice(order.total)}`}</summary>
        <ul>
          {order.items.map((i, idx) => (
            <li key={idx}><b>{i.qty}×</b> {i.name}{[i.variant, ...i.options].filter(Boolean).length > 0 && <small> · {[i.variant, ...i.options].filter(Boolean).join(', ')}</small>}{i.note && <small className="item-note"> · {i.note}</small>}</li>
          ))}
        </ul>
      </details>

      <div className="offer-actions">
        {s === 'ASSIGNED' && <button className="btn-primary" disabled={busy} onClick={onArrived}>Đã tới quán</button>}
        {(s === 'ASSIGNED' || s === 'ARRIVED_AT_STORE') && (
          <>
            {s === 'ARRIVED_AT_STORE' && <button className="btn-primary" disabled={busy} onClick={onPickedUp}>Đã lấy hàng</button>}
            <button className="btn-outline danger-outline" disabled={busy} onClick={onWithdraw}>Trả đơn</button>
          </>
        )}
        {s === 'PICKED_UP' && (
          <>
            <button className="btn-outline danger-outline" disabled={busy} onClick={onFailed}>Không giao được</button>
            <button className="btn-primary" disabled={busy} onClick={onDelivered}>📷 Đã giao — chụp ảnh</button>
          </>
        )}
      </div>
      <small className="muted">Tiền công đơn này: <b>{formatPrice(order.shipperFee)}</b>{order.route ? ` · ${formatKm(order.route.distanceKm)}` : ''}</small>
    </section>
  );
}
