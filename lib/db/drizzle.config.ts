import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const dbUrl = process.env.DATABASE_URL
  .replace(/^DATABASE_URL=/, "")
  .replace(/^["']|["']$/g, "");

export default defineConfig({
  schema: "./src/schema/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
    ssl: "require",
  },
});
