import request from 'supertest';
import { app } from '../src/index.js';
import { appPool } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { signToken } from '../src/utils/crypto.js';

describe('Order & Payment API Integration Tests', () => {
  let userAToken: string;
  let userBToken: string;
  let adminToken: string;
  let userAId: string;
  let userBId: string;
  let adminId: string;
  let categoryId: number;
  let menuItemId: string;
  let orderId: string;

  beforeAll(async () => {
    // 1. Buat User A, User B, dan Admin
    userAId = `ord_userA_${Date.now()}`;
    userBId = `ord_userB_${Date.now()}`;
    adminId = `ord_admin_${Date.now()}`;

    await appPool.query(
      `INSERT INTO users (id, role_id, full_name, username, password_hash, is_active) VALUES
       (?, 2, 'User A', ?, 'hash', 1),
       (?, 2, 'User B', ?, 'hash', 1),
       (?, 1, 'Order Admin', ?, 'hash', 1)`,
      [userAId, `${userAId}`, userBId, `${userBId}`, adminId, `${adminId}`]
    );

    userAToken = signToken(
      { userId: userAId, role: 'user', username: `${userAId}`, type: 'access' },
      env.JWT_SECRET,
      15 * 60
    );

    userBToken = signToken(
      { userId: userBId, role: 'user', username: `${userBId}`, type: 'access' },
      env.JWT_SECRET,
      15 * 60
    );

    adminToken = signToken(
      { userId: adminId, role: 'admin', username: `${adminId}`, type: 'access' },
      env.JWT_SECRET,
      15 * 60
    );

    // 2. Buat Kategori dan Menu Item (stok: 10, harga: 20000)
    const [catResult] = await appPool.query<any>(
      'INSERT INTO categories (name) VALUES (?)',
      [`Cat_Order_${Date.now()}`]
    );
    categoryId = catResult.insertId;

    menuItemId = `menu_ord_${Date.now()}`;
    await appPool.query(
      `INSERT INTO menu_items (id, category_id, name, description, price, stock, is_available)
       VALUES (?, ?, 'Nasi Goreng Ayam', 'Enak', 20000.00, 10, 1)`,
      [menuItemId, categoryId]
    );
  });

  afterAll(async () => {
    // Cleanup
    await appPool.query('DELETE FROM cart_items WHERE menu_item_id = ?', [menuItemId]);
    await appPool.query('UPDATE menu_items SET is_available = 0 WHERE id = ?', [menuItemId]);
    await appPool.query('UPDATE users SET is_active = 0 WHERE id IN (?, ?, ?)', [userAId, userBId, adminId]);
    await appPool.end();
  });

  describe('POST /api/v1/orders (Checkout)', () => {
    it('harus menolak checkout jika keranjang kosong (400)', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EMPTY_CART');
    });

    it('harus berhasil checkout, menghitung total di server, mengosongkan keranjang & mengurangi stok', async () => {
      // 1. Tambah 2 item ke keranjang User A
      await request(app)
        .put(`/api/v1/me/cart/items/${menuItemId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ quantity: 2 });

      // 2. Checkout
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          notes: 'Tanpa pedas',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.order_code).toContain('ORD-');
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.total_amount).toBe(40000); // 2 x 20000
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].unit_price).toBe(20000);

      orderId = res.body.data.id;

      // 3. Verifikasi keranjang sudah dikosongkan
      const cartRes = await request(app)
        .get('/api/v1/me/cart')
        .set('Authorization', `Bearer ${userAToken}`);
      expect(cartRes.body.data.items.length).toBe(0);

      // 4. Verifikasi stok berkurang (10 -> 8)
      const [menuRows] = await appPool.query<any[]>(
        'SELECT stock FROM menu_items WHERE id = ?',
        [menuItemId]
      );
      expect(menuRows[0].stock).toBe(8);
    });

    it('harus menolak checkout jika stok tidak mencukupi (409 Insufficient Stock)', async () => {
      // Tambahkan 100 item ke keranjang (stok hanya 8)
      await request(app)
        .put(`/api/v1/me/cart/items/${menuItemId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ quantity: 100 });

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    });
  });

  describe('GET /api/v1/orders (Riwayat & Scoping / IDOR)', () => {
    it('User A dapat melihat riwayat pesanan sendiri', async () => {
      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].id).toBe(orderId);
    });

    it('IDOR Protection: User B TIDAK dapat membaca detail pesanan User A (404)', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('User A dapat membaca detail pesanannya sendiri', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(orderId);
    });
  });

  describe('POST /api/v1/orders/:id/payment (Klaim "Saya Sudah Bayar")', () => {
    it('harus menolak metode pembayaran tidak valid (400)', async () => {
      const res = await request(app)
        .post(`/api/v1/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ method: 'kripto' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('harus membuat klaim pembayaran & mengubah pesanan ke awaiting_confirmation', async () => {
      const res = await request(app)
        .post(`/api/v1/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ method: 'tunai' });

      expect(res.status).toBe(201);
      expect(res.body.data.payment_id).toBeDefined();
      expect(res.body.data.order_status).toBe('awaiting_confirmation');

      // Verifikasi status pesanan berubah
      const orderRes = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(orderRes.body.data.status).toBe('awaiting_confirmation');
    });

    it('idempoten: klaim ulang mengembalikan data yang sama tanpa error', async () => {
      const res = await request(app)
        .post(`/api/v1/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ method: 'tunai' });

      expect(res.status).toBe(201);
      expect(res.body.data.order_status).toBe('awaiting_confirmation');
    });
  });

  describe('Notifikasi Admin (klaim pembayaran)', () => {
    it('admin menerima notifikasi klaim pembayaran dari User A', async () => {
      const res = await request(app)
        .get('/api/v1/me/notifications')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const claimNotifs = res.body.data.filter((n: { title: string }) =>
        n.title === 'Klaim Pembayaran'
      );
      expect(claimNotifs.length).toBeGreaterThan(0);
      expect(claimNotifs[0].message).toContain('diklaim dibayar');
    });
  });

  describe('PATCH /api/v1/admin/orders/:id/confirm-payment (Konfirmasi Admin)', () => {
    it('User tidak dapat mengonfirmasi pembayaran (403)', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/confirm-payment`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(403);
    });

    it('admin mengonfirmasi pembayaran: awaiting_confirmation -> paid + payment settled', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/confirm-payment`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      // Verifikasi status pesanan & pembayaran
      const orderRes = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(orderRes.body.data.status).toBe('paid');

      const payRes = await request(app)
        .get(`/api/v1/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(payRes.body.data.status).toBe('settled');
      expect(payRes.body.data.paid_at).not.toBeNull();
    });

    it('konfirmasi ulang ditolak (409) — bukan status awaiting_confirmation', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/confirm-payment`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });

    it('user menerima notifikasi "Pembayaran Dikonfirmasi"', async () => {
      const res = await request(app)
        .get('/api/v1/me/notifications')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      const payNotifs = res.body.data.filter((n: { title: string }) =>
        n.title === 'Pembayaran Dikonfirmasi'
      );
      expect(payNotifs.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/payments/webhook (Jalur Gateway Otomatis — untuk masa depan)', () => {
    it('harus menolak webhook dengan signature palsu (400)', async () => {
      const res = await request(app).post('/api/v1/payments/webhook').send({
        gateway_ref: 'PAY-TIDAK-ADA',
        status: 'settled',
        amount: 40000,
        signature: 'fake_signature_hash',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_SIGNATURE');
    });
  });

  describe('State Machine & Transisi Ilegal (409 Conflict)', () => {
    it('User tidak boleh membatalkan pesanan berstatus paid (409)', async () => {
      const res = await request(app)
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('Admin dapat mengubah status: paid -> preparing -> ready -> completed', async () => {
      // 1. paid -> preparing
      const prepRes = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'preparing' });

      expect(prepRes.status).toBe(200);
      expect(prepRes.body.data.status).toBe('preparing');

      // 2. preparing -> ready (pesanan sudah jadi)
      const readyRes = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ready' });

      expect(readyRes.status).toBe(200);
      expect(readyRes.body.data.status).toBe('ready');

      // 3. ready -> completed (sudah diambil)
      const compRes = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'completed' });

      expect(compRes.status).toBe(200);
      expect(compRes.body.data.status).toBe('completed');
    });

    it('Admin menolak transisi ilegal: completed -> pending (409)', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'pending' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('User menerima notifikasi "Pesanan Sudah Jadi" saat status ready', async () => {
      const res = await request(app)
        .get('/api/v1/me/notifications')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      const readyNotifs = res.body.data.filter((n: { message: string }) =>
        n.message.includes('SUDAH JADI')
      );
      expect(readyNotifs.length).toBeGreaterThan(0);
    });
  });

  describe('Notifikasi: tandai dibaca & unread count', () => {
    it('unread count > 0 lalu nol setelah read-all', async () => {
      const before = await request(app)
        .get('/api/v1/me/notifications/unread-count')
        .set('Authorization', `Bearer ${userAToken}`);
      expect(before.status).toBe(200);
      expect(before.body.data.count).toBeGreaterThan(0);

      const markAll = await request(app)
        .patch('/api/v1/me/notifications/read-all')
        .set('Authorization', `Bearer ${userAToken}`);
      expect(markAll.status).toBe(200);

      const after = await request(app)
        .get('/api/v1/me/notifications/unread-count')
        .set('Authorization', `Bearer ${userAToken}`);
      expect(after.body.data.count).toBe(0);
    });

    it('IDOR: User B tidak dapat menandai notifikasi milik User A (404)', async () => {
      // Ambil satu notifikasi milik User A
      const listA = await request(app)
        .get('/api/v1/me/notifications')
        .set('Authorization', `Bearer ${userAToken}`);
      const notifA = listA.body.data[0];
      expect(notifA).toBeDefined();

      const res = await request(app)
        .patch(`/api/v1/me/notifications/${notifA.id}/read`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Ronda 3 — race condition order & payment', () => {
    let raceMenuId: string;
    const QUANTITY = 3;

    beforeAll(async () => {
      raceMenuId = `menu_race_${Date.now()}`;
      await appPool.query(
        `INSERT INTO menu_items (id, category_id, name, description, price, stock, is_available)
         VALUES (?, ?, 'Menu Race', 'race', 15000.00, 100, 1)`,
        [raceMenuId, categoryId]
      );
    });

    afterAll(async () => {
      if (raceMenuId) {
        await appPool.query('UPDATE menu_items SET is_available = 0 WHERE id = ?', [raceMenuId]);
      }
    });

    async function stockOf(menuId: string): Promise<number> {
      const [rows] = await appPool.query<any[]>('SELECT stock FROM menu_items WHERE id = ?', [menuId]);
      return Number(rows[0].stock);
    }

    async function createClaimedOrder(
      method: 'tunai' | 'transfer',
      quantity: number
    ): Promise<{ orderId: string; paymentId: string }> {
      // Bersihkan keranjang agar sisa item dari test sebelumnya tidak ikut ter-checkout.
      await request(app)
        .delete('/api/v1/me/cart')
        .set('Authorization', `Bearer ${userAToken}`);

      await request(app)
        .put(`/api/v1/me/cart/items/${raceMenuId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ quantity });

      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ payment_method: method });
      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.data.id as string;

      const payRes = await request(app)
        .get(`/api/v1/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(payRes.status).toBe(200);
      return { orderId, paymentId: payRes.body.data.id as string };
    }

    async function countConfirmedNotifications(orderId: string): Promise<number> {
      const [rows] = await appPool.query<any[]>(
        `SELECT COUNT(*) AS n FROM notifications
         WHERE user_id = ? AND order_id = ? AND title = 'Pembayaran Dikonfirmasi'`,
        [userAId, orderId]
      );
      return Number(rows[0].n);
    }

    it('cancel vs confirm-payment paralel: hanya satu yang menang & stok konsisten (Finding C-F1)', async () => {
      const { orderId } = await createClaimedOrder('tunai', QUANTITY);
      const stockAfterCheckout = await stockOf(raceMenuId);

      const [cancelRes, confirmRes] = await Promise.all([
        request(app)
          .post(`/api/v1/orders/${orderId}/cancel`)
          .set('Authorization', `Bearer ${userAToken}`),
        request(app)
          .patch(`/api/v1/admin/orders/${orderId}/confirm-payment`)
          .set('Authorization', `Bearer ${adminToken}`),
      ]);

      const cancelWon = cancelRes.status === 200;
      const confirmWon = confirmRes.status === 200;
      expect([cancelWon, confirmWon].filter(Boolean).length).toBe(1);
      expect(cancelWon ? confirmRes.status : cancelRes.status).toBe(409);

      const finalStock = await stockOf(raceMenuId);
      if (cancelWon) {
        // Pembatalan menang -> stok dikembalikan tepat satu kali.
        expect(finalStock).toBe(stockAfterCheckout + QUANTITY);
      } else {
        // Konfirmasi menang -> stok tetap terpakai, tidak dikembalikan.
        expect(finalStock).toBe(stockAfterCheckout);
      }

      const orderRes = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(orderRes.body.data.status).toBe(cancelWon ? 'cancelled' : 'paid');
    });

    it('konfirmasi pembayaran paralel tidak menggandakan notifikasi/audit (Finding C-F3)', async () => {
      const { orderId } = await createClaimedOrder('tunai', 1);
      const before = await countConfirmedNotifications(orderId);

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app)
            .patch(`/api/v1/admin/orders/${orderId}/confirm-payment`)
            .set('Authorization', `Bearer ${adminToken}`)
        )
      );

      expect(results.filter((r) => r.status === 200).length).toBe(1);
      const after = await countConfirmedNotifications(orderId);
      expect(after - before).toBe(1);
    });

    it('refund paralel tidak menggandakan refund (Finding C-F2)', async () => {
      const { orderId, paymentId } = await createClaimedOrder('tunai', 1);

      const confirmRes = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/confirm-payment`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(confirmRes.status).toBe(200);

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          request(app)
            .post(`/api/v1/admin/payments/${paymentId}/refund`)
            .set('Authorization', `Bearer ${adminToken}`)
        )
      );

      expect(results.filter((r) => r.status === 200).length).toBe(1);
      for (const fail of results.filter((r) => r.status !== 200)) {
        expect(fail.status).toBe(409);
      }

      const [rows] = await appPool.query<any[]>(
        'SELECT status FROM payments WHERE id = ?',
        [paymentId]
      );
      expect(rows[0].status).toBe('refunded');
    });
  });

  describe('Pembatalan otomatis pesanan > 5 menit (Anti-Spam)', () => {
    it('Membatalkan otomatis pesanan > 5 menit tanpa bukti transfer/konfirmasi & mengembalikan stok, namun tidak membatalkan transfer yang sudah unggah bukti', async () => {
      // Ambil stok awal menuItemId
      const [beforeStockRows] = await appPool.query<any[]>(
        'SELECT stock FROM menu_items WHERE id = ?',
        [menuItemId]
      );
      const initialStock = Number(beforeStockRows[0].stock);

      // 1. Buat pesanan tunai (tanpa konfirmasi kasir)
      await request(app)
        .put(`/api/v1/me/cart/items/${menuItemId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ quantity: 2 });
      const cashOrderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ payment_method: 'tunai' });
      expect(cashOrderRes.status).toBe(201);
      const cashOrderId = cashOrderRes.body.data.id;

      // 2. Buat pesanan transfer dan langsung unggah bukti transfer
      await request(app)
        .put(`/api/v1/me/cart/items/${menuItemId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ quantity: 1 });
      const transferOrderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ payment_method: 'transfer' });
      expect(transferOrderRes.status).toBe(201);
      const transferOrderId = transferOrderRes.body.data.id;

      const proofRes = await request(app)
        .post(`/api/v1/payments/orders/${transferOrderId}/proof`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          proof_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          mime: 'image/png',
        });
      expect(proofRes.status).toBe(201);

      // Mundurkan created_at kedua pesanan menjadi 6 menit yang lalu
      await appPool.query(
        'UPDATE orders SET created_at = DATE_SUB(NOW(3), INTERVAL 6 MINUTE) WHERE id IN (?, ?)',
        [cashOrderId, transferOrderId]
      );

      // Panggil endpoint detail pesanan
      const checkCash = await request(app)
        .get(`/api/v1/orders/${cashOrderId}`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(checkCash.status).toBe(200);
      expect(checkCash.body.data.status).toBe('cancelled');

      const checkTransfer = await request(app)
        .get(`/api/v1/orders/${transferOrderId}`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(checkTransfer.status).toBe(200);
      expect(checkTransfer.body.data.status).toBe('awaiting_confirmation');

      // Pastikan stok dari pesanan tunai (2 item) telah kembali, sedangkan pesanan transfer (1 item) tetap terpakai
      const [afterStockRows] = await appPool.query<any[]>(
        'SELECT stock FROM menu_items WHERE id = ?',
        [menuItemId]
      );
      expect(Number(afterStockRows[0].stock)).toBe(initialStock - 1);
    });
  });
});
