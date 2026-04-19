-- core table migration
-- table: journal_entry_lines

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id VARCHAR(36) NOT NULL,
  journal_entry_id VARCHAR(36) NOT NULL,
  account_id VARCHAR(36) NOT NULL,
  debit DECIMAL(18,2) NOT NULL DEFAULT 0,
  credit DECIMAL(18,2) NOT NULL DEFAULT 0,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_jel_entry (journal_entry_id),
  KEY idx_jel_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
