import crypto from 'crypto';
import { appPool } from '../config/database.js';
import { OrderRepository, OrderEntity } from '../repositories/order.repository.js';
import { PaymentRepository } from '../repositories/payment.repository.js';
import { CartRepository } from '../repositories/cart.repository.js';
import { writeAudit } from './audit.service.js';
import { writeNotification, notifyAdmins } from './notification.service.js';
import { RequestContext, OrderStatus, PaginatedResponse } from '../types/index.js';
import mysql from 'mysql2/promise';

// State machine alur pesan-ambil: user bayar (transfer/tunai) -> klaim ->
// admin konfirmasi pembayaran -> admin proses -> admin tandai pesanan sudah jadi (ready) ->
// selesai (sudah diambil). Nanti jika QRIS/gateway otomatis dibuat, langkah klaim
// digantikan webhook dan alur admin tetap sama.
const VALID_TRANSITIONS: Record<OrderStatus, { to: OrderStatus; by: string[] }[]> = {
  pending:              [
    { to: 'awaiting_confirmation', by: ['user'] },
    { to: 'cancelled',             by: ['user', 'admin'] },
  ],
  awaiting_confirmation:[
    { to: 'paid',      by: ['admin'] },
    { to: 'cancelled', by: ['user', 'admin'] },
  ],
  paid:                 [
    { to: 'preparing', by: ['admin'] },
    { to: 'cancelled', by: ['admin'] },
  ],
  preparing:            [{ to: 'ready',     by: ['admin'] }],
  ready:                [{ to: 'completed', by: ['admin'] }],
  completed:            [],
  cancelled:            [],
};

