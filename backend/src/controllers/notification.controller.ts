import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { NotificationService } from '../services/notification.service.js';

const notificationService = new NotificationService();

const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unread: z.coerce.boolean().optional(),
});

export class NotificationController {
  /**
   * GET /me/notifications — daftar notifikasi milik sendiri
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const parsed = listSchema.safeParse(req.query);
      const { page, limit, unread } = parsed.success
        ? parsed.data
        : { page: 1, limit: 20, unread: false };

      const result = await notificationService.list(
        { userId: req.user.userId, role: req.user.role },
        { page, limit },
        unread === true
      );

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /me/notifications/unread-count — badge lonceng
   */
  async unreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const count = await notificationService.unreadCount({
        userId: req.user.userId,
        role: req.user.role,
      });
      res.status(200).json({ data: { count } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /me/notifications/:id/read
   */
  async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      await notificationService.markRead({ userId: req.user.userId, role: req.user.role }, req.params.id);
      res.status(200).json({ data: { message: 'Notifikasi ditandai dibaca' } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /me/notifications/read-all
   */
  async markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      await notificationService.markAllRead({ userId: req.user.userId, role: req.user.role });
      res.status(200).json({ data: { message: 'Semua notifikasi ditandai dibaca' } });
    } catch (err) {
      next(err);
    }
  }
}
