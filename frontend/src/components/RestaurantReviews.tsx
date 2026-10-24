import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../api/client';
import { reviewsApi } from '../api/reviews';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { Restaurant, Review, ReviewSummary } from '../types';
import { formatDateTime } from '../utils/format';
import { StarsInput, StarsView } from './Stars';

const PAGE_SIZE = 10;

/** Phần "Đánh giá" trên trang quán (API-8): ai cũng xem; khách có đơn hoàn thành thì viết / sửa được */
export default function RestaurantReviews({ restaurant, onRatingChange }: { restaurant: Restaurant; onRatingChange?: () => void }) {
  const { user } = useAuth();
  const notify = useToast();
  const [items, setItems] = useState<Review[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [star, setStar] = useState<number | undefined>(undefined);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);

  // Đánh giá của tôi
  const isCustomer = user?.role === 'CUSTOMER';
  const [mine, setMine] = useState<{ canReview: boolean; review: Review | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ rating: 0, comment: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reviewsApi.list(restaurant.slug, { rating: star, limit });
      setItems(res.items);
      setSummary(res.summary);
      setTotal(res.total);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [restaurant.slug, star, limit]);
  useEffect(() => { load(); }, [load]);

  const loadMine = useCallback(async () => {
    if (!isCustomer) { setMine(null); return; }
    try {
      const res = await reviewsApi.getMine(restaurant.slug);
      setMine(res);
      setForm({ rating: res.review?.rating ?? 0, comment: res.review?.comment ?? '' });
    } catch {
      setMine(null);
    }
  }, [isCustomer, restaurant.slug]);
  useEffect(() => { loadMine(); }, [loadMine]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.rating) return setError('Hãy chọn số sao.');
    setError('');
    setSaving(true);
    try {
      await reviewsApi.saveMine(restaurant.slug, { rating: form.rating, comment: form.comment.trim() || undefined });
      notify(mine?.review ? 'Đã cập nhật đánh giá' : 'Cảm ơn bạn đã đánh giá!');
      setEditing(false);
      await Promise.all([loadMine(), load()]);
      onRatingChange?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Xóa đánh giá của bạn cho quán này?')) return;
    try {
      await reviewsApi.deleteMine(restaurant.slug);
      notify('Đã xóa đánh giá');
      setEditing(false);
      await Promise.all([loadMine(), load()]);
      onRatingChange?.();
    } catch (err) {
      notify(getErrorMessage(err));
    }
  };

  const count = summary?.ratingCount ?? 0;
  const maxBar = Math.max(1, ...Object.values(summary?.distribution ?? { 1: 0 }));

  return (
    <section id="reviews" className="panel reviews-panel">
      <h2>Đánh giá</h2>

      <div className="review-summary">
        <div className="review-score">
          {count ? (
            <>
              <strong>{summary!.ratingAvg.toFixed(1)}</strong>
              <StarsView value={summary!.ratingAvg} size={18} />
              <small>{count} đánh giá</small>
            </>
          ) : (
            <>
              <strong>—</strong>
              <small>Chưa có đánh giá nào</small>
            </>
          )}
        </div>
        <ul className="review-bars" aria-label="Phân bố số sao">
          {[5, 4, 3, 2, 1].map(n => {
            const c = summary?.distribution[String(n) as '1'] ?? 0;
            return (
              <li key={n}>
                <button className={star === n ? 'active' : ''} onClick={() => { setStar(star === n ? undefined : n); setLimit(PAGE_SIZE); }} disabled={!c && star !== n}>
                  <span>{n}★</span>
                  <span className="bar"><i style={{ width: `${(c / maxBar) * 100}%` }} /></span>
                  <span className="bar-count">{c}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Đánh giá của tôi */}
      {!user ? (
        <p className="review-hint"><Link to="/login" className="link-btn">Đăng nhập</Link> để đánh giá quán sau khi nhận món.</p>
      ) : !isCustomer ? null : !mine ? null : !mine.canReview && !mine.review ? (
        <p className="review-hint">Bạn có thể đánh giá sau khi nhận ít nhất 1 đơn từ quán này.</p>
      ) : mine.review && !editing ? (
        <div className="my-review">
          <div>
            <small>Đánh giá của bạn</small>
            <StarsView value={mine.review.rating} />
            {mine.review.comment && <p>{mine.review.comment}</p>}
            {mine.review.isHidden && <small className="warn">Đánh giá này đang bị quản trị viên ẩn.</small>}
          </div>
          <div className="form-actions">
            <button className="link-btn danger" onClick={remove}>Xóa</button>
            <button className="btn-soft" onClick={() => setEditing(true)}>Sửa đánh giá</button>
          </div>
        </div>
      ) : (
        <form className="review-form" onSubmit={submit} noValidate>
          <b>{mine.review ? 'Sửa đánh giá của bạn' : `Bạn thấy ${restaurant.name} thế nào?`}</b>
          <StarsInput value={form.rating} onChange={rating => setForm(f => ({ ...f, rating }))} disabled={saving} />
          <textarea
            rows={3}
            maxLength={1000}
            value={form.comment}
            onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
            placeholder="Chia sẻ về món ăn, thời gian giao, thái độ phục vụ... (không bắt buộc)"
          />
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="form-actions">
            {mine.review && <button type="button" className="btn-outline" onClick={() => { setEditing(false); setError(''); }}>Hủy</button>}
            <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Đang gửi...' : mine.review ? 'Lưu' : 'Gửi đánh giá'}</button>
          </div>
        </form>
      )}

      {/* Danh sách */}
      {items.length === 0 ? (
        <p className="muted">{loading ? 'Đang tải...' : star ? `Chưa có đánh giá ${star}★.` : 'Hãy là người đầu tiên đánh giá quán này.'}</p>
      ) : (
        <ul className="review-list">
          {items.map(r => (
            <li key={r.id}>
              <div className="review-head">
                <span className="avatar">{r.author.charAt(0)}</span>
                <div>
                  <b>{r.author}</b>
                  <small>{formatDateTime(r.updatedAt)}</small>
                </div>
                <StarsView value={r.rating} />
              </div>
              {r.comment && <p className="review-comment">{r.comment}</p>}
              {r.reply && (
                <div className="review-reply">
                  <small>Phản hồi của quán</small>
                  <p>{r.reply.content}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {items.length < total && (
        <button className="btn-soft review-more" onClick={() => setLimit(l => Math.min(100, l + PAGE_SIZE))} disabled={loading}>
          {loading ? 'Đang tải...' : 'Xem thêm đánh giá'}
        </button>
      )}
    </section>
  );
}
