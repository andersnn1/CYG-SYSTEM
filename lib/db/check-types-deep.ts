import { db } from "./src/index.ts";
import { sql } from "drizzle-orm";

async function check() {
  const res = await db.execute(sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'invoices'`);
  console.log("INVOICES TYPES:", res.rows);
  
  const res2 = await db.execute(sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sales'`);
  console.log("SALES TYPES:", res2.rows);

  const res3 = await db.execute(sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'clients'`);
  console.log("CLIENTS TYPES:", res3.rows);
  
  process.exit(0);
}

check();
