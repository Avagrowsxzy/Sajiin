-- Admin membaca audit trail internal secara read-only; UPDATE/DELETE tetap ditolak trigger.
GRANT SELECT, INSERT ON foodorder.audit_logs TO 'app_rw'@'localhost', 'app_rw'@'127.0.0.1';
