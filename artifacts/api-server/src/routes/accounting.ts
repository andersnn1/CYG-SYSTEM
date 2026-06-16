import { Router, type IRouter } from "express";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { 
  db, 
  accountsTable, 
  journalEntriesTable, 
  journalLinesTable, 
  accountingMappingsTable, 
  accountingPeriodsTable 
} from "@workspace/db";
import { z } from "zod";
import { isPeriodLocked, injectJournalEntry, handleMonthEndClosing, registrarCompraInventario } from "../lib/accounting-service";

const router: IRouter = Router();

// Zod schemas for validation
const CreateAccountBody = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  type: z.enum(["Asset", "Liability", "Equity", "Revenue", "Expense"]),
  subType: z.string().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  isGroup: z.boolean().optional(),
});

const CreateJournalEntryBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  narration: z.string().optional(),
  referenceSource: z.string().optional(),
  lines: z.array(z.object({
    accountId: z.string().uuid(),
    debit: z.number().nonnegative(),
    credit: z.number().nonnegative(),
  })).min(2),
});

const TogglePeriodBody = z.object({
  year: z.number().int().min(2000),
  month: z.number().int().min(1).max(12),
  isClosed: z.boolean(),
  closedBy: z.string().optional(),
});

const CreateMappingBody = z.object({
  event: z.string().min(1),
  accountCode: z.string().min(1),
  direction: z.enum(["DEBIT", "CREDIT"]),
  valueType: z.enum(["percentage", "variable"]),
  valueExpression: z.string().min(1),
});

// ==========================================
// 1. Catálogo de Cuentas (Chart of Accounts)
// ==========================================

// GET /accounting/accounts
router.get("/accounting/accounts", async (req, res): Promise<void> => {
  try {
    const accounts = await db.select().from(accountsTable).orderBy(accountsTable.code);
    res.json(accounts);
  } catch (err: any) {
    res.status(500).json({ error: "Error al obtener catálogo de cuentas: " + err.message });
  }
});

// POST /accounting/accounts
router.post("/accounting/accounts", async (req, res): Promise<void> => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const [existing] = await db.select().from(accountsTable).where(eq(accountsTable.code, parsed.data.code));
    if (existing) { res.status(400).json({ error: "Ya existe una cuenta contable con este código." }); return; }

    const [account] = await db.insert(accountsTable).values({
      ...parsed.data,
      isSystemAccount: false,
    }).returning();
    res.status(201).json(account);
  } catch (err: any) {
    res.status(500).json({ error: "Error al crear cuenta: " + err.message });
  }
});

// PATCH /accounting/accounts/:id
router.patch("/accounting/accounts/:id", async (req, res): Promise<void> => {
  const parsed = CreateAccountBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const [existing] = await db.select().from(accountsTable).where(eq(accountsTable.id, req.params.id));
    if (!existing) { res.status(404).json({ error: "Cuenta no encontrada" }); return; }
    if (existing.isSystemAccount) { res.status(403).json({ error: "No se pueden modificar cuentas reservadas del sistema." }); return; }

    const [updated] = await db.update(accountsTable).set(parsed.data).where(eq(accountsTable.id, req.params.id)).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: "Error al actualizar cuenta: " + err.message });
  }
});

// DELETE /accounting/accounts/:id
router.delete("/accounting/accounts/:id", async (req, res): Promise<void> => {
  try {
    const [existing] = await db.select().from(accountsTable).where(eq(accountsTable.id, req.params.id));
    if (!existing) { res.status(404).json({ error: "Cuenta no encontrada" }); return; }
    if (existing.isSystemAccount) { res.status(403).json({ error: "No se pueden eliminar cuentas reservadas del sistema." }); return; }

    // Check if the account has entries
    const [hasLines] = await db.select().from(journalLinesTable).where(eq(journalLinesTable.accountId, req.params.id)).limit(1);
    if (hasLines) { res.status(400).json({ error: "No se puede eliminar una cuenta que posee movimientos contables." }); return; }

    await db.delete(accountsTable).where(eq(accountsTable.id, req.params.id));
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: "Error al eliminar cuenta: " + err.message });
  }
});

