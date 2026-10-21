import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { shiftApi } from '../../api/schedule';
import { useSocketEvent } from '../../context/SocketContext';
import type { AdminShiftView, AssignmentStatus } from '../../types';
import { formatDateTime } from '../../utils/format';

const STATUS_TEXT: Record<string, string> = { OPEN: 'Đang nhận đăng ký', LOCKED: 'Đã chốt', RUNNING: 'Đang diễn ra', DONE: 'Đã xong', CANCELLED: 'Đã hủy' };
const ASSIGN_TEXT: Record<AssignmentStatus, string> = {
  REGISTERED: 'Đã đăng ký', ACTIVE: 'Đã vào ca', NO_SHOW: 'Vắng ca', CANCELLED: 'Hủy (không phạt)', LATE_CANCELLED: 'Hủy sát giờ', VOID: 'Ca hủy / bị khóa',
};

const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const shiftDate = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
};

/** Ca tài xế theo ngày: quán cần hỗ trợ, số tài xế cần / đã đăng ký, ai vắng ca */
export default function AdminShiftsPage() {
  const [date, setDate] = useState(vnToday());
  const [shifts, setShifts] = useState<AdminShiftView[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setShifts((await shiftApi.adminShifts(date)).shifts);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [date]);
  useEffect(() => { setShifts(null); load(); }, [load]);
  useSocketEvent('notification:new', n => { if (n.type === 'SHIFT_UNFILLED') load(); });

  return (
    <>
      <div className="owner-title-row">
        <h1 className="page-title">Ca tài xế</h1>
        <div className="date-nav">
          <button className="btn-outline" onClick={() => setDate(d => shiftDate(d, -1))}>←</button>
          <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} />
          <button className="btn-outline" onClick={() => setDate(d => shiftDate(d, 1))}>→</button>
        </div>
      </div>

      {error ? (
        <div className="empty-state"><h2>Không tải được ca</h2><p>{error}</p></div>
      ) : !shifts ? (
        <div className="page-loading">Đang tải...</div>
      ) : shifts.length === 0 ? (
        <div className="empty-state"><h2>Không có ca nào ngày này</h2><p>Ca được tạo lúc 18:00 hôm trước từ lịch của các quán "Theo lịch".</p></div>
      ) : (
        <div className="admin-shifts">
          {shifts.map(s => (
            <section key={s.id} className={`panel ${s.driversRegistered === 0 && s.status !== 'OPEN' && s.status !== 'CANCELLED' ? 'shift-unfilled' : ''}`}>
              <div className="section-head">
                <h2>{s.label} · {s.start}–{s.end}</h2>
                <span className={`status-chip ${s.status === 'CANCELLED' ? 's-REJECTED' : s.status === 'OPEN' ? 's-SUBMITTED' : 's-APPROVED'}`}>{STATUS_TEXT[s.status]}</span>
              </div>
              <p className="muted small">
                {s.restaurants.map(r => `${r.name}${r.expectedOrders ? ` (~${r.expectedOrders} đơn)` : ''}`).join(' · ')}
                {' — '}cần {s.driversNeeded}, đã có <b>{s.driversRegistered}</b> tài xế · chốt đăng ký {formatDateTime(s.registrationClosesAt)}
              </p>
              {s.assignments.length === 0 ? (
                <p className="muted">Chưa có tài xế đăng ký.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Tài xế</th><th>Trạng thái</th><th>Đăng ký</th><th>Vào ca / hủy</th></tr></thead>
                    <tbody>
                      {s.assignments.map(a => (
                        <tr key={a.id} className={['NO_SHOW', 'LATE_CANCELLED'].includes(a.status) ? 'row-blocked' : undefined}>
                          <td>
                            {a.shipper ? <Link to={`/admin/shippers/${a.shipper.id}`} className="link-btn">{a.shipper.fullName}</Link> : '—'}
                            {a.shipper && <><br /><small>{a.shipper.phone}{a.shipper.penaltyLevel ? ` · mức vi phạm ${a.shipper.penaltyLevel}` : ''}</small></>}
                          </td>
                          <td className="nowrap">{ASSIGN_TEXT[a.status]}</td>
                          <td className="nowrap">{formatDateTime(a.registeredAt)}</td>
                          <td className="nowrap">{a.activeAt ? formatDateTime(a.activeAt) : a.cancelledAt ? formatDateTime(a.cancelledAt) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
