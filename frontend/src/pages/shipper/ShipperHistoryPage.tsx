import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../../api/client';
import { shipperApi } from '../../api/shipper';
import ProofPhoto from '../../components/ProofPhoto';
import type { ShipperOrder } from '../../types';
import { DELIVERY_STATUS_LABEL } from '../../utils/delivery';
import { formatDateTime, formatPrice } from '../../utils/format';
import { formatKm } from '../../utils/geo';

const PAGE_SIZE = 20;

/** Các đơn tài xế đã nhận: trạng thái, tiền công, ảnh xác nhận, khách đánh giá */
export default function ShipperHistoryPage() {
  const [items, setItems] = useState<ShipperOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await shipperApi.orders({ page: p, limit: PAGE_SIZE });
      setItems(list => (p === 1 ? res.items : [...list, ...res.items]));
      setTotal(res.total);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(page); }, [load, page]);

  if (error) return <div className="empty-state"><h2>Không tải được lịch sử</h2><p>{error}</p><button className="btn-soft" onClick={() => load(1)}>Thử lại</button></div>;
  if (loading && items.length === 0) return <div className="page-loading">Đang tải...</div>;
  if (items.length === 0) return <div className="empty-state"><h2>Chưa có chuyến nào</h2><p>Các đơn bạn đã nhận sẽ hiện ở đây.</p></div>;

  return (
    <div className="narrow-body">
      <h1 className="page-title">Lịch sử chuyến</h1>
      <ul className="trip-history">
        {items.map(o => (
          <li key={o.id} className="panel">
            <button type="button" className="trip-row" onClick={() => setOpen(v => (v === o.id ? null : o.id))} aria-expanded={open === o.id}>
              <div>
                <b>{o.code}</b>
                <small>{o.store.name} → {o.dropoff.addressLine}</small>
                <small>{formatDateTime(o.completedAt ?? o.createdAt)}{o.route ? ` · ${formatKm(o.route.distanceKm)}` : ''}</small>
              </div>
              <div className="trip-right">
                <span className={`delivery-status d-${o.delivery.status ?? 'NONE'}`}>
                  {o.status === 'CANCELLED' ? 'Đơn đã hủy' : o.delivery.status ? DELIVERY_STATUS_LABEL[o.delivery.status] : '—'}
                </span>
                {o.delivery.status === 'DELIVERED' && <b className="earn">+{formatPrice(o.shipperFee)}</b>}
                {o.delivery.rating && <small>{'★'.repeat(o.delivery.rating.stars)}</small>}
              </div>
            </button>
            {open === o.id && (
              <div className="trip-detail">
                {o.delivery.failReason && <p className="form-error">Lý do không giao được: {o.delivery.failReason}</p>}
                {o.delivery.rating?.comment && <p className="muted">Khách nhận xét: “{o.delivery.rating.comment}”</p>}
                {o.delivery.proof ? <ProofPhoto proof={o.delivery.proof} /> : <p className="muted small">Không có ảnh.</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {items.length < total && (
        <div className="load-more">
          <button className="btn-soft" onClick={() => setPage(p => p + 1)} disabled={loading}>{loading ? 'Đang tải...' : 'Xem thêm'}</button>
        </div>
      )}
    </div>
  );
}
