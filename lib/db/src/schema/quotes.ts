import { pgTable, text, serial, integer, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  quoteNumber: text("quote_number").notNull().unique(),
  clientId: integer("client_id"),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone"),
  clientEmail: text("client_email"),
  clientAddress: text("client_address"),
  clientCity: text("client_city"),
  clientDepartment: text("client_department"),
  clientRtn: text("client_rtn"),
  status: text("status").notNull().default("pendiente"), // pendiente, aceptada, rechazada, convertida
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  discount: numeric("discount", { precision: 10, scale: 2 }).notNull().default("0"),
  tax: numeric("tax", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  paymentMethod: text("payment_method").notNull().default("efectivo"),
  issueDate: date("issue_date").notNull(),
  validUntil: date("valid_until"),
  scheduledPurchaseDate: date("scheduled_purchase_date"),
  followUpDate: date("follow_up_date"),
  invoiceId: integer("invoice_id"),
  followUpCount: integer("follow_up_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const quoteItemsTable = pgTable("quote_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  productId: integer("product_id"),
  productType: text("product_type"),
});

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({ id: true, createdAt: true, updatedAt: true });
const _insertQuoteSchema = insertQuoteSchema as any;
export type InsertQuote = z.infer<typeof _insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;

export const insertQuoteItemSchema = createInsertSchema(quoteItemsTable).omit({ id: true });
const _insertQuoteItemSchema = insertQuoteItemSchema as any;
export type InsertQuoteItem = z.infer<typeof _insertQuoteItemSchema>;
export type QuoteItem = typeof quoteItemsTable.$inferSelect;
