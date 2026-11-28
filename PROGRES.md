# Progres Sajiin

## Selesai

- Backend REST, MySQL, repository/service/controller layering.
- Login, refresh token, MFA, lockout, rate limit, RBAC tiga role.
- Password hashing (`scrypt`), token signing (`HMAC-SHA256`), dan TOTP sudah memakai Node `node:crypto` native.
- Hash akun `admin` berhasil dimigrasikan dari Argon2 lama ke format `scrypt` native dan password development dirotasi sesuai kebijakan kompleksitas.
- Hash akun `kasir` di-reset ke `scrypt` native dengan password development baru sesuai kebijakan kompleksitas.
- MFA semua role memakai PIN keamanan 6 digit setelah password; PIN di-hash scrypt native dan tidak bergantung aplikasi authenticator.
- Halaman katalog `/menu` dikunci ke `ProtectedRoute` role `user`; akses langsung tanpa login tidak lagi bisa dibypass lewat URL.
- Link Menu pada navbar pengunjung diarahkan ke `/login`, sedangkan user terautentikasi tetap memakai katalog dan bottom navigation.
- Dashboard Admin dikembalikan menjadi **Log Aktivitas Sistem** melalui `/admin/audit/logs`; dashboard Kasir tetap khusus role Kasir.
- Grant `SELECT, INSERT` pada `audit_logs` untuk `app_rw` diperbaiki; Admin sekarang dapat membaca log tanpa error 500.
- Route `/kasir/customers` diperbaiki agar halaman Daftar Pelanggan tidak lagi 404.
- Dashboard Kasir memakai rentang tanggal MySQL lokal (`YYYY-MM-DD HH:mm:ss`), sehingga pesanan hari ini tampil sesuai waktu server/database.
- Nomor telepon pelanggan dinormalisasi dan disimpan sebagai HMAC blind index unik (`phone_hash`) sementara nomor aslinya tetap terenkripsi.
- Checkout sekarang menerima metode pembayaran transfer/tunai bersamaan saat order dibuat dan membuat payment atomik dalam transaksi yang sama.
- Checkout menampilkan tujuan transfer dari `system_settings` sebelum order dibuat; default instruksi tidak lagi menyebut QRIS.
- Setting rekening bank terpisah ditambahkan (`payment_bank_name`, `payment_account_number`, `payment_account_name`) dan ditampilkan di Checkout/detail pesanan.
- Admin memiliki menu `/admin/settings/payment` untuk mengubah bank, nomor rekening, nama pemilik, dan instruksi pembayaran; perubahan menyimpan old/new value yang dimasking ke `audit_logs`.
- Login dan identitas akun telah dimigrasikan dari email ke username di database, backend, frontend, tests, scripts, dan dokumentasi.
- Akun existing sekarang memakai username `admin`, `kasir`, dan seterusnya sesuai bagian sebelum tanda `@` lama.
- Akun user lama dengan password Argon2 (`apaja`, `mantap`, `ahmad`, `user`, `lelakihut`, `petir`, `kali`) dihapus dari database karena tidak sesuai kebijakan keamanan terbaru (password minimal 8 karakter, kombinasi lengkap).
- Akun `audit` role dihapus karena role Audit sudah dihapus dari aplikasi.
- Tabel `addresses`, kolom `orders.address_id`, seluruh route/service/repository alamat, dan test alamat dihapus karena model bisnis hanya takeaway/ambil sendiri.
- Validasi kasir sekarang menolak pembayaran transfer tanpa bukti transfer (`PROOF_REQUIRED`); pembayaran tunai tetap dapat divalidasi tanpa upload.
- Migrasi `007_user_phone_hash_unique.sql` dan migrasi data 6 nomor existing selesai.
- File UI shadcn/dashboard-4 yang tidak lagi dipakai setelah penghapusan role Audit dihapus.
- AES-256-GCM field encryption dan audit trail append-only.
- Katalog, cart, checkout, order status, notifikasi.
- UI user dengan carousel makanan, katalog compact, bubble kategori, bottom nav.
- Dashboard kasir dengan kartu pesanan hari berjalan dan konfirmasi pembayaran.
- Portal/role Audit dihapus dari routing aplikasi.
- Endpoint `POST /admin/customers` dan halaman Kasir "Daftar Pelanggan" tersedia.
- Migrasi `005_payment_proof.sql` dan endpoint upload bukti transfer user tersedia; file disimpan lokal dengan UUID, batas 5MB, MIME allowlist, dan audit event.
- Register publik ditutup; pelanggan diarahkan untuk dibuatkan akun oleh kasir.
- QRIS dihapus dari pilihan pembayaran; metode resmi aplikasi hanya tunai dan transfer.
- Kartu dashboard kasir dapat mengambil dan menampilkan bukti transfer dengan endpoint terotorisasi.
- Akses LAN diaktifkan secara aman melalui Vite proxy relative URL (`/api/v1`) dan CORS backend (`backend/src/index.ts`) berbasis allowlist eksplisit: `FRONTEND_URL` + `CORS_ALLOWED_ORIGINS`. Origin localhost dan IP privat LAN (192.168.x.x, 10.x.x.x, 172.16-31.x.x) hanya diizinkan bila `CORS_ALLOW_LAN_ORIGINS=true` (atau di luar produksi), tanpa mengekspos port MySQL (`127.0.0.1`) atau membuka origin publik tak dikenal. File `frontend/.env.local` disetel ke relative URL `VITE_API_URL=/api/v1` agar perangkat lain di jaringan WiFi/LAN tidak memanggil `localhost:3000` milik perangkat mereka sendiri.
- Batas body JSON Express dinaikkan ke `5mb` untuk mengakomodasi upload bukti transfer Base64 tanpa error 413.
- Kebijakan kompleksitas password diterapkan:
  - Role Administrasi (`admin` & `kasir`): minimal 15 karakter, wajib kombinasi huruf besar, huruf kecil, angka, simbol, wajib PIN MFA 6 digit saat login, dan kebijakan wajib ganti password 1 tahun sekali.
  - Role Pengguna (`user`): minimal 8 karakter, wajib kombinasi huruf besar, huruf kecil, angka, dan simbol.
  - Password lama tidak dapat digunakan kembali saat ganti password maupun reset password (`SAME_PASSWORD`).
  - Gagal 5x berturut-turut pada login maupun pemulihan mengunci akun selama 15 menit (`ACCOUNT_LOCKED`).
