import { ReactNode, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { useToast } from '../../hooks/useToast';
import { formatCurrency, formatDate } from '../../utils/format';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Spinner } from '../../components/Spinner';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import type { DashboardSummary, Order, PaginatedResponse, Payment } from '../../types';
import { SectionHeading } from '../../components/ui/SectionHeading';
import { CheckCircle2, ClipboardList, Clock3, CircleOff, ExternalLink } from 'lucide-react';

function getTodayRangeWib() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const start = `${values.year}-${values.month}-${values.day} 00:00:00`;
  const next = new Date(`${values.year}-${values.month}-${values.day}T00:00:00+07:00`);
  next.setDate(next.getDate() + 1);
  const nextParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(next);
  const nextValues = Object.fromEntries(nextParts.map(({ type, value }) => [type, value]));
  return { dateFrom: start, dateTo: `${nextValues.year}-${nextValues.month}-${nextValues.day} 00:00:00` };
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  color: string;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <Card style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: 'var(--radius)',
          background: color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
      </div>
    </Card>
  );
}

export function KasirDashboardPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  const fetchDashboard = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const { dateFrom, dateTo } = getTodayRangeWib();
      const orderParams = new URLSearchParams({
        page: '1',
        limit: '10',
        date_from: dateFrom,
        date_to: dateTo,
      });
      const summaryParams = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });

      const [summaryRes, ordersRes, paymentsRes] = await Promise.all([
        apiClient.get<{ data: DashboardSummary }>(`/admin/dashboard/summary?${summaryParams.toString()}`),
        apiClient.get<PaginatedResponse<Order>>(`/admin/orders?${orderParams.toString()}`),
        apiClient.get<PaginatedResponse<Payment>>('/admin/payments?page=1&limit=100'),
      ]);

      setSummary(summaryRes.data);
      const paymentByOrder = new Map(paymentsRes.data.map((payment) => [payment.order_id, payment]));
      setRecentOrders(ordersRes.data.map((order) => ({
        ...order,
        payment_id: paymentByOrder.get(order.id)?.id,
        proof_path: paymentByOrder.get(order.id)?.proof_path,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat dashboard kasir');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleConfirmPayment = async (orderId: string) => {
    try {
      setConfirmingOrderId(orderId);
      await apiClient.patch(`/admin/orders/${orderId}/confirm-payment`);
      toast.success('Pembayaran berhasil dikonfirmasi');
      await fetchDashboard(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengonfirmasi pembayaran');
    } finally {
      setConfirmingOrderId(null);
    }
  };

  const handleViewProof = async (paymentId: string) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/payments/${paymentId}/proof`, {
      headers: { Authorization: `Bearer ${apiClient.getAccessToken() || ''}` },
    });
    if (!response.ok) { toast.error('Bukti transfer tidak dapat dibuka'); return; }
    setProofUrl(URL.createObjectURL(await response.blob()));
  };

  useEffect(() => {
    fetchDashboard();
    const timer = window.setInterval(() => fetchDashboard(true), 5000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchDashboard(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchDashboard]);

  if (loading) return <Spinner center size="lg" />;
  if (error || !summary) return <ErrorState message={error || 'Data tidak tersedia'} retry={fetchDashboard} />;

  return (
    <div>
      <SectionHeading eyebrow="OPERASIONAL" title="Dashboard Kasir" description="Pantau antrian pesanan dan kesiapan takeaway tanpa membuka data omzet." />

      {/* 3 Kartu Statistik Operasional (tanpa omzet) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <StatCard label="Total Pesanan" value={summary.total_orders} icon={<ClipboardList size={24} />} color="rgba(28, 126, 214, 0.12)" />
        <StatCard label="Pesanan Menunggu" value={summary.pending_orders} icon={<Clock3 size={24} />} color="rgba(240, 140, 0, 0.12)" />
        <StatCard label="Menu Habis" value={summary.out_of_stock_menu} icon={<CircleOff size={24} />} color="rgba(224, 49, 49, 0.12)" />
      </div>

      {/* Breakdown Status */}
      <Card style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>Pesanan per Status</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          {Object.entries(summary.orders_by_status).map(([status, count]) => (
            <div
              key={status}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                background: 'var(--bg)',
                borderRadius: 'var(--radius)',
              }}
            >
              <Badge status={status} />
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      </Card>

      {/* Pesanan terbaru dalam kartu operasional */}
      <Card>
        <div className="flex justify-between items-center mb-2">
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Antrian Pesanan</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', margin: '3px 0 0' }}>
              Pesanan terbaru yang perlu dipantau atau diproses.
            </p>
          </div>
        </div>

        {recentOrders.length === 0 ? (
          <EmptyState title="Belum Ada Pesanan" description="Pesanan akan muncul di sini setelah ada pelanggan melakukan checkout." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '14px',
            }}
          >
            {recentOrders.map((order) => (
              <article
                key={order.id}
                onClick={() => navigate(`/kasir/orders/${order.id}`)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  padding: '16px',
                  border: '1px solid color-mix(in srgb, var(--accent) 16%, var(--border))',
                  borderRadius: 'var(--radius)',
                  background: 'color-mix(in srgb, var(--accent) 4%, var(--surface))',
                  cursor: 'pointer',
                  transition: 'transform 160ms ease, box-shadow 160ms ease',
                }}
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <strong>{order.order_code}</strong>
                    <div style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: '3px' }}>
                      {formatDate(order.created_at)}
                    </div>
                  </div>
                  <Badge status={order.status} />
                </div>

                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{order.user_name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>@{order.user_username}</div>
                </div>

                <div style={{ minHeight: '42px', color: 'var(--muted)', fontSize: '0.8rem' }}>
                  {order.items?.length
                    ? order.items.map((item) => `${item.quantity}x ${item.menu_name}`).join(', ')
                    : 'Rincian item tidak tersedia'}
                </div>

                <div className="flex justify-between items-center" style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                  <strong style={{ color: 'var(--accent)' }}>{formatCurrency(order.total_amount)}</strong>
                  <span className="inline-flex items-center gap-1" style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                    Detail <ExternalLink size={13} />
                  </span>
                </div>

                {order.status === 'awaiting_confirmation' && (
                  <>
                    {(order as Order & { payment_id?: string; proof_path?: string }).proof_path && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          const paymentId = (order as Order & { payment_id?: string }).payment_id;
                          if (paymentId) handleViewProof(paymentId);
                        }}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '0.8rem' }}
                      >
                        Lihat Bukti Transfer
                      </button>
                    )}
                  </>
                )}
                {order.status === 'awaiting_confirmation' && (
                  <button
                    type="button"
                    className="btn btn-primary inline-flex items-center justify-center gap-1"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleConfirmPayment(order.id);
                    }}
                    disabled={confirmingOrderId === order.id}
                    style={{ width: '100%', padding: '9px 12px', fontSize: '0.8rem' }}
                  >
                    <CheckCircle2 size={15} />
                    {confirmingOrderId === order.id ? 'Mengonfirmasi...' : 'Konfirmasi Pembayaran'}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
        {proofUrl && (
          <div className="modal-overlay" onClick={() => setProofUrl(null)}>
            <div className="modal" onClick={(event) => event.stopPropagation()}>
              <img src={proofUrl} alt="Bukti transfer" style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
              <Button type="button" variant="secondary" onClick={() => setProofUrl(null)}>Tutup</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
