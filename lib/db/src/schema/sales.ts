import { pgTable, text, serial, integer, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const salesTable = pgTable("sales", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id"),
  clientId: integer("client_id"),
  clientName: text("client_name"),
  productType: text("product_type").notNull(),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  costPrice: numeric("cost_price", { precision: 10, scale: 2 }).notNull(),
  shippingCost: numeric("shipping_cost", { precision: 10, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  netProfit: numeric("net_profit", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  saleDate: date("sale_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSaleSchema = createInsertSchema(salesTable).omit({ id: true, createdAt: true });
const _insertSaleSchema = insertSaleSchema as any;
export type InsertSale = z.infer<typeof _insertSaleSchema>;
export type Sale = typeof salesTable.$inferSelect;
