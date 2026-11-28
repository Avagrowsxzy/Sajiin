# Sajiin

Sajiin adalah aplikasi pemesanan makanan takeaway dengan tiga role: `user`,
`kasir`, dan `admin`.

## Fitur

- Katalog makanan, kategori, stok, dan keranjang.
- Pesanan ambil sendiri.
- Pembayaran tunai atau transfer bank dengan validasi kasir.
- Dashboard kasir untuk pesanan dan pelanggan.
- Manajemen menu, pengguna, konfigurasi pembayaran, dan pengaturan oleh admin.
- Audit trail aplikasi append-only melalui tabel `audit_logs`.
- SSL/TLS terpisah untuk koneksi backend ke MariaDB.
- HTTPS lokal untuk frontend Vite menggunakan sertifikat buatan sendiri.

## Stack

- Backend: Node.js, TypeScript, Express, MySQL/MariaDB.
- Frontend: React, Vite, TypeScript, Tailwind CSS, dan CSS biasa.
- Database driver dan query: `mysql2` dengan query terparameterisasi.
- Security primitives: Node `node:crypto` dan validasi `zod`.

## Struktur penting

```text
backend/        REST API, service, repository, migration runner, dan test
frontend/       aplikasi React/Vite
db/migrations/  migration SQL berurutan
scripts/        setup dan backup database lokal
web/ssl/        sertifikat HTTPS lokal, tidak di-commit
db/ssl/         sertifikat SSL MariaDB, tidak di-commit
```

## Prasyarat

- Node.js dan npm.
- MariaDB atau MySQL lokal.
- OpenSSL jika ingin membuat sertifikat TLS lokal.

## Setup lokal

1. Clone repository dan masuk ke folder proyek:

   ```bash
   git clone https://github.com/Avagrowsxzy/Sajiin.git
   cd Sajiin
   ```

2. Siapkan database dan konfigurasi lokal. Cara termudah jika tersedia akun root
   MariaDB/MySQL:

   ```bash
   bash scripts/setup-db.sh
   ```

   Script membuat database lokal, akun database, kredensial acak, `.env`,
   menjalankan migration dan seed, serta memverifikasi keamanan database.

   Alternatif manual:

   ```bash
   cp .env.example .env
   ```

   Lalu isi credential database, `JWT_SECRET`, `FIELD_ENCRYPTION_KEY`, dan
   `PAYMENT_WEBHOOK_SECRET` (minimal 32 karakter, mis. `openssl rand -hex 32`)
   pada `.env` sendiri. Sesuaikan `CORS_ALLOWED_ORIGINS` bila frontend diakses
   dari origin lain, dan set `CORS_ALLOW_LAN_ORIGINS=true` hanya bila perlu akses LAN.
   Registrasi publik (`POST /auth/register`) sudah dihapus total dan kepercayaan
   header proxy mati secara default (`TRUST_PROXY` kosong); set `TRUST_PROXY`
   hanya bila backend benar-benar berada di belakang reverse proxy tepercaya.

3. Pasang dependency backend dan frontend:

   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

4. Jalankan backend pada terminal pertama:

   ```bash
   cd backend
   npm run dev
   ```

5. Jalankan frontend pada terminal kedua:

   ```bash
   cd frontend
   npm run dev
   ```

   Jika sertifikat web lokal tersedia di `web/ssl/`, Vite memakai:

   ```text
   https://localhost:5173
   ```

   Jika belum ada sertifikat, Vite tetap dapat berjalan dengan HTTP. Sertifikat
   dan private key lokal tidak boleh di-commit ke repository.

## Database dan TLS

Migration berada di `db/migrations/` dan harus diterapkan sesuai urutan.
Koneksi backend ke MariaDB dapat menggunakan SSL/TLS melalui konfigurasi
`DB_SSL` dan `DB_SSL_CA` pada `.env`.

HTTPS frontend dan SSL database adalah dua konfigurasi berbeda:

```text
Browser -- HTTPS --> Vite frontend -- HTTP lokal --> Express backend
Express backend -- SSL/TLS --> MariaDB
```

## Akun development

Jangan menyimpan password akun di repository. Akun admin dibuat oleh proses
setup lokal/seed. Password sementara harus dibaca dari konfigurasi lokal dan
segera diganti saat login pertama.

Akun pelanggan dibuat oleh kasir/admin melalui halaman pelanggan (tidak ada
pendaftaran mandiri publik). Akun kasir dikelola oleh admin melalui aplikasi
atau script setup lokal sesuai kebutuhan.

Portal login Kasir & Admin berada di entri build terpisah dan hanya dibuka
lewat jalur rahasia yang diatur sisi server oleh `STAFF_LOGIN_PATH` (lihat
`frontend/.env.example`). Jalur ini tidak ikut terkirim ke browser dan tidak
dapat ditemukan dari bundel publik.

## Verifikasi

Jalankan sebelum membuat Pull Request:

```bash
cd backend
npm run lint
npm run type-check
npm test

cd ../frontend
npm run lint
npm run type-check
npm run build
```

## Keamanan repository

Jangan commit atau upload:

- `.env` dan `frontend/.env.local`.
- Password, token, secret JWT, atau encryption key.
- Private key dan sertifikat dari `db/ssl/` atau `web/ssl/`.
- Backup database di `backups/`.
- Bukti pembayaran di `backend/uploads/`.
- `node_modules/` dan hasil build.

Gunakan `.env.example` dan `frontend/.env.example` sebagai template aman.

## Alur kontribusi

Gunakan branch fitur, bukan langsung mengubah `main`:

```bash
git checkout main
git pull origin main
git checkout -b feature/nama-fitur
```

Setelah selesai, jalankan verifikasi, commit, push branch, lalu buat Pull
Request ke `main` untuk direview.
