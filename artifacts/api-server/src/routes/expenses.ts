import { Router, type IRouter } from "express";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { db, expensesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

function mapExpense(expense: typeof expensesTable.$inferSelect) {
  return {
    ...expense,
    amount: Number(expense.amount),
    createdAt: expense.createdAt.toISOString(),
  };
}

const CreateExpenseBody = z.object({
  amount: z.number().positive(),
  category: z.string().min(1),
  description: z.string().optional(),
  expenseDate: z.string().min(1),
  notes: z.string().optional(),
});

const UpdateExpenseBody = z.object({
  amount: z.number().positive().optional(),
  category: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  expenseDate: z.string().optional(),
  notes: z.string().optional().nullable(),
});

// GET /expenses
router.get("/expenses", async (req, res): Promise<void> => {
  const month = req.query.month ? Number(req.query.month) : null;
  const year = req.query.year ? Number(req.query.year) : null;

  let query = db.select().from(expensesTable).$dynamic();

  if (month !== null && year !== null) {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = new Date(year, month, 0).toISOString().split("T")[0]; // last day of month
    query = query.where(
      and(
        gte(expensesTable.expenseDate, startDate),
        lte(expensesTable.expenseDate, endDate)
      )
    );
  } else if (year !== null) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    query = query.where(
      and(
        gte(expensesTable.expenseDate, startDate),
        lte(expensesTable.expenseDate, endDate)
      )
    );
  }

  const expenses = await query.orderBy(desc(expensesTable.expenseDate));
  res.json(expenses.map(mapExpense));
});

// POST /expenses
router.post("/expenses", async (req, res): Promise<void> => {
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { amount, category, description, expenseDate, notes } = parsed.data;

  const [expense] = await db.insert(expensesTable).values({
    amount: String(amount),
    category,
    description: description ?? null,
    expenseDate,
    notes: notes ?? null,
  }).returning();

  res.status(201).json(mapExpense(expense));
});

// PATCH /expenses/:id
router.patch("/expenses/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = UpdateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }

  const data = parsed.data;
  const [updated] = await db.update(expensesTable).set({
    ...(data.amount !== undefined && { amount: String(data.amount) }),
    ...(data.category !== undefined && { category: data.category }),
    ...(data.description !== undefined && { description: data.description ?? null }),
    ...(data.expenseDate !== undefined && { expenseDate: data.expenseDate }),
    ...(data.notes !== undefined && { notes: data.notes ?? null }),
  }).where(eq(expensesTable.id, id)).returning();

  res.json(mapExpense(updated));
});

// DELETE /expenses/:id
router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [expense] = await db.delete(expensesTable).where(eq(expensesTable.id, id)).returning();
  if (!expense) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
