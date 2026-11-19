import { Router } from 'express';
import { UserController } from '../controllers/user.controller.js';
import { CartController } from '../controllers/cart.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.middleware.js';

const router = Router();
const userController = new UserController();
const cartController = new CartController();

// GET /me dan PATCH /me (RBAC: profile:manage:own)
router.get('/', authenticate, requirePermission('profile:manage:own'), (req, res, next) =>
  userController.getMe(req, res, next)
);

router.patch('/', authenticate, requirePermission('profile:manage:own'), (req, res, next) =>
  userController.updateMe(req, res, next)
);


// Cart routes (RBAC: cart:manage:own)
router.get('/cart', authenticate, requirePermission('cart:manage:own'), (req, res, next) =>
  cartController.getCart(req, res, next)
);

router.put('/cart/items/:menuItemId', authenticate, requirePermission('cart:manage:own'), (req, res, next) =>
  cartController.setItemQuantity(req, res, next)
);

router.delete('/cart', authenticate, requirePermission('cart:manage:own'), (req, res, next) =>
  cartController.clearCart(req, res, next)
);

export const userRoutes = router;
