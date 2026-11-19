import { useState, useEffect, useCallback, FormEvent } from 'react';
import { apiClient } from '../../lib/api-client';
import { useToast } from '../../hooks/useToast';
import { formatCurrency } from '../../utils/format';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Badge } from '../../components/Badge';
import { Spinner } from '../../components/Spinner';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { Modal, ConfirmModal } from '../../components/Modal';
import type { MenuItem, Category, PaginatedResponse } from '../../types';
import { SectionHeading } from '../../components/ui/SectionHeading';

type MenuFormData = {
  category_id: number;
  name: string;
  description: string;
  price: string;
  stock: string;
  image_url: string;
  is_available: boolean;
};

const EMPTY_MENU_FORM: MenuFormData = {
  category_id: 0,
  name: '',
  description: '',
  price: '',
  stock: '0',
  image_url: '',
  is_available: true,
};

export function AdminMenuPage() {
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'menu' | 'categories'>('menu');

  // ===== MENU STATE =====
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const limit = 10;

  // Menu form modal
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState<MenuItem | null>(null);
  const [menuForm, setMenuForm] = useState<MenuFormData>(EMPTY_MENU_FORM);
  const [menuSubmitting, setMenuSubmitting] = useState(false);

  // Delete confirmation
  const [deletingMenu, setDeletingMenu] = useState<MenuItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ===== CATEGORY STATE =====
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catSubmitting, setCatSubmitting] = useState(false);
  const [deletingCat, setDeletingCat] = useState<Category | null>(null);
  const [catDeleteLoading, setCatDeleteLoading] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await apiClient.get<{ data: Category[] }>('/admin/categories');
      setCategories(res.data);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }, []);

  const fetchMenu = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (filterCategory) params.set('category_id', filterCategory);
      if (activeQuery) params.set('q', activeQuery);

      const res = await apiClient.get<PaginatedResponse<MenuItem>>(`/admin/menu?${params.toString()}`);
      setItems(res.data);
      setTotalPages(Math.ceil(res.meta.total / limit) || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat menu');
    } finally {
      setLoading(false);
    }
  }, [page, filterCategory, activeQuery]);

  useEffect(() => {
    fetchMenu();
    fetchCategories();
  }, [fetchMenu, fetchCategories]);

  // ===== MENU ACTIONS =====
  const openCreateMenu = () => {
    setEditingMenu(null);
    setMenuForm({ ...EMPTY_MENU_FORM, category_id: categories[0]?.id || 0 });
    setShowMenuModal(true);
  };

  const openEditMenu = (item: MenuItem) => {
    setEditingMenu(item);
    setMenuForm({
      category_id: item.category_id,
      name: item.name,
      description: item.description || '',
      price: String(item.price),
      stock: String(item.stock),
      image_url: item.image_url || '',
      is_available: item.is_available,
    });
    setShowMenuModal(true);
  };

  const handleMenuSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setMenuSubmitting(true);

      const payload = {
        category_id: menuForm.category_id,
        name: menuForm.name,
        description: menuForm.description || null,
        price: Number(menuForm.price),
        stock: Number(menuForm.stock),
        image_url: menuForm.image_url || null,
        is_available: menuForm.is_available,
      };

      if (editingMenu) {
        await apiClient.patch(`/admin/menu/${editingMenu.id}`, payload);
        toast.success('Menu berhasil diperbarui');
      } else {
        await apiClient.post('/admin/menu', payload);
        toast.success('Menu berhasil ditambahkan');
      }

      setShowMenuModal(false);
      await fetchMenu();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan menu');
    } finally {
      setMenuSubmitting(false);
    }
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    try {
      await apiClient.patch(`/admin/menu/${item.id}`, { is_available: !item.is_available });
      toast.success(item.is_available ? 'Menu dinonaktifkan' : 'Menu diaktifkan');
      await fetchMenu();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah ketersediaan');
    }
  };

  const handleDeleteMenu = async () => {
    if (!deletingMenu) return;
    try {
      setDeleteLoading(true);
      await apiClient.delete(`/admin/menu/${deletingMenu.id}`);
      toast.success('Menu berhasil diproses. Menu yang pernah dipakai akan dinonaktifkan.');
      setDeletingMenu(null);
      await fetchMenu();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus menu');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ===== CATEGORY ACTIONS =====
  const handleCatSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setCatSubmitting(true);
      if (editingCat) {
        await apiClient.patch(`/admin/categories/${editingCat.id}`, { name: catName });
        toast.success('Kategori berhasil diperbarui');
      } else {
        await apiClient.post('/admin/categories', { name: catName });
        toast.success('Kategori berhasil ditambahkan');
      }
      setShowCatModal(false);
      setCatName('');
      await fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan kategori');
    } finally {
      setCatSubmitting(false);
    }
  };

  const handleDeleteCat = async () => {
    if (!deletingCat) return;
    try {
      setCatDeleteLoading(true);
      await apiClient.delete(`/admin/categories/${deletingCat.id}`);
      toast.success('Kategori berhasil dihapus');
      setDeletingCat(null);
      await fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus kategori (mungkin masih dipakai menu)');
    } finally {
      setCatDeleteLoading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <SectionHeading eyebrow="CONTENT STUDIO" title="Kelola Menu & Kategori" description="Atur katalog yang tampil untuk pelanggan Sajiin." />
        {activeTab === 'menu' && (
          <Button variant="primary" onClick={openCreateMenu}>
            + Tambah Menu
          </Button>
        )}
        {activeTab === 'categories' && (
          <Button
            variant="primary"
            onClick={() => {
              setEditingCat(null);
              setCatName('');
              setShowCatModal(true);
            }}
          >
            + Tambah Kategori
          </Button>
        )}
      </div>

      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === 'menu' ? 'active' : ''}`}
          onClick={() => setActiveTab('menu')}
        >
          Daftar Menu
        </button>
        <button
          className={`tab-btn ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          Kategori ({categories.length})
        </button>
      </div>

      {/* ===== TAB MENU ===== */}
      {activeTab === 'menu' && (
        <>
          <div className="flex gap-1 mb-2" style={{ flexWrap: 'wrap' }}>
            <select
              className="form-select"
              style={{ width: 'auto' }}
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setActiveQuery(searchQuery.trim());
              }}
              className="flex gap-1"
              style={{ flex: 1, maxWidth: '320px' }}
            >
              <input
                className="form-input"
                placeholder="Cari menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Button type="submit" variant="secondary">
                Cari
              </Button>
            </form>
          </div>

          {loading ? (
            <Spinner center size="lg" />
          ) : error ? (
            <ErrorState message={error} retry={fetchMenu} />
          ) : items.length === 0 ? (
            <EmptyState
              title="Tidak Ada Menu"
              description="Belum ada menu yang sesuai dengan filter."
              action={
                <Button variant="primary" onClick={openCreateMenu}>
                  Tambah Menu Pertama
                </Button>
              }
            />
          ) : (
            <Card>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Menu</th>
                      <th>Kategori</th>
                      <th>Harga</th>
                      <th>Stok</th>
                      <th>Ketersediaan</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                          {item.description && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                              {item.description.slice(0, 60)}
                              {item.description.length > 60 ? '...' : ''}
                            </div>
                          )}
                        </td>
                        <td>{item.category_name}</td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(item.price)}</td>
                        <td>
                          <span style={{ color: item.stock > 0 ? 'var(--text)' : 'var(--danger)', fontWeight: 600 }}>
                            {item.stock}
                          </span>
                        </td>
                        <td>
                          <Badge status={item.is_available ? 'completed' : 'cancelled'} />
                          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '2px' }}>
                            {item.is_available ? 'Tersedia' : 'Nonaktif'}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={() => openEditMenu(item)}
                            >
                              Ubah
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={() => handleToggleAvailability(item)}
                            >
                              {item.is_available ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--danger)' }}
                              onClick={() => setDeletingMenu(item)}
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
              )}
            </Card>
          )}
        </>
      )}

      {/* ===== TAB KATEGORI ===== */}
      {activeTab === 'categories' && (
        <div style={{ maxWidth: '540px' }}>
          <Card>
            {categories.length === 0 ? (
              <EmptyState title="Belum Ada Kategori" description="Tambahkan kategori untuk mengelompokkan menu." />
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nama Kategori</th>
                      <th style={{ width: '160px' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat) => (
                      <tr key={cat.id}>
                        <td>
                          <strong>{cat.name}</strong>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={() => {
                                setEditingCat(cat);
                                setCatName(cat.name);
                                setShowCatModal(true);
                              }}
                            >
                              Ubah
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--danger)' }}
                              onClick={() => setDeletingCat(cat)}
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ===== MODAL FORM MENU ===== */}
      {showMenuModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowMenuModal(false)}
          title={editingMenu ? `Ubah Menu: ${editingMenu.name}` : 'Tambah Menu Baru'}
          footer={
            <div className="flex justify-end gap-1">
              <Button variant="secondary" onClick={() => setShowMenuModal(false)} disabled={menuSubmitting}>
                Batal
              </Button>
              <Button
                variant="primary"
                onClick={handleMenuSubmit}
                loading={menuSubmitting}
                disabled={!menuForm.name || !menuForm.price || !menuForm.category_id}
              >
                Simpan Menu
              </Button>
            </div>
          }
        >
          <form onSubmit={handleMenuSubmit}>
            <Select
              label="Kategori"
              value={menuForm.category_id}
              onChange={(e) => setMenuForm({ ...menuForm, category_id: Number(e.target.value) })}
              required
            >
              <option value="">-- Pilih Kategori --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>

            <Input
              label="Nama Menu"
              value={menuForm.name}
              onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })}
              required
            />

            <div className="form-group">
              <label className="form-label">Deskripsi</label>
              <textarea
                className="form-textarea"
                rows={3}
                maxLength={1000}
                value={menuForm.description}
                onChange={(e) => setMenuForm({ ...menuForm, description: e.target.value })}
              />
            </div>

            <div className="grid-2" style={{ gap: '12px' }}>
              <Input
                label="Harga (Rp)"
                type="number"
                min={0}
                step={0.01}
                value={menuForm.price}
                onChange={(e) => setMenuForm({ ...menuForm, price: e.target.value })}
                required
              />
              <Input
                label="Stok"
                type="number"
                min={0}
                value={menuForm.stock}
                onChange={(e) => setMenuForm({ ...menuForm, stock: e.target.value })}
                required
              />
            </div>

            <Input
              label="URL Gambar (Opsional)"
              type="url"
              placeholder="https://..."
              value={menuForm.image_url}
              onChange={(e) => setMenuForm({ ...menuForm, image_url: e.target.value })}
            />

            <label className="flex items-center gap-1" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={menuForm.is_available}
                onChange={(e) => setMenuForm({ ...menuForm, is_available: e.target.checked })}
              />
              Menu tersedia untuk dipesan
            </label>
          </form>
        </Modal>
      )}

      {/* ===== MODAL FORM KATEGORI ===== */}
      {showCatModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowCatModal(false)}
          title={editingCat ? 'Ubah Kategori' : 'Tambah Kategori Baru'}
          footer={
            <div className="flex justify-end gap-1">
              <Button variant="secondary" onClick={() => setShowCatModal(false)} disabled={catSubmitting}>
                Batal
              </Button>
              <Button variant="primary" onClick={handleCatSubmit} loading={catSubmitting} disabled={catName.trim().length < 2}>
                Simpan
              </Button>
            </div>
          }
        >
          <form onSubmit={handleCatSubmit}>
            <Input
              label="Nama Kategori"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="Contoh: Makanan Utama, Minuman, Camilan"
              minLength={2}
              maxLength={80}
              required
              autoFocus
            />
          </form>
        </Modal>
      )}

      {/* ===== CONFIRM MODALS ===== */}
      <ConfirmModal
        isOpen={!!deletingMenu}
        onClose={() => setDeletingMenu(null)}
        onConfirm={handleDeleteMenu}
        title="Hapus Menu"
        message={`Apakah Anda yakin ingin menghapus menu "${deletingMenu?.name}"? Menu yang belum pernah dipakai akan dihapus permanen; menu yang sudah masuk order/keranjang hanya dinonaktifkan demi menjaga riwayat.`}
        confirmText="Ya, Hapus"
        confirmVariant="danger"
        loading={deleteLoading}
      />

      <ConfirmModal
        isOpen={!!deletingCat}
        onClose={() => setDeletingCat(null)}
        onConfirm={handleDeleteCat}
        title="Hapus Kategori"
        message={`Apakah Anda yakin ingin menghapus kategori "${deletingCat?.name}"? Penghapusan akan ditolak jika kategori masih dipakai menu.`}
        confirmText="Ya, Hapus"
        confirmVariant="danger"
        loading={catDeleteLoading}
      />
    </div>
  );
}
