import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SettingsRepository } from '../repositories/settings.repository.js';
import { writeAudit } from '../services/audit.service.js';

const settingsRepo = new SettingsRepository();

const paymentSettingsSchema = z.object({
  payment_instructions: z.string().min(5, 'Instruksi pembayaran minimal 5 karakter').max(2000),
  bank_name: z.string().trim().min(2).max(80),
  account_number: z.string().trim().min(5).max(40).regex(/^[0-9 -]+$/, 'Nomor rekening hanya boleh berisi angka'),
  account_name: z.string().trim().min(2).max(120),
});

function maskAccount(value: string | null): string | null {
  if (!value) return null;
  return value.length <= 4 ? '****' : `${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

export class SettingsController {
  /**
   * GET /settings/payment — instruksi pembayaran (hanya untuk pengguna terotentikasi)
   */
  async getPaymentSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let instructions = await settingsRepo.get('payment_instructions');
      const bankName = await settingsRepo.get('payment_bank_name');
      const accountNumber = await settingsRepo.get('payment_account_number');
      const accountName = await settingsRepo.get('payment_account_name');
      if (!instructions) {
        instructions = 'Instruksi pembayaran belum diatur oleh admin.';
      }
      res.status(200).json({ data: {
        payment_instructions: instructions,
        bank_name: bankName || '',
        account_number: accountNumber || '',
        account_name: accountName || '',
      } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /admin/settings/payment — ubah instruksi pembayaran (admin)
   */
  async updatePaymentSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const parsed = paymentSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Input tidak valid',
          },
        });
        return;
      }

       const previous = {
         payment_instructions: await settingsRepo.get('payment_instructions'),
         bank_name: await settingsRepo.get('payment_bank_name'),
         account_number: await settingsRepo.get('payment_account_number'),
         account_name: await settingsRepo.get('payment_account_name'),
       };

       await settingsRepo.set('payment_instructions', parsed.data.payment_instructions);
       await settingsRepo.set('payment_bank_name', parsed.data.bank_name);
       await settingsRepo.set('payment_account_number', parsed.data.account_number);
       await settingsRepo.set('payment_account_name', parsed.data.account_name);

      await writeAudit({
        actorId: req.user.userId,
        action: 'SYSTEM_CONFIG_CHANGE',
        entity: 'system_settings',
        entity_id: 'payment_instructions',
         old_value: { ...previous, account_number: maskAccount(previous.account_number) },
         new_value: {
           ...parsed.data,
           account_number: maskAccount(parsed.data.account_number),
         },
        ipAddress: req.ip,
      });

      res.status(200).json({ data: { message: 'Instruksi pembayaran diperbarui' } });
    } catch (err) {
      next(err);
    }
  }
}
