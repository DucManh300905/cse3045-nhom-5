import { useState } from 'react';

const LABELS = ['', 'Rất tệ', 'Tệ', 'Bình thường', 'Ngon', 'Tuyệt vời'];

/** Hiển thị điểm 0–5 bằng sao (tô theo phần trăm, vd 4.6 → 92%) */
export function StarsView({ value, size = 14 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="stars-view" style={{ fontSize: size }} aria-label={`${value.toFixed(1)} trên 5 sao`} role="img">
      <span className="stars-bg" aria-hidden>★★★★★</span>
      <span className="stars-fg" aria-hidden style={{ width: `${pct}%` }}>★★★★★</span>
    </span>
  );
}

/** "4.6 ★ (23)" hoặc "Quán mới" khi chưa có đánh giá */
export function RatingBadge({ avg, count }: { avg: number; count: number }) {
  if (!count) return <span className="rating-badge new">Quán mới</span>;
  return (
    <span className="rating-badge" title={`${avg.toFixed(1)}/5 từ ${count} đánh giá`}>
      <b>{avg.toFixed(1)}</b> ★ <small>({count})</small>
    </span>
  );
}

/** Chọn 1–5 sao (bấm hoặc dùng phím mũi tên) */
export function StarsInput({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="stars-input" role="radiogroup" aria-label="Số sao" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} sao — ${LABELS[n]}`}
          className={n <= shown ? 'on' : ''}
          disabled={disabled}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
      <span className="stars-label">{shown ? LABELS[shown] : 'Chọn số sao'}</span>
    </div>
  );
}
