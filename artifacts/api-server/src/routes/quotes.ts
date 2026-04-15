import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, quotesTable, quoteItemsTable, invoicesTable, invoiceItemsTable, clientsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

function mapQuote(quote: typeof quotesTable.$inferSelect, items?: typeof quoteItemsTable.$inferSelect[]) {
  return {
    ...quote,
    subtotal: Number(quote.subtotal),
    discount: Number(quote.discount),
    tax: Number(quote.tax),
    total: Number(quote.total),
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
    scheduledPurchaseDate: quote.scheduledPurchaseDate ?? null,
    items: items?.map(item => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
    })),
  };
}

async function generateQuoteNumber(): Promise<string> {
  const [last] = await db
    .select({ quoteNumber: quotesTable.quoteNumber })
    .from(quotesTable)
    .orderBy(desc(quotesTable.id))
    .limit(1);

  if (!last) return "COT-0001";
  const num = parseInt(last.quoteNumber.replace("COT-", "")) + 1;
  return `COT-${String(num).padStart(4, "0")}`;
}

const QuoteItemBody = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  productId: z.number().int().optional(),
  productType: z.string().optional(),
});

const CreateQuoteBody = z.object({
  clientId: z.number().int().optional(),
  clientName: z.string().min(1),
  clientPhone: z.string().optional(),
  clientEmail: z.string().optional(),
  clientAddress: z.string().optional(),
  clientCity: z.string().optional(),
  clientDepartment: z.string().optional(),
  clientRtn: z.string().optional(),
  discount: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  notes: z.string().optional(),
  paymentMethod: z.string().optional(),
  issueDate: z.string().min(1),
  validUntil: z.string().optional(),
  scheduledPurchaseDate: z.string().optional(),
  items: z.array(QuoteItemBody).min(1),
});

const UpdateQuoteBody = z.object({
  clientName: z.string().optional(),
  clientPhone: z.string().optional().nullable(),
  clientEmail: z.string().optional().nullable(),
  clientAddress: z.string().optional().nullable(),
  clientCity: z.string().optional().nullable(),
  clientDepartment: z.string().optional().nullable(),
  clientRtn: z.string().optional().nullable(),
  status: z.enum(["borrador", "enviada", "aceptada", "rechazada", "convertida"]).optional(),
  discount: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  notes: z.string().optional().nullable(),
  paymentMethod: z.string().optional(),
  issueDate: z.string().optional(),
  validUntil: z.string().optional().nullable(),
  scheduledPurchaseDate: z.string().optional().nullable(),
  items: z.array(QuoteItemBody).optional(),
});

// GET /quotes
router.get("/quotes", async (req, res): Promise<void> => {
  const quotes = await db.select().from(quotesTable).orderBy(desc(quotesTable.createdAt));
  res.json(quotes.map(q => mapQuote(q)));
});

// GET /quotes/:id
router.get("/quotes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [quote] = await db.select().from(quotesTable).where(eq(quotesTable.id, id));
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }

  const items = await db.select().from(quoteItemsTable).where(eq(quoteItemsTable.quoteId, id));
  res.json(mapQuote(quote, items));
});

// POST /quotes
router.post("/quotes", async (req, res): Promise<void> => {
  const parsed = CreateQuoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { items, ...quoteData } = parsed.data;
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discount = quoteData.discount ?? 0;
  const tax = quoteData.tax ?? 0;
  const total = subtotal - discount + tax;

  let clientName = quoteData.clientName;
  let clientPhone = quoteData.clientPhone ?? null;
  let clientEmail = quoteData.clientEmail ?? null;
  let clientAddress = quoteData.clientAddress ?? null;
  let clientCity = quoteData.clientCity ?? null;
  let clientDepartment = quoteData.clientDepartment ?? null;

  if (quoteData.clientId) {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, quoteData.clientId));
    if (client) {
      clientName = client.name;
      clientPhone = client.phone ?? null;
      clientEmail = client.email ?? null;
      clientAddress = client.address ?? null;
      clientCity = client.city;
      clientDepartment = client.department;
    }
  }

  const quoteNumber = await generateQuoteNumber();

  const [quote] = await db.insert(quotesTable).values({
    quoteNumber,
    clientId: quoteData.clientId ?? null,
    clientName,
    clientPhone,
    clientEmail,
    clientAddress,
    clientCity,
    clientDepartment,
    clientRtn: quoteData.clientRtn ?? null,
    status: "borrador",
    subtotal: String(subtotal),
    discount: String(discount),
    tax: String(tax),
    total: String(total),
    notes: quoteData.notes ?? null,
    paymentMethod: quoteData.paymentMethod ?? "efectivo",
    issueDate: quoteData.issueDate,
    validUntil: quoteData.validUntil ?? null,
    scheduledPurchaseDate: quoteData.scheduledPurchaseDate ?? null,
    invoiceId: null,
  }).returning();

  const insertedItems = await db.insert(quoteItemsTable).values(
    items.map(item => ({
      quoteId: quote.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
      total: String(item.quantity * item.unitPrice),
      productId: item.productId ?? null,
      productType: item.productType ?? null,
    }))
  ).returning();

  res.status(201).json(mapQuote(quote, insertedItems));
});

