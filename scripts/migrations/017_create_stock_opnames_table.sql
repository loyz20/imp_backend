-- core table migration
-- table: stock_opnames

CREATE TABLE IF NOT EXISTS stock_opnames (
  id VARCHAR(36) NOT NULL,
  opname_number VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  opname_date DATETIME NOT NULL,
  scope VARCHAR(50) NOT NULL,
  notes TEXT NULL,
  assigned_to VARCHAR(36) NULL,
  verified_by VARCHAR(36) NULL,
  total_items INT NOT NULL DEFAULT 0,
  matched_items INT NOT NULL DEFAULT 0,
  discrepancy_items INT NOT NULL DEFAULT 0,
  total_discrepancy_qty INT NOT NULL DEFAULT 0,
  completed_at DATETIME NULL,
  created_by VARCHAR(36) NULL,
  updated_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_opnames_number (opname_number),
  KEY idx_stock_opnames_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
