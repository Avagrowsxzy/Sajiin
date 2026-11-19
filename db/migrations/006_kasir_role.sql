-- Tambah role kasir. Pembuatan akun kasir dilakukan oleh bootstrap aplikasi.
INSERT INTO roles (id, name) VALUES (4, 'kasir') ON DUPLICATE KEY UPDATE name = VALUES(name);
