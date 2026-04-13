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

A professional inventory and sales management system for C&G Electronics, a small Honduran business. Features:

- **Dashboard**: Total income, Profit First breakdown, monthly bar charts, top products, sales goal tracking
- **Perfumería**: Inventory of fragrances with brand, ml, stock, cost/sale prices, low stock alerts
- **Sublimación**: Dual inventory for machinery and consumables
- **Clientes**: Customer management with all 18 Honduras departments, invoice history panel
- **Ventas**: Sales registration with instant net profit calculation, client association, monthly filters
- **Facturas**: Full invoicing system with line items, status management, PDF print
- **Cotizaciones**: Quote management
- **Gastos**: Monthly expense tracking by category
- **Combos**: Product bundle management
- **Reportes**: Monthly reports with Profit First breakdown, PDF export

## Mobile-Responsive Design

Fully responsive with Tailwind breakpoints. Key patterns:

- **Mobile navigation**: Sticky bottom bar (`md:hidden`) with 5 primary items (Dashboard, Perfumería, Clientes, Ventas, Facturas) + "Más" drawer for secondary items (Sublimación, Reportes, Cotizaciones, Gastos, Combos)
- **Desktop navigation**: Left sidebar (hidden on mobile, `hidden md:flex`)
- **Mobile header**: Sticky top bar with brand name "C&G Electronics" + theme toggle
- **Tables → Cards**: On screens smaller than `sm` breakpoint, all data tables switch to stacked card layout. Desktop table wrapped in `hidden sm:block`, mobile cards in `sm:hidden`
- **Touch targets**: Primary action buttons are `h-11` (44px) on mobile
- **Button labels**: Hidden on mobile via `hidden sm:inline`, icon-only for compact headers
- **Page headings**: `text-2xl sm:text-3xl`, icons `h-6 w-6 sm:h-8 sm:w-8`
- **Content padding**: `pb-24 md:pb-8` to clear the mobile bottom nav

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
