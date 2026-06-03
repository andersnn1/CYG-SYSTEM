import { db, invoicesTable } from "./src/index.ts";
import { eq } from "drizzle-orm";

async function check() {
  const res = await db.select().from(invoicesTable).where(eq(invoicesTable.invoiceNumber, 'FAC-0006'));
  console.log("FAC-0006 SEARCH:", res);
  process.exit(0);
}

check();
