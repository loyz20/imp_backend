-- core table migration
-- table: stock_batches

CREATE TABLE IF NOT EXISTS stock_batches (
  id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  batch_number VARCHAR(100) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  initial_quantity INT NOT NULL DEFAULT 0,
  expiry_date DATETIME NULL,
  manufacturing_date DATETIME NULL,
  received_date DATETIME NULL,
  storage_condition VARCHAR(100) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  goods_receiving_id VARCHAR(36) NULL,
  supplier_id VARCHAR(36) NULL,
  unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_stock_batches_product (product_id),
  KEY idx_stock_batches_batch (batch_number),
  KEY idx_stock_batches_status (status),
  KEY idx_stock_batches_expiry (expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
