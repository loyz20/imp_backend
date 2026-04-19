-- migration: prevent truncation of aggregated sales order ids on invoices
-- invoices.sales_order_id stores either a single UUID or JSON array of UUIDs

ALTER TABLE invoices
  MODIFY COLUMN sales_order_id TEXT NULL;
