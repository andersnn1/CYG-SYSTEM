# Módulo de Facturación - C&G Electronics

## Archivos nuevos/modificados

### Backend (api-server)
- `artifacts/api-server/src/routes/invoices.ts` → Rutas REST completas para facturas
- `artifacts/api-server/src/routes/index.ts` → Registra el router de facturas

### Base de datos (db)
- `lib/db/src/schema/invoices.ts` → Schema Drizzle para `invoices` e `invoice_items`
- `lib/db/src/schema/index.ts` → Exporta el nuevo schema
- `lib/db/migrations/0010_add_invoices.sql` → Migración SQL

### Validación (api-zod)
- `lib/api-zod/src/generated/types/invoice.ts` → Schemas Zod para validación

### Frontend (inventario-ventas)
- `artifacts/inventario-ventas/src/pages/facturas.tsx` → Página completa de Facturas
- `artifacts/inventario-ventas/src/App.tsx` → Agrega ruta `/facturas`
- `artifacts/inventario-ventas/src/components/layout.tsx` → Agrega "Facturas" al menú

## Funcionalidades
- ✅ Crear facturas con múltiples ítems
- ✅ Selección automática de datos desde clientes existentes
- ✅ Numeración automática (FAC-0001, FAC-0002...)
- ✅ Descuento e ISV
- ✅ Estados: Pendiente / Pagada / Cancelada
- ✅ Vista de impresión / Exportar a PDF
- ✅ Estadísticas en tiempo real
- ✅ Editar y eliminar facturas

## Para activar
1. Ejecutar migración SQL en tu base de datos
2. Reiniciar el servidor de API
3. La página estará disponible en /facturas
