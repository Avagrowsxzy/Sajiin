import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { NotificationBell } from '../components/NotificationBell';
import { LogOut, Menu, UserRound } from 'lucide-react';

interface RoleNavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

interface RoleShellProps {
  roleLabel: string;
  accent: 'user' | 'admin' | 'kasir';
  navItems: RoleNavItem[];
  children: ReactNode;
  notificationPrefix?: '/orders' | '/admin/orders' | '/kasir/orders';
}

export function RoleShell({ roleLabel, accent, navItems, children, notificationPrefix }: RoleShellProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const expanded = mobileOpen || desktopOpen;
  const profilePath = accent === 'admin' ? '/admin/profile' : accent === 'kasir' ? '/kasir/profile' : '/profile';

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className={`role-shell role-shell-${accent} ${desktopOpen ? 'desktop-expanded' : ''}`}>
      {mobileOpen && <button className="role-sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Tutup navigasi" />}
      <motion.aside
        className={`role-sidebar ${mobileOpen ? 'open' : ''} ${desktopOpen ? 'desktop-expanded' : ''}`}
        animate={{ width: expanded ? 256 : 76 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        onMouseEnter={() => setDesktopOpen(true)}
        onMouseLeave={() => setDesktopOpen(false)}
      >
        <div className="role-sidebar-brand">
          <Link to={navItems[0]?.to || '/'} onClick={() => setMobileOpen(false)}>
            <span className="brand-mark">S</span>
            <motion.span animate={{ opacity: expanded ? 1 : 0, width: expanded ? 'auto' : 0 }}>Sajiin</motion.span>
          </Link>
          <motion.span className="role-chip" animate={{ opacity: expanded ? 1 : 0, width: expanded ? 'auto' : 0 }}>{roleLabel}</motion.span>
        </div>
        <nav className="role-nav" aria-label={`Navigasi ${roleLabel}`}>
          {navItems.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={active ? 'active' : ''}
              >
                <span className="role-nav-icon" aria-hidden="true">{item.icon}</span>
                <motion.span animate={{ opacity: expanded ? 1 : 0, width: expanded ? 'auto' : 0 }}>{item.label}</motion.span>
              </Link>
            );
          })}
        </nav>
        <div className="role-sidebar-footer">
          <Link to={profilePath} onClick={() => setMobileOpen(false)}>
            <UserRound className="role-nav-icon" size={18} /><motion.span animate={{ opacity: expanded ? 1 : 0, width: expanded ? 'auto' : 0 }}>Profil akun</motion.span>
          </Link>
          <button onClick={handleLogout}><LogOut className="role-nav-icon" size={18} /><motion.span animate={{ opacity: expanded ? 1 : 0, width: expanded ? 'auto' : 0 }}>Keluar</motion.span></button>
        </div>
      </motion.aside>
      <main className="role-main">
        <header className="role-header">
          <button className="mobile-menu-button" onClick={() => setMobileOpen(true)} aria-label="Buka navigasi"><Menu size={20} /></button>
          <div>
            <p className="role-header-kicker">Ruang kerja {roleLabel.toLowerCase()}</p>
            <h1>{user?.full_name || 'Sajiin'}</h1>
          </div>
          <div className="role-header-actions">
            {notificationPrefix && <NotificationBell orderPathPrefix={notificationPrefix} />}
            <span className="role-avatar">{(user?.full_name || roleLabel).charAt(0).toUpperCase()}</span>
          </div>
        </header>
        <motion.div
          className="role-content"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
