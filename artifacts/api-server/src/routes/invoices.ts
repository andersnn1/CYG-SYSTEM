import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, invoicesTable, invoiceItemsTable, clientsTable, perfumeryTable, sublimationTable, salesTable, combosTable, comboItemsTable } from "@workspace/db";
import {
  CreateInvoiceBody,
  UpdateInvoiceBody,
  GetInvoiceParams,
  DeleteInvoiceParams,
} from "@workspace/api-zod";
import multer from "multer";
import path from "path";
import fs from "fs";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), "guias_evidencia");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const invoiceId = req.params.id;
    const ext = path.extname(file.originalname);
    cb(null, `guia_${invoiceId}${ext}`);
  },
});
const upload = multer({ storage });

const router: IRouter = Router();

function mapInvoice(invoice: typeof invoicesTable.$inferSelect, items?: typeof invoiceItemsTable.$inferSelect[]) {
  return {
    ...invoice,
    subtotal: Number(invoice.subtotal),
    discount: Number(invoice.discount),
    tax: Number(invoice.tax),
    total: Number(invoice.total),
    baseCost: invoice.baseCost ? Number(invoice.baseCost) : 0,
    internalExpenses: invoice.internalExpenses ? Number(invoice.internalExpenses) : 0,
    taxes: invoice.taxes ? Number(invoice.taxes) : 0,
    partnerPayout: invoice.partnerPayout ? Number(invoice.partnerPayout) : 0,
    ownerPayout: invoice.ownerPayout ? Number(invoice.ownerPayout) : 0,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    items: items?.map(item => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
    })),
  };
}

// Generate sequential invoice number
async function generateInvoiceNumber(): Promise<string> {
  const [last] = await db
    .select({ invoiceNumber: invoicesTable.invoiceNumber })
    .from(invoicesTable)
    .orderBy(desc(invoicesTable.id))
    .limit(1);

  if (!last) return "FAC-0001";
  const num = parseInt(last.invoiceNumber.replace("FAC-", "")) + 1;
  return `FAC-${String(num).padStart(4, "0")}`;
}

// GET /invoices
router.get("/invoices", async (req, res): Promise<void> => {
  const clientId = req.query.clientId ? Number(req.query.clientId) : null;

  let query = db.select().from(invoicesTable).$dynamic();
  if (clientId !== null && !isNaN(clientId)) {
    query = query.where(eq(invoicesTable.clientId, clientId));
  }
  const invoices = await query.orderBy(desc(invoicesTable.createdAt));
  res.json(invoices.map(inv => mapInvoice(inv)));
});

// GET /invoices/:id
router.get("/invoices/:id", async (req, res): Promise<void> => {
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoice.id));
  res.json(mapInvoice(invoice, items));
});

