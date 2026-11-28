import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.middleware.js';
import { paymentWebhookRateLimiter } from '../middleware/rate-limit.middleware.js';

const router = Router();
const controller = new PaymentController();

// POST /payments/webhook — Tanpa JWT auth, tetapi wajib verifikasi signature HMAC
router.post('/webhook', paymentWebhookRateLimiter, (req, res, next) => controller.handleWebhook(req, res, next));
router.post('/orders/:id/proof', authenticate, requirePermission('payment:create:own'), (req, res, next) => controller.uploadProof(req, res, next));
router.get('/:id/proof', authenticate, requirePermission('payment:read:all'), (req, res, next) => controller.getProof(req, res, next));

export const paymentRoutes = router;
