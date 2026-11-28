import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { CartProvider } from './contexts/CartContext';
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute';

// Layouts
import { PublicLayout, UserLayout } from './layouts/UserLayout';
import { AdminLayout } from './layouts/AdminLayout';

// Public & Auth Pages
import { HomePage } from './pages/HomePage';
import { NotFoundPage, ForbiddenPage } from './pages/ErrorPages';

// User Pages
import { MenuPage } from './pages/user/MenuPage';
import { CartPage } from './pages/user/CartPage';
import { CheckoutPage } from './pages/user/CheckoutPage';
import { OrdersPage } from './pages/user/OrdersPage';
import { OrderDetailPage } from './pages/user/OrderDetailPage';
import { ProfilePage } from './pages/user/ProfilePage';

// Admin Pages
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminMenuPage } from './pages/admin/AdminMenuPage';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage';
import { AdminOrderDetailPage } from './pages/admin/AdminOrderDetailPage';
import { AdminPaymentsPage } from './pages/admin/AdminPaymentsPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminPaymentSettingsPage } from './pages/admin/AdminPaymentSettingsPage';

import { KasirDashboardPage } from './pages/kasir/KasirDashboardPage';
import { KasirCustomersPage } from './pages/kasir/KasirCustomersPage';
import { KasirLayout } from './layouts/KasirLayout';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <HomePage />;
  if (user.role_name === 'admin') return <Navigate to="/admin/dashboard" replace />;
  if (user.role_name === 'kasir') return <Navigate to="/kasir/dashboard" replace />;
  return <Navigate to="/menu" replace />;
}

export function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public Routes */}
      <Route element={user && user.role_name === 'user' ? <UserLayout /> : <PublicLayout />}>
        <Route path="/" element={<RootRedirect />} />
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <div />
            </PublicOnlyRoute>
          }
        />
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Protected User Routes */}
      <Route
        element={
          <ProtectedRoute allowedRoles={['user']}>
            <UserLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* Portal login staff (Kasir & Admin) kini berada di entri build terpisah `staff.html`
          (Finding N11), sehingga tidak ada rute/jalur portal di bundel publik ini. */}

      {/* Protected Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']} concealed>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="menu" element={<AdminMenuPage />} />
        <Route path="orders" element={<AdminOrdersPage routePrefix="/admin/orders" />} />
        <Route path="orders/:id" element={<AdminOrderDetailPage routePrefix="/admin/orders" />} />
        <Route path="payments" element={<AdminPaymentsPage />} />
        <Route path="customers" element={<KasirCustomersPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="settings/payment" element={<AdminPaymentSettingsPage />} />
        <Route path="logs" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="/kasir" element={<ProtectedRoute allowedRoles={['kasir']} concealed><KasirLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/kasir/dashboard" replace />} />
        <Route path="dashboard" element={<KasirDashboardPage />} />
        <Route path="orders" element={<AdminOrdersPage routePrefix="/kasir/orders" />} />
        <Route path="orders/:id" element={<AdminOrderDetailPage routePrefix="/kasir/orders" />} />
        <Route path="payments" element={<AdminPaymentsPage />} />
        <Route path="customers" element={<KasirCustomersPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <CartProvider>
          <AppRoutes />
        </CartProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
