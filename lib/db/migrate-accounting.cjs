const pg = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  // Read env manually
  const envPath = path.join(__dirname, '.env');
  let url = '';

  if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, 'utf8');
    for (const line of envText.split('\n')) {
      if (line.trim().startsWith('DATABASE_URL=')) {
        url = line.split('=')[1].replace(/"/g, '').trim();
      }
    }
  } else {
    // Try parent
    const parentEnvPath = path.join(__dirname, '..', '..', '.env');
    if (fs.existsSync(parentEnvPath)) {
      const envText = fs.readFileSync(parentEnvPath, 'utf8');
      for (const line of envText.split('\n')) {
        if (line.trim().startsWith('DATABASE_URL=')) {
          url = line.split('=')[1].replace(/"/g, '').trim();
        }
      }
    }
  }

  if (!url) {
    console.error("DATABASE_URL no está configurado.");
    process.exit(1);
  }

  const cleanUrl = url
    .replace(/^DATABASE_URL=/, "")
    .replace(/^["']|["']$/g, "")
    .trim();

  console.log("Conectando a la base de datos...");
  const client = new pg.Client({ 
    connectionString: cleanUrl, 
    ssl: { rejectUnauthorized: false } 
  });

  try {
    await client.connect();
    console.log("Conectado exitosamente.");

    // 1. Create accounts table
    console.log("Creando tabla: accounts");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "accounts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "code" varchar(20) NOT NULL,
        "name" varchar(100) NOT NULL,
        "type" text NOT NULL,
        "sub_type" varchar(50),
        "is_system_account" boolean DEFAULT false NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "accounts_code_unique" UNIQUE("code")
      );
    `);

    // 2. Create journal_entries table
    console.log("Creando tabla: journal_entries");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "journal_entries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "date" date NOT NULL,
        "reference_source" varchar(100),
        "narration" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // 3. Create journal_lines table
    console.log("Creando tabla: journal_lines");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "journal_lines" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "journal_entry_id" uuid NOT NULL,
        "account_id" uuid NOT NULL,
        "debit" numeric(12, 2) DEFAULT '0.00' NOT NULL,
        "credit" numeric(12, 2) DEFAULT '0.00' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // 4. Create accounting_mappings table
    console.log("Creando tabla: accounting_mappings");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "accounting_mappings" (
        "id" serial PRIMARY KEY NOT NULL,
        "event" varchar(50) NOT NULL,
        "account_code" varchar(20) NOT NULL,
        "direction" varchar(10) NOT NULL,
        "value_type" varchar(20) NOT NULL,
        "value_expression" varchar(50) NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // 5. Create accounting_periods table
    console.log("Creando tabla: accounting_periods");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "accounting_periods" (
        "id" serial PRIMARY KEY NOT NULL,
        "year" integer NOT NULL,
        "month" integer NOT NULL,
        "is_closed" boolean DEFAULT false NOT NULL,
        "closed_at" timestamp with time zone,
        "closed_by" text
      );
    `);

    // 6. Add foreign key constraints
    console.log("Añadiendo llaves foráneas...");
    try {
      await client.query(`
        ALTER TABLE "journal_lines" 
        ADD CONSTRAINT "journal_lines_journal_entry_id_journal_entries_id_fk" 
        FOREIGN KEY ("journal_entry_id") 
        REFERENCES "journal_entries"("id") 
        ON DELETE cascade 
        ON UPDATE no action;
      `);
      console.log("Llave foránea journal_entry_id añadida.");
    } catch (e) {
      console.log("La llave foránea journal_entry_id ya existía o no pudo crearse.");
    }

    try {
      await client.query(`
        ALTER TABLE "journal_lines" 
        ADD CONSTRAINT "journal_lines_account_id_accounts_id_fk" 
        FOREIGN KEY ("account_id") 
        REFERENCES "accounts"("id") 
        ON DELETE restrict 
        ON UPDATE no action;
      `);
      console.log("Llave foránea account_id añadida.");
    } catch (e) {
      console.log("La llave foránea account_id ya existía o no pudo crearse.");
    }

    console.log("Migración completada exitosamente.");
    process.exit(0);
  } catch (error) {
    console.error("Fallo en la migración:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
