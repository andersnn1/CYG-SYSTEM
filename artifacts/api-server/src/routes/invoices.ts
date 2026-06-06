import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, invoicesTable, invoiceItemsTable, clientsTable, perfumeryTable, sublimationTable, salesTable, combosTable, comboItemsTable, journalEntriesTable, invoicePaymentsTable } from "@workspace/db";
import { injectJournalEntry, isPeriodLocked } from "../lib/accounting-service";
import {
  CreateInvoiceBody,
  UpdateInvoiceBody,
  GetInvoiceParams,
  DeleteInvoiceParams,
} from "@workspace/api-zod";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary (uses env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Use memory storage — files are held in RAM then uploaded to Cloudinary
const upload = multer({ storage: multer.memoryStorage() });

const router: IRouter = Router();

function mapInvoice(
  invoice: typeof invoicesTable.$inferSelect, 
  items?: typeof invoiceItemsTable.$inferSelect[],
  payments?: typeof invoicePaymentsTable.$inferSelect[]
) {
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
    payments: payments?.map(p => ({
      ...p,
      amount: Number(p.amount),
      createdAt: p.createdAt.toISOString(),
    })) || [],
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
  const lastNumStr = last.invoiceNumber.split("-")[1];
  const lastNum = parseInt(lastNumStr);
  if (isNaN(lastNum)) return `FAC-${Math.floor(Math.random() * 10000)}`; 
  const num = lastNum + 1;
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
  const payments = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, invoice.id));
  res.json(mapInvoice(invoice, items, payments));
});

// POST /invoices
router.post("/invoices", async (req, res): Promise<void> => {
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    console.log("INVOICE POST PAYLOAD:", JSON.stringify(parsed.data, null, 2));
    const { items, ...invoiceData } = parsed.data;
    if (await isPeriodLocked(invoiceData.issueDate)) {
      res.status(400).json({ error: `El período contable para la fecha ${invoiceData.issueDate} está cerrado.` });
      return;
    }
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
      status: invoiceData.status ?? (
        (invoiceData.paymentMethod === "efectivo" || invoiceData.paymentMethod === "tarjeta" || invoiceData.transferReference)
          ? "pagada"
          : "pendiente"
      ),
      subtotal: String(subtotal),
      discount: String(discount),
      tax: String(tax),
      total: String(total),
      notes: invoiceData.notes ?? null,
      clientRtn: invoiceData.clientRtn ?? null,
      paymentMethod: invoiceData.paymentMethod ?? "efectivo",
      transferReference: invoiceData.transferReference ?? null,
      issueDate: invoiceData.issueDate,
      dueDate: invoiceData.dueDate ? invoiceData.dueDate : null,
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

    let insertedPayment: typeof invoicePaymentsTable.$inferSelect | undefined;

    // Solo descontar stock, crear registro de venta e inyectar asientos si NO es borrador
    if (invoice.status !== "borrador") {
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

      const subtotal_perfumeria = items
        .filter(it => it.productType === "perfumeria")
        .reduce((sum, it) => sum + (it.quantity * it.unitPrice), 0);
      const subtotal_sublimacion = items
        .filter(it => it.productType === "sublimacion" || it.productType === "combo")
        .reduce((sum, it) => sum + (it.quantity * it.unitPrice), 0);

      await injectJournalEntry(
        "invoice_created",
        invoiceData.issueDate,
        `Invoice_${invoice.id}`,
        {
          subtotal: Number(subtotal),
          subtotal_perfumeria,
          subtotal_sublimacion,
          discount: Number(discount),
          tax: Number(tax),
          total: Number(total),
        },
        `Emisión de Factura ${invoiceNumber} - ${clientName}`
      );

      if (invoice.status === "pagada") {
        const [payment] = await db.insert(invoicePaymentsTable).values({
          invoiceId: invoice.id,
          amount: invoice.total,
          paymentMethod: invoice.paymentMethod,
          transferReference: invoice.transferReference ?? null,
          paymentDate: invoice.issueDate,
        }).returning();
        insertedPayment = payment;

        const baseCostVal = invoice.baseCost ? Number(invoice.baseCost) : 0;
        if (baseCostVal > 0) {
          const internalExpensesVal = invoice.internalExpenses ? Number(invoice.internalExpenses) : 0;
          const partnerPayoutVal = invoice.partnerPayout ? Number(invoice.partnerPayout) : 0;
          const ownerPayoutVal = invoice.ownerPayout ? Number(invoice.ownerPayout) : 0;

          await injectJournalEntry(
            "invoice_paid_back_to_back",
            invoice.issueDate,
            `InvoicePayment_${invoice.id}`,
            {
              total: Number(invoice.total),
              baseCost: baseCostVal,
              internalExpenses: internalExpensesVal,
              partnerPayout: partnerPayoutVal,
              ownerPayoutOperativa: ownerPayoutVal * 0.50,
              ownerPayoutPersonal: ownerPayoutVal * 0.40,
              ownerPayoutUtilidad: ownerPayoutVal * 0.10,
            },
            `Cobro de Factura Back-to-Back ${invoice.invoiceNumber} - ${invoice.clientName}`
          );
        } else {
          await injectJournalEntry(
            "invoice_paid",
            invoice.issueDate,
            `InvoicePayment_${invoice.id}`,
            {
              total: Number(invoice.total),
            },
            `Cobro de Factura ${invoice.invoiceNumber} - ${invoice.clientName}`
          );
        }
      }
    }

    res.status(201).json(mapInvoice(invoice, insertedItems, insertedPayment ? [insertedPayment] : []));
  } catch (err: any) {
    console.error("CRITICAL ERROR POST /invoices:", err);
    res.status(500).json({ error: "Error al generar factura: " + err.message });
  }
});