// ==========================================
// 2. Libro Diario (Journal Entries)
// ==========================================

// GET /accounting/journal-entries
router.get("/accounting/journal-entries", async (req, res): Promise<void> => {
  try {
    const entries = await db.select().from(journalEntriesTable).orderBy(desc(journalEntriesTable.date));
    
    // Fetch lines for each entry (for basic listing, we will return summary or lazy load)
    const result = [];
    for (const ent of entries) {
      const lines = await db
        .select({
          id: journalLinesTable.id,
          debit: journalLinesTable.debit,
          credit: journalLinesTable.credit,
          accountCode: accountsTable.code,
          accountName: accountsTable.name,
        })
        .from(journalLinesTable)
        .innerJoin(accountsTable, eq(journalLinesTable.accountId, accountsTable.id))
        .where(eq(journalLinesTable.journalEntryId, ent.id));

      const totalDebit = lines.reduce((sum, l) => sum + parseFloat(l.debit), 0);
      result.push({
        ...ent,
        lines,
        total: totalDebit,
      });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "Error al obtener libro diario: " + err.message });
  }
});

// GET /accounting/journal-entries/:id
router.get("/accounting/journal-entries/:id", async (req, res): Promise<void> => {
  try {
    const [entry] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, req.params.id));
    if (!entry) { res.status(404).json({ error: "Asiento no encontrado" }); return; }

    const lines = await db
      .select({
        id: journalLinesTable.id,
        debit: journalLinesTable.debit,
        credit: journalLinesTable.credit,
        accountId: journalLinesTable.accountId,
        accountCode: accountsTable.code,
        accountName: accountsTable.name,
      })
      .from(journalLinesTable)
      .innerJoin(accountsTable, eq(journalLinesTable.accountId, accountsTable.id))
      .where(eq(journalLinesTable.journalEntryId, entry.id));

    res.json({
      ...entry,
      lines,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Error al obtener detalle del asiento: " + err.message });
  }
});

// POST /accounting/journal-entries
router.post("/accounting/journal-entries", async (req, res): Promise<void> => {
  const parsed = CreateJournalEntryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { date: dateStr, narration, referenceSource, lines } = parsed.data;

  // 1. Verify period is not locked
  if (await isPeriodLocked(dateStr)) {
    res.status(400).json({ error: `El período para la fecha ${dateStr} está cerrado.` });
    return;
  }

  // 2. Validate double-entry
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    res.status(400).json({ error: `Desbalance en partida: Débito (${totalDebit}) no es igual a Crédito (${totalCredit})` });
    return;
  }

  if (totalDebit <= 0) {
    res.status(400).json({ error: "El monto del asiento debe ser mayor que cero." });
    return;
  }

  try {
    // Create journal entry
    const [newEntry] = await db.insert(journalEntriesTable).values({
      date: dateStr,
      narration: narration || "Asiento contable manual",
      referenceSource: referenceSource || "Manual",
    }).returning();

    // Create lines
    await db.insert(journalLinesTable).values(
      lines.map(line => ({
        journalEntryId: newEntry.id,
        accountId: line.accountId,
        debit: line.debit.toFixed(2),
        credit: line.credit.toFixed(2),
      }))
    );

    res.status(201).json(newEntry);
  } catch (err: any) {
    res.status(500).json({ error: "Error al registrar asiento: " + err.message });
  }
});

