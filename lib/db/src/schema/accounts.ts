import { pgTable, text, varchar, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const accountsTable = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  type: text("type").$type<"Asset" | "Liability" | "Equity" | "Revenue" | "Expense">().notNull(),
  subType: varchar("sub_type", { length: 50 }),
  isSystemAccount: boolean("is_system_account").notNull().default(false),
  parentId: uuid("parent_id").references((): any => accountsTable.id, { onDelete: "restrict" }),
  isGroup: boolean("is_group").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({ id: true, createdAt: true });
const _insertAccountSchema = insertAccountSchema as any;
export type Account = typeof accountsTable.$inferSelect;
export type InsertAccount = z.infer<typeof _insertAccountSchema>;
