import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import RequireCustomer from './components/RequireCustomer';
import RequireRole from './components/RequireRole';
import AccountPage from './pages/AccountPage';
import AuthPage from './pages/AuthPage';
import CheckoutPage from './pages/CheckoutPage';
import LandingPage from './pages/LandingPage';
import MenuPage from './pages/MenuPage';
import OrdersPage from './pages/OrdersPage';
import PaymentPage from './pages/PaymentPage';
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
import AdminWalletsPage from './pages/admin/AdminWalletsPage';
import AdminVouchersPage from './pages/admin/AdminVouchersPage';

import OwnerDashboardPage from './pages/owner/OwnerDashboardPage';
import OwnerLayout from './pages/owner/OwnerLayout';
import OwnerMenuPage from './pages/owner/OwnerMenuPage';
import OwnerOrdersPage from './pages/owner/OwnerOrdersPage';
import OwnerProfilePage from './pages/owner/OwnerProfilePage';
import OwnerReviewsPage from './pages/owner/OwnerReviewsPage';
import OwnerWalletPage from './pages/owner/OwnerWalletPage';
import OwnerVouchersPage from './pages/owner/OwnerVouchersPage';

// Trang tài xế + điều phối: tải khi mở tới (khách không cần — giữ gói JS chính nhỏ, QUALITY Q3)
const AdminShippersPage = lazy(() => import('./pages/admin/AdminShippersPage'));
const AdminShipperDetailPage = lazy(() => import('./pages/admin/AdminShippersPage').then(m => ({ default: m.AdminShipperDetailPage })));
const AdminDispatchPage = lazy(() => import('./pages/admin/AdminDispatchPage'));
const ShipperLayout = lazy(() => import('./pages/shipper/ShipperLayout'));
const ShipperHomePage = lazy(() => import('./pages/shipper/ShipperHomePage'));
const ShipperHistoryPage = lazy(() => import('./pages/shipper/ShipperHistoryPage'));
const ShipperEarningsPage = lazy(() => import('./pages/shipper/ShipperEarningsPage'));
const ShipperProfilePage = lazy(() => import('./pages/shipper/ShipperProfilePage'));
const ShipperShiftsPage = lazy(() => import('./pages/shipper/ShipperShiftsPage'));
const AdminShiftsPage = lazy(() => import('./pages/admin/AdminShiftsPage'));
const OwnerSchedulePage = lazy(() => import('./pages/owner/OwnerSchedulePage'));
const page = (C: ComponentType) => (
  <Suspense fallback={<div className="page-loading">Đang tải...</div>}>
    <C />
  </Suspense>
);

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
        <Route path="/orders/:id/pay" element={<PaymentPage />} />
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
          <Route path="wallet" element={<OwnerWalletPage />} />
          <Route path="vouchers" element={<OwnerVouchersPage />} />
          <Route path="schedule" element={page(OwnerSchedulePage)} />
          <Route path="account" element={<StaffAccountPage />} />
        </Route>
      </Route>

      {/* Tài xế MAK: web chạy trên điện thoại (/api/shipper/*) */}
      <Route path="/shipper/login" element={<AuthPage portal="shipper" />} />
      <Route element={<RequireRole role="SHIPPER" loginPath="/shipper/login" />}>
        <Route path="/shipper" element={page(ShipperLayout)}>
          <Route index element={page(ShipperHomePage)} />
          <Route path="shifts" element={page(ShipperShiftsPage)} />
          <Route path="history" element={page(ShipperHistoryPage)} />
          <Route path="earnings" element={page(ShipperEarningsPage)} />
          <Route path="profile" element={page(ShipperProfilePage)} />
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
          <Route path="wallets" element={<AdminWalletsPage />} />
          <Route path="vouchers" element={<AdminVouchersPage />} />
          <Route path="shippers" element={page(AdminShippersPage)} />
          <Route path="shippers/:id" element={page(AdminShipperDetailPage)} />
          <Route path="dispatch" element={page(AdminDispatchPage)} />
          <Route path="shifts" element={page(AdminShiftsPage)} />
          <Route path="account" element={<StaffAccountPage />} />
          <Route path="audit-logs" element={<AdminAuditLogsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
