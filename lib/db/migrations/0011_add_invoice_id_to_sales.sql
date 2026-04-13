-- Add invoice_id to sales table to link sales generated from invoices
ALTER TABLE sales ADD COLUMN IF NOT EXISTS invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_invoice_id ON sales(invoice_id);
