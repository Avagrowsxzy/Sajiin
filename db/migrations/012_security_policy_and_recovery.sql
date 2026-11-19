-- Migration 012: Add security_answers_hash for 3 fixed recovery questions
ALTER TABLE users ADD COLUMN security_answers_hash VARCHAR(255) NULL AFTER security_pin_hash;
