import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth.middleware.js';
import { SettingsController } from '../controllers/settings.controller.js';

const router = Router();
const controller = new SettingsController();

// Terautentikasi: detail pembayaran hanya dibuka untuk pengguna login (saat konfirmasi pesanan)
router.get('/payment', authenticate, (req, res, next) => controller.getPaymentSettings(req, res, next));

// Admin: ubah instruksi pembayaran
router.patch('/payment', authenticate, requirePermission('system:config'), (req, res, next) =>
  controller.updatePaymentSettings(req, res, next)
);

export const settingsRoutes = router;
