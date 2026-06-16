import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, invoicesTable, invoiceItemsTable, clientsTable, perfumeryTable, sublimationTable, salesTable, combosTable, comboItemsTable, journalEntriesTable, invoicePaymentsTable } from "@workspace/db";
import { injectJournalEntry, isPeriodLocked, registrarCompraInventario } from "../lib/accounting-service";
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
      costPrice: item.costPrice ? Number(item.costPrice) : 0,
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
      isBackToBack: invoiceData.isBackToBack ?? false,
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
        costPrice: item.costPrice != null ? String(item.costPrice) : null,
      }))
    ).returning();

    let insertedPayment: typeof invoicePaymentsTable.$inferSelect | undefined;

    // Solo descontar stock, crear registro de venta e inyectar asientos si NO es borrador
    if (invoice.status !== "borrador") {
      // Registrar compras en inventario si es Back-to-Back
      if (invoice.isBackToBack) {
        for (const item of items) {
          if (!item.productId || !item.productType) continue;
          if (item.productType === "perfumeria" || item.productType === "sublimacion") {
            const purchaseCost = item.costPrice ? Number(item.costPrice) : 0;
            await registrarCompraInventario(
              item.productType,
              item.productId,
              item.quantity,
              purchaseCost,
              invoice.issueDate,
              invoice.id
            );
          }
        }
      }

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

      const baseCostVal = invoice.baseCost ? Number(invoice.baseCost) : 0;
      const totalVal = Number(invoice.total);
      const margenRealVal = totalVal - baseCostVal;
      const partnerPayoutVal = margenRealVal * 0.50;
      const remanenteVal = margenRealVal * 0.50;
      const bancoOpexVal = baseCostVal + (remanenteVal * 0.50);
      const bancoSueldoDuenoVal = remanenteVal * 0.40;
      const bancoUtilidadVal = remanenteVal * 0.10;

      if (invoice.status === "pagada") {
        const [payment] = await db.insert(invoicePaymentsTable).values({
          invoiceId: invoice.id,
          amount: invoice.total,
          paymentMethod: invoice.paymentMethod,
          transferReference: invoice.transferReference ?? null,
          paymentDate: invoice.issueDate,
        }).returning();
        insertedPayment = payment;

        if (invoice.isBackToBack) {
          const internalExpensesVal = invoice.internalExpenses ? Number(invoice.internalExpenses) : 0;
          const margenRealVal = Number((totalVal - baseCostVal - internalExpensesVal).toFixed(2));
          const partnerPayoutVal = Number((margenRealVal * 0.50).toFixed(2));
          const remanenteVal = Number((margenRealVal * 0.50).toFixed(2));
          const ownerPayoutOperativaVal = Number((remanenteVal * 0.50).toFixed(2));
          const ownerPayoutPersonalVal = Number((remanenteVal * 0.40).toFixed(2));
          const ownerPayoutUtilidadVal = Number((remanenteVal - ownerPayoutOperativaVal - ownerPayoutPersonalVal).toFixed(2));

          await injectJournalEntry(
            "invoice_paid_back_to_back",
            invoice.issueDate,
            `Invoice_${invoice.id}`,
            {
              ownerPayoutOperativa: ownerPayoutOperativaVal,
              ownerPayoutPersonal: ownerPayoutPersonalVal,
              ownerPayoutUtilidad: ownerPayoutUtilidadVal,
              partnerPayout: partnerPayoutVal,
              baseCost: baseCostVal,
              internalExpenses: internalExpensesVal,
              total: totalVal,
            },
            `Venta Directa al Contado Factura Back-to-Back ${invoiceNumber} - ${clientName}`
          );
        } else {
          await injectJournalEntry(
            "invoice_direct_sale",
            invoice.issueDate,
            `Invoice_${invoice.id}`,
            {
              subtotal: Number(subtotal),
              subtotal_perfumeria,
              subtotal_sublimacion,
              total: totalVal,
              baseCost: baseCostVal,
              partnerPayout: partnerPayoutVal,
              bancoOpex: bancoOpexVal,
              bancoSueldoDueno: bancoSueldoDuenoVal,
              bancoUtilidad: bancoUtilidadVal,
            },
            `Venta Directa al Contado Factura ${invoiceNumber} - ${clientName}`
          );
        }
      } else {
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

  const existingItems = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, existing.id));

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
    const itemsChanged = items !== undefined && !(
      items.length === existingItems.length &&
      items.every((it, idx) => {
        const ext = existingItems[idx];
        return (
          Number(it.quantity) === Number(ext.quantity) &&
          Number(it.unitPrice) === Number(ext.unitPrice) &&
          it.description === ext.description
        );
      })
    );

    const hasFinancialChanges = 
      itemsChanged ||
      (updateData.clientName !== undefined && updateData.clientName !== existing.clientName) ||
      (updateData.clientRtn !== undefined && updateData.clientRtn !== existing.clientRtn) ||
      (updateData.discount !== undefined && Number(updateData.discount) !== Number(existing.discount)) ||
      (updateData.tax !== undefined && Number(updateData.tax) !== Number(existing.tax)) ||
      (updateData.issueDate !== undefined && updateData.issueDate !== existing.issueDate);

    if (hasFinancialChanges) {
      res.status(400).json({ error: "No se pueden modificar datos financieros de una factura confirmada. Debe anularse y crearse otra." });
      return;
    }
  }

  let subtotal = Number(existing.subtotal);
  let discount = updateData.discount ?? Number(existing.discount);
  let tax = updateData.tax ?? Number(existing.tax);

  // Solo actualizar items si NO está confirmada/pagada (es borrador)
  if (!isSubmitted && items) {
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
        costPrice: item.costPrice != null ? String(item.costPrice) : null,
      }))
    );
  }

  const total = isSubmitted ? Number(existing.total) : (subtotal - discount + tax);

  const [updated] = await db.update(invoicesTable).set({
    ...(updateData.status && { status: updateData.status }),
    ...(updateData.clientName && !isSubmitted && { clientName: updateData.clientName }),
    ...(updateData.clientPhone !== undefined && { clientPhone: updateData.clientPhone ?? null }),
    ...(updateData.clientEmail !== undefined && { clientEmail: updateData.clientEmail ?? null }),
    ...(updateData.clientAddress !== undefined && { clientAddress: updateData.clientAddress ?? null }),
    ...(updateData.clientCity !== undefined && { clientCity: updateData.clientCity ?? null }),
    ...(updateData.clientDepartment !== undefined && { clientDepartment: updateData.clientDepartment ?? null }),
    subtotal: isSubmitted ? existing.subtotal : String(subtotal),
    discount: isSubmitted ? existing.discount : String(discount),
    tax: isSubmitted ? existing.tax : String(tax),
    total: isSubmitted ? existing.total : String(total),
    ...(updateData.notes !== undefined && { notes: updateData.notes ?? null }),
    ...(updateData.clientRtn !== undefined && !isSubmitted && { clientRtn: updateData.clientRtn ?? null }),
    ...(updateData.paymentMethod && { paymentMethod: updateData.paymentMethod }),
    ...(updateData.transferReference !== undefined && { transferReference: updateData.transferReference ?? null }),
    ...(updateData.issueDate && !isSubmitted && { issueDate: updateData.issueDate }),
    ...(updateData.dueDate !== undefined && { dueDate: updateData.dueDate ? updateData.dueDate : null }),
    ...(updateData.numeroGuia !== undefined && { numeroGuia: updateData.numeroGuia ?? null }),
    ...(updateData.transportista !== undefined && { transportista: updateData.transportista ?? null }),
    ...(updateData.fotoGuiaPath !== undefined && { fotoGuiaPath: updateData.fotoGuiaPath ?? null }),
    ...(updateData.estadoEntrega !== undefined && { estadoEntrega: updateData.estadoEntrega }),
    isBackToBack: updateData.isBackToBack !== undefined ? updateData.isBackToBack : existing.isBackToBack,
    // ── Utilidad Real ─────────────────────────────────────────────────────────
    baseCost: isSubmitted ? existing.baseCost : (updateData.baseCost != null ? String(updateData.baseCost) : existing.baseCost),
    internalExpenses: isSubmitted ? existing.internalExpenses : (updateData.internalExpenses != null ? String(updateData.internalExpenses) : existing.internalExpenses),
    internalExpensesNote: isSubmitted ? existing.internalExpensesNote : (updateData.internalExpensesNote !== undefined ? (updateData.internalExpensesNote ?? null) : existing.internalExpensesNote),
    taxes: isSubmitted ? existing.taxes : (updateData.taxes != null ? String(updateData.taxes) : existing.taxes),
    partnerPayout: isSubmitted ? existing.partnerPayout : (updateData.partnerPayout != null ? String(updateData.partnerPayout) : existing.partnerPayout),
    ownerPayout: isSubmitted ? existing.ownerPayout : (updateData.ownerPayout != null ? String(updateData.ownerPayout) : existing.ownerPayout),
  }).where(eq(invoicesTable.id, params.data.id)).returning();

  const wasBorrador = existing.status === "borrador";
  const isNowSubmitted = updated.status === "pendiente" || updated.status === "pagada";

  // Si pasa a estar confirmada/pagada (Submit), descontamos inventario, creamos ventas e inyectamos asientos
  if (isNowSubmitted) {
    if (wasBorrador) {
      const currentItems = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, updated.id));
      
      // Registrar compras en inventario si es Back-to-Back
      if (updated.isBackToBack) {
        for (const item of currentItems) {
          if (!item.productId || !item.productType) continue;
          if (item.productType === "perfumeria" || item.productType === "sublimacion") {
            const purchaseCost = item.costPrice ? Number(item.costPrice) : 0;
            await registrarCompraInventario(
              item.productType,
              item.productId,
              item.quantity,
              purchaseCost,
              updated.issueDate,
              updated.id
            );
          }
        }
      }

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

    const baseCostVal = updated.baseCost ? Number(updated.baseCost) : 0;
    const totalVal = Number(updated.total);
    const margenRealVal = totalVal - baseCostVal;
    const partnerPayoutVal = margenRealVal * 0.50;
    const remanenteVal = margenRealVal * 0.50;
    const bancoOpexVal = baseCostVal + (remanenteVal * 0.50);
    const bancoSueldoDuenoVal = remanenteVal * 0.40;
    const bancoUtilidadVal = remanenteVal * 0.10;

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

      if (wasBorrador) {
        // Venta directa desde borrador (se emite como pagada inmediatamente)
        if (updated.isBackToBack) {
          const internalExpensesVal = updated.internalExpenses ? Number(updated.internalExpenses) : 0;
          const margenRealVal = Number((totalVal - baseCostVal - internalExpensesVal).toFixed(2));
          const partnerPayoutVal = Number((margenRealVal * 0.50).toFixed(2));
          const remanenteVal = Number((margenRealVal * 0.50).toFixed(2));
          const ownerPayoutOperativaVal = Number((remanenteVal * 0.50).toFixed(2));
          const ownerPayoutPersonalVal = Number((remanenteVal * 0.40).toFixed(2));
          const ownerPayoutUtilidadVal = Number((remanenteVal - ownerPayoutOperativaVal - ownerPayoutPersonalVal).toFixed(2));

          await injectJournalEntry(
            "invoice_paid_back_to_back",
            updated.issueDate,
            `Invoice_${updated.id}`,
            {
              ownerPayoutOperativa: ownerPayoutOperativaVal,
              ownerPayoutPersonal: ownerPayoutPersonalVal,
              ownerPayoutUtilidad: ownerPayoutUtilidadVal,
              partnerPayout: partnerPayoutVal,
              baseCost: baseCostVal,
              internalExpenses: internalExpensesVal,
              total: totalVal,
            },
            `Venta Directa al Contado Factura Back-to-Back ${updated.invoiceNumber} - ${updated.clientName}`
          );
        } else {
          await injectJournalEntry(
            "invoice_direct_sale",
            updated.issueDate,
            `Invoice_${updated.id}`,
            {
              subtotal: Number(updated.subtotal),
              subtotal_perfumeria,
              subtotal_sublimacion,
              total: totalVal,
              baseCost: baseCostVal,
              partnerPayout: partnerPayoutVal,
              bancoOpex: bancoOpexVal,
              bancoSueldoDueno: bancoSueldoDuenoVal,
              bancoUtilidad: bancoUtilidadVal,
            },
            `Venta Directa al Contado Factura ${updated.invoiceNumber} - ${updated.clientName}`
          );
        }
      } else {
        // Cobro de factura pendiente (Apartado)
        // GUARDIA ANTI-DOBLE-REGISTRO: Evita duplicidad de cobro si ya fue registrada como venta directa al contado
        const [hasDirectSale] = await db
          .select()
          .from(journalEntriesTable)
          .where(
            and(
              eq(journalEntriesTable.referenceSource, `Invoice_${updated.id}`),
              sql`(${journalEntriesTable.narration} LIKE '%Venta Directa%' OR ${journalEntriesTable.narration} LIKE '%Venta al Contado%')`
            )
          );

        if (hasDirectSale) {
          console.warn(`[GUARDIA] Se omitió inyectar asiento de cobro para factura ${updated.id} porque ya tiene un asiento de venta directa al contado registrado.`);
        } else {
          if (updated.isBackToBack) {
            const internalExpensesVal = updated.internalExpenses ? Number(updated.internalExpenses) : 0;
            const margenRealVal = Number((totalVal - baseCostVal - internalExpensesVal).toFixed(2));
            const partnerPayoutVal = Number((margenRealVal * 0.50).toFixed(2));
            const remanenteVal = Number((margenRealVal * 0.50).toFixed(2));
            const ownerPayoutOperativaVal = Number((remanenteVal * 0.50).toFixed(2));
            const ownerPayoutPersonalVal = Number((remanenteVal * 0.40).toFixed(2));
            const ownerPayoutUtilidadVal = Number((remanenteVal - ownerPayoutOperativaVal - ownerPayoutPersonalVal).toFixed(2));

            await injectJournalEntry(
              "invoice_paid_back_to_back",
              updated.issueDate,
              `InvoicePayment_${updated.id}`,
              {
                ownerPayoutOperativa: ownerPayoutOperativaVal,
                ownerPayoutPersonal: ownerPayoutPersonalVal,
                ownerPayoutUtilidad: ownerPayoutUtilidadVal,
                partnerPayout: partnerPayoutVal,
                baseCost: baseCostVal,
                internalExpenses: internalExpensesVal,
                total: totalVal,
              },
              `Cobro de Factura Back-to-Back ${updated.invoiceNumber} - ${updated.clientName}`
            );
          } else if (baseCostVal > 0) {
            await injectJournalEntry(
              "invoice_paid_apartado",
              updated.issueDate,
              `InvoicePayment_${updated.id}`,
              {
                total: totalVal,
                baseCost: baseCostVal,
                partnerPayout: partnerPayoutVal,
                bancoOpex: bancoOpexVal,
                bancoSueldoDueno: bancoSueldoDuenoVal,
                bancoUtilidad: bancoUtilidadVal,
              },
              `Cobro de Factura (Apartado) ${updated.invoiceNumber} - ${updated.clientName}`
            );
          } else {
            await injectJournalEntry(
              "invoice_paid",
              updated.issueDate,
              `InvoicePayment_${updated.id}`,
              {
                total: totalVal,
              },
              `Cobro de Factura ${updated.invoiceNumber} - ${updated.clientName}`
            );
          }
        }
      }
    } else {
      if (wasBorrador) {
        // Si antes era borrador y pasa a pendiente, emitimos la factura
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
      }
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

  try {
    const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

    if (await isPeriodLocked(existing.issueDate)) {
      res.status(400).json({ error: `El período contable para la fecha de esta factura (${existing.issueDate}) está cerrado.` });
      return;
    }

    // 1. Revertir stock (devolver cantidades al inventario) si estaba confirmada o pagada
    if (existing.status === "pendiente" || existing.status === "pagada") {
      const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, existing.id));
      for (const item of items) {
        if (!item.productId || !item.productType) continue;

        if (item.productType === "perfumeria") {
          const [product] = await db.select().from(perfumeryTable).where(eq(perfumeryTable.id, item.productId));
          if (product) {
            // Si es back-to-back, la compra y la venta se anulan mutuamente, por lo que el stock neto no cambia.
            if (!existing.isBackToBack) {
              await db.update(perfumeryTable)
                .set({ stock: product.stock + item.quantity })
                .where(eq(perfumeryTable.id, item.productId));
            }
          }
        } else if (item.productType === "sublimacion") {
          const [product] = await db.select().from(sublimationTable).where(eq(sublimationTable.id, item.productId));
          if (product) {
            if (product.stock !== null) {
              // Si es back-to-back, la compra y la venta se anulan mutuamente, por lo que el stock neto no cambia.
              if (!existing.isBackToBack) {
                await db.update(sublimationTable)
                  .set({ stock: product.stock + item.quantity })
                  .where(eq(sublimationTable.id, item.productId));
              }
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
    }

    // 2. Eliminar registros de venta
    await db.delete(salesTable).where(eq(salesTable.invoiceId, existing.id));

    // 3. Eliminar pagos asociados
    await db.delete(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, existing.id));

    // 4. Eliminar asientos contables asociados
    await db.delete(journalEntriesTable).where(eq(journalEntriesTable.referenceSource, `Invoice_${existing.id}`));
    await db.delete(journalEntriesTable).where(eq(journalEntriesTable.referenceSource, `InvoicePayment_${existing.id}`));
    if (existing.isBackToBack) {
      await db.delete(journalEntriesTable).where(sql`${journalEntriesTable.referenceSource} LIKE ${'Purchase_%_Invoice_' + existing.id}`);
    }

    // 5. Eliminar ítems de la factura
    await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, existing.id));

    // 6. Eliminar la factura
    await db.delete(invoicesTable).where(eq(invoicesTable.id, existing.id));

    res.sendStatus(204);
  } catch (err: any) {
    console.error("Error al eliminar factura:", err);
    res.status(500).json({ error: "Error al eliminar factura: " + err.message });
  }
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
          // Si es back-to-back, la compra y la venta se anulan mutuamente, por lo que el stock neto no cambia.
          if (!invoice.isBackToBack) {
            await db.update(perfumeryTable)
              .set({ stock: product.stock + item.quantity })
              .where(eq(perfumeryTable.id, item.productId));
          }
        }
      } else if (item.productType === "sublimacion") {
        const [product] = await db.select().from(sublimationTable).where(eq(sublimationTable.id, item.productId));
        if (product) {
          if (product.stock !== null) {
            // Si es back-to-back, la compra y la venta se anulan mutuamente, por lo que el stock neto no cambia.
            if (!invoice.isBackToBack) {
              await db.update(sublimationTable)
                .set({ stock: product.stock + item.quantity })
                .where(eq(sublimationTable.id, item.productId));
            }
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
    if (invoice.isBackToBack) {
      await db.delete(journalEntriesTable).where(sql`${journalEntriesTable.referenceSource} LIKE ${'Purchase_%_Invoice_' + invoice.id}`);
    }

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
