-- core table migration
-- table: memos

CREATE TABLE IF NOT EXISTS memos (
  id VARCHAR(36) NOT NULL,
  memo_number VARCHAR(100) NULL,
  type VARCHAR(50) NOT NULL,
  invoice_id VARCHAR(36) NULL,
  customer_id VARCHAR(36) NULL,
  supplier_id VARCHAR(36) NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  reason TEXT NULL,
  notes TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  approval_notes TEXT NULL,
  approved_at DATETIME NULL,
  posted_at DATETIME NULL,
  approved_by VARCHAR(36) NULL,
  created_by VARCHAR(36) NULL,
  updated_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_memos_type (type),
  KEY idx_memos_status (status),
  KEY idx_memos_invoice (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
