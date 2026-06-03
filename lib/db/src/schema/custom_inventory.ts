import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Tabla de categorías personalizadas de inventario.
 * Cada categoría es una entidad independiente con nombre y color opcional.
 * Los productos en custom_inventory referencian estas categorías por ID (FK).
 */
export const inventoryCategoriesTable = pgTable("inventory_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),            // Ej: "Tecnología", "Papelería"
  color: text("color").notNull().default("slate"),  // Nombre de color Tailwind: slate, green, orange, etc.
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInventoryCategorySchema = createInsertSchema(inventoryCategoriesTable).omit({ id: true, createdAt: true });
const _insertInventoryCategorySchema = insertInventoryCategorySchema as any;
export type InsertInventoryCategory = z.infer<typeof _insertInventoryCategorySchema>;
export type InventoryCategory = typeof inventoryCategoriesTable.$inferSelect;

/**
 * Tabla de productos en categorías personalizadas.
 * El campo categoryId es FK a inventory_categories.id.
 */
export const customInventoryTable = pgTable("custom_inventory", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull(),     // FK → inventory_categories.id
  name: text("name").notNull(),
  subCategory: text("sub_category"),                // Subcategoría libre (ej: "Laptops", "Accesorios")
  brand: text("brand"),
  stock: integer("stock"),                          // null = N/A
  costPrice: numeric("cost_price", { precision: 10, scale: 2 }).notNull(),
  salePrice: numeric("sale_price", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  code: text("code").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCustomInventorySchema = createInsertSchema(customInventoryTable).omit({ id: true, createdAt: true, updatedAt: true });
const _insertCustomInventorySchema = insertCustomInventorySchema as any;
export type InsertCustomInventory = z.infer<typeof _insertCustomInventorySchema>;
export type CustomInventory = typeof customInventoryTable.$inferSelect;
