import { Router, type IRouter } from "express";
import { and, sql } from "drizzle-orm";
import { db, salesTable } from "@workspace/db";
import { GetMonthlyReportQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

function mapSale(sale: typeof salesTable.$inferSelect) {
  return {
    ...sale,
    unitPrice: Number(sale.unitPrice),
    costPrice: Number(sale.costPrice),
    shippingCost: Number(sale.shippingCost ?? 0),
    totalAmount: Number(sale.totalAmount),
    netProfit: Number(sale.netProfit),
    createdAt: sale.createdAt.toISOString(),
  };
}

router.get("/reports/monthly", async (req, res): Promise<void> => {
  const query = GetMonthlyReportQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { month, year } = query.data;

  const sales = await db.select().from(salesTable)
    .where(and(
      sql`EXTRACT(MONTH FROM ${salesTable.saleDate}) = ${month}`,
      sql`EXTRACT(YEAR FROM ${salesTable.saleDate}) = ${year}`
    ))
    .orderBy(salesTable.saleDate);

  const totalIncome = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
  const totalCost = sales.reduce((sum, s) => sum + Number(s.costPrice) * s.quantity, 0);
  const totalShipping = sales.reduce((sum, s) => sum + Number(s.shippingCost ?? 0), 0);
  // Ganancia Bruta = Total Ventas - Costo Productos - Envío
  const netProfit = sales.reduce((sum, s) => sum + Number(s.netProfit), 0);

  // Profit First se aplica sobre la Ganancia Bruta (netProfit)
  const profitFirst = {
    operacion: netProfit * 0.50,
    dueno: netProfit * 0.40,
    ganancia: netProfit * 0.10,
  };

  // Gastos Registrados en el mes
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];

  const { expensesTable } = await import("@workspace/db");
  const [expensesResult] = await db.select({
    total: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)`,
  }).from(expensesTable)
    .where(
      sql`${expensesTable.expenseDate} >= ${startDate} AND ${expensesTable.expenseDate} <= ${endDate}`
    );
  const totalExpenses = Number(expensesResult?.total ?? 0);


  const clientMap = new Map<string, { clientId: number | null; clientName: string; totalPurchases: number; salesCount: number }>();
  for (const sale of sales) {
    const key = sale.clientName ?? "Cliente General";
    if (!clientMap.has(key)) {
      clientMap.set(key, { clientId: sale.clientId, clientName: key, totalPurchases: 0, salesCount: 0 });
    }
    const entry = clientMap.get(key)!;
    entry.totalPurchases += Number(sale.totalAmount);
    entry.salesCount += 1;
  }
  const topClients = Array.from(clientMap.values())
    .sort((a, b) => b.totalPurchases - a.totalPurchases)
    .slice(0, 5);

  const categoryMap = new Map<string, { category: string; totalSales: number; totalRevenue: number }>();
  for (const sale of sales) {
    const cat = sale.productType === "perfumeria" ? "Perfumeria" : "Sublimacion";
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, { category: cat, totalSales: 0, totalRevenue: 0 });
    }
    const entry = categoryMap.get(cat)!;
    entry.totalSales += sale.quantity;
    entry.totalRevenue += Number(sale.totalAmount);
  }

  res.json({
    month,
    year,
    totalIncome,
    totalCost,
    totalShipping,
    netProfit,
    profitFirst,
    totalExpenses,
    totalSales: sales.length,
    sales: sales.map(mapSale),
    topClients,
    categoryBreakdown: Array.from(categoryMap.values()),
  });
});

export default router;
