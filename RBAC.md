# Matriks Akses Sajiin

| Resource | user | kasir | admin |
|---|---|---|---|
| Menu/kategori | R | R | CRUD |
| Pesanan sendiri | C/R/cancel pending | R/U status | R/U status |
| Pesanan semua | - | R/U status | R/U status |
| Pembayaran sendiri | C/R | - | - |
| Pembayaran semua | - | R/validasi/refund | R/refund |
| Bukti transfer | upload milik sendiri | R/validasi | R |
| User | profil sendiri | daftar pelanggan | CRUD/role |
| Konfigurasi toko | - | - | U |
| `audit_logs` | - | - | internal write melalui service |

Audit trail tidak diekspos sebagai role atau portal terpisah. Permission tetap ditegakkan middleware server.
