DROP VIEW IF EXISTS v_users_masked;

UPDATE users SET email = SUBSTRING_INDEX(email, '@', 1) WHERE email LIKE '%@%';

ALTER TABLE users DROP INDEX uq_users_email;
ALTER TABLE users CHANGE COLUMN email username VARCHAR(60) NOT NULL;
ALTER TABLE users ADD UNIQUE KEY uq_users_username (username);
