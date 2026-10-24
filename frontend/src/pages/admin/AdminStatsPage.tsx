import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { reportsApi } from '../../api/reports';
import RangePicker, { presetRange, type DateRange } from '../../components/RangePicker';
import RevenueChart from '../../components/RevenueChart';
import type { AdminSummary, GroupBy } from '../../types';
import { formatPrice } from '../../utils/format';
import { STATUS_LABEL } from '../../utils/labels';

const pct = (x: number) => `${(x * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;

/** Thống kê toàn hệ thống (API-9): GMV = tổng tiền đơn hoàn thành, doanh thu nền tảng = hoa hồng */
export default function AdminStatsPage() {
  const [range, setRange] = useState<DateRange>(() => presetRange('30d'));
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [data, setData] = useState<AdminSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    reportsApi.adminSummary(range, groupBy)
      .then(d => { if (!ignore) { setData(d); setError(''); } })
      .catch(err => { if (!ignore) setError(getErrorMessage(err)); });
    return () => { ignore = true; };
  }, [range, groupBy]);

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
      ) : !data ? (
        <div className="page-loading">Đang tải...</div>
      ) : (
        <div className="dashboard">
          <div className="stat-grid">
            <div className="stat-tile accent">
              <small>GMV (tổng tiền đơn hoàn thành)</small>
              <strong>{formatPrice(data.gmv)}</strong>
              <span>{data.orders.completedOrders} đơn hoàn thành</span>
            </div>
            <div className="stat-tile">
              <small>Doanh thu nền tảng (hoa hồng)</small>
              <strong>{formatPrice(data.platformRevenue)}</strong>
              <span>Giá trị đơn TB {formatPrice(data.orders.avgOrderValue)}</span>
            </div>
            <div className="stat-tile">
              <small>Số đơn</small>
              <strong>{data.orders.totalOrders}</strong>
              <span>Hủy / từ chối {pct(data.orders.cancelRate)}</span>
            </div>
            <div className="stat-tile">
              <small>Quán</small>
              <strong>{data.restaurants.total}</strong>
              <span>
                {data.restaurants.byStatus.APPROVED ?? 0} đang hoạt động
                {(data.restaurants.byStatus.SUBMITTED ?? 0) > 0 && <> · <Link to="/admin" className="link-btn">{data.restaurants.byStatus.SUBMITTED} chờ duyệt</Link></>}
              </span>
            </div>
            <div className="stat-tile">
              <small>Người dùng</small>
              <strong>{Object.values(data.users.byRole).reduce((s, n) => s + (n ?? 0), 0)}</strong>
              <span>{data.users.byRole.CUSTOMER ?? 0} khách · {data.users.byRole.RESTAURANT_OWNER ?? 0} chủ quán · +{data.users.newInRange} mới</span>
            </div>
            <div className={data.users.blocked > 0 ? 'stat-tile warn' : 'stat-tile'}>
              <small>Tài khoản bị khóa</small>
              <strong>{data.users.blocked}</strong>
              <span><Link to="/admin/users?status=BLOCKED" className="link-btn">Xem danh sách →</Link></span>
            </div>
          </div>

          <section className="panel">
            <div className="section-head">
              <h2>GMV {groupBy === 'day' ? 'theo ngày' : groupBy === 'week' ? 'theo tuần' : 'theo tháng'}</h2>
              <small className="muted">Đơn hoàn thành toàn hệ thống</small>
            </div>
            <RevenueChart series={data.series} groupBy={groupBy} />
          </section>

          <section className="panel">
            <div className="section-head"><h2>Quán doanh thu cao nhất</h2></div>
            {data.topRestaurants.length === 0 ? (
              <p className="muted">Chưa có đơn hoàn thành trong khoảng này.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>#</th><th>Quán</th><th>Đơn hoàn thành</th><th>GMV</th><th>Hoa hồng</th></tr>
                </thead>
                <tbody>
                  {data.topRestaurants.map((r, i) => (
                    <tr key={r.restaurantId}>
                      <td>{i + 1}</td>
                      <td><Link to={`/admin/restaurants/${r.restaurantId}`} className="link-btn">{r.name}</Link></td>
                      <td>{r.completedOrders}</td>
                      <td>{formatPrice(r.grossRevenue)}</td>
                      <td>{formatPrice(r.commission)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted small">
              Quán theo trạng thái: {Object.entries(data.restaurants.byStatus).map(([s, n]) => `${STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? s} ${n}`).join(' · ') || '—'}
            </p>
          </section>
        </div>
      )}
    </>
  );
}
