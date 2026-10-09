import { useEffect, useRef, useState } from 'react';
import type { GroupBy, RevenuePoint } from '../types';
import { formatPrice } from '../utils/format';

// Biểu đồ cột doanh thu (1 chuỗi -> không cần chú thích, tiêu đề đã nói rõ).
// Cột ≤ 24px, đầu bo 4px, lưới mảnh; rê chuột hiện tooltip; giá trị lớn nhất có nhãn; kèm bảng số liệu.

const H = 240;
const PAD = { top: 28, right: 12, bottom: 30, left: 56 };

/** Bước chia trục "đẹp": 1, 2, 2.5, 5 × 10^n */
const niceStep = (max: number, ticks = 4) => {
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 2.5, 5, 10].find(m => m * pow >= raw) ?? 10;
  return unit * pow;
};

/** 1.250.000 -> "1,25tr"; 85.000 -> "85k" */
export const compactVnd = (n: number) => {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}tr`;
  if (n >= 1e3) return `${(n / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k`;
  return String(n);
};

/** Nhãn kỳ: ngày "9/10", tuần "Tuần 6/10", tháng "T10/2026" */
export const periodLabel = (iso: string, groupBy: GroupBy, long = false) => {
  const [y, m, d] = iso.split('-').map(Number);
  if (groupBy === 'month') return `${long ? 'Tháng ' : 'T'}${m}/${y}`;
  if (groupBy === 'week') return `${long ? 'Tuần từ ' : ''}${d}/${m}`;
  return long ? `${d}/${m}/${y}` : `${d}/${m}`;
};

/** Cột đầu bo 4px phía trên, vuông ở đáy */
const barPath = (x: number, y: number, w: number, h: number) => {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

interface Props {
  series: RevenuePoint[];
  groupBy: GroupBy;
  /** Giá trị vẽ: tổng tiền (mặc định) hoặc thực nhận */
  metric?: 'grossRevenue' | 'netRevenue';
}

export default function RevenueChart({ series, groupBy, metric = 'grossRevenue' }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = series.map(p => p[metric]);
  const max = Math.max(0, ...values);
  const step = niceStep(max || 100000);
  const top = Math.ceil((max || 1) / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / Math.max(1, series.length);
  const barW = Math.max(2, Math.min(24, band - 2));
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const xCenter = (i: number) => PAD.left + band * i + band / 2;
  // Nhãn trục X thưa ra để không chồng nhau (~ 1 nhãn / 56px)
  const every = Math.max(1, Math.ceil(series.length / Math.max(1, Math.floor(innerW / 56))));
  const peak = max > 0 ? values.indexOf(max) : -1;
  const hovered = hover !== null ? series[hover] : null;

  return (
    <div className="revenue-chart">
      <div className="chart-box" ref={box}>
        <svg width={width} height={H} role="img" aria-label={`Biểu đồ doanh thu, ${series.length} kỳ, cao nhất ${formatPrice(max)}`} onMouseLeave={() => setHover(null)}>
          {/* Lưới + trục Y */}
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'chart-axis' : 'chart-grid'} />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">{compactVnd(t)}</text>
            </g>
          ))}

          {series.map((p, i) => {
            const v = p[metric];
            const h = Math.max(0, y(0) - y(v));
            return (
              <g key={p.period}>
                {v > 0 && <path d={barPath(xCenter(i) - barW / 2, y(v), barW, h)} className={hover === i ? 'chart-bar active' : 'chart-bar'} />}
                {i % every === 0 && (
                  <text x={xCenter(i)} y={H - 10} textAnchor="middle" className="chart-tick">{periodLabel(p.period, groupBy)}</text>
                )}
                {/* Vùng rê chuột rộng hơn cột */}
                <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}

          {/* Chỉ ghi số ở cột cao nhất */}
          {peak >= 0 && hover === null && (
            <text x={xCenter(peak)} y={y(max) - 8} textAnchor="middle" className="chart-label">{compactVnd(max)}</text>
          )}
          {hover !== null && <line x1={xCenter(hover)} x2={xCenter(hover)} y1={PAD.top} y2={y(0)} className="chart-cross" />}
        </svg>

        {max === 0 && <div className="chart-empty">Chưa có doanh thu trong khoảng này</div>}

        {hovered && hover !== null && (
          <div className="chart-tip" style={{ left: Math.min(Math.max(xCenter(hover), 90), width - 90), top: PAD.top - 6 }}>
            <b>{periodLabel(hovered.period, groupBy, true)}</b>
            <span>Doanh thu: <b>{formatPrice(hovered.grossRevenue)}</b></span>
            <span>Thực nhận: {formatPrice(hovered.netRevenue)}</span>
            <span>Đơn hoàn thành: {hovered.completedOrders} / {hovered.orders}</span>
          </div>
        )}
      </div>

      <details className="chart-table">
        <summary>Xem dạng bảng</summary>
        <table className="data-table">
          <thead>
            <tr><th>Kỳ</th><th>Đơn</th><th>Hoàn thành</th><th>Doanh thu</th><th>Hoa hồng</th><th>Thực nhận</th></tr>
          </thead>
          <tbody>
            {series.map(p => (
              <tr key={p.period}>
                <td>{periodLabel(p.period, groupBy, true)}</td>
                <td>{p.orders}</td>
                <td>{p.completedOrders}</td>
                <td>{formatPrice(p.grossRevenue)}</td>
                <td>{formatPrice(p.commission)}</td>
                <td>{formatPrice(p.netRevenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
