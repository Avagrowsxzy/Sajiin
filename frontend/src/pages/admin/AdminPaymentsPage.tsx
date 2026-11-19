import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../lib/api-client';
import { useToast } from '../../hooks/useToast';
import { formatCurrency, formatDate } from '../../utils/format';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Spinner } from '../../components/Spinner';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { ConfirmModal } from '../../components/Modal';
import type { Payment, PaginatedResponse } from '../../types';

export function AdminPaymentsPage() {
  const toast = useToast();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;

  const [refunding, setRefunding] = useState<Payment | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await apiClient.get<PaginatedResponse<Payment>>(
        `/admin/payments?page=${page}&limit=${limit}`
      );
      setPayments(res.data);
      setTotalPages(Math.ceil(res.meta.total / limit) || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pembayaran');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleRefund = async () => {
    if (!refunding) return;
    try {
      setRefundLoading(true);
      await apiClient.post(`/admin/payments/${refunding.id}/refund`);
      toast.success('Pembayaran berhasil di-refund');
      setRefunding(null);
      await fetchPayments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memproses refund');
    } finally {
      setRefundLoading(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Kelola Pembayaran</h1>

      {loading ? (
        <Spinner center size="lg" />
      ) : error ? (
        <ErrorState message={error} retry={fetchPayments} />
      ) : payments.length === 0 ? (
        <EmptyState
          title="Belum Ada Pembayaran"
          description="Transaksi pembayaran akan muncul di sini setelah pelanggan melakukan checkout."
        />
      ) : (
        <Card>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Gateway Ref</th>
                  <th>Order ID</th>
                  <th>Metode</th>
                  <th>Jumlah</th>
                  <th>Waktu Bayar</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((pay) => (
                  <tr key={pay.id}>
                    <td>
                      <code style={{ fontSize: '0.8rem' }}>{pay.gateway_ref || '-'}</code>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{pay.order_id.slice(0, 8)}...</td>
                    <td>{pay.method || '-'}</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(pay.amount)}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                      {pay.paid_at ? formatDate(pay.paid_at) : '-'}
                    </td>
                    <td>
                      <Badge status={pay.status} />
                    </td>
                    <td>
                      {pay.status === 'settled' ? (
                        <button
                          className="btn btn-danger"
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          onClick={() => setRefunding(pay)}
                        >
                          Refund
                        </button>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />}
        </Card>
      )}

      <ConfirmModal
        isOpen={!!refunding}
        onClose={() => setRefunding(null)}
        onConfirm={handleRefund}
        title="Proses Refund"
        message={`Apakah Anda yakin ingin me-refund pembayaran ${refunding?.gateway_ref} sebesar ${
          refunding ? formatCurrency(refunding.amount) : ''
        }? Dana akan dikembalikan ke pelanggan melalui gateway.`}
        confirmText="Ya, Refund"
        confirmVariant="danger"
        loading={refundLoading}
      />
    </div>
  );
}
