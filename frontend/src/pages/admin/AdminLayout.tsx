import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Logo from '../../components/Logo';
import NotificationBell from '../../components/NotificationBell';
import { useAuth } from '../../context/AuthContext';
import { MenuBadge, useMarkCurrentSeen } from '../../context/BadgeContext';
import { useToast } from '../../context/ToastContext';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  // Mở mục nào thì thông báo của mục đó coi như đã xem (Ví đối soát: theo từng tab, trong AdminWalletsPage)
  useMarkCurrentSeen(useLocation().pathname, ['wallets']);

  return (
    <div className="app">
      <header className="app-header">
        <div className="container header-row">
          <Logo />
          <span className="portal-tag">Quản trị</span>
          <nav className="header-actions">
            <NavLink to="/admin/stats" className="nav-link">Thống kê</NavLink>
            <NavLink to="/admin" end className="nav-link">Duyệt quán<MenuBadge k="restaurants" /></NavLink>
            <NavLink to="/admin/users" className="nav-link">Người dùng</NavLink>
            <NavLink to="/admin/orders" className="nav-link">Đơn hàng</NavLink>
            <NavLink to="/admin/shippers" className="nav-link">Tài xế<MenuBadge k="shippers" /></NavLink>
            <NavLink to="/admin/dispatch" className="nav-link">Điều phối<MenuBadge k="dispatch" /></NavLink>
            <NavLink to="/admin/shifts" className="nav-link">Ca tài xế<MenuBadge k="shifts" /></NavLink>
            <NavLink to="/admin/wallets" className="nav-link">Ví đối soát<MenuBadge k="wallets" /></NavLink>
            <NavLink to="/admin/vouchers" className="nav-link">Voucher</NavLink>
            <NavLink to="/admin/reviews" className="nav-link">Đánh giá</NavLink>
            <NavLink to="/admin/audit-logs" className="nav-link">Nhật ký</NavLink>
            <NavLink to="/admin/account" className="nav-link">Tài khoản</NavLink>
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
        <nav className="container owner-tabs">
          <NavLink to="/admin/stats">Thống kê</NavLink>
          <NavLink to="/admin" end>Duyệt quán<MenuBadge k="restaurants" /></NavLink>
          <NavLink to="/admin/users">Người dùng</NavLink>
          <NavLink to="/admin/orders">Đơn hàng</NavLink>
          <NavLink to="/admin/shippers">Tài xế<MenuBadge k="shippers" /></NavLink>
          <NavLink to="/admin/dispatch">Điều phối<MenuBadge k="dispatch" /></NavLink>
          <NavLink to="/admin/shifts">Ca tài xế<MenuBadge k="shifts" /></NavLink>
          <NavLink to="/admin/wallets">Ví đối soát<MenuBadge k="wallets" /></NavLink>
          <NavLink to="/admin/vouchers">Voucher</NavLink>
          <NavLink to="/admin/reviews">Đánh giá</NavLink>
          <NavLink to="/admin/audit-logs">Nhật ký</NavLink>
          <NavLink to="/admin/account">Tài khoản</NavLink>
        </nav>
      </header>
      <main className="container page-body">
        <Outlet />
      </main>
    </div>
  );
}