- Migrasi `012_security_policy_and_recovery.sql` menambahkan `security_answers_hash` (hash `scrypt` dari 3 jawaban pertanyaan keamanan tetap) tanpa menyimpan teks pertanyaan di database.
- Alur Lupa Password (`/auth/password/forgot/check` & `/auth/password/forgot/reset`): wajib memiliki PIN aktif (jika belum aktif, akun dinyatakan hilang/`ACCOUNT_LOST_NO_PIN`), dan jika lupa PIN dapat memulihkan menggunakan 3 pertanyaan keamanan tetap.
- Indikator Parameter Password (`PasswordStrengthMeter`: Lemah, Sedang, Kuat) dipasang pada form ganti password mandiri (`ProfilePage.tsx`) dan form reset lupa password (`AuthModal.tsx`).
- Eliminasi password default statis: pembuatan akun pelanggan oleh Kasir (`KasirCustomersPage.tsx`) dan Admin (`AdminUsersPage.tsx`) kini menggunakan generator password sementara ramah manusia di server (`generateHumanFriendlyPassword`: pola kata + 2 angka + simbol) yang memenuhi kebijakan password 8+ karakter. Password sementara ditampilkan jelas di layar kasir/admin setelah akun dibuat tanpa tombol salin dan tanpa hardcode di client.
- Penutupan ekspos port backend 3000 ke LAN: Express diikat secara dinamis ke variabel `env.HOST` (default `127.0.0.1` via `.env`) sehingga tidak bisa diakses langsung melewati rate-limiter reverse proxy.
- Dev server Vite (`frontend/vite.config.ts`) diikat ke host dinamis `process.env.VITE_HOST || '127.0.0.1'` untuk mencegah kebocoran kode sumber mentah di jaringan lokal saat development.
- Proteksi data rekening pembayaran (`GET /api/v1/settings/payment`): mewajibkan autentikasi token (`authenticate`) dan menghapus fallback nama bank/rekening hardcoded di controller. Nomor rekening tidak lagi ditampilkan di halaman checkout, melainkan hanya di halaman detail pesanan (`OrderDetailPage.tsx`) setelah pesanan dikonfirmasi.
- Sanitasi katalog menu publik (`getPublicMenu` & `getPublicMenuById`): menyaring kolom internal admin (`created_by`) agar tidak bocor di endpoint publik.
- Migrasi `013_password_admin_compliant.sql` dan validasi promosi role (`AdminService.updateUserRole`): akun `user` hanya dapat diberi role `kasir` atau `admin` jika sudah mengaktifkan PIN MFA dan telah memiliki password minimal 15 karakter kombinasi lengkap (`ROLE_CRITERIA_NOT_MET`). Security answers bersifat optional untuk pemulihan jika lupa PIN.
- Migrasi `014_grant_system_settings_insert.sql`: menambahkan hak `INSERT` pada `foodorder.system_settings` untuk user `app_rw` agar perubahan pengaturan pembayaran (`ON DUPLICATE KEY UPDATE`) tidak lagi gagal dengan error 500.
- Validasi nomor telepon Indonesia diterapkan di backend (`admin.controller.ts`, `user.controller.ts`, `auth.controller.ts`) dan frontend (`KasirCustomersPage.tsx`, `AdminUsersPage.tsx`, `ProfilePage.tsx`): wajib hanya angka tanpa tanda `+`, diawali `08` (10–13 digit) atau `628` (11–14 digit).
- Pembatalan otomatis pesanan lewat 5 menit (`OrderService.cancelExpiredOrders` + countdown timer di `OrderDetailPage.tsx`): pesanan `pending` / `awaiting_confirmation` yang melewati 5 menit tanpa unggah bukti transfer (untuk metode transfer) atau belum divalidasi kasir (untuk metode tunai) otomatis dibatalkan (`cancelled`), stok menu dikembalikan ke etalase, dan dicatat ke `audit_logs` (`ORDER_AUTO_CANCEL_EXPIRED`). Pesanan transfer yang sudah mengunggah bukti transfer aman dari pembatalan otomatis.
- Perbaikan `admin.repository.ts`: migrasi dari email ke username di query `getAllUsers`, tambah kolom `has_mfa` dan `password_admin_compliant` di respons, update interface `AdminUserListItem`.
- Perbaikan `admin.controller.ts`: schema `customerSchema` berubah dari `email` ke `username` dengan validasi regex.
- Implementasi role criteria checklist: tambah method `getUserRoleCompliance` di repository yang return `has_mfa_pin`, `has_security_answers`, `password_admin_compliant` terpisah; update validasi promosi role di service (wajib PIN + security answers + password 15 char); tambah endpoint `GET /admin/users/:id/role-criteria` di controller; update `AdminUsersPage.tsx` untuk fetch dan tampil criteria checklist (✓/✗) per item sebelum ubah role.
- Verifikasi PIN lama saat ganti PIN: `confirmMfa` di service kini wajib menerima `current_pin` jika akun sudah punya PIN aktif; controller meneruskan field `current_pin` dari request; `ProfilePage.tsx` menampilkan field "PIN Saat Ini" hanya ketika `user.has_mfa === true`. Saat ganti PIN, 3 pertanyaan keamanan tidak ditampilkan dan tidak dikirim — jawaban lama tetap tersimpan di database.
- Pembersihan dependensi third-party backend ke native Express & Node.js murni:
  - Pustaka `cors`, `helmet`, `express-rate-limit`, `dotenv`, dan `uuid` dihapus dari `backend/package.json`.
  - Dependensi runtime backend sekarang murni hanya 3 paket inti: `express` (framework), `mysql2` (driver DB), dan `zod` (validator skema).
  - Middleware keamanan HTTP (CSP, X-Frame-Options, nosniff, COOP, CORP) digantikan oleh middleware Express native.
  - Penanganan CORS (origin allowlist localhost & IP privat LAN) digantikan oleh middleware Express native.
  - Rate limiter per IP (auth 5/mnt, public 120/mnt, API 300/mnt) digantikan oleh implementasi native berbasis `Map` JavaScript.
  - Pembacaan konfigurasi `.env` menggunakan pembaca file native tanpa dependensi `dotenv`.
