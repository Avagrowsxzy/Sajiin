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
   * Login pengguna (username + password) dengan progressive targeted lockout (IP + Username)
   */
  async login(input: LoginInput): Promise<LoginResult> {
    // 0. Cek targeted progressive lockout per kombinasi IP + Username
    const targetedLock = progressiveLockout.checkLockout(input.ipAddress, input.username);
    if (targetedLock.isLocked) {
      if (targetedLock.isPermanent) {
        throw {
          status: 423,
          code: 'ACCOUNT_LOCKED',
          message: `Percobaan login untuk akun '${input.username}' dari perangkat ini diblokir permanen karena aktivitas mencurigakan. Hubungi administrator.`,
        };
      }
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
      progressiveLockout.recordFailure(input.ipAddress, input.username);
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

    // Cek apakah akun dinonaktifkan
    if (!user.is_active) {
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
        message: `Akun terkunci sementara karena 5 kali percobaan gagal. Coba lagi dalam ${remainingMinutes} menit.`,
      };
    }

    // Verifikasi password
    const isPasswordValid = await verifyPassword(user.password_hash, input.password);

    if (!isPasswordValid) {
      const lockResult = progressiveLockout.recordFailure(input.ipAddress, user.username);

      if (lockResult.isLocked) {
        if (lockResult.isPermanent) {
          await writeAudit({
            actorId: user.id,
            action: 'AUTH_LOCKED_PERMANENT',
            entity: 'users',
            entity_id: user.id,
            new_value: { username: user.username, ip: input.ipAddress, reason: 'progressive_targeted_lockout_permanent' },
            ipAddress: input.ipAddress,
          });

          throw {
            status: 423,
            code: 'ACCOUNT_LOCKED',
            message: `Percobaan login untuk akun '${user.username}' dari perangkat ini telah diblokir permanen karena 20 kali percobaan login gagal. Hubungi administrator.`,
          };
        }

        await writeAudit({
          actorId: user.id,
          action: 'AUTH_LOCKED',
          entity: 'users',
          entity_id: user.id,
          new_value: {
            username: user.username,
            ip: input.ipAddress,
            duration_minutes: lockResult.durationMinutes,
            failed_attempts: lockResult.failedAttempts,
          },
          ipAddress: input.ipAddress,
        });

        throw {
          status: 423,
          code: 'ACCOUNT_LOCKED',
          message: `Akun telah dikunci selama ${lockResult.durationMinutes} menit karena ${lockResult.failedAttempts} kali percobaan login gagal.`,
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

    // Reset targeted progressive lockout & failed login counter jika sukses login
    progressiveLockout.recordSuccess(input.ipAddress, user.username);
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
    if (!user || !user.is_active) {
      throw {
        status: 404,
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Akun tidak ditemukan atau tidak aktif',
      };
    }

    if (user.locked_until && user.locked_until > new Date()) {
      const remainingMinutes = Math.ceil((user.locked_until.getTime() - Date.now()) / (60 * 1000));
      throw {
        status: 423,
        code: 'ACCOUNT_LOCKED',
        message: `Akun terkunci sementara karena 5 kali percobaan gagal. Coba lagi dalam ${remainingMinutes} menit.`,
      };
    }

    // Pemulihan juga dipisah per portal agar akun staff tidak bisa direset dari alur publik.
    if (portal && !isPortalAllowed(user.role_name, portal)) {
      throw {
        status: 403,
        code: 'PORTAL_MISMATCH',
        message: 'Username atau password salah',
      };
    }

    if (!user.security_pin_hash) {
      await writeAudit({
        actorId: user.id,
        action: 'AUTH_RECOVERY_DENIED',
        entity: 'users',
        entity_id: user.id,
        new_value: { reason: 'no_pin_enabled' },
        ipAddress,
      });

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
    if (!user || !user.is_active) {
      throw {
        status: 404,
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Akun tidak ditemukan atau tidak aktif',
      };
    }

    if (user.locked_until && user.locked_until > new Date()) {
      const remainingMinutes = Math.ceil((user.locked_until.getTime() - Date.now()) / (60 * 1000));
      throw {
        status: 423,
        code: 'ACCOUNT_LOCKED',
        message: `Akun terkunci sementara karena 5 kali percobaan gagal. Coba lagi dalam ${remainingMinutes} menit.`,
      };
    }

    // Pemulihan juga dipisah per portal agar akun staff tidak bisa direset dari alur publik.
    if (input.portal && !isPortalAllowed(user.role_name, input.portal)) {
      throw {
        status: 403,
        code: 'PORTAL_MISMATCH',
        message: 'Username atau password salah',
      };
    }

    if (!user.security_pin_hash) {
      throw {
        status: 403,
        code: 'ACCOUNT_LOST_NO_PIN',
        message: 'Akun belum mengaktifkan PIN keamanan sehingga dinyatakan hilang dan tidak dapat dipulihkan.',
      };
    }

    let isVerified = false;
    if (input.method === 'pin') {
      isVerified = Boolean(input.pin && (await verifyPassword(user.security_pin_hash, input.pin)));
    } else {
      if (!user.security_answers_hash) {
        throw {
          status: 400,
          code: 'RECOVERY_QUESTIONS_NOT_SET',
          message: 'Pertanyaan keamanan belum diatur pada akun ini',
        };
      }
      isVerified = Boolean(
        input.security_answers &&
          input.security_answers.length === 3 &&
          (await verifyPassword(user.security_answers_hash, normalizeSecurityAnswers(input.security_answers)))
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
          message: 'Akun telah dikunci selama 15 menit karena 5 kali percobaan gagal.',
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
