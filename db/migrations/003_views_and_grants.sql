-- Migration 003: Views and Permissions (GRANT)
-- View legacy ter-mask; audit trail tetap internal, tanpa role audit aplikasi.

CREATE OR REPLACE VIEW v_users_masked AS
SELECT id, role_id, full_name,
       CONCAT(LEFT(email, 1), '***', SUBSTRING(email, LOCATE('@', email))) AS email_masked,
       is_active, created_at
FROM users;

-- Hak akses akun app_rw (tanpa DROP/ALTER/CREATE/TRIGGER)
GRANT SELECT                         ON foodorder.roles         TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE         ON foodorder.users         TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON foodorder.refresh_tokens TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON foodorder.addresses     TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON foodorder.categories    TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE         ON foodorder.menu_items    TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE         ON foodorder.carts         TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON foodorder.cart_items    TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE         ON foodorder.orders        TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
GRANT SELECT, INSERT                 ON foodorder.order_items   TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE         ON foodorder.payments      TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
GRANT INSERT                         ON foodorder.audit_logs    TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
