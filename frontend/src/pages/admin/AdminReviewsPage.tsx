import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { reviewsApi } from '../../api/reviews';
import { StarsView } from '../../components/Stars';
import { useToast } from '../../context/ToastContext';
import type { AdminReview } from '../../types';
import { formatDateTime } from '../../utils/format';

type Filter = 'all' | 'visible' | 'hidden';
const PAGE_SIZE = 20;

/** Admin ẩn / hiện đánh giá vi phạm (API-8). Đánh giá bị ẩn không hiện công khai và không tính điểm. */
export default function AdminReviewsPage() {
  const notify = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminReview[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [hiding, setHiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await reviewsApi.listAdmin({
        hidden: filter === 'all' ? undefined : filter === 'hidden',
        q: q || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [filter, q, page]);
  useEffect(() => { load(); }, [load]);

  const setHidden = async (r: AdminReview, hidden: boolean) => {
    if (hidden && !reason.trim()) return notify('Nhập lý do ẩn');
    setBusy(true);
    try {
      await reviewsApi.setHidden(r.id, hidden, hidden ? reason.trim() : undefined);
      notify(hidden ? 'Đã ẩn đánh giá' : 'Đã hiện lại đánh giá');
      setHiding(null);
      setReason('');
      load();
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <h1 className="page-title">Đánh giá</h1>

      <section className="toolbar admin-toolbar">
        <div className="cat-tabs" role="tablist">
          {([['all', 'Tất cả'], ['visible', 'Đang hiện'], ['hidden', 'Đã ẩn']] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'active' : ''} onClick={() => { setFilter(k); setPage(1); }}>
              {label}
            </button>
          ))}
        </div>
        <form className="admin-search" onSubmit={e => { e.preventDefault(); setQ(search.trim()); setPage(1); }}>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tên quán..." />
          <button className="btn-soft" type="submit">Tìm</button>
        </form>
      </section>

      {error ? (
        <div className="empty-state"><h2>Không tải được</h2><p>{error}</p></div>
      ) : items.length === 0 ? (
        <div className="empty-state"><h2>Không có đánh giá nào</h2></div>
      ) : (
        <ul className="review-list owner">
          {items.map(r => (
            <li key={r.id} className={r.isHidden ? 'panel review-hidden' : 'panel'}>
              <div className="review-head">
                <span className="avatar">{(r.customer?.fullName ?? r.author).charAt(0)}</span>
                <div>
                  <b>{r.customer?.fullName ?? r.author}</b>
                  <small>
                    {r.customer?.email && <>{r.customer.email} · </>}
                    {r.restaurant ? <Link to={`/restaurants/${r.restaurant.slug}#reviews`} className="link-btn">{r.restaurant.name}</Link> : '—'}
                    {' · '}{formatDateTime(r.updatedAt)}
                  </small>
                </div>
                <StarsView value={r.rating} />
              </div>
              {r.comment ? <p className="review-comment">{r.comment}</p> : <p className="muted">Không kèm nhận xét</p>}
              {r.reply && <div className="review-reply"><small>Quán trả lời</small><p>{r.reply.content}</p></div>}

              {r.isHidden ? (
                <div className="kitchen-actions">
                  <span className="form-error grow">Đã ẩn{r.hiddenReason ? `: ${r.hiddenReason}` : ''}</span>
                  <button className="btn-outline" disabled={busy} onClick={() => setHidden(r, false)}>Hiện lại</button>
                </div>
              ) : hiding === r.id ? (
                <div className="reason-form">
                  <label>
                    <span>Lý do ẩn *</span>
                    <input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="vd: Ngôn từ xúc phạm, quảng cáo" autoFocus />
                  </label>
                  <div className="form-actions">
                    <button className="btn-outline" onClick={() => { setHiding(null); setReason(''); }}>Hủy</button>
                    <button className="btn-primary danger" disabled={busy} onClick={() => setHidden(r, true)}>Ẩn đánh giá</button>
                  </div>
                </div>
              ) : (
                <div className="kitchen-actions">
                  <button className="btn-outline danger-outline" onClick={() => { setHiding(r.id); setReason(''); }}>Ẩn đánh giá vi phạm</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="pager">
          <button className="btn-outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Trước</button>
          <span>Trang {page}/{pages}</span>
          <button className="btn-outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Sau →</button>
        </div>
      )}
    </>
  );
}
