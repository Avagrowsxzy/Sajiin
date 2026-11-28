# Keamanan Sajiin

## Prinsip

- Tidak ada third-party identity provider, payment gateway, OTP vendor, atau cloud upload.
- Password memakai `scrypt` Node crypto dengan salt unik dan parameter tersimpan pada hash.
- Token memakai HMAC-SHA256 Node crypto, expiry, refresh rotation, dan hash refresh token di database.
- Field sensitif memakai AES-256-GCM Node crypto.
- MFA sekunder memakai PIN 6 digit yang di-hash scrypt Node crypto; tidak membutuhkan aplikasi authenticator.
- Kebijakan Password & Pemulihan Akun:
  - Administrasi (`admin` dan `kasir`): panjang minimal 15 karakter, wajib kombinasi huruf besar, huruf kecil, angka, dan simbol, wajib menggunakan PIN MFA 6 digit, serta kebijakan wajib mengganti password minimal 1 tahun sekali.
  - Pengguna (`user`): panjang minimal 8 karakter, wajib kombinasi huruf besar, huruf kecil, angka, dan simbol.
  - Password lama tidak dapat digunakan kembali (`SAME_PASSWORD`).
  - Batas percobaan gagal 5x berturut-turut mengunci **akun** (lintas IP) dengan durasi bertingkat dan **tanpa blokir permanen**: 15 → 30 → 60 → 120 → maksimal 240 menit (`ACCOUNT_LOCKED`). Status disimpan di tabel `users` (`failed_login_count`, `locked_until`) sehingga tahan restart.
  - Selain itu ada **progressive lockout per kombinasi IP + username** dengan durasi bertingkat yang sama, disimpan di tabel `login_attempts` (bukan in-memory) sehingga tahan restart dan konsisten lintas proses; entri basi dibersihkan otomatis.
  - Saat akun terkunci, pemilik menerima notifikasi in-app bertipe `security` (tanpa SMS/email/OTP eksternal).
  - Lupa password wajib telah mengaktifkan PIN MFA (jika belum mengaktifkan PIN, akun dinyatakan hilang). Jika lupa PIN, pemulihan dilakukan dengan menjawab 3 pertanyaan rahasia tetap yang jawabannya di-hash menggunakan `scrypt`.