// DELETE /accounting/journal-entries/:id
router.delete("/accounting/journal-entries/:id", async (req, res): Promise<void> => {
  try {
    const [existing] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, req.params.id));
    if (!existing) { res.status(404).json({ error: "Asiento no encontrado" }); return; }

    // Check if period is locked
    if (await isPeriodLocked(existing.date)) {
      res.status(400).json({ error: `El período contable para la fecha de este asiento (${existing.date}) está cerrado.` });
      return;
    }

    // Restrict deleting system-generated entries directly
    const ref = existing.referenceSource || "";
    if (ref.startsWith("Invoice_") || ref.startsWith("InvoicePayment_") || ref.startsWith("Expense_")) {
      res.status(400).json({ error: "No se pueden eliminar asientos generados automáticamente por el sistema (ej: facturas o gastos)." });
      return;
    }

    await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, req.params.id));
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: "Error al eliminar asiento: " + err.message });
  }
});

// ==========================================
// 3. Reportes Contables (Accounting Reports)
// ==========================================

// GET /accounting/reports/balance-sheet
router.get("/accounting/reports/balance-sheet", async (req, res): Promise<void> => {
  const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0];

  try {
    // 1. Query accounts and summing their debits/credits up to the date
    const rows = await db
      .select({
        id: accountsTable.id,
        code: accountsTable.code,
        name: accountsTable.name,
        type: accountsTable.type,
        subType: accountsTable.subType,
        parentId: accountsTable.parentId,
        isGroup: accountsTable.isGroup,
        debit: sql<string>`coalesce(sum(${journalLinesTable.debit}), 0)`,
        credit: sql<string>`coalesce(sum(${journalLinesTable.credit}), 0)`,
      })
      .from(accountsTable)
      .leftJoin(journalLinesTable, eq(accountsTable.id, journalLinesTable.accountId))
      .leftJoin(journalEntriesTable, eq(journalLinesTable.journalEntryId, journalEntriesTable.id))
      .where(sql`${journalEntriesTable.date} <= ${dateStr} or ${journalEntriesTable.date} is null`)
      .groupBy(accountsTable.id, accountsTable.code, accountsTable.name, accountsTable.type, accountsTable.subType, accountsTable.parentId, accountsTable.isGroup)
      .orderBy(accountsTable.code);

    // 2. Build map of accounts and compute balances
    const accountMap = new Map<string, any>();
    for (const r of rows) {
      const debit = parseFloat(r.debit);
      const credit = parseFloat(r.credit);
      let balance = 0;
      if (!r.isGroup) {
        if (r.type === "Asset" || r.type === "Expense") {
          balance = debit - credit;
        } else {
          balance = credit - debit;
        }
      }
      accountMap.set(r.id, {
        id: r.id,
        code: r.code,
        name: r.name,
        type: r.type,
        subType: r.subType,
        parentId: r.parentId,
        isGroup: r.isGroup,
        debit,
        credit,
        balance,
      });
    }

    function calculateBalance(nodeId: string): number {
      const node = accountMap.get(nodeId);
      if (!node) return 0;
      if (!node.isGroup) return node.balance;
      let sum = 0;
      for (const item of accountMap.values()) {
        if (item.parentId === nodeId) {
          sum += calculateBalance(item.id);
        }
      }
      node.balance = sum;
      return sum;
    }

    for (const account of accountMap.values()) {
      if (account.isGroup) {
        calculateBalance(account.id);
      }
    }

    const assets: any[] = [];
    const liabilities: any[] = [];
    const equity: any[] = [];
    
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let revenueNet = 0;
    let expenseNet = 0;

    for (const item of accountMap.values()) {
      if (!item.isGroup) {
        if (item.type === "Revenue") {
          revenueNet += (item.credit - item.debit);
        } else if (item.type === "Expense") {
          expenseNet += (item.debit - item.credit);
        }
      }

      if (item.parentId === null) {
        if (item.type === "Asset") {
          totalAssets += item.balance;
        } else if (item.type === "Liability") {
          totalLiabilities += item.balance;
        } else if (item.type === "Equity") {
          totalEquity += item.balance;
        }
      }

      if (item.type === "Asset") {
        assets.push(item);
      } else if (item.type === "Liability") {
        liabilities.push(item);
      } else if (item.type === "Equity") {
        equity.push(item);
      }
    }

    // Current year net income
    const netIncome = revenueNet - expenseNet;
    equity.push({
      id: "net-income-row",
      code: "3999",
      name: "Utilidad Neta del Ejercicio",
      type: "Equity",
      subType: "Equity",
      parentId: null,
      isGroup: false,
      debit: 0,
      credit: 0,
      balance: netIncome,
    });
    totalEquity += netIncome;

    res.json({
      date: dateStr,
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) <= 0.02,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Error al generar Balance General: " + err.message });
  }
});

