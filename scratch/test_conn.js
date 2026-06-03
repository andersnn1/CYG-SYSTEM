import pg from 'pg';
const { Client } = pg;

const connectionString = "postgresql://neondb_owner:npg_qwZT3Djcng6A@ep-sweet-star-an9rd0h5-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require";

const client = new Client({ connectionString });

async function test() {
  try {
    console.log("Connecting...");
    await client.connect();
    console.log("Connected successfully!");
    const res = await client.query('SELECT 1');
    console.log("Query result:", res.rows);
    await client.end();
  } catch (err) {
    console.error("Connection error:", err.message);
    process.exit(1);
  }
}

test();
