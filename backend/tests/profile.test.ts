import request from 'supertest';
import { app } from '../src/index.js';
import { appPool } from '../src/config/database.js';
import crypto from 'crypto';

describe('Profile & Cart API Integration Tests', () => {
  let userToken: string;
  let userId: string;
  let menuItemId: string;
  const username = `profile_${Date.now()}`;

  beforeAll(async () => {
    const response = await request(app).post('/api/v1/auth/register').send({ full_name: 'Profile User', username, password: 'StrongPassword123!' });
    userId = response.body.data.user.id;
    userToken = response.body.data.tokens.access_token;
    const [category] = await appPool.query<any>('INSERT INTO categories (name) VALUES (?)', [`Profile ${Date.now()}`]);
    menuItemId = crypto.randomUUID();
    await appPool.query(`INSERT INTO menu_items (id, category_id, name, description, price, stock, is_available) VALUES (?, ?, 'Profile Menu', 'Fixture', 15000, 20, 1)`, [menuItemId, category.insertId]);
  });

  afterAll(async () => {
    await appPool.query('UPDATE users SET is_active = 0 WHERE id = ?', [userId]);
  });

  it('user dapat membaca profil sendiri', async () => {
    const response = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${userToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.username).toBe(username);
  });

  it('user dapat mengelola keranjang sendiri', async () => {
    const add = await request(app).put(`/api/v1/me/cart/items/${menuItemId}`).set('Authorization', `Bearer ${userToken}`).send({ quantity: 2 });
    expect(add.status).toBe(200);
    const cart = await request(app).get('/api/v1/me/cart').set('Authorization', `Bearer ${userToken}`);
    expect(cart.status).toBe(200);
    expect(cart.body.data.items.length).toBe(1);
  });

  it('endpoint alamat takeaway sudah tidak tersedia', async () => {
    const response = await request(app).get('/api/v1/me/addresses').set('Authorization', `Bearer ${userToken}`);
    expect(response.status).toBe(404);
  });

  it('validasi nomor telepon: menerima 08/628 (10-13 digit) dan menolak tanda +, huruf, atau panjang tidak valid', async () => {
    // 1. Tolak tanda +
    const rejectPlus = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ phone: '+628123456789' });
    expect(rejectPlus.status).toBe(400);

    // 2. Tolak kurang dari 10 digit
    const rejectShort = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ phone: '0812345' });
    expect(rejectShort.status).toBe(400);

    // 3. Tolak awalan selain 08 atau 628
    const rejectPrefix = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ phone: '02123456789' });
    expect(rejectPrefix.status).toBe(400);

    // 4. Terima format 08... (10-13 digit)
    const valid08 = `0812${String(Date.now()).slice(-7)}`;
    const accept08 = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ phone: valid08 });
    expect(accept08.status).toBe(200);
    expect(accept08.body.data.phone).toBe(valid08);

    // 5. Terima format 628... (11-14 digit)
    const valid628 = `62813${String(Date.now()).slice(-7)}`;
    const accept628 = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ phone: valid628 });
    expect(accept628.status).toBe(200);
    expect(accept628.body.data.phone).toBe(valid628);
  });

  it('validasi input nama: menolak payload XSS / tag HTML dan menerima nama bersih', async () => {
    // 1. Tolak script tag
    const rejectScript = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ full_name: '<script>alert(1)</script>' });
    expect(rejectScript.status).toBe(400);
    expect(rejectScript.body.error.code).toBe('VALIDATION_ERROR');

    // 2. Tolak img tag onerror
    const rejectImg = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ full_name: '<img src=x onerror="alert(1)">' });
    expect(rejectImg.status).toBe(400);
    expect(rejectImg.body.error.code).toBe('VALIDATION_ERROR');

    // 3. Terima nama valid dengan tanda baca umum (titik, koma, strip, kurung)
    const acceptClean = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ full_name: 'Budi Santoso, S.Kom. (Bpk)' });
    expect(acceptClean.status).toBe(200);
    expect(acceptClean.body.data.full_name).toBe('Budi Santoso, S.Kom. (Bpk)');
  });
});
