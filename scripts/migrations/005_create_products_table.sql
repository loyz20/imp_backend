-- core table migration
-- table: products

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(36) NOT NULL,
  code VARCHAR(100) NULL,
  sku VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  golongan VARCHAR(100) NOT NULL,
  satuan VARCHAR(50) NOT NULL,
  manufacturer VARCHAR(255) NULL,
  nie VARCHAR(100) NULL,
  barcode VARCHAR(100) NULL,
  zat_aktif VARCHAR(255) NULL,
  kemasan VARCHAR(100) NULL,
  harga_beli DECIMAL(18,2) NOT NULL DEFAULT 0,
  harga_jual DECIMAL(18,2) NOT NULL DEFAULT 0,
  stok_minimum INT NOT NULL DEFAULT 0,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(36) NULL,
  updated_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_sku (sku),
  KEY idx_products_name (name),
  KEY idx_products_category (category),
  KEY idx_products_golongan (golongan),
  KEY idx_products_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
