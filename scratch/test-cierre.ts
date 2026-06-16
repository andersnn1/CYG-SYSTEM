import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "./artifacts/api-server/.env") });

import { seedAccountingData, injectJournalEntry, handleMonthEndClosing } from "../artifacts/api-server/src/lib/accounting-service";
import { db, journalEntriesTable, journalLinesTable, accountsTable, accountingPeriodsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

async function main() {
  console.log("=== INICIANDO VERIFICACIÓN SISTEMA DE APARTADOS Y CIERRE CONTABLE ===");

  // 1. Correr semilla de base de datos para registrar nuevas cuentas y mapeos
  console.log("\n1. Sembrando catálogo de cuentas y mapeos...");
  await seedAccountingData();
  console.log("Catálogo sembrado.");

  // Verificar que la cuenta de pasivo 2020 y activo 1120 y patrimonio 3020 existen
  const [acc2020] = await db.select().from(accountsTable).where(eq(accountsTable.code, "2020"));
  const [acc1120] = await db.select().from(accountsTable).where(eq(accountsTable.code, "1120"));
  const [acc3020] = await db.select().from(accountsTable).where(eq(accountsTable.code, "3020"));

  console.log("Cuenta 2020 (Socio Pasivo) existe:", !!acc2020, acc2020?.name);
  console.log("Cuenta 1120 (Inventario) existe:", !!acc1120, acc1120?.name);
  console.log("Cuenta 3020 (Utilidad Acumulada) existe:", !!acc3020, acc3020?.name);

  if (!acc2020 || !acc1120 || !acc3020) {
    throw new Error("Las nuevas cuentas contables no se crearon correctamente.");
  }

  // 2. Probar la inyección de la transacción de pago de apartado (Fase 2)
  console.log("\n2. Inyectando transacción de pago de apartado (Caso de prueba: Plancha)...");
  const testRef = "Test_InvoicePayment_99999";

  // Limpiar previos
  const existingEntries = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.referenceSource, testRef));
  for (const ent of existingEntries) {
    await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, ent.id));
  }

  // Valores caso de prueba: Plancha
  const totalVal = 7600;
  const baseCostVal = 5400;
  const margenRealVal = totalVal - baseCostVal; // 2200
  const partnerPayoutVal = margenRealVal * 0.50; // 1100
  const remanenteVal = margenRealVal * 0.50; // 1100
  const bancoOpexVal = baseCostVal + (remanenteVal * 0.50); // 5400 + 550 = 5950
  const bancoSueldoDuenoVal = remanenteVal * 0.40; // 440
  const bancoUtilidadVal = remanenteVal * 0.10; // 110

  const entry = await injectJournalEntry(
    "invoice_paid_apartado",
    "2026-05-15",
    testRef,
    {
      total: totalVal,
      baseCost: baseCostVal,
      partnerPayout: partnerPayoutVal,
      bancoOpex: bancoOpexVal,
      bancoSueldoDueno: bancoSueldoDuenoVal,
      bancoUtilidad: bancoUtilidadVal,
    },
    "Test Cobro de Factura (Apartado) - Plancha"
  );

  if (!entry) {
    throw new Error("No se pudo inyectar el asiento de pago.");
  }

  console.log("Asiento inyectado con ID:", entry.id);

  // Consultar líneas inyectadas
  const lines = await db
    .select({
      code: accountsTable.code,
      name: accountsTable.name,
      debit: journalLinesTable.debit,
      credit: journalLinesTable.credit,
    })
    .from(journalLinesTable)
    .innerJoin(accountsTable, eq(journalLinesTable.accountId, accountsTable.id))
    .where(eq(journalLinesTable.journalEntryId, entry.id));

  console.log("Líneas del asiento inyectado:");
  console.table(lines);

  // Verificar partida doble
  const sumDebits = lines.reduce((s, l) => s + parseFloat(l.debit), 0);
  const sumCredits = lines.reduce((s, l) => s + parseFloat(l.credit), 0);
  console.log(`Suma Débitos: L. ${sumDebits.toFixed(2)} | Suma Créditos: L. ${sumCredits.toFixed(2)}`);
  if (Math.abs(sumDebits - sumCredits) > 0.01) {
    throw new Error("El asiento contable de pago de apartado está desbalanceado.");
  }
  console.log("¡El asiento está perfectamente balanceado!");

  // 3. Probar el cierre mensual contable automático
  console.log("\n3. Probando Cierre Mensual Contable para Mayo 2026...");
  
  // Limpiar periodo y cierres anteriores
  const closeRef = "Closing_Entry_2026_05";
  const existingCloses = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.referenceSource, closeRef));
  for (const ent of existingCloses) {
    await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, ent.id));
  }
  await db.delete(accountingPeriodsTable).where(
    and(
      eq(accountingPeriodsTable.year, 2026),
      eq(accountingPeriodsTable.month, 5)
    )
  );

  const closingEntry = await handleMonthEndClosing(2026, 5);
  if (!closingEntry) {
    console.log("No se generó asiento de cierre (puede ser porque no hay movimientos de nominales en este mes en tu DB local/Neon).");
  } else {
    console.log("Asiento de cierre mensual generado con ID:", closingEntry.id);
    const closingLines = await db
      .select({
        code: accountsTable.code,
        name: accountsTable.name,
        type: accountsTable.type,
        debit: journalLinesTable.debit,
        credit: journalLinesTable.credit,
      })
      .from(journalLinesTable)
      .innerJoin(accountsTable, eq(journalLinesTable.accountId, accountsTable.id))
      .where(eq(journalLinesTable.journalEntryId, closingEntry.id));

    console.log("Líneas del asiento de cierre:");
    console.table(closingLines);

    // Verificar partida doble de cierre
    const closeDebits = closingLines.reduce((s, l) => s + parseFloat(l.debit), 0);
    const closeCredits = closingLines.reduce((s, l) => s + parseFloat(l.credit), 0);
    console.log(`Suma Débitos Cierre: L. ${closeDebits.toFixed(2)} | Suma Créditos Cierre: L. ${closeCredits.toFixed(2)}`);
    if (Math.abs(closeDebits - closeCredits) > 0.01) {
      throw new Error("El asiento contable de cierre está desbalanceado.");
    }
    console.log("¡El asiento de cierre está perfectamente balanceado!");
  }

  // Verificar que el periodo esté marcado como cerrado
  const [period] = await db
    .select()
    .from(accountingPeriodsTable)
    .where(
      and(
        eq(accountingPeriodsTable.year, 2026),
        eq(accountingPeriodsTable.month, 5)
      )
    );
  console.log("Periodo 2026-05 cerrado en DB:", period?.isClosed ? "SÍ" : "NO", period?.closedBy);

  // 4. Limpieza de datos de prueba
  console.log("\n4. Limpiando datos de prueba...");
  if (entry) {
    await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, entry.id));
  }
  if (closingEntry) {
    await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, closingEntry.id));
  }
  await db.delete(accountingPeriodsTable).where(
    and(
      eq(accountingPeriodsTable.year, 2026),
      eq(accountingPeriodsTable.month, 5)
    )
  );
  console.log("Datos de prueba limpiados.");
  console.log("\n=== VERIFICACIÓN COMPLETADA EXITOSAMENTE ===");
}

main().catch(err => {
  console.error("ERROR EN VERIFICACIÓN:", err);
  process.exit(1);
});