// POST /invoices
router.post("/invoices", async (req, res): Promise<void> => {
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { items, ...invoiceData } = parsed.data;
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discount = invoiceData.discount ?? 0;
  const tax = invoiceData.tax ?? 0;
  const total = subtotal - discount + tax;

  // Auto-fill client data if clientId provided
  let clientName = invoiceData.clientName;
  let clientPhone = invoiceData.clientPhone ?? null;
  let clientEmail = invoiceData.clientEmail ?? null;
  let clientAddress = invoiceData.clientAddress ?? null;
  let clientCity = invoiceData.clientCity ?? null;
  let clientDepartment = invoiceData.clientDepartment ?? null;

  if (invoiceData.clientId) {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, invoiceData.clientId));
    if (client) {
      clientName = client.name;
      clientPhone = client.phone ?? null;
      clientEmail = client.email ?? null;
      clientAddress = client.address ?? null;
      clientCity = client.city;
      clientDepartment = client.department;
    }
  }

  const invoiceNumber = await generateInvoiceNumber();

  const [invoice] = await db.insert(invoicesTable).values({
    invoiceNumber,
    clientId: invoiceData.clientId ?? null,
    clientName,
    clientPhone,
    clientEmail,
    clientAddress,
    clientCity,
    clientDepartment,
    status: "pendiente",
    subtotal: String(subtotal),
    discount: String(discount),
    tax: String(tax),
    total: String(total),
    notes: invoiceData.notes ?? null,
    clientRtn: invoiceData.clientRtn ?? null,
    paymentMethod: invoiceData.paymentMethod ?? "efectivo",
    transferReference: invoiceData.transferReference ?? null,
    issueDate: invoiceData.issueDate,
    dueDate: invoiceData.dueDate ?? null,
    numeroGuia: invoiceData.numeroGuia ?? null,
    transportista: invoiceData.transportista ?? null,
    fotoGuiaPath: invoiceData.fotoGuiaPath ?? null,
    estadoEntrega: invoiceData.estadoEntrega ?? "Pendiente",
    // ── Utilidad Real ─────────────────────────────────────────────────────────
    baseCost: invoiceData.baseCost != null ? String(invoiceData.baseCost) : null,
    internalExpenses: String(invoiceData.internalExpenses ?? 0),
    internalExpensesNote: invoiceData.internalExpensesNote ?? null,
    taxes: String(invoiceData.taxes ?? 0),
    partnerPayout: invoiceData.partnerPayout != null ? String(invoiceData.partnerPayout) : null,
    ownerPayout: invoiceData.ownerPayout != null ? String(invoiceData.ownerPayout) : null,
  }).returning();

  const insertedItems = await db.insert(invoiceItemsTable).values(
    items.map(item => ({
      invoiceId: invoice.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
      total: String(item.quantity * item.unitPrice),
      productId: item.productId ?? null,
      productType: item.productType ?? null,
    }))
  ).returning();

  // Discount stock and create sale records for items linked to products
  for (const item of items) {
    if (!item.productId || !item.productType) continue;

    let productName: string | null = null;
    let costPrice: number | null = null;

    if (item.productType === "perfumeria") {
      const [product] = await db.select().from(perfumeryTable).where(eq(perfumeryTable.id, item.productId));
      if (product) {
        productName = product.name;
        costPrice = Number(product.costPrice ?? 0);
        await db.update(perfumeryTable)
          .set({ stock: product.stock - item.quantity })
          .where(eq(perfumeryTable.id, item.productId));
      }
    } else if (item.productType === "sublimacion") {
      const [product] = await db.select().from(sublimationTable).where(eq(sublimationTable.id, item.productId));
      if (product) {
        productName = product.name;
        costPrice = Number(product.costPrice ?? 0);
        if (product.stock !== null) {
          await db.update(sublimationTable)
            .set({ stock: product.stock - item.quantity })
            .where(eq(sublimationTable.id, item.productId));
        }
      }
    } else if (item.productType === "combo") {
      const [combo] = await db.select().from(combosTable).where(eq(combosTable.id, item.productId));
      if (combo) {
        productName = combo.name;
        
        let totalCost = 0;
        const comboItems = await db.select().from(comboItemsTable).where(eq(comboItemsTable.comboId, combo.id));
        
        for (const cItem of comboItems) {
          if (cItem.productType === "perfumeria") {
            const [cProduct] = await db.select().from(perfumeryTable).where(eq(perfumeryTable.id, cItem.productId));
            if (cProduct) {
              totalCost += Number(cProduct.costPrice ?? 0) * cItem.quantity;
              await db.update(perfumeryTable)
                .set({ stock: cProduct.stock - (cItem.quantity * item.quantity) })
                .where(eq(perfumeryTable.id, cItem.productId));
            }
          } else if (cItem.productType === "sublimacion") {
            const [cProduct] = await db.select().from(sublimationTable).where(eq(sublimationTable.id, cItem.productId));
            if (cProduct) {
              totalCost += Number(cProduct.costPrice ?? 0) * cItem.quantity;
              if (cProduct.stock !== null) {
                await db.update(sublimationTable)
                  .set({ stock: cProduct.stock - (cItem.quantity * item.quantity) })
                  .where(eq(sublimationTable.id, cItem.productId));
              }
            }
          }
        }
        costPrice = totalCost;
      }
    }

    if (productName !== null && costPrice !== null) {
      const totalAmount = item.quantity * item.unitPrice;
      const netProfit = totalAmount - (item.quantity * costPrice);
      await db.insert(salesTable).values({
        invoiceId: invoice.id,
        clientId: invoice.clientId ?? null,
        clientName: invoice.clientName,
        productType: item.productType,
        productId: item.productId,
        productName,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        costPrice: String(costPrice),
        shippingCost: "0",
        totalAmount: String(totalAmount),
        netProfit: String(netProfit),
        notes: `Generado desde factura ${invoiceNumber}`,
        saleDate: invoiceData.issueDate,
      });
    }
  }

  res.status(201).json(mapInvoice(invoice, insertedItems));
});

