import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const sublimationTable = pgTable("sublimation", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  itemType: text("item_type").notNull().default("consumible"),
  stock: integer("stock"),
  costPrice: numeric("cost_price", { precision: 10, scale: 2 }).notNull(),
  salePrice: numeric("sale_price", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  code: text("code").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSublimationSchema = createInsertSchema(sublimationTable).omit({ id: true, createdAt: true, updatedAt: true });
const _insertSublimationSchema = insertSublimationSchema as any;
export type InsertSublimation = z.infer<typeof _insertSublimationSchema>;
export type Sublimation = typeof sublimationTable.$inferSelect;
