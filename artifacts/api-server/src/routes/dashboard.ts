import { Router, type IRouter } from "express";
import { sql, and, eq, isNotNull } from "drizzle-orm";
import { db, salesTable, perfumeryTable, sublimationTable, clientsTable, expensesTable, invoicesTable, monthlyGoalsTable, quotesTable, accountsTable, journalEntriesTable, journalLinesTable } from "@workspace/db";
import { GetSalesChartQueryParams } from "@workspace/api-zod";
import { z } from "zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const queryMonth = req.query.month ? String(req.query.month) : null;
  const queryYear = req.query.year ? String(req.query.year) : null;

  let filterMonth: number | null = currentMonth;
  let filterYear: number | null = currentYear;
  let isAllTime = false;

  if (queryMonth === "all") {
    isAllTime = true;
    filterMonth = null;
    filterYear = null;
  } else {
    if (queryMonth) filterMonth = parseInt(queryMonth);
    if (queryYear) filterYear = parseInt(queryYear);
    if (isNaN(filterMonth as number) || filterMonth === null) filterMonth = currentMonth;
    if (isNaN(filterYear as number) || filterYear === null) filterYear = currentYear;
  }

  // 1. Sales Query (to get number of sales transactions and shipping cost)
  let salesQuery = db.select({
    totalShipping: sql<number>`COALESCE(SUM(${salesTable.shippingCost}), 0)`,
    totalSales: sql<number>`COUNT(*)`,
  }).from(salesTable).$dynamic();

  if (!isAllTime) {
    salesQuery = salesQuery.where(
      and(
        sql`EXTRACT(MONTH FROM ${salesTable.saleDate}) = ${filterMonth}`,
        sql`EXTRACT(YEAR FROM ${salesTable.saleDate}) = ${filterYear}`
      )
    );
  }
  const salesResult = await salesQuery;
  const totalShipping = Number(salesResult[0]?.totalShipping ?? 0);
  const totalSales = Number(salesResult[0]?.totalSales ?? 0);

  // 2. Real Net Income Query from Journal Entries (Partida Doble)
  let journalFilter = sql`1=1`;
  if (!isAllTime) {
    journalFilter = sql`EXTRACT(MONTH FROM ${journalEntriesTable.date}::date) = ${filterMonth} AND EXTRACT(YEAR FROM ${journalEntriesTable.date}::date) = ${filterYear}`;
  }

  const [netIncomeResult] = await db
    .select({
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${accountsTable.type} = 'Revenue' THEN ${journalLinesTable.credit} - ${journalLinesTable.debit} ELSE 0 END), 0)`,
      expense: sql<number>`COALESCE(SUM(CASE WHEN ${accountsTable.type} = 'Expense' THEN ${journalLinesTable.debit} - ${journalLinesTable.credit} ELSE 0 END), 0)`,
    })
    .from(journalLinesTable)
    .innerJoin(accountsTable, eq(journalLinesTable.accountId, accountsTable.id))
    .innerJoin(journalEntriesTable, eq(journalLinesTable.journalEntryId, journalEntriesTable.id))
    .where(journalFilter);

  const realTotalRevenue = Number(netIncomeResult?.revenue ?? 0);
  const realTotalExpense = Number(netIncomeResult?.expense ?? 0);
  const realNetIncome = realTotalRevenue - realTotalExpense;

  const totalIncome = realTotalRevenue;
  const totalCost = realTotalExpense;
  const netProfit = realNetIncome;
  const distributableProfit = realNetIncome;
  const monthlyExpenses = realTotalExpense;
  const monthlySales = realTotalRevenue;

  const fondoReposicion = totalCost;

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

  // 3. Owner payout from invoices (status != cancelada)
  let invoicePayoutQuery = db.select({
    ownerPayout: sql<number>`COALESCE(SUM(${invoicesTable.ownerPayout}), 0)`,
    partnerPayout: sql<number>`COALESCE(SUM(${invoicesTable.partnerPayout}), 0)`,
  }).from(invoicesTable).$dynamic();

  if (!isAllTime) {
    invoicePayoutQuery = invoicePayoutQuery.where(
      and(
        sql`${invoicesTable.status} != 'cancelada'`,
        sql`EXTRACT(MONTH FROM ${invoicesTable.issueDate}::date) = ${filterMonth}`,
        sql`EXTRACT(YEAR FROM ${invoicesTable.issueDate}::date) = ${filterYear}`
      )
    );
  } else {
    invoicePayoutQuery = invoicePayoutQuery.where(
      sql`${invoicesTable.status} != 'cancelada'`
    );
  }
  const [invoicePayoutResult] = await invoicePayoutQuery;
  const monthlyRealProfit = Number(invoicePayoutResult?.ownerPayout ?? 0);
  const monthlyPartnerProfit = Number(invoicePayoutResult?.partnerPayout ?? 0);

  // 4. Monthly Goal Query
  const goalMonth = isAllTime ? currentMonth : filterMonth;
  const goalYear = isAllTime ? currentYear : filterYear;
  const [goalResult] = await db.select().from(monthlyGoalsTable)
    .where(
      and(
        eq(monthlyGoalsTable.month, goalMonth!),
        eq(monthlyGoalsTable.year, goalYear!)
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
    monthlyRealProfit,
    monthlyPartnerProfit,
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