- Hardening keamanan native tanpa pustaka pihak ketiga:
  - Progressive Targeted Lockout (`IP + Username`) pada `progressive-lockout.service.ts` & `auth.service.ts`:
    - 5x gagal login: Akses dari IP ke akun terkait dikunci 15 menit (Tier 1).
    - 10x gagal login: Akses dari IP ke akun terkait dikunci 30 menit (Tier 2).
    - 15x gagal login: Akses dari IP ke akun terkait dikunci 60 menit / 1 jam (Tier 3).
    - 20x gagal login: Akses dari IP ke akun terkait diblokir permanen tanpa batas waktu (Tier 4).
    - Perangkat / IP lain tetap bebas login jika memasukkan password yang benar (anti-DoS / kebal dari orang iseng).
    - Login sukses langsung mereset seluruh counter kegagalan ke 0.
  - Sanitasi ketat input string & mitigasi XSS tersimpan:
    - Skema `full_name` (`user.controller.ts`, `auth.controller.ts`, `admin.controller.ts`) menerapkan regex allowlist `/^[a-zA-Z0-9\s.,'()-]+$/` (menolak `<script>`, event handler onerror, metakarakter injeksi).
    - Skema `notes` checkout (`order.controller.ts`), nama kategori, serta nama dan deskripsi menu (`menu.controller.ts`) menolak tag HTML `<` dan `>`.
  - Proteksi Token Replay Attack (RFC 6749 Section 10.4) pada `AuthService.refresh`: mendeteksi upaya penggunaan ulang refresh token yang telah dicabut (`revoked_at !== null`), langsung membatalkan semua sesi aktif akun tersebut via `tokenRepo.revokeAllForUser`, dan mencatatnya ke `audit_logs` (`AUTH_TOKEN_REUSE_DETECTED`).
  - Konfigurasi Content-Security-Policy (CSP) eksplisit pada `backend/src/index.ts` dengan perlindungan `objectSrc: none`, `frameAncestors: self`, `defaultSrc: self`, dan adaptasi HTTPS hanya di mode produksi.
  - Penutupan Source Map exposure pada `frontend/vite.config.ts` (`build.sourcemap: false`) agar struktur berkas dan path direktori absolut tidak bocor pada bundel produksi.
  - Validasi biner *magic number* berbasis buffer asli (`Buffer.from(...)`) pada `payment.service.ts` untuk berkas bukti transfer (memverifikasi header byte asli JPEG `FF D8 FF`, PNG `89 50 4E 47`, dan WebP `RIFF...WEBP`) sehingga berkas script/executable berbahaya bertopeng gambar ditolak di tingkat server.
  - Proteksi *path traversal* pada `payment.controller.ts` (`getProof`) untuk memastikan pengunduhan berkas bukti transfer terkunci ketat di dalam direktori `uploads/proofs/`.
