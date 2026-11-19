import { MenuPage } from './user/MenuPage';
import { HeroMarquee } from '../components/HeroMarquee';

export function HomePage() {
  return (
    <div className="home-page">
      <div className="home-decoration home-decoration-left" aria-hidden="true" />
      <div className="home-decoration home-decoration-right" aria-hidden="true" />
      <div className="home-decoration home-decoration-bottom" aria-hidden="true" />
      <HeroMarquee images={[]} />

      <section className="home-catalog">
        <MenuPage embedded />
      </section>
    </div>
  );
}
