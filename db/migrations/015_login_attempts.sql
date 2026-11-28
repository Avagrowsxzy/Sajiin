-- ============================================================
-- 015_login_attempts.sql
-- Lockout login persisten + notifikasi keamanan.
-- 1) Tabel login_attempts: state lockout per (IP + username) agar tahan restart
--    dan konsisten lintas proses (menggantikan Map in-memory).
-- 2) Notifikasi tipe 'security' untuk memberi tahu pemilik akun.
-- ============================================================

USE foodorder;

CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_key     VARCHAR(160) NOT NULL PRIMARY KEY,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until    DATETIME(3) NULL,
  last_attempt    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_login_attempts_cleanup (locked_until, last_attempt)
) ENGINE=InnoDB;

ALTER TABLE notifications
  MODIFY COLUMN type ENUM('order','payment','security') NOT NULL DEFAULT 'order';

-- Hak akses least-privilege untuk akun aplikasi
GRANT SELECT, INSERT, UPDATE, DELETE ON foodorder.login_attempts TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE ON foodorder.notifications TO 'app_rw'@'127.0.0.1';