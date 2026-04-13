import { pgTable, serial, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const combosTable = pgTable("combos", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  fixedPrice: numeric("fixed_price", { precision: 10, scale: 2 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const comboItemsTable = pgTable("combo_items", {
  id: serial("id").primaryKey(),
  comboId: integer("combo_id").notNull(),
  productId: integer("product_id").notNull(),
  productType: text("product_type").notNull(), // "perfumeria" | "sublimacion"
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
});

export const insertComboSchema = createInsertSchema(combosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCombo = z.infer<typeof insertComboSchema>;
export type Combo = typeof combosTable.$inferSelect;

export const insertComboItemSchema = createInsertSchema(comboItemsTable).omit({ id: true });
export type InsertComboItem = z.infer<typeof insertComboItemSchema>;
export type ComboItem = typeof comboItemsTable.$inferSelect;
