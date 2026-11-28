import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service.js';
import { env } from '../config/env.js';
import { verifyToken } from '../utils/crypto.js';
import { TokenPayload } from '../middleware/auth.middleware.js';

const authService = new AuthService();

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username wajib diisi'),
  password: z.string().min(1, 'Password wajib diisi'),
  portal: z.enum(['customer', 'staff']).default('customer'),
});

const mfaVerifySchema = z.object({
  mfa_token: z.string().min(1, 'Token MFA wajib diisi'),
  code: z.string().length(6, 'Kode MFA harus 6 digit angka').regex(/^\d{6}$/, 'Kode harus berupa angka'),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token wajib diisi'),
});

const logoutSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token wajib diisi'),
});

const confirmMfaSchema = z.object({
  secret: z.string().optional(),
  mfa_token: z.string().optional(),
  current_pin: z.string().length(6, 'PIN lama harus 6 digit').regex(/^\d{6}$/, 'PIN lama harus berupa 6 digit angka').optional(),
  code: z.string().length(6, 'PIN harus 6 digit').regex(/^\d{6}$/, 'PIN harus berupa 6 digit angka'),
  security_answers: z.tuple([
    z.string().trim().min(2, 'Jawaban pertanyaan 1 minimal 2 karakter').max(100),
    z.string().trim().min(2, 'Jawaban pertanyaan 2 minimal 2 karakter').max(100),
    z.string().trim().min(2, 'Jawaban pertanyaan 3 minimal 2 karakter').max(100),
  ]).optional(),
});

const changePasswordSchema = z.object({
  old_password: z.string().min(1, 'Password lama wajib diisi'),
  new_password: z
    .string()
    .min(8, 'Password baru minimal 8 karakter')
    .max(128),
});

const forgotCheckSchema = z.object({
  username: z.string().trim().min(1, 'Username wajib diisi'),
  portal: z.enum(['customer', 'staff']).default('customer'),
});

const forgotResetSchema = z.object({
  username: z.string().trim().min(1, 'Username wajib diisi'),
  method: z.enum(['pin', 'questions']),
  pin: z.string().length(6, 'PIN harus 6 digit').regex(/^\d{6}$/).optional(),
  security_answers: z
    .tuple([
      z.string().trim().min(1, 'Jawaban 1 wajib diisi'),
      z.string().trim().min(1, 'Jawaban 2 wajib diisi'),
      z.string().trim().min(1, 'Jawaban 3 wajib diisi'),
    ])
    .optional(),
  new_password: z.string().min(8, 'Password minimal 8 karakter').max(128),
  portal: z.enum(['customer', 'staff']).default('customer'),
});

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Input tidak valid',
          },
        });
        return;
      }

      // Gunakan req.ip (hasil `trust proxy` yang dikendalikan env) agar tidak bisa dipalsukan via
      // header X-Forwarded-For mentah (Finding H1/N7).
      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await authService.login({
        ...parsed.data,
        ipAddress: clientIp,
        userAgent: req.get('user-agent'),
      });

      res.status(200).json({
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async verifyMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = mfaVerifySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Input tidak valid',
          },
        });
        return;
      }

      const result = await authService.verifyMfa({
        ...parsed.data,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(200).json({
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = refreshSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Refresh token wajib diisi',
          },
        });
        return;
      }

      const tokens = await authService.refresh(
        parsed.data.refresh_token,
        req.ip,
        req.get('user-agent')
      );

      res.status(200).json({
        data: tokens,
      });
    } catch (err) {
      next(err);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = logoutSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Refresh token wajib diisi',
          },
        });
        return;
      }

      await authService.logout(parsed.data.refresh_token, req.user?.userId, req.ip);

      res.status(200).json({
        data: { message: 'Berhasil keluar' },
      });
    } catch (err) {
      next(err);
    }
  }

  async setupMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' },
        });
        return;
      }

      const result = await authService.setupMfa(req.user.userId);
      res.status(200).json({
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async confirmMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = confirmMfaSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Input tidak valid',
          },
        });
        return;
      }

      let userId = req.user?.userId;
      let issueTokensAfter = false;

      if (!userId) {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
          try {
            const payload = verifyToken<TokenPayload>(authHeader.slice(7), env.JWT_SECRET);
            if (payload.type === 'access') userId = payload.userId;
          } catch {
            // fallback to mfa_token below
          }
        }
      }

      if (!userId && parsed.data.mfa_token) {
        try {
          const payload = verifyToken<TokenPayload>(parsed.data.mfa_token, env.JWT_SECRET);
          if (payload.type === 'mfa') {
            userId = payload.userId;
            issueTokensAfter = true;
          }
        } catch {
          res.status(401).json({
            error: { code: 'INVALID_MFA_TOKEN', message: 'Sesi setup MFA kedaluwarsa. Silakan login ulang.' },
          });
          return;
        }
      }

      if (!userId) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' },
        });
        return;
      }

      const result = await authService.confirmMfa(
        userId,
        parsed.data.secret || '',
        parsed.data.code,
        req.ip,
        parsed.data.security_answers,
        issueTokensAfter,
        req.get('user-agent'),
        parsed.data.current_pin
      );

      res.status(200).json({
        data: { message: 'MFA berhasil diaktifkan', ...result },
      });
    } catch (err) {
      next(err);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' },
        });
        return;
      }

      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Input tidak valid',
          },
        });
        return;
      }

      await authService.changePassword(
        req.user.userId,
        parsed.data.old_password,
        parsed.data.new_password,
        req.ip
      );

      res.status(200).json({
        data: { message: 'Password berhasil diubah. Silakan login kembali.' },
      });
    } catch (err) {
      next(err);
    }
  }

  async checkForgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = forgotCheckSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Username wajib diisi',
          },
        });
        return;
      }

      const result = await authService.checkForgotPassword(parsed.data.portal);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async resetForgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = forgotResetSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Input tidak valid',
          },
        });
        return;
      }

      await authService.resetForgotPassword({
        ...parsed.data,
        ipAddress: req.ip,
      });

      res.status(200).json({
        data: { message: 'Password berhasil direset. Silakan login dengan password baru Anda.' },
      });
    } catch (err) {
      next(err);
    }
  }
}
