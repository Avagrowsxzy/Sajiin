import { Router } from 'express';
import { MenuController } from '../controllers/menu.controller.js';
import { publicRateLimiter } from '../middleware/rate-limit.middleware.js';

const router = Router();
const controller = new MenuController();

// Semua rute publik menu & kategori (tanpa autentikasi)
router.get('/categories', publicRateLimiter, (req, res, next) =>
  controller.getCategories(req, res, next)
);

router.get('/', publicRateLimiter, (req, res, next) =>
  controller.getPublicMenu(req, res, next)
);

router.get('/:id', publicRateLimiter, (req, res, next) =>
  controller.getPublicMenuById(req, res, next)
);

export const menuRoutes = router;

// Alias kategori publik saat router dipasang di /api/v1/categories.
const categoryRouter = Router();
categoryRouter.get('/', publicRateLimiter, (req, res, next) =>
  controller.getCategories(req, res, next)
);

export const categoryRoutes = categoryRouter;
