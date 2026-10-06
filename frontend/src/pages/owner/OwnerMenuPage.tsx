import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { merchantApi } from '../../api/merchant';
import DishImage from '../../components/DishImage';
import { useToast } from '../../context/ToastContext';
import type { MerchantCategory, MerchantMenuItem } from '../../types';
import { formatPrice, normalizeText } from '../../utils/format';
import MenuItemEditor from './MenuItemEditor';
import { useOwner } from './OwnerLayout';

const ALL = 'ALL';

export default function OwnerMenuPage() {
  const { restaurant } = useOwner();
  const notify = useToast();
  const [categories, setCategories] = useState<MerchantCategory[]>([]);
  const [items, setItems] = useState<MerchantMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(ALL);
  const [query, setQuery] = useState('');
  const [newCategory, setNewCategory] = useState('');
  /** null = đóng, 'new' = thêm món, còn lại = món đang sửa */
  const [editing, setEditing] = useState<MerchantMenuItem | 'new' | null>(null);
  const closeEditor = useCallback(() => setEditing(null), []);

  const readOnly = restaurant?.status === 'BLOCKED';

  const load = useCallback(async () => {
    try {
      const [cats, list] = await Promise.all([merchantApi.listCategories(), merchantApi.listMenuItems()]);
      setCategories(cats);
      setItems(list);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (restaurant) load();
  }, [restaurant, load]);

  /** Chạy thao tác, báo lỗi bằng toast, xong tải lại danh sách */
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) notify(ok);
    } catch (err) {
      notify(getErrorMessage(err));
    }
    await load();
  };

  if (!restaurant) {
    return (
      <div className="empty-state">
        <h2>Bạn chưa có quán</h2>
        <p>Tạo hồ sơ quán trước, sau đó quay lại soạn thực đơn.</p>
        <Link to="/owner" className="btn-primary">Tạo quán</Link>
      </div>
    );
  }
  if (loading) return <div className="page-loading">Đang tải thực đơn...</div>;
  if (error) {
    return (
      <div className="empty-state">
        <h2>Không tải được thực đơn</h2>
        <p>{error}</p>
        <button className="btn-soft" onClick={load}>Thử lại</button>
      </div>
    );
  }

  // ---------- danh mục ----------
  const addCategory = (e: FormEvent) => {
    e.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    act(async () => {
      const c = await merchantApi.createCategory(name);
      setNewCategory('');
      setSelected(c.id);
    }, `Đã thêm danh mục ${name}`);
  };

  const renameCategory = (c: MerchantCategory) => {
    const name = window.prompt('Tên mới của danh mục', c.name)?.trim();
    if (name && name !== c.name) act(() => merchantApi.updateCategory(c.id, { name }), 'Đã đổi tên danh mục');
  };

  const deleteCategory = (c: MerchantCategory) => {
    if (c.itemCount > 0) return notify('Danh mục còn món — hãy chuyển hoặc xóa các món trước.');
    if (!window.confirm(`Xóa danh mục "${c.name}"?`)) return;
    act(async () => {
      await merchantApi.deleteCategory(c.id);
      if (selected === c.id) setSelected(ALL);
    }, 'Đã xóa danh mục');
  };

  const moveCategory = (index: number, delta: number) => {
    const ids = categories.map(c => c.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    act(() => merchantApi.reorderCategories(ids));
  };

  // ---------- món ----------
  const q = normalizeText(query);
  const visible = items.filter(i => (selected === ALL || i.category === selected) && (!q || normalizeText(i.name).includes(q)));
  const categoryName = (id: string) => categories.find(c => c.id === id)?.name ?? '';

  const toggleAvailable = (i: MerchantMenuItem) =>
    act(() => merchantApi.setAvailability(i.id, { isAvailable: !i.isAvailable }), i.isAvailable ? `Đã tạm ngưng bán ${i.name}` : `Đã mở bán ${i.name}`);

  const deleteItem = (i: MerchantMenuItem) => {
    if (window.confirm(`Xóa món "${i.name}"? Đơn cũ có món này vẫn được giữ nguyên.`)) {
      act(() => merchantApi.deleteMenuItem(i.id), 'Đã xóa món');
    }
  };

  const onSaved = () => {
    setEditing(null);
    notify('Đã lưu món');
    load();
  };

  return (
    <>
      <div className="owner-title-row">
        <h1 className="page-title">Thực đơn</h1>
        {!readOnly && (
          <button
            className="btn-primary"
            disabled={!categories.length}
            title={categories.length ? undefined : 'Tạo danh mục trước'}
            onClick={() => setEditing('new')}
          >
            + Thêm món
          </button>
        )}
      </div>
      {restaurant.status !== 'APPROVED' && (
        <p className="page-lead">Bạn có thể soạn thực đơn ngay; khách chỉ thấy món sau khi quán được duyệt.</p>
      )}
      {readOnly && <div className="form-error">Quán đang bị khóa — chỉ xem được thực đơn.</div>}

      <div className="menu-admin">
        <aside className="panel cat-panel">
          <h2>Danh mục</h2>
          <ul className="cat-list">
            <li className={selected === ALL ? 'active' : ''}>
              <button className="cat-name" onClick={() => setSelected(ALL)}>Tất cả món <small>{items.length}</small></button>
            </li>
            {categories.map((c, i) => (
              <li key={c.id} className={selected === c.id ? 'active' : ''}>
                <button className="cat-name" onClick={() => setSelected(c.id)}>
                  {c.name}{!c.isActive && <em className="tag muted-tag">Ẩn</em>} <small>{c.itemCount}</small>
                </button>
                {!readOnly && (
                  <span className="cat-actions">
                    <button className="icon-btn" onClick={() => moveCategory(i, -1)} disabled={i === 0} aria-label="Lên">↑</button>
                    <button className="icon-btn" onClick={() => moveCategory(i, 1)} disabled={i === categories.length - 1} aria-label="Xuống">↓</button>
                    <button className="icon-btn" onClick={() => renameCategory(c)} aria-label="Đổi tên" title="Đổi tên">✎</button>
                    <button
                      className="icon-btn"
                      onClick={() => act(() => merchantApi.updateCategory(c.id, { isActive: !c.isActive }), c.isActive ? 'Đã ẩn danh mục' : 'Đã hiện danh mục')}
                      title={c.isActive ? 'Ẩn với khách' : 'Hiện với khách'}
                      aria-label={c.isActive ? 'Ẩn' : 'Hiện'}
                    >
                      {c.isActive ? '◉' : '○'}
                    </button>
                    <button className="icon-btn danger" onClick={() => deleteCategory(c)} aria-label="Xóa" title="Xóa">×</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!readOnly && (
            <form className="cat-add" onSubmit={addCategory}>
              <input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="Tên danh mục mới" maxLength={100} />
              <button className="btn-soft" type="submit" disabled={!newCategory.trim()}>Thêm</button>
            </form>
          )}
        </aside>

        <section className="items-panel">
          <input type="search" className="items-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm món (không dấu cũng được)" />

          {!categories.length ? (
            <div className="empty-state">
              <h2>Bắt đầu bằng một danh mục</h2>
              <p>vd: "Cơm", "Món thêm", "Đồ uống". Thêm danh mục ở cột bên trái.</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty-state">
              <h2>{query ? 'Không có món phù hợp' : 'Chưa có món nào'}</h2>
              {!readOnly && !query && <button className="btn-soft" onClick={() => setEditing('new')}>+ Thêm món</button>}
            </div>
          ) : (
            <ul className="item-list">
              {visible.map(i => (
                <li key={i.id} className={i.isOrderable ? 'panel item-row' : 'panel item-row off'}>
                  <DishImage src={i.imageUrl} alt={i.name} className="item-thumb" />
                  <div className="item-info">
                    <b>{i.name}</b>
                    <small>
                      {selected === ALL && <>{categoryName(i.category)} · </>}
                      {i.variants.length > 1 ? `từ ${formatPrice(i.basePrice)} · ${i.variants.length} size` : formatPrice(i.basePrice)}
                      {i.optionGroups.length > 0 && ` · ${i.optionGroups.length} nhóm tùy chọn`}
                    </small>
                    <small className={i.remainingToday === 0 ? 'warn' : ''}>
                      {i.dailyLimit === null
                        ? `Không giới hạn suất · đã bán hôm nay ${i.soldToday}`
                        : `Đã bán ${i.soldToday}/${i.dailyLimit} suất hôm nay`}
                      {i.remainingToday === 0 && ' — hết suất'}
                    </small>
                  </div>
                  <label className="switch" title={i.isAvailable ? 'Đang bán' : 'Tạm hết'}>
                    <input type="checkbox" checked={i.isAvailable} disabled={readOnly} onChange={() => toggleAvailable(i)} />
                    <span className="switch-track" aria-hidden />
                    <span>{i.isAvailable ? 'Đang bán' : 'Tạm hết'}</span>
                  </label>
                  {!readOnly && (
                    <div className="item-actions">
                      <button className="btn-outline" onClick={() => setEditing(i)}>Sửa</button>
                      <button className="link-btn danger" onClick={() => deleteItem(i)}>Xóa</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {editing && (
        <MenuItemEditor
          item={editing === 'new' ? undefined : editing}
          categories={categories}
          defaultCategory={selected === ALL ? undefined : selected}
          onSaved={onSaved}
          onClose={closeEditor}
        />
      )}
    </>
  );
}
