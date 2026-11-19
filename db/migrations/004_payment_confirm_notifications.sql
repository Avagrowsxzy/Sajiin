-- ============================================================
-- 004_payment_confirm_notifications.sql
-- Perubahan alur: sistem pesan-ambil (takeaway) dengan
-- konfirmasi pembayaran & pesanan oleh admin + notifikasi in-app.
--
-- 1) Enum status orders baru:
--    pending -> awaiting_confirmation -> paid -> preparing -> ready -> completed
--    (delivering dihapus; ready = pesanan sudah jadi/siap diambil)
-- 2) orders.address_id menjadi NULLable (checkout tanpa alamat)
-- 3) Tabel notifications (notifikasi in-app per user)
-- 4) Tabel system_settings (key-value; menyimpan instruksi pembayaran
--    yang bisa diubah admin; nanti diganti QRIS/gateway otomatis)
-- ============================================================

USE foodorder;

-- 1. Enum status pesanan baru
-- CATATAN: pastikan tidak ada baris berstatus 'delivering' sebelum migrasi
-- (data dev sudah diverifikasi kosong).
ALTER TABLE orders MODIFY COLUMN status
  ENUM('pending','awaiting_confirmation','paid','preparing','ready','completed','cancelled')
  NOT NULL DEFAULT 'pending';

-- 2. Checkout tidak lagi mewajibkan alamat (sistem ambil sendiri)
ALTER TABLE orders MODIFY COLUMN address_id CHAR(36) NULL;

-- 3. Tabel notifikasi in-app
CREATE TABLE notifications (
  id         CHAR(36) NOT NULL PRIMARY KEY,   -- UUID v4 dibuat aplikasi
  user_id    CHAR(36) NOT NULL,               -- penerima notifikasi
  type       ENUM('order','payment') NOT NULL DEFAULT 'order',
  title      VARCHAR(100) NOT NULL,
  message    VARCHAR(500) NOT NULL,
  order_id   CHAR(36) NULL,                   -- referensi opsional ke pesanan terkait
  is_read    TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_notif_user (user_id, is_read),
  KEY idx_notif_created (created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. Pengaturan sistem (instruksi pembayaran, dll.)
CREATE TABLE system_settings (
  `key`      VARCHAR(50) NOT NULL PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

INSERT INTO system_settings (`key`, value)
VALUES ('payment_instructions',
  'Transfer bank ke rekening resmi Sajiin. Cantumkan nominal sesuai total pesanan, lalu unggah bukti transfer untuk divalidasi kasir.')
ON DUPLICATE KEY UPDATE value = VALUES(value);

-- 5. Hak akses least-privilege
GRANT SELECT, INSERT, UPDATE ON foodorder.notifications   TO 'app_rw'@'localhost';
GRANT SELECT, UPDATE ON foodorder.system_settings         TO 'app_rw'@'localhost';
