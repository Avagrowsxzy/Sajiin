import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth.middleware.js';
import { MenuController } from '../controllers/menu.controller.js';
import { OrderController } from '../controllers/order.controller.js';
import { AdminController } from '../controllers/admin.controller.js';
import { PaymentController } from '../controllers/payment.controller.js';

const router = Router();
const menuController = new MenuController();
const orderController = new OrderController();
const adminController = new AdminController();
const paymentController = new PaymentController();

// Semua rute admin memerlukan autentikasi
router.use(authenticate);

// ===== KATEGORI =====
router.get('/categories', requirePermission('menu:read'), (req, res, next) =>
  menuController.getCategories(req, res, next)
);

router.post('/categories', requirePermission('category:write'), (req, res, next) =>
  menuController.createCategory(req, res, next)
);

router.patch('/categories/:id', requirePermission('category:write'), (req, res, next) =>
  menuController.updateCategory(req, res, next)
);

router.delete('/categories/:id', requirePermission('category:write'), (req, res, next) =>
  menuController.deleteCategory(req, res, next)
);

// ===== MENU =====
router.get('/menu', requirePermission('menu:read'), (req, res, next) =>
  menuController.getAdminMenu(req, res, next)
);

router.get('/menu/:id', requirePermission('menu:read'), (req, res, next) =>
  menuController.getMenuById(req, res, next)
);

router.post('/menu', requirePermission('menu:write'), (req, res, next) =>
  menuController.createMenu(req, res, next)
);

router.patch('/menu/:id', requirePermission('menu:write'), (req, res, next) =>
  menuController.updateMenu(req, res, next)
);

router.delete('/menu/:id', requirePermission('menu:write'), (req, res, next) =>
  menuController.deleteMenu(req, res, next)
);

// ===== PESANAN =====
router.get('/orders', requirePermission('order:read:all'), (req, res, next) =>
  orderController.adminGetAllOrders(req, res, next)
);

router.get('/orders/:id', requirePermission('order:read:all'), (req, res, next) =>
  orderController.adminGetOrderById(req, res, next)
);

router.patch('/orders/:id/status', requirePermission('order:update_status'), (req, res, next) =>
  orderController.adminUpdateStatus(req, res, next)
);

// ===== PEMBAYARAN =====
router.get('/payments', requirePermission('payment:read:all'), (req, res, next) =>
  paymentController.adminGetAllPayments(req, res, next)
);

router.post('/payments/:id/refund', requirePermission('payment:refund'), (req, res, next) =>
  paymentController.adminRefundPayment(req, res, next)
);

// Konfirmasi pembayaran masuk (awaiting_confirmation -> paid) + notif ke user
router.patch('/orders/:id/confirm-payment', requirePermission('order:update_status'), (req, res, next) =>
  paymentController.adminConfirmPayment(req, res, next)
);

// ===== DASHBOARD =====
router.get('/audit/logs', requirePermission('audit:read'), (req, res, next) =>
  adminController.getAuditLogs(req, res, next)
);

router.get('/dashboard/summary', requirePermission('order:read:all'), (req, res, next) =>
  adminController.getDashboardSummary(req, res, next)
);

// ===== USER MANAGEMENT =====
router.get('/users', requirePermission('user:read:all'), (req, res, next) =>
  adminController.getAllUsers(req, res, next)
);

router.post('/customers', requirePermission('user:manage'), (req, res, next) =>
  adminController.createCustomer(req, res, next)
);

router.patch('/users/:id', requirePermission('user:manage'), (req, res, next) =>
  adminController.updateUserStatus(req, res, next)
);

router.patch('/users/:id/role', requirePermission('role:assign'), (req, res, next) =>
  adminController.updateUserRole(req, res, next)
);

router.get('/users/:id/role-criteria', requirePermission('user:read:all'), (req, res, next) =>
  adminController.getUserRoleCriteria(req, res, next)
);

export const adminRoutes = router;
