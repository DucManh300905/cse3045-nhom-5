import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { adminApi } from '../../api/admin';
import type { AdminRestaurant, Paginated, RestaurantStatus } from '../../types';
import { formatDateTime } from '../../utils/format';
import { STATUS_LABEL } from '../../utils/labels';

type Filter = RestaurantStatus | 'ALL';
const FILTERS: Filter[] = ['SUBMITTED', 'APPROVED', 'REJECTED', 'BLOCKED', 'DRAFT', 'ALL'];
const PAGE_SIZE = 20;

/** Danh sách hồ sơ quán; mặc định "Chờ duyệt", nộp trước xếp trước */
export default function AdminRestaurantsPage() {
  // Bộ lọc nằm trên URL để quay lại từ trang chi tiết vẫn giữ nguyên
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as Filter | null) ?? 'SUBMITTED';
  const page = Number(params.get('page')) || 1;
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);
  const [data, setData] = useState<Paginated<AdminRestaurant> | null>(null);
  const [error, setError] = useState('');

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  useEffect(() => {
    let ignore = false;
    setError('');
    adminApi.listRestaurants({ status, q: q || undefined, page, limit: PAGE_SIZE })
      .then(res => { if (!ignore) setData(res); })
      .catch(err => { if (!ignore) setError(getErrorMessage(err)); });
    return () => { ignore = true; };
  }, [status, q, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <h1 className="page-title">Hồ sơ quán</h1>

      <section className="toolbar admin-toolbar">
        <div className="cat-tabs" role="tablist">
          {FILTERS.map(f => (
            <button
              key={f}
              role="tab"
              aria-selected={status === f}
              className={status === f ? 'active' : ''}
              onClick={() => update({ status: f === 'SUBMITTED' ? '' : f, page: '' })}
            >
              {f === 'ALL' ? 'Tất cả' : STATUS_LABEL[f]}
            </button>
          ))}
        </div>
        <form onSubmit={e => { e.preventDefault(); update({ q: search.trim(), page: '' }); }} className="admin-search">
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tên quán, SĐT, địa chỉ..." />
          <button className="btn-soft" type="submit">Tìm</button>
        </form>
      </section>

      {error ? (
        <div className="empty-state"><h2>Không tải được danh sách</h2><p>{error}</p></div>
      ) : !data ? (
        <div className="page-loading">Đang tải...</div>
      ) : data.items.length === 0 ? (
        <div className="empty-state">
          <h2>{status === 'SUBMITTED' ? 'Không có hồ sơ nào chờ duyệt' : 'Không có quán nào'}</h2>
          <p>{q ? `Không tìm thấy kết quả cho “${q}”.` : 'Danh sách trống.'}</p>
        </div>
      ) : (
        <>
          <p className="result-line"><span><b>{data.total}</b> quán</span></p>
          <ul className="admin-list">
            {data.items.map(r => (
              <li key={r.id}>
                <Link to={`/admin/restaurants/${r.id}`} className="panel admin-row">
                  <div className="admin-row-main">
                    <b>{r.name}</b>
                    <small>{r.address} · {r.phone}</small>
                    <small>Chủ quán: {r.owner ? `${r.owner.fullName} (${r.owner.email || r.owner.phone})` : '—'}</small>
                  </div>
                  <div className="admin-row-side">
                    <span className={`status-chip s-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                    <small>
                      {r.status === 'SUBMITTED' && r.submittedAt
                        ? `Nộp ${formatDateTime(r.submittedAt)}`
                        : `Tạo ${formatDateTime(r.createdAt)}`}
                    </small>
                    <small>{r.documents.length} giấy tờ</small>
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
