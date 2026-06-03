import { Router, type IRouter } from "express";
import { db, clientsTable, salesTable, expensesTable, invoicesTable, invoiceItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// GET /backup
router.get("/backup", async (req, res): Promise<void> => {
  const [clients, sales, expenses, invoicesRaw] = await Promise.all([
    db.select().from(clientsTable),
    db.select().from(salesTable),
    db.select().from(expensesTable),
    db.select().from(invoicesTable),
  ]);

  const invoicesWithItems = await Promise.all(
    invoicesRaw.map(async (invoice) => {
      const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoice.id));
      return {
        ...invoice,
        subtotal: Number(invoice.subtotal),
        discount: Number(invoice.discount),
        tax: Number(invoice.tax),
        total: Number(invoice.total),
        createdAt: invoice.createdAt.toISOString(),
        updatedAt: invoice.updatedAt.toISOString(),
        items: items.map(item => ({
          ...item,
          unitPrice: Number(item.unitPrice),
          total: Number(item.total),
        })),
      };
    })
  );

  res.json({
    exportedAt: new Date().toISOString(),
    clients: clients.map(c => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    })),
    sales: sales.map(s => ({
      ...s,
      unitPrice: Number(s.unitPrice),
      costPrice: Number(s.costPrice),
      shippingCost: Number(s.shippingCost),
      totalAmount: Number(s.totalAmount),
      netProfit: Number(s.netProfit),
      createdAt: s.createdAt.toISOString(),
    })),
    expenses: expenses.map(e => ({
      ...e,
      amount: Number(e.amount),
      createdAt: e.createdAt.toISOString(),
    })),
    invoices: invoicesWithItems,
  });
});

export default router;
