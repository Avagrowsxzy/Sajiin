import crypto from 'crypto';
import { env } from '../config/env.js';
import { UserRepository, SafeUser, UserEntity } from '../repositories/user.repository.js';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository.js';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  generateRandomToken,
  hashPhone,
  signToken,
  verifyToken,
  validatePasswordPolicy,
  normalizeSecurityAnswers,
} from '../utils/crypto.js';
import { writeAudit } from './audit.service.js';
import { writeNotification } from './notification.service.js';
import { ROLES } from '../types/index.js';
import { TokenPayload } from '../middleware/auth.middleware.js';
import { progressiveLockout } from './progressive-lockout.service.js';

export interface RegisterInput {
  full_name: string;
  username: string;
  password: string;
  phone?: string | null;
  ipAddress?: string | null;
}

export interface LoginInput {
  username: string;
  password: string;
  portal?: AuthPortal;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Portal login yang dipisah: pelanggan dan staff (kasir/admin). */
export type AuthPortal = 'customer' | 'staff';

/** Apakah role akun diizinkan masuk melalui portal tertentu. */
function isPortalAllowed(role: string, portal: AuthPortal): boolean {
  const isStaffRole = role === 'admin' || role === 'kasir';
  return portal === 'staff' ? isStaffRole : !isStaffRole;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface LoginResult {
  mfa_required?: boolean;
  mfa_setup_required?: boolean;
  mfa_token?: string;
  user?: SafeUser;
  tokens?: AuthTokens;
}

export class AuthService {
  constructor(
    private userRepo: UserRepository = new UserRepository(),
    private tokenRepo: RefreshTokenRepository = new RefreshTokenRepository()
  ) {}

  /**
   * Pendaftaran akun baru (role default: user)
   */
  async register(input: RegisterInput): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    const policyError = validatePasswordPolicy(input.password, 'user');
    if (policyError) {
      throw {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: policyError,
      };
    }

    const existing = await this.userRepo.findByUsername(input.username);
    if (existing) {
      throw {
        status: 400,
        code: 'USERNAME_ALREADY_EXISTS',
        message: 'Username sudah digunakan',
      };
    }

    if (input.phone && await this.userRepo.findByPhoneHash(hashPhone(input.phone))) {
      throw {
        status: 400,
        code: 'PHONE_ALREADY_EXISTS',
        message: 'Nomor telepon sudah terdaftar pada akun lain',
      };
    }

    const passwordHash = await hashPassword(input.password);
    const isAdminCompliant = validatePasswordPolicy(input.password, 'admin') === null;
    const userId = crypto.randomUUID();

    const created = await this.userRepo.create({
      id: userId,
      role_id: ROLES.USER,
      full_name: input.full_name,
      username: input.username,
      password_hash: passwordHash,
      password_admin_compliant: isAdminCompliant,
      phone: input.phone,
    });

    // Catat audit log
    await writeAudit({
      actorId: userId,
      action: 'AUTH_REGISTER',
      entity: 'users',
      entity_id: userId,
      new_value: { username: created.username, role: 'user' },
      ipAddress: input.ipAddress,
    });

    const safeUser = this.userRepo.toSafeUser(created);
    const tokens = await this.issueTokens(created, input.ipAddress);

    return { user: safeUser, tokens };
  }

  /**
   * Login pengguna (username + password) dengan lockout per-akun (lintas IP) dan
   * progressive lockout per kombinasi (IP + Username), keduanya berbasis DB.
   */
  async login(input: LoginInput): Promise<LoginResult> {
    // 0. Cek lockout per kombinasi IP + Username (disimpan di tabel login_attempts)
    const targetedLock = await progressiveLockout.checkLockout(input.ipAddress, input.username);
    if (targetedLock.isLocked) {
      throw {
        status: 423,
        code: 'ACCOUNT_LOCKED',
        message: `Terlalu banyak percobaan gagal untuk akun '${input.username}' dari perangkat ini. Coba lagi dalam ${targetedLock.remainingMinutes} menit.`,
      };
    }

    const user = await this.userRepo.findByUsername(input.username);

    // Jika pengguna tidak ditemukan atau password salah: respon identik (mencegah user enumeration)
    if (!user) {
      // Dummy verify untuk menetralkan timing attack
      await hashPassword('dummy_password_timing_neutralizer');
      await progressiveLockout.recordFailure(input.ipAddress, input.username);
      await writeAudit({
        action: 'AUTH_LOGIN_FAILED',
        entity: 'users',
        new_value: { username: input.username, reason: 'user_not_found' },
        ipAddress: input.ipAddress,
      });

      throw {
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Username atau password salah',
      };
    }

    // Catatan keamanan (Finding M1): status akun (nonaktif/terkunci) TIDAK dicek di sini
    // agar penyerang tidak bisa membedakan akun ada/tidak tanpa mengetahui password.
    // Pengecekan dilakukan SETELAH password terverifikasi.

    // Verifikasi password
    const isPasswordValid = await verifyPassword(user.password_hash, input.password);

    if (!isPasswordValid) {
      // Lockout per-akun (lintas IP) dengan durasi bertingkat.
      const accountLock = await this.userRepo.recordFailedLogin(user.id);
      // Lockout per kombinasi (IP + username).
      const lockResult = await progressiveLockout.recordFailure(input.ipAddress, user.username);

      if (accountLock.locked) {
        await writeAudit({
          actorId: user.id,
          action: 'AUTH_LOCKED',
          entity: 'users',
          entity_id: user.id,
          new_value: {
            username: user.username,
            ip: input.ipAddress,
            scope: 'account',
            duration_minutes: accountLock.durationMinutes,
          },
          ipAddress: input.ipAddress,
        });

        await this.notifyAccountLocked(user, accountLock.durationMinutes, input.ipAddress);

        throw {
          status: 423,
          code: 'ACCOUNT_LOCKED',
          message: `Akun terkunci sementara selama ${accountLock.durationMinutes} menit karena terlalu banyak percobaan login gagal. Coba lagi nanti.`,
        };
      }

      if (lockResult.isLocked) {
        await writeAudit({
          actorId: user.id,
          action: 'AUTH_LOCKED',
          entity: 'users',
          entity_id: user.id,
          new_value: {
            username: user.username,
            ip: input.ipAddress,
            scope: 'ip',
            duration_minutes: lockResult.durationMinutes,
            failed_attempts: lockResult.failedAttempts,
          },
          ipAddress: input.ipAddress,
        });

        throw {
          status: 423,
          code: 'ACCOUNT_LOCKED',
          message: `Terlalu banyak percobaan gagal dari perangkat ini. Coba lagi dalam ${lockResult.durationMinutes} menit.`,
        };
      }

      await writeAudit({
        actorId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        entity: 'users',
        entity_id: user.id,
        new_value: { username: user.username, reason: 'wrong_password' },
        ipAddress: input.ipAddress,
      });

      throw {
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Username atau password salah',
      };
    }

    // Password benar: sekarang aman untuk mengungkap status akun (Finding M1).
    // Cek apakah akun dinonaktifkan
    if (!user.is_active) {
      await writeAudit({
        actorId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        entity: 'users',
        entity_id: user.id,
        new_value: { username: user.username, reason: 'account_disabled' },
        ipAddress: input.ipAddress,
      });

      throw {
        status: 403,
        code: 'ACCOUNT_DISABLED',
        message: 'Akun Anda dinonaktifkan. Silakan hubungi administrator.',
      };
    }

    // Cek apakah akun secara global dikunci di database (admin lock)
    if (user.locked_until && user.locked_until > new Date()) {
      const remainingMinutes = Math.ceil(
        (user.locked_until.getTime() - Date.now()) / (60 * 1000)
      );
      throw {
        status: 423,
        code: 'ACCOUNT_LOCKED',
        message: `Akun terkunci sementara karena percobaan login gagal berulang. Coba lagi dalam ${remainingMinutes} menit.`,
      };
    }

    // Pemisahan portal ditegakkan server: role akun harus cocok dengan portal yang dipakai.
    // Dicek setelah password valid agar tidak membocorkan keberadaan/tipe akun ke penyerang.
    if (input.portal && !isPortalAllowed(user.role_name, input.portal)) {
      await writeAudit({
        actorId: user.id,
        action: 'AUTH_PORTAL_MISMATCH',
        entity: 'users',
        entity_id: user.id,
        new_value: { username: user.username, role: user.role_name, portal: input.portal },
        ipAddress: input.ipAddress,
      });

      throw {
        status: 403,
        code: 'PORTAL_MISMATCH',
        message: 'Username atau password salah',
      };
    }

    if (!user.password_admin_compliant && validatePasswordPolicy(input.password, 'admin') === null) {
      await this.userRepo.updatePassword(user.id, user.password_hash, true);
      user.password_admin_compliant = true;
    }

    // Reset lockout per (IP + username) & counter kegagalan per-akun jika sukses login
    await progressiveLockout.recordSuccess(input.ipAddress, user.username);
    await this.userRepo.resetFailedLogin(user.id);

    // Cek MFA jika sudah diaktifkan pada akun ini
    if (user.security_pin_hash) {
      const mfaToken = signToken(
        {
          userId: user.id,
          role: user.role_name as 'user' | 'admin' | 'kasir',
          username: user.username,
          type: 'mfa',
        },
        env.JWT_SECRET,
        5 * 60
      );

      return {
        mfa_required: true,
        mfa_token: mfaToken,
      };
    }

    // Buat token akses & refresh token
    const tokens = await this.issueTokens(user, input.ipAddress, input.userAgent);

    await writeAudit({
      actorId: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      entity: 'users',
      entity_id: user.id,
      ipAddress: input.ipAddress,
    });

    return {
      mfa_required: false,
      user: this.userRepo.toSafeUser(user),
      tokens,
    };
  }

  /**
   * Verifikasi kode TOTP 6-digit saat login MFA
   */
  async verifyMfa(input: {
    mfa_token: string;
    code: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    let payload: TokenPayload;
    try {
      payload = verifyToken<TokenPayload>(input.mfa_token, env.JWT_SECRET);
      if (payload.type !== 'mfa') {
        throw new Error('Invalid token type');
      }
    } catch {
      throw {
        status: 401,
        code: 'INVALID_MFA_TOKEN',
        message: 'Sesi MFA telah kedaluwarsa atau tidak valid. Silakan login kembali.',
      };
    }

    const user = await this.userRepo.findById(payload.userId);
    if (!user || !user.is_active || !user.security_pin_hash) {
      throw {
        status: 401,
        code: 'INVALID_MFA_REQUEST',
        message: 'Permintaan verifikasi MFA tidak valid',
      };
    }

    if (!(await verifyPassword(user.security_pin_hash, input.code))) {
      await writeAudit({
        actorId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        entity: 'users',
        entity_id: user.id,
        new_value: { reason: 'invalid_mfa_code' },
        ipAddress: input.ipAddress,
      });

      throw {
        status: 400,
        code: 'INVALID_MFA_CODE',
        message: 'Kode MFA tidak valid atau telah kedaluwarsa',
      };
    }

    // Reset failed login counter dan terbitkan token
    await this.userRepo.resetFailedLogin(user.id);
    const tokens = await this.issueTokens(user, input.ipAddress, input.userAgent);

    await writeAudit({
      actorId: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      entity: 'users',
      entity_id: user.id,
      new_value: { method: 'mfa' },
      ipAddress: input.ipAddress,
    });

    return {
      user: this.userRepo.toSafeUser(user),
      tokens,
    };
  }

  /**
   * Setup MFA TOTP (menghasilkan secret baru dan QR code)
   */
  async setupMfa(userId: string): Promise<{ secret: string; qr_code: string; uri: string }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Pengguna tidak ditemukan' };
    }

    return {
      secret: '',
      qr_code: '',
      uri: '',
    };
  }

