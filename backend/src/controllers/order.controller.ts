import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { OrderService } from '../services/order.service.js';
import { PaymentService } from '../services/payment.service.js';

const orderService = new OrderService();
const paymentService = new PaymentService();

const checkoutSchema = z.object({
  notes: z
    .string()
    .trim()
    .max(500, 'Catatan maksimal 500 karakter')
    .refine((v) => !/[<>]/.test(v), 'Catatan tidak boleh mengandung karakter < atau >')
    .optional()
    .nullable(),
  payment_method: z.enum(['transfer', 'tunai']).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'awaiting_confirmation', 'paid', 'preparing', 'ready', 'completed', 'cancelled']),
});

const claimPaymentSchema = z.object({
  method: z.enum(['transfer', 'tunai']),
});

const orderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['pending', 'awaiting_confirmation', 'paid', 'preparing', 'ready', 'completed', 'cancelled'])
    .optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  q: z.string().max(100).optional(),
});

export class OrderController {
  // USER: Checkout
  async checkout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const parsed = checkoutSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Input tidak valid',
          },
        });
        return;
      }

      const order = await orderService.checkout(
        { userId: req.user.userId, role: req.user.role },
        parsed.data,
        req.ip
      );

      res.status(201).json({ data: order });
    } catch (err) {
      next(err);
    }
  }

  // USER: Riwayat pesanan sendiri
  async getUserOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const parsed = orderQuerySchema.safeParse(req.query);
      const page = parsed.success ? parsed.data.page : 1;
      const limit = parsed.success ? parsed.data.limit : 20;

      const result = await orderService.getUserOrders(
        { userId: req.user.userId, role: req.user.role },
        page,
        limit
      );

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  // USER: Detail pesanan sendiri
  async getUserOrderById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const { id } = req.params;
      const order = await orderService.getUserOrderById(
        { userId: req.user.userId, role: req.user.role },
        id
      );

      res.status(200).json({ data: order });
    } catch (err) {
      next(err);
    }
  }

  // USER: Batalkan pesanan sendiri
  async cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const { id } = req.params;
      const updated = await orderService.cancelOrder(
        { userId: req.user.userId, role: req.user.role },
        id,
        req.ip
      );

      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  }

  // USER: Klaim "Saya Sudah Bayar" (transfer/QRIS manual, menunggu konfirmasi admin)
  async createPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const { id } = req.params; // order id
      const parsed = claimPaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Metode pembayaran tidak valid',
          },
        });
        return;
      }

      const result = await paymentService.createPayment(req.user.userId, id, parsed.data.method, req.ip);

      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  // USER: Status pembayaran
  async getPaymentStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const { id } = req.params; // order id
      const payment = await paymentService.getPaymentStatus(req.user.userId, id);

      res.status(200).json({ data: payment });
    } catch (err) {
      next(err);
    }
  }

  // ADMIN: Semua pesanan
  async adminGetAllOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = orderQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Parameter query tidak valid' },
        });
        return;
      }

      const result = await orderService.adminGetAllOrders(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  // ADMIN: Detail pesanan
  async adminGetOrderById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const order = await orderService.getUserOrderById(
        { userId: req.user?.userId || '', role: 'admin' },
        id
      );
      res.status(200).json({ data: order });
    } catch (err) {
      next(err);
    }
  }

  // ADMIN: Ubah status pesanan
  async adminUpdateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const { id } = req.params;
      const parsed = updateStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Status pesanan tidak valid' },
        });
        return;
      }

      const updated = await orderService.adminUpdateStatus(
        id,
        parsed.data.status,
        req.user.userId,
        req.ip
      );

      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  }
}
