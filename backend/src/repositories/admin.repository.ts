import mysql from 'mysql2/promise';
import { appPool } from '../config/database.js';
import { PaginationParams } from '../types/index.js';

export interface AdminUserListItem {
  id: string;
  role_id: number;
  role_name: string;
  full_name: string;
  username: string;
  is_active: boolean;
  has_mfa: boolean;
  password_admin_compliant: boolean;
  locked_until: Date | null;
  created_at: Date;
}

export interface DashboardSummary {
  total_orders: number;
  total_revenue: string;
  pending_orders: number;
  out_of_stock_menu: number;
  orders_by_status: {
    pending: number;
    awaiting_confirmation: number;
    paid: number;
    preparing: number;
    ready: number;
    completed: number;
    cancelled: number;
  };
}

export class AdminRepository {
  constructor(private pool: mysql.Pool = appPool) {}

  /**
   * Ambil daftar semua user untuk admin
   */
  async getAllUsers(
    pagination: PaginationParams,
    includeInactive = false,
    conn?: mysql.Connection
  ): Promise<{ users: AdminUserListItem[]; total: number }> {
    const executor = conn || this.pool;
    const offset = (pagination.page - 1) * pagination.limit;

    // Count total
    const activeWhere = includeInactive ? '' : ' WHERE is_active = 1';
    const [countRows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM users${activeWhere}`
    );
    const total = countRows[0]?.total || 0;

    // Get paginated users
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT u.id, u.role_id, r.name as role_name, u.full_name, u.username, 
              u.is_active, u.locked_until, u.created_at,
              (u.security_pin_hash IS NOT NULL AND u.security_answers_hash IS NOT NULL) AS has_mfa,
              u.password_admin_compliant
       FROM users u
       JOIN roles r ON u.role_id = r.id
       ${includeInactive ? '' : 'WHERE u.is_active = 1'}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [pagination.limit, offset]
    );

    const users = rows.map((row) => ({
      id: row.id,
      role_id: row.role_id,
      role_name: row.role_name,
      full_name: row.full_name,
      username: row.username,
      is_active: Boolean(row.is_active),
      has_mfa: Boolean(row.has_mfa),
      password_admin_compliant: Boolean(row.password_admin_compliant),
      locked_until: row.locked_until ? new Date(row.locked_until) : null,
      created_at: new Date(row.created_at),
    }));

    return { users, total };
  }

  /**
   * Update status user (is_active, unlock)
   */
  async updateUserStatus(
    userId: string,
    data: { is_active?: boolean; locked_until?: Date | null },
    conn?: mysql.Connection
  ): Promise<void> {
    const executor = conn || this.pool;
    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(data.is_active ? 1 : 0);
    }

    if (data.locked_until !== undefined) {
      updates.push('locked_until = ?');
      values.push(data.locked_until);
    }

    if (updates.length === 0) return;

    values.push(userId);
    await executor.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
  }

  /**
   * Update role user
   */
  async updateUserRole(userId: string, roleId: number, conn?: mysql.Connection): Promise<void> {
    const executor = conn || this.pool;
    await executor.query('UPDATE users SET role_id = ? WHERE id = ?', [roleId, userId]);
  }

  /**
   * Hitung jumlah admin aktif (untuk perlindungan admin terakhir)
   */
  async countActiveAdmins(conn?: mysql.Connection): Promise<number> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM users WHERE role_id = 1 AND is_active = 1'
    );
    return rows[0]?.count || 0;
  }

  /**
   * Cek apakah user adalah admin
   */
  async isUserAdmin(userId: string, conn?: mysql.Connection): Promise<boolean> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT role_id FROM users WHERE id = ?',
      [userId]
    );
    return rows[0]?.role_id === 1;
  }

  /**
   * Ambil status kepatuhan criteria untuk promosi role
   */
  async getUserRoleCompliance(
    userId: string,
    conn?: mysql.Connection
  ): Promise<{
    role_id: number;
    has_mfa_pin: boolean;
    has_security_answers: boolean;
    password_admin_compliant: boolean;
  } | null> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT role_id,
              security_pin_hash IS NOT NULL AS has_mfa_pin,
              security_answers_hash IS NOT NULL AS has_security_answers,
              password_admin_compliant
       FROM users
       WHERE id = ?`,
      [userId]
    );
    if (rows.length === 0) return null;
    return {
      role_id: Number(rows[0].role_id),
      has_mfa_pin: Boolean(rows[0].has_mfa_pin),
      has_security_answers: Boolean(rows[0].has_security_answers),
      password_admin_compliant: Boolean(rows[0].password_admin_compliant),
    };
  }

  /**
   * Ambil summary dashboard untuk admin
   */
  async getDashboardSummary(
    filters?: { date_from?: string; date_to?: string },
    conn?: mysql.Connection
  ): Promise<DashboardSummary> {
    const executor = conn || this.pool;
    const conditions: string[] = [];
    const values: string[] = [];
    if (filters?.date_from) {
      conditions.push('o.created_at >= ?');
      values.push(filters.date_from);
    }
    if (filters?.date_to) {
      conditions.push('o.created_at < ?');
      values.push(filters.date_to);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total orders dan omzet bersih: hanya pembayaran settled yang dihitung.
    // Payment refunded sengaja tidak masuk omzet.
    const [summaryRows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(CASE WHEN p.status = 'settled' THEN p.amount ELSE 0 END), 0) as total_revenue
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.id
       ${where}`,
      values
    );

    // Orders by status
    const [statusRows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT status, COUNT(*) as count
       FROM orders o
       ${where}
       GROUP BY status`,
      values
    );

    const ordersByStatus = {
      pending: 0,
      awaiting_confirmation: 0,
      paid: 0,
      preparing: 0,
      ready: 0,
      completed: 0,
      cancelled: 0,
    };

    statusRows.forEach((row) => {
      if (row.status in ordersByStatus) {
        ordersByStatus[row.status as keyof typeof ordersByStatus] = row.count;
      }
    });

    // Menu habis (stok 0 dan masih tersedia)
    const [stockRows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM menu_items WHERE stock <= 0`
    );

    return {
      total_orders: summaryRows[0]?.total_orders || 0,
      total_revenue: Number(summaryRows[0]?.total_revenue || 0).toFixed(2),
      pending_orders: ordersByStatus.pending,
      out_of_stock_menu: stockRows[0]?.count || 0,
      orders_by_status: ordersByStatus,
    };
  }
}
