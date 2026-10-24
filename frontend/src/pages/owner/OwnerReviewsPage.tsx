import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { reviewsApi } from '../../api/reviews';
import { RatingBadge, StarsView } from '../../components/Stars';
import { useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import type { Review, ReviewSummary } from '../../types';
import { formatDateTime } from '../../utils/format';
import { useOwner } from './OwnerLayout';

const PAGE_SIZE = 20;

/** Chủ quán xem và trả lời đánh giá (API-8, BR-61) */
export default function OwnerReviewsPage() {
  const { restaurant } = useOwner();
  const notify = useToast();
  const [items, setItems] = useState<Review[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [onlyUnreplied, setOnlyUnreplied] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** Đánh giá đang mở ô trả lời */
  const [replying, setReplying] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await reviewsApi.listMerchant({ replied: onlyUnreplied ? false : undefined, limit });
      setItems(res.items);
      setSummary(res.summary);
      setTotal(res.total);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [onlyUnreplied, limit]);

  useEffect(() => {
    if (restaurant) load();
  }, [restaurant, load]);

  // Có đánh giá mới -> tải lại
  useSocketEvent('notification:new', n => { if (n.type === 'REVIEW_NEW') load(); });

  if (!restaurant) {
    return (
      <div className="empty-state">
        <h2>Bạn chưa có quán</h2>
        <Link to="/owner" className="btn-primary">Tạo quán</Link>
      </div>
    );
  }

  const openReply = (r: Review) => {
    setReplying(r.id);
    setDraft(r.reply?.content ?? '');
  };

  const save = async (r: Review) => {
    if (!draft.trim()) return notify('Nhập nội dung trả lời');
    setSaving(true);
    try {
      await reviewsApi.reply(r.id, draft.trim());
      notify('Đã gửi trả lời');
      setReplying(null);
      load();
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const count = summary?.ratingCount ?? 0;

  return (
    <>
      <div className="owner-title-row">
        <h1 className="page-title">Đánh giá</h1>
        {restaurant.status === 'APPROVED' && <Link to={`/restaurants/${restaurant.slug}#reviews`} className="btn-outline">Xem như khách</Link>}
      </div>

      <section className="panel owner-review-summary">
        <div>
          <small>Điểm trung bình</small>
          <RatingBadge avg={summary?.ratingAvg ?? 0} count={count} />
        </div>
        <div className="review-dist-inline">
          {[5, 4, 3, 2, 1].map(n => (
            <span key={n}>{n}★ <b>{summary?.distribution[String(n) as '1'] ?? 0}</b></span>
          ))}
        </div>
        <label className="switch">
          <input type="checkbox" checked={onlyUnreplied} onChange={e => { setOnlyUnreplied(e.target.checked); setLimit(PAGE_SIZE); }} />
          <span className="switch-track" aria-hidden />
          <span>Chỉ đánh giá chưa trả lời</span>
        </label>
      </section>

      {error ? (
        <div className="empty-state"><h2>Không tải được đánh giá</h2><p>{error}</p><button className="btn-soft" onClick={load}>Thử lại</button></div>
      ) : loading ? (
        <div className="page-loading">Đang tải...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <h2>{onlyUnreplied ? 'Đã trả lời hết đánh giá' : 'Chưa có đánh giá nào'}</h2>
          <p>Khách đánh giá được sau khi nhận đơn hoàn thành.</p>
        </div>
      ) : (
        <ul className="review-list owner">
          {items.map(r => (
            <li key={r.id} className="panel">
              <div className="review-head">
                <span className="avatar">{r.author.charAt(0)}</span>
                <div>
                  <b>{r.author}</b>
                  <small>{formatDateTime(r.updatedAt)}</small>
                </div>
                <StarsView value={r.rating} />
              </div>
              {r.isHidden && <p className="form-error">Quản trị viên đã ẩn đánh giá này{r.hiddenReason ? `: ${r.hiddenReason}` : ''}. Khách khác không thấy và không tính vào điểm.</p>}
              {r.comment ? <p className="review-comment">{r.comment}</p> : <p className="muted">Không kèm nhận xét</p>}

              {replying === r.id ? (
                <div className="reason-form">
                  <textarea rows={3} maxLength={1000} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Cảm ơn bạn đã ủng hộ quán..." autoFocus />
                  <div className="form-actions">
                    <button className="btn-outline" onClick={() => setReplying(null)}>Hủy</button>
                    <button className="btn-primary" onClick={() => save(r)} disabled={saving}>{saving ? 'Đang gửi...' : 'Gửi trả lời'}</button>
                  </div>
                </div>
              ) : r.reply ? (
                <div className="review-reply">
                  <small>Quán đã trả lời · {formatDateTime(r.reply.repliedAt)}</small>
                  <p>{r.reply.content}</p>
                  <button className="link-btn" onClick={() => openReply(r)}>Sửa trả lời</button>
                </div>
              ) : (
                <button className="btn-soft" onClick={() => openReply(r)}>Trả lời</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {items.length < total && (
        <div className="load-more"><button className="btn-soft" onClick={() => setLimit(l => Math.min(100, l + PAGE_SIZE))}>Xem thêm</button></div>
      )}
    </>
  );
}
