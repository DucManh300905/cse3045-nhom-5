import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../api/client';
import { menuApi, type MenuItemQuery } from '../api/menu';
import AppHeader from '../components/AppHeader';
import CartDrawer from '../components/CartDrawer';
import FoodCard from '../components/FoodCard';
import ItemOptionsModal from '../components/ItemOptionsModal';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import type { MenuItem, Restaurant, RestaurantSummary } from '../types';
import { formatPrice } from '../utils/format';

type Category = 'ALL' | 'FOOD' | 'DRINK';
type Sort = NonNullable<MenuItemQuery['sort']>;

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'FOOD', label: 'Món ăn' },
  { value: 'DRINK', label: 'Đồ uống' },
];
const PAGE_SIZE = 24;

/** Giá trị trễ một nhịp, để không gọi API sau mỗi phím gõ */
function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function MenuPage() {
  const { user } = useAuth();
  const { count, subtotal } = useCart();
  const notify = useToast();
  const navigate = useNavigate();

  // Từ khóa tìm kiếm nằm trên URL (?q=) để có thể chia sẻ / quay lại
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const debouncedQuery = useDebounced(query.trim());
  const [category, setCategory] = useState<Category>('ALL');
  const [shop, setShop] = useState('ALL');
  const [sort, setSort] = useState<Sort>('popular');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const closeCart = useCallback(() => setCartOpen(false), []);
  const [choosing, setChoosing] = useState<{ item: MenuItem; restaurant: RestaurantSummary } | null>(null);
  const closeChooser = useCallback(() => setChoosing(null), []);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    menuApi.listRestaurants({ limit: 100, sort: 'name' })
      .then(r => setRestaurants(r.items))
      .catch(() => setRestaurants([]));
  }, []);

  // Đổi bộ lọc -> tải lại từ trang 1; "Xem thêm" -> nối trang tiếp theo
  const filters = useMemo<MenuItemQuery>(() => ({
    q: debouncedQuery || undefined,
    type: category === 'ALL' ? undefined : category,
    restaurant: shop === 'ALL' ? undefined : shop,
    inStock: inStockOnly,
    sort,
    limit: PAGE_SIZE,
  }), [debouncedQuery, category, shop, inStockOnly, sort]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    menuApi.listMenuItems({ ...filters, page })
      .then(res => {
        if (ignore) return;
        setItems(prev => (page === 1 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
      })
      .catch(err => { if (!ignore) setError(getErrorMessage(err)); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [filters, page, reloadKey]);

  // Bộ lọc đổi thì quay về trang 1 (cùng lần render với filters mới)
  const [prevFilters, setPrevFilters] = useState(filters);
  if (prevFilters !== filters) {
    setPrevFilters(filters);
    setPage(1);
  }

  const setQuery = (q: string) => {
    const next = new URLSearchParams(params);
    if (q) next.set('q', q); else next.delete('q');
    setParams(next, { replace: true });
  };

  const filtered = query || category !== 'ALL' || shop !== 'ALL' || inStockOnly;
  const resetFilters = () => {
    setQuery('');
    setCategory('ALL');
    setShop('ALL');
    setInStockOnly(false);
  };

  // Chưa đăng nhập -> chuyển sang trang đăng nhập, xong quay lại trang đặt món
  const goCheckout = () => {
    setCartOpen(false);
    if (!user) {
      notify('Vui lòng đăng nhập hoặc tạo tài khoản để đặt món');
      navigate('/login', { state: { from: '/checkout' } });
      return;
    }
    navigate('/checkout');
  };

  const openCount = restaurants.filter(r => r.canAcceptOrders).length;

  return (
    <div className="app">
      <AppHeader search={{ value: query, onChange: setQuery }} cart={{ count, onOpen: () => setCartOpen(true) }} />

      <main className="container menu-page">
        <section className="welcome">
          <div>
            {openCount > 0 && <span className="open-badge"><i /> {openCount} quán đang nhận đơn</span>}
            <h1>{user ? `Chào ${user.fullName.split(' ').pop()}, hôm nay ăn gì?` : 'Hôm nay ăn gì nhỉ?'}</h1>
            <p>Món ngon từ {restaurants.length || 'các'} quán quanh Hòa Lạc.</p>
          </div>
        </section>

        <section className="toolbar" aria-label="Bộ lọc">
          <div className="cat-tabs" role="tablist">
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                role="tab"
                aria-selected={category === c.value}
                className={category === c.value ? 'active' : ''}
                onClick={() => setCategory(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="toolbar-right">
            <label className="switch">
              <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} />
              <span className="switch-track" aria-hidden />
              <span>Chỉ món còn hàng</span>
            </label>
            <label className="sort">
              <span className="sr-only">Sắp xếp</span>
              <select value={sort} onChange={e => setSort(e.target.value as Sort)}>
                <option value="popular">Bán chạy nhất</option>
                <option value="price">Giá thấp → cao</option>
                <option value="-price">Giá cao → thấp</option>
                <option value="newest">Món mới</option>
              </select>
            </label>
          </div>
        </section>

        {restaurants.length > 0 && (
          <div className="shop-chips" aria-label="Chọn quán">
            <button className={shop === 'ALL' ? 'chip active' : 'chip'} onClick={() => setShop('ALL')}>Tất cả quán</button>
            {restaurants.map(r => (
              <button key={r.id} className={shop === r.id ? 'chip active' : 'chip'} onClick={() => setShop(r.id)}>
                {r.name}
              </button>
            ))}
          </div>
        )}

        <div className="result-line">
          <span><b>{total}</b> món{debouncedQuery && <> cho “{debouncedQuery}”</>}</span>
          {filtered && <button className="link-btn" onClick={resetFilters}>Xóa bộ lọc</button>}
        </div>

        {error ? (
          <div className="empty-state">
            <h2>Không tải được thực đơn</h2>
            <p>{error}</p>
            <button className="btn-soft" onClick={() => setReloadKey(k => k + 1)}>Thử lại</button>
          </div>
        ) : items.length ? (
          <>
            <div className="dish-grid">
              {items.map(d => d.restaurant && (
                <FoodCard key={d.id} item={d} restaurant={d.restaurant} onChoose={(item, restaurant) => setChoosing({ item, restaurant })} />
              ))}
            </div>
            {items.length < total && (
              <div className="load-more">
                <button className="btn-soft" onClick={() => setPage(p => p + 1)} disabled={loading}>
                  {loading ? 'Đang tải...' : 'Xem thêm món'}
                </button>
              </div>
            )}
          </>
        ) : loading ? (
          <div className="page-loading">Đang tải thực đơn...</div>
        ) : (
          <div className="empty-state">
            <h2>Không tìm thấy món phù hợp</h2>
            <p>Thử từ khóa khác hoặc bỏ bớt bộ lọc nhé.</p>
            <button className="btn-soft" onClick={resetFilters}>Xóa bộ lọc</button>
          </div>
        )}
      </main>

      {count > 0 && !cartOpen && (
        <button className="cart-bar" onClick={() => setCartOpen(true)}>
          <span className="cart-bar-count">{count}</span>
          <span>Xem giỏ hàng</span>
          <b>{formatPrice(subtotal)}</b>
        </button>
      )}

      <CartDrawer open={cartOpen} onClose={closeCart} onCheckout={goCheckout} />
      {choosing && <ItemOptionsModal item={choosing.item} restaurant={choosing.restaurant} onClose={closeChooser} />}
    </div>
  );
}
