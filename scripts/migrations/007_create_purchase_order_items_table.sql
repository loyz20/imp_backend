-- core table migration
-- table: purchase_order_items

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id VARCHAR(36) NOT NULL,
  purchase_order_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  satuan VARCHAR(50) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
  discount DECIMAL(18,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  received_qty INT NOT NULL DEFAULT 0,
  notes TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_poi_po (purchase_order_id),
  KEY idx_poi_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
