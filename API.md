# Kontrak API Sajiin

## Auth

Autentikasi menggunakan `username` dan password. Username harus unik; email tidak digunakan.

- `POST /auth/login` — menerima `portal: customer|staff` (opsional, default `customer`). Server menolak dengan `403 PORTAL_MISMATCH` bila role akun tidak cocok: akun Kasir/Admin hanya boleh lewat portal `staff`, akun pelanggan hanya lewat portal `customer`. Pengecekan dilakukan setelah password valid agar tidak membocorkan tipe akun. Saat akun terkunci atau lockout per (IP + username), respons tetap generik `401 INVALID_CREDENTIALS` agar status akun tidak dapat dienumerasi; detail kunci (`423 ACCOUNT_LOCKED`) hanya muncul setelah password benar.
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/mfa/setup`
- `POST /auth/mfa/confirm`
- `POST /auth/mfa/verify`
- `POST /auth/password/forgot/check` — menerima `portal: customer|staff` (default `customer`). Mengembalikan **hanya** `{ min_password_length }` (customer=8, staff=15), diturunkan dari portal yang dipilih klien, bukan dari data akun. Respons tidak pernah membocorkan keberadaan akun, role, atau status PIN (anti-enumerasi, Finding N4). Validasi sesungguhnya (akun ada, aktif, punya PIN, kredensial benar) terjadi di `forgot/reset`.
- `POST /auth/password/forgot/reset` — menerima `portal: customer|staff` (default `customer`). Kegagalan sebelum kredensial pemulihan terverifikasi mengembalikan `400 INVALID_RECOVERY_CREDENTIALS` (generik); `SAME_PASSWORD`/`VALIDATION_ERROR` hanya setelah kredensial valid. Percobaan pemulihan gagal memakai lockout **terpisah** dari lockout login, sehingga tidak dapat mengunci akun untuk login (anti-DoS, Finding N1).
- `POST /payments/webhook` — tanpa JWT, wajib signature HMAC-SHA256 (`PAYMENT_WEBHOOK_SECRET`) dan dibatasi rate limit. Signature tidak valid → `400 INVALID_SIGNATURE`.

Tidak ada OAuth/social login. Registrasi mandiri publik (`POST /auth/register`) **sudah dihapus total** (tidak ada rute/controller/skema-nya), sehingga permintaan ke sana menghasilkan `404 NOT_FOUND`. Akun pelanggan dibuat oleh kasir. Token ditandatangani dengan HMAC-SHA256 Node crypto. Pemisahan portal login (pelanggan vs staff) ditegakkan di server, bukan hanya di UI; portal login staff berada di entri build terpisah (`staff.html`) yang hanya direwrite dari jalur rahasia sisi server `STAFF_LOGIN_PATH`. Access token terikat pada versi password (`pv`), sehingga token lama otomatis gugur setelah password diganti/direset.

Login dilindungi lockout berlapis: **per-akun lintas IP** dan **per kombinasi IP + username**, keduanya berbasis database dengan durasi bertingkat (15 → 30 → 60 → 120 → maksimal 240 menit, tanpa blokir permanen). Saat terkunci, login gagal mengembalikan **`401 INVALID_CREDENTIALS` generik** (detail `423 ACCOUNT_LOCKED` hanya setelah password benar) agar status akun tidak dapat dienumerasi. Pemilik akun menerima notifikasi in-app bertipe `security` saat akunnya terkunci.

## User

- `GET /menu`, `GET /categories`
- `GET /me/cart`, `PUT /me/cart/items/:menuItemId`, `DELETE /me/cart` — `PUT` menerima `quantity` bilangan bulat 0–999; di luar rentang itu ditolak `400 INVALID_QUANTITY` (mencegah overflow integer, Finding N8).
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
- Admin menu/user/settings endpoints sesuai permission. Baca katalog versi admin (`GET /admin/categories`, `GET /admin/menu`, `GET /admin/menu/:id`) memerlukan permission khusus `menu:read:all` (hanya `admin`); katalog publik tetap `GET /menu`/`GET /categories` dengan `menu:read`.

Operasi tulis katalog/uang divalidasi di server: `price` ≤ `9_999_999_999.99` dan `stock` ≤ `2_147_483_647` (di luar itu `400 VALIDATION_ERROR`), `image_url` hanya skema `http`/`https`, dan `page` ≤ `1_000_000`. Operasi kritis (batalkan/konfirmasi pesanan, refund, webhook, ubah status) bersifat single-winner dan atomik: pengiriman paralel menghasilkan satu sukses dan sisanya `409` (`INVALID_STATUS`/`CONFLICT`/`ORDER_EXPIRED`), bukan `500`. Semua respons API mengirim `Cache-Control: no-store`.

Tidak ada endpoint `/audit/*`.

Upload bukti transfer dan endpoint pendaftaran pelanggan oleh kasir masih menjadi pekerjaan berikutnya.
