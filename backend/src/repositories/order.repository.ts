import mysql from 'mysql2/promise';
import { appPool } from '../config/database.js';
import { RequestContext, OrderStatus } from '../types/index.js';

export interface OrderItemEntity {
  id: string;
  order_id: string;
  menu_item_id: string;
  menu_name?: string;
  quantity: number;
  unit_price: number;
}

export interface OrderEntity {
  id: string;
  order_code: string;
  user_id: string;
  user_name?: string;
  user_username?: string;
  status: OrderStatus;
  total_amount: number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  items?: OrderItemEntity[];
}

export interface OrderFilterParams {
  status?: OrderStatus;
  date_from?: string;
  date_to?: string;
  q?: string;
  page: number;
  limit: number;
}

export class OrderRepository {
  constructor(private pool: mysql.Pool = appPool) {}

  /**
   * Buat pesanan baru beserta order_items dalam transaksi yang diberikan
   */
  async createOrder(
    order: {
      id: string;
      order_code: string;
      user_id: string;
      status: OrderStatus;
      total_amount: number;
      notes?: string | null;
    },
    items: {
      id: string;
      menu_item_id: string;
      quantity: number;
      unit_price: number;
    }[],
    conn: mysql.Connection
  ): Promise<void> {
    await conn.query(
      `INSERT INTO orders (id, order_code, user_id, status, total_amount, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        order.id,
        order.order_code,
        order.user_id,
        order.status,
        order.total_amount,
        order.notes ?? null,
      ]
    );

    for (const item of items) {
      await conn.query(
        `INSERT INTO order_items (id, order_id, menu_item_id, quantity, unit_price)
         VALUES (?, ?, ?, ?, ?)`,
        [item.id, order.id, item.menu_item_id, item.quantity, item.unit_price]
      );
    }
  }

  /**
   * Cari pesanan berdasarkan ID dengan pengamanan scoping (DATABASE.md bagian 9)
   * Jika ctx.role === 'user', otomatis menyertakan WHERE o.user_id = ctx.userId
   */
  async findById(
    id: string,
    ctx?: RequestContext,
    conn?: mysql.Connection
  ): Promise<OrderEntity | null> {
    const executor = conn || this.pool;
    const conditions: string[] = ['o.id = ?'];
    const values: (string | number)[] = [id];

    if (ctx && ctx.role === 'user') {
      conditions.push('o.user_id = ?');
      values.push(ctx.userId);
    }

    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT o.*, u.full_name as user_name, u.username as user_username
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE ${conditions.join(' AND ')}`,
      values
    );

    if (rows.length === 0) return null;

    const order = this.mapToEntity(rows[0]);
    order.items = await this.getOrderItems(order.id, executor);
    return order;
  }

  /**
   * Kunci baris pesanan (SELECT ... FOR UPDATE) di dalam transaksi yang diberikan.
   *
   * Finding C-F1: tanpa kunci ini, dua operasi paralel (mis. user batalkan vs admin konfirmasi
   * pembayaran) sama-sama membaca status lama lalu sama-sama menulis, sehingga stok bisa
   * dikembalikan namun pesanan tetap aktif (oversell). Kunci baris membuat transaksi kedua
   * menunggu hingga commit dan membaca status terbaru.
   */
  async lockForUpdate(id: string, conn: mysql.Connection): Promise<void> {
    await conn.query('SELECT id FROM orders WHERE id = ? FOR UPDATE', [id]);
  }

  /**
   * Ambil item-item pesanan
   */
  async getOrderItems(
    orderId: string,
    executor: mysql.Connection | mysql.Pool = this.pool
  ): Promise<OrderItemEntity[]> {
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT oi.*, m.name as menu_name
       FROM order_items oi
       JOIN menu_items m ON oi.menu_item_id = m.id
       WHERE oi.order_id = ?
       ORDER BY oi.id ASC`,
      [orderId]
    );

    return rows.map((r) => ({
      id: r.id,
      order_id: r.order_id,
      menu_item_id: r.menu_item_id,
      menu_name: r.menu_name,
      quantity: Number(r.quantity),
      unit_price: Number(r.unit_price),
    }));
  }

  /**
   * Riwayat pesanan milik pengguna sendiri (scoped)
   */
  async findByUser(
    ctx: RequestContext,
    page: number = 1,
    limit: number = 20,
    conn?: mysql.Connection
  ): Promise<{ data: OrderEntity[]; total: number }> {
    const executor = conn || this.pool;
    const offset = (page - 1) * limit;

    const [countRows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM orders WHERE user_id = ?',
      [ctx.userId]
    );
    const total = Number(countRows[0].total);

    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT o.*
       FROM orders o
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [ctx.userId, limit, offset]
    );

    const orders = rows.map(this.mapToEntity);
    for (const ord of orders) {
      ord.items = await this.getOrderItems(ord.id, executor);
    }

    return { data: orders, total };
  }

  /**
   * Daftar semua pesanan untuk Admin / Audit (dengan filter dan pencarian)
   */
  async findAll(
    params: OrderFilterParams,
    conn?: mysql.Connection
  ): Promise<{ data: OrderEntity[]; total: number }> {
    const executor = conn || this.pool;
    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (params.status) {
      conditions.push('o.status = ?');
      values.push(params.status);
    }

    if (params.date_from) {
      conditions.push('o.created_at >= ?');
      values.push(params.date_from);
    }

    if (params.date_to) {
      conditions.push('o.created_at < ?');
      values.push(params.date_to);
    }

    if (params.q && params.q.trim()) {
      conditions.push('(o.order_code LIKE ? OR u.full_name LIKE ? OR u.username LIKE ?)');
      const pattern = `%${params.q.trim()}%`;
      values.push(pattern, pattern, pattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) as total
       FROM orders o
       JOIN users u ON o.user_id = u.id
       ${whereClause}`,
      values
    );
    const total = Number(countRows[0].total);

    const offset = (params.page - 1) * params.limit;
    const queryValues = [...values, params.limit, offset];

    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT o.*, u.full_name as user_name, u.username as user_username
       FROM orders o
       JOIN users u ON o.user_id = u.id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      queryValues
    );

    const orders = rows.map(this.mapToEntity);
    for (const ord of orders) {
      ord.items = await this.getOrderItems(ord.id, executor);
    }

    return { data: orders, total };
  }

  /**
   * Update status pesanan
   */
  async updateStatus(
    id: string,
    status: OrderStatus,
    conn?: mysql.Connection
  ): Promise<void> {
    const executor = conn || this.pool;
    await executor.query(
      'UPDATE orders SET status = ? WHERE id = ?',
      [status, id]
    );
  }

  /**
   * Cari pesanan pending yang sudah lewat dari n menit (untuk auto-cancel job)
   */
  async findExpiredPendingOrders(
    expiryMinutes: number = 30,
    conn?: mysql.Connection
  ): Promise<OrderEntity[]> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT o.*
       FROM orders o
       WHERE o.status = 'pending'
         AND o.created_at < DATE_SUB(NOW(3), INTERVAL ? MINUTE)`,
      [expiryMinutes]
    );

    const orders = rows.map(this.mapToEntity);
    for (const ord of orders) {
      ord.items = await this.getOrderItems(ord.id, executor);
    }
    return orders;
  }

  private mapToEntity(row: mysql.RowDataPacket): OrderEntity {
    return {
      id: row.id,
      order_code: row.order_code,
      user_id: row.user_id,
      user_name: row.user_name,
      user_username: row.user_username,
      status: row.status as OrderStatus,
      total_amount: Number(row.total_amount),
      notes: row.notes,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}
