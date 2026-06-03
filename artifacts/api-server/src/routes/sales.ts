import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, salesTable, perfumeryTable, sublimationTable, clientsTable } from "@workspace/db";
import {
  CreateSaleBody,
  UpdateSaleBody,
  ListSalesQueryParams,
  GetSaleParams,
  DeleteSaleParams,
} from "@workspace/api-zod";

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

router.get("/sales", async (req, res): Promise<void> => {
  const query = ListSalesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  if (query.data.month !== undefined && query.data.year !== undefined) {
    const month = query.data.month;
    const year = query.data.year;
    const sales = await db.select().from(salesTable)
      .where(and(
        sql`EXTRACT(MONTH FROM ${salesTable.saleDate}) = ${month}`,
        sql`EXTRACT(YEAR FROM ${salesTable.saleDate}) = ${year}`
      ))
      .orderBy(salesTable.saleDate);
    res.json(sales.map(mapSale));
    return;
  }

  const sales = await db.select().from(salesTable).orderBy(salesTable.saleDate);
  res.json(sales.map(mapSale));
});

router.post("/sales", async (req, res): Promise<void> => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let productName = "";
  let costPrice = 0;
  let clientName: string | null = null;

  if (parsed.data.productType === "perfumeria") {
    const [product] = await db.select().from(perfumeryTable).where(eq(perfumeryTable.id, parsed.data.productId));
    if (!product) {
      res.status(400).json({ error: "Product not found" });
      return;
    }
    productName = `${product.brand} ${product.name} ${product.ml}ml`;
    // Always use the product's registered cost — never requested from the user
    costPrice = Number(product.costPrice);

    // Allow negative stock — descount regardless (sales under order / pedido)
    await db.update(perfumeryTable)
      .set({ stock: product.stock - parsed.data.quantity })
      .where(eq(perfumeryTable.id, parsed.data.productId));

  } else {
    const [product] = await db.select().from(sublimationTable).where(eq(sublimationTable.id, parsed.data.productId));
    if (!product) {
      res.status(400).json({ error: "Product not found" });
      return;
    }
    productName = product.name;
    costPrice = Number(product.costPrice);

    // Allow negative stock for sublimation items that track stock
    if (product.stock !== null) {
      await db.update(sublimationTable)
        .set({ stock: product.stock - parsed.data.quantity })
        .where(eq(sublimationTable.id, parsed.data.productId));
    }
  }

  if (parsed.data.clientId) {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, parsed.data.clientId));
    if (client) clientName = client.name;
  }

  const shippingCost = parsed.data.shippingCost ?? 0;
  const totalAmount = parsed.data.quantity * parsed.data.unitPrice;
  const totalProductCost = parsed.data.quantity * costPrice;
  // Ganancia Bruta = Total Venta - Costo de Inventario - Gasto de Envío
  const netProfit = totalAmount - totalProductCost - shippingCost;

  const [sale] = await db.insert(salesTable).values({
    clientId: parsed.data.clientId ?? null,
    clientName,
    productType: parsed.data.productType,
    productId: parsed.data.productId,
    productName,
    quantity: parsed.data.quantity,
    unitPrice: String(parsed.data.unitPrice),
    costPrice: String(costPrice),
    shippingCost: String(shippingCost),
    totalAmount: String(totalAmount),
    netProfit: String(netProfit),
    notes: parsed.data.notes ?? null,
    saleDate: parsed.data.saleDate,
  }).returning();

  res.status(201).json(mapSale(sale));
});

router.get("/sales/:id", async (req, res): Promise<void> => {
  const params = GetSaleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, params.data.id));
  if (!sale) {
    res.status(404).json({ error: "Sale not found" });
    return;
  }
  res.json(mapSale(sale));
});

router.patch("/sales/:id", async (req, res): Promise<void> => {
  const params = GetSaleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(salesTable).where(eq(salesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Sale not found" });
    return;
  }

  const quantity = parsed.data.quantity ?? existing.quantity;
  const unitPrice = parsed.data.unitPrice ?? Number(existing.unitPrice);
  const costPrice = parsed.data.costPrice ?? Number(existing.costPrice);
  const shippingCost = parsed.data.shippingCost ?? Number(existing.shippingCost);

  const totalAmount = quantity * unitPrice;
  const netProfit = totalAmount - quantity * costPrice - shippingCost;

  // Resolve clientName if clientId changed
  let clientId = "clientId" in parsed.data ? parsed.data.clientId : existing.clientId;
  let clientName = existing.clientName;
  if ("clientId" in parsed.data) {
    if (parsed.data.clientId) {
      const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, parsed.data.clientId));
      clientName = client ? client.name : null;
    } else {
      clientName = null;
    }
  }

  const [updated] = await db.update(salesTable).set({
    clientId,
    clientName,
    quantity,
    unitPrice: String(unitPrice),
    costPrice: String(costPrice),
    shippingCost: String(shippingCost),
    totalAmount: String(totalAmount),
    netProfit: String(netProfit),
    notes: "notes" in parsed.data ? (parsed.data.notes ?? null) : existing.notes,
    saleDate: parsed.data.saleDate ?? existing.saleDate,
  }).where(eq(salesTable.id, params.data.id)).returning();

  res.json(mapSale(updated));
});

router.delete("/sales/:id", async (req, res): Promise<void> => {
  const params = DeleteSaleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [sale] = await db.delete(salesTable).where(eq(salesTable.id, params.data.id)).returning();
  if (!sale) {
    res.status(404).json({ error: "Sale not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
