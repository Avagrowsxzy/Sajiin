import { Router } from 'express';
import { OrderController } from '../controllers/order.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.middleware.js';

const router = Router();
const controller = new OrderController();

// Semua rute /orders memerlukan autentikasi JWT
router.use(authenticate);

// POST /orders — Checkout dari keranjang
router.post('/', requirePermission('order:create'), (req, res, next) =>
  controller.checkout(req, res, next)
);

// GET /orders — Riwayat pesanan milik sendiri
router.get('/', requirePermission('order:read:own'), (req, res, next) =>
  controller.getUserOrders(req, res, next)
);

// GET /orders/:id — Detail pesanan sendiri
router.get('/:id', requirePermission('order:read:own'), (req, res, next) =>
  controller.getUserOrderById(req, res, next)
);

// POST /orders/:id/cancel — Batalkan pesanan sendiri (status pending)
router.post('/:id/cancel', requirePermission('order:cancel:own'), (req, res, next) =>
  controller.cancelOrder(req, res, next)
);

// POST /orders/:id/payment — Buat transaksi pembayaran
router.post('/:id/payment', requirePermission('payment:create:own'), (req, res, next) =>
  controller.createPayment(req, res, next)
);

// GET /orders/:id/payment — Status pembayaran pesanan
router.get('/:id/payment', requirePermission('payment:read:own'), (req, res, next) =>
  controller.getPaymentStatus(req, res, next)
);

export const orderRoutes = router;
