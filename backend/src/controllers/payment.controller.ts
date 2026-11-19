import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PaymentService } from '../services/payment.service.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const paymentService = new PaymentService();

const webhookSchema = z.object({
  gateway_ref: z.string().min(1, 'gateway_ref wajib diisi'),
  status: z.enum(['settled', 'failed']),
  amount: z.coerce.number().positive('amount harus positif'),
  signature: z.string().min(1, 'signature wajib diisi'),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export class PaymentController {
  async getProof(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const proof = await paymentService.getProofPath(req.params.id);
      if (!proof) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Bukti transfer tidak ditemukan' } }); return; }
      const uploadBaseDir = path.resolve(process.cwd(), 'uploads', 'proofs');
      const filePath = path.resolve(process.cwd(), proof.path);
      // Perlindungan path traversal: pastikan file berada di dalam folder uploads/proofs
      if (!filePath.startsWith(uploadBaseDir + path.sep)) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Akses berkas tidak diizinkan' } });
        return;
      }
      await fs.access(filePath);
      res.type(proof.mime).sendFile(filePath);
    } catch (err) { next(err); }
  }
  async handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = webhookSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Input webhook tidak valid' },
        });
        return;
      }

      await paymentService.handleWebhook(parsed.data, req.ip);
      res.status(200).json({ data: { message: 'Webhook processed successfully' } });
    } catch (err) {
      next(err);
    }
  }

  // ADMIN: Semua pembayaran
  async adminGetAllPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = paginationSchema.safeParse(req.query);
      const page = parsed.success ? parsed.data.page : 1;
      const limit = parsed.success ? parsed.data.limit : 20;

      const result = await paymentService.adminGetAllPayments(page, limit);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  // ADMIN: Refund pembayaran
  async adminRefundPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' },
        });
        return;
      }

      const { id } = req.params;
      await paymentService.adminRefundPayment(id, req.user.userId, req.ip);

      res.status(200).json({
        data: { message: 'Pembayaran berhasil di-refund' },
      });
    } catch (err) {
      next(err);
    }
  }

  // ADMIN: Konfirmasi pembayaran masuk (awaiting_confirmation -> paid)
  async adminConfirmPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' },
        });
        return;
      }

      const { id } = req.params; // order id
      await paymentService.adminConfirmPayment(id, req.user.userId, req.ip);

      res.status(200).json({
        data: { message: 'Pembayaran dikonfirmasi. Pesanan sedang diproses.' },
      });
    } catch (err) {
      next(err);
    }
  }

  async uploadProof(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } }); return; }
      const parsed = z.object({ proof_data: z.string().min(1), mime: z.string().min(1) }).safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Bukti transfer tidak valid' } }); return; }
      const result = await paymentService.uploadProof(req.user.userId, req.params.id, parsed.data.proof_data, parsed.data.mime, req.ip);
      res.status(201).json({ data: result });
    } catch (err) { next(err); }
  }
}