- Rate limit, security header native (CSP, X-Frame-Options, nosniff, COOP, CORP), CORS, validasi Zod, prepared statement, RBAC, dan lockout tetap aktif.
- Header `X-Powered-By` dinonaktifkan agar teknologi server tidak terekspos.
- CORS memakai allowlist eksplisit: `FRONTEND_URL` + `CORS_ALLOWED_ORIGINS` (dipisah koma). Origin localhost dan rentang LAN privat hanya diizinkan bila `CORS_ALLOW_LAN_ORIGINS=true` (atau di luar produksi); produksi default tertutup.
- CSP `connect-src` dibatasi `'self'` di produksi; skema `http/https/ws/wss` hanya dibuka di mode pengembangan (Vite HMR).
- Aktivitas login dicatat dengan IP dari `req.ip`. Kepercayaan header proxy dikendalikan env `TRUST_PROXY` dengan default aman: produksi **tidak** mempercayai header apa pun, non-produksi memakai `loopback` (di belakang proxy Vite). Ini mencegah spoofing `X-Forwarded-For` untuk memintas rate limit/lockout maupun memalsukan IP di audit trail.
- Koneksi ke database dienkripsi dengan SSL/TLS: akun aplikasi (`app_rw`) memakai `REQUIRE SSL`, dan backend mengirim CA melalui `DB_SSL`/`DB_SSL_CA`.
- Hardening database (Modul X): tidak ada user anonim, `root` hanya `localhost`, `app_rw`/`migrator`/`audit_ro` dibatasi ke `localhost` dan `127.0.0.1`, password policy `simple_password_check` (minimal 8 karakter + angka + huruf besar/kecil + karakter khusus), `max_connections = 50`, `bind-address = 127.0.0.1` pada `[mysqld]`, dan port non-default `3308`.
- Login dipisah per portal (pelanggan vs staff) dan **ditegakkan di server**: akun kasir/admin hanya bisa masuk lewat portal staff, akun pelanggan hanya lewat portal pelanggan (`403 PORTAL_MISMATCH`). Pengecekan dilakukan setelah password valid agar tidak membocorkan tipe akun. Area `/admin` dan `/kasir` mengembalikan halaman 404 bagi pengguna yang belum login atau tidak berhak, sehingga keberadaan portal staff tidak mudah ditemukan.
- Anti-enumerasi akun: status akun (nonaktif/terkunci) pada login diperiksa **setelah** password terverifikasi. Saat lockout (per-akun maupun per IP+username), login tetap membalas `401 INVALID_CREDENTIALS` generik dan detail `423 ACCOUNT_LOCKED` hanya diberikan setelah password benar. Endpoint `forgot/check` hanya mengembalikan `{ min_password_length }` (customer=8, staff=15) tanpa menyebut keberadaan akun/role/PIN; `forgot/reset` mengembalikan `400 INVALID_RECOVERY_CREDENTIALS` generik untuk semua kegagalan pra-verifikasi.
- Lockout pemulihan (lupa password) memakai namespace `recovery:` yang **terpisah** dari lockout login, sehingga percobaan pemulihan gagal tidak bisa mengunci akun untuk login (anti-DoS, Finding N1).
- MFA PIN: kesalahan PIN ikut menghitung lockout per-akun dan per (IP+username). Counter kegagalan **tidak** direset saat password benar selama MFA belum terverifikasi; reset hanya terjadi setelah PIN benar, sehingga penyerang yang mengetahui password tidak dapat mereset hitungan untuk brute-force PIN (Finding N2).
- `mfa_token` bersifat sekali pakai: setiap `mfa_token` membawa `jti` unik dan pemakaian kedua (replay) ditolak `401 INVALID_MFA_TOKEN` (Finding N3).
- Access token terikat pada versi password lewat klaim `pv` (sidik jari `password_hash`); token lama langsung gugur setelah password diganti/direset tanpa perlu menunggu kedaluwarsa (Finding N6). Token legacy tanpa `pv` tetap diterima demi transisi.
- Field internal pengguna (`failed_login_count`, `password_admin_compliant`) tidak diikutkan pada respons `SafeUser` publik (Finding N9).
- Penghitungan kegagalan login bersifat atomik di database (`failed_login_count = failed_login_count + 1`), akurat meski ada request paralel (Finding N12).
- Jumlah item keranjang dibatasi 0–999 (`400 INVALID_QUANTITY` di luar itu) untuk mencegah overflow integer (Finding N8).
- Registrasi mandiri publik (`POST /auth/register`) **dihapus total** — rute, controller, dan skemanya sudah tidak ada, sehingga permintaan ke sana menghasilkan `404`. Satu-satunya jalur pembuatan akun pelanggan adalah kasir/admin lewat `POST /admin/customers` (Finding N10).
- Portal login staff (Kasir & Admin) berada di **entri build terpisah** (`staff.html`), bukan di bundel publik. Jalur rahasianya dibaca di sisi server dari `STAFF_LOGIN_PATH` (bukan variabel `VITE_*`) dan di-rewrite ke entri tersebut; permintaan langsung ke `/staff.html` dibalas `404`. Dengan begitu jalur/nama berkas portal staff tidak dapat ditemukan dengan membaca bundel publik. Dev server Vite (khusus pengembangan) tetap diikat ke `127.0.0.1` secara default dan menolak penyajian berkas sensitif (`.env*`, `*.pem`, `*.key`, `*.crt`, `*.p12`, `.git`) dan **tidak boleh** dijalankan di produksi. Kontrol sesungguhnya tetap RBAC server (Finding N11).
- Perubahan status akun (`PATCH /admin/users/:id`, nonaktifkan/unlock) hanya untuk role `admin` (`403 FORBIDDEN` untuk role lain), karena permission `user:manage` pada kasir hanya untuk mengelola pelanggan.
- Webhook pembayaran diverifikasi dengan HMAC-SHA256 memakai `PAYMENT_WEBHOOK_SECRET` (minimal 32 karakter) dan perbandingan **timing-safe**, serta dibatasi rate limit khusus.
- Halaman audit admin hanya menampilkan audit trail aplikasi secara read-only. Query mentah MariaDB tidak ditampilkan di UI agar data sensitif tidak terekspos; query dapat diperiksa langsung oleh administrator database melalui `mysql.general_log` saat investigasi/praktikum.
- **Ronda 3 — operasi kritis kini atomik/kunci-baris:** perubahan status pesanan dan pembayaran (batalkan, konfirmasi pembayaran, ubah status admin, refund, webhook) memakai `SELECT ... FOR UPDATE` / `UPDATE ... WHERE status = ?` di dalam transaksi, sehingga hanya satu permintaan paralel yang menang dan sisanya ditolak bersih (`409`). Penyerang tidak bisa memicu oversell stok, refund ganda, atau notifikasi pembayaran ganda dengan mengirim banyak permintaan bersamaan (Finding C-F1, C-F2, C-F3, C-F4).
- **Ronda 3 — error konkurensi database tidak lagi `500`:** kode error MariaDB `ER_DUP_ENTRY`, `ER_LOCK_DEADLOCK`, dan `ER_LOCK_WAIT_TIMEOUT` dipetakan ke `409 CONFLICT` tanpa membocorkan detail internal (Finding C-F9).
- **Ronda 3 — batas input katalog & paginasi:** `price` dibatasi `DECIMAL(12,2)` dan `stock` dibatasi `INT`, `page` dibatasi `1_000_000`, dan `image_url` hanya menerima skema `http`/`https` — mencegah overflow yang sebelumnya membalas `500` dan menutup `javascript:`/`data:` (Finding C-F5, C-F6, C-F8).
- **Ronda 3 — `Cache-Control: no-store`** dikirim pada seluruh respons API agar respons sensitif (login/token, `/me`, audit, bukti transfer) tidak disimpan di cache browser/proxy (Finding C-F7).
- **Ronda 3 — baca katalog admin butuh permission khusus `menu:read:all`:** role `user` tidak lagi bisa membaca katalog admin (field internal/nonaktif) via `/admin/menu` maupun `/admin/categories` (Finding A-F2).
- **Ronda 3 — rotasi refresh token atomik:** klaim pencabutan token lama memakai `UPDATE ... WHERE revoked_at IS NULL`, sehingga banyak request paralel dengan token yang sama hanya menghasilkan satu token baru; sisanya dianggap replay dan seluruh token user dicabut (`401`), sesuai RFC 6749 §10.4 (Finding B-01).
- **Ronda 3 — `mfa_token` terikat versi password:** selain sekali pakai (`jti`), `mfa_token` kini membawa `pv` sehingga otomatis gugur setelah password diubah/direset (Finding B-02).
- **Ronda 3 — jalur entri staff dinormalisasi:** permintaan ke `/staff.html` dengan varian path (`//staff.html`, `/%73taff.html`, `/staff.html/`, dsb.) tetap dibalas `404`; hanya jalur rahasia (`STAFF_LOGIN_PATH`) yang me-rewrite ke entri staff (Finding A-F1).

## Pembayaran

Transfer tidak otomatis dianggap lunas dari screenshot. Kasir wajib memeriksa rekening dan memvalidasi bukti; server mencatat aksi validasi ke `audit_logs`.

## Audit Trail

`audit_logs` tetap ada untuk forensik, append-only, hash chain, dan trigger anti-update/delete. Tidak ada role audit atau UI audit terpisah.

## Checklist

- [ ] Upload bukti transfer: MIME, ukuran, ekstensi, nama file acak, path di luar source.
- [ ] Validasi bukti hanya kasir/admin.
- [ ] Semua write penting dicatat dalam transaksi.
- [ ] Tidak ada secret di repository.
- [ ] Test RBAC, IDOR, upload, payment validation, dan brute force lulus.
