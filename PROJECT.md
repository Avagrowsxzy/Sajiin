# Profil Sajiin

## Role

Akun login menggunakan username unik yang dibuat oleh kasir/admin, bukan email.

| Role | Fungsi |
|---|---|
| `user` | Melihat menu, membuat pesanan, membayar tunai/transfer, dan melihat pesanan sendiri |
| `kasir` | Melihat antrian, memvalidasi tunai/bukti transfer, dan mengubah status pesanan |
| `admin` | Mengelola menu, kategori, pengguna, konfigurasi pembayaran, pesanan, dan operasi toko |

`audit_logs` adalah jejak keamanan internal append-only. Tidak ada lagi portal atau role `audit`.

## Alur Pembayaran

1. User checkout dengan metode `tunai` atau `transfer`.
2. Tunai menunggu penerimaan kasir.
3. Transfer menunggu unggahan bukti dan validasi kasir.
4. Kasir memvalidasi pembayaran setelah memeriksa rekening/bukti nyata.
5. Sistem mengubah payment menjadi `settled` dan order menjadi `paid` dalam transaksi.

QRIS tidak didukung. Pembayaran hanya tunai dan transfer bank.

Alamat pengiriman tidak digunakan karena semua pesanan menggunakan model ambil sendiri/takeaway.

## Keamanan

Tidak ada login pihak ketiga atau payment gateway. PIN keamanan sekunder dapat diaktifkan untuk semua role. Primitive kriptografi berasal dari Node `node:crypto`; audit trail tetap dicatat di database.
