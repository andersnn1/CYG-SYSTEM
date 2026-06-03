CREATE TABLE IF NOT EXISTS combos (
  id           SERIAL PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  fixed_price  NUMERIC(10,2),
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS combo_items (
  id           SERIAL PRIMARY KEY,
  combo_id     INTEGER NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL,
  product_type TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity     INTEGER NOT NULL DEFAULT 1,
  unit_price   NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_combo_items_combo_id ON combo_items(combo_id);
