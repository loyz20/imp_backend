-- Add missing bank account columns for customers
-- Align schema with customer service payload

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100) NULL AFTER credit_limit,
  ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(100) NULL AFTER bank_name,
  ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(150) NULL AFTER bank_account_number;
