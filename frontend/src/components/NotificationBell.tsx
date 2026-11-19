import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../lib/api-client';
import { formatDate } from '../utils/format';
import type { AppNotification, PaginatedResponse } from '../types';
import { Bell, CreditCard, Package } from 'lucide-react';

const POLL_INTERVAL = 20000; // 20 detik

interface NotificationBellProps {
  orderPathPrefix?: '/orders' | '/admin/orders' | '/kasir/orders';
}

export function NotificationBell({ orderPathPrefix = '/orders' }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [countRes, listRes] = await Promise.all([
        apiClient.get<{ data: { count: number } }>('/me/notifications/unread-count'),
        apiClient.get<PaginatedResponse<AppNotification>>('/me/notifications?page=1&limit=10'),
      ]);
      setUnread(countRes.data.count);
      setItems(listRes.data);
    } catch {
      // senyap — polling akan mencoba lagi
    } finally {
      setLoading(false);
    }
  }, []);

  // Polling berkala + saat tab kembali aktif
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleItemClick = async (notif: AppNotification) => {
    try {
      if (!notif.is_read) {
        await apiClient.patch(`/me/notifications/${notif.id}/read`);
      }
    } finally {
      setOpen(false);
      await refresh();
      if (notif.order_id) navigate(`${orderPathPrefix}/${notif.order_id}`);
    }
  };

  const handleMarkAll = async () => {
    await apiClient.patch('/me/notifications/read-all');
    await refresh();
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn btn-secondary"
        style={{ padding: '6px 12px', fontSize: '1rem', lineHeight: 1 }}
        aria-label="Notifikasi"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-6px',
              right: '-6px',
              background: 'var(--danger)',
              color: '#fff',
              borderRadius: '50%',
              minWidth: '18px',
              height: '18px',
              fontSize: '0.7rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            width: '340px',
            maxHeight: '420px',
            overflowY: 'auto',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 1000,
          }}
        >
          <div
            className="flex justify-between items-center"
            style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}
          >
            <strong style={{ fontSize: '0.9rem' }}>Notifikasi</strong>
            {unread > 0 && (
              <button
                onClick={handleMarkAll}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Tandai semua dibaca
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>Memuat...</div>
          ) : items.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem' }}>
              Belum ada notifikasi
            </div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                onClick={() => handleItemClick(n)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: n.is_read ? 'var(--surface)' : 'rgba(28, 126, 214, 0.06)',
                }}
              >
                <div className="flex items-center gap-1" style={{ marginBottom: '2px' }}>
                  <span style={{ fontSize: '0.85rem' }}>{n.type === 'payment' ? <CreditCard size={15} /> : <Package size={15} />}</span>
                  <strong style={{ fontSize: '0.85rem' }}>{n.title}</strong>
                  {!n.is_read && (
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'var(--info)',
                        display: 'inline-block',
                      }}
                    />
                  )}
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text)', margin: 0 }}>{n.message}</p>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{formatDate(n.created_at)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
