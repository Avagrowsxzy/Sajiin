import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { formatCurrency, formatDate } from '../../utils/format';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Pagination } from '../../components/Pagination';
import type { Order, PaginatedResponse } from '../../types';

export function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;

  const fetchOrders = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

      const res = await apiClient.get<PaginatedResponse<Order>>(
        `/orders?page=${page}&limit=${limit}`
      );

      setOrders(res.data);
      setTotalPages(Math.ceil(res.meta.total / limit) || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pesanan');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchOrders();
    const timer = window.setInterval(() => fetchOrders(true), 5000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchOrders(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchOrders]);

  if (loading) {
    return <Spinner center size="lg" />;
  }

  if (error) {
    return <ErrorState message={error} retry={fetchOrders} />;
  }

  return (
    <div className="flow-page">
      <div className="flow-heading">
        <div>
          <span className="ui-eyebrow">RIWAYAT PESANAN</span><h1 className="page-title" style={{ marginBottom: 0 }}>
            Pesanan Saya
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Pantau status dan riwayat makanan yang telah Anda pesan
          </p>
        </div>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title="Belum Ada Pesanan"
          description="Anda belum pernah melakukan pemesanan makanan."
          action={
            <Link to="/menu" className="btn btn-primary">
              Pesan Sekarang
            </Link>
          }
        />
      ) : (
        <Card>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Kode Pesanan</th>
                  <th>Tanggal</th>
                  <th>Menu</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const summaryItems = order.items
                    ? order.items.map((it) => `${it.quantity}x ${it.menu_name}`).join(', ')
                    : '-';

                  return (
                    <tr
                      key={order.id}
                      onClick={() => navigate(`/orders/${order.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <strong>{order.order_code}</strong>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                        {formatDate(order.created_at)}
                      </td>
                      <td style={{ fontSize: '0.85rem', maxWidth: '300px' }}>
                        {summaryItems.length > 50 ? summaryItems.slice(0, 50) + '...' : summaryItems}
                      </td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(order.total_amount)}</td>
                      <td>
                        <Badge status={order.status} />
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary inline-flex items-center gap-1"
                          style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/orders/${order.id}`);
                          }}
                        >
                          Detail <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={(newPage) => setPage(newPage)}
            />
          )}
        </Card>
      )}
    </div>
  );
}
