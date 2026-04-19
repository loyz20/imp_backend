-- Add reporting code fields for customers
-- Supports customer integration/reporting identifiers

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS e_report_code VARCHAR(100) NULL AFTER phone,
  ADD COLUMN IF NOT EXISTS bpom_code VARCHAR(100) NULL AFTER e_report_code;

CREATE INDEX idx_customers_e_report_code ON customers (e_report_code);
CREATE INDEX idx_customers_bpom_code ON customers (bpom_code);
