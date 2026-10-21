import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { authApi } from '../../api/auth';
import { getErrorMessage } from '../../api/client';
import { shiftApi } from '../../api/schedule';
import { useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import type { AssignmentStatus, PenaltySummary, ShiftView, ShipperShiftList } from '../../types';
import { EMAIL_REGEX, formatDateTime } from '../../utils/format';
import { useShipper } from './ShipperLayout';

const MY_STATUS: Record<AssignmentStatus, string> = {
  REGISTERED: 'Đã đăng ký',
  ACTIVE: 'Đã vào ca',
  NO_SHOW: 'Vắng ca',
  CANCELLED: 'Đã hủy',
  LATE_CANCELLED: 'Hủy sát giờ',
  VOID: 'Ca bị hủy',
};

export const LEVEL_TEXT = [
  'Không có vi phạm',
  'Đã bị cảnh cáo — vi phạm tiếp sẽ khóa 3 ngày',
  'Mức khóa 3 ngày — vi phạm tiếp sẽ khóa 5 ngày',
  'Mức khóa 5 ngày — vi phạm tiếp sẽ khóa vĩnh viễn',
  'Khóa vĩnh viễn',
];

export const PENALTY_REASON: Record<string, string> = {
  NO_SHOW: 'Vắng ca',
  LATE_CANCEL: 'Hủy ca sát giờ',
  WITHDRAWALS: 'Trả 3 đơn liên tiếp',
};

export const PENALTY_KIND: Record<string, string> = {
  VIOLATION: 'Vi phạm',
  DECAY: 'Giảm mức vi phạm',
  WITHDRAW_LOCK: 'Khóa 1 ngày',
  ADMIN_UNLOCK: 'Admin mở khóa',
  ADMIN_UNBLOCK: 'Admin mở lại tài khoản',
};

const SHIFT_EVENTS = new Set(['SHIFT_LIST', 'SHIFT_REMINDER', 'SHIFT_CANCELLED', 'PENALTY']);

/** Tài khoản tài xế cũ chưa có email: nhập email -> nhận mã OTP -> xác thực (bắt buộc để nộp hồ sơ / đăng ký ca) */
export function EmailVerifyPanel({ onDone }: { onDone: () => void }) {
  const notify = useToast();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(value)) return setError('Email không hợp lệ.');
    setBusy(true);
    setError('');
    try {
      await authApi.sendOtp(value);
      setSent(true);
      notify('Đã gửi mã xác thực tới email');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Mã xác thực gồm 6 chữ số.');
    setBusy(true);
    setError('');
    try {
      const value = email.trim().toLowerCase();
      const verificationToken = await authApi.verifyOtp(value, code);
      await shiftApi.setEmail(value, verificationToken);
      notify('Đã xác thực email');
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel email-panel">
      <h2>Xác thực email</h2>
      <p className="muted small">Tài xế MAK bắt buộc có email: lịch ca, nhắc ca và thông báo vi phạm được gửi qua email.</p>
      {!sent ? (
        <form className="inline-form" onSubmit={send}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ban@gmail.com" autoComplete="email" />
          <button className="btn-primary" disabled={busy}>Gửi mã</button>
        </form>
      ) : (
        <form className="inline-form" onSubmit={verify}>
          <input inputMode="numeric" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Mã 6 số" autoFocus />
          <button className="btn-primary" disabled={busy}>Xác thực</button>
          <button type="button" className="link-btn" onClick={() => { setSent(false); setCode(''); }}>Đổi email</button>
        </form>
      )}
      {error && <div className="form-error" role="alert">{error}</div>}
    </section>
  );
}

/** Thẻ vi phạm: bậc hiện tại, khóa tới khi nào, bao giờ được giảm bậc, lịch sử */
export function PenaltyCard({ p }: { p: PenaltySummary }) {
  return (
    <section className={`panel penalty-card level-${p.level}`}>
      <div className="section-head">
        <h2>Vi phạm</h2>
        <span className={`status-chip ${p.level === 0 ? 's-APPROVED' : p.level >= 3 ? 's-REJECTED' : 's-SUBMITTED'}`}>Mức {p.level}/4</span>
      </div>
      <p>{LEVEL_TEXT[p.level] ?? ''}</p>
      {p.lockedUntil && (
        <p className="form-error">
          Đang tạm khóa nhận đơn tới <b>{formatDateTime(p.lockedUntil)}</b>{p.lockReason === 'WITHDRAWALS' ? ' (trả 3 đơn liên tiếp)' : ''}. Bạn vẫn rút tiền được.
        </p>
      )}
      {p.level > 0 && p.level < 4 && p.decayAt && (
        <small className="muted">Không vi phạm tới {formatDateTime(p.decayAt)} thì {p.level === 3 ? 'giảm xuống mức 2' : 'xóa hết lỗi'}.</small>
      )}
      {p.consecutiveWithdrawals > 0 && <small className="muted">Đã trả {p.consecutiveWithdrawals} đơn liên tiếp (3 lần sẽ bị khóa 1 ngày; giao xong 1 đơn thì về 0).</small>}
      {p.history.length > 0 && (
        <details>
          <summary>Lịch sử ({p.history.length})</summary>
          <ul className="entry-list">
            {p.history.map(h => (
              <li key={h.id}>
                <div>
                  <b>{PENALTY_KIND[h.kind] ?? h.kind}{h.reason ? `: ${PENALTY_REASON[h.reason] ?? h.reason}` : ''}</b>
                  <small>
                    {h.toLevel !== undefined && h.fromLevel !== undefined && h.fromLevel !== h.toLevel ? `Mức ${h.fromLevel} → ${h.toLevel}` : ''}
                    {h.lockedUntil ? ` · khóa tới ${formatDateTime(h.lockedUntil)}` : ''}
                    {h.shift ? ` · ca ${h.shift.label} ${h.shift.date}` : ''}
                    {h.note ? ` · ${h.note}` : ''}
                  </small>
                </div>
                <small className="muted">{formatDateTime(h.createdAt)}</small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

const dateLabel = (date: string) => {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
};

/** Ca làm: đăng ký / hủy ca hôm nay + ngày mai, xem vi phạm */
export default function ShipperShiftsPage() {
  const { profile, reload } = useShipper();
  const notify = useToast();
  const [list, setList] = useState<ShipperShiftList | null>(null);
  const [pen, setPen] = useState<PenaltySummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([shiftApi.list(), shiftApi.penalties()]);
      setList(l);
      setPen(p);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useSocketEvent('notification:new', n => { if (SHIFT_EVENTS.has(n.type)) load(); });

  if (error) return <div className="empty-state"><h2>Không tải được ca làm</h2><p>{error}</p><button className="btn-soft" onClick={load}>Thử lại</button></div>;
  if (!list || !pen || !profile) return <div className="page-loading">Đang tải...</div>;

  const act = async (s: ShiftView, kind: 'register' | 'cancel') => {
    if (kind === 'cancel') {
      const late = Date.now() >= new Date(s.registrationClosesAt).getTime();
      if (!window.confirm(late
        ? `Còn dưới ${list.cutoffHours} giờ tới ca ${s.label}: hủy bây giờ là VI PHẠM (tính vào mức phạt). Vẫn hủy?`
        : `Hủy ca ${s.label} (${s.start}–${s.end})? Hủy trước ${list.cutoffHours} giờ không bị phạt.`)) return;
    }
    setBusyId(s.id);
    try {
      setList(kind === 'register' ? await shiftApi.register(s.id) : await shiftApi.cancel(s.id));
      notify(kind === 'register' ? `Đã đăng ký ca ${s.label}` : `Đã hủy ca ${s.label}`);
      setPen(await shiftApi.penalties());
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const byDate = list.shifts.reduce<Record<string, ShiftView[]>>((acc, s) => ({ ...acc, [s.date]: [...(acc[s.date] ?? []), s] }), {});
  const approved = profile.status === 'APPROVED';
  const now = Date.now();

  return (
    <div className="narrow-body">
      <h1 className="page-title">Ca làm · {list.area}</h1>
      {profile.emailVerified === false && <EmailVerifyPanel onDone={() => { reload(); load(); }} />}
      <PenaltyCard p={pen} />

      <p className="muted small">
        Đăng ký ca = cam kết bật <b>Trực tuyến</b> trong khung giờ đó; trong ca bạn được ưu tiên nhận đơn. Đăng ký / hủy miễn phạt tới {list.cutoffHours} giờ trước ca.
        Sau 30 phút đầu ca chưa trực tuyến tính là vắng ca.
      </p>

      {Object.keys(byDate).length === 0 && (
        <div className="empty-state compact"><h2>Chưa có ca nào</h2><p>Danh sách ca ngày mai được gửi lúc 18:00 mỗi ngày.</p></div>
      )}

      {Object.entries(byDate).map(([date, shifts]) => (
        <section key={date} className="panel">
          <h2>Ngày {dateLabel(date)}</h2>
          <ul className="shift-list">
            {shifts.map(s => {
              const mine = s.myStatus && ['REGISTERED', 'ACTIVE'].includes(s.myStatus);
              const open = now < new Date(s.registrationClosesAt).getTime() && s.status !== 'CANCELLED';
              const started = now >= new Date(s.startAt).getTime();
              const full = s.driversRegistered >= s.driversNeeded;
              return (
                <li key={s.id} className={mine ? 'mine' : ''}>
                  <div>
                    <b>{s.label} · {s.start}–{s.end}</b>
                    <small>{s.restaurants.map(r => r.name).join(', ')}</small>
                    <small>
                      {s.driversRegistered}/{s.driversNeeded} tài xế{full ? ' (đủ người — vẫn đăng ký thêm được)' : ''}
                      {s.expectedOrders ? ` · ~${s.expectedOrders} đơn dự kiến` : ''}
                    </small>
                    {s.myStatus && <span className={`tag ${['NO_SHOW', 'LATE_CANCELLED'].includes(s.myStatus) ? 'danger-tag' : ''}`}>{MY_STATUS[s.myStatus]}</span>}
                  </div>
                  <div className="shift-actions">
                    {mine && s.myStatus === 'REGISTERED' && !started && (
                      <button className="btn-outline danger-outline" disabled={busyId === s.id} onClick={() => act(s, 'cancel')}>Hủy ca</button>
                    )}
                    {!mine && open && (
                      <button className="btn-primary" disabled={busyId === s.id || !approved || !profile.emailVerified} onClick={() => act(s, 'register')}>Đăng ký</button>
                    )}
                    {!mine && !open && !started && <small className="muted">Đã chốt đăng ký</small>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
