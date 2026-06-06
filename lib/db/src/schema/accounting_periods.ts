import { pgTable, integer, boolean, timestamp, text, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const accountingPeriodsTable = pgTable("accounting_periods", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  isClosed: boolean("is_closed").notNull().default(false),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedBy: text("closed_by"),
});

export const insertAccountingPeriodSchema = createInsertSchema(accountingPeriodsTable).omit({ id: true, closedAt: true });
const _insertAccountingPeriodSchema = insertAccountingPeriodSchema as any;
export type AccountingPeriod = typeof accountingPeriodsTable.$inferSelect;
export type InsertAccountingPeriod = z.infer<typeof _insertAccountingPeriodSchema>;
