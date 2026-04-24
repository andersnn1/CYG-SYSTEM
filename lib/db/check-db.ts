import { db, clientsTable, invoicesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

async function check() {
  try {
    console.log("Checking clients table...");
    const clientsCols = await db.execute(sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'clients'`);
    console.log("Clients columns:", clientsCols.rows);

    console.log("Checking invoices table...");
    const invoicesCols = await db.execute(sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'invoices'`);
    console.log("Invoices columns:", invoicesCols.rows);
    
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

check();
