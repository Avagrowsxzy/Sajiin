import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { ResizableNavbar } from '../components/ui/ResizableNavbar';
import { Button } from '../components/Button';
import { AuthModal } from '../components/ui/AuthModal';
import { BottomMenu } from '../components/ui/BottomMenu';
import { ClipboardList, Menu as MenuIcon, ShoppingBasket, UserRound } from 'lucide-react';

export function PublicLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const routeAuthMode = location.pathname === '/login' ? 'login' : null;
  const [requestedAuthMode, setRequestedAuthMode] = useState<'login' | null>(routeAuthMode);

  useEffect(() => {
    setRequestedAuthMode(routeAuthMode);
  }, [routeAuthMode]);

  const dashboardPath = user?.role_name === 'admin'
    ? '/admin/dashboard'
    : user?.role_name === 'kasir'
      ? '/kasir/dashboard'
      : '/menu';

  const authActions = user ? (
    <Button variant="primary" onClick={() => navigate(dashboardPath)}>
      Dashboard
    </Button>
  ) : (
    <>
      <Button variant="secondary" onClick={() => setRequestedAuthMode('login')}>Masuk</Button>
    </>
  );

  return (
    <div className={location.pathname === '/' ? 'public-layout-landing' : 'public-layout'}>
      <ResizableNavbar
        items={[{ name: 'Menu', to: '/login' }]}
        authActions={authActions}
      />
      <main className="public-main">
        <Outlet />
      </main>
      <AuthModal
        isOpen={requestedAuthMode !== null}
        initialMode={requestedAuthMode || 'login'}
        onClose={() => { setRequestedAuthMode(null); navigate('/'); }}
      />
    </div>
  );
}

export function UserLayout() {
  const { itemCount } = useCart();

  return (
    <div className="buyer-shell">
      <main className="buyer-main"><Outlet /></main>
      <BottomMenu
        items={[
          { to: '/menu', label: 'Menu', icon: <MenuIcon size={19} /> },
          { to: '/cart', label: 'Keranjang', icon: <ShoppingBasket size={19} />, badge: itemCount },
          { to: '/orders', label: 'Pesanan', icon: <ClipboardList size={19} /> },
          {
            to: '/profile',
            label: 'Profil',
            icon: (
              <UserRound size={19} />
            ),
          },
        ]}
      />
    </div>
  );
}
