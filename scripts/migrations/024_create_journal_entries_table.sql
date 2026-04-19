-- core table migration
-- table: journal_entries

CREATE TABLE IF NOT EXISTS journal_entries (
  id VARCHAR(36) NOT NULL,
  journal_number VARCHAR(100) NOT NULL,
  date DATETIME NOT NULL,
  description TEXT NULL,
  source VARCHAR(50) NULL,
  source_id VARCHAR(36) NULL,
  source_number VARCHAR(100) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'posted',
  approved_at DATETIME NULL,
  approved_by VARCHAR(36) NULL,
  approval_notes TEXT NULL,
  created_by VARCHAR(36) NULL,
  updated_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_journal_entries_number (journal_number),
  KEY idx_journal_entries_date (date),
  KEY idx_journal_entries_status (status),
  KEY idx_journal_entries_source (source, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
