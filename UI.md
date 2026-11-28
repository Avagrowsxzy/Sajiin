# Panduan UI Sajiin

- Tema terang, bahasa Indonesia, CSS biasa dan Tailwind ringan.
- User memakai bottom navigation: Menu, Keranjang, Pesanan, Profil.
- Admin memakai sidebar: Dashboard, Menu & Kategori, Pengguna & Role.
- Admin memiliki halaman Pengaturan Pembayaran untuk data rekening transfer; setiap perubahan masuk audit trail.
- Kasir memakai sidebar: Dashboard Operasional, Pesanan, Pembayaran, Pelanggan.
- Katalog user: header pencarian, carousel makanan, bubble kategori, grid produk responsif.
- Dashboard kasir hanya menampilkan pesanan hari berjalan berdasarkan WIB dan kartu antrian.
- Dashboard admin menampilkan operasi toko, bukan portal audit.
- Pembayaran transfer menampilkan instruksi rekening dan upload bukti; kasir melihat serta memvalidasi.
- Semua halaman data memiliki loading, error, dan empty state.
- Aksi berisiko memakai dialog konfirmasi dan hasilnya memakai toast.
- Login pelanggan tetap lewat modal dari navbar; Kasir & Admin memakai portal terpisah yang berada di entri build sendiri (`staff.html`) dan hanya dapat dibuka lewat jalur rahasia sisi server `STAFF_LOGIN_PATH` (tanpa tautan publik, dan permintaan langsung ke `/staff.html` dibalas 404). Area `/admin` dan `/kasir` mengembalikan halaman 404 bila diakses tanpa hak, sehingga keberadaan portal staff tidak terbaca dari luar.
