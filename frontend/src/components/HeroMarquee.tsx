import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowDown } from 'lucide-react';

interface HeroMarqueeProps {
  images: string[];
}

const fallbackImages = [
  'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=700&q=80',
];

export function HeroMarquee({ images }: HeroMarqueeProps) {
  const sourceImages = images.length ? images : fallbackImages;
  // One cycle must be wider than a desktop viewport; duplicate the exact cycle
  // so -50% always lands on an identical frame without an empty gap.
  const marqueeImages = Array.from({ length: 14 }, (_, index) => sourceImages[index % sourceImages.length]);
  const loopImages = [...marqueeImages, ...marqueeImages];

  return (
    <section className="sajiin-hero">
      <div className="sajiin-hero-glow sajiin-hero-glow-one" />
      <div className="sajiin-hero-glow sajiin-hero-glow-two" />
      <motion.div
        className="sajiin-hero-copy"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: 'easeOut' }}
      >
        <span className="home-eyebrow">PESAN. BAYAR. AMBIL.</span>
        <h1>Rasa enak,<br /><em>tinggal ambil.</em></h1>
        <p>Pesan makanan favoritmu dari Sajiin. Kami siapkan, kamu datang saat sudah siap.</p>
        <div className="home-actions">
          <a href="#catalog" className="btn btn-primary home-primary-action inline-flex items-center gap-1.5">
            Lihat Daftar Menu <ArrowDown size={16} />
          </a>
          <Link to="/login" className="btn btn-secondary">Masuk</Link>
        </div>
      </motion.div>

      <div className="sajiin-marquee" aria-hidden="true">
        <motion.div
          className="sajiin-marquee-track"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 32, ease: 'linear', repeat: Infinity }}
        >
          {loopImages.map((src, index) => (
            <div className="sajiin-marquee-card" key={`${src}-${index}`}>
              <img src={src} alt="" loading="lazy" />
            </div>
          ))}
        </motion.div>
      </div>
      <a href="#catalog" className="home-scroll-hint inline-flex items-center gap-1">
        Scroll untuk melihat menu <ArrowDown size={14} />
      </a>
    </section>
  );
}
