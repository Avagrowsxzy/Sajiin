import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authRateLimiter } from '../middleware/rate-limit.middleware.js';

const router = Router();
const controller = new AuthController();

// Endpoint dengan rate limiting ketat (SECURITY.md & API.md)
router.post('/register', authRateLimiter, (req, res, next) => controller.register(req, res, next));
router.post('/login', authRateLimiter, (req, res, next) => controller.login(req, res, next));
router.post('/mfa/verify', authRateLimiter, (req, res, next) => controller.verifyMfa(req, res, next));
router.post('/refresh', authRateLimiter, (req, res, next) => controller.refresh(req, res, next));
router.post('/password/forgot/check', authRateLimiter, (req, res, next) => controller.checkForgotPassword(req, res, next));
router.post('/password/forgot/reset', authRateLimiter, (req, res, next) => controller.resetForgotPassword(req, res, next));

// Logout (dapat dipanggil dengan atau tanpa access token, tapi wajib refresh_token)
router.post('/logout', (req, res, next) => controller.logout(req, res, next));

// Endpoint terotentikasi (confirmMfa mendukung Bearer token maupun mfa_token saat wajib setup login)
router.post('/mfa/setup', authenticate, (req, res, next) => controller.setupMfa(req, res, next));
router.post('/mfa/confirm', authRateLimiter, (req, res, next) => controller.confirmMfa(req, res, next));
router.post('/password/change', authenticate, (req, res, next) => controller.changePassword(req, res, next));

export const authRoutes = router;
