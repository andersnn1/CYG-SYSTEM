import { pgTable, text, date, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const journalEntriesTable = pgTable("journal_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date").notNull(),
  referenceSource: varchar("reference_source", { length: 100 }), // e.g. "Invoice_1024", "Expense_50"
  narration: text("narration"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertJournalEntrySchema = createInsertSchema(journalEntriesTable).omit({ id: true, createdAt: true });
const _insertJournalEntrySchema = insertJournalEntrySchema as any;
export type JournalEntry = typeof journalEntriesTable.$inferSelect;
export type InsertJournalEntry = z.infer<typeof _insertJournalEntrySchema>;
