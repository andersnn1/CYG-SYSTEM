import { pgTable, serial, numeric, text, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  category: text("category").notNull(),
  description: text("description"),
  expenseDate: date("expense_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true });
const _insertExpenseSchema = insertExpenseSchema as any;
export type InsertExpense = z.infer<typeof _insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
