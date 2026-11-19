import { useEffect, useState } from 'react';
import { apiClient } from '../lib/api-client';
import type { MenuItem, PaginatedResponse } from '../types';
import { HeroCarousel, type HeroCarouselItem } from './ui/hero-carousel';

const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=1200&q=85',
];

const ACCENTS = ['#e85d04', '#2f9e44', '#1c7ed6', '#f08c00', '#7c3aed'];

export function FoodHeroCarousel() {
  const [items, setItems] = useState<HeroCarouselItem[]>([]);

  useEffect(() => {
    apiClient.get<PaginatedResponse<MenuItem>>('/menu?page=1&limit=8', { skipAuth: true })
      .then((response) => {
        setItems(response.data.map((item, index) => ({
          id: item.id,
          title: item.name,
          image: item.image_url || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length],
          credit: item.category_name || 'Menu Sajiin',
          meta: [item.stock > 0 ? `TERSEDIA ${item.stock} PORSI` : 'STOK HABIS', `RP ${item.price.toLocaleString('id-ID')}`],
          accent: ACCENTS[index % ACCENTS.length],
        })));
      })
      .catch(() => setItems([]));
  }, []);

  const slides = items.length ? items : FALLBACK_IMAGES.map((image, index) => ({
    id: `fallback-${index}`,
    title: ['Nasi Nusantara', 'Rasa Hangat', 'Pizza Favorit', 'Pasta Rumahan'][index],
    image,
    credit: 'Menu pilihan Sajiin',
    meta: ['SIAP DIAMBIL', 'PESAN SEKARANG'],
    accent: ACCENTS[index],
  }));

  return <HeroCarousel items={slides} brand="Sajiin" />;
}
