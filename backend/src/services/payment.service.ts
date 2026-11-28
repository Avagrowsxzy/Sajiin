import crypto from 'crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { appPool } from '../config/database.js';
import { env } from '../config/env.js';
import { OrderRepository } from '../repositories/order.repository.js';
import { PaymentRepository } from '../repositories/payment.repository.js';
import { OrderService } from './order.service.js';
import { writeAudit } from './audit.service.js';
import { writeNotification, notifyAdmins } from './notification.service.js';

export type ClaimPaymentMethod = 'transfer' | 'tunai';

export class PaymentService {
  constructor(
    private orderRepo = new OrderRepository(),
    private paymentRepo = new PaymentRepository(),
    private orderService = new OrderService()
  ) {}

  async uploadProof(userId: string, orderId: string, proofData: string, mime: string, ipAddress?: string | null) {
    await this.orderService.cancelExpiredOrders();
    const order = await this.orderRepo.findById(orderId, { userId, role: 'user' });
    if (!order) throw { status: 404, code: 'NOT_FOUND', message: 'Pesanan tidak ditemukan' };
    if (order.status === 'cancelled') throw { status: 409, code: 'ORDER_EXPIRED', message: 'Pesanan telah dibatalkan karena melewati batas waktu 5 menit' };
    if (order.status !== 'awaiting_confirmation') throw { status: 409, code: 'INVALID_STATUS', message: 'Pesanan belum menunggu bukti transfer' };
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw { status: 400, code: 'INVALID_FILE', message: 'Bukti harus JPG, PNG, atau WebP' };
    const raw = proofData.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) throw { status: 400, code: 'INVALID_FILE', message: 'Ukuran bukti maksimal 5MB' };

    // Validasi magic number (header biner berkas asli, bukan sekadar ekstensi atau MIME string dari klien)
    const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a;
    const isWebp = buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

    const detectedMime = isJpeg ? 'image/jpeg' : isPng ? 'image/png' : isWebp ? 'image/webp' : null;
    if (!detectedMime || detectedMime !== mime) {
      throw { status: 400, code: 'INVALID_FILE', message: 'Format konten berkas tidak valid atau tidak cocok dengan format gambar asli' };
    }

