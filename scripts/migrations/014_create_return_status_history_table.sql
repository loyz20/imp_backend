-- core table migration
-- table: return_status_history

CREATE TABLE IF NOT EXISTS return_status_history (
  id VARCHAR(36) NOT NULL,
  return_id VARCHAR(36) NOT NULL,
  status VARCHAR(50) NOT NULL,
  notes TEXT NULL,
  changed_by VARCHAR(36) NULL,
  date DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_rsh_return (return_id),
  KEY idx_rsh_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
