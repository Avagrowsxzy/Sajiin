import mysql from 'mysql2/promise';
import { appPool } from '../config/database.js';
import { lockDurationMinutes } from '../utils/lockout.js';

export interface LockoutStatus {
  isLocked: boolean;
  remainingMinutes?: number;
  durationMinutes?: number;
  failedAttempts: number;
}

/**
 * Progressive lockout per kombinasi (IP + username) yang disimpan di tabel `login_attempts`
 * agar bertahan saat server restart dan konsisten lintas proses (bukan lagi in-memory).
 * Durasi bertingkat dan tidak pernah permanen (lihat utils/lockout.ts).
 */
export class ProgressiveLockoutService {
  constructor() {
    // Bersihkan entri basi secara berkala (setiap 30 menit).
    setInterval(() => {
      appPool
        .query(
          `DELETE FROM login_attempts
            WHERE (locked_until IS NULL AND last_attempt < NOW() - INTERVAL 24 HOUR)
               OR (locked_until IS NOT NULL AND locked_until < NOW() - INTERVAL 2 HOUR)`
        )
        .catch(() => {
          // abaikan: pembersihan bersifat best-effort
        });
    }, 30 * 60 * 1000).unref();
  }

  private getKey(ip: string | undefined | null, username: string): string {
    const cleanIp = (ip || '127.0.0.1').trim();
    const cleanUser = username.trim().toLowerCase();
    return `${cleanIp}:${cleanUser}`;
  }

  async checkLockout(ip: string | undefined | null, username: string): Promise<LockoutStatus> {
    const [rows] = await appPool.query<mysql.RowDataPacket[]>(
      'SELECT failed_attempts, locked_until FROM login_attempts WHERE attempt_key = ?',
      [this.getKey(ip, username)]
    );

    if (rows.length === 0) {
      return { isLocked: false, failedAttempts: 0 };
    }

    const record = rows[0];
    const failedAttempts = Number(record.failed_attempts) || 0;

    if (record.locked_until && new Date(record.locked_until) > new Date()) {
      const remainingMinutes = Math.max(
        1,
        Math.ceil((new Date(record.locked_until).getTime() - Date.now()) / (60 * 1000))
      );
      return { isLocked: true, remainingMinutes, failedAttempts };
    }

    return { isLocked: false, failedAttempts };
  }

  async recordFailure(ip: string | undefined | null, username: string): Promise<LockoutStatus> {
    const key = this.getKey(ip, username);

    // Increment atomik agar aman terhadap request paralel.
    await appPool.query(
      `INSERT INTO login_attempts (attempt_key, failed_attempts, last_attempt)
       VALUES (?, 1, NOW())
       ON DUPLICATE KEY UPDATE failed_attempts = failed_attempts + 1, last_attempt = NOW()`,
      [key]
    );

    const [rows] = await appPool.query<mysql.RowDataPacket[]>(
      'SELECT failed_attempts FROM login_attempts WHERE attempt_key = ?',
      [key]
    );
    const failedAttempts = Number(rows[0]?.failed_attempts) || 1;
    const durationMinutes = lockDurationMinutes(failedAttempts);

    if (durationMinutes === null) {
      return { isLocked: false, failedAttempts };
    }

    await appPool.query('UPDATE login_attempts SET locked_until = ? WHERE attempt_key = ?', [
      new Date(Date.now() + durationMinutes * 60 * 1000),
      key,
    ]);

    return { isLocked: true, remainingMinutes: durationMinutes, durationMinutes, failedAttempts };
  }

  async recordSuccess(ip: string | undefined | null, username: string): Promise<void> {
    await appPool.query('DELETE FROM login_attempts WHERE attempt_key = ?', [this.getKey(ip, username)]);
  }

  async reset(): Promise<void> {
    await appPool.query('DELETE FROM login_attempts');
  }
}

export const progressiveLockout = new ProgressiveLockoutService();
