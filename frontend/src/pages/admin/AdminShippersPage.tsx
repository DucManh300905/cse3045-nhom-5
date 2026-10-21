import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { adminShipperApi } from '../../api/shipper';
import { shiftApi } from '../../api/schedule';
import { PenaltyCard } from '../shipper/ShipperShiftsPage';
import PrivateImage from '../../components/PrivateImage';
import { useToast } from '../../context/ToastContext';
import type { AdminShipper, Paginated, PenaltySummary, ShipperDocumentType, ShipperStatus } from '../../types';
import { formatDateTime } from '../../utils/format';
import { SHIPPER_STATUS_LABEL, VEHICLE_LABEL, requiredShipperDocuments } from '../../utils/delivery';

type Filter = ShipperStatus | 'ALL';
const FILTERS: Filter[] = ['SUBMITTED', 'APPROVED', 'REJECTED', 'BLOCKED', 'DRAFT', 'ALL'];
const PAGE_SIZE = 20;

const contactOf = (s: AdminShipper) => (typeof s.user === 'object' ? s.user.email || s.user.phone : undefined);

/** Hồ sơ tài xế: mặc định "Chờ duyệt", nộp trước xếp trước (giống duyệt quán) */
export default function AdminShippersPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as Filter | null) ?? 'SUBMITTED';
  const page = Number(params.get('page')) || 1;
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);
  const [data, setData] = useState<Paginated<AdminShipper> | null>(null);
  const [error, setError] = useState('');

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  useEffect(() => {
    let ignore = false;
    setError('');
    adminShipperApi.list({ status, q: q || undefined, page, limit: PAGE_SIZE })
      .then(res => { if (!ignore) setData(res); })
      .catch(err => { if (!ignore) setError(getErrorMessage(err)); });
    return () => { ignore = true; };
  }, [status, q, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <div className="owner-title-row">
        <h1 className="page-title">Tài xế MAK</h1>
        <Link to="/admin/dispatch" className="btn-soft">Điều phối →</Link>
      </div>

      <section className="toolbar admin-toolbar">
        <div className="cat-tabs" role="tablist">
          {FILTERS.map(f => (
            <button key={f} role="tab" aria-selected={status === f} className={status === f ? 'active' : ''} onClick={() => update({ status: f === 'SUBMITTED' ? '' : f, page: '' })}>
              {f === 'ALL' ? 'Tất cả' : SHIPPER_STATUS_LABEL[f]}
            </button>
          ))}
        </div>
        <form onSubmit={e => { e.preventDefault(); update({ q: search.trim(), page: '' }); }} className="admin-search">
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tên, SĐT, biển số..." />
          <button className="btn-soft" type="submit">Tìm</button>
        </form>
      </section>

      {error ? (
        <div className="empty-state"><h2>Không tải được danh sách</h2><p>{error}</p></div>
      ) : !data ? (
        <div className="page-loading">Đang tải...</div>
      ) : data.items.length === 0 ? (
        <div className="empty-state">
          <h2>{status === 'SUBMITTED' ? 'Không có hồ sơ tài xế nào chờ duyệt' : 'Không có tài xế nào'}</h2>
          <p>{q ? `Không tìm thấy kết quả cho “${q}”.` : 'Tài xế đăng ký ở trang /shipper/login.'}</p>
        </div>
      ) : (
        <>
          <p className="result-line"><span><b>{data.total}</b> tài xế</span></p>
          <ul className="admin-list">
            {data.items.map(s => (
              <li key={s.id}>
                <Link to={`/admin/shippers/${s.id}`} className="panel admin-row">
                  <div className="admin-row-main">
                    <b>{s.fullName}</b>
                    <small>{s.phone} · {VEHICLE_LABEL[s.vehicleType]}{s.licensePlate ? ` · ${s.licensePlate}` : ''}</small>
                    <small>Tài khoản: {contactOf(s) ?? '—'}</small>
                  </div>
                  <div className="admin-row-side">
                    <span className={`status-chip s-${s.status}`}>{SHIPPER_STATUS_LABEL[s.status]}</span>
                    {s.status === 'APPROVED' && <small>{s.isOnline ? '🟢 Trực tuyến' : 'Đang nghỉ'} · {s.completedCount} chuyến{s.ratingCount ? ` · ${s.ratingAvg.toFixed(1)} ★` : ''}</small>}
                    <small>{s.status === 'SUBMITTED' && s.submittedAt ? `Nộp ${formatDateTime(s.submittedAt)}` : `Tạo ${formatDateTime(s.createdAt)}`}</small>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="pager">
              <button className="btn-outline" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>← Trước</button>
              <span>Trang {page}/{pages}</span>
              <button className="btn-outline" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>Sau →</button>
            </div>
          )}
        </>
      )}
    </>
  );
}

const DOC_LABEL: Record<ShipperDocumentType, string> = {
  ID_CARD: 'CCCD',
  DRIVER_LICENSE: 'Bằng lái xe máy',
  VEHICLE_REGISTRATION: 'Đăng ký xe',
};

/** Chi tiết hồ sơ tài xế: xem giấy tờ, duyệt / từ chối / khóa / mở khóa (ghi nhật ký) */
export function AdminShipperDetailPage() {
  const { id = '' } = useParams();
  const notify = useToast();
  const [s, setS] = useState<AdminShipper | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reasonFor, setReasonFor] = useState<'reject' | 'block' | null>(null);
  const [reason, setReason] = useState('');
  const [pen, setPen] = useState<PenaltySummary | null>(null);

  useEffect(() => {
    adminShipperApi.get(id).then(setS).catch(err => setError(getErrorMessage(err)));
    shiftApi.adminPenalties(id).then(setPen).catch(() => setPen(null));
  }, [id]);

  const unlock = async () => {
    const note = window.prompt('Mở khóa nhận đơn sớm cho tài xế này? Lý do (ghi nhật ký):');
    if (note === null) return;
    setBusy(true);
    try {
      setPen(await shiftApi.adminUnlock(id, note.trim() || undefined));
      notify('Đã mở khóa nhận đơn');
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="empty-state"><h2>Không tải được hồ sơ</h2><p>{error}</p><Link to="/admin/shippers" className="btn-soft">← Danh sách</Link></div>;
  if (!s) return <div className="page-loading">Đang tải...</div>;

  const run = async (action: 'approve' | 'reject' | 'block' | 'unblock', ok: string, note?: string) => {
    setBusy(true);
    try {
      setS(await adminShipperApi.setStatus(s.id, action, note));
      shiftApi.adminPenalties(s.id).then(setPen).catch(() => {});
      setReasonFor(null);
      setReason('');
      notify(ok);
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const openDocument = async (type: ShipperDocumentType) => {
    const tab = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(await adminShipperApi.document(s.id, type));
      if (tab) tab.location.href = url; else window.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      tab?.close();
      notify('Không mở được file giấy tờ.');
    }
  };

  const submitReason = (e: FormEvent) => {
    e.preventDefault();
    if (reasonFor === 'reject') {
      if (!reason.trim()) return notify('Nhập lý do từ chối để tài xế sửa lại.');
      run('reject', 'Đã từ chối hồ sơ', reason.trim());
    } else {
      run('block', 'Đã khóa tài xế', reason.trim() || undefined);
    }
  };

  const required = requiredShipperDocuments(s.vehicleType);
  const missing = required.filter(d => !s.documents.some(x => x.type === d.type));

  return (
    <>
      <Link to="/admin/shippers" className="back-link inline">← Danh sách tài xế</Link>
      <div className="admin-title">
        <div>
          <h1 className="page-title">{s.fullName}</h1>
          <span className={`status-chip s-${s.status}`}>{SHIPPER_STATUS_LABEL[s.status]}</span>
        </div>
      </div>

      <section className={`panel status-panel s-${s.status}`}>
        <div className="status-head">
          <div>
            <h2>
              {{
                DRAFT: 'Tài xế chưa nộp hồ sơ',
                SUBMITTED: 'Hồ sơ đang chờ bạn duyệt',
                APPROVED: s.isOnline ? 'Đang hoạt động · trực tuyến' : 'Đang hoạt động · đang nghỉ',
                REJECTED: 'Đã từ chối — chờ tài xế nộp lại',
                BLOCKED: 'Tài xế đang bị khóa',
              }[s.status]}
            </h2>
            {s.submittedAt && <small>Nộp lúc {formatDateTime(s.submittedAt)}</small>}
            {s.rejectReason && <p className="reject-reason">Lý do từ chối: {s.rejectReason}</p>}
            {s.status === 'SUBMITTED' && missing.length > 0 && <p className="reject-reason">Thiếu: {missing.map(d => d.label).join(', ')}</p>}
          </div>
          <div className="form-actions">
            {s.status === 'SUBMITTED' && (
              <>
                <button className="btn-outline danger-outline" disabled={busy} onClick={() => setReasonFor('reject')}>Từ chối</button>
                <button className="btn-primary" disabled={busy} onClick={() => run('approve', 'Đã duyệt tài xế')}>Duyệt</button>
              </>
            )}
            {s.status === 'APPROVED' && <button className="btn-outline danger-outline" disabled={busy} onClick={() => setReasonFor('block')}>Khóa</button>}
            {s.status === 'BLOCKED' && <button className="btn-primary" disabled={busy} onClick={() => run('unblock', 'Đã mở khóa tài xế')}>Mở khóa</button>}
          </div>
        </div>
        {reasonFor && (
          <form className="reason-form" onSubmit={submitReason}>
            <label>
              <span>{reasonFor === 'reject' ? 'Lý do từ chối *' : 'Lý do khóa'}</span>
              <input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} autoFocus />
            </label>
            <div className="form-actions">
              <button type="button" className="btn-outline" onClick={() => setReasonFor(null)}>Quay lại</button>
              <button className="btn-primary danger" disabled={busy}>{reasonFor === 'reject' ? 'Xác nhận từ chối' : 'Xác nhận khóa'}</button>
            </div>
          </form>
        )}
      </section>

      <div className="wallet-cols">
        <section className="panel">
          <h2>Thông tin</h2>
          <div className="portrait-row">
            <PrivateImage url={s.portrait?.url} alt={`Ảnh chân dung ${s.fullName}`} className="portrait-img" fallback={<div className="portrait-img empty">Chưa có ảnh chân dung</div>} />
            <small className="muted">Đối chiếu khuôn mặt với ảnh CCCD (nút "Xem" ở phần Giấy tờ).</small>
          </div>
          <dl className="kv">
            <dt>Số điện thoại</dt><dd><a href={`tel:${s.phone}`}>{s.phone}</a></dd>
            <dt>Tài khoản</dt><dd>{contactOf(s) ?? '—'}{typeof s.user === 'object' && s.user.status === 'BLOCKED' ? ' (tài khoản bị khóa)' : ''}</dd>
            <dt>CCCD</dt><dd>{s.idNumber || '—'}</dd>
            <dt>Phương tiện</dt><dd>{VEHICLE_LABEL[s.vehicleType]}{s.licensePlate ? ` · ${s.licensePlate}` : ''}</dd>
            <dt>Chuyến đã giao</dt><dd>{s.completedCount}{s.ratingCount ? ` · ${s.ratingAvg.toFixed(1)} ★ (${s.ratingCount} đánh giá)` : ''}</dd>
            {s.dispatchBlockedUntil && new Date(s.dispatchBlockedUntil) > new Date() && (
              <><dt>Tạm ngưng nhận đơn</dt><dd>tới {formatDateTime(s.dispatchBlockedUntil)} (hủy đơn nhiều lần)</dd></>
            )}
            {s.bankAccount?.accountNumber && <><dt>Nhận tiền</dt><dd>{s.bankAccount.bankName} · {s.bankAccount.accountNumber} · {s.bankAccount.accountName}</dd></>}
          </dl>
        </section>
        <section className="panel">
          <h2>Giấy tờ</h2>
          <ul className="doc-list">
            {required.map(d => {
              const doc = s.documents.find(x => x.type === d.type);
              return (
                <li key={d.type}>
                  <div>
                    <b>{DOC_LABEL[d.type]}</b>
                    <small>{doc ? `${doc.originalName} · ${formatDateTime(doc.uploadedAt)}` : 'Chưa tải lên'}</small>
                  </div>
                  {doc && <button className="btn-outline" onClick={() => openDocument(d.type)}>Xem</button>}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {pen && (
        <>
          <PenaltyCard p={pen} />
          {pen.lockedUntil && (
            <div className="form-actions">
              <button className="btn-outline" disabled={busy} onClick={unlock}>Mở khóa nhận đơn sớm</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
