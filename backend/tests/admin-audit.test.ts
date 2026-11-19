import request from 'supertest';
import { app } from '../src/index.js';
import { appPool } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { signToken } from '../src/utils/crypto.js';

describe('Admin operations without Audit role', () => {
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    adminId = `admin_ops_${Date.now()}`;
    await appPool.query(
      `INSERT INTO users (id, role_id, full_name, username, password_hash, is_active)
       VALUES (?, 1, 'Admin Operations', ?, 'dummy_hash', 1)`,
      [adminId, `${adminId}`]
    );
    adminToken = signToken({ userId: adminId, role: 'admin', username: `${adminId}`, type: 'access' }, env.JWT_SECRET, 900);
  });

  afterAll(async () => {
    await appPool.query('UPDATE users SET is_active = 0 WHERE id = ?', [adminId]);
  });

  it('admin dashboard tersedia', async () => {
    const res = await request(app).get('/api/v1/admin/dashboard/summary').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('portal audit sudah tidak tersedia', async () => {
    const res = await request(app).get('/api/v1/audit/dashboard/sales').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
