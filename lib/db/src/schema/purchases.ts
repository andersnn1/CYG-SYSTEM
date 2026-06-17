import { pgTable, text, serial, integer, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  purchaseNumber: text("purchase_number").notNull().unique(), // CMP-0001, etc.
  providerName: text("provider_name").notNull(),
  providerInvoiceNumber: text("provider_invoice_number"),
  status: text("status").notNull().default("completada"), // completada, cancelada
  paymentType: text("payment_type").notNull().default("contado"), // contado, credito
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  purchaseDate: date("purchase_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const purchaseItemsTable = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id").notNull(),
  productId: integer("product_id").notNull(),
  productType: text("product_type").notNull(), // "perfumeria" | "sublimacion" | "custom-inventory"
  quantity: integer("quantity").notNull().default(1),
  costPrice: numeric("cost_price", { precision: 10, scale: 2 }).notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
});

export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({ id: true, createdAt: true, updatedAt: true });
const _insertPurchaseSchema = insertPurchaseSchema as any;
export type InsertPurchase = z.infer<typeof _insertPurchaseSchema>;
export type Purchase = typeof purchasesTable.$inferSelect;

export const insertPurchaseItemSchema = createInsertSchema(purchaseItemsTable).omit({ id: true });
const _insertPurchaseItemSchema = insertPurchaseItemSchema as any;
export type InsertPurchaseItem = z.infer<typeof _insertPurchaseItemSchema>;
export type PurchaseItem = typeof purchaseItemsTable.$inferSelect;
