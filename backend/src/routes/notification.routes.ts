import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth.middleware.js';
import { NotificationController } from '../controllers/notification.controller.js';

const router = Router();
const controller = new NotificationController();

// Semua rute notifikasi memerlukan login (data milik sendiri, scoped per user)
router.use(authenticate);

router.get('/', requirePermission('notification:manage:own'), (req, res, next) =>
  controller.list(req, res, next)
);

router.get('/unread-count', requirePermission('notification:manage:own'), (req, res, next) =>
  controller.unreadCount(req, res, next)
);

router.patch('/read-all', requirePermission('notification:manage:own'), (req, res, next) =>
  controller.markAllRead(req, res, next)
);

router.patch('/:id/read', requirePermission('notification:manage:own'), (req, res, next) =>
  controller.markRead(req, res, next)
);

export const notificationRoutes = router;
