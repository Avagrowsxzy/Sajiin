export interface LockoutStatus {
  isLocked: boolean;
  remainingMinutes?: number;
  durationMinutes?: number;
  isPermanent?: boolean;
  failedAttempts: number;
}

interface LockoutRecord {
  failedAttempts: number;
  lockedUntil: number | null;
  isPermanent: boolean;
}

export class ProgressiveLockoutService {
  private records = new Map<string, LockoutRecord>();

  constructor() {
    // Bersihkan entri kedaluwarsa secara berkala (setiap 30 menit)
    setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.records.entries()) {
        if (!record.isPermanent && record.lockedUntil && now > record.lockedUntil + 2 * 60 * 60 * 1000) {
          this.records.delete(key);
        }
      }
    }, 30 * 60 * 1000).unref();
  }

  // ponytail: native in-memory Map for targeted IP+Username progressive lockout; upgrade to Redis only in clustered multi-node setup
  private getKey(ip: string | undefined | null, username: string): string {
    const cleanIp = (ip || '127.0.0.1').trim();
    const cleanUser = username.trim().toLowerCase();
    return `${cleanIp}:${cleanUser}`;
  }

  checkLockout(ip: string | undefined | null, username: string): LockoutStatus {
    const key = this.getKey(ip, username);
    const record = this.records.get(key);

    if (!record) {
      return { isLocked: false, failedAttempts: 0 };
    }

    if (record.isPermanent) {
      return {
        isLocked: true,
        isPermanent: true,
        failedAttempts: record.failedAttempts,
      };
    }

    const now = Date.now();
    if (record.lockedUntil && now < record.lockedUntil) {
      const remainingMinutes = Math.max(1, Math.ceil((record.lockedUntil - now) / (60 * 1000)));
      return {
        isLocked: true,
        remainingMinutes,
        failedAttempts: record.failedAttempts,
      };
    }

    return {
      isLocked: false,
      failedAttempts: record.failedAttempts,
    };
  }

  recordFailure(ip: string | undefined | null, username: string): LockoutStatus {
    const key = this.getKey(ip, username);
    const now = Date.now();
    let record = this.records.get(key);

    if (!record) {
      record = { failedAttempts: 0, lockedUntil: null, isPermanent: false };
      this.records.set(key, record);
    }

    record.failedAttempts++;
    const count = record.failedAttempts;

    // Tier 4: 20 kali gagal -> Blokir permanen dari IP tersebut
    if (count >= 20) {
      record.isPermanent = true;
      record.lockedUntil = null;
      return {
        isLocked: true,
        isPermanent: true,
        failedAttempts: count,
      };
    }

    // Tier 3: 15 kali gagal -> Kunci 60 menit (1 jam)
    if (count >= 15 && count % 5 === 0) {
      const durationMinutes = 60;
      record.lockedUntil = now + durationMinutes * 60 * 1000;
      return {
        isLocked: true,
        remainingMinutes: durationMinutes,
        durationMinutes,
        failedAttempts: count,
      };
    }

    // Tier 2: 10 kali gagal -> Kunci 30 menit
    if (count >= 10 && count % 5 === 0) {
      const durationMinutes = 30;
      record.lockedUntil = now + durationMinutes * 60 * 1000;
      return {
        isLocked: true,
        remainingMinutes: durationMinutes,
        durationMinutes,
        failedAttempts: count,
      };
    }

    // Tier 1: 5 kali gagal -> Kunci 15 menit
    if (count >= 5 && count % 5 === 0) {
      const durationMinutes = 15;
      record.lockedUntil = now + durationMinutes * 60 * 1000;
      return {
        isLocked: true,
        remainingMinutes: durationMinutes,
        durationMinutes,
        failedAttempts: count,
      };
    }

    return {
      isLocked: false,
      failedAttempts: count,
    };
  }

  recordSuccess(ip: string | undefined | null, username: string): void {
    const key = this.getKey(ip, username);
    this.records.delete(key);
  }

  reset(): void {
    this.records.clear();
  }
}

export const progressiveLockout = new ProgressiveLockoutService();
