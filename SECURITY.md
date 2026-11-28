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
- Aktivitas login dicatat dengan IP dari `req.ip` (hasil `trust proxy 'loopback'`), bukan header `X-Forwarded-For` mentah, sehingga IP pada audit trail tidak bisa dipalsukan klien.
- Koneksi ke database dienkripsi dengan SSL/TLS: akun aplikasi (`app_rw`) memakai `REQUIRE SSL`, dan backend mengirim CA melalui `DB_SSL`/`DB_SSL_CA`.
- Hardening database (Modul X): tidak ada user anonim, `root` hanya `localhost`, `app_rw`/`migrator`/`audit_ro` dibatasi ke `localhost` dan `127.0.0.1`, password policy `simple_password_check` (minimal 8 karakter + angka + huruf besar/kecil + karakter khusus), `max_connections = 50`, `bind-address = 127.0.0.1` pada `[mysqld]`, dan port non-default `3308`.
- Login dipisah per portal (pelanggan vs staff) dan **ditegakkan di server**: akun kasir/admin hanya bisa masuk lewat portal staff, akun pelanggan hanya lewat portal pelanggan (`403 PORTAL_MISMATCH`). Pengecekan dilakukan setelah password valid agar tidak membocorkan tipe akun. Area `/admin` dan `/kasir` mengembalikan halaman 404 bagi pengguna yang belum login atau tidak berhak, sehingga keberadaan portal staff tidak mudah ditemukan.
- Anti-enumerasi akun: status akun (nonaktif/terkunci) pada login diperiksa **setelah** password terverifikasi, dan endpoint pemulihan (`forgot/check`, `forgot/reset`) mengembalikan respons generik yang identik untuk akun tidak ada/nonaktif/terkunci/portal salah/belum punya PIN (`403 ACCOUNT_LOST_NO_PIN` atau `400 INVALID_RECOVERY_CREDENTIALS`).
- Perubahan status akun (`PATCH /admin/users/:id`, nonaktifkan/unlock) hanya untuk role `admin` (`403 FORBIDDEN` untuk role lain), karena permission `user:manage` pada kasir hanya untuk mengelola pelanggan.
- Webhook pembayaran diverifikasi dengan HMAC-SHA256 memakai `PAYMENT_WEBHOOK_SECRET` (minimal 32 karakter) dan perbandingan **timing-safe**, serta dibatasi rate limit khusus.
- Halaman audit admin hanya menampilkan audit trail aplikasi secara read-only. Query mentah MariaDB tidak ditampilkan di UI agar data sensitif tidak terekspos; query dapat diperiksa langsung oleh administrator database melalui `mysql.general_log` saat investigasi/praktikum.

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
