import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { merchantApi } from '../../api/merchant';
import Logo from '../../components/Logo';
import NotificationBell from '../../components/NotificationBell';
import { useAuth } from '../../context/AuthContext';
import { useSocket, useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import type { MerchantRestaurant } from '../../types';
import { chimeReady, playChime, unlockChime } from '../../utils/chime';
import { formatPrice } from '../../utils/format';
import { STATUS_LABEL } from '../../utils/labels';

interface OwnerContext {
  /** null = chủ quán chưa tạo quán */
  restaurant: MerchantRestaurant | null;
  setRestaurant: (r: MerchantRestaurant) => void;
  /** Số đơn đang chờ quán nhận */
  pendingCount: number;
  refreshPending: () => void;
}

/** Dùng trong các trang con của /owner */
export const useOwner = () => useOutletContext<OwnerContext>();

export default function OwnerLayout() {
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const notify = useToast();
  const navigate = useNavigate();
  const [restaurant, setRestaurantState] = useState<MerchantRestaurant | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [soundOn, setSoundOn] = useState(chimeReady());

  const load = useCallback(() => {
    setError('');
    merchantApi.getRestaurant()
      .then(setRestaurantState)
      .catch(err => setError(getErrorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const setRestaurant = useCallback((r: MerchantRestaurant) => setRestaurantState(r), []);

  const hasRestaurant = !!restaurant;
  const refreshPending = useCallback(() => {
    if (!hasRestaurant) return;
    merchantApi.listOrders({ status: ['PLACED'], limit: 1 })
      .then(res => setPendingCount(res.total))
      .catch(() => {});
  }, [hasRestaurant]);
  useEffect(refreshPending, [refreshPending]);

  // Vừa tạo quán sau khi đã kết nối -> kết nối lại để server cho vào phòng của quán
  // (restaurant: undefined = đang tải, null = chưa có quán)
  const restaurantId = restaurant === undefined ? undefined : restaurant?.id ?? null;
  const prevRestaurantId = useRef(restaurantId);
  useEffect(() => {
    if (prevRestaurantId.current === null && restaurantId) socket?.disconnect().connect();
    prevRestaurantId.current = restaurantId;
  }, [socket, restaurantId]);

  // Đơn mới: kêu chuông ở mọi trang của kênh chủ quán (I2)
  useSocketEvent('order:new', e => {
    playChime();
    notify(`🔔 Đơn mới ${e.code} · ${e.itemsCount} món · ${formatPrice(e.total)}`);
    refreshPending();
  });
  useSocketEvent('order:status_changed', () => refreshPending());
  useSocketEvent('reconnected', () => refreshPending());

  // Admin duyệt / từ chối / khóa hồ sơ
  useSocketEvent('restaurant:status_changed', e => {
    notify(`Hồ sơ quán: ${STATUS_LABEL[e.status as keyof typeof STATUS_LABEL] ?? e.status}${e.rejectReason ? ` — ${e.rejectReason}` : ''}`);
    load();
  });

  const enableSound = async () => {
    const ok = await unlockChime();
    setSoundOn(ok);
    if (ok) playChime(1);
    else notify('Trình duyệt không hỗ trợ phát âm thanh');
  };

  const ordersLabel = (
    <>Đơn hàng{pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}</>
  );

  return (
    <div className="app owner-app">
      <header className="app-header">
        <div className="container header-row">
          <Logo />
          <span className="portal-tag">Kênh chủ quán</span>
          <nav className="header-actions">
            <NavLink to="/owner" end className="nav-link">Hồ sơ quán</NavLink>
            <NavLink to="/owner/menu" className="nav-link">Thực đơn</NavLink>
            <NavLink to="/owner/orders" className="nav-link">{ordersLabel}</NavLink>
            <NavLink to="/owner/reviews" className="nav-link">Đánh giá</NavLink>
            <NavLink to="/owner/dashboard" className="nav-link">Thống kê</NavLink>
            <NavLink to="/owner/account" className="nav-link">Tài khoản</NavLink>
            {restaurant && <span className={`status-chip s-${restaurant.status}`}>{STATUS_LABEL[restaurant.status]}</span>}
            {restaurant && (
              <button
                className={soundOn ? 'btn-outline sound-on' : 'btn-outline sound-off'}
                onClick={enableSound}
                title={connected ? 'Đang kết nối nhận đơn realtime' : 'Mất kết nối — đang thử kết nối lại'}
              >
                <span className={connected ? 'live-dot on' : 'live-dot'} aria-hidden />
                {soundOn ? 'Âm báo bật' : 'Bật âm báo'}
              </button>
            )}
            <NotificationBell />
            <button
              className="btn-outline"
              // Đăng xuất -> về trang đầu; replace để nút Back không quay lại trang cần đăng nhập
              onClick={() => { logout(); notify('Đã đăng xuất'); navigate('/', { replace: true }); }}
              title={user?.email || user?.phone}
            >
              Đăng xuất
            </button>
          </nav>
        </div>
        {/* Điện thoại: thanh điều hướng riêng vì .nav-link bị ẩn */}
        <nav className="container owner-tabs">
          <NavLink to="/owner" end>Hồ sơ quán</NavLink>
          <NavLink to="/owner/menu">Thực đơn</NavLink>
          <NavLink to="/owner/orders">{ordersLabel}</NavLink>
          <NavLink to="/owner/reviews">Đánh giá</NavLink>
          <NavLink to="/owner/dashboard">Thống kê</NavLink>
          <NavLink to="/owner/account">Tài khoản</NavLink>
        </nav>
      </header>

      <main className="container page-body">
        {error ? (
          <div className="empty-state">
            <h2>Không tải được thông tin quán</h2>
            <p>{error}</p>
            <button className="btn-soft" onClick={load}>Thử lại</button>
          </div>
        ) : restaurant === undefined ? (
          <div className="page-loading">Đang tải...</div>
        ) : (
          <Outlet context={{ restaurant, setRestaurant, pendingCount, refreshPending } satisfies OwnerContext} />
        )}
      </main>
    </div>
  );
}
