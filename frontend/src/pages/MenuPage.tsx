import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import CartDrawer from '../components/CartDrawer';
import FoodCard from '../components/FoodCard';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { DISHES, SHOPS } from '../data/menu';
import { formatPrice, normalizeText } from '../utils/format';

type Category = 'ALL' | 'FOOD' | 'DRINK';
type Sort = 'suggested' | 'price-asc' | 'price-desc' | 'prep';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'FOOD', label: 'Món ăn' },
  { value: 'DRINK', label: 'Đồ uống' },
];

export default function MenuPage() {
  const { user } = useAuth();
  const { count, subtotal } = useCart();
  const notify = useToast();
  const navigate = useNavigate();

  // Từ khóa tìm kiếm nằm trên URL (?q=) để có thể chia sẻ / quay lại
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const [category, setCategory] = useState<Category>('ALL');
  const [shop, setShop] = useState('ALL');
  const [sort, setSort] = useState<Sort>('suggested');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const closeCart = useCallback(() => setCartOpen(false), []);

  const setQuery = (q: string) => {
    const next = new URLSearchParams(params);
    if (q) next.set('q', q); else next.delete('q');
    setParams(next, { replace: true });
  };

  const dishes = useMemo(() => {
    const q = normalizeText(query);
    const list = DISHES.filter(d =>
      (category === 'ALL' || d.category === category) &&
      (shop === 'ALL' || d.shop === shop) &&
      (!inStockOnly || d.stock > 0) &&
      (!q || normalizeText(`${d.name} ${d.description} ${d.shop}`).includes(q))
    );
    return [...list].sort((a, b) => {
      // Món hết hàng luôn xuống cuối
      const s = Number(b.stock > 0) - Number(a.stock > 0);
      if (s) return s;
      if (sort === 'price-asc') return a.price - b.price;
      if (sort === 'price-desc') return b.price - a.price;
      if (sort === 'prep') return a.prepMinutes - b.prepMinutes;
      return b.popularity - a.popularity;
    });
  }, [query, category, shop, sort, inStockOnly]);

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

  return (
    <div className="app">
      <AppHeader search={{ value: query, onChange: setQuery }} cart={{ count, onOpen: () => setCartOpen(true) }} />

      <main className="container menu-page">
        <section className="welcome">
          <div>
            <span className="open-badge"><i /> Đang nhận đơn</span>
            <h1>{user ? `Chào ${user.fullName.split(' ').pop()}, hôm nay ăn gì?` : 'Hôm nay ăn gì nhỉ?'}</h1>
            <p>{DISHES.filter(d => d.stock > 0).length} món đang sẵn sàng từ {SHOPS.length} quán quanh bạn.</p>
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
                <option value="suggested">Gợi ý cho bạn</option>
                <option value="price-asc">Giá thấp → cao</option>
                <option value="price-desc">Giá cao → thấp</option>
                <option value="prep">Làm nhanh nhất</option>
              </select>
            </label>
          </div>
        </section>

        <div className="shop-chips" aria-label="Chọn quán">
          {['ALL', ...SHOPS].map(s => (
            <button key={s} className={shop === s ? 'chip active' : 'chip'} onClick={() => setShop(s)}>
              {s === 'ALL' ? 'Tất cả quán' : s}
            </button>
          ))}
        </div>

        <div className="result-line">
          <span><b>{dishes.length}</b> món{query && <> cho “{query}”</>}</span>
          {filtered && <button className="link-btn" onClick={resetFilters}>Xóa bộ lọc</button>}
        </div>

        {dishes.length ? (
          <div className="dish-grid">
            {dishes.map(d => <FoodCard key={d.id} dish={d} />)}
          </div>
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
    </div>
  );
}
