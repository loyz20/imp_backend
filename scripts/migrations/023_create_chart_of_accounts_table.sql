-- core table migration
-- table: chart_of_accounts

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id VARCHAR(36) NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  parent_id VARCHAR(36) NULL,
  level INT NOT NULL DEFAULT 0,
  description TEXT NULL,
  balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coa_code (code),
  KEY idx_coa_category (category),
  KEY idx_coa_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Default Chart of Accounts (idempotent)
INSERT IGNORE INTO chart_of_accounts (id, code, name, category, level, parent_id, description, balance, is_active, created_at, updated_at)
VALUES
  (UUID(), '1000', 'Aset', 'asset', 0, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '2000', 'Kewajiban', 'liability', 0, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '3000', 'Ekuitas', 'equity', 0, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '4000', 'Pendapatan', 'revenue', 0, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '5000', 'Beban', 'expense', 0, NULL, NULL, 0, 1, NOW(), NOW()),

  (UUID(), '1100', 'Kas & Bank', 'asset', 1, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '1200', 'Piutang Usaha', 'asset', 1, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '1300', 'Persediaan', 'asset', 1, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '1400', 'Pajak Dibayar Dimuka', 'asset', 1, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '2100', 'Hutang Usaha', 'liability', 1, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '2110', 'PPN Keluaran', 'liability', 1, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '3100', 'Modal Disetor', 'equity', 1, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '3200', 'Laba Ditahan', 'equity', 1, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '4100', 'Pendapatan Penjualan', 'revenue', 1, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '4200', 'Pendapatan Lainnya', 'revenue', 1, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '5100', 'Harga Pokok Penjualan', 'expense', 1, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '5200', 'Beban Operasional', 'expense', 1, NULL, NULL, 0, 1, NOW(), NOW()),

  (UUID(), '1110', 'Kas', 'asset', 2, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '1120', 'Bank', 'asset', 2, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '1210', 'Piutang Dagang', 'asset', 2, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '1410', 'PPN Masukan', 'asset', 2, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '5210', 'Beban Gaji', 'expense', 2, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '5220', 'Beban Sewa', 'expense', 2, NULL, NULL, 0, 1, NOW(), NOW()),
  (UUID(), '5230', 'Beban Utilitas', 'expense', 2, NULL, NULL, 0, 1, NOW(), NOW());

-- Ensure parent_id hierarchy by account code
UPDATE chart_of_accounts child
JOIN chart_of_accounts parent ON parent.code = '1000'
SET child.parent_id = parent.id
WHERE child.code IN ('1100', '1200', '1300', '1400');

UPDATE chart_of_accounts child
JOIN chart_of_accounts parent ON parent.code = '2000'
SET child.parent_id = parent.id
WHERE child.code IN ('2100', '2110');

UPDATE chart_of_accounts child
JOIN chart_of_accounts parent ON parent.code = '3000'
SET child.parent_id = parent.id
WHERE child.code IN ('3100', '3200');

UPDATE chart_of_accounts child
JOIN chart_of_accounts parent ON parent.code = '4000'
SET child.parent_id = parent.id
WHERE child.code IN ('4100', '4200');

UPDATE chart_of_accounts child
JOIN chart_of_accounts parent ON parent.code = '5000'
SET child.parent_id = parent.id
WHERE child.code IN ('5100', '5200');

UPDATE chart_of_accounts child
JOIN chart_of_accounts parent ON parent.code = '1100'
SET child.parent_id = parent.id
WHERE child.code IN ('1110', '1120');

UPDATE chart_of_accounts child
JOIN chart_of_accounts parent ON parent.code = '1200'
SET child.parent_id = parent.id
WHERE child.code IN ('1210');

UPDATE chart_of_accounts child
JOIN chart_of_accounts parent ON parent.code = '1400'
SET child.parent_id = parent.id
WHERE child.code IN ('1410');

UPDATE chart_of_accounts child
JOIN chart_of_accounts parent ON parent.code = '5200'
SET child.parent_id = parent.id
WHERE child.code IN ('5210', '5220', '5230');
