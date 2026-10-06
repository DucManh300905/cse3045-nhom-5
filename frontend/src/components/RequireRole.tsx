import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../types';
import { LogoMark } from './Logo';

const ROLE_LABEL: Record<Role, string> = {
  CUSTOMER: 'khách hàng',
  RESTAURANT_OWNER: 'chủ quán',
  ADMIN: 'quản trị viên',
};

/**
 * Chưa đăng nhập -> chuyển tới trang đăng nhập, xong quay lại đúng trang này.
 * Đăng nhập sai vai trò -> báo và cho đăng xuất để đổi tài khoản.
 */
export default function RequireRole({ role, loginPath }: { role: Role; loginPath: string }) {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  if (loading) return <div className="page-loading">Đang tải...</div>;
  if (!user) return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  if (user.role !== role) {
    return (
      <main className="coming-soon">
        <LogoMark size={120} />
        <h1>Không đúng loại tài khoản</h1>
        <p>
          Bạn đang đăng nhập bằng tài khoản {ROLE_LABEL[user.role]} ({user.email || user.phone}).<br />
          Trang này dành cho {ROLE_LABEL[role]}.
        </p>
        <div className="form-actions">
          <Link to="/" className="btn-outline">Về trang chủ</Link>
          <button className="btn-primary" onClick={logout}>Đăng xuất để đổi tài khoản</button>
        </div>
      </main>
    );
  }
  return <Outlet />;
}
