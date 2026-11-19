import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { apiClient } from '../../lib/api-client';
import { useCart } from '../../hooks/useCart';
import { useToast } from '../../hooks/useToast';
import { formatCurrency } from '../../utils/format';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import type { Order } from '../../types';
import { Store, ArrowRight } from 'lucide-react';
import type { ClaimPaymentMethod } from '../../types';

export function CheckoutPage() {
  const { cart, loading: cartLoading, fetchCart } = useCart();
  const toast = useToast();
  const navigate = useNavigate();

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<ClaimPaymentMethod>('transfer');

  const handlePlaceOrder = async () => {
    if (!cart || cart.items.length === 0) {
      toast.warning('Keranjang Anda kosong');
      return;
    }

    try {
      setSubmitting(true);
      // Sistem ambil sendiri: tanpa alamat, cukup catatan opsional
      const res = await apiClient.post<{ data: Order }>('/orders', {
        notes: notes.trim() || undefined,
        payment_method: paymentMethod,
      });

      await fetchCart();
      toast.success(`Pesanan ${res.data.order_code} berhasil dibuat!`);
      navigate(`/orders/${res.data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal membuat pesanan');
    } finally {
      setSubmitting(false);
    }
  };

  if (cartLoading) {
    return <Spinner center size="lg" />;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        title="Keranjang Kosong"
        description="Tidak ada item untuk di-checkout."
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
      <div className="flow-heading"><div><span className="ui-eyebrow">LANGKAH TERAKHIR</span><h1 className="page-title">Checkout Pesanan</h1><p>Ambil sendiri setelah pesanan siap. Cek ringkasan sebelum membuat pesanan.</p></div></div>

      <div className="flow-grid">
        {/* Kiri: Metode ambil + catatan */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Card>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '8px' }}>
              Metode Pengambilan
            </h2>
            <div
              style={{
                padding: '14px 16px',
                background: 'rgba(217, 72, 15, 0.05)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ color: 'var(--accent)' }}><Store size={24} /></span>
              <div>
                <strong>Ambil Sendiri (Takeaway)</strong>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.8rem' }}>
                  Ambil pesanan langsung di tempat setelah admin mengonfirmasi pesanan sudah jadi.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '12px' }}>
              Metode Pembayaran
            </h2>
            <div className="payment-method-options">
              <label className={paymentMethod === 'transfer' ? 'payment-method-option active' : 'payment-method-option'}>
                <input type="radio" name="payment_method" value="transfer" checked={paymentMethod === 'transfer'} onChange={() => setPaymentMethod('transfer')} />
                <span><strong>Transfer Bank</strong><small>Upload bukti transfer setelah pesanan dibuat.</small></span>
              </label>
              <label className={paymentMethod === 'tunai' ? 'payment-method-option active' : 'payment-method-option'}>
                <input type="radio" name="payment_method" value="tunai" checked={paymentMethod === 'tunai'} onChange={() => setPaymentMethod('tunai')} />
                <span><strong>Tunai di Kasir</strong><small>Bayar langsung saat datang mengambil pesanan.</small></span>
              </label>
            </div>
            {paymentMethod === 'transfer' && (
              <div className="payment-instructions-box">
                <strong>Informasi Pembayaran Transfer</strong>
                <p>Nomor rekening bank tujuan dan instruksi pembayaran akan ditampilkan di halaman detail pesanan setelah pesanan dibuat.</p>
                <small>Batas waktu transfer dan unggah bukti adalah 5 menit setelah pesanan dibuat.</small>
              </div>
            )}
          </Card>

          <Card>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '12px' }}>
              Catatan untuk Restoran
            </h2>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Contoh: Jangan terlalu pedas, tolong pisahkan sambal..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </Card>
        </div>

        {/* Kanan: Ringkasan & buat pesanan */}
        <div>
          <Card>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '16px' }}>
              Daftar Pesanan ({cart.items.reduce((sum, it) => sum + it.quantity, 0)} item)
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {cart.items.map((item) => (
                <div key={item.id} className="flex justify-between items-center" style={{ fontSize: '0.9rem' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{item.quantity}x</span> {item.menu_item_name}
                  </div>
                  <span style={{ fontWeight: 500 }}>{formatCurrency(item.subtotal)}</span>
                </div>
              ))}
            </div>

            <div
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
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
                  fontSize: '1.2rem',
                  fontWeight: 700,
                }}
              >
                <span>Total Bayar</span>
                <span style={{ color: 'var(--accent)' }}>{formatCurrency(cart.total)}</span>
              </div>
            </div>

            <Button
              variant="primary"
              onClick={handlePlaceOrder}
              loading={submitting}
              style={{ width: '100%', marginTop: '24px', padding: '14px', fontSize: '1rem' }}
            >
              Buat Pesanan <ArrowRight size={16} />
            </Button>

            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: '12px' }}>
              Setelah pesanan dibuat, Anda akan diarahkan ke halaman pembayaran.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