// PATCH /quotes/:id
router.patch("/quotes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateQuoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(quotesTable).where(eq(quotesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }

  const { items, ...updateData } = parsed.data;

  let subtotal = Number(existing.subtotal);
  let discount = updateData.discount ?? Number(existing.discount);
  let tax = updateData.tax ?? Number(existing.tax);

  if (items) {
    subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    await db.delete(quoteItemsTable).where(eq(quoteItemsTable.quoteId, id));
    await db.insert(quoteItemsTable).values(
      items.map(item => ({
        quoteId: id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        total: String(item.quantity * item.unitPrice),
        productId: item.productId ?? null,
        productType: item.productType ?? null,
      }))
    );
  }

  const total = subtotal - discount + tax;

  const [updated] = await db.update(quotesTable).set({
    ...(updateData.status && { status: updateData.status }),
    ...(updateData.clientName && { clientName: updateData.clientName }),
    ...(updateData.clientPhone !== undefined && { clientPhone: updateData.clientPhone ?? null }),
    ...(updateData.clientEmail !== undefined && { clientEmail: updateData.clientEmail ?? null }),
    ...(updateData.clientAddress !== undefined && { clientAddress: updateData.clientAddress ?? null }),
    ...(updateData.clientCity !== undefined && { clientCity: updateData.clientCity ?? null }),
    ...(updateData.clientDepartment !== undefined && { clientDepartment: updateData.clientDepartment ?? null }),
    ...(updateData.clientRtn !== undefined && { clientRtn: updateData.clientRtn ?? null }),
    subtotal: String(subtotal),
    discount: String(discount),
    tax: String(tax),
    total: String(total),
    ...(updateData.notes !== undefined && { notes: updateData.notes ?? null }),
    ...(updateData.paymentMethod && { paymentMethod: updateData.paymentMethod }),
    ...(updateData.issueDate && { issueDate: updateData.issueDate }),
    ...(updateData.validUntil !== undefined && { validUntil: updateData.validUntil ?? null }),
    ...(updateData.scheduledPurchaseDate !== undefined && { scheduledPurchaseDate: updateData.scheduledPurchaseDate ?? null }),
  }).where(eq(quotesTable.id, id)).returning();

  const updatedItems = await db.select().from(quoteItemsTable).where(eq(quoteItemsTable.quoteId, id));
  res.json(mapQuote(updated, updatedItems));
});

// DELETE /quotes/:id
router.delete("/quotes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(quoteItemsTable).where(eq(quoteItemsTable.quoteId, id));
  const [quote] = await db.delete(quotesTable).where(eq(quotesTable.id, id)).returning();
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }

  res.sendStatus(204);
});

// POST /quotes/:id/convert — convert quote to invoice
router.post("/quotes/:id/convert", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [quote] = await db.select().from(quotesTable).where(eq(quotesTable.id, id));
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }

  if (quote.status === "convertida") {
    res.status(400).json({ error: "Quote is already converted" });
    return;
  }

  const quoteItems = await db.select().from(quoteItemsTable).where(eq(quoteItemsTable.quoteId, id));

  // Generate invoice number
  const [lastInvoice] = await db
    .select({ invoiceNumber: invoicesTable.invoiceNumber })
    .from(invoicesTable)
    .orderBy(desc(invoicesTable.id))
    .limit(1);

  const invoiceNum = lastInvoice
    ? parseInt(lastInvoice.invoiceNumber.replace("FAC-", "")) + 1
    : 1;
  const invoiceNumber = `FAC-${String(invoiceNum).padStart(4, "0")}`;

  const [invoice] = await db.insert(invoicesTable).values({
    invoiceNumber,
    clientId: quote.clientId ?? null,
    clientName: quote.clientName,
    clientPhone: quote.clientPhone ?? null,
    clientEmail: quote.clientEmail ?? null,
    clientAddress: quote.clientAddress ?? null,
    clientCity: quote.clientCity ?? null,
    clientDepartment: quote.clientDepartment ?? null,
    clientRtn: quote.clientRtn ?? null,
    status: "pendiente",
    subtotal: quote.subtotal,
    discount: quote.discount,
    tax: quote.tax,
    total: quote.total,
    notes: quote.notes ?? null,
    paymentMethod: quote.paymentMethod,
    transferReference: null,
    issueDate: quote.issueDate,
    dueDate: quote.validUntil ?? null,
  }).returning();

  if (quoteItems.length > 0) {
    await db.insert(invoiceItemsTable).values(
      quoteItems.map(item => ({
        invoiceId: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
        productId: item.productId ?? null,
        productType: item.productType ?? null,
      }))
    );
  }

  // Mark quote as converted
  await db.update(quotesTable).set({
    status: "convertida",
    invoiceId: invoice.id,
  }).where(eq(quotesTable.id, id));

  res.status(201).json({
    ...invoice,
    subtotal: Number(invoice.subtotal),
    discount: Number(invoice.discount),
    tax: Number(invoice.tax),
    total: Number(invoice.total),
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  });
});

export default router;
