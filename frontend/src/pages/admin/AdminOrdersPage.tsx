import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { reportsApi } from '../../api/reports';
import type { AdminOrder, OrderStatus, Paginated } from '../../types';
import { formatDateTime, formatPrice } from '../../utils/format';

const STATUS_TEXT: Record<OrderStatus, string> = {
  PLACED: 'Chờ nhận',
  ACCEPTED: 'Đã nhận',
  PREPARING: 'Đang làm',
  READY: 'Xong món',
  DELIVERING: 'Đang giao',
  COMPLETED: 'Hoàn thành',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
};

const FILTERS: { key: string; label: string; statuses?: OrderStatus[] }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'active', label: 'Đang xử lý', statuses: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERING'] },
  { key: 'done', label: 'Hoàn thành', statuses: ['COMPLETED'] },
  { key: 'cancelled', label: 'Hủy / từ chối', statuses: ['CANCELLED', 'REJECTED'] },
];
const PAGE_SIZE = 20;

const chipClass = (s: OrderStatus) =>
  `status-chip s-${s === 'COMPLETED' ? 'APPROVED' : s === 'CANCELLED' || s === 'REJECTED' ? 'REJECTED' : 'SUBMITTED'}`;

/** Admin xem mọi đơn (API-9) — chỉ đọc */
export default function AdminOrdersPage() {
  const [filter, setFilter] = useState(FILTERS[0]);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<AdminOrder> | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    reportsApi.listOrders({ status: filter.statuses, q: q || undefined, page, limit: PAGE_SIZE })
      .then(d => { if (!ignore) { setData(d); setError(''); } })
      .catch(err => { if (!ignore) setError(getErrorMessage(err)); });
    return () => { ignore = true; };
  }, [filter, q, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <h1 className="page-title">Đơn hàng</h1>

      <section className="toolbar admin-toolbar">
        <div className="cat-tabs" role="tablist">
          {FILTERS.map(f => (
            <button key={f.key} role="tab" aria-selected={filter.key === f.key} className={filter.key === f.key ? 'active' : ''} onClick={() => { setFilter(f); setPage(1); }}>
              {f.label}
            </button>
          ))}
        </div>
        <form className="admin-search" onSubmit={e => { e.preventDefault(); setQ(search.trim()); setPage(1); }}>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Mã đơn, vd MAK261009" />
          <button className="btn-soft" type="submit">Tìm</button>
        </form>
      </section>

      {error ? (
        <div className="empty-state"><h2>Không tải được</h2><p>{error}</p></div>
      ) : !data ? (
        <div className="page-loading">Đang tải...</div>
      ) : data.items.length === 0 ? (
        <div className="empty-state"><h2>Không có đơn nào</h2></div>
      ) : (
        <>
          <p className="result-line"><span><b>{data.total}</b> đơn</span></p>
          <div className="panel table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Mã đơn</th><th>Thời gian</th><th>Quán</th><th>Khách</th><th>Tổng tiền</th><th>Trạng thái</th></tr>
              </thead>
              <tbody>
                {data.items.map(o => (
                  <Fragment key={o.id}>
                    <tr className="clickable" onClick={() => setOpen(open === o.id ? null : o.id)}>
                      <td className="nowrap"><b>{o.code}</b></td>
                      <td className="nowrap">{formatDateTime(o.placedAt)}</td>
                      <td><Link to={`/admin/restaurants/${o.restaurant}`} className="link-btn" onClick={e => e.stopPropagation()}>{o.restaurantSnapshot.name}</Link></td>
                      <td>{o.customer?.fullName ?? '—'}<br /><small className="muted">{o.customer?.phone ?? o.customer?.email}</small></td>
                      <td className="nowrap">{formatPrice(o.total)}</td>
                      <td><span className={chipClass(o.status)}>{STATUS_TEXT[o.status]}</span></td>
                    </tr>
                    {open === o.id && (
                      <tr className="order-detail-row">
                        <td colSpan={6}>
                          <div className="order-detail">
                            <ul>
                              {o.items.map(i => (
                                <li key={i.id}>
                                  <b>{i.qty}×</b> {i.name}
                                  {(i.variant || i.options.length > 0) && <small className="muted"> · {[i.variant && `Size ${i.variant.name}`, ...i.options.map(op => op.name)].filter(Boolean).join(', ')}</small>}
                                  <span>{formatPrice(i.lineTotal)}</span>
                                </li>
                              ))}
                            </ul>
                            <p className="muted small">
                              {o.fulfillmentType === 'PICKUP' ? 'Tự đến lấy' : `Giao đến: ${o.delivery?.receiverName} · ${o.delivery?.phone} · ${o.delivery?.addressLine}`}
                              {' · '}Hoa hồng {formatPrice(o.commissionAmount)} · {o.paymentStatus === 'PAID' ? 'Đã thu tiền' : 'Chưa thu tiền'}
                              {o.cancelReason?.code && ` · Lý do hủy: ${o.cancelReason.code}${o.cancelReason.note ? ` (${o.cancelReason.note})` : ''}`}
                            </p>
                            <ol className="status-timeline">
                              {o.statusHistory.map((h, idx) => (
                                <li key={idx}>{formatDateTime(h.at)} — {STATUS_TEXT[h.to]} <small className="muted">({h.actorType})</small></li>
                              ))}
                            </ol>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="pager">
              <button className="btn-outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Trước</button>
              <span>Trang {page}/{pages}</span>
              <button className="btn-outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Sau →</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