- Enkripsi koneksi database (SSL/TLS) diimplementasikan end-to-end (Modul VII Praktikum):
  - Sertifikat CA & server dibuat lokal dengan OpenSSL di `db/ssl/` (`ca-cert.pem`, `server-cert.pem`, `server-key.pem`) dan dipasang di MariaDB melalui `ssl_ca`, `ssl_cert`, `ssl_key` pada `/etc/my.cnf.d/server.cnf`; terverifikasi `have_ssl = YES`.
  - User database diatur: `app_rw` (akun aplikasi) `REQUIRE SSL` dengan `ssl_type = ANY`, sedangkan `plain_user` dibiarkan tanpa SSL sebagai pembanding pengujian.
  - Pengujian koneksi: `app_rw` tanpa SSL ditolak (`ERROR 1045 Access denied`), sedangkan dengan `--ssl-ca` berhasil dan `STATUS` menampilkan `SSL: Cipher in use is TLS_AES_256_GCM_SHA384`.
  - Backend `mysql2` kini mengirim opsi `ssl: { ca }` melalui env `DB_SSL` & `DB_SSL_CA` (`backend/src/config/env.ts`, `backend/src/config/database.ts`); `DB_SSL=false` membuat koneksi `app_rw` ditolak, membuktikan enkripsi benar-benar aktif.
  - Template `.env` pada `scripts/setup-db.sh` menambah `DB_SSL=false` dan `DB_SSL_CA=` sebagai default aman untuk instalasi baru.
- Pemisahan portal login staff dari login pelanggan (frontend):
  - Login pelanggan tetap memakai modal `AuthModal` dari navbar (UX tidak berubah).
  - Kasir & Admin memakai halaman portal terpisah `StaffLoginPage` yang diakses lewat jalur rahasia `STAFF_LOGIN_PATH` (default `/sajiin-ops-7f3a/login`) tanpa tautan publik apa pun. (Ronda 3 memindahkannya ke entri build terpisah `staff.html`; lihat bagian "Ronda 3".)
  - Logika autentikasi (login, MFA, setup PIN, lupa password) diekstrak ke hook bersama `hooks/useAuthFlow.ts` dan komponen `components/ui/AuthFlowContent.tsx`, sehingga modal pelanggan dan halaman staff tidak duplikat.
  - `ProtectedRoute` mendapat opsi `concealed`: area `/admin` dan `/kasir` mengembalikan halaman 404 (bukan redirect ke login atau 403) bagi pengguna yang belum login maupun yang tidak berhak, agar keberadaan portal staff tidak terbaca dari luar.
  - Jalur portal staff didokumentasikan di `frontend/.env.local` dan `frontend/.env.example` (Ronda 3: menjadi `STAFF_LOGIN_PATH` sisi server).
