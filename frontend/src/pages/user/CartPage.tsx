import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../hooks/useCart';
import { useToast } from '../../hooks/useToast';
import { formatCurrency } from '../../utils/format';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { ConfirmModal } from '../../components/Modal';
import { ArrowRight } from 'lucide-react';

export function CartPage() {
  const { cart, loading, updateItemQuantity, removeItem, clearCart } = useCart();
  const toast = useToast();
  const navigate = useNavigate();

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);

  const handleQtyChange = async (menuItemId: string, newQty: number) => {
    if (newQty < 1) {
      await handleRemoveItem(menuItemId);
      return;
    }

    try {
      setUpdatingId(menuItemId);
      await updateItemQuantity(menuItemId, newQty);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memperbarui jumlah');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemoveItem = async (menuItemId: string) => {
    try {
      setUpdatingId(menuItemId);
      await removeItem(menuItemId);
      toast.success('Item dihapus dari keranjang');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus item');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleClearCart = async () => {
    try {
      setClearLoading(true);
      await clearCart();
      setShowClearModal(false);
      toast.success('Keranjang berhasil dikosongkan');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengosongkan keranjang');
    } finally {
      setClearLoading(false);
    }
  };

  if (loading && !cart) {
    return <Spinner center size="lg" />;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        title="Keranjang Belanja Kosong"
        description="Anda belum menambahkan makanan atau minuman ke dalam keranjang."
        action={
          <Link to="/menu" className="btn btn-primary">
            Lihat Menu
          </Link>
        }
      />
    );
  }

  return (
    <div className="flow-page">
      <div className="flow-heading">
        <div><span className="ui-eyebrow">PESANANMU</span><h1 className="page-title" style={{ marginBottom: 0 }}>Keranjang Belanja</h1><p>Periksa kembali makanan sebelum lanjut ke kasir.</p></div>
        <Button
          variant="secondary"
          onClick={() => setShowClearModal(true)}
          style={{ fontSize: '0.85rem' }}
        >
          Kosongkan Keranjang
        </Button>
      </div>

      <div className="flow-grid">
        {/* Items List */}
        <div>
          <Card>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Menu</th>
                    <th>Harga</th>
                    <th>Jumlah</th>
                    <th>Subtotal</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.items.map((item) => (
                    <motion.tr key={item.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                      <td>
                        <strong>{item.menu_item_name}</strong>
                      </td>
                      <td>{formatCurrency(item.menu_item_price)}</td>
                      <td>
                        <div className="qty-control">
                          <button
                            className="qty-btn"
                            onClick={() => handleQtyChange(item.menu_item_id, item.quantity - 1)}
                            disabled={updatingId === item.menu_item_id}
                          >
                            -
                          </button>
                          <span
                            style={{
                              padding: '0 10px',
                              fontSize: '0.875rem',
                              fontWeight: 600,
                              minWidth: '24px',
                              textAlign: 'center',
                            }}
                          >
                            {item.quantity}
                          </span>
                          <button
                            className="qty-btn"
                            onClick={() => handleQtyChange(item.menu_item_id, item.quantity + 1)}
                            disabled={updatingId === item.menu_item_id}
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(item.subtotal)}</td>
                      <td>
                        <button
                          onClick={() => handleRemoveItem(item.menu_item_id)}
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', color: 'var(--danger)', fontSize: '0.8rem' }}
                          disabled={updatingId === item.menu_item_id}
                        >
                          Hapus
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Order Summary & Checkout */}
        <div>
          <Card>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '16px', fontWeight: 600 }}>
              Ringkasan Pesanan
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="flex justify-between" style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
                <span>Total Item</span>
                <span>{cart.items.reduce((acc, it) => acc + it.quantity, 0)} item</span>
              </div>

              <div className="flex justify-between" style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
                <span>Subtotal</span>
                <span>{formatCurrency(cart.total)}</span>
              </div>

              <div
                className="flex justify-between"
                style={{
                  borderTop: '1px solid var(--border)',
                  paddingTop: '12px',
                  marginTop: '4px',
                  fontSize: '1.15rem',
                  fontWeight: 700,
                }}
              >
                <span>Total Pembayaran</span>
                <span style={{ color: 'var(--accent)' }}>{formatCurrency(cart.total)}</span>
              </div>

              <Button
                variant="primary"
                onClick={() => navigate('/checkout')}
                style={{ width: '100%', marginTop: '16px', padding: '12px', fontSize: '1rem' }}
              >
                 Lanjut ke Checkout <ArrowRight size={16} />
              </Button>

              <Link
                to="/menu"
                className="btn btn-secondary"
                style={{ width: '100%', textAlign: 'center', marginTop: '8px' }}
              >
                Tambah Menu Lainnya
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {/* Clear Cart Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={handleClearCart}
        title="Kosongkan Keranjang"
        message="Apakah Anda yakin ingin menghapus seluruh makanan dari keranjang belanja?"
        confirmText="Ya, Kosongkan"
        confirmVariant="danger"
        loading={clearLoading}
      />
    </div>
  );
}
