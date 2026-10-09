import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { reportsApi } from '../../api/reports';
import { useToast } from '../../context/ToastContext';
import type { AdminUser, Paginated, Role } from '../../types';
import { formatDateTime } from '../../utils/format';

const ROLE_LABEL: Record<Role, string> = { CUSTOMER: 'Khách', RESTAURANT_OWNER: 'Chủ quán', ADMIN: 'Admin' };
const PAGE_SIZE = 20;

/** Admin quản lý người dùng (API-9): tìm, lọc, khóa / mở (không khóa được admin) */
export default function AdminUsersPage() {
  const notify = useToast();
  const [params, setParams] = useSearchParams();
  const role = (params.get('role') as Role | null) ?? undefined;
  const status = (params.get('status') as 'ACTIVE' | 'BLOCKED' | null) ?? undefined;
  const q = params.get('q') ?? '';
  const page = Number(params.get('page')) || 1;
  const [search, setSearch] = useState(q);
  const [data, setData] = useState<Paginated<AdminUser> | null>(null);
  const [error, setError] = useState('');
  /** Người đang mở ô nhập lý do khóa */
  const [blocking, setBlocking] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  const load = useCallback(() => {
    reportsApi.listUsers({ role, status, q: q || undefined, page, limit: PAGE_SIZE })
      .then(d => { setData(d); setError(''); })
      .catch(err => setError(getErrorMessage(err)));
  }, [role, status, q, page]);
  useEffect(load, [load]);

  const setBlocked = async (u: AdminUser, blocked: boolean) => {
    if (blocked && !window.confirm(`Khóa tài khoản ${u.fullName}?${u.role === 'RESTAURANT_OWNER' ? ' Quán của họ sẽ tắt nhận đơn.' : ''}`)) return;
    setBusy(true);
    try {
      await reportsApi.setUserBlocked(u.id, blocked, blocked ? reason.trim() || undefined : undefined);
      notify(blocked ? `Đã khóa ${u.fullName}` : `Đã mở khóa ${u.fullName}`);
      setBlocking(null);
      setReason('');
      load();
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <h1 className="page-title">Người dùng</h1>

      <section className="toolbar admin-toolbar">
        <div className="cat-tabs" role="tablist">
          {([['', 'Tất cả'], ['CUSTOMER', 'Khách'], ['RESTAURANT_OWNER', 'Chủ quán'], ['ADMIN', 'Admin']] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={(role ?? '') === k} className={(role ?? '') === k ? 'active' : ''} onClick={() => update({ role: k, page: '' })}>
              {label}
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <label className="switch">
            <input type="checkbox" checked={status === 'BLOCKED'} onChange={e => update({ status: e.target.checked ? 'BLOCKED' : '', page: '' })} />
            <span className="switch-track" aria-hidden />
            <span>Chỉ tài khoản bị khóa</span>
          </label>
          <form className="admin-search" onSubmit={e => { e.preventDefault(); update({ q: search.trim(), page: '' }); }}>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tên, email, SĐT..." />
            <button className="btn-soft" type="submit">Tìm</button>
          </form>
        </div>
      </section>

      {error ? (
        <div className="empty-state"><h2>Không tải được</h2><p>{error}</p></div>
      ) : !data ? (
        <div className="page-loading">Đang tải...</div>
      ) : data.items.length === 0 ? (
        <div className="empty-state"><h2>Không có người dùng nào</h2></div>
      ) : (
        <>
          <p className="result-line"><span><b>{data.total}</b> người dùng</span></p>
          <div className="panel table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Họ tên</th><th>Liên hệ</th><th>Vai trò</th><th>Ngày tạo</th><th>Trạng thái</th><th></th></tr>
              </thead>
              <tbody>
                {data.items.map(u => (
                  <tr key={u.id} className={u.status === 'BLOCKED' ? 'row-blocked' : undefined}>
                    <td>
                      <b>{u.fullName}</b>
                      {u.restaurant && <><br /><Link to={`/admin/restaurants/${u.restaurant.id}`} className="link-btn small">{u.restaurant.name}</Link></>}
                    </td>
                    <td>
                      {u.email && <>{u.email}{u.emailVerified && <span className="tag" title="Email đã xác thực OTP">✓</span>}<br /></>}
                      {u.phone && <small className="muted">{u.phone}</small>}
                    </td>
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td className="nowrap">{formatDateTime(u.createdAt)}</td>
                    <td>
                      <span className={u.status === 'ACTIVE' ? 'status-chip s-APPROVED' : 'status-chip s-BLOCKED'}>
                        {u.status === 'ACTIVE' ? 'Hoạt động' : 'Bị khóa'}
                      </span>
                    </td>
                    <td className="nowrap">
                      {u.role === 'ADMIN' ? null : u.status === 'BLOCKED' ? (
                        <button className="btn-outline" disabled={busy} onClick={() => setBlocked(u, false)}>Mở khóa</button>
                      ) : blocking === u.id ? (
                        <span className="inline-form">
                          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Lý do (không bắt buộc)" maxLength={500} autoFocus />
                          <button className="btn-primary danger" disabled={busy} onClick={() => setBlocked(u, true)}>Khóa</button>
                          <button className="link-btn" onClick={() => setBlocking(null)}>Hủy</button>
                        </span>
                      ) : (
                        <button className="btn-outline danger-outline" onClick={() => { setBlocking(u.id); setReason(''); }}>Khóa</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
