import request from 'supertest';
import { app } from '../src/index.js';
import { appPool } from '../src/config/database.js';
import { progressiveLockout } from '../src/services/progressive-lockout.service.js';
import { AuthService } from '../src/services/auth.service.js';

describe('Auth API Integration Tests', () => {
  const testUsername = `test_user_${Date.now()}`;
  const testPassword = 'StrongPassword123!';
  const authService = new AuthService();
  let accessToken: string;
  let refreshToken: string;

  // Finding N10: endpoint registrasi publik dihapus. Akun pelanggan kini hanya dibuat oleh
  // kasir/admin (lewat POST /admin/customers) atau, di dalam test, langsung lewat AuthService.register.
  function createTestUser(overrides: { username: string; full_name?: string; password?: string; phone?: string | null }) {
    return authService.register({
      full_name: overrides.full_name ?? 'Test User',
      username: overrides.username,
      password: overrides.password ?? testPassword,
      phone: overrides.phone,
    });
  }

  afterAll(async () => {
    // Nonaktifkan user tes (app_rw tidak memiliki hak DELETE pada users sesuai least-privilege)
    await appPool.query(
      'UPDATE users SET is_active = 0 WHERE username LIKE "test_user_%" OR username LIKE "lockout_%" OR username LIKE "nopin_%" OR username LIKE "cand_kasir_%" OR username LIKE "adm_promo_%" OR username LIKE "mfa_user_%" OR username LIKE "targeted_%" OR username LIKE "other_%" OR username LIKE "escalation_%"'
    );
  });

  describe('AuthService.register (pembuatan akun pelanggan internal)', () => {
    it('harus menolak pendaftaran jika password kurang dari 8 karakter atau tidak memenuhi kompleksitas', async () => {
      await expect(
        createTestUser({ full_name: 'Short Pass', username: `short_${Date.now()}`, password: 'short' })
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

      await expect(
        createTestUser({ full_name: 'No Symbol', username: `nosym_${Date.now()}`, password: 'Password1234' })
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('harus berhasil mendaftarkan user baru dengan role default user (role_id: 2)', async () => {
      const result = await createTestUser({
        full_name: 'Budi Santoso',
        username: testUsername,
        phone: '081234567890',
      });

      expect(result.user).toBeDefined();
      expect(result.user.username).toBe(testUsername);
      expect(result.user.role_id).toBe(2);
      expect(result.user.role_name).toBe('user');
      // Keamanan: Pastikan hash password atau mfa_secret tidak bocor ke klien
      expect((result.user as Record<string, unknown>).password_hash).toBeUndefined();
      expect((result.user as Record<string, unknown>).mfa_secret).toBeUndefined();

      expect(result.tokens).toBeDefined();
      expect(result.tokens.access_token).toBeDefined();
      expect(result.tokens.refresh_token).toBeDefined();

      accessToken = result.tokens.access_token;
      refreshToken = result.tokens.refresh_token;
    });

    it('harus menolak pendaftaran jika username sudah terdaftar', async () => {
      await expect(
        createTestUser({ full_name: 'Budi Duplikat', username: testUsername })
      ).rejects.toMatchObject({ code: 'USERNAME_ALREADY_EXISTS' });
    });

    it('harus mengembalikan 404 untuk endpoint registrasi publik yang sudah dihapus (Finding N10)', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        full_name: 'Publik User',
        username: `publik_${Date.now()}`,
        password: testPassword,
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('harus menolak jika password salah dengan pesan error generik', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        username: testUsername,
        password: 'WrongPassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Username atau password salah');
    });

    it('harus menolak jika username tidak ada dengan pesan error generik yang sama', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        username: 'nonexistent_user',
        password: 'SomePassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Username atau password salah');
    });

    it('harus berhasil login dengan kredensial yang benar', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        username: testUsername,
        password: testPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.tokens).toBeDefined();
      expect(res.body.data.user.username).toBe(testUsername);

      accessToken = res.body.data.tokens.access_token;
      refreshToken = res.body.data.tokens.refresh_token;
    });

    it('harus mengunci akun setelah 5 kali gagal login (lockout 15 menit)', async () => {
      const lockUsername = `lockout_${Date.now()}`;
      // Buat akun baru untuk tes lockout
      await createTestUser({ full_name: 'Lockout User', username: lockUsername });

      // 4 kali salah
      for (let i = 0; i < 4; i++) {
        const failRes = await request(app).post('/api/v1/auth/login').send({
          username: lockUsername,
          password: 'WrongPassword!',
        });
        expect(failRes.status).toBe(401);
      }

      // Percobaan ke-5 -> akun terkunci, tetapi respons tetap generik (anti-enumerasi, Finding N5)
      const fifthRes = await request(app).post('/api/v1/auth/login').send({
        username: lockUsername,
        password: 'WrongPassword!',
      });
      expect(fifthRes.status).toBe(401);
      expect(fifthRes.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('per-account lockout: setelah 5 gagal, akun terkunci untuk semua IP, tetapi akun lain tetap bisa login', async () => {
      const username = `targeted_${Date.now()}`;
      const otherUsername = `other_${Date.now()}`;
      const attackerIp = '192.168.1.50';
      const legitIp = '192.168.1.15';

      await createTestUser({ full_name: 'Targeted User', username });
      await createTestUser({ full_name: 'Other User', username: otherUsername });

      // Penyerang dari attackerIp salah 5 kali -> akun terkunci (per-akun, lintas IP)
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', attackerIp)
          .send({ username, password: 'WrongPassword!' });
      }

      // Penyerang tetap menerima respons generik (anti-enumerasi, Finding N5)
      const attackRes = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', attackerIp)
        .send({ username, password: 'WrongPassword!' });
      expect(attackRes.status).toBe(401);
      expect(attackRes.body.error.code).toBe('INVALID_CREDENTIALS');

      // IP lain dengan password BENAR tetap ditolak karena akun terkunci (mencegah distributed attack)
      const legitRes = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', legitIp)
        .send({ username, password: testPassword });
      expect(legitRes.status).toBe(423);
      expect(legitRes.body.error.code).toBe('ACCOUNT_LOCKED');

      // Akun lain dari IP penyerang tetap bisa login (bukan blokir IP menyeluruh)
      const otherRes = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', attackerIp)
        .send({ username: otherUsername, password: testPassword });
      expect(otherRes.status).toBe(200);
      expect(otherRes.body.data.tokens).toBeDefined();
    });

    it('progressive lockout service: backoff bertingkat tanpa blokir permanen', async () => {
      const testIp = '10.0.0.99';
      const testUser = `escalation_${Date.now()}`;

      // 1-4 gagal: belum terkunci
      for (let i = 1; i <= 4; i++) {
        const res = await progressiveLockout.recordFailure(testIp, testUser);
        expect(res.isLocked).toBe(false);
      }

      // 5 -> 15m, 6 -> 30m, 7 -> 60m, 8 -> 120m, 9+ -> 240m (batas atas)
      const expected = [
        { minutes: 15 },
        { minutes: 30 },
        { minutes: 60 },
        { minutes: 120 },
        { minutes: 240 },
        { minutes: 240 },
      ];

      for (const step of expected) {
        const res = await progressiveLockout.recordFailure(testIp, testUser);
        expect(res.isLocked).toBe(true);
        expect(res.durationMinutes).toBe(step.minutes);
      }

      // Tidak ada status permanen; checkLockout mengembalikan kunci sementara yang masih aktif.
      const check = await progressiveLockout.checkLockout(testIp, testUser);
      expect(check.isLocked).toBe(true);
      expect(check.remainingMinutes).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/auth/refresh (Token Rotation)', () => {
    it('harus merotasi token: menerbitkan token baru dan mencabut token lama', async () => {
      const oldRefreshToken = refreshToken;

      const res = await request(app).post('/api/v1/auth/refresh').send({
        refresh_token: oldRefreshToken,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.access_token).toBeDefined();
      expect(res.body.data.refresh_token).toBeDefined();
      expect(res.body.data.refresh_token).not.toBe(oldRefreshToken);

      accessToken = res.body.data.access_token;
      refreshToken = res.body.data.refresh_token;

      // Coba pakai lagi refresh token lama yang sudah dicabut -> harus ditolak 401
      const replayRes = await request(app).post('/api/v1/auth/refresh').send({
        refresh_token: oldRefreshToken,
      });
      expect(replayRes.status).toBe(401);
      expect(replayRes.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('Ronda 3 — hardening siklus token', () => {
    it('rotasi refresh token atomik: hanya satu dari banyak request paralel yang berhasil (Finding B-01)', async () => {
      const username = `test_user_race_${Date.now()}`;
      const { tokens } = await createTestUser({ full_name: 'Race Refresh', username });
      const rawRefresh = tokens.refresh_token;

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          request(app).post('/api/v1/auth/refresh').send({ refresh_token: rawRefresh })
        )
      );

      const successes = results.filter((r) => r.status === 200).length;
      expect(successes).toBe(1);
      const failures = results.filter((r) => r.status !== 200);
      for (const fail of failures) {
        expect(fail.status).toBe(401);
        expect(fail.body.error.code).toBe('INVALID_REFRESH_TOKEN');
      }
    });

    it('mfa_token gugur setelah password diubah (Finding B-02)', async () => {
      const username = `test_user_mfapw_${Date.now()}`;
      const originalPassword = 'StrongPassword123!';
      const createdAt = await createTestUser({
        full_name: 'MFA Password User',
        username,
        password: originalPassword,
      });

      // Aktifkan PIN MFA + pertanyaan keamanan.
      const enableMfa = await request(app)
        .post('/api/v1/auth/mfa/confirm')
        .set('Authorization', `Bearer ${createdAt.tokens.access_token}`)
        .send({
          code: '742918',
          security_answers: ['Milo', 'Bandung', 'SDN 1 Merdeka'],
        });
      expect(enableMfa.status).toBe(200);

      // Login pertama: simpan mfa_token M1 tanpa memakainya.
      const firstLogin = await request(app).post('/api/v1/auth/login').send({
        username,
        password: originalPassword,
      });
      expect(firstLogin.body.data.mfa_required).toBe(true);
      const unusedMfaToken = firstLogin.body.data.mfa_token as string;

      // Login kedua: verifikasi untuk mendapat access token, lalu ganti password.
      const secondLogin = await request(app).post('/api/v1/auth/login').send({
        username,
        password: originalPassword,
      });
      const verified = await request(app).post('/api/v1/auth/mfa/verify').send({
        mfa_token: secondLogin.body.data.mfa_token,
        code: '742918',
      });
      expect(verified.status).toBe(200);
      const accessToken = verified.body.data.tokens.access_token as string;

      const changePassword = await request(app)
        .post('/api/v1/auth/password/change')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ old_password: originalPassword, new_password: 'BrandNewPassword456!' });
      expect(changePassword.status).toBe(200);

      // mfa_token yang diterbitkan sebelum ganti password harus ditolak walau PIN benar.
      const useUnusedToken = await request(app).post('/api/v1/auth/mfa/verify').send({
        mfa_token: unusedMfaToken,
        code: '742918',
      });
      expect(useUnusedToken.status).toBe(401);
      expect(useUnusedToken.body.error.code).toBe('INVALID_MFA_TOKEN');
    });
  });

  describe('POST /api/v1/auth/password/change', () => {
    it('harus menolak ganti password jika belum terotentikasi', async () => {
      const res = await request(app).post('/api/v1/auth/password/change').send({
        old_password: testPassword,
        new_password: 'NewStrongPassword123!',
      });
      expect(res.status).toBe(401);
    });

    it('harus menolak jika password lama salah', async () => {
      const res = await request(app)
        .post('/api/v1/auth/password/change')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          old_password: 'WrongOldPassword123!',
          new_password: 'NewStrongPassword123!',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PASSWORD');
    });

    it('harus berhasil ganti password dan mencabut token aktif', async () => {
      const newPassword = 'BrandNewPassword123!';
      const res = await request(app)
        .post('/api/v1/auth/password/change')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          old_password: testPassword,
          new_password: newPassword,
        });

      expect(res.status).toBe(200);

      // Coba refresh token lama -> harus ditolak karena semua token dicabut saat ganti password
      const refreshRes = await request(app).post('/api/v1/auth/refresh').send({
        refresh_token: refreshToken,
      });
      expect(refreshRes.status).toBe(401);

      // Login dengan password baru harus berhasil
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        username: testUsername,
        password: newPassword,
      });
      expect(loginRes.status).toBe(200);
      accessToken = loginRes.body.data.tokens.access_token;
      refreshToken = loginRes.body.data.tokens.refresh_token;
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('harus mencabut refresh token saat logout', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          refresh_token: refreshToken,
        });

      expect(res.status).toBe(200);

      // Refresh dengan token yang dicabut harus gagal
      const refreshRes = await request(app).post('/api/v1/auth/refresh').send({
        refresh_token: refreshToken,
      });
      expect(refreshRes.status).toBe(401);
    });
  });

  describe('MFA Setup & Verification Flow (PROJECT.md)', () => {
    let mfaUsername: string;
    let mfaAccessToken: string;

    it('harus mendaftarkan user baru untuk tes MFA', async () => {
      mfaUsername = `mfa_user_${Date.now()}`;
      const result = await createTestUser({ full_name: 'MFA User', username: mfaUsername });
      mfaAccessToken = result.tokens.access_token;
      expect(mfaAccessToken).toBeDefined();
    });

    it('POST /auth/mfa/setup: harus membuat secret dan QR code', async () => {
      const res = await request(app)
        .post('/api/v1/auth/mfa/setup')
        .set('Authorization', `Bearer ${mfaAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.secret).toBeDefined();
      expect(res.body.data.qr_code).toBeDefined();
      expect(res.body.data.uri).toBe('');
    });

    it('POST /auth/mfa/confirm: harus mengaktifkan PIN keamanan 6 digit beserta 3 jawaban pertanyaan keamanan', async () => {
      const res = await request(app)
        .post('/api/v1/auth/mfa/confirm')
        .set('Authorization', `Bearer ${mfaAccessToken}`)
        .send({
          code: '742918',
          security_answers: ['Milo', 'Bandung', 'SDN 1 Merdeka'],
        });

      expect(res.status).toBe(200);
    });

    it('POST /auth/login: setelah MFA aktif, login harus meminta verifikasi MFA (mfa_required)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        username: mfaUsername,
        password: testPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.mfa_required).toBe(true);
      expect(res.body.data.mfa_token).toBeDefined();

      const mfaToken = res.body.data.mfa_token;

      // Coba verifikasi dengan kode salah -> harus ditolak
      const failRes = await request(app).post('/api/v1/auth/mfa/verify').send({
        mfa_token: mfaToken,
        code: '123456',
      });
      expect(failRes.status).toBe(400);

      // Verifikasi dengan kode benar -> harus mengembalikan token
      const validCode = '742918';

      const successRes = await request(app).post('/api/v1/auth/mfa/verify').send({
        mfa_token: mfaToken,
        code: validCode,
      });

      expect(successRes.status).toBe(200);
      expect(successRes.body.data.tokens.access_token).toBeDefined();
      expect(successRes.body.data.user.has_mfa).toBe(true);
    });

    it('Lupa Password: cek akun tidak membocorkan status akun (Finding N4)', async () => {
      const noPinUser = `nopin_${Date.now()}`;
      await createTestUser({ full_name: 'No Pin User', username: noPinUser });

      // Respons sekarang seragam: tidak menyebut akun ada/tidak, role, atau status PIN.
      const checkRes = await request(app).post('/api/v1/auth/password/forgot/check').send({
        username: noPinUser,
      });
      expect(checkRes.status).toBe(200);
      expect(checkRes.body.data.min_password_length).toBe(8);
      expect(checkRes.body.data.has_pin).toBeUndefined();
      expect(checkRes.body.data.role).toBeUndefined();

      // Reset tetap gagal dengan error generik yang sama untuk akun tanpa PIN.
      const resetRes = await request(app).post('/api/v1/auth/password/forgot/reset').send({
        username: noPinUser,
        method: 'pin',
        pin: '123456',
        new_password: 'WhateverStrong123!',
      });
      expect(resetRes.status).toBe(400);
      expect(resetRes.body.error.code).toBe('INVALID_RECOVERY_CREDENTIALS');
    });

    it('Lupa Password: akun dengan PIN dapat reset password via PIN maupun 3 pertanyaan keamanan, dan menolak password lama', async () => {
      const checkRes = await request(app).post('/api/v1/auth/password/forgot/check').send({
        username: mfaUsername,
      });
      expect(checkRes.status).toBe(200);
      expect(checkRes.body.data.min_password_length).toBe(8);

      // 1. Tolak jika password baru sama dengan password lama
      const samePassRes = await request(app).post('/api/v1/auth/password/forgot/reset').send({
        username: mfaUsername,
        method: 'pin',
        pin: '742918',
        new_password: testPassword,
      });
      expect(samePassRes.status).toBe(400);
      expect(samePassRes.body.error.code).toBe('SAME_PASSWORD');

      // 2. Reset via PIN berhasil
      const resetPinPassword = 'RecoveredByPin123!';
      const resetPinRes = await request(app).post('/api/v1/auth/password/forgot/reset').send({
        username: mfaUsername,
        method: 'pin',
        pin: '742918',
        new_password: resetPinPassword,
      });
      expect(resetPinRes.status).toBe(200);

      // 3. Lupa PIN -> Reset via 3 pertanyaan keamanan berhasil (case-insensitive)
      const resetQuestionsPassword = 'RecoveredByQuestions99#';
      const resetQRes = await request(app).post('/api/v1/auth/password/forgot/reset').send({
        username: mfaUsername,
        method: 'questions',
        security_answers: ['  milo ', 'bandung', 'sdn 1 merdeka'],
        new_password: resetQuestionsPassword,
      });
      expect(resetQRes.status).toBe(200);

      // Login dengan password hasil reset pertanyaan keamanan
      const loginAfterReset = await request(app).post('/api/v1/auth/login').send({
        username: mfaUsername,
        password: resetQuestionsPassword,
      });
      expect(loginAfterReset.status).toBe(200);
      expect(loginAfterReset.body.data.mfa_required).toBe(true);
    });

    it('Promosi Role Kasir/Admin: menolak promosi user ke kasir/admin jika belum memenuhi standar (PIN MFA & password >= 15 karakter), dan mengizinkan setelah terpenuhi', async () => {
      const candidateUsername = `cand_kasir_${Date.now()}`;
      const defaultUserPass = 'Sajiin123!';
      const { signToken } = await import('../src/utils/crypto.js');
      const { env } = await import('../src/config/env.js');

      // Buat token admin untuk melakukan promosi role
      const adminId = `adm_promo_${Date.now()}`;
      await appPool.query(
        `INSERT INTO users (id, role_id, full_name, username, password_hash, is_active)
         VALUES (?, 1, 'Admin Promoter', ?, 'dummy_hash', 1)`,
        [adminId, adminId]
      );
      const adminToken = signToken({ userId: adminId, role: 'admin', username: adminId, type: 'access' }, env.JWT_SECRET, 900);

      // 1. Admin/Kasir membuat akun user baru dengan password default (8+ karakter)
      const createRes = await request(app)
        .post('/api/v1/admin/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          full_name: 'Calon Kasir',
          username: candidateUsername,
          password: defaultUserPass,
        });
      expect(createRes.status).toBe(201);
      const candidateId = createRes.body.data.user.id;

      // 2. Admin mencoba langsung memberi role kasir (role_id: 4) -> HARUS DITOLAK karena belum ada PIN MFA & password masih < 15 karakter
      const failPromo1 = await request(app)
        .patch(`/api/v1/admin/users/${candidateId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role_id: 4 });
      expect(failPromo1.status).toBe(400);
      expect(failPromo1.body.error.code).toBe('ROLE_CRITERIA_NOT_MET');

      // 3. User login dan mengaktifkan PIN MFA + 3 pertanyaan keamanan, tapi password masih 9 karakter
      const userLogin1 = await request(app).post('/api/v1/auth/login').send({
        username: candidateUsername,
        password: defaultUserPass,
      });
      expect(userLogin1.status).toBe(200);
      const candidateToken1 = userLogin1.body.data.tokens.access_token;

      const mfaConfirmRes = await request(app)
        .post('/api/v1/auth/mfa/confirm')
        .set('Authorization', `Bearer ${candidateToken1}`)
        .send({
          code: '889900',
          security_answers: ['Koko', 'Surabaya', 'SDN 2'],
        });
      expect(mfaConfirmRes.status).toBe(200);

      // 4. Admin mencoba memberi role kasir lagi -> MASIH DITOLAK karena password belum >= 15 karakter
      const failPromo2 = await request(app)
        .patch(`/api/v1/admin/users/${candidateId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role_id: 4 });
      expect(failPromo2.status).toBe(400);
      expect(failPromo2.body.error.code).toBe('ROLE_CRITERIA_NOT_MET');

      // 5. User mengganti password sendiri menjadi >= 15 karakter kombinasi lengkap
      const strongAdminPass = 'KasirSuperStrong15!';
      const changePassRes = await request(app)
        .post('/api/v1/auth/password/change')
        .set('Authorization', `Bearer ${candidateToken1}`)
        .send({
          old_password: defaultUserPass,
          new_password: strongAdminPass,
        });
      expect(changePassRes.status).toBe(200);

      // 6. Sekarang seluruh kriteria terpenuhi -> Admin berhasil mempromosikan akun user menjadi kasir (role_id: 4)
      const successPromo = await request(app)
        .patch(`/api/v1/admin/users/${candidateId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role_id: 4 });
      expect(successPromo.status).toBe(200);
    });

    it('Admin/Kasir: membuat akun pelanggan tanpa password menghasilkan temporary_password ramah manusia yang langsung bisa login', async () => {
      const { signToken } = await import('../src/utils/crypto.js');
      const { env } = await import('../src/config/env.js');
      const adminId = `adm_gen_${Date.now()}`;
      await appPool.query(
        `INSERT INTO users (id, role_id, full_name, username, password_hash, is_active)
         VALUES (?, 1, 'Admin Generator', ?, 'dummy_hash', 1)`,
        [adminId, adminId]
      );
      const adminToken = signToken({ userId: adminId, role: 'admin', username: adminId, type: 'access' }, env.JWT_SECRET, 900);

      const res = await request(app)
        .post('/api/v1/admin/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          full_name: 'Pelanggan Auto Pass',
          username: `cust_auto_${Date.now()}`,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.temporary_password).toBeDefined();
      expect(typeof res.body.data.temporary_password).toBe('string');
      expect(res.body.data.temporary_password.length).toBeGreaterThanOrEqual(8);

      const loginRes = await request(app).post('/api/v1/auth/login').send({
        username: res.body.data.user.username,
        password: res.body.data.temporary_password,
      });
      expect(loginRes.status).toBe(200);
    });

    it('GET /api/v1/settings/payment: menolak akses tanpa token (401) dan mengizinkan dengan token (200)', async () => {
      const { signToken } = await import('../src/utils/crypto.js');
      const { env } = await import('../src/config/env.js');
      const unauthRes = await request(app).get('/api/v1/settings/payment');
      expect(unauthRes.status).toBe(401);

      const testUserId = `pay_user_${Date.now()}`;
      await appPool.query(
        `INSERT INTO users (id, role_id, full_name, username, password_hash, is_active)
         VALUES (?, 2, 'Payment User', ?, 'dummy_hash', 1)`,
        [testUserId, testUserId]
      );
      const userToken = signToken({ userId: testUserId, role: 'user', username: testUserId, type: 'access' }, env.JWT_SECRET, 900);
      const authRes = await request(app)
        .get('/api/v1/settings/payment')
        .set('Authorization', `Bearer ${userToken}`);
      expect(authRes.status).toBe(200);
      expect(authRes.body.data).toBeDefined();
    });

    it('Native Security Headers & CORS: mengirimkan CSP, nosniff, X-Frame-Options, dan CORS tanpa library eksternal', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'http://localhost:5173');

      expect(res.status).toBe(200);
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');

      // Origin asing ditolak (tidak menyetel ACAO)
      const evilRes = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'http://evil.example.com');
      expect(evilRes.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
