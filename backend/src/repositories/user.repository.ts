import mysql from 'mysql2/promise';
import { appPool } from '../config/database.js';
import { RequestContext, ROLE_NAMES, RoleId } from '../types/index.js';
import { encryptField, decryptField, hashPhone } from '../utils/crypto.js';

export interface UserEntity {
  id: string;
  role_id: number;
  role_name: string;
  full_name: string;
  username: string;
  phone: string | null;
  password_hash: string;
  mfa_secret: string | null;
  security_pin_hash: string | null;
  security_answers_hash: string | null;
  password_admin_compliant: boolean;
  is_active: boolean;
  failed_login_count: number;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type SafeUser = Omit<
  UserEntity,
  'password_hash' | 'mfa_secret' | 'security_pin_hash' | 'security_answers_hash'
> & {
  has_mfa: boolean;
};

export class UserRepository {
  constructor(private pool: mysql.Pool = appPool) {}

  /**
   * Cari user berdasarkan Username (internal untuk autentikasi)
   */
  async findByUsername(username: string, conn?: mysql.Connection): Promise<UserEntity | null> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT u.*, r.name as role_name 
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.username = ?`,
      [username.toLowerCase().trim()]
    );

    if (rows.length === 0) return null;
    return this.mapToEntity(rows[0]);
  }

  /**
   * Cari user berdasarkan ID
   */
  async findById(id: string, conn?: mysql.Connection): Promise<UserEntity | null> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      `SELECT u.*, r.name as role_name 
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.id = ?`,
      [id]
    );

    if (rows.length === 0) return null;
    return this.mapToEntity(rows[0]);
  }

  /**
   * Buat pengguna baru (registrasi)
   */
  async create(
    user: {
      id: string;
      role_id: number;
      full_name: string;
      username: string;
      password_hash: string;
      password_admin_compliant?: boolean;
      phone?: string | null;
    },
    conn?: mysql.Connection
  ): Promise<UserEntity> {
    const executor = conn || this.pool;
    const encryptedPhone = encryptField(user.phone);
    const phoneHash = user.phone ? hashPhone(user.phone) : null;

    await executor.query(
       `INSERT INTO users (id, role_id, full_name, username, password_hash, password_admin_compliant, phone, phone_hash, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        user.id,
        user.role_id,
        user.full_name,
        user.username.toLowerCase().trim(),
        user.password_hash,
        user.password_admin_compliant ? 1 : 0,
        encryptedPhone,
        phoneHash,
      ]
    );