// PATCH /invoices/:id
router.patch("/invoices/:id", async (req, res): Promise<void> => {
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  const { items, ...updateData } = parsed.data;

  let subtotal = Number(existing.subtotal);
  let discount = updateData.discount ?? Number(existing.discount);
  let tax = updateData.tax ?? Number(existing.tax);

  if (items) {
    subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    await db.delete(salesTable).where(eq(salesTable.invoiceId, params.data.id));
    await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, params.data.id));
    await db.insert(invoiceItemsTable).values(
      items.map(item => ({
        invoiceId: params.data.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        total: String(item.quantity * item.unitPrice),
        productId: item.productId ?? null,
        productType: item.productType ?? null,
      }))
    );

    // Recreate sale records for updated items
    const issueDate = updateData.issueDate ?? existing.issueDate;
    const clientName = updateData.clientName ?? existing.clientName;
    const clientId = existing.clientId;
    const invoiceNumber = existing.invoiceNumber;
    for (const item of items) {
      if (!item.productId || !item.productType) continue;

      let productName: string | null = null;
      let costPrice: number | null = null;

      if (item.productType === "perfumeria") {
        const [product] = await db.select().from(perfumeryTable).where(eq(perfumeryTable.id, item.productId));
        if (product) { productName = product.name; costPrice = Number(product.costPrice ?? 0); }
      } else if (item.productType === "sublimacion") {
        const [product] = await db.select().from(sublimationTable).where(eq(sublimationTable.id, item.productId));
        if (product) { productName = product.name; costPrice = Number(product.costPrice ?? 0); }
      } else if (item.productType === "combo") {
        const [combo] = await db.select().from(combosTable).where(eq(combosTable.id, item.productId));
        if (combo) {
          productName = combo.name;
          let totalCost = 0;
          const comboItems = await db.select().from(comboItemsTable).where(eq(comboItemsTable.comboId, combo.id));
          for (const cItem of comboItems) {
            if (cItem.productType === "perfumeria") {
              const [cProduct] = await db.select().from(perfumeryTable).where(eq(perfumeryTable.id, cItem.productId));
              if (cProduct) totalCost += Number(cProduct.costPrice ?? 0) * cItem.quantity;
            } else if (cItem.productType === "sublimacion") {
              const [cProduct] = await db.select().from(sublimationTable).where(eq(sublimationTable.id, cItem.productId));
              if (cProduct) totalCost += Number(cProduct.costPrice ?? 0) * cItem.quantity;
            }
          }
          costPrice = totalCost;
        }
      }

      if (productName !== null && costPrice !== null) {
        const totalAmount = item.quantity * item.unitPrice;
        const netProfit = totalAmount - (item.quantity * costPrice);
        await db.insert(salesTable).values({
          invoiceId: params.data.id,
          clientId: clientId ?? null,
          clientName,
          productType: item.productType,
          productId: item.productId,
          productName,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          costPrice: String(costPrice),
          shippingCost: "0",
          totalAmount: String(totalAmount),
          netProfit: String(netProfit),
          notes: `Generado desde factura ${invoiceNumber}`,
          saleDate: issueDate,
        });
      }
    }
  }

  const total = subtotal - discount + tax;

  const [updated] = await db.update(invoicesTable).set({
    ...(updateData.status && { status: updateData.status }),
    ...(updateData.clientName && { clientName: updateData.clientName }),
    ...(updateData.clientPhone !== undefined && { clientPhone: updateData.clientPhone ?? null }),
    ...(updateData.clientEmail !== undefined && { clientEmail: updateData.clientEmail ?? null }),
    ...(updateData.clientAddress !== undefined && { clientAddress: updateData.clientAddress ?? null }),
    ...(updateData.clientCity !== undefined && { clientCity: updateData.clientCity ?? null }),
    ...(updateData.clientDepartment !== undefined && { clientDepartment: updateData.clientDepartment ?? null }),
    subtotal: String(subtotal),
    discount: String(discount),
    tax: String(tax),
    total: String(total),
    ...(updateData.notes !== undefined && { notes: updateData.notes ?? null }),
    ...(updateData.clientRtn !== undefined && { clientRtn: updateData.clientRtn ?? null }),
    ...(updateData.paymentMethod && { paymentMethod: updateData.paymentMethod }),
    ...(updateData.transferReference !== undefined && { transferReference: updateData.transferReference ?? null }),
    ...(updateData.issueDate && { issueDate: updateData.issueDate }),
    ...(updateData.dueDate !== undefined && { dueDate: updateData.dueDate ?? null }),
    ...(updateData.numeroGuia !== undefined && { numeroGuia: updateData.numeroGuia ?? null }),
    ...(updateData.transportista !== undefined && { transportista: updateData.transportista ?? null }),
    ...(updateData.fotoGuiaPath !== undefined && { fotoGuiaPath: updateData.fotoGuiaPath ?? null }),
    ...(updateData.estadoEntrega !== undefined && { estadoEntrega: updateData.estadoEntrega }),
    // ── Utilidad Real ─────────────────────────────────────────────────────────
    ...(updateData.baseCost != null && { baseCost: String(updateData.baseCost) }),
    ...(updateData.internalExpenses != null && { internalExpenses: String(updateData.internalExpenses) }),
    ...(updateData.internalExpensesNote !== undefined && { internalExpensesNote: updateData.internalExpensesNote ?? null }),
    ...(updateData.taxes != null && { taxes: String(updateData.taxes) }),
    ...(updateData.partnerPayout != null && { partnerPayout: String(updateData.partnerPayout) }),
    ...(updateData.ownerPayout != null && { ownerPayout: String(updateData.ownerPayout) }),
  }).where(eq(invoicesTable.id, params.data.id)).returning();

  const updatedItems = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, params.data.id));
  res.json(mapInvoice(updated, updatedItems));
});

