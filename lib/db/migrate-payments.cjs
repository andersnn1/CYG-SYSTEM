const pg = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
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

    console.log("Creando tabla: invoice_payments");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "invoice_payments" (
        "id" serial PRIMARY KEY NOT NULL,
        "invoice_id" integer NOT NULL,
        "amount" numeric(10, 2) NOT NULL,
        "payment_method" text NOT NULL DEFAULT 'efectivo',
        "transfer_reference" text,
        "payment_date" date NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // Add foreign key constraint if not exists
    console.log("Añadiendo llaves foráneas...");
    try {
      await client.query(`
        ALTER TABLE "invoice_payments" 
        ADD CONSTRAINT "invoice_payments_invoice_id_invoices_id_fk" 
        FOREIGN KEY ("invoice_id") 
        REFERENCES "invoices"("id") 
        ON DELETE cascade 
        ON UPDATE no action;
      `);
      console.log("Llave foránea invoice_id añadida.");
    } catch (e) {
      console.log("La llave foránea invoice_id ya existía o no pudo crearse.");
    }

    // Migrate historical payments
    console.log("Migrando datos de pagos históricos...");
    const checkRes = await client.query(`SELECT COUNT(*) FROM "invoice_payments"`);
    const count = parseInt(checkRes.rows[0].count);
    if (count === 0) {
      console.log("No hay pagos en 'invoice_payments'. Insertando históricos desde 'invoices'...");
      const insertRes = await client.query(`
        INSERT INTO "invoice_payments" ("invoice_id", "amount", "payment_method", "transfer_reference", "payment_date")
        SELECT "id", "total", "payment_method", "transfer_reference", "issue_date"
        FROM "invoices"
        WHERE "status" = 'pagada';
      `);
      console.log(`Se migraron ${insertRes.rowCount} registros de pago históricos.`);
    } else {
      console.log("La tabla 'invoice_payments' ya tiene registros. Omitiendo migración histórica.");
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