// GET /accounting/reports/income-statement
router.get("/accounting/reports/income-statement", async (req, res): Promise<void> => {
  const startDate = (req.query.startDate as string) || `${new Date().getFullYear()}-01-01`;
  const endDate = (req.query.endDate as string) || new Date().toISOString().split("T")[0];

  try {
    const rows = await db
      .select({
        id: accountsTable.id,
        code: accountsTable.code,
        name: accountsTable.name,
        type: accountsTable.type,
        parentId: accountsTable.parentId,
        isGroup: accountsTable.isGroup,
        debit: sql<string>`coalesce(sum(case when ${journalEntriesTable.date} >= ${startDate} and ${journalEntriesTable.date} <= ${endDate} and ${journalEntriesTable.referenceSource} not like 'Closing_Entry%' then ${journalLinesTable.debit} else 0 end), 0)`,
        credit: sql<string>`coalesce(sum(case when ${journalEntriesTable.date} >= ${startDate} and ${journalEntriesTable.date} <= ${endDate} and ${journalEntriesTable.referenceSource} not like 'Closing_Entry%' then ${journalLinesTable.credit} else 0 end), 0)`,
      })
      .from(accountsTable)
      .leftJoin(journalLinesTable, eq(accountsTable.id, journalLinesTable.accountId))
      .leftJoin(journalEntriesTable, eq(journalLinesTable.journalEntryId, journalEntriesTable.id))
      .groupBy(accountsTable.id, accountsTable.code, accountsTable.name, accountsTable.type, accountsTable.parentId, accountsTable.isGroup)
      .orderBy(accountsTable.code);

    const accountMap = new Map<string, any>();
    for (const r of rows) {
      const debit = parseFloat(r.debit);
      const credit = parseFloat(r.credit);
      let balance = 0;
      if (!r.isGroup) {
        if (r.type === "Revenue") {
          balance = credit - debit;
        } else if (r.type === "Expense") {
          balance = debit - credit;
        }
      }
      accountMap.set(r.id, {
        id: r.id,
        code: r.code,
        name: r.name,
        type: r.type,
        parentId: r.parentId,
        isGroup: r.isGroup,
        debit,
        credit,
        balance,
      });
    }

    function calculateBalance(nodeId: string): number {
      const node = accountMap.get(nodeId);
      if (!node) return 0;
      if (!node.isGroup) return node.balance;
      let sum = 0;
      for (const item of accountMap.values()) {
        if (item.parentId === nodeId) {
          sum += calculateBalance(item.id);
        }
      }
      node.balance = sum;
      return sum;
    }

    for (const account of accountMap.values()) {
      if (account.isGroup) {
        calculateBalance(account.id);
      }
    }

    const revenues: any[] = [];
    const expenses: any[] = [];
    
    let totalRevenues = 0;
    let totalExpenses = 0;

    for (const item of accountMap.values()) {
      if (item.balance === 0) continue;

      if (item.type === "Revenue") {
        revenues.push(item);
        if (item.parentId === null) {
          totalRevenues += item.balance;
        }
      } else if (item.type === "Expense") {
        expenses.push(item);
        if (item.parentId === null) {
          totalExpenses += item.balance;
        }
      }
    }

    res.json({
      startDate,
      endDate,
      revenues,
      expenses,
      totalRevenues,
      totalExpenses,
      netIncome: totalRevenues - totalExpenses,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Error al generar Estado de Resultados: " + err.message });
  }
});

// GET /accounting/reports/general-ledger
router.get("/accounting/reports/general-ledger", async (req, res): Promise<void> => {
  const accountId = req.query.accountId as string;
  const startDate = (req.query.startDate as string) || `${new Date().getFullYear()}-01-01`;
  const endDate = (req.query.endDate as string) || new Date().toISOString().split("T")[0];

  if (!accountId) { res.status(400).json({ error: "accountId es requerido" }); return; }

  try {
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (!account) { res.status(404).json({ error: "Cuenta no encontrada" }); return; }

    // 1. Calculate opening balance (prior to startDate)
    const [openingRaw] = await db
      .select({
        debit: sql<string>`coalesce(sum(${journalLinesTable.debit}), 0)`,
        credit: sql<string>`coalesce(sum(${journalLinesTable.credit}), 0)`,
      })
      .from(journalLinesTable)
      .innerJoin(journalEntriesTable, eq(journalLinesTable.journalEntryId, journalEntriesTable.id))
      .where(
        and(
          eq(journalLinesTable.accountId, accountId),
          sql`${journalEntriesTable.date} < ${startDate}`
        )
      );

    const openDebit = parseFloat(openingRaw?.debit || "0");
    const openCredit = parseFloat(openingRaw?.credit || "0");
    const isAssetOrExpense = account.type === "Asset" || account.type === "Expense";
    const openingBalance = isAssetOrExpense ? (openDebit - openCredit) : (openCredit - openDebit);

    // 2. Fetch movements in range
    const movements = await db
      .select({
        lineId: journalLinesTable.id,
        debit: journalLinesTable.debit,
        credit: journalLinesTable.credit,
        date: journalEntriesTable.date,
        referenceSource: journalEntriesTable.referenceSource,
        narration: journalEntriesTable.narration,
      })
      .from(journalLinesTable)
      .innerJoin(journalEntriesTable, eq(journalLinesTable.journalEntryId, journalEntriesTable.id))
      .where(
        and(
          eq(journalLinesTable.accountId, accountId),
          gte(journalEntriesTable.date, startDate),
          lte(journalEntriesTable.date, endDate)
        )
      )
      .orderBy(journalEntriesTable.date, journalLinesTable.createdAt);

    // 3. Compute running balance
    let currentBalance = openingBalance;
    const movementsWithBalance = movements.map(m => {
      const dbVal = parseFloat(m.debit);
      const crVal = parseFloat(m.credit);
      const change = isAssetOrExpense ? (dbVal - crVal) : (crVal - dbVal);
      currentBalance += change;
      return {
        ...m,
        debit: dbVal,
        credit: crVal,
        balance: currentBalance,
      };
    });

    res.json({
      account,
      startDate,
      endDate,
      openingBalance,
      movements: movementsWithBalance,
      closingBalance: currentBalance,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Error al generar Libro Mayor: " + err.message });
  }
});

// ==========================================
// 4. Bloqueo de Periodos (Period Locking)
// ==========================================

// GET /accounting/periods
router.get("/accounting/periods", async (req, res): Promise<void> => {
  try {
    const periods = await db.select().from(accountingPeriodsTable).orderBy(desc(accountingPeriodsTable.year), desc(accountingPeriodsTable.month));
    res.json(periods);
  } catch (err: any) {
    res.status(500).json({ error: "Error al obtener periodos: " + err.message });
  }
});

// POST /accounting/periods/toggle
router.post("/accounting/periods/toggle", async (req, res): Promise<void> => {
  const parsed = TogglePeriodBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { year, month, isClosed, closedBy } = parsed.data;

  try {
    const [existing] = await db
      .select()
      .from(accountingPeriodsTable)
      .where(
        and(
          eq(accountingPeriodsTable.year, year),
          eq(accountingPeriodsTable.month, month)
        )
      );

    if (existing) {
      const [updated] = await db
        .update(accountingPeriodsTable)
        .set({
          isClosed,
          closedAt: isClosed ? new Date() : null,
          closedBy: isClosed ? (closedBy || "Sistema") : null,
        })
        .where(eq(accountingPeriodsTable.id, existing.id))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db
        .insert(accountingPeriodsTable)
        .values({
          year,
          month,
          isClosed,
          closedAt: isClosed ? new Date() : null,
          closedBy: isClosed ? (closedBy || "Sistema") : null,
        })
        .returning();
      res.json(created);
    }
  } catch (err: any) {
    res.status(500).json({ error: "Error al alternar periodo: " + err.message });
  }
});

// ==========================================
// 5. Configuración de Mapeos (Mappings)
// ==========================================

// GET /accounting/mappings
router.get("/accounting/mappings", async (req, res): Promise<void> => {
  try {
    const mappings = await db.select().from(accountingMappingsTable).orderBy(accountingMappingsTable.event, accountingMappingsTable.id);
    res.json(mappings);
  } catch (err: any) {
    res.status(500).json({ error: "Error al obtener mapeos: " + err.message });
  }
});

// POST /accounting/mappings
router.post("/accounting/mappings", async (req, res): Promise<void> => {
  const parsed = CreateMappingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    // Check if account code exists
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.code, parsed.data.accountCode));
    if (!account) { res.status(400).json({ error: `La cuenta con código ${parsed.data.accountCode} no existe.` }); return; }

    const [created] = await db.insert(accountingMappingsTable).values(parsed.data).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: "Error al crear mapeo: " + err.message });
  }
});

