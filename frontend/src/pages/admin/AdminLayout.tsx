import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Logo from '../../components/Logo';
import NotificationBell from '../../components/NotificationBell';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();

  return (
    <div className="app">
      <header className="app-header">
        <div className="container header-row">
          <Logo />
          <span className="portal-tag">Quản trị</span>
          <nav className="header-actions">
            <NavLink to="/admin/stats" className="nav-link">Thống kê</NavLink>
            <NavLink to="/admin" end className="nav-link">Duyệt quán</NavLink>
            <NavLink to="/admin/users" className="nav-link">Người dùng</NavLink>
            <NavLink to="/admin/orders" className="nav-link">Đơn hàng</NavLink>
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
          <NavLink to="/admin" end>Duyệt quán</NavLink>
          <NavLink to="/admin/users">Người dùng</NavLink>
          <NavLink to="/admin/orders">Đơn hàng</NavLink>
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
