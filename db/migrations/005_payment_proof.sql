ALTER TABLE payments
  ADD COLUMN proof_path VARCHAR(255) NULL,
  ADD COLUMN proof_mime VARCHAR(80) NULL,
  ADD COLUMN proof_uploaded_at DATETIME(3) NULL;
