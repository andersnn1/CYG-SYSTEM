import { pgTable, numeric, timestamp, uuid, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { journalEntriesTable } from "./journal_entries";
import { accountsTable } from "./accounts";

export const journalLinesTable = pgTable("journal_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  journalEntryId: uuid("journal_entry_id")
    .notNull()
    .references(() => journalEntriesTable.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accountsTable.id, { onDelete: "restrict" }),
  debit: numeric("debit", { precision: 12, scale: 2 }).notNull().default("0.00"),
  credit: numeric("credit", { precision: 12, scale: 2 }).notNull().default("0.00"),
  businessLine: text("business_line").$type<"perfumeria" | "sublimacion" | "general">().notNull().default("general"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertJournalLineSchema = createInsertSchema(journalLinesTable).omit({ id: true, createdAt: true });
const _insertJournalLineSchema = insertJournalLineSchema as any;
export type JournalLine = typeof journalLinesTable.$inferSelect;
export type InsertJournalLine = z.infer<typeof _insertJournalLineSchema>;
