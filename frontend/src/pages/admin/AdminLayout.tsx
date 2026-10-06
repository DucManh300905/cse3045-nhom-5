import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Logo from '../../components/Logo';
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
            <NavLink to="/admin" end className="nav-link">Duyệt quán</NavLink>
            <NavLink to="/admin/audit-logs" className="nav-link">Nhật ký</NavLink>
            <button
              className="btn-outline"
              onClick={() => { logout(); notify('Đã đăng xuất'); navigate('/'); }}
              title={user?.email || user?.phone}
            >
              Đăng xuất
            </button>
          </nav>
        </div>
        <nav className="container owner-tabs">
          <NavLink to="/admin" end>Duyệt quán</NavLink>
          <NavLink to="/admin/audit-logs">Nhật ký</NavLink>
        </nav>
      </header>
      <main className="container page-body">
        <Outlet />
      </main>
    </div>
  );
}
