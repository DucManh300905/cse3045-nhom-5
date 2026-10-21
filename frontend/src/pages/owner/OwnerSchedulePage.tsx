import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { scheduleApi } from '../../api/schedule';
import { useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import type { MerchantSchedule, MerchantScheduleDay, ShiftView, TimeWindow, WeeklyWindow } from '../../types';
import { DAY_NAMES } from '../../utils/labels';
import { useOwner } from './OwnerLayout';

// Giờ cho khung tự chọn: bước 30 phút
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
// Thứ 2 -> Chủ nhật
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const SCHEDULE_EVENTS = new Set(['SHIFT_PLAN_REQUEST', 'SHIFT_REPORT', 'SHIFT_UNFILLED']);

const key = (w: TimeWindow) => `${w.start}-${w.end}`;
const sortWindows = (list: TimeWindow[]) => [...list].sort((a, b) => a.start.localeCompare(b.start));
const dayTitle = (date: string, i: number) => {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${i === 0 ? 'Hôm nay' : 'Ngày mai'} — ${DAY_NAMES[dow]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
};

/**
 * Sửa danh sách khung của một ngày: thêm khung cố định (Trưa / Chiều / Tối) hoặc khung tự chọn (1–4 giờ, bước 30 phút),
 * nhập số đơn dự kiến. onlyRemove: sau mốc chốt chỉ được bỏ khung.
 */
function WindowsEditor({ value, onChange, fixedSlots, onlyRemove, disabled }: {
  value: TimeWindow[];
  onChange: (list: TimeWindow[]) => void;
  fixedSlots: MerchantSchedule['fixedSlots'];
  onlyRemove?: boolean;
  disabled?: boolean;
}) {
  const fixedOf = (w: TimeWindow) => fixedSlots.find(f => f.start === w.start && f.end === w.end);
  const update = (i: number, patch: Partial<TimeWindow>) => onChange(sortWindows(value.map((w, j) => (j === i ? { ...w, ...patch } : w))));
  const has = (w: TimeWindow) => value.some(x => key(x) === key(w));

  return (
    <div className="windows-editor">
      {value.length === 0 && <p className="muted small">Không cần tài xế — quán tự giao cả ngày.</p>}
      {value.map((w, i) => {
        const fixed = fixedOf(w);
        return (
          <div key={`${key(w)}-${i}`} className="window-row">
            {fixed || onlyRemove ? (
              <b>{fixed ? `${fixed.label} ${w.start}–${w.end}` : `${w.start}–${w.end}`}</b>
            ) : (
              <span className="window-times">
                <select value={w.start} disabled={disabled} onChange={e => update(i, { start: e.target.value })} aria-label="Giờ bắt đầu">
                  {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                –
                <select value={w.end} disabled={disabled} onChange={e => update(i, { end: e.target.value })} aria-label="Giờ kết thúc">
                  {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </span>
            )}
            <label className="window-orders">
              <span>Đơn dự kiến</span>
              <input
                type="number"
                min={0}
                max={500}
                value={w.expectedOrders ?? 0}
                disabled={disabled || onlyRemove}
                onChange={e => update(i, { expectedOrders: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            <button type="button" className="link-btn danger-link" disabled={disabled} onClick={() => onChange(value.filter((_, j) => j !== i))}>Bỏ</button>
          </div>
        );
      })}
      {!onlyRemove && (
        <div className="window-add">
          {fixedSlots.map(f => (
            <button key={f.key} type="button" className="btn-soft small-btn" disabled={disabled || has(f)} onClick={() => onChange(sortWindows([...value, { start: f.start, end: f.end, expectedOrders: 0 }]))}>
              + {f.label} {f.start}–{f.end}
            </button>
          ))}
          <button type="button" className="btn-outline small-btn" disabled={disabled} onClick={() => onChange(sortWindows([...value, { start: '06:00', end: '08:00', expectedOrders: 0 }]))}>
            + Khung tự chọn
          </button>
        </div>
      )}
    </div>
  );
}

const shiftLine = (s: ShiftView) =>
  s.status === 'CANCELLED' ? 'đã hủy'
    : s.driversRegistered === 0 ? (s.status === 'OPEN' ? 'chưa có tài xế đăng ký' : 'không có tài xế — quán tự giao')
      : `${s.driversRegistered}/${s.driversNeeded} tài xế${s.status === 'RUNNING' ? ' · đang trong ca' : ''}`;

/** Lịch giao (chế độ "Theo lịch"): lịch tuần, lịch ngày mai (sửa tới mốc chốt), tình trạng tài xế từng ca */
export default function OwnerSchedulePage() {
  const { restaurant } = useOwner();
  const notify = useToast();
  const [data, setData] = useState<MerchantSchedule | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, TimeWindow[]>>({});
  const [weekly, setWeekly] = useState<Record<number, TimeWindow[]>>({});

  const apply = useCallback((d: MerchantSchedule) => {
    setData(d);
    setDrafts(Object.fromEntries(d.days.map(day => [day.date, day.windows])));
    const byDay: Record<number, TimeWindow[]> = {};
    d.weeklySchedule.forEach(({ dayOfWeek, ...w }) => { byDay[dayOfWeek] = [...(byDay[dayOfWeek] ?? []), w]; });
    setWeekly(byDay);
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await scheduleApi.get());
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [apply]);
  useEffect(() => { if (restaurant) load(); }, [restaurant, load]);
  useSocketEvent('notification:new', n => { if (SCHEDULE_EVENTS.has(n.type)) load(); });

  if (!restaurant) {
    return <div className="empty-state"><h2>Bạn chưa có quán</h2><Link to="/owner" className="btn-primary">Tạo quán</Link></div>;
  }
  if (error) return <div className="empty-state"><h2>Không tải được lịch</h2><p>{error}</p><button className="btn-soft" onClick={load}>Thử lại</button></div>;
  if (!data) return <div className="page-loading">Đang tải...</div>;

  const run = async (fn: () => Promise<MerchantSchedule>, ok: string) => {
    setBusy(true);
    try {
      apply(await fn());
      notify(ok);
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveDay = (day: MerchantScheduleDay) => {
    const next = drafts[day.date] ?? [];
    if (day.closed) {
      const removed = day.windows.filter(w => !next.some(x => key(x) === key(w)));
      if (removed.length && !window.confirm(`Bỏ khung ${removed.map(w => `${w.start}–${w.end}`).join(', ')} sau giờ chốt?\nViệc này được ghi nhận là hủy muộn; tài xế đã đăng ký ca sẽ được báo.`)) return;
    }
    run(() => scheduleApi.saveDay(day.date, next), day.closed ? 'Đã bỏ khung' : 'Đã xác nhận lịch');
  };

  const saveWeekly = () => {
    const list: WeeklyWindow[] = WEEK_ORDER.flatMap(d => (weekly[d] ?? []).map(w => ({ dayOfWeek: d, ...w })));
    run(() => scheduleApi.saveWeekly(list), 'Đã lưu lịch tuần');
  };

  const t = data.times;

  return (
    <>
      <div className="owner-title-row">
        <h1 className="page-title">Lịch giao hàng</h1>
      </div>

      {data.deliveryMode !== 'SCHEDULED' ? (
        <p className="wallet-alert">
          Quán đang ở chế độ <b>{data.deliveryMode === 'PLATFORM' ? 'Luôn dùng tài xế MAK' : 'Tự giao'}</b>. Lịch này chỉ dùng khi chọn <b>"Theo lịch"</b> ở{' '}
          <Link to="/owner" className="link-btn">Hồ sơ quán</Link>.
        </p>
      ) : (
        <p className="wallet-alert info">
          Mỗi ngày lúc <b>{t.askAt}</b> MAK hỏi lịch ngày mai, bạn sửa được tới <b>{t.closeAt}</b>; không sửa thì dùng lịch tuần.
          Tài xế đăng ký ca tới {t.cutoffHours} giờ trước giờ bắt đầu. Trong khung có tài xế, đơn giao tận nơi do tài xế MAK giao (khách chuyển khoản trước);
          ngoài khung hoặc khung không có tài xế, quán tự giao. Cứ ~{t.ordersPerDriver} đơn dự kiến cần 1 tài xế.
        </p>
      )}

      <div className="wallet-cols">
        {[...data.days].reverse().map(day => {
          const i = data.days.indexOf(day);
          return (
            <section key={day.date} className="panel">
              <div className="section-head">
                <h2>{dayTitle(day.date, i)}</h2>
                <span className={`status-chip ${day.closed ? 's-APPROVED' : 's-SUBMITTED'}`}>{day.closed ? 'Đã chốt' : day.answered ? 'Đã xác nhận' : 'Chưa xác nhận'}</span>
              </div>
              {day.closed && <p className="muted small">Đã qua giờ chốt: chỉ bỏ được khung (ghi nhận hủy muộn).</p>}
              <WindowsEditor
                value={drafts[day.date] ?? []}
                onChange={list => setDrafts(d => ({ ...d, [day.date]: list }))}
                fixedSlots={data.fixedSlots}
                onlyRemove={day.closed}
                disabled={busy}
              />
              <div className="form-actions">
                <button className="btn-primary" disabled={busy} onClick={() => saveDay(day)}>
                  {day.closed ? 'Lưu thay đổi' : 'Xác nhận lịch'}
                </button>
              </div>
              {day.shifts.length > 0 && (
                <ul className="shift-status">
                  {day.shifts.map(s => (
                    <li key={s.id} className={s.driversRegistered === 0 && s.status !== 'OPEN' ? 'warn' : ''}>
                      <b>{s.label}</b> {s.start}–{s.end}: {shiftLine(s)}
                    </li>
                  ))}
                </ul>
              )}
              {day.lateCancels.length > 0 && (
                <small className="muted">Hủy muộn: {day.lateCancels.map(w => `${w.start}–${w.end}`).join(', ')}</small>
              )}
            </section>
          );
        })}
      </div>

      <section className="panel">
        <div className="section-head">
          <h2>Lịch tuần (mặc định)</h2>
          <button className="btn-primary" disabled={busy} onClick={saveWeekly}>Lưu lịch tuần</button>
        </div>
        <div className="weekly-grid">
          {WEEK_ORDER.map(d => (
            <div key={d} className="weekly-day">
              <b>{DAY_NAMES[d]}</b>
              <WindowsEditor value={weekly[d] ?? []} onChange={list => setWeekly(w => ({ ...w, [d]: list }))} fixedSlots={data.fixedSlots} disabled={busy} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
