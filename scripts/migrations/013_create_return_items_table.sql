-- core table migration
-- table: return_items

CREATE TABLE IF NOT EXISTS return_items (
  id VARCHAR(36) NOT NULL,
  return_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  batch_number VARCHAR(100) NULL,
  quantity_returned INT NOT NULL DEFAULT 0,
  `condition` VARCHAR(50) NULL,
  disposition VARCHAR(50) NULL,
  reason TEXT NULL,
  expiry_date DATETIME NULL,
  notes TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_return_items_return (return_id),
  KEY idx_return_items_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
