-- core table migration
-- table: sales_order_items

CREATE TABLE IF NOT EXISTS sales_order_items (
  id VARCHAR(36) NOT NULL,
  sales_order_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  satuan VARCHAR(50) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
  discount DECIMAL(18,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  batch_number VARCHAR(100) NULL,
  expiry_date DATETIME NULL,
  notes TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_soi_so (sales_order_id),
  KEY idx_soi_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
