import request from 'supertest';
import { app } from '../src/index.js';
import { appPool } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { signToken } from '../src/utils/crypto.js';

describe('RBAC & Authorization Matrix Tests', () => {
  let userToken: string;
  let adminToken: string;
  let userId: string;
  let adminId: string;

  beforeAll(async () => {
    userId = `rbac_u_${Date.now()}`;
    adminId = `rbac_a_${Date.now()}`;
    await appPool.query(
      `INSERT INTO users (id, role_id, full_name, username, password_hash, is_active)
       VALUES (?, 2, 'Regular User', ?, 'dummy_hash', 1), (?, 1, 'Admin User', ?, 'dummy_hash', 1)`,
      [userId, `${userId}`, adminId, `${adminId}`]
    );
    userToken = signToken({ userId, role: 'user', username: `${userId}`, type: 'access' }, env.JWT_SECRET, 900);
    adminToken = signToken({ userId: adminId, role: 'admin', username: `${adminId}`, type: 'access' }, env.JWT_SECRET, 900);
  });

  afterAll(async () => {
    await appPool.query('UPDATE users SET is_active = 0 WHERE id IN (?, ?)', [userId, adminId]);
  });

  it('user tidak dapat mengakses endpoint admin', async () => {
    const res = await request(app).get('/api/v1/admin/orders').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('user tidak dapat membaca katalog admin /admin/menu (Finding A-F2)', async () => {
    const res = await request(app).get('/api/v1/admin/menu').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('admin tetap dapat membaca katalog admin /admin/menu', async () => {
    const res = await request(app).get('/api/v1/admin/menu').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('admin dapat mengakses dashboard admin', async () => {
    const res = await request(app).get('/api/v1/admin/dashboard/summary').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('token invalid ditolak', async () => {
    const res = await request(app).get('/api/v1/me').set('Authorization', 'Bearer invalid');
    expect(res.status).toBe(401);
  });
});
