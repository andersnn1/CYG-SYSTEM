import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const perfumeryTable = pgTable("perfumery", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand").notNull(),
  ml: integer("ml").notNull(),
  stock: integer("stock").notNull().default(0),
  costPrice: numeric("cost_price", { precision: 10, scale: 2 }).notNull(),
  salePrice: numeric("sale_price", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  code: text("code").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPerfumerySchema = createInsertSchema(perfumeryTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPerfumery = z.infer<typeof insertPerfumerySchema>;
export type Perfumery = typeof perfumeryTable.$inferSelect;