  /**
   * Konfirmasi aktivasi MFA dengan memasukkan PIN 6 digit dan 3 jawaban pertanyaan keamanan
   */
  async confirmMfa(
    userId: string,
    _secretBase32: string,
    code: string,
    ipAddress?: string | null,
    securityAnswers?: [string, string, string],
    issueTokensAfter = false,
    userAgent?: string | null,
    currentPin?: string
  ): Promise<{ user?: SafeUser; tokens?: AuthTokens }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Pengguna tidak ditemukan' };
    }

    if (user.security_pin_hash) {
      if (!currentPin || !/^\d{6}$/.test(currentPin)) {
        throw {
          status: 400,
          code: 'CURRENT_PIN_REQUIRED',
          message: 'Wajib memasukkan PIN keamanan 6 digit saat ini untuk mengganti PIN',
        };
      }
      const isCurrentValid = await verifyPassword(user.security_pin_hash, currentPin);
      if (!isCurrentValid) {
        throw {
          status: 400,
          code: 'INVALID_CURRENT_PIN',
          message: 'PIN keamanan saat ini tidak sesuai',
        };
      }
    }

    if (!/^\d{6}$/.test(code)) {
      throw {
        status: 400,
        code: 'INVALID_MFA_CODE',
        message: 'PIN harus berupa 6 digit angka',
      };
    }

    if (!securityAnswers || securityAnswers.length !== 3 || securityAnswers.some((a) => !a || a.trim().length < 2)) {
      if (!user.security_pin_hash) {
        // Pertama kali aktifkan PIN — jawaban wajib
        throw {
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'Wajib mengisi jawaban untuk ke-3 pertanyaan keamanan (minimal 2 karakter)',
        };
      }
      // Ganti PIN — skip update answers, pakai yang lama
    }

    const pinHash = await hashPassword(code);
    const answersHash =
      securityAnswers && securityAnswers.length === 3 && securityAnswers.every((a) => a && a.trim().length >= 2)
        ? await hashPassword(normalizeSecurityAnswers(securityAnswers))
        : undefined;
    await this.userRepo.updateSecurityPinHash(userId, pinHash, answersHash);

    await writeAudit({
      actorId: userId,
      action: 'AUTH_MFA_ENABLED',
      entity: 'users',
      entity_id: userId,
      ipAddress,
    });

    if (issueTokensAfter) {
      await this.userRepo.resetFailedLogin(user.id);
      const updatedUser = (await this.userRepo.findById(userId)) || user;
      const tokens = await this.issueTokens(updatedUser, ipAddress, userAgent);
      return {
        user: this.userRepo.toSafeUser(updatedUser),
        tokens,
      };
    }

    return {};
  }

  /**
   * Rotasi refresh token: cabut token lama, terbitkan token baru
   */
  async refresh(
    rawRefreshToken: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<AuthTokens> {
    const tokenHash = hashToken(rawRefreshToken);
    const existing = await this.tokenRepo.findByTokenHash(tokenHash);

    if (!existing || existing.expires_at < new Date()) {
      throw {
        status: 401,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token tidak valid atau telah kedaluwarsa',
      };
    }

    // ponytail: OAuth 2.0 / RFC 6749 Section 10.4 token rotation replay detection: revoke all tokens if old token reused
    if (existing.revoked_at !== null) {
      await this.tokenRepo.revokeAllForUser(existing.user_id);
      await writeAudit({
        actorId: existing.user_id,
        action: 'AUTH_TOKEN_REUSE_DETECTED',
        entity: 'refresh_tokens',
        entity_id: existing.id,
        ipAddress,
      });
      throw {
        status: 401,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token telah dicabut',
      };
    }

    const user = await this.userRepo.findById(existing.user_id);
    if (!user || !user.is_active) {
      throw {
        status: 401,
        code: 'ACCOUNT_DISABLED',
        message: 'Akun tidak aktif atau tidak ditemukan',
      };
    }

    // ROTASI: Cabut token lama
    await this.tokenRepo.revokeToken(tokenHash);

    // Terbitkan token baru
    return this.issueTokens(user, ipAddress, userAgent);
  }

  /**
   * Logout: cabut refresh token aktif
   */
  async logout(rawRefreshToken: string, userId?: string, ipAddress?: string | null): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await this.tokenRepo.revokeToken(tokenHash);

    if (userId) {
      await writeAudit({
        actorId: userId,
        action: 'AUTH_LOGOUT',
        entity: 'users',
        entity_id: userId,
        ipAddress,
      });
    }
  }

  /**
   * Ubah password dan cabut semua refresh token aktif
   */
  async changePassword(
    userId: string,
    oldPass: string,
    newPass: string,
    ipAddress?: string | null
  ): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Pengguna tidak ditemukan' };
    }

    const policyError = validatePasswordPolicy(newPass, user.role_name as 'user' | 'admin' | 'kasir');
    if (policyError) {
      throw {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: policyError,
      };
    }

    const isValid = await verifyPassword(user.password_hash, oldPass);
    if (!isValid) {
      throw {
        status: 400,
        code: 'INVALID_PASSWORD',
        message: 'Password lama tidak sesuai',
      };
    }

    if (oldPass === newPass || (await verifyPassword(user.password_hash, newPass))) {
      throw {
        status: 400,
        code: 'SAME_PASSWORD',
        message: 'Password baru tidak boleh sama dengan password lama',
      };
    }

    const newHash = await hashPassword(newPass);
    const isAdminCompliant = validatePasswordPolicy(newPass, 'admin') === null;
    await this.userRepo.updatePassword(userId, newHash, isAdminCompliant);

    // Keamanan: Cabut semua refresh token aktif milik user ini
    await this.tokenRepo.revokeAllForUser(userId);

    await writeAudit({
      actorId: userId,
      action: 'PASSWORD_CHANGED',
      entity: 'users',
      entity_id: userId,
      ipAddress,
    });
  }

  /**
   * Cek apakah akun bisa dipulihkan (wajib sudah mengaktifkan PIN MFA)
   */
  async checkForgotPassword(
    username: string,
    ipAddress?: string | null,
    portal?: AuthPortal
  ): Promise<{ username: string; role: string; has_pin: boolean; has_questions: boolean }> {
    const user = await this.userRepo.findByUsername(username);

    // Finding M1: jangan bedakan akun tidak ada / nonaktif / terkunci / portal salah / belum punya
    // PIN. Semua kondisi gagal mengembalikan error generik yang identik agar tidak bisa dienumerasi.
    const isRecoverable =
      !!user &&
      user.is_active &&
      !(user.locked_until && user.locked_until > new Date()) &&
      (!portal || isPortalAllowed(user.role_name, portal)) &&
      !!user.security_pin_hash;

    if (!isRecoverable || !user) {
      if (user) {
        await writeAudit({
          actorId: user.id,
          action: 'AUTH_RECOVERY_DENIED',
          entity: 'users',
          entity_id: user.id,
          new_value: { reason: 'recovery_not_available' },
          ipAddress,
        });
      }

      throw {
        status: 403,
        code: 'ACCOUNT_LOST_NO_PIN',
        message: 'Akun belum mengaktifkan PIN keamanan sehingga dinyatakan hilang dan tidak dapat dipulihkan.',
      };
    }

    return {
      username: user.username,
      role: user.role_name,
      has_pin: true,
      has_questions: Boolean(user.security_answers_hash),
    };
  }

  /**
   * Reset password menggunakan PIN 6 digit atau 3 pertanyaan keamanan
   */
  async resetForgotPassword(input: {
    username: string;
    method: 'pin' | 'questions';
    pin?: string;
    security_answers?: [string, string, string];
    new_password: string;
    portal?: AuthPortal;
    ipAddress?: string | null;
  }): Promise<void> {
    const user = await this.userRepo.findByUsername(input.username);

    // Finding M1: semua kondisi yang membuat pemulihan tidak dapat diproses mengembalikan
    // error generik yang sama, agar penyerang tidak bisa mengenumerasi akun/status.
    const cannotProceed =
      !user ||
      !user.is_active ||
      (user.locked_until && user.locked_until > new Date()) ||
      (input.portal && !isPortalAllowed(user.role_name, input.portal)) ||
      !user.security_pin_hash ||
      (input.method === 'questions' && !user.security_answers_hash);

    if (cannotProceed || !user) {
      throw {
        status: 400,
        code: 'INVALID_RECOVERY_CREDENTIALS',
        message: 'Kredensial pemulihan tidak valid',
      };
    }

    let isVerified = false;
    if (input.method === 'pin') {
      isVerified = Boolean(input.pin && (await verifyPassword(user.security_pin_hash ?? '', input.pin)));
    } else {
      isVerified = Boolean(
        input.security_answers &&
          input.security_answers.length === 3 &&
          (await verifyPassword(user.security_answers_hash ?? '', normalizeSecurityAnswers(input.security_answers)))
      );
    }

    if (!isVerified) {
      const lockResult = await this.userRepo.recordFailedLogin(user.id);
      if (lockResult.locked) {
        await writeAudit({
          actorId: user.id,
          action: 'AUTH_LOCKED',
          entity: 'users',
          entity_id: user.id,
          new_value: { username: user.username, reason: `failed_recovery_${input.method}` },
          ipAddress: input.ipAddress,
        });
        throw {
          status: 423,
          code: 'ACCOUNT_LOCKED',
          message: `Akun terkunci sementara selama ${lockResult.durationMinutes ?? 15} menit karena terlalu banyak percobaan gagal. Coba lagi nanti.`,
        };
      }

      await writeAudit({
        actorId: user.id,
        action: 'AUTH_RECOVERY_FAILED',
        entity: 'users',
        entity_id: user.id,
        new_value: { method: input.method },
        ipAddress: input.ipAddress,
      });

      throw {
        status: 400,
        code: 'INVALID_RECOVERY_CREDENTIALS',
        message:
          input.method === 'pin'
            ? 'PIN keamanan tidak sesuai'
            : 'Jawaban pertanyaan keamanan tidak sesuai',
      };
    }

    const policyError = validatePasswordPolicy(
      input.new_password,
      user.role_name as 'user' | 'admin' | 'kasir'
    );
    if (policyError) {
      throw {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: policyError,
      };
    }

    if (await verifyPassword(user.password_hash, input.new_password)) {
      throw {
        status: 400,
        code: 'SAME_PASSWORD',
        message: 'Password baru tidak boleh sama dengan password lama',
      };
    }

    const newHash = await hashPassword(input.new_password);
    const isAdminCompliant = validatePasswordPolicy(input.new_password, 'admin') === null;
    await this.userRepo.updatePassword(user.id, newHash, isAdminCompliant);
    await this.userRepo.resetFailedLogin(user.id);
    await this.tokenRepo.revokeAllForUser(user.id);

    await writeAudit({
      actorId: user.id,
      action: 'PASSWORD_RESET_SUCCESS',
      entity: 'users',
      entity_id: user.id,
      new_value: { method: input.method },
      ipAddress: input.ipAddress,
    });
  }

  /**
   * Beri tahu pemilik akun saat akunnya terkunci karena percobaan login gagal berulang.
   * Bersifat informatif: kegagalan mengirim notifikasi tidak boleh menggagalkan respons login.
   */
  private async notifyAccountLocked(
    user: UserEntity,
    durationMinutes?: number,
    ipAddress?: string | null
  ): Promise<void> {
    try {
      await writeNotification({
        userId: user.id,
        type: 'security',
        title: 'Percobaan Login Mencurigakan',
        message: `Akun Anda dikunci sementara (${durationMinutes ?? 15} menit) karena terlalu banyak percobaan login gagal${
          ipAddress ? ` dari ${ipAddress}` : ''
        }. Jika ini bukan Anda, segera ganti password setelah masa kunci berakhir.`,
      });
    } catch {
      // abaikan: notifikasi hanya informasi tambahan
    }
  }

  /**
   * Helper internal untuk menerbitkan access token dan menyimpan refresh token baru
   */
  private async issueTokens(
    user: UserEntity,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<AuthTokens> {
    const accessPayload: TokenPayload = {
      userId: user.id,
      role: user.role_name as 'user' | 'admin' | 'kasir',
      username: user.username,
      type: 'access',
    };

    // 15 menit access token (PROJECT.md)
    const accessToken = signToken(accessPayload, env.JWT_SECRET, 15 * 60);

    // 7 hari refresh token
    const rawRefreshToken = generateRandomToken(32);
    const refreshTokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.tokenRepo.create({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt,
      ipAddress,
      userAgent,
    });

    return {
      access_token: accessToken,
      refresh_token: rawRefreshToken,
      expires_in: 900, // 15 menit dalam detik
    };
  }
}
