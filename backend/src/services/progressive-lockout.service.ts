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
 * Progressive lockout persisten di tabel `login_attempts`, dipakai untuk beberapa scope yang
 * dipisahkan lewat prefix `attempt_key`:
 * - `{ip}:{username}`        : lockout login per kombinasi (IP + username).
 * - `recovery:{ip}:{username}`: lockout pemulihan (forgot password) yang TERPISAH agar percobaan
 *   pemulihan gagal tidak mengunci akun login (Finding N1).
 * - `mfa:{jti}`              : penanda mfa_token sekali pakai (Finding N3).
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

  private getKey(ip: string | undefined | null, username: string, prefix = ''): string {
    const cleanIp = (ip || '127.0.0.1').trim();
    const cleanUser = username.trim().toLowerCase();
    return `${prefix}${cleanIp}:${cleanUser}`;
  }

  private async checkByKey(key: string): Promise<LockoutStatus> {
    const [rows] = await appPool.query<mysql.RowDataPacket[]>(
      'SELECT failed_attempts, locked_until FROM login_attempts WHERE attempt_key = ?',
      [key]
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

  private async recordByKey(key: string): Promise<LockoutStatus> {
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

  // === Scope login (IP + username) ===
  async checkLockout(ip: string | undefined | null, username: string): Promise<LockoutStatus> {
    return this.checkByKey(this.getKey(ip, username));
  }

  async recordFailure(ip: string | undefined | null, username: string): Promise<LockoutStatus> {
    return this.recordByKey(this.getKey(ip, username));
  }

  async recordSuccess(ip: string | undefined | null, username: string): Promise<void> {
    await appPool.query('DELETE FROM login_attempts WHERE attempt_key = ?', [this.getKey(ip, username)]);
  }

  // === Scope pemulihan (forgot password) yang terpisah dari login ===
  async checkRecoveryLockout(ip: string | undefined | null, username: string): Promise<LockoutStatus> {
    return this.checkByKey(this.getKey(ip, username, 'recovery:'));
  }

  async recordRecoveryFailure(ip: string | undefined | null, username: string): Promise<LockoutStatus> {
    return this.recordByKey(this.getKey(ip, username, 'recovery:'));
  }

  async recordRecoverySuccess(ip: string | undefined | null, username: string): Promise<void> {
    await appPool.query('DELETE FROM login_attempts WHERE attempt_key = ?', [
      this.getKey(ip, username, 'recovery:'),
    ]);
  }

  // === Penanda mfa_token sekali pakai (Finding N3) ===
  /**
   * Menandai `jti` mfa_token sebagai terpakai secara atomik.
   * Mengembalikan true bila ini pemakaian pertama, false bila token sudah pernah dipakai (replay).
   */
  async consumeMfaToken(jti: string): Promise<boolean> {
    const [result] = await appPool.query<mysql.ResultSetHeader>(
      `INSERT IGNORE INTO login_attempts (attempt_key, failed_attempts, last_attempt)
       VALUES (?, 0, NOW())`,
      [`mfa:${jti}`]
    );
    return result.affectedRows === 1;
  }

  async reset(): Promise<void> {
    await appPool.query('DELETE FROM login_attempts');
  }
}

export const progressiveLockout = new ProgressiveLockoutService();
