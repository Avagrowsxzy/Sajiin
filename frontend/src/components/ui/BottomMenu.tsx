import { ReactNode, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';

export interface BottomMenuItem {
  icon: ReactNode;
  label: string;
  to: string;
  badge?: number;
}

export function BottomMenu({ items, className }: { items: BottomMenuItem[]; className?: string }) {
  const location = useLocation();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <div className={cn('bottom-menu-wrap', className)}>
      <AnimatePresence>
        {activeIndex !== null && (
          <motion.div
            className="bottom-menu-tooltip"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
          >
            {items[activeIndex].label}
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="bottom-menu" aria-label="Navigasi pembeli">
        {items.map((item, index) => {
          const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn('bottom-menu-item', active && 'active')}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              aria-label={item.label}
            >
              <span className="bottom-menu-icon">{item.icon}</span>
              {item.badge ? <span className="bottom-menu-badge">{item.badge > 9 ? '9+' : item.badge}</span> : null}
              <span className="bottom-menu-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
