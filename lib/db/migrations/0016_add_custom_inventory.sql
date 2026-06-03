-- Migration: 0016_add_custom_inventory
-- Implementa un sistema de categorías personalizadas con jerarquía correcta:
--   1. inventory_categories: entidad independiente (nombre único, color, descripción)
--   2. custom_inventory:     productos que referencian categorías por FK

CREATE TABLE IF NOT EXISTS "inventory_categories" (
  "id"          serial PRIMARY KEY NOT NULL,
  "name"        text NOT NULL UNIQUE,
  "color"       text NOT NULL DEFAULT 'slate',
  "description" text,
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "custom_inventory" (
  "id"           serial PRIMARY KEY NOT NULL,
  "category_id"  integer NOT NULL REFERENCES "inventory_categories"("id") ON DELETE RESTRICT,
  "name"         text NOT NULL,
  "sub_category" text,
  "brand"        text,
  "stock"        integer,
  "cost_price"   numeric(10, 2) NOT NULL,
  "sale_price"   numeric(10, 2) NOT NULL,
  "description"  text,
  "code"         text UNIQUE,
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"   timestamp with time zone DEFAULT now() NOT NULL
);
