import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const rawUrl = process.env.DATABASE_URL;
const connectionString = rawUrl
  .replace(/^DATABASE_URL=/, "")
  .replace(/^["']|["']$/g, "");

export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech") || connectionString.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : false,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
