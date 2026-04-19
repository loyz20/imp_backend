-- Align purchase_orders table with current service field names
-- Legacy columns: expected_date, ppn_amount
-- Current service columns: expected_delivery_date, tax_amount

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS expected_delivery_date DATETIME NULL AFTER order_date,
  ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0 AFTER subtotal;

-- Backfill values from legacy columns when needed
UPDATE purchase_orders
SET expected_delivery_date = COALESCE(expected_delivery_date, expected_date)
WHERE expected_delivery_date IS NULL
  AND expected_date IS NOT NULL;

UPDATE purchase_orders
SET tax_amount = COALESCE(NULLIF(tax_amount, 0), ppn_amount, 0)
WHERE tax_amount IS NULL
   OR tax_amount = 0;
