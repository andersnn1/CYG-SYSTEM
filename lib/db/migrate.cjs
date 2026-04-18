const pg = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  const envText = fs.readFileSync(envPath, 'utf8');
  let url = '';
  for (const line of envText.split('\n')) {
    if (line.startsWith('DATABASE_URL=')) {
      url = line.split('=')[1].replace(/"/g, '').trim();
    }
  }
  
  if (!url) throw new Error("DATABASE_URL is not set");
  
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  
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
