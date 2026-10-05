import { Navigate, Route, Routes } from 'react-router-dom';
import RequireCustomer from './components/RequireCustomer';
import AuthPage from './pages/AuthPage';
import CheckoutPage from './pages/CheckoutPage';
import ComingSoonPage from './pages/ComingSoonPage';
import LandingPage from './pages/LandingPage';
import MenuPage from './pages/MenuPage';
import OrdersPage from './pages/OrdersPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      {/* Khách hàng: xem món và giỏ hàng không cần đăng nhập */}
      <Route path="/menu" element={<MenuPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route element={<RequireCustomer />}>
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders" element={<OrdersPage />} />
      </Route>

      {/* Chủ quán và quản trị viên: làm ở bước sau */}
      <Route path="/owner/*" element={<ComingSoonPage title="Trang chủ quán" />} />
      <Route path="/admin/*" element={<ComingSoonPage title="Trang quản trị" />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
