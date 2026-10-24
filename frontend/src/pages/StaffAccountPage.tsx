import { ProfilePanel, PasswordPanel } from './AccountPage';

/** Tài khoản của chủ quán / admin (trong layout của kênh đó): sửa hồ sơ, đổi mật khẩu — không có sổ địa chỉ */
export default function StaffAccountPage() {
  return (
    <div className="narrow-body">
      <h1 className="page-title">Tài khoản</h1>
      <div className="account-grid">
        <ProfilePanel />
        <PasswordPanel />
      </div>
      <p className="muted small">Quên mật khẩu? Đăng xuất rồi bấm "Quên mật khẩu?" ở trang đăng nhập để nhận mã qua email.</p>
    </div>
  );
}
