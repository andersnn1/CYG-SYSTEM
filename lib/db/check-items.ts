import { db } from "./src/index.ts";
import { sql } from "drizzle-orm";

async function check() {
  const res = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'invoice_items'`);
  console.log("INVOICE_ITEMS COLUMNS:", res.rows.map((r: any) => r.column_name));
  process.exit(0);
}

check();