// POST /invoices/:id/guia
router.post("/invoices/:id/guia", upload.single("foto"), async (req, res): Promise<void> => {
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  if (!req.file) {
    res.status(400).json({ error: "No se proporcionó ninguna imagen de guía." });
    return;
  }

  const fotoGuiaPath = `/guias_evidencia/${req.file.filename}`;
  const numeroGuia = req.body.numeroGuia ?? existing.numeroGuia;
  const transportista = req.body.transportista ?? existing.transportista;
  
  // Update invoice with guide info and set to En Tránsito
  const [updated] = await db.update(invoicesTable).set({
    fotoGuiaPath,
    numeroGuia,
    transportista,
    estadoEntrega: "En Tránsito",
  }).where(eq(invoicesTable.id, params.data.id)).returning();
  
  const updatedItems = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, params.data.id));
  res.json(mapInvoice(updated, updatedItems));
});

// DELETE /invoices/:id
router.delete("/invoices/:id", async (req, res): Promise<void> => {
  const params = DeleteInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  await db.delete(salesTable).where(eq(salesTable.invoiceId, params.data.id));
  await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, params.data.id));
  const [invoice] = await db.delete(invoicesTable).where(eq(invoicesTable.id, params.data.id)).returning();
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.sendStatus(204);
});

export default router;
