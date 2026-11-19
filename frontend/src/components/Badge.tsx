import { ReactNode } from 'react';
import { cn } from '../lib/utils';
import type { OrderStatus, PaymentStatus } from '../types';

type BadgeStatus = OrderStatus | PaymentStatus | 'active' | 'inactive' | 'locked' | (string & Record<never, never>);

interface BadgeProps {
  status?: BadgeStatus;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  children?: ReactNode;
  className?: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Menunggu',
  awaiting_confirmation: 'Menunggu Konfirmasi',
  paid: 'Dibayar',
  preparing: 'Disiapkan',
  ready: 'Siap Diambil',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
  settled: 'Berhasil',
  failed: 'Gagal',
  refunded: 'Dikembalikan',
  active: 'Aktif',
  inactive: 'Nonaktif',
  locked: 'Terkunci',
};

export function Badge({ status, variant, children, className }: BadgeProps) {
  const resolvedClass = status ? `badge-${status}` : variant ? `ui-badge-${variant}` : '';
  const label = children || (status ? STATUS_LABELS[status] || status : null);

  return <span className={cn('badge', resolvedClass, className)}>{label}</span>;
}
