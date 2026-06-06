import { pgTable, serial, integer, text, varchar, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 255 }).notNull(),
  price: varchar("price", { length: 255 }).notNull(),
  thumbnail: text("thumbnail").notNull(),
  badge: varchar("badge", { length: 255 }),
  description: text("description").default(""),
  stock: integer("stock").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  isFeatured: boolean("is_featured").default(false),
  salePrice: varchar("sale_price", { length: 255 }),
  sku: varchar("sku", { length: 255 }),
  isActive: boolean("is_active").default(true),
});

export const settingsTable = pgTable("settings", {
  id: varchar("id", { length: 255 }).primaryKey(),
  value: jsonb("value").notNull(),
});
