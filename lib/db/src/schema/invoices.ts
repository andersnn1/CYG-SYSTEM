import { pgTable, text, serial, integer, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  clientId: integer("client_id"),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone"),
  clientEmail: text("client_email"),
  clientAddress: text("client_address"),
  clientCity: text("client_city"),
  clientDepartment: text("client_department"),
  status: text("status").notNull().default("pendiente"), // pendiente, pagada, cancelada
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  discount: numeric("discount", { precision: 10, scale: 2 }).notNull().default("0"),
  tax: numeric("tax", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  clientRtn: text("client_rtn"),
  paymentMethod: text("payment_method").notNull().default("efectivo"),
  transferReference: text("transfer_reference"),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date"),
  numeroGuia: text("numero_guia"),
  transportista: text("transportista"),
  fotoGuiaPath: text("foto_guia_path"),
  estadoEntrega: text("estado_entrega").notNull().default("Pendiente"),
  // ── Cálculo de Utilidad Real (Panel Interno) ─────────────────────────────
  baseCost: numeric("base_cost", { precision: 10, scale: 2 }),
  internalExpenses: numeric("internal_expenses", { precision: 10, scale: 2 }).default("0"),
  internalExpensesNote: text("internal_expenses_note"),
  taxes: numeric("taxes", { precision: 10, scale: 2 }).default("0"),
  partnerPayout: numeric("partner_payout", { precision: 10, scale: 2 }),
  ownerPayout: numeric("owner_payout", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const invoiceItemsTable = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  productId: integer("product_id"),
  productType: text("product_type"), // "perfumeria" | "sublimacion"
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true, updatedAt: true });
const _insertInvoiceSchema = insertInvoiceSchema as any;
export type InsertInvoice = z.infer<typeof _insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;

export const insertInvoiceItemSchema = createInsertSchema(invoiceItemsTable).omit({ id: true });
const _insertInvoiceItemSchema = insertInvoiceItemSchema as any;
export type InsertInvoiceItem = z.infer<typeof _insertInvoiceItemSchema>;
export type InvoiceItem = typeof invoiceItemsTable.$inferSelect;