- Pemisahan portal login ditegakkan di server (bukan hanya UI):
  - `POST /auth/login`, `POST /auth/password/forgot/check`, dan `POST /auth/password/forgot/reset` menerima field `portal: customer|staff` (default `customer`, sehingga klien lama tetap kompatibel).
  - `AuthService` menolak `403 PORTAL_MISMATCH` bila role akun tidak cocok portal; pengecekan pada login dilakukan setelah password terverifikasi agar tidak membocorkan tipe akun (mencegah user enumeration).
  - Frontend meneruskan `portal` melalui `AuthContext.login` dan hook `useAuthFlow`; modal pelanggan memakai `customer`, halaman portal staff memakai `staff`.
  - Kontrak API diperbarui di `API.md`, prinsip keamanan di `SECURITY.md`.
- Halaman Admin Log dikembalikan menjadi audit trail aplikasi saja dari `audit_logs`; query mentah MariaDB tetap direkam oleh General Log dan diperiksa langsung melalui DBMS saat investigasi/praktikum, bukan ditampilkan di UI agar data sensitif tidak terekspos.
- Perbaikan Admin Log: timezone pool MariaDB diselaraskan ke timezone lokal WIB (`timezone: 'local'`).
- HTTPS lokal frontend ditambahkan tanpa layanan pihak ketiga: CA dan sertifikat web terpisah dibuat di `web/ssl/` dengan SAN `localhost`/`127.0.0.1`, Vite otomatis memakai `https` bila sertifikat tersedia, dan private key/sertifikat dikecualikan dari Git.
- Dashboard Admin Log sekarang menerima audit log baru secara real-time melalui SSE native (`/admin/audit/logs/stream`) tanpa dependency tambahan; koneksi dibersihkan saat halaman ditutup.
- Hardening database (Modul X) diterapkan pada MariaDB 13.0.2:
  - Akun tidak terpakai dibersihkan: tidak ada user anonim (`User = ''`), `plain_user@'%'` sisa praktikum SSL dihapus, dan database `test` tidak ada.
  - Akun `root` dibatasi ke `localhost` (tidak ada `root@'%'`).
  - Password policy memakai plugin bawaan MariaDB `simple_password_check` (padanan `validate_password` milik MySQL): minimal 8 karakter, wajib angka, huruf besar/kecil, dan karakter khusus. Plugin `ACTIVE` dan nilainya bertahan setelah restart karena ditulis di `[mysqld]`.
  - `max_connections` diturunkan dari 151 menjadi 50.
  - `bind-address = 127.0.0.1` dipindahkan ke `[mysqld]`; server hanya listen di `127.0.0.1:3308` sehingga akses remote ditolak.
  - Port tetap non-default `3308`.
  - Catatan kompatibilitas MariaDB: `validate_password` tidak tersedia (`ERROR 1193`), dan `UPDATE mysql.user` gagal karena `mysql.user` berupa view sejak MariaDB 10.4 (`ERROR 1288`) sehingga dipakai `RENAME USER`.
  - `PUBLIC` adalah role bawaan MariaDB (bukan user anonim) sehingga tidak dihapus; `mysql_old_password` bersifat built-in dan tidak dipakai akun mana pun.
  - Opsi di luar cakupan modul (`local_infile`, `skip_name_resolve`) sengaja dibiarkan pada nilai default.

## Hardening Hasil Pentest (Black-Box)

