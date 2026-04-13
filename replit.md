# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + Recharts
- **Themes**: next-themes (dark/light mode)

## Application: Gestión de Inventario y Ventas

A professional inventory and sales management system for a small Honduran business. Features:

- **Dashboard**: Total income, Profit First breakdown (50% Operación, 30% Dueño, 15% Impuestos, 5% Ganancia), monthly bar charts, top products
- **Perfumería**: Inventory of fragrances with brand, ml, stock, cost/sale prices, low stock alerts
- **Sublimación**: Dual inventory for machinery and consumables
- **Clientes**: Customer management with all 18 Honduras departments
- **Ventas**: Sales registration with instant net profit calculation, client association, monthly filters
- **Reportes**: Monthly reports with Profit First breakdown, PDF export via window.print()

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Database Tables

- `perfumery` — Fragrance products (name, brand, ml, stock, cost_price, sale_price)
- `sublimation` — Sublimation items (name, category, item_type, stock, cost_price, sale_price)
- `clients` — Customers in Honduras (name, phone, email, city, department, address)
- `sales` — Sales records (client_id, product_type, product_id, quantity, prices, sale_date)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
