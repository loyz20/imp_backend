-- core table migration
-- table: goods_receivings

CREATE TABLE IF NOT EXISTS goods_receivings (
  id VARCHAR(36) NOT NULL,
  gr_number VARCHAR(100) NOT NULL,
  invoice_number VARCHAR(100) NULL,
  delivery_note VARCHAR(100) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  supplier_id VARCHAR(36) NOT NULL,
  purchase_order_id VARCHAR(36) NULL,
  receiving_date DATETIME NOT NULL,
  received_by VARCHAR(36) NULL,
  verified_by VARCHAR(36) NULL,
  verified_at DATETIME NULL,
  verification_notes TEXT NULL,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  ppn_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  grand_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_by VARCHAR(36) NULL,
  updated_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_goods_receivings_number (gr_number),
  KEY idx_goods_receivings_supplier (supplier_id),
  KEY idx_goods_receivings_po (purchase_order_id),
  KEY idx_goods_receivings_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
