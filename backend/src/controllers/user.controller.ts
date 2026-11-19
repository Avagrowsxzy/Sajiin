import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { UserRepository } from '../repositories/user.repository.js';
import { writeAudit } from '../services/audit.service.js';

const userRepo = new UserRepository();

const phoneSchema = z
  .string()
  .trim()
  .refine(
    (val) => val === '' || /^(08[0-9]{8,11}|628[0-9]{8,11})$/.test(val),
    'Nomor telepon harus berupa angka diawali 08 atau 628 (10-13 digit, tanpa tanda +)'
  )
  .transform((val) => (val === '' ? null : val))
  .optional()
  .nullable();

const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Nama lengkap minimal 2 karakter')
  .max(100, 'Nama lengkap maksimal 100 karakter')
  .regex(/^[a-zA-Z0-9\s.,'()-]+$/, 'Nama hanya boleh berisi huruf, angka, spasi, dan tanda baca umum');

const updateMeSchema = z.object({
  full_name: fullNameSchema.optional(),
  phone: phoneSchema,
});

export class UserController {
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' },
        });
        return;
      }

      const user = await userRepo.findById(req.user.userId);
      if (!user) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Pengguna tidak ditemukan' },
        });
        return;
      }

      res.status(200).json({
        data: userRepo.toSafeUser(user),
      });
    } catch (err) {
      next(err);
    }
  }

  async updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' },
        });
        return;
      }

      // Validasi dan whitelist field: membuang field terlarang seperti role_id (SECURITY.md T2)
      const parsed = updateMeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Input tidak valid',
          },
        });
        return;
      }

      const updated = await userRepo.updateProfile(
        { userId: req.user.userId, role: req.user.role },
        parsed.data
      );

      await writeAudit({
        actorId: req.user.userId,
        action: 'USER_STATUS_CHANGE',
        entity: 'users',
        entity_id: req.user.userId,
        new_value: parsed.data,
        ipAddress: req.ip,
      });

      res.status(200).json({
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}
