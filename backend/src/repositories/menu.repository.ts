import mysql from 'mysql2/promise';
import { appPool } from '../config/database.js';

export interface MenuItemEntity {
  id: string;
  category_id: number;
  category_name?: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
  is_available: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MenuFilterParams {
  category_id?: number;
  q?: string;
  page: number;
  limit: number;
}

export class MenuRepository {
  constructor(private pool: mysql.Pool = appPool) {}

  /**
   * Katalog publik: hanya menampilkan menu yang `is_available = 1` (PROJECT.md)
   */
  async findPublic(
    params: MenuFilterParams,
    conn?: mysql.Connection
  ): Promise<{ data: MenuItemEntity[]; total: number }> {
    const executor = conn || this.pool;
    const conditions: string[] = ['m.is_available = 1'];
    const values: (string | number)[] = [];

    if (params.category_id !== undefined) {
      conditions.push('m.category_id = ?');
      values.push(params.category_id);
    }

    if (params.q && params.q.trim()) {
      conditions.push('(m.name LIKE ? OR m.description LIKE ?)');
      const searchPattern = `%${params.q.trim()}%`;
      values.push(searchPattern, searchPattern);
    }

    const whereClause = conditions.join(' AND ');

    // Hitung total data
    const [countRows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM menu_items m WHERE ${whereClause}`,
      values
    );
    const total = Number(countRows[0].total);

    // Ambil data halaman aktif
    const offset = (params.page - 1) * params.limit;
    const queryValues = [...values, params.limit, offset];

    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT m.*, c.name as category_name
       FROM menu_items m
       JOIN categories c ON m.category_id = c.id
       WHERE ${whereClause}
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      queryValues
    );

    return {
      data: rows.map(this.mapToEntity),
      total,
    };
  }

  /**
   * Daftar menu untuk Admin (menampilkan semua item, baik aktif maupun tidak)
   */
  async findAdmin(
    params: MenuFilterParams,
    conn?: mysql.Connection
  ): Promise<{ data: MenuItemEntity[]; total: number }> {
    const executor = conn || this.pool;
    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (params.category_id !== undefined) {
      conditions.push('m.category_id = ?');
      values.push(params.category_id);
    }

    if (params.q && params.q.trim()) {
      conditions.push('(m.name LIKE ? OR m.description LIKE ?)');
      const searchPattern = `%${params.q.trim()}%`;
      values.push(searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM menu_items m ${whereClause}`,
      values
    );
    const total = Number(countRows[0].total);

    const offset = (params.page - 1) * params.limit;
    const queryValues = [...values, params.limit, offset];

    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT m.*, c.name as category_name
       FROM menu_items m
       JOIN categories c ON m.category_id = c.id
       ${whereClause}
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      queryValues
    );

    return {
      data: rows.map(this.mapToEntity),
      total,
    };
  }

  /**
   * Ambil detail menu berdasarkan ID
   */
  async findById(id: string, conn?: mysql.Connection): Promise<MenuItemEntity | null> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT m.*, c.name as category_name
       FROM menu_items m
       JOIN categories c ON m.category_id = c.id
       WHERE m.id = ?`,
      [id]
    );

    if (rows.length === 0) return null;
    return this.mapToEntity(rows[0]);
  }

  /**
   * Tambah menu baru
   */
  async create(
    item: {
      id: string;
      category_id: number;
      name: string;
      description?: string | null;
      price: number;
      stock: number;
      image_url?: string | null;
      is_available?: boolean;
      created_by?: string | null;
    },
    conn?: mysql.Connection
  ): Promise<MenuItemEntity> {
    const executor = conn || this.pool;
    await executor.query(
      `INSERT INTO menu_items (id, category_id, name, description, price, stock, image_url, is_available, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.category_id,
        item.name.trim(),
        item.description?.trim() ?? null,
        item.price,
        item.stock,
        item.image_url?.trim() ?? null,
        item.is_available === undefined ? 1 : item.is_available ? 1 : 0,
        item.created_by ?? null,
      ]
    );

    const created = await this.findById(item.id, conn);
    if (!created) throw new Error('Gagal mengambil data menu yang baru dibuat');
    return created;
  }

  /**
   * Update data menu
   */
  async update(
    id: string,
    updates: Partial<{
      category_id: number;
      name: string;
      description: string | null;
      price: number;
      stock: number;
      image_url: string | null;
      is_available: boolean;
    }>,
    conn?: mysql.Connection
  ): Promise<MenuItemEntity | null> {
    const executor = conn || this.pool;
    const updateParts: string[] = [];
    const values: (string | number | boolean | null)[] = [];

    if (updates.category_id !== undefined) {
      updateParts.push('category_id = ?');
      values.push(updates.category_id);
    }
    if (updates.name !== undefined) {
      updateParts.push('name = ?');
      values.push(updates.name.trim());
    }
    if (updates.description !== undefined) {
      updateParts.push('description = ?');
      values.push(updates.description ? updates.description.trim() : null);
    }
    if (updates.price !== undefined) {
      updateParts.push('price = ?');
      values.push(updates.price);
    }
    if (updates.stock !== undefined) {
      updateParts.push('stock = ?');
      values.push(updates.stock);
    }
    if (updates.image_url !== undefined) {
      updateParts.push('image_url = ?');
      values.push(updates.image_url ? updates.image_url.trim() : null);
    }
    if (updates.is_available !== undefined) {
      updateParts.push('is_available = ?');
      values.push(updates.is_available ? 1 : 0);
    }

    if (updateParts.length === 0) {
      return this.findById(id, conn);
    }

    values.push(id);
    await executor.query(
      `UPDATE menu_items SET ${updateParts.join(', ')} WHERE id = ?`,
      values
    );

    return this.findById(id, conn);
  }

  /**
   * Cek apakah menu pernah dipesan (terdapat di order_items)
   */
  async isOrdered(id: string, conn?: mysql.Connection): Promise<boolean> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM order_items WHERE menu_item_id = ?',
      [id]
    );
    return Number(rows[0].count) > 0;
  }

  /** Cek apakah menu masih ada di keranjang user mana pun. */
  async isInCart(id: string, conn?: mysql.Connection): Promise<boolean> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM cart_items WHERE menu_item_id = ?',
      [id]
    );
    return Number(rows[0].count) > 0;
  }

  /**
   * Soft-delete: set is_available = 0 (bila pernah dipesan)
   */
  async softDelete(id: string, conn?: mysql.Connection): Promise<boolean> {
    const executor = conn || this.pool;
    const [result] = await executor.query<mysql.ResultSetHeader>(
      'UPDATE menu_items SET is_available = 0 WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  /**
   * Hard-delete (hanya jika belum pernah dipesan dan diperbolehkan)
   */
  async delete(id: string, conn?: mysql.Connection): Promise<boolean> {
    const executor = conn || this.pool;
    const [result] = await executor.query<mysql.ResultSetHeader>(
      'DELETE FROM menu_items WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  private mapToEntity(row: mysql.RowDataPacket): MenuItemEntity {
    return {
      id: row.id,
      category_id: Number(row.category_id),
      category_name: row.category_name,
      name: row.name,
      description: row.description,
      price: Number(row.price),
      stock: Number(row.stock),
      image_url: row.image_url,
      is_available: Boolean(row.is_available),
      created_by: row.created_by,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}
