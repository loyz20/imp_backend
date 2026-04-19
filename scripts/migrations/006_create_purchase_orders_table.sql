-- core table migration
-- table: purchase_orders

CREATE TABLE IF NOT EXISTS purchase_orders (
  id VARCHAR(36) NOT NULL,
  po_number VARCHAR(100) NOT NULL,
  po_category VARCHAR(50) NOT NULL DEFAULT 'obat',
  supplier_id VARCHAR(36) NOT NULL,
  order_date DATETIME NOT NULL,
  expected_date DATETIME NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  ppn_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  ppn_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  remaining_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  payment_term_days INT NOT NULL DEFAULT 30,
  notes TEXT NULL,
  sent_at DATETIME NULL,
  created_by VARCHAR(36) NULL,
  updated_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_purchase_orders_number (po_number),
  KEY idx_purchase_orders_supplier (supplier_id),
  KEY idx_purchase_orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
