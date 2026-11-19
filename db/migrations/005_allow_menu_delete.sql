-- 005_allow_menu_delete.sql
-- Admin menu delete tetap dikontrol RBAC/service; grant ini hanya membuka
-- DELETE pada tabel menu_items untuk akun aplikasi app_rw.

GRANT DELETE ON foodorder.menu_items TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
