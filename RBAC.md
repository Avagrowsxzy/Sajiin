# Matriks Akses Sajiin

| Resource | user | kasir | admin |
|---|---|---|---|
| Menu/kategori (publik) | R | R | R |
| Katalog admin (`/admin/menu`, `/admin/categories`) | - | - | R (`menu:read:all`) |
| Pesanan sendiri | C/R/cancel pending | R/U status | R/U status |
| Pesanan semua | - | R/U status | R/U status |
| Pembayaran sendiri | C/R | - | - |
| Pembayaran semua | - | R/validasi/refund | R/refund |
| Bukti transfer | upload milik sendiri | R/validasi | R |
| User | profil sendiri | daftar pelanggan | CRUD/role |
| Konfigurasi toko | - | - | U |
| `audit_logs` | - | - | internal write melalui service |

Baca katalog publik memakai permission `menu:read` (tanpa autentikasi). Baca katalog versi admin (yang memuat field internal seperti `created_by` dan item nonaktif) memakai permission khusus `menu:read:all` yang hanya dimiliki `admin`, sehingga role `user`/`kasir` tidak bisa membacanya lewat `/admin/menu`. Tulis katalog tetap `menu:write`/`category:write`.

Audit trail tidak diekspos sebagai role atau portal terpisah. Permission tetap ditegakkan middleware server.
