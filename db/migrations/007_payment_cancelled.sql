-- 007_payment_cancelled.sql
-- Payment yang terkait order dibatalkan sebelum settlement memiliki status
-- cancelled, sehingga tidak terlihat menggantung sebagai pending.

ALTER TABLE foodorder.payments
  MODIFY COLUMN status ENUM('pending','settled','failed','refunded','cancelled')
  NOT NULL DEFAULT 'pending';
