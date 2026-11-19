# Sajiin

Aplikasi pemesanan makanan takeaway dengan role `user`, `kasir`, dan `admin`.

## Fitur

- Katalog makanan dan keranjang.
- Pesanan ambil sendiri.
- Pembayaran tunai atau transfer dengan validasi kasir.
- Dashboard kasir untuk pesanan hari berjalan.
- Manajemen menu, stok, pengguna, dan konfigurasi oleh admin.
- Audit trail internal append-only untuk keamanan.

## Stack

- Backend: Node.js, TypeScript, Express, MySQL.
- Frontend: React, Vite, TypeScript, Tailwind/CSS.
- Security primitives: Node `node:crypto`.

## Run

```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

Jangan commit `.env`, password database, token, atau bukti pembayaran.

## Setup Reviewer

1. Buat database MySQL/MariaDB dan user `migrator` serta `app_rw` sesuai `.env`.
2. Salin `.env.example` menjadi `.env`, lalu isi password database, `JWT_SECRET`, dan `FIELD_ENCRYPTION_KEY`.
3. Jalankan migrasi dari root project:
   ```bash
   cd backend
   npm install
   npm run migrate
   npm run seed
   npm run reset:kasir-password
   ```
4. Jalankan backend:
   ```bash
   npm run dev
   ```
5. Jalankan frontend pada terminal lain:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Akun seed:

- Admin: `admin` (kredensial awal diatur saat migrasi awal/seed).
- Kasir: `kasir` / `Kasir1234!` setelah menjalankan `npm run reset:kasir-password`.
- Pelanggan: dibuat dari menu **Daftar Pelanggan** oleh kasir.

Semua migrasi berurutan di `db/migrations/` perlu diterapkan. Sistem tidak memakai portal Audit; `audit_logs` tetap menjadi audit trail internal.
