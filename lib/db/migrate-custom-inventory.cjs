const pg = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const envPath = path.join(__dirname, '.env');
  const envText = fs.readFileSync(envPath, 'utf8');
  let url = '';
  for (const line of envText.split('\n')) {
    if (line.startsWith('DATABASE_URL=')) {
      url = line.split('=').slice(1).join('=').replace(/"/g, '').trim();
    }
  }
  if (!url) throw new Error("DATABASE_URL is not set");

  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS "inventory_categories" (
        "id"          serial PRIMARY KEY NOT NULL,
        "name"        text NOT NULL UNIQUE,
        "color"       text NOT NULL DEFAULT 'slate',
        "description" text,
        "created_at"  timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
    console.log('Tabla inventory_categories: OK');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "custom_inventory" (
        "id"           serial PRIMARY KEY NOT NULL,
        "category_id"  integer NOT NULL REFERENCES "inventory_categories"("id") ON DELETE RESTRICT,
        "name"         text NOT NULL,
        "sub_category" text,
        "brand"        text,
        "stock"        integer,
        "cost_price"   numeric(10, 2) NOT NULL,
        "sale_price"   numeric(10, 2) NOT NULL,
        "description"  text,
        "code"         text UNIQUE,
        "created_at"   timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at"   timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
    console.log('Tabla custom_inventory: OK');

    console.log('Migracion 0016 completada!');
    process.exit(0);
  } catch (error) {
    console.error('Error en migracion:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
