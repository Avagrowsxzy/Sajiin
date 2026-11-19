import mysql from 'mysql2/promise';
import { appPool } from '../config/database.js';
import { RequestContext, PaginationParams } from '../types/index.js';

export interface NotificationEntity {
  id: string;
  user_id: string;
  type: 'order' | 'payment';
  title: string;
  message: string;
  order_id: string | null;
  is_read: boolean;
  created_at: Date;
}

export class NotificationRepository {
  constructor(private pool: mysql.Pool = appPool) {}

  /**
   * Buat notifikasi baru (dipanggil dalam transaksi bersama aksi terkait)
   */
  async create(
    data: {
      id: string;
      userId: string;
      type: 'order' | 'payment';
      title: string;
      message: string;
      orderId?: string | null;
    },
    conn?: mysql.Connection
  ): Promise<void> {
    const executor = conn || this.pool;
    await executor.query(
      `INSERT INTO notifications (id, user_id, type, title, message, order_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.id, data.userId, data.type, data.title, data.message, data.orderId ?? null]
    );
  }

  /**
   * Daftar notifikasi milik user (scoped — DATABASE.md bagian 9)
   */
  async findByUser(
    ctx: RequestContext,
    pagination: PaginationParams,
    unreadOnly: boolean = false,
    conn?: mysql.Connection
  ): Promise<{ data: NotificationEntity[]; total: number }> {
    const executor = conn || this.pool;
    const offset = (pagination.page - 1) * pagination.limit;

    const where = unreadOnly
      ? 'WHERE user_id = ? AND is_read = 0'
      : 'WHERE user_id = ?';

    const [countRows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM notifications ${where}`,
      [ctx.userId]
    );
    const total = Number(countRows[0].total);

    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [ctx.userId, pagination.limit, offset]
    );

    return { data: rows.map(this.map), total };
  }

  /**
   * Jumlah notifikasi belum dibaca (untuk badge lonceng)
   */
  async countUnread(ctx: RequestContext, conn?: mysql.Connection): Promise<number> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM notifications WHERE user_id = ? AND is_read = 0',
      [ctx.userId]
    );
    return Number(rows[0].total);
  }

  /**
   * Tandai satu notifikasi dibaca (milik sendiri — anti IDOR)
   */
  async markAsRead(ctx: RequestContext, notificationId: string, conn?: mysql.Connection): Promise<boolean> {
    const executor = conn || this.pool;
    const [result] = await executor.query<mysql.ResultSetHeader>(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ? AND is_read = 0',
      [notificationId, ctx.userId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Tandai semua notifikasi user sebagai dibaca
   */
  async markAllAsRead(ctx: RequestContext, conn?: mysql.Connection): Promise<void> {
    const executor = conn || this.pool;
    await executor.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [ctx.userId]
    );
  }

  /**
   * ID semua admin aktif (penerima notifikasi pesanan baru / klaim bayar)
   */
  async getActiveAdminIds(conn?: mysql.Connection): Promise<string[]> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT id FROM users WHERE role_id IN (1, 4) AND is_active = 1'
    );
    return rows.map((r) => r.id as string);
  }

  private map(row: mysql.RowDataPacket): NotificationEntity {
    return {
      id: row.id,
      user_id: row.user_id,
      type: row.type,
      title: row.title,
      message: row.message,
      order_id: row.order_id,
      is_read: Boolean(row.is_read),
      created_at: new Date(row.created_at),
    };
  }
}
