-- core table migration
-- table: stock_opname_items

CREATE TABLE IF NOT EXISTS stock_opname_items (
  id VARCHAR(36) NOT NULL,
  opname_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  batch_id VARCHAR(36) NOT NULL,
  batch_number VARCHAR(100) NULL,
  expiry_date DATETIME NULL,
  system_qty INT NOT NULL DEFAULT 0,
  actual_qty INT NULL,
  difference INT NULL,
  notes TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_soi_opname (opname_id),
  KEY idx_soi_product (product_id),
  KEY idx_soi_batch (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
