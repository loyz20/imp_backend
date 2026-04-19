-- core table migration
-- table: stock_mutations

CREATE TABLE IF NOT EXISTS stock_mutations (
  id VARCHAR(36) NOT NULL,
  mutation_date DATETIME NOT NULL,
  type VARCHAR(50) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  batch_id VARCHAR(36) NULL,
  batch_number VARCHAR(100) NULL,
  quantity INT NOT NULL,
  balance_before INT NOT NULL DEFAULT 0,
  balance_after INT NOT NULL DEFAULT 0,
  reference_type VARCHAR(50) NULL,
  reference_id VARCHAR(36) NULL,
  reference_number VARCHAR(100) NULL,
  reason TEXT NULL,
  notes TEXT NULL,
  created_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_stock_mutations_product (product_id),
  KEY idx_stock_mutations_type (type),
  KEY idx_stock_mutations_date (mutation_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
