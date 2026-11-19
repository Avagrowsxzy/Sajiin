import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { formatCurrency, formatDate } from '../../utils/format';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { ErrorState } from '../../components/ErrorState';
import { ConfirmModal } from '../../components/Modal';
import type { Order, Payment, OrderStatus, PaginatedResponse } from '../../types';

/**
 * Transisi status yang valid untuk ADMIN (sumber: order.service.ts VALID_TRANSITIONS).
 * Alur pesan-ambil: konfirmasi bayar lewat endpoint khusus, lalu proses -> ready -> completed.
 */
const ADMIN_TRANSITIONS: Record<OrderStatus, { to: OrderStatus; label: string; danger?: boolean }[]> = {
  pending: [{ to: 'cancelled', label: 'Batalkan Pesanan', danger: true }],
  awaiting_confirmation: [{ to: 'cancelled', label: 'Batalkan (Tolak Pembayaran)', danger: true }],
  paid: [
    { to: 'preparing', label: 'Proses Pesanan' },
    { to: 'cancelled', label: 'Batalkan (Refund Terpisah)', danger: true },
  ],
  preparing: [{ to: 'ready', label: 'Pesanan Sudah Jadi' }],
  ready: [{ to: 'completed', label: 'Sudah Diambil / Selesai' }],
  completed: [],
  cancelled: [],
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Menunggu Pembayaran',
  awaiting_confirmation: 'Menunggu Konfirmasi Admin',
  paid: 'Pembayaran Dikonfirmasi',
  preparing: 'Sedang Disiapkan',
  ready: 'Pesanan Sudah Jadi',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

export function AdminOrderDetailPage({ routePrefix = '/admin/orders' }: { routePrefix?: string }) {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [transitionTarget, setTransitionTarget] = useState<{ to: OrderStatus; label: string; danger?: boolean } | null>(null);
  const [transitionLoading, setTransitionLoading] = useState(false);

  const [confirmPayLoading, setConfirmPayLoading] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);

      const res = await apiClient.get<{ data: Order }>(`/admin/orders/${id}`);
      setOrder(res.data);

      try {
        const payRes = await apiClient.get<PaginatedResponse<Payment>>('/admin/payments?page=1&limit=100');
        const found = payRes.data.find((p) => p.order_id === res.data.id);
        setPayment(found || null);
      } catch {
        setPayment(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat detail pesanan');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleTransition = async () => {
    if (!id || !transitionTarget) return;
    try {
      setTransitionLoading(true);
      await apiClient.patch(`/admin/orders/${id}/status`, { status: transitionTarget.to });
      toast.success(`Status pesanan diubah menjadi "${transitionTarget.to}"`);
      setTransitionTarget(null);
      await fetchDetail();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah status pesanan');
    } finally {
      setTransitionLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!id) return;
    try {
      setConfirmPayLoading(true);
      await apiClient.patch(`/admin/orders/${id}/confirm-payment`);
      toast.success('Pembayaran dikonfirmasi. User menerima notifikasi.');
      await fetchDetail();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengonfirmasi pembayaran');
    } finally {
      setConfirmPayLoading(false);
    }
  };

  const handleViewProof = async () => {
    if (!payment) return;
    const response = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/payments/${payment.id}/proof`, {
      headers: { Authorization: `Bearer ${apiClient.getAccessToken() || ''}` },
    });
    if (!response.ok) { toast.error('Bukti transfer tidak dapat dibuka'); return; }
    setProofUrl(URL.createObjectURL(await response.blob()));
  };

  if (loading) return <Spinner center size="lg" />;
  if (error || !order) return <ErrorState message={error || 'Pesanan tidak ditemukan'} retry={fetchDetail} />;

  const transitions = ADMIN_TRANSITIONS[order.status];

  return (
    <div>
      <div className="flex justify-between items-center mb-2" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <Link to={routePrefix} className="inline-flex items-center gap-1" style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
            <ArrowLeft size={14} /> Kembali ke Daftar Pesanan
          </Link>
          <h1 className="page-title" style={{ marginBottom: 0, marginTop: '4px' }}>
            Pesanan #{order.order_code} <Badge status={order.status} />
          </h1>
        </div>

        {(user?.role_name === 'admin' || user?.role_name === 'kasir') && (
          <div className="flex gap-1">
            {order.status === 'awaiting_confirmation' && (
              <Button
                variant="primary"
                onClick={handleConfirmPayment}
                loading={confirmPayLoading}
                style={{ fontSize: '0.85rem' }}
              >
                <CheckCircle2 size={15} /> Konfirmasi Pembayaran Masuk
              </Button>
            )}
            {transitions.map((t) => (
              <Button
                key={t.to}
                variant={t.danger ? 'danger' : 'primary'}
                onClick={() => setTransitionTarget(t)}
                style={{ fontSize: '0.85rem' }}
              >
                {t.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="grid-2">
        {/* Left: Items */}
        <Card>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px' }}>Item Pesanan</h2>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Menu</th>
                  <th>Harga</th>
                  <th>Qty</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.items?.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.menu_name}</strong>
                    </td>
                    <td>{formatCurrency(item.unit_price)}</td>
                    <td>{item.quantity}</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(item.unit_price * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            className="flex justify-between"
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: '12px',
              marginTop: '12px',
              fontSize: '1.1rem',
              fontWeight: 700,
            }}
          >
            <span>Total</span>
            <span style={{ color: 'var(--accent)' }}>{formatCurrency(order.total_amount)}</span>
          </div>

          {order.notes && (
            <div style={{ marginTop: '16px' }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Catatan Pelanggan:</span>
              <div
                style={{
                  background: 'var(--bg)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius)',
                  marginTop: '6px',
                  fontSize: '0.9rem',
                }}
              >
                {order.notes}
              </div>
            </div>
          )}
        </Card>

        {/* Right: Info & Payment */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Card>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '14px' }}>Informasi Pesanan</h2>
            <div style={{ fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--muted)' }}>Status:</span>
                <strong>{STATUS_LABELS[order.status]}</strong>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--muted)' }}>Pelanggan:</span>
                <strong>{order.user_name}</strong>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--muted)' }}>Username:</span>
                <span>@{order.user_username}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--muted)' }}>Waktu Pesan:</span>
                <span>{formatDate(order.created_at)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>Metode Pengambilan:</span>
                <div style={{ marginTop: '4px' }}><strong>Ambil Sendiri (Takeaway)</strong></div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex justify-between items-center mb-1">
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Pembayaran</h2>
              {payment && <Badge status={payment.status} />}
            </div>

            {payment ? (
              <div style={{ fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Jumlah:</span>
                  <strong>{formatCurrency(payment.amount)}</strong>
                </div>
                {payment.proof_path && (
                  <div>
                    <Button type="button" variant="secondary" onClick={handleViewProof} style={{ width: '100%' }}>Lihat Bukti Transfer</Button>
                    {proofUrl && <img src={proofUrl} alt="Bukti transfer" style={{ width: '100%', maxHeight: '320px', objectFit: 'contain', marginTop: '8px', borderRadius: 'var(--radius)' }} />}
                  </div>
                )}
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Metode:</span>
                  <span>{payment.method || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Gateway Ref:</span>
                  <code style={{ fontSize: '0.8rem' }}>{payment.gateway_ref || '-'}</code>
                </div>
                {payment.paid_at && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--muted)' }}>Waktu Bayar:</span>
                    <span>{formatDate(payment.paid_at)}</span>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                Belum ada transaksi pembayaran untuk pesanan ini.
              </p>
            )}
          </Card>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!transitionTarget}
        onClose={() => setTransitionTarget(null)}
        onConfirm={handleTransition}
        title="Ubah Status Pesanan"
        message={`Apakah Anda yakin ingin mengubah status pesanan #${order.order_code} dari "${order.status}" menjadi "${transitionTarget?.to}"?`}
        confirmText={transitionTarget?.label || 'Konfirmasi'}
        confirmVariant={transitionTarget?.danger ? 'danger' : 'primary'}
        loading={transitionLoading}
      />
    </div>
  );
}
