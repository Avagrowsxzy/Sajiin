INSERT INTO system_settings (`key`, `value`)
VALUES
  ('payment_bank_name', 'BCA'),
  ('payment_account_number', '1234567890'),
  ('payment_account_name', 'Sajiin')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);
