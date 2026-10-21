import { useCallback, useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../api/client';
import { trackingApi } from '../api/shipper';
import { useSocketEvent } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import type { Order, OrderTracking } from '../types';
import { DELIVERY_STATUS_LABEL, VEHICLE_LABEL, decodePolyline, etaText } from '../utils/delivery';
import { TrackMap } from './LazyMap';
import type { TrackPoint } from './LocationPicker';
import ProofPhoto from './ProofPhoto';
import { StarsInput } from './Stars';

const DRIVER_RATING_LABELS = ['', 'Rất tệ', 'Chưa tốt', 'Bình thường', 'Tốt', 'Tuyệt vời'];
// Tài xế đang giữ đơn -> có vị trí để theo dõi
const LIVE = ['ASSIGNED', 'ARRIVED_AT_STORE', 'PICKED_UP'];

/**
 * Khối "Tài xế MAK" trong một đơn (khách: Đơn của tôi · chủ quán: Đơn hàng):
 * bước giao, tài xế (tên, biển số, gọi), giờ đến dự kiến, bản đồ theo dõi realtime,
 * ảnh xác nhận giao và (khách) đánh giá tài xế. Đơn quán tự giao / tự lấy -> không hiện gì.
 */
export default function DeliveryTracker({ order, viewer, onChanged }: { order: Order; viewer: 'customer' | 'owner'; onChanged?: (o: Order) => void }) {
  const notify = useToast();
  const [showMap, setShowMap] = useState(false);
  const [tracking, setTracking] = useState<OrderTracking | null>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  const d = order.delivery;
  const platform = order.deliveryMode === 'PLATFORM' && order.fulfillmentType === 'DELIVERY';
  const status = d?.status ?? null;
  const live = !!status && LIVE.includes(status);

  const load = useCallback(async () => {
    try {
      setTracking(await (viewer === 'customer' ? trackingApi.customer(order.id) : trackingApi.merchant(order.id)));
    } catch (err) {
      notify(getErrorMessage(err));
    }
  }, [order.id, viewer, notify]);

  useEffect(() => {
    if (showMap) load();
  }, [showMap, load, status]);

  // Vị trí tài xế đẩy về mỗi ~5 giây khi đang giao
  useSocketEvent('shipper:location', e => {
    if (e.orderId !== order.id) return;
    setTracking(t => (t ? { ...t, location: { lat: e.lat, lng: e.lng, at: e.at }, eta: e.eta ?? t.eta } : t));
  });

  const points = useMemo<TrackPoint[]>(() => {
    if (!tracking) return [];
    const list: TrackPoint[] = [];
    if (tracking.store?.location) list.push({ ...tracking.store.location, kind: 'store', label: tracking.store.name });
    if (tracking.dropoff?.location) list.push({ ...tracking.dropoff.location, kind: 'customer', label: 'Nơi giao' });
    if (tracking.location) list.push({ lat: tracking.location.lat, lng: tracking.location.lng, kind: 'driver', label: tracking.shipper?.fullName });
    return list;
  }, [tracking]);
  const path = useMemo(() => (tracking?.polyline ? decodePolyline(tracking.polyline) : undefined), [tracking?.polyline]);

  if (!platform || !d) return null;

  const driver = d.shipperSnapshot;
  const eta = tracking?.eta ?? d.eta;

  const rate = async () => {
    setSending(true);
    try {
      const updated = await trackingApi.rate(order.id, stars, comment.trim() || undefined);
      notify('Cảm ơn bạn đã đánh giá tài xế!');
      onChanged?.(updated);
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="delivery-box">
      <div className="delivery-head">
        <span className="tag">Tài xế MAK</span>
        <b className={`delivery-status d-${status ?? 'NONE'}`}>
          {status ? DELIVERY_STATUS_LABEL[status] : order.status === 'PLACED' ? 'Tìm tài xế sau khi quán nhận đơn' : 'Chờ tài xế'}
        </b>
        {live && eta && <small className="muted">· {etaText(eta)}</small>}
      </div>

      {driver?.fullName && (
        <div className="driver-card">
          <span className="driver-avatar" aria-hidden>🛵</span>
          <div>
            <b>{driver.fullName}</b>
            <small>
              {[driver.vehicleType && VEHICLE_LABEL[driver.vehicleType], driver.licensePlate].filter(Boolean).join(' · ')}
              {tracking?.shipper?.ratingCount ? ` · ${tracking.shipper.ratingAvg?.toFixed(1)} ★` : ''}
            </small>
          </div>
          {live && driver.phone && <a className="btn-soft" href={`tel:${driver.phone}`}>Gọi tài xế</a>}
        </div>
      )}

      {status === 'NO_SHIPPER' && viewer === 'customer' && (
        <p className="muted">Quán đang sắp xếp người giao cho bạn.</p>
      )}
      {status === 'FAILED' && (
        <p className="form-error">{d.failReason ? `Tài xế báo: ${d.failReason}. ` : ''}MAK sẽ liên hệ để xử lý đơn này.</p>
      )}

      {live && (
        <button type="button" className="link-btn" onClick={() => setShowMap(v => !v)}>
          {showMap ? 'Ẩn bản đồ' : '🗺 Theo dõi tài xế trên bản đồ'}
        </button>
      )}
      {live && showMap && (
        points.length > 0
          ? <TrackMap points={points} path={path} height={240} />
          : <div className="location-map map-loading" style={{ height: 240 }}>Đang tải vị trí...</div>
      )}

      {d.proof && <ProofPhoto proof={d.proof} />}

      {viewer === 'customer' && order.status === 'COMPLETED' && driver?.fullName && (
        d.rating ? (
          <p className="muted">Bạn đã đánh giá tài xế {'★'.repeat(d.rating.stars)}{d.rating.comment && ` — “${d.rating.comment}”`}</p>
        ) : (
          <div className="rate-driver">
            <small>Đánh giá tài xế {driver.fullName}</small>
            <StarsInput value={stars} onChange={setStars} disabled={sending} labels={DRIVER_RATING_LABELS} />
            {stars > 0 && (
              <div className="rate-driver-row">
                <input value={comment} onChange={e => setComment(e.target.value)} maxLength={300} placeholder="Nhận xét (không bắt buộc)" />
                <button type="button" className="btn-primary" onClick={rate} disabled={sending}>{sending ? 'Đang gửi...' : 'Gửi'}</button>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
