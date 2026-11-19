import mysql from 'mysql2/promise';
import { appPool } from '../config/database.js';

export interface CategoryEntity {
  id: number;
  name: string;
}

export class CategoryRepository {
  constructor(private pool: mysql.Pool = appPool) {}

  async findAll(conn?: mysql.Connection): Promise<CategoryEntity[]> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT id, name FROM categories ORDER BY name ASC'
    );
    return rows.map((r) => ({ id: Number(r.id), name: r.name }));
  }

  async findById(id: number, conn?: mysql.Connection): Promise<CategoryEntity | null> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT id, name FROM categories WHERE id = ?',
      [id]
    );
    if (rows.length === 0) return null;
    return { id: Number(rows[0].id), name: rows[0].name };
  }

  async findByName(name: string, conn?: mysql.Connection): Promise<CategoryEntity | null> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT id, name FROM categories WHERE LOWER(name) = ?',
      [name.toLowerCase().trim()]
    );
    if (rows.length === 0) return null;
    return { id: Number(rows[0].id), name: rows[0].name };
  }

  async create(name: string, conn?: mysql.Connection): Promise<CategoryEntity> {
    const executor = conn || this.pool;
    const [result] = await executor.query<mysql.ResultSetHeader>(
      'INSERT INTO categories (name) VALUES (?)',
      [name.trim()]
    );
    return { id: result.insertId, name: name.trim() };
  }

  async update(id: number, name: string, conn?: mysql.Connection): Promise<CategoryEntity | null> {
    const executor = conn || this.pool;
    await executor.query(
      'UPDATE categories SET name = ? WHERE id = ?',
      [name.trim(), id]
    );
    return this.findById(id, conn);
  }

  async hasMenuItems(id: number, conn?: mysql.Connection): Promise<boolean> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM menu_items WHERE category_id = ? AND is_available = 1',
      [id]
    );
    return Number(rows[0].count) > 0;
  }

  async delete(id: number, conn?: mysql.Connection): Promise<boolean> {
    const executor = conn || this.pool;
    const [result] = await executor.query<mysql.ResultSetHeader>(
      'DELETE FROM categories WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}
