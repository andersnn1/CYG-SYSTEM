import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "./artifacts/api-server/.env") });

import { seedAccountingData, injectJournalEntry } from "../artifacts/api-server/src/lib/accounting-service";
import { db, journalEntriesTable, journalLinesTable, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  console.log("=== INICIANDO PRUEBA DE REGISTRO: VENTA DIRECTA AL CONTADO ===");

  // 1. Asegurar catálogo y nuevos mapeos contables
  console.log("\n1. Sembrando/Actualizando mapeos contables...");
  await seedAccountingData();

  // 2. Definir parámetros del caso "Plancha"
  console.log("\n2. Preparando datos de prueba (Caso Plancha)...");
  const subtotal = 7600.00;
  const baseCost = 5400.00;
  const total = subtotal; // Sin descuentos ni impuestos
  
  const margenReal = total - baseCost; // 2200.00
  const partnerPayout = margenReal * 0.50; // 1100.00
  const remanente = margenReal * 0.50; // 1100.00
  const bancoOpex = baseCost + (remanente * 0.50); // 5400 + 550 = 5950.00
  const bancoSueldoDueno = remanente * 0.40; // 440.00
  const bancoUtilidad = remanente * 0.10; // 110.00

  console.log("Valores calculados para el asiento:");
  console.log(`- Subtotal: L. ${subtotal}`);
  console.log(`- Costo Base: L. ${baseCost}`);
  console.log(`- Opex (1020): L. ${bancoOpex}`);
  console.log(`- Sueldo Dueño (1021): L. ${bancoSueldoDueno}`);
  console.log(`- Utilidad (1022): L. ${bancoUtilidad}`);
  console.log(`- Partner Payout (2020): L. ${partnerPayout}`);

  // 3. Inyectar asiento
  console.log("\n3. Inyectando asiento contable...");
  const referenceSource = `TestDirectSale_${Date.now()}`;
  const entry = await injectJournalEntry(
    "invoice_direct_sale",
    "2026-06-14",
    referenceSource,
    {
      subtotal,
      total,
      baseCost,
      partnerPayout,
      bancoOpex,
      bancoSueldoDueno,
      bancoUtilidad,
    },
    `Prueba Venta Directa Caso Plancha`
  );

  if (!entry) {
    throw new Error("No se pudo inyectar el asiento de venta directa.");
  }
  console.log(`Asiento inyectado con ID: ${entry.id}`);

  // 4. Obtener y verificar líneas de diario
  console.log("\n4. Recuperando líneas de diario desde la DB...");
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

  console.log("\nAsiento Contable Resultante:");
  console.table(lines);

  // 5. Validaciones de partida doble y montos
  const sumDebits = lines.reduce((s, l) => s + parseFloat(l.debit), 0);
  const sumCredits = lines.reduce((s, l) => s + parseFloat(l.credit), 0);
  console.log(`\nSuma total DEBE:  L. ${sumDebits.toFixed(2)}`);
  console.log(`Suma total HABER: L. ${sumCredits.toFixed(2)}`);

  console.log("\nVerificaciones de balance:");
  console.log(`- ¿Suma DEBE es L. 13,000.00?: ${sumDebits === 13000 ? "SÍ" : "NO"}`);
  console.log(`- ¿Suma HABER es L. 13,000.00?: ${sumCredits === 13000 ? "SÍ" : "NO"}`);
  console.log(`- ¿Está balanceado?: ${Math.abs(sumDebits - sumCredits) < 0.01 ? "SÍ" : "NO"}`);

  // 6. Limpieza
  console.log("\n5. Limpiando datos de prueba...");
  await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, entry.id));
  console.log("Limpieza completada.");

  if (sumDebits !== 13000 || sumCredits !== 13000) {
    console.error("ERROR: Las sumas del debe/haber no coinciden con L. 13,000.00");
    process.exit(1);
  } else {
    console.log("\n=== PRUEBA DE CASO PLANCHA COMPLETADA CON ÉXITO ===");
  }
}

main().catch(err => {
  console.error("Error ejecutando prueba:", err);
  process.exit(1);
});
