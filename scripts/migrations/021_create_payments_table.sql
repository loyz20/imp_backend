-- core table migration
-- table: payments

CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(36) NOT NULL,
  payment_number VARCHAR(100) NULL,
  invoice_id VARCHAR(36) NULL,
  purchase_order_id VARCHAR(36) NULL,
  customer_id VARCHAR(36) NULL,
  supplier_id VARCHAR(36) NULL,
  type VARCHAR(50) NULL,
  source_type VARCHAR(100) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  payment_date DATETIME NOT NULL,
  payment_method VARCHAR(50) NULL,
  reference_number VARCHAR(100) NULL,
  bank_account VARCHAR(255) NULL,
  notes TEXT NULL,
  verification_notes TEXT NULL,
  verified_at DATETIME NULL,
  verified_by VARCHAR(36) NULL,
  created_by VARCHAR(36) NULL,
  updated_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_payments_invoice (invoice_id),
  KEY idx_payments_type (type),
  KEY idx_payments_status (status),
  KEY idx_payments_date (payment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
