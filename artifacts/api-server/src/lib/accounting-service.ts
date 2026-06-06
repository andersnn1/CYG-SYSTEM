import { db, accountsTable, journalEntriesTable, journalLinesTable, accountingMappingsTable, accountingPeriodsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

export async function isPeriodLocked(dateStr: string): Promise<boolean> {
  try {
    const dateObj = new Date(dateStr);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1; // 1-12

    const [period] = await db
      .select()
      .from(accountingPeriodsTable)
      .where(
        and(
          eq(accountingPeriodsTable.year, year),
          eq(accountingPeriodsTable.month, month)
        )
      );

    return period?.isClosed ?? false;
  } catch (e) {
    return false; // Si hay error o no existe la tabla todavía
  }
}

export async function seedAccountingData() {
  try {
    const level1 = [
      { code: "1", name: "Activos", type: "Asset" as const, isGroup: true, isSystemAccount: true },
      { code: "2", name: "Pasivos", type: "Liability" as const, isGroup: true, isSystemAccount: true },
      { code: "3", name: "Patrimonio", type: "Equity" as const, isGroup: true, isSystemAccount: true },
      { code: "4", name: "Ingresos", type: "Revenue" as const, isGroup: true, isSystemAccount: true },
      { code: "5", name: "Gastos", type: "Expense" as const, isGroup: true, isSystemAccount: true },
    ];

    const level2 = [
      { code: "11", name: "Activos Circulantes", type: "Asset" as const, parentCode: "1", isGroup: true, isSystemAccount: true },
      { code: "21", name: "Pasivos Circulantes", type: "Liability" as const, parentCode: "2", isGroup: true, isSystemAccount: true },
      { code: "31", name: "Patrimonio y Capital", type: "Equity" as const, parentCode: "3", isGroup: true, isSystemAccount: true },
      { code: "41", name: "Ingresos por Operación", type: "Revenue" as const, parentCode: "4", isGroup: true, isSystemAccount: true },
      { code: "51", name: "Gastos Operativos", type: "Expense" as const, parentCode: "5", isGroup: true, isSystemAccount: true },
    ];

    const level3 = [
      { code: "1010", name: "Caja General", type: "Asset" as const, parentCode: "11", subType: "Current Asset", isSystemAccount: true },
      { code: "1020", name: "Banco Cuenta Operativa", type: "Asset" as const, parentCode: "11", subType: "Current Asset", isSystemAccount: true },
      { code: "1021", name: "Banco Cuenta Personal/Dueño", type: "Asset" as const, parentCode: "11", subType: "Current Asset", isSystemAccount: true },
      { code: "1022", name: "Banco Fondo Utilidad", type: "Asset" as const, parentCode: "11", subType: "Current Asset", isSystemAccount: true },
      { code: "1110", name: "Cuentas por Cobrar Clientes", type: "Asset" as const, parentCode: "11", subType: "Current Asset", isSystemAccount: true },
      { code: "2010", name: "IVA por Pagar / Débito Fiscal", type: "Liability" as const, parentCode: "21", subType: "Current Liability", isSystemAccount: true },
      { code: "3010", name: "Capital Social", type: "Equity" as const, parentCode: "31", subType: "Equity", isSystemAccount: true },
      { code: "4010", name: "Ingresos por Ventas", type: "Revenue" as const, parentCode: "41", subType: "Revenue", isSystemAccount: true },
      { code: "5010", name: "Gastos de Operación", type: "Expense" as const, parentCode: "51", subType: "Expense", isSystemAccount: true },
      { code: "5015", name: "Gastos de Envío", type: "Expense" as const, parentCode: "51", subType: "Expense", isSystemAccount: true },
      { code: "5020", name: "Costo de Ventas", type: "Expense" as const, parentCode: "51", subType: "Expense", isSystemAccount: true },
      { code: "5030", name: "Distribución a Socio", type: "Expense" as const, parentCode: "51", subType: "Expense", isSystemAccount: true },
    ];

    async function upsertAccount(acc: any, parentId?: string) {
      const [existing] = await db.select().from(accountsTable).where(eq(accountsTable.code, acc.code));
      if (!existing) {
        const [inserted] = await db.insert(accountsTable).values({
          code: acc.code,
          name: acc.name,
          type: acc.type,
          isGroup: acc.isGroup ?? false,
          subType: acc.subType ?? null,
          isSystemAccount: acc.isSystemAccount,
          parentId: parentId ?? null,
        }).returning();
        return inserted;
      } else {
        const [updated] = await db.update(accountsTable).set({
          isGroup: acc.isGroup ?? existing.isGroup,
          parentId: parentId ?? existing.parentId,
          name: acc.name,
          type: acc.type,
          subType: acc.subType ?? existing.subType,
        }).where(eq(accountsTable.id, existing.id)).returning();
        return updated;
      }
    }

    const lvl1Ids: Record<string, string> = {};
    for (const acc of level1) {
      const dbAcc = await upsertAccount(acc);
      lvl1Ids[acc.code] = dbAcc.id;
    }

    const lvl2Ids: Record<string, string> = {};
    for (const acc of level2) {
      const pId = lvl1Ids[acc.parentCode];
      const dbAcc = await upsertAccount(acc, pId);
      lvl2Ids[acc.code] = dbAcc.id;
    }

    for (const acc of level3) {
      const pId = lvl2Ids[acc.parentCode];
      await upsertAccount(acc, pId);
    }

    // 2. Seed mappings
    const defaultMappings = [
      // invoice_created: Debit 1110 (total), Credit 4010 (subtotal), Credit 2010 (tax)
      { event: "invoice_created", accountCode: "1110", direction: "DEBIT" as const, valueType: "variable" as const, valueExpression: "total" },
      { event: "invoice_created", accountCode: "4010", direction: "CREDIT" as const, valueType: "variable" as const, valueExpression: "subtotal" },
      { event: "invoice_created", accountCode: "2010", direction: "CREDIT" as const, valueType: "variable" as const, valueExpression: "tax" },
      
      // invoice_paid: Debit 1020 (50%), Debit 1021 (40%), Debit 1022 (10%), Credit 1110 (total)
      { event: "invoice_paid", accountCode: "1020", direction: "DEBIT" as const, valueType: "percentage" as const, valueExpression: "50" },
      { event: "invoice_paid", accountCode: "1021", direction: "DEBIT" as const, valueType: "percentage" as const, valueExpression: "40" },
      { event: "invoice_paid", accountCode: "1022", direction: "DEBIT" as const, valueType: "percentage" as const, valueExpression: "10" },
      { event: "invoice_paid", accountCode: "1110", direction: "CREDIT" as const, valueType: "variable" as const, valueExpression: "total" },

      // invoice_paid_back_to_back: compound split for back-to-back invoices
      { event: "invoice_paid_back_to_back", accountCode: "1020", direction: "DEBIT" as const, valueType: "variable" as const, valueExpression: "ownerPayoutOperativa" },
      { event: "invoice_paid_back_to_back", accountCode: "1021", direction: "DEBIT" as const, valueType: "variable" as const, valueExpression: "ownerPayoutPersonal" },
      { event: "invoice_paid_back_to_back", accountCode: "1022", direction: "DEBIT" as const, valueType: "variable" as const, valueExpression: "ownerPayoutUtilidad" },
      { event: "invoice_paid_back_to_back", accountCode: "5030", direction: "DEBIT" as const, valueType: "variable" as const, valueExpression: "partnerPayout" },
      { event: "invoice_paid_back_to_back", accountCode: "5020", direction: "DEBIT" as const, valueType: "variable" as const, valueExpression: "baseCost" },
      { event: "invoice_paid_back_to_back", accountCode: "5015", direction: "DEBIT" as const, valueType: "variable" as const, valueExpression: "internalExpenses" },
      { event: "invoice_paid_back_to_back", accountCode: "1110", direction: "CREDIT" as const, valueType: "variable" as const, valueExpression: "total" },

      // expense_created: Debit 5010 (amount), Credit 1010 (amount)
      { event: "expense_created", accountCode: "5010", direction: "DEBIT" as const, valueType: "variable" as const, valueExpression: "amount" },
      { event: "expense_created", accountCode: "1010", direction: "CREDIT" as const, valueType: "variable" as const, valueExpression: "amount" },
    ] as const;

    for (const map of defaultMappings) {
      const [exists] = await db
        .select()
        .from(accountingMappingsTable)
        .where(
          and(
            eq(accountingMappingsTable.event, map.event),
            eq(accountingMappingsTable.accountCode, map.accountCode),
            eq(accountingMappingsTable.direction, map.direction)
          )
        );
      if (!exists) {
        await db.insert(accountingMappingsTable).values(map);
      }
    }
  } catch (err) {
    console.error("Error al poblar catálogo y mapeos contables:", err);
  }
}

export async function injectJournalEntry(
  event: string,
  dateStr: string,
  referenceSource: string,
  values: Record<string, number>,
  customNarration?: string
) {
  if (await isPeriodLocked(dateStr)) {
    throw new Error(`El período para la fecha ${dateStr} está cerrado. No se permiten registros contables.`);
  }

  // 1. Get mappings for this event
  const mappings = await db
    .select()
    .from(accountingMappingsTable)
    .where(eq(accountingMappingsTable.event, event));

  if (mappings.length === 0) {
    console.warn(`No mappings found for accounting event: ${event}`);
    return null;
  }

  // 2. Resolve accounts and amounts
  const resolvedLines: { accountId: string; debit: number; credit: number; businessLine: "perfumeria" | "sublimacion" | "general" }[] = [];

  for (const map of mappings) {
    // find account by code
    const [account] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.code, map.accountCode));

    if (!account) {
      throw new Error(`Cuenta contable con código ${map.accountCode} no encontrada para el mapeo.`);
    }

    // calculate amount
    let amount = 0;
    if (map.valueType === "variable") {
      amount = values[map.valueExpression] || 0;
    } else if (map.valueType === "percentage") {
      const base = values["total"] || values["amount"] || 0;
      const pct = parseFloat(map.valueExpression);
      amount = (base * pct) / 100;
    }

    // Redondear a 2 decimales para evitar problemas de coma flotante
    amount = Number(amount.toFixed(2));

    // Si es la cuenta de ingresos de ventas (4010) y tenemos desglose por línea de negocio, la dividimos
    if (map.accountCode === "4010" && map.valueExpression === "subtotal" && (values["subtotal_perfumeria"] || values["subtotal_sublimacion"])) {
      const subPerf = values["subtotal_perfumeria"] || 0;
      const subSub = values["subtotal_sublimacion"] || 0;

      if (subPerf > 0) {
        resolvedLines.push({
          accountId: account.id,
          debit: 0,
          credit: Number(subPerf.toFixed(2)),
          businessLine: "perfumeria",
        });
      }
      if (subSub > 0) {
        resolvedLines.push({
          accountId: account.id,
          debit: 0,
          credit: Number(subSub.toFixed(2)),
          businessLine: "sublimacion",
        });
      }
    } else {
      if (amount <= 0) continue; // skip zero values (e.g. tax is 0)

      const lineBusinessLine = (values["businessLine"] as any) || "general";

      resolvedLines.push({
        accountId: account.id,
        debit: map.direction === "DEBIT" ? amount : 0,
        credit: map.direction === "CREDIT" ? amount : 0,
        businessLine: lineBusinessLine,
      });
    }
  }

  if (resolvedLines.length === 0) return null;

  // 3. Double-entry validation: SUM(debit) === SUM(credit)
  let totalDebit = resolvedLines.reduce((sum, l) => sum + l.debit, 0);
  let totalCredit = resolvedLines.reduce((sum, l) => sum + l.credit, 0);

  // Redondear totales para la comparación
  totalDebit = Number(totalDebit.toFixed(2));
  totalCredit = Number(totalCredit.toFixed(2));

  // Permitir pequeñas tolerancias por redondeo (máximo 0.02)
  const difference = Math.abs(totalDebit - totalCredit);
  if (difference > 0.02) {
    throw new Error(`Error de partida doble: La suma de débitos (${totalDebit}) no iguala créditos (${totalCredit}). Diferencia: ${difference}`);
  }

  // Ajustar diferencia de redondeo si es mínima (máximo 0.02)
  if (difference > 0 && difference <= 0.02) {
    if (totalDebit > totalCredit) {
      // Necesitamos aumentar crédito o disminuir débito
      const creditLine = resolvedLines.find(l => l.credit > 0);
      if (creditLine) {
        creditLine.credit = Number((creditLine.credit + difference).toFixed(2));
      } else {
        const debitLine = resolvedLines.find(l => l.debit > 0);
        if (debitLine) {
          debitLine.debit = Number((debitLine.debit - difference).toFixed(2));
        }
      }
    } else {
      // Necesitamos aumentar débito o disminuir crédito
      const debitLine = resolvedLines.find(l => l.debit > 0);
      if (debitLine) {
        debitLine.debit = Number((debitLine.debit + difference).toFixed(2));
      } else {
        const creditLine = resolvedLines.find(l => l.credit > 0);
        if (creditLine) {
          creditLine.credit = Number((creditLine.credit - difference).toFixed(2));
        }
      }
    }
  }

  // 4. Database inserts executed sequentially (Idempotency)
  // Delete existing journal lines and entries for this reference source to avoid duplicates
  const existing = await db
    .select({ id: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.referenceSource, referenceSource));

  for (const ent of existing) {
    await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, ent.id));
  }

  // Insert entry header
  const [entry] = await db
    .insert(journalEntriesTable)
    .values({
      date: dateStr,
      referenceSource,
      narration: customNarration || `Inyección automática del evento ${event}`,
    })
    .returning();

  // Insert entry lines
  await db.insert(journalLinesTable).values(
    resolvedLines.map(l => ({
      journalEntryId: entry.id,
      accountId: l.accountId,
      debit: l.debit.toFixed(2),
      credit: l.credit.toFixed(2),
      businessLine: l.businessLine,
    }))
  );

  return entry;
}
