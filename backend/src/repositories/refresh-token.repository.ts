import mysql from 'mysql2/promise';
import { appPool } from '../config/database.js';

export interface RefreshTokenEntity {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

export class RefreshTokenRepository {
  constructor(private pool: mysql.Pool = appPool) {}

  /**
   * Simpan refresh token baru (hanya menyimpan hash SHA-256)
   */
  async create(
    data: {
      id: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
    conn?: mysql.Connection
  ): Promise<void> {
    const executor = conn || this.pool;
    await executor.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.userId,
        data.tokenHash,
        data.expiresAt,
        data.ipAddress ?? null,
        data.userAgent ?? null,
      ]
    );
  }

  /**
   * Cari token berdasarkan hash
   */
  async findByTokenHash(tokenHash: string, conn?: mysql.Connection): Promise<RefreshTokenEntity | null> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT * FROM refresh_tokens WHERE token_hash = ?',
      [tokenHash]
    );

    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      token_hash: row.token_hash,
      expires_at: new Date(row.expires_at),
      revoked_at: row.revoked_at ? new Date(row.revoked_at) : null,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      created_at: new Date(row.created_at),
    };
  }

  /**
   * Cabut (revoke) token tertentu (saat rotasi atau logout)
   */
  async revokeToken(tokenHash: string, conn?: mysql.Connection): Promise<void> {
    const executor = conn || this.pool;
    await executor.query(
      'UPDATE refresh_tokens SET revoked_at = NOW(3) WHERE token_hash = ?',
      [tokenHash]
    );
  }

  /**
   * Cabut semua refresh token milik user (saat ganti password, perubahan role, atau akun dinonaktifkan)
   */
  async revokeAllForUser(userId: string, conn?: mysql.Connection): Promise<void> {
    const executor = conn || this.pool;
    await executor.query(
      'UPDATE refresh_tokens SET revoked_at = NOW(3) WHERE user_id = ? AND revoked_at IS NULL',
      [userId]
    );
  }

  /**
   * Cabut semua refresh token milik user (alias untuk revokeAllForUser)
   */
  async revokeAllByUserId(userId: string, conn?: mysql.Connection): Promise<void> {
    return this.revokeAllForUser(userId, conn);
  }
}
