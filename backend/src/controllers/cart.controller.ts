import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CartService } from '../services/cart.service.js';

interface ServiceError {
  status: number;
  code: string;
  message: string;
}

const cartService = new CartService();

function serializeCart(cart: { items: Array<{ id: string; menu_item_id: string; menu_name?: string; menu_price?: number; quantity: number }>; total: number }) {
  return {
    items: cart.items.map((item) => ({
      id: item.id,
      menu_item_id: item.menu_item_id,
      menu_item_name: item.menu_name || 'Menu',
      menu_item_price: item.menu_price || 0,
      quantity: item.quantity,
      subtotal: (item.menu_price || 0) * item.quantity,
    })),
    total: cart.total,
  };
}

// Validasi schema
const setQuantitySchema = z.object({
  // Batas atas mencegah overflow integer di database & nilai tak wajar (Finding N8).
  quantity: z.number().int().min(0).max(999, 'Jumlah maksimal 999 per item'),
});

export class CartController {
  /**
   * GET /me/cart - Ambil isi keranjang
   */
  async getCart(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' },
        });
        return;
      }

      const cart = await cartService.getCart({
        userId: req.user.userId,
        role: req.user.role,
      });

      res.status(200).json({
        data: {
          ...serializeCart(cart),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /me/cart/items/:menuItemId - Set quantity (0 = hapus)
   */
  async setItemQuantity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' },
        });
        return;
      }

      const { menuItemId } = req.params;

      // Validasi
      const parsed = setQuantitySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Input tidak valid',
          },
        });
        return;
      }

      const cart = await cartService.setItemQuantity(
        {
          userId: req.user.userId,
          role: req.user.role,
        },
        menuItemId,
        parsed.data.quantity,
        req.ip
      );

      res.status(200).json({
        data: {
          ...serializeCart(cart),
        },
      });
    } catch (err) {
      this.handleServiceError(err, res, next);
    }
  }

  /**
   * DELETE /me/cart - Kosongkan keranjang
   */
  async clearCart(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' },
        });
        return;
      }

      await cartService.clearCart(
        {
          userId: req.user.userId,
          role: req.user.role,
        },
        req.ip
      );

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  private handleServiceError(err: unknown, res: Response, next: NextFunction): void {
    if (err && typeof err === 'object' && 'status' in err) {
      const serviceErr = err as ServiceError;
      res.status(serviceErr.status).json({
        error: { code: serviceErr.code, message: serviceErr.message },
      });
    } else {
      next(err);
    }
  }
}
