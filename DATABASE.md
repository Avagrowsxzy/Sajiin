# Database Sajiin

Tabel utama: `users`, `roles`, `refresh_tokens`, `menu_items`, `categories`, `carts`, `cart_items`, `orders`, `order_items`, `payments`, `audit_logs`, `notifications`, `system_settings`.

`audit_logs` dan `audit_chain_head` dipertahankan untuk audit trail internal. Role aplikasi hanya `admin`, `kasir`, dan `user`; migrasi baru tidak boleh membuat role/akun `audit`.

`app_rw` memiliki `SELECT, INSERT` pada `audit_logs`; trigger database tetap menolak `UPDATE` dan `DELETE`.

Nomor telepon disimpan terenkripsi pada `users.phone` dan memiliki blind index HMAC-SHA256 unik pada `users.phone_hash` untuk aturan satu nomor satu akun.

Semua ID aplikasi menggunakan UUID v4. Query memakai placeholder `?`. Waktu disimpan UTC. Field sensitif dienkripsi AES-256-GCM di aplikasi.

Pembayaran menyimpan metode, amount, status, gateway/reference internal, dan bukti transfer yang disimpan sebagai metadata/path aman, bukan blob tanpa validasi.
