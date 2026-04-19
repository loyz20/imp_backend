-- Align products table with current Product service/model fields
-- Safe to run multiple times on MySQL/MariaDB that supports ADD COLUMN IF NOT EXISTS

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS no_bpom VARCHAR(100) NULL AFTER nie,
  ADD COLUMN IF NOT EXISTS bentuk_sediaan VARCHAR(100) NULL AFTER no_bpom,
  ADD COLUMN IF NOT EXISTS satuan_kecil VARCHAR(50) NULL AFTER satuan,
  ADD COLUMN IF NOT EXISTS isi_per_satuan INT NULL AFTER satuan_kecil,
  ADD COLUMN IF NOT EXISTS ppn TINYINT(1) NOT NULL DEFAULT 1 AFTER isi_per_satuan,
  ADD COLUMN IF NOT EXISTS keterangan TEXT NULL AFTER manufacturer;

-- Backfill keterangan from legacy notes if available
UPDATE products
SET keterangan = COALESCE(keterangan, notes)
WHERE (keterangan IS NULL OR keterangan = '')
  AND notes IS NOT NULL
  AND notes <> '';
