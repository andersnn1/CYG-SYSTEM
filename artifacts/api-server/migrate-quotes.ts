import pg from 'pg';
import 'dotenv/config';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  
  const client = new pg.Client({ connectionString });
  
  try {
    await client.connect();
    
    await client.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_count INTEGER NOT NULL DEFAULT 0;`);
    console.log("Added column: follow_up_count");

    await client.query(`UPDATE quotes SET status = 'pendiente' WHERE status IN ('borrador', 'enviada');`);
    console.log("Updated statuses from borrador/enviada back to pendiente");
    
    console.log("Migration complete!");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
