-- core table migration
-- table: returns

CREATE TABLE IF NOT EXISTS returns (
  id VARCHAR(36) NOT NULL,
  return_number VARCHAR(100) NOT NULL,
  return_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  customer_id VARCHAR(36) NULL,
  supplier_id VARCHAR(36) NULL,
  sales_order_id VARCHAR(36) NULL,
  return_date DATETIME NOT NULL,
  reason TEXT NULL,
  notes TEXT NULL,
  approved_at DATETIME NULL,
  received_at DATETIME NULL,
  inspected_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_by VARCHAR(36) NULL,
  updated_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_returns_number (return_number),
  KEY idx_returns_type (return_type),
  KEY idx_returns_status (status),
  KEY idx_returns_customer (customer_id),
  KEY idx_returns_supplier (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
