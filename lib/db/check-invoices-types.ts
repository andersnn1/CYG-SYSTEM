import { db } from "./src/index.ts";
import { sql } from "drizzle-orm";

async function check() {
  const res = await db.execute(sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'invoices'`);
  for (const row of res.rows) {
    console.log(`${row.column_name}: ${row.data_type}`);
  }
  process.exit(0);
}

check();
