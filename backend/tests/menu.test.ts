import request from 'supertest';
import { app } from '../src/index.js';
import { appPool } from '../src/config/database.js';
import { signToken } from '../src/utils/crypto.js';
import { env } from '../src/config/env.js';

describe('Menu & Category API Integration Tests', () => {
  let adminToken: string;
  let adminId: string;
  let categoryId: number;
  let menuId: string;

  beforeAll(async () => {
    // Buat akun admin untuk tes
    adminId = `menu_admin_${Date.now()}`;
    await appPool.query(
      `INSERT INTO users (id, role_id, full_name, username, password_hash, is_active)
       VALUES (?, 1, 'Menu Admin', ?, 'dummy_hash', 1)`,
      [adminId, `${adminId}`]
    );

    adminToken = signToken(
      { userId: adminId, role: 'admin', username: `${adminId}`, type: 'access' },
      env.JWT_SECRET,
      15 * 60
    );
  });

  afterAll(async () => {
    // Cleanup: gunakan soft-delete (set is_available = 0) karena app_rw tidak punya DELETE
    if (menuId) {
      await appPool.query('UPDATE menu_items SET is_available = 0 WHERE id = ?', [menuId]);
    }
    if (categoryId) {
      // Cek apakah ada menu di kategori ini
      const [rows] = await appPool.query<any[]>(
        'SELECT id FROM menu_items WHERE category_id = ?',
        [categoryId]
      );
      if (rows.length === 0) {
        // Baru bisa dihapus jika tidak ada menu
        await appPool.query('DELETE FROM categories WHERE id = ?', [categoryId]);
      }
    }
    await appPool.query('UPDATE users SET is_active = 0 WHERE id = ?', [adminId]);
  });

  describe('GET /api/v1/categories (Publik)', () => {
    it('harus mengembalikan daftar kategori tanpa autentikasi', async () => {
      const res = await request(app).get('/api/v1/menu/categories');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/v1/admin/categories (Admin)', () => {
    it('harus menolak tanpa autentikasi (401)', async () => {
      const res = await request(app).post('/api/v1/admin/categories').send({
        name: 'Kategori Test',
      });
      expect(res.status).toBe(401);
    });

    it('harus berhasil membuat kategori baru', async () => {
      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Kategori ${Date.now()}`,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toBeDefined();

      categoryId = res.body.data.id;
    });

    it('harus menolak kategori duplikat', async () => {
      const categoryName = `UniqueCategory_${Date.now()}`;
      await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: categoryName });

      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: categoryName });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CATEGORY_EXISTS');
    });
  });

  describe('PATCH /api/v1/admin/categories/:id (Admin)', () => {
    it('harus berhasil mengubah nama kategori', async () => {
      const newName = `Updated_${Date.now()}`;
      const res = await request(app)
        .patch(`/api/v1/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: newName });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe(newName);
    });
  });

  describe('POST /api/v1/admin/menu (Admin)', () => {
    it('harus menolak jika kategori tidak ada', async () => {
      const res = await request(app)
        .post('/api/v1/admin/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          category_id: 99999,
          name: 'Menu Invalid',
          price: 10000,
          stock: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CATEGORY');
    });

    it('harus menolak harga negatif', async () => {
      const res = await request(app)
        .post('/api/v1/admin/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          category_id: categoryId,
          name: 'Menu Negatif',
          price: -5000,
          stock: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('harus berhasil membuat menu baru', async () => {
      const res = await request(app)
        .post('/api/v1/admin/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          category_id: categoryId,
          name: 'Nasi Goreng Special',
          description: 'Nasi goreng dengan telur dan ayam',
          price: 25000,
          stock: 50,
          is_available: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toBe('Nasi Goreng Special');
      expect(res.body.data.price).toBe(25000);

      menuId = res.body.data.id;
    });
  });

  describe('GET /api/v1/menu (Publik)', () => {
    it('harus mengembalikan daftar menu yang tersedia (is_available=1)', async () => {
      const res = await request(app).get('/api/v1/menu').query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(10);
      if (res.body.data.length > 0) {
        expect(res.body.data[0].created_by).toBeUndefined();
      }
    });

    it('harus mendukung filter kategori', async () => {
      const res = await request(app)
        .get('/api/v1/menu')
        .query({ category_id: categoryId, page: 1, limit: 10 });

      expect(res.status).toBe(200);
    });

    it('harus mendukung pencarian (query q)', async () => {
      const res = await request(app)
        .get('/api/v1/menu')
        .query({ q: 'Nasi', page: 1, limit: 10 });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/menu/:id (Publik)', () => {
    it('harus mengembalikan detail menu', async () => {
      const res = await request(app).get(`/api/v1/menu/${menuId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(menuId);
      expect(res.body.data.name).toBe('Nasi Goreng Special');
      expect(res.body.data.created_by).toBeUndefined();
    });

    it('harus mengembalikan 404 jika menu tidak ditemukan', async () => {
      const res = await request(app).get('/api/v1/menu/non-existent-id');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/admin/menu/:id (Admin)', () => {
    it('harus berhasil mengubah harga dan stok', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/menu/${menuId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          price: 27000,
          stock: 40,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.price).toBe(27000);
      expect(res.body.data.stock).toBe(40);
    });

    it('harus berhasil menonaktifkan menu (is_available=false)', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/menu/${menuId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          is_available: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.is_available).toBe(false);

      // Publik tidak boleh melihat menu yang tidak tersedia
      const publicRes = await request(app).get(`/api/v1/menu/${menuId}`);
      expect(publicRes.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/admin/menu/:id (Admin)', () => {
    it('harus menghapus permanen menu yang belum pernah dipakai', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/menu/${menuId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.hard_deleted).toBe(true);

      // Verifikasi menu tidak terlihat di katalog publik
      const publicRes = await request(app).get(`/api/v1/menu/${menuId}`);
      expect(publicRes.status).toBe(404);

      // Menu yang belum direferensikan order/cart tidak lagi ada di admin view
      const adminRes = await request(app)
        .get(`/api/v1/admin/menu/${menuId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(404);

      menuId = ''; // Reset agar tidak dihapus lagi di afterAll
    });
  });

  describe('DELETE /api/v1/admin/categories/:id (Admin)', () => {
    it('harus menolak menghapus kategori yang memiliki menu aktif', async () => {
      // Buat kategori dan menu baru untuk tes ini
      const catRes = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `TestCat_${Date.now()}` });
      const testCatId = catRes.body.data.id;

      const menuRes = await request(app)
        .post('/api/v1/admin/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          category_id: testCatId,
          name: 'Menu Blocker',
          price: 10000,
          stock: 10,
        });

      const res = await request(app)
        .delete(`/api/v1/admin/categories/${testCatId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CATEGORY_HAS_ITEMS');
    });
  });
});
