# Roadmap Sajiin

- [x] Database inti, constraint, trigger audit trail, dan least privilege.
- [x] Auth, refresh token, MFA, RBAC, menu, order, dan cart.
- [x] UI user, kasir, dan admin.
- [x] Dashboard kasir khusus hari berjalan.
- [x] Pendaftaran pelanggan oleh kasir.
- [x] Reset/migrasi hash akun admin dan kasir ke format scrypt native.
- [x] Nomor telepon unik dengan blind index HMAC dan normalisasi format.
- [x] Hapus tabel dan alur alamat pengiriman; sistem hanya takeaway.
- [x] Upload bukti transfer lokal dengan validasi MIME/ukuran.
- [x] Nomor rekening tujuan tampil sebelum order transfer dibuat.
- [x] Validasi transfer wajib memiliki bukti sebelum kasir mengonfirmasi.
- [ ] Validasi tunai dan transfer dari dashboard kasir.
- [ ] Migrasi hash kredensial lama ke format scrypt native.
- [ ] Migrasi test agar tidak memakai library JWT/OTP eksternal.
- [ ] Perbarui migrasi/grant database agar tidak membuat role `audit` atau user `audit_ro` baru.
- [ ] Tambahkan test upload bukti dan validasi payment.
