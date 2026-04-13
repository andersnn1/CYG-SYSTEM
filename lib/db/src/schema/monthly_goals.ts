import { pgTable, serial, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const monthlyGoalsTable = pgTable("monthly_goals", {
  id: serial("id").primaryKey(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  targetAmount: numeric("target_amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMonthlyGoalSchema = createInsertSchema(monthlyGoalsTable).omit({ id: true, createdAt: true });
export type InsertMonthlyGoal = z.infer<typeof insertMonthlyGoalSchema>;
export type MonthlyGoal = typeof monthlyGoalsTable.$inferSelect;