// PATCH /invoices/:id
router.patch("/invoices/:id", async (req, res): Promise<void> => {
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  if (await isPeriodLocked(existing.issueDate)) {
    res.status(400).json({ error: `El período contable para la fecha original de esta factura (${existing.issueDate}) está cerrado.` });
    return;
  }

  const { items, ...updateData } = parsed.data;
  const issueDate = updateData.issueDate || existing.issueDate;
  if (await isPeriodLocked(issueDate)) {
    res.status(400).json({ error: `El período contable para la nueva fecha de esta factura (${issueDate}) está cerrado.` });
    return;
  }

  // RESTRICCIÓN DE MODIFICACIÓN CONTABLE Y DE ARTÍCULOS PARA FACTURAS EMITIDAS/PAGADAS
  const isSubmitted = existing.status === "pendiente" || existing.status === "pagada";
  if (isSubmitted) {
    const hasFinancialChanges = 
      items !== undefined ||
      updateData.clientName !== undefined ||
      updateData.clientRtn !== undefined ||
      updateData.discount !== undefined ||
      updateData.tax !== undefined ||
      updateData.baseCost !== undefined ||
      updateData.internalExpenses !== undefined ||
      updateData.partnerPayout !== undefined ||
      updateData.ownerPayout !== undefined ||
      (updateData.issueDate !== undefined && updateData.issueDate !== existing.issueDate);

    if (hasFinancialChanges) {
      res.status(400).json({ error: "No se pueden modificar datos financieros de una factura confirmada. Debe anularse y crearse otra." });
      return;
    }
  }

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
    ...(updateData.dueDate !== undefined && { dueDate: updateData.dueDate ? updateData.dueDate : null }),
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

  const wasBorrador = existing.status === "borrador";
  const isNowSubmitted = updated.status === "pendiente" || updated.status === "pagada";

  // Si pasa a estar confirmada/pagada (Submit), descontamos inventario, creamos ventas e inyectamos asientos
  if (isNowSubmitted) {
    if (wasBorrador) {
      const currentItems = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, updated.id));
      for (const item of currentItems) {
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
          const totalAmount = item.quantity * Number(item.unitPrice);
          const netProfit = totalAmount - (item.quantity * costPrice);
          await db.insert(salesTable).values({
            invoiceId: updated.id,
            clientId: updated.clientId ?? null,
            clientName: updated.clientName,
            productType: item.productType,
            productId: item.productId,
            productName,
            quantity: item.quantity,
            unitPrice: String(item.unitPrice),
            costPrice: String(costPrice),
            shippingCost: "0",
            totalAmount: String(totalAmount),
            netProfit: String(netProfit),
            notes: `Generado desde factura ${updated.invoiceNumber}`,
            saleDate: updated.issueDate,
          });
        }
      }
    }

    // Update invoice_created journal entry
    let dbItems = items;
    if (!dbItems) {
      const fetched = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, updated.id));
      dbItems = fetched.map(it => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        productId: it.productId ?? undefined,
        productType: (it.productType as any) ?? undefined,
      }));
    }

    const subtotal_perfumeria = dbItems
      .filter(it => it.productType === "perfumeria")
      .reduce((sum, it) => sum + (it.quantity * it.unitPrice), 0);
    const subtotal_sublimacion = dbItems
      .filter(it => it.productType === "sublimacion" || it.productType === "combo")
      .reduce((sum, it) => sum + (it.quantity * it.unitPrice), 0);

    await injectJournalEntry(
      "invoice_created",
      updated.issueDate,
      `Invoice_${updated.id}`,
      {
        subtotal: Number(updated.subtotal),
        subtotal_perfumeria,
        subtotal_sublimacion,
        discount: Number(updated.discount),
        tax: Number(updated.tax),
        total: Number(updated.total),
      },
      `Emisión de Factura ${updated.invoiceNumber} - ${updated.clientName}`
    );

    // If status is pagada, record/update the receipt journal entry
    if (updated.status === "pagada") {
      const [existingPayment] = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, params.data.id));
      if (!existingPayment) {
        await db.insert(invoicePaymentsTable).values({
          invoiceId: updated.id,
          amount: updated.total,
          paymentMethod: updated.paymentMethod,
          transferReference: updated.transferReference ?? null,
          paymentDate: updated.issueDate,
        });
      } else {
        await db.update(invoicePaymentsTable).set({
          amount: updated.total,
          paymentMethod: updated.paymentMethod,
          transferReference: updated.transferReference ?? null,
          paymentDate: updated.issueDate,
        }).where(eq(invoicePaymentsTable.id, existingPayment.id));
      }

      const baseCostVal = updated.baseCost ? Number(updated.baseCost) : 0;
      if (baseCostVal > 0) {
        const internalExpensesVal = updated.internalExpenses ? Number(updated.internalExpenses) : 0;
        const partnerPayoutVal = updated.partnerPayout ? Number(updated.partnerPayout) : 0;
        const ownerPayoutVal = updated.ownerPayout ? Number(updated.ownerPayout) : 0;

        await injectJournalEntry(
          "invoice_paid_back_to_back",
          updated.issueDate,
          `InvoicePayment_${updated.id}`,
          {
            total: Number(updated.total),
            baseCost: baseCostVal,
            internalExpenses: internalExpensesVal,
            partnerPayout: partnerPayoutVal,
            ownerPayoutOperativa: ownerPayoutVal * 0.50,
            ownerPayoutPersonal: ownerPayoutVal * 0.40,
            ownerPayoutUtilidad: ownerPayoutVal * 0.10,
          },
          `Cobro de Factura Back-to-Back ${updated.invoiceNumber} - ${updated.clientName}`
        );
      } else {
        await injectJournalEntry(
          "invoice_paid",
          updated.issueDate,
          `InvoicePayment_${updated.id}`,
          {
            total: Number(updated.total),
          },
          `Cobro de Factura ${updated.invoiceNumber} - ${updated.clientName}`
        );
      }
    } else {
      // If reverted from paid, delete the payment records and journal entries
      await db.delete(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, params.data.id));
      await db.delete(journalEntriesTable).where(eq(journalEntriesTable.referenceSource, `InvoicePayment_${updated.id}`));
    }
  }

  const updatedItems = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, params.data.id));
  const updatedPayments = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, params.data.id));
  res.json(mapInvoice(updated, updatedItems, updatedPayments));
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

  try {
    // Upload to Cloudinary from memory buffer
    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "cyg-guias",
          public_id: `guia_${params.data.id}`,
          overwrite: true,
          resource_type: "auto",
        },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve(result as { secure_url: string });
        }
      );
      stream.end(req.file!.buffer);
    });

    const fotoGuiaPath = uploadResult.secure_url;
    const numeroGuia = req.body.numeroGuia ?? existing.numeroGuia;
    const transportista = req.body.transportista ?? existing.transportista;

    const [updated] = await db.update(invoicesTable).set({
      fotoGuiaPath,
      numeroGuia,
      transportista,
      estadoEntrega: "En Tránsito",
    }).where(eq(invoicesTable.id, params.data.id)).returning();

    const updatedItems = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, params.data.id));
    res.json(mapInvoice(updated, updatedItems));
  } catch (err: any) {
    console.error("Error uploading to Cloudinary:", err);
    res.status(500).json({ error: "Error al subir imagen: " + err.message });
  }
});

