-- core table migration
-- table: bank_transactions

CREATE TABLE IF NOT EXISTS bank_transactions (
  id VARCHAR(36) NOT NULL,
  transaction_date DATETIME NOT NULL,
  date DATETIME NULL,
  type VARCHAR(50) NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  description TEXT NULL,
  reference VARCHAR(100) NULL,
  reference_number VARCHAR(100) NULL,
  bank_account VARCHAR(255) NULL,
  match_status VARCHAR(50) NULL,
  matched_payment_id VARCHAR(36) NULL,
  created_by VARCHAR(36) NULL,
  updated_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_bank_transactions_date (transaction_date),
  KEY idx_bank_transactions_match (match_status),
  KEY idx_bank_transactions_ref (reference_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
