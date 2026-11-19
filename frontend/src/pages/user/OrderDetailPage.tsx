import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, Clock, Store, XCircle, RotateCw } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { useToast } from '../../hooks/useToast';
import { formatCurrency, formatDate } from '../../utils/format';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { ErrorState } from '../../components/ErrorState';
import { ConfirmModal } from '../../components/Modal';
import type { Order, Payment, OrderStatus, ClaimPaymentMethod } from '../../types';

const STATUS_STEPS: OrderStatus[] = ['pending', 'awaiting_confirmation', 'paid', 'preparing', 'ready', 'completed'];
const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Menunggu Bayar',
  awaiting_confirmation: 'Menunggu Konfirmasi Admin',
  paid: 'Pembayaran Dikonfirmasi',
  preparing: 'Sedang Disiapkan',
  ready: 'Pesanan Sudah Jadi',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [paymentInstructions, setPaymentInstructions] = useState('');
  const [paymentAccount, setPaymentAccount] = useState({ bank_name: '', account_number: '', account_name: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Klaim bayar
  const [claimMethod, setClaimMethod] = useState<ClaimPaymentMethod>('transfer');
  const [claimLoading, setClaimLoading] = useState(false);
  const [proofData, setProofData] = useState('');
  const [proofMime, setProofMime] = useState('');
  const [proofLoading, setProofLoading] = useState(false);

  // Batalkan pesanan
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const fetchOrderDetail = useCallback(async (silent = false) => {
    if (!id) return;
    try {
      if (!silent) setLoading(true);
      setError(null);

      const res = await apiClient.get<{ data: Order }>(`/orders/${id}`);
      setOrder(res.data);

      try {
        const payRes = await apiClient.get<{ data: Payment }>(`/orders/${id}/payment`);
        setPayment(payRes.data);
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
    fetchOrderDetail();
    const timer = window.setInterval(() => fetchOrderDetail(true), 5000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchOrderDetail(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchOrderDetail]);

  // Countdown 5 menit untuk pesanan yang belum dikonfirmasi / belum unggah bukti transfer
  const isSubjectToTimeout =
    !!order &&
    (order.status === 'pending' || order.status === 'awaiting_confirmation') &&
    !(payment?.method === 'transfer' && payment?.proof_path);

  useEffect(() => {
    if (!order || !isSubjectToTimeout) {
      setRemainingSeconds(null);
      return;
    }

    const expiresAt = new Date(order.created_at).getTime() + 5 * 60 * 1000;
    const updateCountdown = () => {
      const diffSec = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setRemainingSeconds(diffSec);
      if (diffSec === 0) {
        fetchOrderDetail(true);
      }
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [order, isSubjectToTimeout, fetchOrderDetail]);

  // Instruksi pembayaran (dari pengaturan admin, memerlukan autentikasi)
  useEffect(() => {
    apiClient
      .get<{ data: { payment_instructions: string; bank_name: string; account_number: string; account_name: string } }>('/settings/payment')
      .then((res) => {
        setPaymentInstructions(res.data.payment_instructions);
        setPaymentAccount({ bank_name: res.data.bank_name, account_number: res.data.account_number, account_name: res.data.account_name });
      })
      .catch(() => setPaymentInstructions('Instruksi pembayaran belum tersedia.'));
  }, []);

  const handleClaimPayment = async () => {
    if (!id) return;
    try {
      setClaimLoading(true);
      await apiClient.post(`/orders/${id}/payment`, { method: claimMethod });
      toast.success('Klaim pembayaran terkirim! Menunggu konfirmasi admin.');
      await fetchOrderDetail();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengirim klaim pembayaran');
    } finally {
      setClaimLoading(false);
    }
  };

  const handleProofUpload = async () => {
    if (!id || !proofData) return;
    try {
      setProofLoading(true);
      await apiClient.post(`/payments/orders/${id}/proof`, { proof_data: proofData, mime: proofMime });
      toast.success('Bukti transfer berhasil diunggah');
      setProofData('');
      await fetchOrderDetail();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengunggah bukti transfer');
    } finally { setProofLoading(false); }
  };

  const handleCancelOrder = async () => {
    if (!id) return;
    try {
      setCancelling(true);
      const res = await apiClient.post<{ data: Order }>(`/orders/${id}/cancel`);
      setOrder(res.data);
      setShowCancelModal(false);
      toast.success('Pesanan berhasil dibatalkan');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal membatalkan pesanan');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return <Spinner center size="lg" />;
  }

  if (error || !order) {
    return <ErrorState message={error || 'Pesanan tidak ditemukan'} retry={fetchOrderDetail} />;
  }

  const currentStepIdx = STATUS_STEPS.indexOf(order.status);
  const isCancelled = order.status === 'cancelled';

  return (
    <div className="flow-page">
      <div className="flex justify-between items-center mb-2" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Link to="/orders" className="inline-flex items-center gap-1" style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
              <ArrowLeft size={14} /> Kembali ke Pesanan Saya
            </Link>
          </div>
          <span className="ui-eyebrow">DETAIL PESANAN</span><h1 className="page-title" style={{ marginBottom: 0 }}>
            Pesanan #{order.order_code}
          </h1>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="secondary" onClick={() => fetchOrderDetail()} style={{ fontSize: '0.85rem' }}>
            <RotateCw size={14} /> Segarkan Status
          </Button>

          {(order.status === 'pending' || (order.status === 'awaiting_confirmation' && !payment?.proof_path)) && (
            <Button
              variant="danger"
              onClick={() => setShowCancelModal(true)}
              style={{ fontSize: '0.85rem' }}
            >
              Batalkan Pesanan
            </Button>
          )}
        </div>
      </div>

      {/* Stepper Status / Alert */}
      <Card className="mb-2">
        {isCancelled ? (
          <div
            className="inline-flex items-center justify-center gap-2 w-full"
            style={{
              padding: '16px',
              background: '#f8d7da',
              color: '#721c24',
              borderRadius: 'var(--radius)',
              textAlign: 'center',
              fontWeight: 600,
            }}
          >
            <XCircle size={18} /> Pesanan ini telah DIBATALKAN.
          </div>
        ) : (
          <div className="stepper">
            {STATUS_STEPS.map((step, idx) => {
              const isPassed = currentStepIdx > idx;
              const isCurrent = currentStepIdx === idx;

              return (
                <div
                  key={step}
                  className={`step-item ${isPassed ? 'completed' : ''} ${isCurrent ? 'active' : ''}`}
                >
                  <div className="step-circle">{isPassed ? <Check size={14} /> : idx + 1}</div>
                  <span className="step-label">{STATUS_LABELS[step]}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid-2">
        {/* Kiri: Item pesanan */}
        <div>
          <Card>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '16px' }}>
              Item Pesanan
            </h2>

            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Menu</th>
                    <th>Harga Satuan</th>
                    <th>Qty</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.menu_name}</strong>
                      </td>
                      <td>{formatCurrency(item.unit_price)}</td>
                      <td>{item.quantity}</td>
                      <td style={{ fontWeight: 600 }}>
                        {formatCurrency(item.subtotal ?? item.unit_price * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: '16px',
                marginTop: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div className="flex justify-between" style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
                <span>Subtotal</span>
                <span>{formatCurrency(order.total_amount)}</span>
              </div>
              <div
                className="flex justify-between"
                style={{
                  borderTop: '1px solid var(--border)',
                  paddingTop: '10px',
                  fontSize: '1.15rem',
                  fontWeight: 700,
                }}
              >
                <span>Total Biaya</span>
                <span style={{ color: 'var(--accent)' }}>{formatCurrency(order.total_amount)}</span>
              </div>
            </div>

            {order.notes && (
              <div style={{ marginTop: '16px' }}>
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Catatan Khusus:</span>
                <div
                  style={{
                    background: 'var(--bg)',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius)',
                    marginTop: '4px',
                    fontSize: '0.9rem',
                  }}
                >
                  {order.notes}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Kanan: Pembayaran + info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Kartu Pembayaran */}
          <Card>
            <div className="flex justify-between items-center mb-1">
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Pembayaran</h2>
              {payment && <Badge status={payment.status} />}
            </div>

            {order.status === 'pending' && !payment && (
              <div>
                <div
                  style={{
                    background: 'var(--bg)',
                    padding: '14px',
                    borderRadius: 'var(--radius)',
                    fontSize: '0.875rem',
                    lineHeight: 1.6,
                    marginBottom: '16px',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {paymentInstructions}
                </div>

                <div className="form-group">
                  <label className="form-label">Metode Pembayaran</label>
                  <select
                    className="form-select"
                    value={claimMethod}
                    onChange={(e) => setClaimMethod(e.target.value as ClaimPaymentMethod)}
                  >
                    <option value="transfer">Transfer Bank</option>
                    <option value="tunai">Tunai di Kasir</option>
                  </select>
                </div>

                <Button
                  variant="primary"
                  onClick={handleClaimPayment}
                  loading={claimLoading}
                  style={{ width: '100%' }}
                >
                  <Check size={16} /> Saya Sudah Bayar
                </Button>
              </div>
            )}

            {isSubjectToTimeout && remainingSeconds !== null && (
              <div
                style={{
                  background: remainingSeconds <= 60 ? '#fef2f2' : '#fffbeb',
                  border: `1px solid ${remainingSeconds <= 60 ? '#fecaca' : '#fde68a'}`,
                  color: remainingSeconds <= 60 ? '#991b1b' : '#92400e',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.85rem',
                  marginBottom: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span>
                  {payment?.method === 'transfer'
                    ? 'Unggah bukti transfer sebelum waktu habis agar pesanan tidak dibatalkan otomatis:'
                    : 'Selesaikan konfirmasi pembayaran di kasir sebelum waktu habis:'}
                </span>
                <strong style={{ fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:
                  {String(remainingSeconds % 60).padStart(2, '0')}
                </strong>
              </div>
            )}

            {order.status === 'awaiting_confirmation' && (
              <div
                className="flex items-start gap-2"
                style={{
                  background: payment?.method === 'transfer' && payment?.proof_path ? '#ecfdf5' : '#fff3cd',
                  color: payment?.method === 'transfer' && payment?.proof_path ? '#065f46' : '#856404',
                  padding: '14px',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                <Clock size={18} className="shrink-0 mt-0.5" />
                <span>
                  {payment?.method === 'transfer' && payment?.proof_path ? (
                    <>
                      Bukti transfer Anda <strong>telah diterima</strong>. Pesanan aman dari pembatalan otomatis dan sedang menunggu kasir memvalidasi pembayaran.
                    </>
                  ) : (
                    <>
                      Klaim pembayaran Anda ({payment?.method || '-'}) sedang <strong>menunggu konfirmasi</strong>. Anda akan menerima notifikasi setelah dikonfirmasi.
                    </>
                  )}
                </span>
              </div>
            )}

            {order.status === 'awaiting_confirmation' && payment?.method === 'transfer' && (
              <div className="payment-instructions-box" style={{ marginTop: '12px' }}>
                <strong>Tujuan Transfer</strong>
                <div className="payment-account-details">
                  <span>Bank<strong>{paymentAccount.bank_name}</strong></span>
                  <span>No. Rekening<strong>{paymentAccount.account_number}</strong></span>
                  <span>Atas Nama<strong>{paymentAccount.account_name}</strong></span>
                </div>
                <p>{paymentInstructions}</p>
              </div>
            )}

            {order.status === 'awaiting_confirmation' && payment?.method === 'transfer' && !payment.proof_path && (
              <div style={{ marginTop: '12px' }}>
                <label className="form-label" htmlFor="payment-proof">Bukti Transfer</label>
                <input
                  id="payment-proof"
                  className="form-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) { toast.error('Ukuran bukti maksimal 5MB'); return; }
                    setProofMime(file.type);
                    const reader = new FileReader();
                    reader.onload = () => setProofData(String(reader.result));
                    reader.readAsDataURL(file);
                  }}
                />
                {proofData && <Button type="button" loading={proofLoading} onClick={handleProofUpload} style={{ width: '100%', marginTop: '8px' }}>Unggah Bukti Transfer</Button>}
              </div>
            )}

            {payment && order.status !== 'pending' && order.status !== 'awaiting_confirmation' && (
              <div style={{ fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Metode:</span>
                  <strong>{payment.method || 'Online Payment'}</strong>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Jumlah:</span>
                  <strong>{formatCurrency(payment.amount)}</strong>
                </div>
                {payment.paid_at && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--muted)' }}>Dikonfirmasi:</span>
                    <span>{formatDate(payment.paid_at)}</span>
                  </div>
                )}
              </div>
            )}

            {!payment && order.status !== 'pending' && order.status !== 'awaiting_confirmation' && (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '8px 0' }}>
                Tidak ada data pembayaran.
              </p>
            )}
          </Card>

          {/* Info pesanan */}
          <Card>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '14px' }}>
              Informasi Pesanan
            </h2>

            <div style={{ fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--muted)' }}>Waktu Pemesanan:</span>
                <strong>{formatDate(order.created_at)}</strong>
              </div>
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--muted)' }}>Pengambilan:</span>
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Store size={15} /> Ambil Sendiri
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--muted)' }}>Status:</span>
                <strong>{STATUS_LABELS[order.status]}</strong>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Konfirmasi batalkan */}
      <ConfirmModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleCancelOrder}
        title="Batalkan Pesanan"
        message="Apakah Anda yakin ingin membatalkan pesanan ini? Stok yang telah dikunci akan dikembalikan."
        confirmText="Ya, Batalkan"
        confirmVariant="danger"
        loading={cancelling}
      />
    </div>
  );
}
