import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { apiClient } from '../../lib/api-client';
import { useCart } from '../../hooks/useCart';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { formatCurrency } from '../../utils/format';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Pagination } from '../../components/Pagination';
import { Modal } from '../../components/Modal';
import { FoodHeroCarousel } from '../../components/FoodHeroCarousel';
import type { MenuItem, Category, PaginatedResponse } from '../../types';

export function MenuPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const { updateItemQuantity } = useCart();
  const toast = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');

  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 12;

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [modalQuantity, setModalQuantity] = useState(1);
  const [addingId, setAddingId] = useState<string | null>(null);

  // Fetch categories
  useEffect(() => {
    apiClient
      .get<{ data: Category[] }>('/categories', { skipAuth: true })
      .then((res) => setCategories(res.data))
      .catch((err) => console.error('Failed to load categories:', err));
  }, []);

  // Fetch menu items
  const fetchMenu = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (selectedCategory !== null) {
        params.set('category_id', String(selectedCategory));
      }
      if (activeQuery) {
        params.set('q', activeQuery);
      }

      const res = await apiClient.get<PaginatedResponse<MenuItem>>(`/menu?${params.toString()}`, {
        skipAuth: true,
      });

      setItems(res.data);
      setTotalPages(Math.ceil(res.meta.total / limit) || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat menu');
    } finally {
      setLoading(false);
    }
  }, [page, selectedCategory, activeQuery]);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setActiveQuery(searchQuery.trim());
  };

  const handleCategorySelect = (categoryId: number | null) => {
    setSelectedCategory(categoryId);
    setPage(1);
  };

  const handleAddToCart = async (item: MenuItem, qty = 1) => {
    if (!user) {
      toast.info('Silakan login terlebih dahulu untuk memesan');
      return;
    }

    if (item.stock < qty) {
      toast.warning('Stok menu tidak mencukupi');
      return;
    }

    try {
      setAddingId(item.id);
      await updateItemQuantity(item.id, qty);
      toast.success(`${qty}x "${item.name}" ditambahkan ke keranjang`);
      if (selectedItem) setSelectedItem(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menambahkan ke keranjang');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div id={embedded ? 'catalog' : undefined}>
      <header className="catalog-header">
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>
            Katalog Menu
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Pilih makanan & minuman lezat siap saji
          </p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="catalog-search">
          <input
            type="text"
            className="form-input"
            placeholder="Cari menu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ margin: 0 }}
          />
          <Button type="submit" variant="secondary" style={{ padding: '8px 16px' }}>
            Cari
          </Button>
        </form>
      </header>

      {user?.role_name === 'user' && !embedded && <FoodHeroCarousel />}

      <div className="catalog-category-row">
        <span className="catalog-category-label">Kategori</span>
        <div className="catalog-category-bubbles" role="group" aria-label="Filter kategori">
          <button
            type="button"
            className={`catalog-category-bubble ${selectedCategory === null ? 'active' : ''}`}
            onClick={() => handleCategorySelect(null)}
          >
            Semua
          </button>
          {categories.map((cat) => (
            <button
              type="button"
              key={cat.id}
              className={`catalog-category-bubble ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => handleCategorySelect(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <Spinner center size="lg" />
      ) : error ? (
        <ErrorState message={error} retry={fetchMenu} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Tidak ada menu ditemukan"
          description={
            activeQuery || selectedCategory !== null
              ? 'Coba ganti kata kunci pencarian atau kategori lain.'
              : 'Belum ada menu yang tersedia saat ini.'
          }
          action={
            (activeQuery || selectedCategory !== null) && (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchQuery('');
                  setActiveQuery('');
                  setSelectedCategory(null);
                }}
              >
                Reset Filter
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid-menu">
            {items.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.04, 0.25), duration: 0.28 }}
              >
              <Card className="menu-card">
                <div
                  className="menu-card-img-wrapper"
                  onClick={() => {
                    setSelectedItem(item);
                    setModalQuantity(1);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="menu-card-img" />
                  ) : (
                    <div className="menu-placeholder-img">{item.name.charAt(0)}</div>
                  )}
                </div>

                <div className="menu-card-content">
                  <div className="flex justify-between items-center mb-1">
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600 }}>
                      {item.category_name}
                    </span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: item.stock > 0 ? 'var(--success)' : 'var(--danger)',
                        fontWeight: 600,
                      }}
                    >
                      {item.stock > 0 ? `Stok: ${item.stock}` : 'Habis'}
                    </span>
                  </div>

                  <h3
                    className="menu-card-title"
                    onClick={() => {
                      setSelectedItem(item);
                      setModalQuantity(1);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {item.name}
                  </h3>

                  <p className="menu-card-desc">
                    {item.description ? item.description.slice(0, 75) + (item.description.length > 75 ? '...' : '') : ''}
                  </p>

                  <div className="flex justify-between items-center mt-2">
                    <span className="menu-card-price">{formatCurrency(item.price)}</span>
                    <Button
                      variant="primary"
                      disabled={item.stock <= 0}
                      loading={addingId === item.id}
                      onClick={() => handleAddToCart(item, 1)}
                      style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    >
                      + Tambah
                    </Button>
                  </div>
                </div>
              </Card>
              </motion.div>
            ))}
          </div>

          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={(newPage) => setPage(newPage)}
            />
          )}
        </>
      )}

      {/* Detail Modal */}
      {selectedItem && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedItem(null)}
          title={selectedItem.name}
          footer={
            <div className="flex justify-between items-center" style={{ width: '100%' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>
                {formatCurrency(selectedItem.price * modalQuantity)}
              </span>
              <div className="flex gap-1">
                <Button variant="secondary" onClick={() => setSelectedItem(null)}>
                  Tutup
                </Button>
                <Button
                  variant="primary"
                  disabled={selectedItem.stock <= 0}
                  loading={addingId === selectedItem.id}
                  onClick={() => handleAddToCart(selectedItem, modalQuantity)}
                >
                  Tambah ke Keranjang
                </Button>
              </div>
            </div>
          }
        >
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                width: '100%',
                height: '200px',
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
                background: 'var(--bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              {selectedItem.image_url ? (
                <img
                  src={selectedItem.image_url}
                  alt={selectedItem.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div className="menu-placeholder-img" style={{ height: '200px' }}>
                  {selectedItem.name.charAt(0)}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center mb-1">
              <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                Kategori: <strong>{selectedItem.category_name}</strong>
              </span>
              <span
                style={{
                  color: selectedItem.stock > 0 ? 'var(--success)' : 'var(--danger)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                }}
              >
                {selectedItem.stock > 0 ? `Tersedia: ${selectedItem.stock} porsi` : 'Stok Habis'}
              </span>
            </div>

            <p style={{ color: 'var(--text)', marginBottom: '16px', lineHeight: 1.5 }}>
              {selectedItem.description || 'Tidak ada deskripsi detail untuk menu ini.'}
            </p>

            {selectedItem.stock > 0 && (
              <div className="flex items-center gap-1">
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Jumlah:</span>
                <div className="qty-control">
                  <button
                    className="qty-btn"
                    onClick={() => setModalQuantity((q) => Math.max(1, q - 1))}
                    disabled={modalQuantity <= 1}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    className="qty-input"
                    value={modalQuantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) {
                        setModalQuantity(Math.min(selectedItem.stock, Math.max(1, val)));
                      }
                    }}
                    min={1}
                    max={selectedItem.stock}
                  />
                  <button
                    className="qty-btn"
                    onClick={() => setModalQuantity((q) => Math.min(selectedItem.stock, q + 1))}
                    disabled={modalQuantity >= selectedItem.stock}
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
