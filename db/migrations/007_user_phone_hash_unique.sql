ALTER TABLE users
  ADD COLUMN phone_hash CHAR(64) NULL,
  ADD UNIQUE KEY uq_users_phone_hash (phone_hash);
