import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { reportsApi } from '../../api/reports';
import RangePicker, { presetRange, type DateRange } from '../../components/RangePicker';
import RevenueChart from '../../components/RevenueChart';
import { RatingBadge } from '../../components/Stars';
import type { GroupBy, MerchantSummary, RevenuePoint, TopItem } from '../../types';
import { formatPrice } from '../../utils/format';
import { useOwner } from './OwnerLayout';

const pct = (x: number) => `${(x * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;

/** Dashboard chủ quán (API-9): doanh thu chỉ tính đơn hoàn thành, theo ngày đặt (giờ VN) */
export default function OwnerDashboardPage() {
  const { restaurant } = useOwner();
  const [range, setRange] = useState<DateRange>(() => presetRange('30d'));
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [summary, setSummary] = useState<MerchantSummary | null>(null);
  const [series, setSeries] = useState<RevenuePoint[]>([]);
  const [top, setTop] = useState<TopItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) return;
    let ignore = false;
    setLoading(true);
    Promise.all([reportsApi.merchantSummary(range), reportsApi.merchantRevenue(range, groupBy), reportsApi.merchantTopItems(range, 10)])
      .then(([s, r, t]) => {
        if (ignore) return;
        setSummary(s);
        setSeries(r.series);
        setTop(t);
        setError('');
      })
      .catch(err => { if (!ignore) setError(getErrorMessage(err)); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [restaurant, range, groupBy]);

  if (!restaurant) {
    return (
      <div className="empty-state">
        <h2>Bạn chưa có quán</h2>
        <Link to="/owner" className="btn-primary">Tạo quán</Link>
      </div>
    );
  }

  const maxQty = Math.max(1, ...top.map(t => t.qty));

  return (
    <>
      <div className="owner-title-row">
        <h1 className="page-title">Thống kê</h1>
        <label className="sort">
          <span className="sr-only">Gộp theo</span>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}>
            <option value="day">Theo ngày</option>
            <option value="week">Theo tuần</option>
            <option value="month">Theo tháng</option>
          </select>
        </label>
      </div>
      <RangePicker value={range} onChange={setRange} />

      {error ? (
        <div className="empty-state"><h2>Không tải được số liệu</h2><p>{error}</p></div>
      ) : !summary ? (
        <div className="page-loading">Đang tải...</div>
      ) : (
        <div className={loading ? 'dashboard loading' : 'dashboard'}>
          <div className="stat-grid">
            <div className="stat-tile accent">
              <small>Doanh thu</small>
              <strong>{formatPrice(summary.grossRevenue)}</strong>
              <span>{summary.completedOrders} đơn hoàn thành</span>
            </div>
            <div className="stat-tile">
              <small>Thực nhận</small>
              <strong>{formatPrice(summary.netRevenue)}</strong>
              <span>Sau hoa hồng {pct(summary.commissionRate)} ({formatPrice(summary.commission)})</span>
            </div>
            <div className="stat-tile">
              <small>Số đơn</small>
              <strong>{summary.totalOrders}</strong>
              <span>{summary.activeOrders > 0 ? `${summary.activeOrders} đơn đang làm` : `${summary.itemsSold} phần đã bán`}</span>
            </div>
            <div className="stat-tile">
              <small>Giá trị đơn trung bình</small>
              <strong>{formatPrice(summary.avgOrderValue)}</strong>
              <span>{summary.itemsSold} phần đã bán</span>
            </div>
            <div className={summary.cancelRate > 0.2 ? 'stat-tile warn' : 'stat-tile'}>
              <small>Tỷ lệ hủy / từ chối</small>
              <strong>{pct(summary.cancelRate)}</strong>
              <span>{summary.cancelledOrders} đơn{summary.cancelRate > 0.2 ? ' — cao, xem lại lý do' : ''}</span>
            </div>
            <div className="stat-tile">
              <small>Đánh giá</small>
              <strong><RatingBadge avg={summary.ratingAvg} count={summary.ratingCount} /></strong>
              <span><Link to="/owner/reviews" className="link-btn">Xem đánh giá →</Link></span>
            </div>
          </div>

          <section className="panel">
            <div className="section-head">
              <h2>Doanh thu {groupBy === 'day' ? 'theo ngày' : groupBy === 'week' ? 'theo tuần' : 'theo tháng'}</h2>
              <small className="muted">Đơn hoàn thành, {summary.range.from.split('-').reverse().join('/')} – {summary.range.to.split('-').reverse().join('/')}</small>
            </div>
            <RevenueChart series={series} groupBy={groupBy} />
          </section>

          <section className="panel">
            <div className="section-head"><h2>Món bán chạy</h2></div>
            {top.length === 0 ? (
              <p className="muted">Chưa có món nào được bán trong khoảng này.</p>
            ) : (
              <table className="data-table top-items">
                <thead>
                  <tr><th>#</th><th>Món</th><th>Số phần</th><th>Doanh thu</th></tr>
                </thead>
                <tbody>
                  {top.map((t, i) => (
                    <tr key={t.menuItemId}>
                      <td>{i + 1}</td>
                      <td>{t.name}</td>
                      <td>
                        <span className="qty-bar"><i style={{ width: `${(t.qty / maxQty) * 100}%` }} /></span>
                        {t.qty}
                      </td>
                      <td>{formatPrice(t.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </>
  );
}
