import { CartRepository, CartEntity } from '../repositories/cart.repository.js';
import { MenuRepository } from '../repositories/menu.repository.js';
import { writeAudit } from './audit.service.js';
import { RequestContext } from '../types/index.js';

export interface CartWithTotal extends CartEntity {
  total: number;
}

export class CartService {
  constructor(
    private cartRepo: CartRepository = new CartRepository(),
    private menuRepo: MenuRepository = new MenuRepository()
  ) {}

  /**
   * Ambil keranjang user lengkap dengan total
   */
  async getCart(ctx: RequestContext): Promise<CartWithTotal> {
    const cart = await this.cartRepo.findByUserId(ctx);

    // Hitung total dari harga menu saat ini
    let total = 0;
    for (const item of cart.items) {
      if (item.menu_price !== undefined) {
        total += item.menu_price * item.quantity;
      }
    }

    return {
      ...cart,
      total,
    };
  }

  /**
   * Set quantity item di keranjang (0 = hapus, >0 = set quantity)
   */
  async setItemQuantity(
    ctx: RequestContext,
    menuItemId: string,
    quantity: number,
    _ipAddress?: string | null
  ): Promise<CartWithTotal> {
    // Validasi quantity
    if (quantity < 0) {
      throw {
        status: 400,
        code: 'INVALID_QUANTITY',
        message: 'Jumlah tidak boleh negatif',
      };
    }

    // Jika quantity = 0, tidak perlu validasi menu (hanya hapus)
    if (quantity > 0) {
      // Cek menu exists dan available
      const menu = await this.menuRepo.findById(menuItemId);
      if (!menu) {
        throw {
          status: 404,
          code: 'MENU_NOT_FOUND',
          message: 'Menu tidak ditemukan',
        };
      }

      if (!menu.is_available) {
        throw {
          status: 409,
          code: 'MENU_NOT_AVAILABLE',
          message: 'Menu tidak tersedia',
        };
      }
    }

    // Set quantity di keranjang
    const updated = await this.cartRepo.setItemQuantity(ctx, menuItemId, quantity);

    // Hitung total
    let total = 0;
    for (const item of updated.items) {
      if (item.menu_price !== undefined) {
        total += item.menu_price * item.quantity;
      }
    }

    return {
      ...updated,
      total,
    };
  }

  /**
   * Kosongkan keranjang (dengan audit log)
   */
  async clearCart(
    ctx: RequestContext,
    ipAddress?: string | null
  ): Promise<void> {
    const cart = await this.cartRepo.findByUserId(ctx);

    await this.cartRepo.clear(ctx);

    // Audit log untuk clear cart
    await writeAudit({
      actorId: ctx.userId,
      action: 'CART_CLEAR',
      entity: 'carts',
      entity_id: cart.id,
      old_value: { items_count: cart.items.length },
      ipAddress,
    });
  }
}
