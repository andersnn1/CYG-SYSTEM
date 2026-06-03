import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.warn("DATABASE_URL must be set. Using placeholder for build/compilation phase.");
}

const connectionString = (rawUrl || "postgres://placeholder:placeholder@localhost:5432/placeholder")
  .replace(/^DATABASE_URL=/, "")
  .replace(/^["']|["']$/g, "");

const sql = neon(connectionString);
export const db = drizzle(sql, { schema });

export * from "./schema";
