import crypto from 'crypto';
import mysql from 'mysql2/promise';
import { appPool } from '../config/database.js';
import { RequestContext } from '../types/index.js';

export interface CartItemEntity {
  id: string;
  cart_id: string;
  menu_item_id: string;
  quantity: number;
  menu_name?: string;
  menu_price?: number;
}

export interface CartEntity {
  id: string;
  user_id: string;
  items: CartItemEntity[];
  updated_at: Date;
}

export class CartRepository {
  constructor(private pool: mysql.Pool = appPool) {}

  /**
   * Ambil atau buat keranjang user
   */
  async getOrCreateCart(ctx: RequestContext, conn?: mysql.Connection): Promise<CartEntity> {
    const executor = conn || this.pool;

    // Cek apakah cart sudah ada
    const [cartRows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT id FROM carts WHERE user_id = ?',
      [ctx.userId]
    );

    let cartId: string;
    if (cartRows.length === 0) {
      // Buat cart baru
      cartId = crypto.randomUUID();
      await executor.query(
        'INSERT INTO carts (id, user_id) VALUES (?, ?)',
        [cartId, ctx.userId]
      );
    } else {
      cartId = cartRows[0].id;
    }

    return this.findByUserId(ctx, conn);
  }

  /**
   * Ambil keranjang user lengkap dengan items
   */
  async findByUserId(ctx: RequestContext, conn?: mysql.Connection): Promise<CartEntity> {
    const executor = conn || this.pool;

    const [cartRows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT id, updated_at FROM carts WHERE user_id = ?',
      [ctx.userId]
    );

    if (cartRows.length === 0) {
      // Return empty cart
      return {
        id: '',
        user_id: ctx.userId,
        items: [],
        updated_at: new Date(),
      };
    }

    const cart = cartRows[0];

    // Ambil items dengan detail menu
    const [itemRows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT ci.id, ci.cart_id, ci.menu_item_id, ci.quantity, m.name as menu_name, m.price as menu_price
       FROM cart_items ci
       JOIN menu_items m ON ci.menu_item_id = m.id
       WHERE ci.cart_id = ?
       ORDER BY ci.id ASC`,
      [cart.id]
    );

    return {
      id: cart.id,
      user_id: ctx.userId,
      items: itemRows.map((r) => ({
        id: r.id,
        cart_id: r.cart_id,
        menu_item_id: r.menu_item_id,
        quantity: Number(r.quantity),
        menu_name: r.menu_name,
        menu_price: Number(r.menu_price),
      })),
      updated_at: new Date(cart.updated_at),
    };
  }

  /**
   * Set quantity item di keranjang (0 = hapus)
   */
  async setItemQuantity(
    ctx: RequestContext,
    menuItemId: string,
    quantity: number,
    conn?: mysql.Connection
  ): Promise<CartEntity> {
    const executor = conn || this.pool;

    // Ambil atau buat cart
    const cart = await this.getOrCreateCart(ctx, conn);

    if (quantity <= 0) {
      // Hapus item
      await executor.query(
        'DELETE FROM cart_items WHERE cart_id = ? AND menu_item_id = ?',
        [cart.id, menuItemId]
      );
    } else {
      // Cek apakah item sudah ada
      const [existing] = await executor.query<mysql.RowDataPacket[]>(
        'SELECT id FROM cart_items WHERE cart_id = ? AND menu_item_id = ?',
        [cart.id, menuItemId]
      );

      if (existing.length === 0) {
        // Insert baru
        const itemId = crypto.randomUUID();
        await executor.query(
          'INSERT INTO cart_items (id, cart_id, menu_item_id, quantity) VALUES (?, ?, ?, ?)',
          [itemId, cart.id, menuItemId, quantity]
        );
      } else {
        // Update quantity
        await executor.query(
          'UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND menu_item_id = ?',
          [quantity, cart.id, menuItemId]
        );
      }
    }

    // Return cart terupdate
    return this.findByUserId(ctx, conn);
  }

  /**
   * Kosongkan keranjang
   */
  async clear(ctx: RequestContext, conn?: mysql.Connection): Promise<void> {
    const executor = conn || this.pool;

    const cart = await this.getOrCreateCart(ctx, conn);
    await executor.query('DELETE FROM cart_items WHERE cart_id = ?', [cart.id]);
  }
}
