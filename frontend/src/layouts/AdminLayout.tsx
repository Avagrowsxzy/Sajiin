import { Outlet } from 'react-router-dom';
import { RoleShell } from './RoleShell';
import { UsersRound, Utensils, ScrollText, Settings } from 'lucide-react';

export function AdminLayout() {
  return (
    <RoleShell
      roleLabel="Admin"
      accent="admin"
      navItems={[
        { to: '/admin/dashboard', label: 'Dashboard Log', icon: <ScrollText size={18} /> },
        { to: '/admin/menu', label: 'Menu & Kategori', icon: <Utensils size={18} /> },
        { to: '/admin/users', label: 'Pengguna & Role', icon: <UsersRound size={18} /> },
        { to: '/admin/settings/payment', label: 'Pengaturan Pembayaran', icon: <Settings size={18} /> },
      ]}
    >
      <Outlet />
    </RoleShell>
  );
}
