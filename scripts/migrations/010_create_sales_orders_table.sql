-- core table migration
-- table: sales_orders

CREATE TABLE IF NOT EXISTS sales_orders (
  id VARCHAR(36) NOT NULL,
  surat_jalan_number VARCHAR(100) NOT NULL,
  faktur_number VARCHAR(100) NULL,
  invoice_number VARCHAR(100) NULL,
  so_category VARCHAR(50) NOT NULL DEFAULT 'obat',
  customer_id VARCHAR(36) NOT NULL,
  order_date DATETIME NOT NULL,
  shipping_date DATETIME NULL,
  delivered_at DATETIME NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  shipping_address TEXT NULL,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  ppn_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  ppn_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  payment_term_days INT NOT NULL DEFAULT 30,
  notes TEXT NULL,
  shipped_at DATETIME NULL,
  completed_at DATETIME NULL,
  returned_at DATETIME NULL,
  created_by VARCHAR(36) NULL,
  updated_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sales_orders_sj (surat_jalan_number),
  KEY idx_sales_orders_customer (customer_id),
  KEY idx_sales_orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
