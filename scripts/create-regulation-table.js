const config = require('../src/config');
const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS surat_pesanan_khusus (
      id VARCHAR(24) NOT NULL, sp_number VARCHAR(100) NULL, date DATETIME NULL,
      type VARCHAR(50) NOT NULL, supplier_id VARCHAR(24) NOT NULL,
      valid_until DATETIME NOT NULL, status VARCHAR(50) NOT NULL DEFAULT 'draft',
      notes TEXT NULL, reject_reason TEXT NULL,
      created_by VARCHAR(24) NULL, approved_by VARCHAR(24) NULL, approved_at DATETIME NULL,
      created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), UNIQUE KEY uq_sp_number (sp_number), KEY idx_spk_type (type), KEY idx_spk_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
  console.log('Table surat_pesanan_khusus created');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sp_items (
      id VARCHAR(24) NOT NULL, sp_id VARCHAR(24) NOT NULL,
      product_id VARCHAR(24) NOT NULL, qty INT NOT NULL DEFAULT 0, unit VARCHAR(50) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id), KEY idx_spi_sp (sp_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
  console.log('Table sp_items created');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS e_reports (
      id VARCHAR(24) NOT NULL, report_number VARCHAR(100) NULL,
      period VARCHAR(10) NOT NULL, type VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'draft',
      reject_reason TEXT NULL,
      created_by VARCHAR(24) NULL, submitted_by VARCHAR(24) NULL,
      submitted_at DATETIME NULL, received_at DATETIME NULL,
      created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), UNIQUE KEY uq_ereport_period_type (period, type), KEY idx_er_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
  console.log('Table e_reports created');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS e_report_items (
      id VARCHAR(24) NOT NULL, report_id VARCHAR(24) NOT NULL,
      product_id VARCHAR(24) NOT NULL, product_name VARCHAR(200) NULL,
      qty_in INT NOT NULL DEFAULT 0, qty_out INT NOT NULL DEFAULT 0, stock_end INT NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id), KEY idx_eri_report (report_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
  console.log('Table e_report_items created');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS regulation_documents (
      id VARCHAR(24) NOT NULL, category VARCHAR(50) NOT NULL, type VARCHAR(50) NOT NULL,
      number VARCHAR(100) NULL, issued_date DATETIME NULL, expiry_date DATETIME NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      file_name VARCHAR(500) NULL, file_path VARCHAR(500) NULL, holder VARCHAR(200) NULL,
      entity_id VARCHAR(24) NULL, entity_model VARCHAR(50) NULL, entity_name VARCHAR(200) NULL,
      updated_by VARCHAR(24) NULL, uploaded_at DATETIME NULL,
      created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), KEY idx_rd_category (category), KEY idx_rd_type (type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
  console.log('Table regulation_documents created');

  await pool.end();
})();