- **H1 — Spoofing IP audit trail:** pemakaian `X-Forwarded-For` mentah diganti `req.ip` (hasil `trust proxy 'loopback'`) di `auth.controller.ts`, sehingga IP pada `audit_logs` tidak dapat dipalsukan klien; hanya proxy loopback (Vite) yang dipercaya.
- **M1 — User enumeration:** pada login, cek `is_active`/`locked_until` dipindah ke **setelah** verifikasi password (`auth.service.ts`). `checkForgotPassword` kini mengembalikan `403 ACCOUNT_LOST_NO_PIN` tunggal untuk kondisi tidak ada/nonaktif/terkunci/portal salah/belum punya PIN; `resetForgotPassword` mengembalikan `400 INVALID_RECOVERY_CREDENTIALS` generik untuk semua kegagalan pra-verifikasi, dengan `SAME_PASSWORD`/`VALIDATION_ERROR` hanya muncul setelah kredensial pemulihan valid.
- **M2 — Privilege escalation kasir:** `AdminService.updateUserStatus` menolak role selain `admin` dengan `403 FORBIDDEN`, karena permission `user:manage` pada kasir hanya untuk mengelola pelanggan.
- **M3 — Webhook pembayaran lemah:** signature HMAC-SHA256 kini memakai `PAYMENT_WEBHOOK_SECRET` (min. 32 karakter, wajib) alih-alih secret hardcoded, dibandingkan dengan `crypto.timingSafeEqual` yang aman panjang, dan endpoint `/payments/webhook` diberi rate limiter khusus (60/menit).
- **L1 — Information disclosure:** `app.disable('x-powered-by')` menghapus header `X-Powered-By`.
- **L3 — CORS terlalu luas:** allowlist eksplisit `FRONTEND_URL` + `CORS_ALLOWED_ORIGINS`; origin localhost/rentang LAN privat hanya diizinkan bila `CORS_ALLOW_LAN_ORIGINS=true` (default `false`, diaktifkan di `.env` lokal untuk akses LAN rekan).
- **L4 — CSP longgar:** `connect-src` dibatasi `'self'` di produksi; skema `http/https/ws/wss` hanya di dev.
- **L5 — Kebocoran memori lockout:** `ProgressiveLockoutService` menambah `lastAttempt` dan membersihkan seluruh entri non-permanen yang basi (24 jam tanpa aktivitas, atau 2 jam setelah kunci berakhir); entri blokir permanen tetap dipertahankan.
- Variabel `.env` baru: `PAYMENT_WEBHOOK_SECRET`, `CORS_ALLOWED_ORIGINS`, `CORS_ALLOW_LAN_ORIGINS`; `scripts/setup-db.sh`, `.env.example`, `SECURITY.md`, `README.md`, dan `API.md` disinkronkan.

## Brute Force Login Hardening

- **Lockout per-akun (lintas IP)** diaktifkan saat login gagal: `AuthService.login` kini memanggil `userRepo.recordFailedLogin` sehingga distributed attack ke satu akun tetap terkunci, bukan hanya penyerang di satu IP.
- **Backoff bertingkat, tanpa blokir permanen** (`backend/src/utils/lockout.ts`): 5 gagal → 15 menit, lalu 30 → 60 → 120 → maksimal 240 menit. Menghindari akun asli terkunci selamanya oleh penyerang.
- **State lockout dipindah ke database**: `ProgressiveLockoutService` tidak lagi memakai `Map` in-memory, melainkan tabel `login_attempts` (migrasi `015_login_attempts.sql`) sehingga tahan restart dan konsisten lintas proses. Entri basi dibersihkan otomatis.
- **Notifikasi pemilik**: saat akun terkunci, dibuat notifikasi in-app bertipe `security` ("Percobaan Login Mencurigakan") tanpa layanan SMS/email/OTP eksternal. `notifications.type` diperluas ke `ENUM('order','payment','security')`.
- Test diperbarui: skenario distributed attack (5 IP berbeda) tetap mengunci akun, sementara akun lain tetap bisa login; serta uji backoff bertingkat (15/30/60/120/240) tanpa status permanen.
- PoC live: 5 login gagal dari 5 IP berbeda → akun terkunci (`users.locked_until` terisi, `login_attempts` mencatat per IP), percobaan ke-6 dengan password benar dari IP lain ditolak `423 ACCOUNT_LOCKED`, dan notifikasi `security` terbuat.

## Hardening Hasil Pentest Ronda 2 (Black-Box, N1–N12)

