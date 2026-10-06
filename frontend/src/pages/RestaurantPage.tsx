import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { assetUrl, getErrorMessage } from '../api/client';
import { menuApi } from '../api/menu';
import AppHeader from '../components/AppHeader';
import CartDrawer from '../components/CartDrawer';
import FoodCard from '../components/FoodCard';
import ItemOptionsModal from '../components/ItemOptionsModal';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import type { MenuCategory, MenuItem, Restaurant } from '../types';
import { formatPrice } from '../utils/format';

const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Giờ mở cửa hôm nay (giờ VN), vd "06:00–10:00, 16:00–21:00" */
function todayHours(r: Restaurant) {
  const day = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })).getDay();
  const slots = r.openingHours.filter(h => h.dayOfWeek === day).map(h => `${h.open}–${h.close}`);
  return `${DAYS[day]}: ${slots.length ? slots.join(', ') : 'nghỉ'}`;
}

export default function RestaurantPage() {
  const { slug = '' } = useParams();
  const { user } = useAuth();
  const { count, subtotal } = useCart();
  const notify = useToast();
  const navigate = useNavigate();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [error, setError] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const closeCart = useCallback(() => setCartOpen(false), []);
  const [choosing, setChoosing] = useState<MenuItem | null>(null);
  const closeChooser = useCallback(() => setChoosing(null), []);

  useEffect(() => {
    let ignore = false;
    setRestaurant(null);
    setError('');
    menuApi.getRestaurantMenu(slug)
      .then(res => { if (!ignore) { setRestaurant(res.restaurant); setCategories(res.categories); } })
      .catch(err => { if (!ignore) setError(getErrorMessage(err)); });
    return () => { ignore = true; };
  }, [slug]);

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
      <AppHeader cart={{ count, onOpen: () => setCartOpen(true) }} />

      <main className="container menu-page">
        {error ? (
          <div className="empty-state">
            <h2>Không tìm thấy quán</h2>
            <p>{error}</p>
            <Link to="/menu" className="btn-soft">← Về thực đơn</Link>
          </div>
        ) : !restaurant ? (
          <div className="page-loading">Đang tải...</div>
        ) : (
          <>
            <section
              className="shop-hero"
              style={restaurant.coverUrl ? { backgroundImage: `url(${assetUrl(restaurant.coverUrl)})` } : undefined}
            >
              <div className="shop-hero-body">
                {restaurant.logoUrl && <img className="shop-logo" src={assetUrl(restaurant.logoUrl)} alt="" />}
                <div>
                  <span className={restaurant.canAcceptOrders ? 'open-badge' : 'open-badge closed'}>
                    <i /> {restaurant.canAcceptOrders ? 'Đang nhận đơn' : 'Tạm ngưng nhận đơn'}
                  </span>
                  <h1>{restaurant.name}</h1>
                  {restaurant.description && <p>{restaurant.description}</p>}
                </div>
              </div>
            </section>

            <ul className="shop-facts">
              <li><small>Địa chỉ</small><b>{restaurant.address}</b></li>
              <li><small>Giờ mở cửa</small><b>{todayHours(restaurant)}</b></li>
              <li><small>Giao hàng</small><b>Quán tự giao · Miễn phí</b></li>
              <li><small>Đơn tối thiểu</small><b>{restaurant.minOrderAmount ? formatPrice(restaurant.minOrderAmount) : 'Không'}</b></li>
              {restaurant.ratingCount > 0 && (
                <li><small>Đánh giá</small><b>★ {restaurant.ratingAvg.toFixed(1)} ({restaurant.ratingCount})</b></li>
              )}
            </ul>

            {categories.length === 0 ? (
              <div className="empty-state">
                <h2>Quán chưa có món nào</h2>
                <p>Quay lại sau nhé.</p>
              </div>
            ) : (
              <>
                <nav className="shop-chips cat-nav" aria-label="Danh mục">
                  {categories.map(c => <a key={c.id} href={`#cat-${c.id}`} className="chip">{c.name}</a>)}
                </nav>
                {categories.map(c => (
                  <section key={c.id} id={`cat-${c.id}`} className="cat-section">
                    <h2>{c.name} <small>{c.items.length} món</small></h2>
                    <div className="dish-grid">
                      {c.items.map(item => (
                        <FoodCard key={item.id} item={item} restaurant={restaurant} showShop={false} onChoose={setChoosing} />
                      ))}
                    </div>
                  </section>
                ))}
              </>
            )}
          </>
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
      {choosing && restaurant && <ItemOptionsModal item={choosing} restaurant={restaurant} onClose={closeChooser} />}
    </div>
  );
}
