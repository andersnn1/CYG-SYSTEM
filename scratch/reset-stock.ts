import pg from 'pg';
import 'dotenv/config';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  
  const client = new pg.Client({ connectionString });
  
  try {
    await client.connect();
    console.log("Connected to database. Resetting stock quantities to 0...");

    // Update perfumery stock
    const res1 = await client.query("UPDATE perfumery SET stock = 0;");
    console.log(`Updated stock to 0 for ${res1.rowCount} items in 'perfumery' table.`);

    // Update sublimation stock
    const res2 = await client.query("UPDATE sublimation SET stock = 0;");
    console.log(`Updated stock to 0 for ${res2.rowCount} items in 'sublimation' table.`);

    // Update custom_inventory stock
    const res3 = await client.query("UPDATE custom_inventory SET stock = 0;");
    console.log(`Updated stock to 0 for ${res3.rowCount} items in 'custom_inventory' table.`);

    console.log("All inventory stock has been set to 0 successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Stock reset failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
