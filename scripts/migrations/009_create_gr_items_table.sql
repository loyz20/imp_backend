-- core table migration
-- table: gr_items

CREATE TABLE IF NOT EXISTS gr_items (
  id VARCHAR(36) NOT NULL,
  goods_receiving_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  batch_number VARCHAR(100) NULL,
  expiry_date DATETIME NULL,
  manufacturing_date DATETIME NULL,
  received_qty INT NOT NULL DEFAULT 0,
  ordered_qty INT NOT NULL DEFAULT 0,
  unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
  discount DECIMAL(18,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  condition_status VARCHAR(50) NULL,
  notes TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_gr_items_gr (goods_receiving_id),
  KEY idx_gr_items_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
