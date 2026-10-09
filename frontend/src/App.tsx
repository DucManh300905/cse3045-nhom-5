import { Navigate, Route, Routes } from 'react-router-dom';
import RequireCustomer from './components/RequireCustomer';
import RequireRole from './components/RequireRole';
import AccountPage from './pages/AccountPage';
import AuthPage from './pages/AuthPage';
import CheckoutPage from './pages/CheckoutPage';
import LandingPage from './pages/LandingPage';
import MenuPage from './pages/MenuPage';
import OrdersPage from './pages/OrdersPage';
import RestaurantPage from './pages/RestaurantPage';
import StaffAccountPage from './pages/StaffAccountPage';
import AdminAuditLogsPage from './pages/admin/AdminAuditLogsPage';
import AdminOrdersPage from './pages/admin/AdminOrdersPage';
import AdminStatsPage from './pages/admin/AdminStatsPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminRestaurantDetailPage from './pages/admin/AdminRestaurantDetailPage';
import AdminRestaurantsPage from './pages/admin/AdminRestaurantsPage';
import AdminReviewsPage from './pages/admin/AdminReviewsPage';
import OwnerDashboardPage from './pages/owner/OwnerDashboardPage';
import OwnerLayout from './pages/owner/OwnerLayout';
import OwnerMenuPage from './pages/owner/OwnerMenuPage';
import OwnerOrdersPage from './pages/owner/OwnerOrdersPage';
import OwnerProfilePage from './pages/owner/OwnerProfilePage';
import OwnerReviewsPage from './pages/owner/OwnerReviewsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      {/* Khách hàng: xem quán, món và giỏ hàng không cần đăng nhập */}
      <Route path="/menu" element={<MenuPage />} />
      <Route path="/restaurants/:slug" element={<RestaurantPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route element={<RequireCustomer />}>
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/account" element={<AccountPage />} />
      </Route>

      {/* Chủ quán: hồ sơ quán, thực đơn, nhận đơn realtime (/api/merchant/*) */}
      <Route path="/owner/login" element={<AuthPage portal="owner" />} />
      <Route element={<RequireRole role="RESTAURANT_OWNER" loginPath="/owner/login" />}>
        <Route path="/owner" element={<OwnerLayout />}>
          <Route index element={<OwnerProfilePage />} />
          <Route path="menu" element={<OwnerMenuPage />} />
          <Route path="orders" element={<OwnerOrdersPage />} />
          <Route path="reviews" element={<OwnerReviewsPage />} />
          <Route path="dashboard" element={<OwnerDashboardPage />} />
          <Route path="account" element={<StaffAccountPage />} />
        </Route>
      </Route>

      {/* Quản trị viên: duyệt quán + nhật ký (/api/admin/*) */}
      <Route path="/admin/login" element={<AuthPage portal="admin" />} />
      <Route element={<RequireRole role="ADMIN" loginPath="/admin/login" />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminRestaurantsPage />} />
          <Route path="restaurants/:id" element={<AdminRestaurantDetailPage />} />
          <Route path="stats" element={<AdminStatsPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="reviews" element={<AdminReviewsPage />} />
          <Route path="account" element={<StaffAccountPage />} />
          <Route path="audit-logs" element={<AdminAuditLogsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
