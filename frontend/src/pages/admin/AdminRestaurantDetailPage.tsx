import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { assetUrl, getErrorMessage } from '../../api/client';
import { adminApi } from '../../api/admin';
import { useToast } from '../../context/ToastContext';
import type { AdminRestaurant, AuditLog, DocumentType } from '../../types';
import { formatDateTime, formatPrice } from '../../utils/format';
import { AUDIT_ACTION_LABEL, DAY_NAMES, DOCUMENTS, STATUS_LABEL, describeChange } from '../../utils/labels';

/** Thứ hai trước, Chủ nhật cuối */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function AdminRestaurantDetailPage() {
  const { id = '' } = useParams();
  const notify = useToast();
  const [r, setR] = useState<AdminRestaurant | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** Hộp nhập lý do khi từ chối / khóa */
  const [reasonFor, setReasonFor] = useState<'reject' | 'block' | null>(null);
  const [reason, setReason] = useState('');
  const [commission, setCommission] = useState('');

  const loadLogs = useCallback(() => {
    adminApi.listAuditLogs({ targetId: id, limit: 20 }).then(res => setLogs(res.items)).catch(() => setLogs([]));
  }, [id]);

  useEffect(() => {
    setR(null);
    setError('');
    adminApi.getRestaurant(id)
      .then(data => { setR(data); setCommission(String(Math.round(data.commissionRate * 1000) / 10)); })
      .catch(err => setError(getErrorMessage(err)));
    loadLogs();
  }, [id, loadLogs]);

  if (error) {
    return (
      <div className="empty-state">
        <h2>Không tìm thấy quán</h2>
        <p>{error}</p>
        <Link to="/admin" className="btn-soft">← Về danh sách</Link>
      </div>
    );
  }
  if (!r) return <div className="page-loading">Đang tải...</div>;

  const run = async (fn: () => Promise<AdminRestaurant>, ok: string) => {
    setBusy(true);
    try {
      const updated = await fn();
      setR(updated);
      setReasonFor(null);
      setReason('');
      notify(ok);
      loadLogs();
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Giấy tờ là file private: tải bằng token admin rồi mở ở tab mới
  const openDocument = async (type: DocumentType) => {
    const tab = window.open('', '_blank');
    try {
      const blob = await adminApi.getDocument(r.id, type);
      const url = URL.createObjectURL(blob);
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
      if (!reason.trim()) return notify('Vui lòng nhập lý do từ chối để chủ quán sửa lại.');
      run(() => adminApi.reject(r.id, reason.trim()), 'Đã từ chối hồ sơ');
    } else {
      run(() => adminApi.block(r.id, reason.trim() || undefined), 'Đã khóa quán');
    }
  };

  const submitCommission = (e: FormEvent) => {
    e.preventDefault();
    const pct = Number(commission.replace(',', '.'));
    if (!(pct >= 0 && pct <= 100)) return notify('Hoa hồng từ 0 đến 100%.');
    run(() => adminApi.setCommission(r.id, pct / 100), 'Đã cập nhật hoa hồng');
  };

  const missingDocs = DOCUMENTS.filter(d => d.required && !r.documents.some(x => x.type === d.type));

  return (
    <>
      <Link to="/admin" className="back-link inline">← Danh sách hồ sơ</Link>
      <div className="admin-title">
        {r.logoUrl && <img className="shop-logo small" src={assetUrl(r.logoUrl)} alt="" />}
        <div>
          <h1 className="page-title">{r.name}</h1>
          <span className={`status-chip s-${r.status}`}>{STATUS_LABEL[r.status]}</span>
        </div>
      </div>

      {/* ---------- Hành động theo trạng thái ---------- */}
      <section className={`panel status-panel s-${r.status}`}>
        <div className="status-head">
          <div>
            <h2>
              {{
                DRAFT: 'Chủ quán chưa nộp hồ sơ',
                SUBMITTED: 'Hồ sơ đang chờ bạn duyệt',
                APPROVED: r.isAcceptingOrders ? 'Đang hoạt động, đang nhận đơn' : 'Đang hoạt động, tạm ngưng nhận đơn',
                REJECTED: 'Đã từ chối — chờ chủ quán nộp lại',
                BLOCKED: 'Quán đang bị khóa',
              }[r.status]}
            </h2>
            {r.submittedAt && <small>Nộp lúc {formatDateTime(r.submittedAt)}</small>}
            {r.approvedAt && r.status !== 'SUBMITTED' && <small>Duyệt lúc {formatDateTime(r.approvedAt)}</small>}
            {r.rejectReason && <p className="reject-reason">Lý do từ chối: {r.rejectReason}</p>}
            {r.status === 'SUBMITTED' && missingDocs.length > 0 && (
              <p className="reject-reason">Thiếu: {missingDocs.map(d => d.label).join(', ')}</p>
            )}
          </div>
          <div className="form-actions">
            {r.status === 'SUBMITTED' && (
              <>
                <button className="btn-outline danger-outline" disabled={busy} onClick={() => setReasonFor('reject')}>Từ chối</button>
                <button
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => window.confirm(`Duyệt quán "${r.name}"? Quán sẽ hiện với khách ngay.`) && run(() => adminApi.approve(r.id), 'Đã duyệt quán')}
                >
                  Duyệt quán
                </button>
              </>
            )}
            {r.status === 'APPROVED' && (
              <button className="btn-outline danger-outline" disabled={busy} onClick={() => setReasonFor('block')}>Khóa quán</button>
            )}
            {r.status === 'BLOCKED' && (
              <button className="btn-primary" disabled={busy} onClick={() => run(() => adminApi.unblock(r.id), 'Đã mở khóa quán')}>Mở khóa</button>
            )}
            {r.status === 'APPROVED' && <Link to={`/restaurants/${r.slug}`} className="btn-soft">Xem trang quán</Link>}
          </div>
        </div>

        {reasonFor && (
          <form className="reason-form" onSubmit={submitReason}>
            <label>
              <span>{reasonFor === 'reject' ? 'Lý do từ chối * (chủ quán sẽ thấy)' : 'Lý do khóa (không bắt buộc)'}</span>
              <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} autoFocus
                placeholder={reasonFor === 'reject' ? 'vd: Ảnh GPKD bị mờ, vui lòng tải lại' : 'vd: Nhiều khiếu nại về chất lượng'} />
            </label>
            <div className="form-actions">
              <button type="button" className="btn-outline" onClick={() => { setReasonFor(null); setReason(''); }}>Hủy</button>
              <button className="btn-primary danger" type="submit" disabled={busy}>
                {reasonFor === 'reject' ? 'Xác nhận từ chối' : 'Xác nhận khóa'}
              </button>
            </div>
          </form>
        )}
      </section>

      <div className="owner-grid">
        {/* ---------- Thông tin ---------- */}
        <section className="panel form-panel">
          <h2>Thông tin quán</h2>
          <dl className="info-list">
            <dt>Địa chỉ</dt><dd>{r.address}</dd>
            <dt>SĐT quán</dt><dd>{r.phone}</dd>
            {r.description && <><dt>Giới thiệu</dt><dd>{r.description}</dd></>}
            {r.cuisineTypes.length > 0 && <><dt>Loại món</dt><dd>{r.cuisineTypes.join(', ')}</dd></>}
            <dt>Đơn tối thiểu</dt><dd>{formatPrice(r.minOrderAmount)}</dd>
            <dt>Bán kính giao</dt><dd>{r.deliveryRadiusKm} km</dd>
            <dt>Chuẩn bị TB</dt><dd>{r.avgPrepMinutes} phút</dd>
            <dt>Đường dẫn</dt><dd>/restaurants/{r.slug}</dd>
          </dl>
          <h3>Chủ quán</h3>
          {r.owner ? (
            <dl className="info-list">
              <dt>Họ tên</dt><dd>{r.owner.fullName}</dd>
              {r.owner.email && <><dt>Email</dt><dd>{r.owner.email}</dd></>}
              {r.owner.phone && <><dt>SĐT</dt><dd>{r.owner.phone}</dd></>}
              <dt>Tài khoản</dt><dd>{r.owner.status === 'ACTIVE' ? 'Đang hoạt động' : 'Bị khóa'}</dd>
            </dl>
          ) : <p className="muted">Không có thông tin.</p>}
        </section>

        <div className="owner-col">
          {/* ---------- Giấy tờ ---------- */}
          <section className="panel form-panel">
            <h2>Giấy tờ pháp lý</h2>
            <ul className="doc-list">
              {DOCUMENTS.map(d => {
                const doc = r.documents.find(x => x.type === d.type);
                return (
                  <li key={d.type} className={doc ? 'ok' : ''}>
                    <div>
                      <b>{d.label}{d.required ? ' *' : ''}</b>
                      <small>{doc ? `${doc.originalName} · ${formatDateTime(doc.uploadedAt)}` : 'Chưa tải lên'}</small>
                    </div>
                    {doc && <button className="btn-outline" onClick={() => openDocument(d.type)}>Xem</button>}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ---------- Giờ mở cửa ---------- */}
          <section className="panel form-panel">
            <h2>Giờ mở cửa</h2>
            <dl className="info-list">
              {DAY_ORDER.map(d => {
                const slots = r.openingHours.filter(h => h.dayOfWeek === d);
                return (
                  <div key={d} className="info-pair">
                    <dt>{DAY_NAMES[d]}</dt>
                    <dd>{slots.length ? slots.map(s => `${s.open}–${s.close}`).join(', ') : <span className="muted">Nghỉ</span>}</dd>
                  </div>
                );
              })}
            </dl>
          </section>

          {/* ---------- Hoa hồng ---------- */}
          <form className="panel form-panel" onSubmit={submitCommission}>
            <h2>Hoa hồng nền tảng</h2>
            <div className="inline-form">
              <input inputMode="decimal" value={commission} onChange={e => setCommission(e.target.value.replace(/[^\d.,]/g, ''))} aria-label="Hoa hồng (%)" />
              <span>%</span>
              <button className="btn-soft" type="submit" disabled={busy}>Lưu</button>
            </div>
            <small className="muted">Tính trên mỗi đơn hoàn thành của quán.</small>
          </form>
        </div>
      </div>

      {/* ---------- Lịch sử ---------- */}
      <section className="panel form-panel">
        <h2>Lịch sử thao tác</h2>
        {logs.length === 0 ? (
          <p className="muted">Chưa có thao tác nào.</p>
        ) : (
          <ul className="log-list">
            {logs.map(l => (
              <li key={l.id}>
                <small>{formatDateTime(l.createdAt)}</small>
                <b>{AUDIT_ACTION_LABEL[l.action] ?? l.action}</b>
                <span>{describeChange(l.before, l.after)}</span>
                {l.note && <span className="muted">“{l.note}”</span>}
                <small className="muted">bởi {l.actor?.fullName ?? l.actorRole}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
