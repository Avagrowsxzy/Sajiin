# Panduan Proyek Sajiin

Sajiin adalah aplikasi pemesanan makanan takeaway dengan tiga role aplikasi: `user`, `kasir`, dan `admin`.

## Aturan Utama

- Backend: Node.js, TypeScript, Express, MySQL, dan Zod.
- Frontend: React, Vite, TypeScript, Tailwind CSS, CSS biasa, dan React Router.
- Keamanan aplikasi tidak memakai OAuth, Google Login, payment gateway, cloud storage, atau service OTP eksternal.
- Password, token, TOTP, HMAC, UUID, AES-256-GCM, dan scrypt memakai `node:crypto`.
- Semua aksi penting tetap dicatat ke `audit_logs` append-only sebagai audit trail internal, bukan sebagai role pengguna.
- Semua query SQL harus parameterized.
- Otorisasi wajib di server; frontend hanya membantu UX.
- Jangan mengembalikan password hash, secret MFA, token hash, atau bukti transfer tanpa otorisasi.
- Pembayaran yang didukung: tunai dan transfer bank. Transfer divalidasi kasir setelah pengguna mengunggah bukti.
- Jangan mengubah API, database, atau alur bisnis tanpa memperbarui dokumen terkait.

## Struktur

- `backend/`: REST API, repository, service, middleware, migrasi, dan test.
- `frontend/`: UI user, kasir, dan admin.
- `db/migrations/`: migrasi SQL berurutan.
- `PROGRES.md`: catatan implementasi aktual.

## Verifikasi

```bash
cd backend && npm run lint && npm run type-check && npm test
cd ../frontend && npm run lint && npm run type-check && npm run build
```