- **N1 — DoS lockout via pemulihan akun:** kegagalan `forgot/reset` tidak lagi memanggil `recordFailedLogin` per-akun. Pemulihan memakai lockout terpisah ber-namespace `recovery:{ip}:{username}` di tabel `login_attempts`, sehingga penyerang tidak bisa mengunci akun staff hanya dengan menebak PIN/jawaban pemulihan.
- **N2 — Reset counter sebelum MFA:** `AuthService.login` tidak lagi mereset `failed_login_count` dan lockout saat password benar bila akun masih punya MFA. Reset dilakukan hanya setelah `verifyMfa` sukses, mencegah brute-force PIN tanpa konsekuensi lockout.
- **N3 — Replay `mfa_token`:** `mfa_token` kini membawa klaim `jti` (UUID) dan ditandai sekali pakai secara atomik (`consumeMfaToken`, `INSERT IGNORE` pada `login_attempts`). Pemakaian kedua ditolak `401 INVALID_MFA_TOKEN`.
- **N4 — Enumerasi via `forgot/check`:** endpoint tidak lagi mengembalikan `username/role/has_pin/has_questions`; hanya `{ min_password_length }` yang diturunkan dari portal klien (`customer=8`, `staff=15`). Frontend (`useAuthFlow.ts`, `AuthFlowContent.tsx`) memakai `minResetLen` dari respons ini alih-alih menyimpulkan role.
- **N5 — Enumerasi via status lockout:** login yang terkunci (per-akun atau per IP+username) kini membalas `401 INVALID_CREDENTIALS` generik dengan pengaburan waktu (dummy `hashPassword`). Detail `423 ACCOUNT_LOCKED` hanya diberikan setelah password benar.
- **N6 — Access token hidup setelah ganti sandi:** access token membawa klaim `pv` (sha256 16 karakter dari `password_hash`). Middleware `authenticate` mengambil `password_hash` dan menolak token dengan `pv` tak cocok, sehingga token lama langsung gugur setelah ganti/reset password. Token legacy tanpa `pv` tetap diterima (kedaluwarsa ≤ 15 menit).
- **N7 — Spoofing `X-Forwarded-For`:** `trust proxy` dipindah dari hardcode `'loopback'` ke resolusi dari env `TRUST_PROXY`; default aman: produksi `false`, non-produksi `loopback`.
- **N8 — Overflow jumlah keranjang:** `quantity` dibatasi bilangan bulat 0–999 pada schema Zod (`cart.controller.ts`) dan validasi service (`cart.service.ts`), mencegah overflow integer di database.
- **N9 — Kebocoran field internal:** `SafeUser` dan `toSafeUser` berhenti mengembalikan `failed_login_count` dan `password_admin_compliant`.
- **N10 — Registrasi publik terbuka:** `POST /auth/register` awalnya digerbang `ALLOW_PUBLIC_REGISTRATION` (default `false`). Ronda 3 kemudian **menghapus total** rute/controller/skema-nya; akun pelanggan hanya dibuat oleh kasir/admin lewat `adminService.register` (`POST /admin/customers`).
- **N11 — Ekspos kode sumber/env dev server Vite:** dev server menyajikan kode sumber mentah dan `import.meta.env` (termasuk `VITE_STAFF_LOGIN_PATH`) bila diikat ke LAN. `frontend/vite.config.ts` menegaskan host default `127.0.0.1` dan menambah `server.fs.deny` untuk `.env*`, `*.pem`, `*.key`, `*.crt`, `*.p12`, dan `.git`. Ronda 3 memindahkan portal staff ke entri build terpisah agar jalurnya tidak ada di bundel publik. Kontrol sesungguhnya tetap RBAC di server.
- **N12 — Hitungan kegagalan tidak atomik:** `recordFailedLogin` memakai `failed_login_count = failed_login_count + 1` di database, lalu membaca ulang untuk menentukan lockout.
- Variabel `.env` baru: `TRUST_PROXY`; `.env.example`, `scripts/setup-db.sh`, `API.md`, dan `SECURITY.md` disinkronkan. Tanpa migrasi baru (tabel `login_attempts` dipakai ulang dengan prefix `attempt_key`).

### Ronda 3 — Tindak Lanjut N10 & N11

