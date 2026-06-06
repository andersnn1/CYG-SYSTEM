import { pgTable, varchar, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const accountingMappingsTable = pgTable("accounting_mappings", {
  id: serial("id").primaryKey(),
  event: varchar("event", { length: 50 }).notNull(), // e.g. 'invoice_created', 'invoice_paid', 'expense_created'
  accountCode: varchar("account_code", { length: 20 }).notNull(),
  direction: varchar("direction", { length: 10 }).$type<"DEBIT" | "CREDIT">().notNull(),
  valueType: varchar("value_type", { length: 20 }).$type<"percentage" | "variable">().notNull(), // 'percentage' or 'variable'
  valueExpression: varchar("value_expression", { length: 50 }).notNull(), // e.g. 'total', 'subtotal', 'tax', or percentages like '50', '40', '10'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAccountingMappingSchema = createInsertSchema(accountingMappingsTable).omit({ id: true, createdAt: true });
const _insertAccountingMappingSchema = insertAccountingMappingSchema as any;
export type AccountingMapping = typeof accountingMappingsTable.$inferSelect;
export type InsertAccountingMapping = z.infer<typeof _insertAccountingMappingSchema>;
