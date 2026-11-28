import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import mysql from 'mysql2/promise';
import { AdminService } from '../services/admin.service.js';
import { AuthService } from '../services/auth.service.js';
import { generateHumanFriendlyPassword } from '../utils/crypto.js';
import { appPool } from '../config/database.js';
import { auditEvents } from '../services/audit.service.js';

const adminService = new AdminService();
const authService = new AuthService();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  include_inactive: z.coerce.boolean().default(false),
});

const dashboardSummarySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

const updateUserStatusSchema = z.object({
  is_active: z.boolean().optional(),
  unlock: z.boolean().optional(),
});

const updateUserRoleSchema = z.object({
  role_id: z.number().int().min(1).max(4),
});

const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Nama lengkap minimal 2 karakter')
  .max(100, 'Nama lengkap maksimal 100 karakter')
  .regex(/^[a-zA-Z0-9\s.,'()-]+$/, 'Nama hanya boleh berisi huruf, angka, spasi, dan tanda baca umum');

const customerSchema = z.object({
  full_name: fullNameSchema,
  username: z.string().trim().min(3, 'Username minimal 3 karakter').max(50).regex(/^[a-zA-Z0-9._-]+$/, 'Username hanya boleh berisi huruf, angka, titik, garis bawah, atau strip'),
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(8).max(128).optional(),
});

export class AdminController {
  auditLogStream(req: Request, res: Response): void {
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    const send = (log: unknown) => res.write(`event: audit\ndata: ${JSON.stringify(log)}\n\n`);
    const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
    auditEvents.on('created', send);
    req.on('close', () => {
      clearInterval(heartbeat);
      auditEvents.off('created', send);
    });
  }

  async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.min(1_000_000, Math.max(1, Number(req.query.page) || 1));
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const offset = (page - 1) * limit;
      const [countRows] = await appPool.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS total FROM audit_logs');
      const [rows] = await appPool.query<mysql.RowDataPacket[]>(
        `SELECT al.id, al.actor_id, u.full_name AS actor_name, al.action, al.entity, al.entity_id,
                al.old_value, al.new_value, al.ip_address, al.created_at
         FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_id
         ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      res.status(200).json({ data: rows, meta: { page, limit, total: Number(countRows[0]?.total || 0) } });
    } catch (err) { next(err); }
  }
  async createCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = customerSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Input tidak valid' } }); return; }
      const password = parsed.data.password || generateHumanFriendlyPassword();
      const result = await authService.register({ ...parsed.data, password, ipAddress: req.ip });
      res.status(201).json({ data: { user: result.user, temporary_password: password } });
    } catch (err) { next(err); }
  }
  /**
   * GET /admin/dashboard/summary
   */
  async getDashboardSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = dashboardSummarySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Parameter tanggal tidak valid' } });
        return;
      }
      const summary = await adminService.getDashboardSummary(parsed.data);
      res.status(200).json({ data: summary });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /admin/users
   */
  async getAllUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = paginationSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Parameter tidak valid',
          },
        });
        return;
      }

      const { page, limit, include_inactive } = parsed.data;
      const { users, total } = await adminService.getAllUsers(
        { page, limit },
        include_inactive
      );

      res.status(200).json({
        data: users,
        meta: {
          page,
          limit,
          total,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /admin/users/:id
   */
  async updateUserStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' },
        });
        return;
      }

      const { id } = req.params;

      const parsed = updateUserStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Input tidak valid',
          },
        });
        return;
      }

      try {
        await adminService.updateUserStatus(
          { userId: req.user.userId, role: req.user.role },
          id,
          parsed.data,
          req.ip
        );

        res.status(200).json({
          data: { message: 'Status user berhasil diperbarui' },
        });
      } catch (err) {
        if (err instanceof Error) {
          if (
            err.message.includes('admin terakhir') ||
            err.message.includes('akun sendiri')
          ) {
            res.status(403).json({
              error: { code: 'FORBIDDEN', message: err.message },
            });
            return;
          }
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /admin/users/:id/role
   */
  async updateUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' },
        });
        return;
      }

      const { id } = req.params;

      const parsed = updateUserRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Input tidak valid',
          },
        });
        return;
      }

      try {
        await adminService.updateUserRole(
          { userId: req.user.userId, role: req.user.role },
          id,
          parsed.data.role_id,
          req.ip
        );

        res.status(200).json({
          data: { message: 'Role user berhasil diperbarui. Semua token user dicabut.' },
        });
      } catch (err) {
        if (err instanceof Error) {
          if (
            err.message.includes('admin terakhir') ||
            err.message.includes('role sendiri') ||
            err.message.includes('tidak valid')
          ) {
            res.status(403).json({
              error: { code: 'FORBIDDEN', message: err.message },
            });
            return;
          }
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /admin/users/:id/role-criteria
   * Return detail criteria promosi role untuk ditampilkan di frontend
   */
  async getUserRoleCriteria(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' },
        });
        return;
      }

      const { id } = req.params;

      const [rows] = await appPool.query<mysql.RowDataPacket[]>(
        `SELECT 
          security_pin_hash IS NOT NULL AS has_mfa_pin,
          security_answers_hash IS NOT NULL AS has_security_answers,
          password_admin_compliant
         FROM users WHERE id = ?`,
        [id]
      );

      if (rows.length === 0) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Pengguna tidak ditemukan' },
        });
        return;
      }

      const criteria = {
        has_mfa_pin: Boolean(rows[0].has_mfa_pin),
        has_security_answers: Boolean(rows[0].has_security_answers),
        password_admin_compliant: Boolean(rows[0].password_admin_compliant),
      };

      res.status(200).json({
        data: {
          criteria,
          can_be_promoted: criteria.has_mfa_pin && criteria.has_security_answers && criteria.password_admin_compliant,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