- **N10 — Hapus total endpoint registrasi publik:** rute `POST /auth/register` di `backend/src/routes/auth.routes.ts`, method `AuthController.register`, skema `registerSchema`/`phoneSchema`/`fullNameSchema`, dan env `ALLOW_PUBLIC_REGISTRATION` (termasuk di `backend/package.json`, `.env.example`, `scripts/setup-db.sh`) dihapus. Permintaan ke `/auth/register` kini `404`. `AuthService.register` tetap ada karena dipakai pembuatan pelanggan oleh kasir/admin. Test beralih memakai helper `createTestUser()` yang memanggil `AuthService.register` langsung, plus satu test baru yang memastikan endpoint lama `404`.
- **N11 — Portal staff di entri build terpisah (opsi C):** `frontend/staff.html` + `frontend/src/staff-main.tsx` menjadi entri Vite kedua (`build.rollupOptions.input`), memuat `AuthProvider` + `ToastProvider` + `BrowserRouter` + `StaffLoginPage`. Rute dan konstanta `VITE_STAFF_LOGIN_PATH` di `frontend/src/App.tsx` dihapus, sehingga `StaffLoginPage` tidak lagi ada di bundel publik. Plugin `sajiin-staff-entry` di `frontend/vite.config.ts` membaca `STAFF_LOGIN_PATH` sisi server (bukan `VITE_*`, via `loadEnv` prefix `''`) dan me-rewrite jalur rahasia → `/staff.html` pada `configureServer` dan `configurePreviewServer`; permintaan langsung ke `/staff.html` dibalas `404`. Setelah login staff, halaman melakukan muat ulang penuh ke dashboard sesuai role (`redirect` opsional di `useAuthFlow`).
- Verifikasi Ronda 3: build menghasilkan `dist/index.html` (hanya `main-*.js`) dan `dist/staff.html` (`staff-*.js`); `grep -r "sajiin-ops" frontend/dist/` kosong. Preview & dev diuji: jalur rahasia → `200` (mengembalikan `staff.html`/`staff-main.tsx`), `/staff.html` langsung → `404`, `/admin/dashboard` → `200` (fallback SPA ke `index.html`).

## Berikutnya

- [x] Pendaftaran pelanggan oleh kasir dengan password sementara ramah manusia (tanpa hardcode).
- [x] Upload bukti transfer lokal dan validasi kasir.
- [x] Tampilkan preview bukti transfer terotorisasi di halaman detail/dashboard kasir.
- [x] Pembersihan pustaka keamanan third-party backend ke native Express & Node.js.
- [x] Sanitasi input string anti-XSS dan deteksi replay attack refresh token.
- [x] Progressive Targeted Lockout (15m -> 30m -> 1 jam -> blokir permanen per IP + username).
- Perbarui migration/grant database untuk tiga role.
- Migrasi test dan helper JWT/OTP ke primitive native selesai.
- Jalankan seluruh security checklist setelah payment proof selesai.

## Verifikasi Terakhir

- Hardening database terverifikasi setelah `systemctl restart mariadb`: `max_connections = 50`, `bind_address = 127.0.0.1`, `port = 3308`, `simple_password_check` `ACTIVE` dengan nilai `8/1/1/1`, dan socket hanya `127.0.0.1:3308`.
- Enkripsi koneksi database SSL/TLS aktif: backend berhasil connect dengan `DB_SSL=true` dan ditolak saat `DB_SSL=false` (bukti `app_rw REQUIRE SSL` bekerja).
- Frontend lint, type-check, dan build lulus (`npm run lint && npm run type-check && npm run build`).
- Backend lint, type-check, dan seluruh 7 test suite (80 test) lulus (`npm run lint && npm run type-check && npm test`).
- Re-verifikasi PoC pentest pasca-perbaikan: header `X-Powered-By` hilang; `forgot/check` akun tak dikenal → `403 ACCOUNT_LOST_NO_PIN`; `forgot/reset` akun tak dikenal → `400 INVALID_RECOVERY_CREDENTIALS`; webhook signature palsu → `400 INVALID_SIGNATURE`; token kasir ke `PATCH /admin/users/:id` → `403 FORBIDDEN`.
- Ronda 2 (N1–N12) terverifikasi: `backend npm run lint/type-check/test` lulus (79 test, 7 suite — kini 80 test setelah Ronda 3) dan `frontend npm run lint/type-check/build` lulus. PoC live terhadap instance terpisah (`NODE_ENV=test`, `TRUST_PROXY=false`) 11/11 lulus: register `404`; `forgot/check` seragam `{min_password_length}` (8/15); lockout login `401` generik & `423` hanya setelah password benar; recovery gagal tidak mengunci login dan tidak menaikkan `failed_login_count`; replay `mfa_token` `401 INVALID_MFA_TOKEN`; salah PIN menaikkan counter 1→5 lalu `423`; `SafeUser` tanpa field internal; token lama `401` setelah ganti password; quantity `2147483648`/`1000` → `400` & `999` → `200`; 8 login paralel → `failed_login_count=8` (atomik); `X-Forwarded-For` diabaikan (`login_attempts` menyimpan `127.0.0.1:poc_xff`).
