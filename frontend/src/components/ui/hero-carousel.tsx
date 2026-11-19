import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Menu, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface HeroCarouselItem {
  id?: string | number;
  title: string;
  image: string;
  credit?: string;
  meta?: string[];
  accent?: string;
}

interface HeroCarouselProps {
  items: HeroCarouselItem[];
  autoplay?: boolean;
  autoplayDelay?: number;
  brand?: React.ReactNode;
  onBack?: () => void;
  onMenu?: () => void;
  className?: string;
}

const FALLBACK_ACCENTS = ['#e85d04', '#2f9e44', '#1c7ed6', '#f08c00', '#7c3aed'];

export function HeroCarousel({
  items,
  autoplay = true,
  autoplayDelay = 4500,
  brand = 'Sajiin',
  onBack,
  onMenu,
  className,
}: HeroCarouselProps) {
  const stripRef = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const reduced = useReducedMotion();
  const active = items[index];

  const go = React.useCallback((next: number) => {
    if (!items.length) return;
    setIndex((next + items.length) % items.length);
  }, [items.length]);

  React.useEffect(() => {
    if (!autoplay || paused || reduced || items.length < 2) return;
    const timer = window.setInterval(() => go(index + 1), autoplayDelay);
    return () => window.clearInterval(timer);
  }, [autoplay, autoplayDelay, go, index, items.length, paused, reduced]);

  React.useEffect(() => {
    const activeThumbnail = stripRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    activeThumbnail?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
  }, [index, reduced]);

  if (!active) return null;

  return (
    <section
      className={cn('food-hero-carousel', className)}
      tabIndex={0}
      aria-roledescription="carousel"
      aria-label="Menu pilihan Sajiin"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') go(index - 1);
        if (event.key === 'ArrowRight') go(index + 1);
      }}
    >
      <AnimatePresence initial={false} mode="sync">
        <motion.img
          key={`background-${active.id ?? index}`}
          src={active.image}
          alt=""
          aria-hidden="true"
          className="food-hero-carousel-bg"
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.7 }}
        />
      </AnimatePresence>
      <div className="food-hero-carousel-tint" style={{ background: active.accent || FALLBACK_ACCENTS[index % FALLBACK_ACCENTS.length] }} />
      <div className="food-hero-carousel-shade" />

      <div className="food-hero-carousel-topbar">
        {onBack && <button type="button" onClick={onBack} aria-label="Kembali"><ArrowLeft size={17} /> Kembali</button>}
        <strong>{brand}</strong>
        {onMenu && <button type="button" onClick={onMenu} aria-label="Menu">Menu <Menu size={17} /></button>}
      </div>

      <div className="food-hero-carousel-copy">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active.id ?? index}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: reduced ? 0 : 0.45 }}
          >
            <span className="home-eyebrow">PILIHAN HARI INI</span>
            <h1>{active.title}</h1>
            {active.credit && <p className="food-hero-carousel-credit">{active.credit}</p>}
            {active.meta && <div className="food-hero-carousel-meta">{active.meta.map((item) => <span key={item}>{item}</span>)}</div>}
          </motion.div>
        </AnimatePresence>
      </div>

      <div ref={stripRef} className="food-hero-carousel-strip" role="tablist" aria-label="Pilihan menu">
        {items.map((item, itemIndex) => (
          <button
            key={item.id ?? itemIndex}
            type="button"
            role="tab"
            aria-selected={itemIndex === index}
            aria-label={`Lihat ${item.title}`}
            className={itemIndex === index ? 'active' : ''}
            onClick={() => go(itemIndex)}
          >
            <img src={item.image} alt="" />
          </button>
        ))}
      </div>

      <div className="food-hero-carousel-controls">
        <button type="button" onClick={() => go(index - 1)} aria-label="Menu sebelumnya"><ChevronLeft size={18} /></button>
        <span>{String(index + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span>
        <button type="button" onClick={() => go(index + 1)} aria-label="Menu berikutnya"><ChevronRight size={18} /></button>
      </div>
    </section>
  );
}
