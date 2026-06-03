import { db } from "./src/index.ts";
import { sql } from "drizzle-orm";

async function check() {
  console.log("Checking invoices.client_rtn type...");
  const res = await db.execute(sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'client_rtn'`);
  console.log(res.rows);

  console.log("Checking clients.rtn type...");
  const res2 = await db.execute(sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'rtn'`);
  console.log(res2.rows);
  
  process.exit(0);
}

check();
