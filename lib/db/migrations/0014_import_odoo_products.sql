-- ============================================================
-- Migración: Importar productos desde Odoo (CSV exportado)
-- Fecha: 2026-04-07
-- Notas:
--   · Cada producto aparecía duplicado (+N/-N stock) → stock neto = 0
--   · Códigos compartidos (ej. "TINTA SUBLIMACION") se renombraron
--     para respetar la constraint UNIQUE de la columna code
--   · Productos de electrónica general (ADAPTADOR, DISCO, IMPRESORA
--     L1250) no tienen tabla propia y se omiten en esta migración
-- ============================================================

-- ─── PERFUMERÍA ──────────────────────────────────────────────

INSERT INTO perfumery (name, brand, ml, stock, cost_price, sale_price, code)
VALUES
  (
    'BHARARA MAST PERFUME ROME POUR FEMME EDP 100ML',
    'Bharara',
    100,
    0,
    800.00,
    1300.00,
    'BHARARA'
  ),
  (
    'LATTAFA ASAD EDP 100ML',
    'Lattafa',
    100,
    0,
    720.00,
    1300.00,
    'LATTAFA'
  )
ON CONFLICT (code) DO NOTHING;

-- ─── SUBLIMACIÓN ─────────────────────────────────────────────

INSERT INTO sublimation (name, category, item_type, stock, cost_price, sale_price, code)
VALUES
  -- Equipos
  (
    'IMPRESORA EPSON SURECOLOR F170 SUBLIMACION',
    'Equipos',
    'equipo',
    0,
    9600.00,
    11200.00,
    NULL
  ),
  (
    'PLANCHA PARA SUBLIMAR 40X60CM',
    'Equipos',
    'equipo',
    0,
    8300.00,
    12700.00,
    NULL
  ),
  (
    'PLANCHA SUBLIMAR 5 EN 1 29X38',
    'Equipos',
    'equipo',
    0,
    5400.00,
    7400.00,
    NULL
  ),
  (
    'PLANCHA SUBLIMAR 5 EN 1 38X38',
    'Equipos',
    'equipo',
    0,
    7204.61,
    9365.00,
    'PLANCHA SUBLIMAR'
  ),
  (
    'RESISTENCIA PARA TAZAS 20OZ',
    'Insumos',
    'consumible',
    0,
    550.50,
    1715.00,
    'RESISTENCIA TAZA 20OZ'
  ),
  -- Insumos de impresión
  (
    'PAPEL SUBLIMACION A4 100HJS',
    'Insumos',
    'consumible',
    0,
    137.70,
    310.00,
    'PAPEL A4 SUBLIMACION'
  ),
  (
    'TAPE TERMICO SUBLIMAR 8MMX38MM',
    'Insumos',
    'consumible',
    0,
    66.74,
    100.00,
    'TAPE TERMICO GRANDE'
  ),
  -- Tintas (código único por color, Odoo usaba "TINTA SUBLIMACION" para todos)
  (
    'TINTA NKT SUBLIMACION 127ML CYAN',
    'Insumos',
    'consumible',
    0,
    213.00,
    340.00,
    'TINTA-CYAN'
  ),
  (
    'TINTA NKT SUBLIMACION 127ML MAGENTA',
    'Insumos',
    'consumible',
    0,
    213.00,
    340.00,
    'TINTA-MAGENTA'
  ),
  (
    'TINTA NKT SUBLIMACION 127ML NEGRO',
    'Insumos',
    'consumible',
    0,
    213.00,
    340.00,
    'TINTA-NEGRO'
  ),
  (
    'TINTA NKT SUBLIMACION 127ML YELLOW',
    'Insumos',
    'consumible',
    0,
    213.00,
    340.00,
    'TINTA-YELLOW'
  ),
  -- Productos terminados
  (
    'TAZA CERAMICA 11OZ',
    'Productos',
    'consumible',
    0,
    23.60,
    35.00,
    'TAZA 11OZ'
  )
ON CONFLICT (code) DO NOTHING;

-- ─── ELECTRÓNICA (sin tabla propia — omitidos) ───────────────
-- Los siguientes productos no tienen tabla en el schema actual.
-- Si se agrega una tabla "electronics" en el futuro, importar aquí:
--
-- ADAPTADOR DE CORRIENTE UGREEN 65W SIN CABLE  | costo: 601.00  | venta: 1390.00
-- DISCO SEAGATE 6TB USADO                       | costo: 1800.00 | venta: 4500.00
-- IMPRESORA EPSON L1250 WIFI                    | costo: 4244.70 | venta: 4890.00
