import { db, clientsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";

async function test() {
  try {
    const name = "Test RTN " + Date.now();
    const rtn = "123456789";
    console.log("Inserting test client...");
    const [inserted] = await db.insert(clientsTable).values({
      name,
      rtn,
      city: "SPS",
      department: "Cortés"
    }).returning();
    console.log("Inserted:", inserted);

    console.log("Selecting back...");
    const [selected] = await db.select().from(clientsTable).where(eq(clientsTable.id, inserted.id));
    console.log("Selected:", selected);

    if (selected.rtn === rtn) {
      console.log("RTN MATCHES!");
    } else {
      console.error("RTN MISMATCH! Expected", rtn, "got", selected.rtn);
    }
    process.exit(0);
  } catch (e) {
    console.error("DB TEST FAILED:", e);
    process.exit(1);
  }
}

test();
