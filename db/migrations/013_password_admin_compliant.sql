-- Migration 013: Track whether user's current password meets 15-char admin/kasir policy
ALTER TABLE users ADD COLUMN password_admin_compliant TINYINT(1) NOT NULL DEFAULT 0 AFTER security_answers_hash;