    const created = await this.findById(user.id, conn);
    if (!created) throw new Error('Gagal mengambil data user yang baru dibuat');
    return created;
  }

  async findByPhoneHash(phoneHash: string): Promise<UserEntity | null> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.phone_hash = ?`,
      [phoneHash]
    );
    return rows[0] ? this.mapToEntity(rows[0]) : null;
  }

  async updateSecurityPinHash(userId: string, hash: string, answersHash?: string | null): Promise<void> {
    if (answersHash !== undefined) {
      await this.pool.query(
        'UPDATE users SET security_pin_hash = ?, security_answers_hash = ? WHERE id = ?',
        [hash, answersHash, userId]
      );
      return;
    }
    await this.pool.query('UPDATE users SET security_pin_hash = ? WHERE id = ?', [hash, userId]);
  }

  /**
   * Update profil dengan filter kepemilikan scoped (DATABASE.md bagian 9 & RBAC.md)
   * Hanya boleh mengubah full_name dan phone. Role_id, is_active, dll diabaikan.
   */
  async updateProfile(
    ctx: RequestContext,
    data: { full_name?: string; phone?: string | null },
    conn?: mysql.Connection
  ): Promise<SafeUser | null> {
    const executor = conn || this.pool;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.full_name !== undefined) {
      updates.push('full_name = ?');
      values.push(data.full_name.trim());
    }

    if (data.phone !== undefined) {
      updates.push('phone = ?', 'phone_hash = ?');
      values.push(
        encryptField(data.phone || null),
        data.phone ? hashPhone(data.phone) : null
      );
    }

    if (updates.length === 0) {
      const user = await this.findById(ctx.userId, conn);
      return user ? this.toSafeUser(user) : null;
    }

    values.push(ctx.userId);

    // KETAT: Memaksa filter WHERE id = ctx.userId (mencegah IDOR & Mass Assignment)
    await executor.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const updated = await this.findById(ctx.userId, conn);
    return updated ? this.toSafeUser(updated) : null;
  }

  /**
   * Catat kegagalan login dan lockout jika sudah 5x gagal berturut-turut (15 menit)
   */
  async recordFailedLogin(userId: string, conn?: mysql.Connection): Promise<{ locked: boolean; lockedUntil?: Date }> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT failed_login_count FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) return { locked: false };

    const newCount = (rows[0].failed_login_count || 0) + 1;

    if (newCount >= 5) {
      // Kunci 15 menit
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      await executor.query(
        'UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?',
        [newCount, lockedUntil, userId]
      );
      return { locked: true, lockedUntil };
    }

    await executor.query(
      'UPDATE users SET failed_login_count = ? WHERE id = ?',
      [newCount, userId]
    );
    return { locked: false };
  }

  /**
   * Reset failed login counter setelah sukses login
   */
  async resetFailedLogin(userId: string, conn?: mysql.Connection): Promise<void> {
    const executor = conn || this.pool;
    await executor.query(
      'UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?',
      [userId]
    );
  }

  /**
   * Update password hash dan status kepatuhan panjang password admin/kasir
   */
  async updatePassword(
    userId: string,
    newPasswordHash: string,
    passwordAdminCompliant = false,
    conn?: mysql.Connection
  ): Promise<void> {
    const executor = conn || this.pool;
    await executor.query(
      'UPDATE users SET password_hash = ?, password_admin_compliant = ? WHERE id = ?',
      [newPasswordHash, passwordAdminCompliant ? 1 : 0, userId]
    );
  }

  /**
   * Update MFA Secret (dienkripsi sebelum simpan)
   */
  async updateMfaSecret(userId: string, plainMfaSecret: string | null, conn?: mysql.Connection): Promise<void> {
    const executor = conn || this.pool;
    const encryptedSecret = encryptField(plainMfaSecret);
    await executor.query(
      'UPDATE users SET mfa_secret = ? WHERE id = ?',
      [encryptedSecret, userId]
    );
  }

  /**
   * Konversi entity ke SafeUser (tanpa password_hash dan mfa_secret)
   */
  toSafeUser(user: UserEntity): SafeUser {
    return {
      id: user.id,
      role_id: user.role_id,
      role_name: user.role_name,
      full_name: user.full_name,
      username: user.username,
      phone: user.phone,
      is_active: user.is_active,
      failed_login_count: user.failed_login_count,
      locked_until: user.locked_until,
      created_at: user.created_at,
      updated_at: user.updated_at,
      has_mfa: !!user.security_pin_hash,
      password_admin_compliant: user.password_admin_compliant,
    };
  }

  private mapToEntity(row: mysql.RowDataPacket): UserEntity {
    return {
      id: row.id,
      role_id: row.role_id,
      role_name: row.role_name || ROLE_NAMES[row.role_id as RoleId],
      full_name: row.full_name,
      username: row.username,
      phone: decryptField(row.phone),
      password_hash: row.password_hash,
      mfa_secret: decryptField(row.mfa_secret),
      security_pin_hash: row.security_pin_hash || null,
      security_answers_hash: row.security_answers_hash || null,
      password_admin_compliant: Boolean(row.password_admin_compliant),
      is_active: Boolean(row.is_active),
      failed_login_count: row.failed_login_count || 0,
      locked_until: row.locked_until ? new Date(row.locked_until) : null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}
