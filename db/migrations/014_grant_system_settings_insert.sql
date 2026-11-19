-- Migration 014: Grant INSERT on system_settings to app_rw so upsert (ON DUPLICATE KEY UPDATE) succeeds
GRANT SELECT, INSERT, UPDATE ON foodorder.system_settings TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
