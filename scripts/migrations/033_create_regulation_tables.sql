-- regulation module migration
-- tables: surat_pesanan_khusus, sp_items, e_reports, e_report_items, regulation_documents

CREATE TABLE IF NOT EXISTS surat_pesanan_khusus (
  id VARCHAR(36) NOT NULL,
  sp_number VARCHAR(100) NOT NULL,
  date DATETIME NOT NULL,
  type VARCHAR(50) NOT NULL,
  supplier_id VARCHAR(36) NOT NULL,
  valid_until DATETIME NOT NULL,
  status VARCHAR(50) NOT NULL,
  notes TEXT NULL,
  reject_reason TEXT NULL,
  created_by VARCHAR(36) NULL,
  approved_by VARCHAR(36) NULL,
  approved_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sp_sp_number (sp_number),
  KEY idx_sp_type (type),
  KEY idx_sp_status (status),
  KEY idx_sp_supplier_id (supplier_id),
  KEY idx_sp_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS sp_items (
  id VARCHAR(36) NOT NULL,
  sp_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  qty DECIMAL(18,2) NOT NULL DEFAULT 0,
  unit VARCHAR(50) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_sp_items_sp_id (sp_id),
  KEY idx_sp_items_product_id (product_id),
  KEY idx_sp_items_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS e_reports (
  id VARCHAR(36) NOT NULL,
  report_number VARCHAR(100) NOT NULL,
  period VARCHAR(20) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  reject_reason TEXT NULL,
  created_by VARCHAR(36) NULL,
  submitted_by VARCHAR(36) NULL,
  submitted_at DATETIME NULL,
  received_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_e_reports_period_type (period, type),
  KEY idx_e_reports_status (status),
  KEY idx_e_reports_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS e_report_items (
  id VARCHAR(36) NOT NULL,
  report_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NULL,
  product_name VARCHAR(255) NOT NULL,
  qty_in DECIMAL(18,2) NOT NULL DEFAULT 0,
  qty_out DECIMAL(18,2) NOT NULL DEFAULT 0,
  stock_end DECIMAL(18,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_e_report_items_report_id (report_id),
  KEY idx_e_report_items_product_id (product_id),
  KEY idx_e_report_items_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS regulation_documents (
  id VARCHAR(36) NOT NULL,
  category VARCHAR(50) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  file_name VARCHAR(255) NULL,
  file_path VARCHAR(500) NULL,
  uploaded_at DATETIME NULL,
  updated_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_regulation_documents_category_type (category, type),
  KEY idx_regulation_documents_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