function generateOrderCode(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${ts}-${rand}`.substring(0, 20);
}

export class OrderService {
  constructor(
    private orderRepo = new OrderRepository(),
    private paymentRepo = new PaymentRepository(),
    private cartRepo = new CartRepository(),
  ) {}

  /**
   * Checkout dari keranjang (API.md detail POST /orders)
   * Seluruh proses dalam satu transaksi DB
   */
  async checkout(
    ctx: RequestContext,
    input: { notes?: string | null; payment_method?: 'transfer' | 'tunai' },
    ipAddress?: string | null
  ): Promise<OrderEntity> {
    const conn = await appPool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Ambil keranjang, tolak jika kosong
      const cart = await this.cartRepo.findByUserId(ctx, conn);
      if (!cart.id || cart.items.length === 0) {
        throw { status: 400, code: 'EMPTY_CART', message: 'Keranjang kosong' };
      }

      // 2. Kunci baris menu FOR UPDATE, cek ketersediaan & stok
      let totalAmount = 0;
      const orderItems: { id: string; menu_item_id: string; quantity: number; unit_price: number }[] = [];

      for (const cartItem of cart.items) {
        const [menuRows] = await conn.query<mysql.RowDataPacket[]>(
          'SELECT id, price, stock, is_available FROM menu_items WHERE id = ? FOR UPDATE',
          [cartItem.menu_item_id]
        );

        if (menuRows.length === 0 || !menuRows[0].is_available) {
          throw {
            status: 409,
            code: 'ITEM_UNAVAILABLE',
            message: `Menu "${cartItem.menu_name}" tidak tersedia`,
          };
        }

        const menu = menuRows[0];
        if (Number(menu.stock) < cartItem.quantity) {
          throw {
            status: 409,
            code: 'INSUFFICIENT_STOCK',
            message: `Stok "${cartItem.menu_name}" tidak mencukupi (tersisa ${menu.stock})`,
          };
        }

        // Kurangi stok
        await conn.query(
          'UPDATE menu_items SET stock = stock - ? WHERE id = ?',
          [cartItem.quantity, cartItem.menu_item_id]
        );

        const unitPrice = Number(menu.price);
        totalAmount += unitPrice * cartItem.quantity;

        orderItems.push({
          id: crypto.randomUUID(),
          menu_item_id: cartItem.menu_item_id,
          quantity: cartItem.quantity,
          unit_price: unitPrice,
        });
      }

      // 4. Buat pesanan
      const orderId = crypto.randomUUID();
      const orderCode = generateOrderCode();

      await this.orderRepo.createOrder(
        {
          id: orderId,
          order_code: orderCode,
          user_id: ctx.userId,
          status: 'pending',
          total_amount: totalAmount,
          notes: input.notes,
        },
        orderItems,
        conn
      );

      if (input.payment_method) {
        const paymentId = crypto.randomUUID();
        await this.paymentRepo.create({
          id: paymentId,
          order_id: orderId,
          amount: totalAmount,
          method: input.payment_method,
        }, conn);
        await this.orderRepo.updateStatus(orderId, 'awaiting_confirmation', conn);
      }

      // 5. Kosongkan keranjang
      await this.cartRepo.clear(ctx, conn);

      // 5b. Notifikasi ke semua admin: ada pesanan baru menunggu pembayaran
      await notifyAdmins(
        {
          type: 'order',
          title: 'Pesanan Baru',
          message: input.payment_method
            ? `Pesanan ${orderCode} dibuat dengan metode ${input.payment_method}, menunggu validasi kasir.`
            : `Pesanan ${orderCode} dibuat, menunggu pembayaran.`,
          orderId,
        },
        conn
      );

      // 6. Audit log (langkah terakhir transaksi)
      await writeAudit(
        {
          actorId: ctx.userId,
          action: 'ORDER_CREATE',
          entity: 'orders',
          entity_id: orderId,
           new_value: { order_code: orderCode, total_amount: totalAmount, item_count: orderItems.length, payment_method: input.payment_method || null },
          ipAddress,
        },
        conn
      );

      await conn.commit();

      // Ambil order lengkap untuk respons
      const order = await this.orderRepo.findById(orderId, ctx);
      if (!order) throw new Error('Order baru tidak ditemukan setelah commit');
      return order;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Batalkan otomatis pesanan yang lewat 5 menit tanpa bukti transfer (untuk transfer)
   * atau belum divalidasi kasir (untuk tunai / pending).
   */
  async cancelExpiredOrders(): Promise<number> {
    const [candidates] = await appPool.query<mysql.RowDataPacket[]>(
      `SELECT o.id
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.id
       WHERE o.status IN ('pending', 'awaiting_confirmation')
         AND o.created_at <= DATE_SUB(NOW(3), INTERVAL 5 MINUTE)
         AND (p.id IS NULL OR p.method <> 'transfer' OR p.proof_path IS NULL)`
    );

    if (candidates.length === 0) return 0;

    let cancelledCount = 0;
    const conn = await appPool.getConnection();
    try {
      for (const candidate of candidates) {
        await conn.beginTransaction();
        try {
          const [rows] = await conn.query<mysql.RowDataPacket[]>(
            `SELECT o.id, o.order_code, o.user_id, o.status,
                    p.id AS payment_id, p.status AS payment_status, p.method, p.proof_path
             FROM orders o
             LEFT JOIN payments p ON p.order_id = o.id
             WHERE o.id = ?
               AND o.status IN ('pending', 'awaiting_confirmation')
               AND o.created_at <= DATE_SUB(NOW(3), INTERVAL 5 MINUTE)
               AND (p.id IS NULL OR p.method <> 'transfer' OR p.proof_path IS NULL)
             FOR UPDATE`,
            [candidate.id]
          );

          if (rows.length === 0) {
            await conn.rollback();
            continue;
          }

          const expired = rows[0];
          const [items] = await conn.query<mysql.RowDataPacket[]>(
            'SELECT menu_item_id, quantity FROM order_items WHERE order_id = ?',
            [expired.id]
          );

          for (const item of items) {
            await conn.query(
              'UPDATE menu_items SET stock = stock + ? WHERE id = ?',
              [item.quantity, item.menu_item_id]
            );
          }

          await this.orderRepo.updateStatus(expired.id, 'cancelled', conn);

          if (expired.payment_id && expired.payment_status === 'pending') {
            await this.paymentRepo.updateStatus(expired.payment_id, 'cancelled', null, conn);
          }

          await writeNotification(
            {
              userId: expired.user_id,
              type: 'order',
              title: 'Pesanan Dibatalkan Otomatis',
              message: `Pesanan ${expired.order_code} dibatalkan otomatis karena melewati batas waktu konfirmasi 5 menit.`,
              orderId: expired.id,
            },
            conn
          );

          await writeAudit(
            {
              actorId: null,
              action: 'ORDER_AUTO_CANCEL_EXPIRED',
              entity: 'orders',
              entity_id: expired.id,
              old_value: { status: expired.status },
              new_value: { status: 'cancelled', reason: 'expired_5_minutes' },
            },
            conn
          );

          await conn.commit();
          cancelledCount++;
        } catch (innerErr) {
          await conn.rollback();
          console.error('[AUTO_CANCEL_ORDER_ERROR]', innerErr);
        }
      }
    } finally {
      conn.release();
    }

    return cancelledCount;
  }

  /**
   * Riwayat pesanan user (scoped)
   */
  async getUserOrders(
    ctx: RequestContext,
    page: number,
    limit: number
  ): Promise<PaginatedResponse<OrderEntity>> {
    await this.cancelExpiredOrders();
    const { data, total } = await this.orderRepo.findByUser(ctx, page, limit);
    return { data, meta: { page, limit, total } };
  }

  /**
   * Detail pesanan user (scoped) — mengembalikan 404 jika bukan miliknya
   */
  async getUserOrderById(ctx: RequestContext, orderId: string): Promise<OrderEntity> {
    await this.cancelExpiredOrders();
    const order = await this.orderRepo.findById(orderId, ctx);
    if (!order) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Pesanan tidak ditemukan' };
    }
    return order;
  }

  /**
   * Batalkan pesanan user (hanya status pending)
   */
  async cancelOrder(ctx: RequestContext, orderId: string, ipAddress?: string | null): Promise<OrderEntity> {
    const conn = await appPool.getConnection();
    try {
      await conn.beginTransaction();

      const order = await this.orderRepo.findById(orderId, ctx, conn);
      if (!order) {
        throw { status: 404, code: 'NOT_FOUND', message: 'Pesanan tidak ditemukan' };
      }

      this.validateTransition(order.status, 'cancelled', 'user');

      // Kembalikan stok
      if (order.items) {
        for (const item of order.items) {
          await conn.query(
            'UPDATE menu_items SET stock = stock + ? WHERE id = ?',
            [item.quantity, item.menu_item_id]
          );
        }
      }

      await this.orderRepo.updateStatus(orderId, 'cancelled', conn);

      const payment = await this.paymentRepo.findByOrderId(orderId, conn);
      if (payment?.status === 'pending') {
        await this.paymentRepo.updateStatus(payment.id, 'cancelled', null, conn);
      }

      // Beri tahu admin bahwa pesanan dibatalkan user (stok sudah dikembalikan)
      await notifyAdmins(
        {
          type: 'order',
          title: 'Pesanan Dibatalkan',
          message: `Pesanan ${order.order_code} dibatalkan oleh pelanggan.`,
          orderId,
        },
        conn
      );

      await writeAudit(
        {
          actorId: ctx.userId,
          action: 'ORDER_CANCEL',
          entity: 'orders',
          entity_id: orderId,
          old_value: { status: order.status },
          new_value: { status: 'cancelled' },
          ipAddress,
        },
        conn
      );

      await conn.commit();

      const updated = await this.orderRepo.findById(orderId, ctx);
      if (!updated) throw new Error('Pesanan tidak ditemukan setelah cancel');
      return updated;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Admin: ubah status pesanan sesuai state machine
   */
  async adminUpdateStatus(
    orderId: string,
    newStatus: OrderStatus,
    actorId: string,
    ipAddress?: string | null
  ): Promise<OrderEntity> {
    const conn = await appPool.getConnection();
    try {
      await conn.beginTransaction();

      const order = await this.orderRepo.findById(orderId, undefined, conn);
      if (!order) {
        throw { status: 404, code: 'NOT_FOUND', message: 'Pesanan tidak ditemukan' };
      }

      this.validateTransition(order.status, newStatus, 'admin');

      // Jika admin cancel pesanan yang sudah paid, perlu refund (akan diproses terpisah)
      if (newStatus === 'cancelled' && order.items) {
        for (const item of order.items) {
          await conn.query(
            'UPDATE menu_items SET stock = stock + ? WHERE id = ?',
            [item.quantity, item.menu_item_id]
          );
        }
      }

      await this.orderRepo.updateStatus(orderId, newStatus, conn);

      if (newStatus === 'cancelled') {
        const payment = await this.paymentRepo.findByOrderId(orderId, conn);
        if (payment?.status === 'pending') {
          await this.paymentRepo.updateStatus(payment.id, 'cancelled', null, conn);
        } else if (payment?.status === 'settled') {
          await this.paymentRepo.updateStatus(payment.id, 'refunded', null, conn);
          await writeAudit(
            {
              actorId,
              action: 'PAYMENT_REFUND',
              entity: 'payments',
              entity_id: payment.id,
              old_value: { status: 'settled' },
              new_value: { status: 'refunded', reason: 'order_cancelled' },
              ipAddress,
            },
            conn
          );
        }
      }

      // Notifikasi ke pemilik pesanan untuk setiap perubahan status oleh admin
      const statusMessages: Partial<Record<OrderStatus, string>> = {
        paid: `Pembayaran pesanan ${order.order_code} dikonfirmasi. Pesanan sedang diproses.`,
        preparing: `Pesanan ${order.order_code} sedang disiapkan.`,
        ready: `Pesanan ${order.order_code} SUDAH JADI — silakan diambil.`,
        completed: `Pesanan ${order.order_code} selesai. Terima kasih!`,
        cancelled: `Pesanan ${order.order_code} dibatalkan oleh admin.`,
      };
      const notifMessage = statusMessages[newStatus];
      if (notifMessage) {
        await writeNotification(
          {
            userId: order.user_id,
            type: 'order',
            title: 'Status Pesanan Diperbarui',
            message: notifMessage,
            orderId,
          },
          conn
        );
      }

      await writeAudit(
        {
          actorId,
          action: 'ORDER_STATUS_CHANGE',
          entity: 'orders',
          entity_id: orderId,
          old_value: { status: order.status },
          new_value: { status: newStatus },
          ipAddress,
        },
        conn
      );

      await conn.commit();

      const updated = await this.orderRepo.findById(orderId);
      if (!updated) throw new Error('Pesanan tidak ditemukan setelah update');
      return updated;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Admin: daftar semua pesanan
   */
  async adminGetAllOrders(params: {
    status?: OrderStatus;
    date_from?: string;
    date_to?: string;
    q?: string;
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<OrderEntity>> {
    await this.cancelExpiredOrders();
    const { data, total } = await this.orderRepo.findAll(params);
    return { data, meta: { page: params.page, limit: params.limit, total } };
  }

  /**
   * Validasi transisi status pesanan sesuai state machine
   */
  private validateTransition(from: OrderStatus, to: OrderStatus, actor: string): void {
    const allowed = VALID_TRANSITIONS[from];
    const match = allowed.find((t) => t.to === to && t.by.includes(actor));
    if (!match) {
      throw {
        status: 409,
        code: 'INVALID_STATUS_TRANSITION',
        message: `Transisi status dari "${from}" ke "${to}" tidak diizinkan`,
      };
    }
  }
}