// DELETE /accounting/mappings/:id
router.delete("/accounting/mappings/:id", async (req, res): Promise<void> => {
  try {
    const [existing] = await db.select().from(accountingMappingsTable).where(eq(accountingMappingsTable.id, Number(req.params.id)));
    if (!existing) { res.status(404).json({ error: "Mapeo no encontrado" }); return; }

    await db.delete(accountingMappingsTable).where(eq(accountingMappingsTable.id, Number(req.params.id)));
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: "Error al eliminar mapeo: " + err.message });
  }
});

// POST /accounting/cron-close
router.post("/accounting/cron-close", async (req, res): Promise<void> => {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-11. 0 es enero

  if (req.body.year !== undefined && req.body.month !== undefined) {
    const y = Number(req.body.year);
    const m = Number(req.body.month);
    if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
      year = y;
      month = m;
    } else {
      res.status(400).json({ error: "Parámetros year o month inválidos." });
      return;
    }
  } else {
    if (month === 0) {
      month = 12;
      year = year - 1;
    }
  }

  try {
    const entry = await handleMonthEndClosing(year, month);
    if (entry) {
      res.json({ message: `Cierre mensual completado para el periodo ${year}-${month}`, journalEntry: entry });
    } else {
      res.json({ message: `No se requirieron acciones de cierre para el periodo ${year}-${month}.` });
    }
  } catch (err: any) {
    console.error("Error en cron-close:", err);
    res.status(500).json({ error: "Error al procesar el cierre contable mensual: " + err.message });
  }
});

const RegisterPurchaseBody = z.object({
  productType: z.enum(["perfumeria", "sublimacion", "custom-inventory"]),
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  unitCost: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// POST /accounting/inventory-purchase
router.post("/accounting/inventory-purchase", async (req, res): Promise<void> => {
  const parsed = RegisterPurchaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { productType, productId, quantity, unitCost, date } = parsed.data;

  try {
    const result = await registrarCompraInventario(
      productType,
      productId,
      quantity,
      unitCost,
      date
    );

    res.status(201).json({
      message: "Compra de inventario al contado registrada exitosamente.",
      ...result
    });
  } catch (err: any) {
    console.error("Error en POST /accounting/inventory-purchase:", err);
    res.status(500).json({ error: "Error al registrar la compra de inventario: " + err.message });
  }
});

export default router;
