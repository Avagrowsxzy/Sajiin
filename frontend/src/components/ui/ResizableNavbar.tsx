import { ReactNode, useEffect, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface NavbarItem {
  name: string;
  to: string;
}

interface ResizableNavbarProps {
  items: NavbarItem[];
  authActions?: ReactNode;
  brand?: string;
}

export function ResizableNavbar({ items, authActions, brand = 'Sajiin' }: ResizableNavbarProps) {
  const { scrollY } = useScroll();
  const [visible, setVisible] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useMotionValueEvent(scrollY, 'change', (latest) => setVisible(latest > 40));

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);

  return (
    <motion.nav
      className={cn('sajiin-navbar', visible && 'sajiin-navbar-scrolled')}
      animate={{ y: visible ? 8 : 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 28 }}
    >
      <motion.div
        className="sajiin-navbar-inner"
        animate={{ maxWidth: visible ? 820 : 1120, borderRadius: visible ? 999 : 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 30 }}
      >
        <Link className="sajiin-navbar-brand" to="/" onClick={() => setMobileOpen(false)}>
          <span className="brand-mark">S</span>
          <span>{brand}</span>
        </Link>

        <div className="sajiin-navbar-links">
          {items.map((item) => (
            <Link key={item.to} to={item.to} className="sajiin-navbar-link">
              {item.name}
              <motion.span className="sajiin-navbar-link-line" layoutId="sajiin-nav-line" />
            </Link>
          ))}
        </div>

        <div className="sajiin-navbar-actions">{authActions}</div>

        <button
          className="sajiin-navbar-toggle"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Tutup navigasi' : 'Buka navigasi'}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </motion.div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="sajiin-mobile-menu"
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {items.map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setMobileOpen(false)}>
                {item.name}
              </Link>
            ))}
            <div className="sajiin-mobile-actions">{authActions}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
