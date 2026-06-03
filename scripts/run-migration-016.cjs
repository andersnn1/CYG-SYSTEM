const pg = require('pg');
require('dotenv').config({ path: './lib/db/.env' });
const url = (process.env.DATABASE_URL || '').replace(/^DATABASE_URL=/, '').replace(/^["']|["']$/g, '');
const pool = new pg.Pool({ connectionString: url, ssl: url.includes('neon.tech') ? { rejectUnauthorized: false } : false });
const fs = require('fs');
const sql = fs.readFileSync('./lib/db/migrations/0016_add_custom_inventory.sql', 'utf8');
pool.query(sql)
  .then(() => { console.log('OK: migracion aplicada'); pool.end(); })
  .catch(e => { console.error('ERROR:', e.message); pool.end(); process.exit(1); });
