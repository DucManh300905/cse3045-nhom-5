import { useCallback, useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { shipperApi } from '../../api/shipper';
import Logo from '../../components/Logo';
import NotificationBell from '../../components/NotificationBell';
import { useAuth } from '../../context/AuthContext';
import { useSocket, useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import type { ShipperProfile } from '../../types';
import { SHIPPER_STATUS_LABEL } from '../../utils/delivery';

interface ShipperContext {
  /** null = chưa tạo hồ sơ tài xế */
  profile: ShipperProfile | null;
  setProfile: (p: ShipperProfile) => void;
  reload: () => void;
}

/** Dùng trong các trang con của /shipper */
export const useShipper = () => useOutletContext<ShipperContext>();

const TABS = [
  { to: '/shipper', label: 'Làm việc', end: true },
  { to: '/shipper/shifts', label: 'Ca làm' },
  { to: '/shipper/history', label: 'Lịch sử' },
  { to: '/shipper/earnings', label: 'Thu nhập' },
  { to: '/shipper/profile', label: 'Hồ sơ' },
  { to: '/shipper/account', label: 'Tài khoản' },
];

/** App tài xế MAK — web chạy trên điện thoại (kế hoạch: PWA trước, chưa có app riêng) */
export default function ShipperLayout() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const notify = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [profile, setProfileState] = useState<ShipperProfile | null | undefined>(undefined);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    setError('');
    shipperApi.getProfile().then(setProfileState).catch(err => setError(getErrorMessage(err)));
  }, []);
  useEffect(reload, [reload]);
  const setProfile = useCallback((p: ShipperProfile) => setProfileState(p), []);

  // Admin duyệt / từ chối / khóa hồ sơ -> tải lại
  useSocketEvent('notification:new', n => {
    if ((n.type.startsWith('SHIPPER_') && n.type !== 'SHIPPER_EARNING') || n.type === 'PENALTY') reload();
  });

  return (
    <div className="app shipper-app">
      <header className="app-header">
        <div className="container header-row">
          <Logo />
          <span className="portal-tag">Tài xế MAK</span>
          <nav className="header-actions">
            {TABS.map(t => <NavLink key={t.to} to={t.to} end={t.end} className="nav-link">{t.label}</NavLink>)}
            {profile && <span className={`status-chip s-${profile.status}`}>{SHIPPER_STATUS_LABEL[profile.status]}</span>}
            <span className={connected ? 'live-dot on' : 'live-dot'} title={connected ? 'Đang kết nối realtime' : 'Mất kết nối — đang thử lại'} aria-hidden />
            <NotificationBell />
            <button
              className="btn-outline"
              onClick={() => { logout(); notify('Đã đăng xuất'); navigate('/', { replace: true }); }}
              title={user?.email || user?.phone}
            >
              Đăng xuất
            </button>
          </nav>
        </div>
        <nav className="container owner-tabs">
          {TABS.map(t => <NavLink key={t.to} to={t.to} end={t.end}>{t.label}</NavLink>)}
        </nav>
      </header>

      <main className="container page-body shipper-body">
        {error ? (
          <div className="empty-state">
            <h2>Không tải được hồ sơ tài xế</h2>
            <p>{error}</p>
            <button className="btn-soft" onClick={reload}>Thử lại</button>
          </div>
        ) : profile === undefined ? (
          <div className="page-loading">Đang tải...</div>
        ) : !profile && !['/shipper/profile', '/shipper/account'].includes(pathname) ? (
          // Chưa có hồ sơ: đi tạo hồ sơ trước
          <Navigate to="/shipper/profile" replace />
        ) : (
          <Outlet context={{ profile, setProfile, reload } satisfies ShipperContext} />
        )}
      </main>
    </div>
  );
}
