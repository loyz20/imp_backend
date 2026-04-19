-- core table migration
-- table: invoice_items

CREATE TABLE IF NOT EXISTS invoice_items (
  id VARCHAR(36) NOT NULL,
  invoice_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  satuan VARCHAR(50) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
  discount DECIMAL(18,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  batch_number VARCHAR(100) NULL,
  expiry_date DATETIME NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_invoice_items_invoice (invoice_id),
  KEY idx_invoice_items_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
