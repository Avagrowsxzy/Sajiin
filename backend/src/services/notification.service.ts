import crypto from 'crypto';
import mysql from 'mysql2/promise';
import { NotificationRepository } from '../repositories/notification.repository.js';
import { RequestContext, PaginationParams } from '../types/index.js';

const notificationRepo = new NotificationRepository();

export interface CreateNotificationInput {
  userId: string;
  type: 'order' | 'payment';
  title: string;
  message: string;
  orderId?: string | null;
}

/**
 * Tulis satu notifikasi (opsional di dalam transaksi yang sama dengan aksi terkait)
 */
export async function writeNotification(
  input: CreateNotificationInput,
  conn?: mysql.Connection
): Promise<void> {
  await notificationRepo.create(
    { id: crypto.randomUUID(), ...input },
    conn
  );
}

/**
 * Kirim notifikasi ke semua admin aktif (mis. pesanan baru / klaim pembayaran)
 */
export async function notifyAdmins(
  input: { type: 'order' | 'payment'; title: string; message: string; orderId?: string | null },
  conn?: mysql.Connection
): Promise<void> {
  const adminIds = await notificationRepo.getActiveAdminIds(conn);
  for (const adminId of adminIds) {
    await writeNotification({ userId: adminId, ...input }, conn);
  }
}

export class NotificationService {
  /**
   * Daftar notifikasi milik user (scoped)
   */
  async list(ctx: RequestContext, pagination: PaginationParams, unreadOnly: boolean) {
    const { data, total } = await notificationRepo.findByUser(ctx, pagination, unreadOnly);
    return { data, meta: { page: pagination.page, limit: pagination.limit, total } };
  }

  /**
   * Jumlah belum dibaca (badge lonceng)
   */
  async unreadCount(ctx: RequestContext): Promise<number> {
    return notificationRepo.countUnread(ctx);
  }

  /**
   * Tandai satu notifikasi dibaca (404 jika tidak ada / bukan milik user — anti IDOR)
   */
  async markRead(ctx: RequestContext, notificationId: string): Promise<void> {
    const ok = await notificationRepo.markAsRead(ctx, notificationId);
    if (!ok) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Notifikasi tidak ditemukan' };
    }
  }

  /**
   * Tandai semua notifikasi user sebagai dibaca
   */
  async markAllRead(ctx: RequestContext): Promise<void> {
    await notificationRepo.markAllAsRead(ctx);
  }
}