    const payment = await this.paymentRepo.findByOrderId(orderId);
    if (!payment) throw { status: 404, code: 'NOT_FOUND', message: 'Data pembayaran tidak ditemukan' };
    const uploadDir = path.resolve(process.cwd(), 'uploads', 'proofs');
    await fs.mkdir(uploadDir, { recursive: true });
    const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const filename = `${crypto.randomUUID()}.${extension}`;
    await fs.writeFile(path.join(uploadDir, filename), buffer, { flag: 'wx', mode: 0o600 });
    await this.paymentRepo.updateProof(payment.id, `uploads/proofs/${filename}`, mime);
    await writeAudit({ actorId: userId, action: 'PAYMENT_PROOF_UPLOADED', entity: 'payments', entity_id: payment.id, new_value: { mime, bytes: buffer.length }, ipAddress });
    return { payment_id: payment.id, status: payment.status };
  }

  async getProofPath(paymentId: string): Promise<{ path: string; mime: string } | null> {
    const payment = await this.paymentRepo.findById(paymentId);
    if (!payment?.proof_path || !payment.proof_mime) return null;
    return { path: payment.proof_path, mime: payment.proof_mime };
  }

  /**
   * USER: Klaim pembayaran manual (transfer/QRIS).
   * User klik "Saya Sudah Bayar" -> payment dibuat (status pending),
   * pesanan pending -> awaiting_confirmation, admin menerima notifikasi.
   * Idempoten: jika sudah awaiting_confirmation dengan payment ada, kembalikan yang ada.
   */
  async createPayment(
    userId: string,
    orderId: string,
    method: ClaimPaymentMethod,
    ipAddress?: string | null
  ): Promise<{ payment_id: string; status: string; order_status: string }> {
    await this.orderService.cancelExpiredOrders();
    const order = await this.orderRepo.findById(orderId, { userId, role: 'user' });
    if (!order) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Pesanan tidak ditemukan' };
    }

    // Sudah pernah klaim -> idempoten (hindari double insert)
    if (order.status === 'awaiting_confirmation') {
      const existing = await this.paymentRepo.findByOrderId(orderId);
      if (existing) {
        return {
          payment_id: existing.id,
          status: existing.status,
          order_status: order.status,
        };
      }
    }

    if (order.status !== 'pending') {
      throw {
        status: 409,
        code: 'INVALID_STATUS',
        message: 'Pesanan tidak dalam status menunggu pembayaran',
      };
    }

    const paymentId = crypto.randomUUID();

    const conn = await appPool.getConnection();
    try {
      await conn.beginTransaction();

      await this.paymentRepo.create({
        id: paymentId,
        order_id: orderId,
        amount: order.total_amount,
        method,
      });

      await this.orderRepo.updateStatus(orderId, 'awaiting_confirmation', conn);

      await notifyAdmins(
        {
          type: 'payment',
          title: 'Klaim Pembayaran',
          message: `Pesanan ${order.order_code} diklaim dibayar via ${method} (${order.total_amount}). Mohon konfirmasi.`,
          orderId,
        },
        conn
      );

      await writeAudit(
        {
          actorId: userId,
          action: 'PAYMENT_CLAIMED',
          entity: 'payments',
          entity_id: paymentId,
          new_value: { order_id: orderId, order_code: order.order_code, method, amount: order.total_amount },
          ipAddress,
        },
        conn
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    return { payment_id: paymentId, status: 'pending', order_status: 'awaiting_confirmation' };
  }

  /**
   * ADMIN: Konfirmasi pembayaran masuk (cek rekening manual).
   * awaiting_confirmation -> paid; payment pending -> settled; user menerima notifikasi.
   */
  async adminConfirmPayment(
    orderId: string,
    adminUserId: string,
    ipAddress?: string | null
  ): Promise<void> {
    await this.orderService.cancelExpiredOrders();

    const conn = await appPool.getConnection();
    try {
      await conn.beginTransaction();

      // Finding C-F1: kunci baris pesanan lebih dulu. Validasi status DI DALAM transaksi
      // (setelah kunci) memastikan hanya satu operasi yang boleh mengubah awaiting_confirmation,
      // sehingga cancel vs konfirmasi tidak bisa sama-sama lolos (mencegah oversell / notifikasi ganda).
      await this.orderRepo.lockForUpdate(orderId, conn);

      const order = await this.orderRepo.findById(orderId, undefined, conn);
      if (!order) {
        throw { status: 404, code: 'NOT_FOUND', message: 'Pesanan tidak ditemukan' };
      }

      if (order.status === 'cancelled') {
        throw {
          status: 409,
          code: 'ORDER_EXPIRED',
          message: 'Pesanan sudah kedaluwarsa karena melebihi batas waktu 5 menit tanpa bukti transfer/konfirmasi',
        };
      }

      if (order.status !== 'awaiting_confirmation') {
        throw {
          status: 409,
          code: 'INVALID_STATUS',
          message: 'Pesanan tidak sedang menunggu konfirmasi pembayaran',
        };
      }

      const payment = await this.paymentRepo.findByOrderId(orderId, conn);
      if (!payment) {
        throw { status: 404, code: 'NOT_FOUND', message: 'Data pembayaran tidak ditemukan' };
      }

      if (payment.method === 'transfer' && !payment.proof_path) {
        throw { status: 409, code: 'PROOF_REQUIRED', message: 'Bukti transfer wajib diunggah sebelum pembayaran divalidasi' };
      }

      await this.paymentRepo.updateStatus(payment.id, 'settled', new Date(), conn);
      await this.orderRepo.updateStatus(orderId, 'paid', conn);

      await writeNotification(
        {
          userId: order.user_id,
          type: 'payment',
          title: 'Pembayaran Dikonfirmasi',
          message: `Pembayaran pesanan ${order.order_code} telah dikonfirmasi admin. Pesanan sedang diproses.`,
          orderId,
        },
        conn
      );

      await writeAudit(
        {
          actorId: adminUserId,
          action: 'PAYMENT_CONFIRMED',
          entity: 'payments',
          entity_id: payment.id,
          old_value: { payment_status: 'pending', order_status: 'awaiting_confirmation' },
          new_value: { payment_status: 'settled', order_status: 'paid', method: payment.method },
          ipAddress,
        },
        conn
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Status pembayaran (scoped ke user)
   */
  async getPaymentStatus(userId: string, orderId: string) {
    const order = await this.orderRepo.findById(orderId, { userId, role: 'user' });
    if (!order) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Pesanan tidak ditemukan' };
    }

    const payment = await this.paymentRepo.findByOrderId(orderId);
    if (!payment) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Pembayaran belum dibuat' };
    }

    return payment;
  }

  /**
   * Webhook pembayaran — verifikasi signature, idempoten, update status
   */
  async handleWebhook(
    body: { gateway_ref: string; status: string; amount: number; signature: string },
    ipAddress?: string | null
  ): Promise<void> {
    // Verifikasi signature HMAC dengan secret dari environment + perbandingan timing-safe (Finding M3).
    const expectedSig = this.computeSignature(body.gateway_ref, body.amount, body.status);
    if (!this.safeEqual(body.signature, expectedSig)) {
      throw { status: 400, code: 'INVALID_SIGNATURE', message: 'Webhook signature tidak valid' };
    }

    const payment = await this.paymentRepo.findByGatewayRef(body.gateway_ref);
    if (!payment) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Payment tidak ditemukan' };
    }

    // Idempoten: abaikan jika sudah settled/refunded
    if (payment.status === 'settled' || payment.status === 'refunded') {
      return;
    }

    // Verifikasi amount sama
    if (Number(body.amount) !== payment.amount) {
      throw { status: 400, code: 'AMOUNT_MISMATCH', message: 'Jumlah tidak cocok' };
    }

    const conn = await appPool.getConnection();
    try {
      await conn.beginTransaction();

      // Finding C-F4: klaim perubahan status secara atomik. Bila request paralel sudah
      // memproses lebih dulu, klaim gagal -> tidak ada pemrosesan/audit ganda (idempoten).
      const claimed = await this.paymentRepo.claimWebhookStatus(
        payment.id,
        body.status === 'settled' ? 'settled' : 'failed',
        body.status === 'settled' ? new Date() : null,
        conn
      );

      if (!claimed) {
        await conn.rollback();
        return;
      }

      if (body.status === 'settled') {
        // Update order: pending -> paid
        const order = await this.orderRepo.findById(payment.order_id, undefined, conn);
        if (order && order.status === 'pending') {
          await this.orderRepo.updateStatus(payment.order_id, 'paid', conn);
        }
      }

      await writeAudit(
        {
          actorId: null,
          action: 'PAYMENT_WEBHOOK',
          entity: 'payments',
          entity_id: payment.id,
          new_value: { gateway_ref: body.gateway_ref, status: body.status, amount: body.amount },
          ipAddress,
        },
        conn
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * ADMIN: Daftar semua pembayaran (dengan pagination)
   */
  async adminGetAllPayments(page: number = 1, limit: number = 20) {
    const result = await this.paymentRepo.findAll(page, limit);
    return {
      data: result.data,
      meta: { page, limit, total: result.total },
    };
  }

  /**
   * ADMIN: Refund pembayaran (sandbox gateway)
   * Hanya payment berstatus 'settled' yang dapat di-refund.
   */
  async adminRefundPayment(
    paymentId: string,
    adminUserId: string,
    ipAddress?: string | null
  ): Promise<void> {
    const conn = await appPool.getConnection();
    try {
      await conn.beginTransaction();

      const payment = await this.paymentRepo.findByIdForUpdate(paymentId, conn);
      if (!payment) {
        throw { status: 404, code: 'NOT_FOUND', message: 'Pembayaran tidak ditemukan' };
      }

      // Finding C-F2: refund diklaim secara atomik (hanya bila masih settled), sehingga
      // request paralel tidak bisa melakukan double-refund; yang kalah dibalas 409.
      const refunded = await this.paymentRepo.updateStatusIf(paymentId, 'refunded', 'settled', conn);
      if (!refunded) {
        throw {
          status: 409,
          code: 'INVALID_STATUS',
          message: 'Hanya pembayaran berstatus settled yang dapat di-refund',
        };
      }

      await writeAudit(
        {
          actorId: adminUserId,
          action: 'PAYMENT_REFUND',
          entity: 'payments',
          entity_id: payment.id,
          old_value: { status: 'settled' },
          new_value: { status: 'refunded', gateway_ref: payment.gateway_ref },
          ipAddress,
        },
        conn
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Signature webhook HMAC-SHA256 memakai secret dari environment (Finding M3).
   */
  computeSignature(gatewayRef: string, amount: number, status: string): string {
    const data = `${gatewayRef}|${amount}|${status}`;
    return crypto.createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(data).digest('hex');
  }

  /**
   * Perbandingan string timing-safe untuk mencegah timing attack pada signature.
   */
  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
