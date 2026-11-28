# Kontrak API Sajiin

## Auth

Autentikasi menggunakan `username` dan password. Username harus unik; email tidak digunakan.

- `POST /auth/login` — menerima `portal: customer|staff` (opsional, default `customer`). Server menolak dengan `403 PORTAL_MISMATCH` bila role akun tidak cocok: akun Kasir/Admin hanya boleh lewat portal `staff`, akun pelanggan hanya lewat portal `customer`. Pengecekan dilakukan setelah password valid agar tidak membocorkan tipe akun.
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/mfa/setup`
- `POST /auth/mfa/confirm`
- `POST /auth/mfa/verify`
- `POST /auth/password/forgot/check` — menerima `portal: customer|staff` (default `customer`). Mengembalikan `{ username, role, has_pin, has_questions }` hanya untuk akun aktif dengan PIN yang cocok portal. Untuk kondisi lain (tidak ada/nonaktif/terkunci/portal salah/belum punya PIN) server mengembalikan respons generik yang sama: `403 ACCOUNT_LOST_NO_PIN`.
- `POST /auth/password/forgot/reset` — menerima `portal: customer|staff` (default `customer`). Kegagalan sebelum kredensial pemulihan terverifikasi mengembalikan `400 INVALID_RECOVERY_CREDENTIALS` (generik); `SAME_PASSWORD`/`VALIDATION_ERROR` hanya setelah kredensial valid.
- `POST /payments/webhook` — tanpa JWT, wajib signature HMAC-SHA256 (`PAYMENT_WEBHOOK_SECRET`) dan dibatasi rate limit. Signature tidak valid → `400 INVALID_SIGNATURE`.

Tidak ada OAuth/social login atau register publik. Akun pelanggan dibuat oleh kasir. Token ditandatangani dengan HMAC-SHA256 Node crypto. Pemisahan portal login (pelanggan vs staff) ditegakkan di server, bukan hanya di UI.

Login dilindungi lockout berlapis: **per-akun lintas IP** dan **per kombinasi IP + username**, keduanya berbasis database dengan durasi bertingkat (15 → 30 → 60 → 120 → maksimal 240 menit, tanpa blokir permanen). Respons saat terkunci: `423 ACCOUNT_LOCKED`. Pemilik akun menerima notifikasi in-app bertipe `security` saat akunnya terkunci.

## User

- `GET /menu`, `GET /categories`
- `POST /orders`, `GET /orders`, `GET /orders/:id`
- `POST /orders` menerima `payment_method: transfer|tunai` untuk membuat order dan payment bersamaan.
- `POST /orders/:id/payment`
- `POST /payments/orders/:id/proof` (user, payload base64 image allowlist)
- `GET /settings/payment` mengembalikan instruksi dan rekening bank transfer.
- `PATCH /settings/payment` (admin, `system:config`) mengubah data rekening dan instruksi serta mencatat audit log.
- `GET /admin/audit/logs` membaca audit trail aplikasi (`audit_logs`) secara read-only. Query mentah MariaDB tetap tersedia langsung melalui `mysql.general_log` untuk investigasi/keperluan praktikum, bukan melalui UI admin.
- `GET /admin/audit/logs/stream` membuka Server-Sent Events (SSE) terautentikasi untuk mengirim audit log baru ke dashboard admin tanpa refresh; endpoint ini memakai permission `audit:read`.
- `PATCH /me`

## Kasir/Admin

- `GET /admin/dashboard/summary`
- `GET /admin/audit/logs` (admin, read-only audit trail internal)
- `GET /admin/orders`, `GET /admin/orders/:id`
- `PATCH /admin/orders/:id/status`
- `PATCH /admin/orders/:id/confirm-payment`
- `GET /admin/payments`
- `POST /admin/payments/:id/refund`
- `POST /admin/customers`
- `PATCH /admin/users/:id` (admin) — mengubah `is_active`/`unlock`. Hanya role `admin`; role lain (mis. kasir yang punya `user:manage`) mendapat `403 FORBIDDEN`.
- Admin menu/user/settings endpoints sesuai permission.

Tidak ada endpoint `/audit/*`.

Upload bukti transfer dan endpoint pendaftaran pelanggan oleh kasir masih menjadi pekerjaan berikutnya.