// DELETE /invoices/:id
router.delete("/invoices/:id", async (req, res): Promise<void> => {
  const params = DeleteInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  if (await isPeriodLocked(existing.issueDate)) {
    res.status(400).json({ error: `El período contable para la fecha de esta factura (${existing.issueDate}) está cerrado.` });
    return;
  }

  // RESTRICCIÓN: No permitir eliminar facturas emitidas o pagadas
  if (existing.status === "pendiente" || existing.status === "pagada") {
    res.status(400).json({ error: "No se pueden eliminar facturas confirmadas/pagadas. Debe anularlas primero." });
    return;
  }

  // Delete associated journal entries
  await db.delete(journalEntriesTable).where(eq(journalEntriesTable.referenceSource, `Invoice_${params.data.id}`));
  await db.delete(journalEntriesTable).where(eq(journalEntriesTable.referenceSource, `InvoicePayment_${params.data.id}`));

  await db.delete(salesTable).where(eq(salesTable.invoiceId, params.data.id));
  await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, params.data.id));
  await db.delete(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  res.sendStatus(204);
});

// POST /invoices/:id/cancel
router.post("/invoices/:id/cancel", async (req, res): Promise<void> => {
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  try {
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

    if (invoice.status === "cancelada") {
      res.status(400).json({ error: "La factura ya está anulada." });
      return;
    }

    if (await isPeriodLocked(invoice.issueDate)) {
      res.status(400).json({ error: `El período contable para la fecha de esta factura (${invoice.issueDate}) está cerrado.` });
      return;
    }

    // 1. Revertir stock (devolver cantidades al inventario)
    const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoice.id));
    for (const item of items) {
      if (!item.productId || !item.productType) continue;

      if (item.productType === "perfumeria") {
        const [product] = await db.select().from(perfumeryTable).where(eq(perfumeryTable.id, item.productId));
        if (product) {
          await db.update(perfumeryTable)
            .set({ stock: product.stock + item.quantity })
            .where(eq(perfumeryTable.id, item.productId));
        }
      } else if (item.productType === "sublimacion") {
        const [product] = await db.select().from(sublimationTable).where(eq(sublimationTable.id, item.productId));
        if (product) {
          if (product.stock !== null) {
            await db.update(sublimationTable)
              .set({ stock: product.stock + item.quantity })
              .where(eq(sublimationTable.id, item.productId));
          }
        }
      } else if (item.productType === "combo") {
        const [combo] = await db.select().from(combosTable).where(eq(combosTable.id, item.productId));
        if (combo) {
          const comboItems = await db.select().from(comboItemsTable).where(eq(comboItemsTable.comboId, combo.id));
          for (const cItem of comboItems) {
            if (cItem.productType === "perfumeria") {
              const [cProduct] = await db.select().from(perfumeryTable).where(eq(perfumeryTable.id, cItem.productId));
              if (cProduct) {
                await db.update(perfumeryTable)
                  .set({ stock: cProduct.stock + (cItem.quantity * item.quantity) })
                  .where(eq(perfumeryTable.id, cItem.productId));
              }
            } else if (cItem.productType === "sublimacion") {
              const [cProduct] = await db.select().from(sublimationTable).where(eq(sublimationTable.id, cItem.productId));
              if (cProduct) {
                if (cProduct.stock !== null) {
                  await db.update(sublimationTable)
                    .set({ stock: cProduct.stock + (cItem.quantity * item.quantity) })
                    .where(eq(sublimationTable.id, cItem.productId));
                }
              }
            }
          }
        }
      }
    }

    // 2. Eliminar registros de venta
    await db.delete(salesTable).where(eq(salesTable.invoiceId, invoice.id));

    // 3. Eliminar pagos asociados
    await db.delete(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, invoice.id));

    // 4. Eliminar asientos contables asociados
    await db.delete(journalEntriesTable).where(eq(journalEntriesTable.referenceSource, `Invoice_${invoice.id}`));
    await db.delete(journalEntriesTable).where(eq(journalEntriesTable.referenceSource, `InvoicePayment_${invoice.id}`));

    // 5. Marcar como anulada en la base de datos
    const [updated] = await db.update(invoicesTable)
      .set({ status: "cancelada" })
      .where(eq(invoicesTable.id, invoice.id))
      .returning();

    const updatedItems = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoice.id));
    res.json(mapInvoice(updated, updatedItems));
  } catch (err: any) {
    console.error("Error al anular factura:", err);
    res.status(500).json({ error: "Error al anular factura: " + err.message });
  }
});

export default router;
