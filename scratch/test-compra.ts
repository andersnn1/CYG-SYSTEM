import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "./artifacts/api-server/.env") });

import { seedAccountingData, registrarCompraInventario } from "../artifacts/api-server/src/lib/accounting-service";
import { db, perfumeryTable, journalEntriesTable, journalLinesTable, accountsTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";

async function main() {
  console.log("=== INICIANDO VERIFICACIÓN: COMPRA DE INVENTARIO AL CONTADO ===");

  // 1. Asegurar catálogo de cuentas
  console.log("\n1. Sembrando catálogo...");
  await seedAccountingData();

  // 2. Crear un producto de prueba en Perfumería
  console.log("\n2. Creando producto de prueba...");
  const [product] = await db
    .insert(perfumeryTable)
    .values({
      name: "Perfume Test Compra",
      brand: "TestBrand",
      ml: 100,
      stock: 10,       // Stock inicial: 10
      costPrice: "500.00", // Costo inicial: L. 500.00
      salePrice: "800.00",
      code: "TEST-COMPRA-CODE-1234",
    })
    .returning();

  console.log(`Producto creado. ID: ${product.id} | Stock inicial: ${product.stock} | Costo inicial: L. ${product.costPrice}`);

  // 3. Registrar una compra al contado
  // Cantidad comprada: 5, Costo compra unitario: L. 650.00
  // Costo Promedio Ponderado Esperado:
  // ((10 * 500) + (5 * 650)) / (10 + 5) = (5000 + 3250) / 15 = 8250 / 15 = L. 550.00
  console.log("\n3. Registrando compra de inventario al contado...");
  const cantidadComprada = 5;
  const costoUnitario = 650.00;
  const montoTotalEsperado = cantidadComprada * costoUnitario; // L. 3250.00

  const result = await registrarCompraInventario(
    "perfumeria",
    product.id,
    cantidadComprada,
    costoUnitario,
    "2026-06-14"
  );

  console.log("Compra registrada con éxito.");
  console.log("Monto total registrado:", result.montoTotal);
  console.log("Nuevo stock devuelto:", result.nuevoStock);
  console.log("Nuevo costo promedio devuelto:", result.nuevoCosto);

  // 4. Verificar base de datos
  console.log("\n4. Verificando base de datos...");
  const [updatedProduct] = await db
    .select()
    .from(perfumeryTable)
    .where(eq(perfumeryTable.id, product.id));

  console.log("Producto actualizado en DB:");
  console.log(`- Stock: ${updatedProduct.stock} (Esperado: 15)`);
  console.log(`- Costo de Adquisición: L. ${updatedProduct.costPrice} (Esperado: 550.00)`);

  if (updatedProduct.stock !== 15 || Number(updatedProduct.costPrice) !== 550.00) {
    throw new Error("El stock o el costo promedio ponderado no coinciden con los valores esperados.");
  }
  console.log("¡Costo promedio ponderado y stock recalculados correctamente!");

  // 5. Verificar asiento contable
  console.log("\n5. Verificando asiento contable...");
  const entry = result.journalEntry;
  const lines = await db
    .select({
      code: accountsTable.code,
      name: accountsTable.name,
      debit: journalLinesTable.debit,
      credit: journalLinesTable.credit,
      businessLine: journalLinesTable.businessLine,
    })
    .from(journalLinesTable)
    .innerJoin(accountsTable, eq(journalLinesTable.accountId, accountsTable.id))
    .where(eq(journalLinesTable.journalEntryId, entry.id));

  console.log("Asiento registrado:");
  console.table(lines);

  // Verificar partida doble
  const sumDebits = lines.reduce((s, l) => s + parseFloat(l.debit), 0);
  const sumCredits = lines.reduce((s, l) => s + parseFloat(l.credit), 0);
  console.log(`Suma Débitos: L. ${sumDebits.toFixed(2)} | Suma Créditos: L. ${sumCredits.toFixed(2)}`);

  if (Math.abs(sumDebits - sumCredits) > 0.01) {
    throw new Error("El asiento contable de compra está desbalanceado.");
  }
  if (sumDebits !== montoTotalEsperado) {
    throw new Error(`El total del asiento (${sumDebits}) no coincide con el esperado (${montoTotalEsperado}).`);
  }

  // Verificar cuentas
  const debitLine = lines.find(l => parseFloat(l.debit) > 0);
  const creditLine = lines.find(l => parseFloat(l.credit) > 0);

  if (debitLine?.code !== "1120" || creditLine?.code !== "1020") {
    throw new Error("Las cuentas contables del asiento son incorrectas. Debió ser: DEBE 1120, HABER 1020.");
  }
  if (debitLine.businessLine !== "perfumeria" || creditLine.businessLine !== "perfumeria") {
    throw new Error("La línea de negocio (businessLine) no se asignó correctamente a las líneas de diario.");
  }

  console.log("¡Asiento contable verificado exitosamente!");

  // 6. Limpieza
  console.log("\n6. Limpiando datos de prueba...");
  await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, entry.id));
  await db.delete(perfumeryTable).where(eq(perfumeryTable.id, product.id));
  console.log("Limpieza completada.");

  console.log("\n=== VERIFICACIÓN DE COMPRAS COMPLETADA EXITOSAMENTE ===");
}

main().catch(err => {
  console.error("ERROR EN VERIFICACIÓN:", err);
  process.exit(1);
});
