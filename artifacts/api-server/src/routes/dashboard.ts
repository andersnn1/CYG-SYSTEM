import { Router, type IRouter } from "express";
import { sql, and, eq, isNotNull } from "drizzle-orm";
import { db, salesTable, perfumeryTable, sublimationTable, clientsTable, expensesTable, invoicesTable, monthlyGoalsTable, quotesTable } from "@workspace/db";
import { GetSalesChartQueryParams } from "@workspace/api-zod";
import { z } from "zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const salesResult = await db.select({
    totalIncome: sql<number>`COALESCE(SUM(${salesTable.totalAmount}), 0)`,
    totalCost: sql<number>`COALESCE(SUM(${salesTable.costPrice} * ${salesTable.quantity}), 0)`,
    totalShipping: sql<number>`COALESCE(SUM(${salesTable.shippingCost}), 0)`,
    netProfit: sql<number>`COALESCE(SUM(${salesTable.netProfit}), 0)`,
    totalSales: sql<number>`COUNT(*)`,
  }).from(salesTable);

  const totalIncome = Number(salesResult[0]?.totalIncome ?? 0);
  const totalCost = Number(salesResult[0]?.totalCost ?? 0);
  const totalShipping = Number(salesResult[0]?.totalShipping ?? 0);
  const netProfit = Number(salesResult[0]?.netProfit ?? 0);
  const totalSales = Number(salesResult[0]?.totalSales ?? 0);

  const fondoReposicion = totalCost;
  const distributableProfit = netProfit;

  const [clientsResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(clientsTable);
  const totalClients = Number(clientsResult?.count ?? 0);

  const [lowPerfumery] = await db.select({ count: sql<number>`COUNT(*)` }).from(perfumeryTable)
    .where(sql`${perfumeryTable.stock} < 5`);
  const [lowSublimation] = await db.select({ count: sql<number>`COUNT(*)` }).from(sublimationTable)
    .where(sql`${sublimationTable.stock} IS NOT NULL AND ${sublimationTable.stock} < 5`);
  const lowStockCount = Number(lowPerfumery?.count ?? 0) + Number(lowSublimation?.count ?? 0);

  const profitFirst = {
    operacion: distributableProfit * 0.50,
    dueno: distributableProfit * 0.40,
    ganancia: distributableProfit * 0.10,
  };

  // Monthly expenses
  const startDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
  const endDate = new Date(currentYear, currentMonth, 0).toISOString().split("T")[0];

  const [expensesResult] = await db.select({
    total: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)`,
  }).from(expensesTable)
    .where(
      sql`${expensesTable.expenseDate} >= ${startDate} AND ${expensesTable.expenseDate} <= ${endDate}`
    );
  const monthlyExpenses = Number(expensesResult?.total ?? 0);

  // Monthly invoices sales (status != cancelada)
  const [invoiceSalesResult] = await db.select({
    total: sql<number>`COALESCE(SUM(${invoicesTable.total}), 0)`,
  }).from(invoicesTable)
    .where(
      sql`${invoicesTable.status} != 'cancelada' AND EXTRACT(MONTH FROM ${invoicesTable.issueDate}::date) = ${currentMonth} AND EXTRACT(YEAR FROM ${invoicesTable.issueDate}::date) = ${currentYear}`
    );
  const monthlySales = Number(invoiceSalesResult?.total ?? 0);

  // Monthly goal
  const [goalResult] = await db.select().from(monthlyGoalsTable)
    .where(
      and(
        eq(monthlyGoalsTable.month, currentMonth),
        eq(monthlyGoalsTable.year, currentYear)
      )
    );
  const monthlyGoal = goalResult ? Number(goalResult.targetAmount) : null;

  res.json({
    totalIncome,
    totalCost,
    totalShipping,
    fondoReposicion,
    netProfit,
    distributableProfit,
    profitFirst,
    totalSales,
    totalClients,
    lowStockCount,
    monthlyExpenses,
    monthlySales,
    monthlyGoal,
  });
});

router.get("/dashboard/sales-chart", async (req, res): Promise<void> => {
  const query = GetSalesChartQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const year = query.data.year ?? new Date().getFullYear();

  const result = await db.select({
    month: sql<number>`EXTRACT(MONTH FROM ${salesTable.saleDate})`,
    income: sql<number>`COALESCE(SUM(${salesTable.totalAmount}), 0)`,
    profit: sql<number>`COALESCE(SUM(${salesTable.netProfit}), 0)`,
  }).from(salesTable)
    .where(sql`EXTRACT(YEAR FROM ${salesTable.saleDate}) = ${year}`)
    .groupBy(sql`EXTRACT(MONTH FROM ${salesTable.saleDate})`)
    .orderBy(sql`EXTRACT(MONTH FROM ${salesTable.saleDate})`);

  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const found = result.find(r => Number(r.month) === i + 1);
    return {
      month: monthNames[i],
      income: Number(found?.income ?? 0),
      profit: Number(found?.profit ?? 0),
    };
  });

  res.json(chartData);
});

router.get("/dashboard/top-products", async (req, res): Promise<void> => {
  const result = await db.select({
    productName: salesTable.productName,
    productType: salesTable.productType,
    revenue: sql<number>`COALESCE(SUM(${salesTable.totalAmount}), 0)`,
    unitsSold: sql<number>`COALESCE(SUM(${salesTable.quantity}), 0)`,
  }).from(salesTable)
    .groupBy(salesTable.productName, salesTable.productType)
    .orderBy(sql`SUM(${salesTable.totalAmount}) DESC`)
    .limit(5);

  res.json(result.map(r => ({
    name: r.productName,
    category: r.productType === "perfumeria" ? "Perfumeria" : "Sublimacion",
    revenue: Number(r.revenue),
    unitsSold: Number(r.unitsSold),
  })));
});

// GET /dashboard/monthly-goal
router.get("/dashboard/monthly-goal", async (req, res): Promise<void> => {
  const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
  const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();

  const [goal] = await db.select().from(monthlyGoalsTable)
    .where(
      and(
        eq(monthlyGoalsTable.month, month),
        eq(monthlyGoalsTable.year, year)
      )
    );

  if (!goal) {
    res.json(null);
    return;
  }

  res.json({
    ...goal,
    targetAmount: Number(goal.targetAmount),
    createdAt: goal.createdAt.toISOString(),
  });
});

// POST /dashboard/monthly-goal — upsert
router.post("/dashboard/monthly-goal", async (req, res): Promise<void> => {
  const body = z.object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2020).max(2100),
    targetAmount: z.number().positive(),
  }).safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { month, year, targetAmount } = body.data;

  const [existing] = await db.select().from(monthlyGoalsTable)
    .where(
      and(
        eq(monthlyGoalsTable.month, month),
        eq(monthlyGoalsTable.year, year)
      )
    );

  let goal;
  if (existing) {
    [goal] = await db.update(monthlyGoalsTable)
      .set({ targetAmount: String(targetAmount) })
      .where(eq(monthlyGoalsTable.id, existing.id))
      .returning();
  } else {
    [goal] = await db.insert(monthlyGoalsTable)
      .values({ month, year, targetAmount: String(targetAmount) })
      .returning();
  }

  res.json({
    ...goal,
    targetAmount: Number(goal.targetAmount),
    createdAt: goal.createdAt.toISOString(),
  });
});

// GET /dashboard/scheduled-quotes — quotes with a scheduledPurchaseDate set
router.get("/dashboard/scheduled-quotes", async (req, res): Promise<void> => {
  const quotes = await db
    .select({
      id: quotesTable.id,
      quoteNumber: quotesTable.quoteNumber,
      clientName: quotesTable.clientName,
      total: quotesTable.total,
      status: quotesTable.status,
      scheduledPurchaseDate: quotesTable.scheduledPurchaseDate,
    })
    .from(quotesTable)
    .where(isNotNull(quotesTable.scheduledPurchaseDate));

  res.json(
    quotes.map(q => ({
      ...q,
      total: Number(q.total),
    }))
  );
});

export default router;
