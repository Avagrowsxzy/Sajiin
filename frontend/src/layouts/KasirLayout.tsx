import { Outlet } from 'react-router-dom';
import { RoleShell } from './RoleShell';
import { ClipboardList, CreditCard, LayoutDashboard, UserPlus } from 'lucide-react';

export function KasirLayout() {
  return (
    <RoleShell
      roleLabel="Kasir"
      accent="kasir"
      notificationPrefix="/kasir/orders"
      navItems={[
        { to: '/kasir/dashboard', label: 'Dashboard Operasional', icon: <LayoutDashboard size={18} /> },
        { to: '/kasir/orders', label: 'Pesanan', icon: <ClipboardList size={18} /> },
        { to: '/kasir/payments', label: 'Pembayaran', icon: <CreditCard size={18} /> },
        { to: '/kasir/customers', label: 'Daftar Pelanggan', icon: <UserPlus size={18} /> },
      ]}
    >
      <Outlet />
    </RoleShell>
  );
}
