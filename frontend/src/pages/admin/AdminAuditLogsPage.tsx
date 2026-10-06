import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { adminApi } from '../../api/admin';
import type { AuditLog, Paginated } from '../../types';
import { formatDateTime } from '../../utils/format';
import { AUDIT_ACTION_LABEL, describeChange } from '../../utils/labels';

const PAGE_SIZE = 30;

/** Nhật ký thao tác quan trọng (BR-70) — chỉ đọc */
export default function AdminAuditLogsPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<AuditLog> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    setError('');
    adminApi.listAuditLogs({ action: action || undefined, page, limit: PAGE_SIZE })
      .then(res => { if (!ignore) setData(res); })
      .catch(err => { if (!ignore) setError(getErrorMessage(err)); });
    return () => { ignore = true; };
  }, [action, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <div className="owner-title-row">
        <h1 className="page-title">Nhật ký thao tác</h1>
        <label className="sort">
          <span className="sr-only">Lọc theo hành động</span>
          <select value={action} onChange={e => { setAction(e.target.value); setPage(1); }}>
            <option value="">Mọi hành động</option>
            {Object.entries(AUDIT_ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>

      {error ? (
        <div className="empty-state"><h2>Không tải được nhật ký</h2><p>{error}</p></div>
      ) : !data ? (
        <div className="page-loading">Đang tải...</div>
      ) : data.items.length === 0 ? (
        <div className="empty-state"><h2>Chưa có thao tác nào</h2></div>
      ) : (
        <>
          <div className="panel table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Thay đổi</th><th>Ghi chú</th></tr>
              </thead>
              <tbody>
                {data.items.map(l => (
                  <tr key={l.id}>
                    <td className="nowrap">{formatDateTime(l.createdAt)}</td>
                    <td>{l.actor ? <>{l.actor.fullName}<br /><small className="muted">{l.actor.email}</small></> : l.actorRole}</td>
                    <td>
                      {l.targetType === 'Restaurant'
                        ? <Link to={`/admin/restaurants/${l.targetId}`} className="link-btn">{AUDIT_ACTION_LABEL[l.action] ?? l.action}</Link>
                        : AUDIT_ACTION_LABEL[l.action] ?? l.action}
                    </td>
                    <td>{describeChange(l.before, l.after) || '—'}</td>
                    <td>{l.note || <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="pager">
              <button className="btn-outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Trước</button>
              <span>Trang {page}/{pages}</span>
              <button className="btn-outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Sau →</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
