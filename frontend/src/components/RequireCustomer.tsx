import RequireRole from './RequireRole';

/** Trang của khách hàng: chưa đăng nhập thì sang /login, xong quay lại đúng trang này */
export default function RequireCustomer() {
  return <RequireRole role="CUSTOMER" loginPath="/login" />;
}
