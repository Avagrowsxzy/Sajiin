import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { formatCurrency, formatDate } from '../../utils/format';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import type { Order, OrderStatus, PaginatedResponse } from '../../types';

const ALL_STATUSES: OrderStatus[] = [
  'pending',
  'awaiting_confirmation',
  'paid',
  'preparing',
  'ready',
  'completed',
  'cancelled',
];

export function AdminOrdersPage({ routePrefix = '/admin/orders' }: { routePrefix?: string }) {
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;

  const [filterStatus, setFilterStatus] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');

  const fetchOrders = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (filterStatus) params.set('status', filterStatus);
      if (dateFrom) params.set('date_from', `${dateFrom}T00:00:00.000Z`);
      if (dateTo) params.set('date_to', `${dateTo}T23:59:59.999Z`);
      if (activeQuery) params.set('q', activeQuery);

      const res = await apiClient.get<PaginatedResponse<Order>>(`/admin/orders?${params.toString()}`);
      setOrders(res.data);
      setTotalPages(Math.ceil(res.meta.total / limit) || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pesanan');
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, dateFrom, dateTo, activeQuery]);

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

  const resetFilters = () => {
    setFilterStatus('');
    setDateFrom('');
    setDateTo('');
    setSearchInput('');
    setActiveQuery('');
    setPage(1);
  };

  return (
    <div>
      <h1 className="page-title">Kelola Pesanan</h1>

      {/* Filter Bar */}
      <Card style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0, width: '170px' }}>
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua Status</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Dari Tanggal</label>
            <input
              type="date"
              className="form-input"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Sampai Tanggal</label>
            <input
              type="date"
              className="form-input"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <form
            className="flex gap-1"
            style={{ flex: 1, minWidth: '220px' }}
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setActiveQuery(searchInput.trim());
            }}
          >
            <div style={{ flex: 1 }}>
              <label className="form-label">Cari</label>
              <input
                className="form-input"
                placeholder="Kode pesanan / nama / username pelanggan..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary" style={{ alignSelf: 'flex-end' }}>
              Cari
            </Button>
          </form>

          <Button variant="secondary" onClick={resetFilters} style={{ alignSelf: 'flex-end' }}>
            Reset
          </Button>
        </div>
      </Card>

      {loading ? (
        <Spinner center size="lg" />
      ) : error ? (
        <ErrorState message={error} retry={fetchOrders} />
      ) : orders.length === 0 ? (
        <EmptyState title="Tidak Ada Pesanan" description="Tidak ada pesanan yang sesuai dengan filter yang dipilih." />
      ) : (
        <Card>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Pelanggan</th>
                  <th>Tanggal</th>
                  <th>Item</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.order_code}</strong>
                    </td>
                    <td>
                      {order.user_name}
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>@{order.user_username}</div>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{formatDate(order.created_at)}</td>
                    <td style={{ fontSize: '0.85rem', maxWidth: '220px' }}>
                      {order.items?.map((it) => `${it.quantity}x ${it.menu_name}`).join(', ')}
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(order.total_amount)}</td>
                    <td>
                      <Badge status={order.status} />
                    </td>
                      <td>
                        <button
                          className="btn btn-secondary inline-flex items-center gap-1"
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          onClick={() => navigate(`${routePrefix}/${order.id}`)}
                        >
                          Detail <ChevronRight size={13} />
                        </button>
                      </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />}
        </Card>
      )}
    </div>
  );
}
