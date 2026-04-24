import { db, invoicesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

async function test() {
  try {
    console.log("Attempting manual insert with params from screenshot...");
    const values = {
      invoiceNumber: "FAC-TEST-" + Date.now(),
      clientId: 15,
      clientName: "juan",
      clientPhone: null,
      clientEmail: null,
      clientAddress: "Consumidor Final",
      clientCity: "SPS",
      clientDepartment: "Cortés",
      status: "pendiente",
      subtotal: "7600",
      discount: "0",
      tax: "0",
      total: "7600",
      notes: "60 DIAS DE GARANTIA POR DEFECTOS DE FABRICA DESDE LA FECHA DE EMISION DE LA FACTURA.",
      clientRtn: "0801-99995-323231",
      paymentMethod: "efectivo",
      transferReference: null,
      issueDate: "2026-04-24",
      dueDate: null,
      numeroGuia: null,
      transportista: null,
      fotoGuiaPath: null,
      estadoEntrega: "Pendiente",
      baseCost: "5000",
      internalExpenses: "0",
      internalExpensesNote: null,
      taxes: "0",
      partnerPayout: "1300",
      ownerPayout: "1300"
    };

    const res = await db.insert(invoicesTable).values(values).returning();
    console.log("SUCCESS!", res);
    process.exit(0);
  } catch (e: any) {
    console.error("MANUAL INSERT FAILED:");
    console.error(e);
    process.exit(1);
  }
}

test();
