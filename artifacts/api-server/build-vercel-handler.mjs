import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(artifactDir, "..", "..");

async function buildVercelHandler() {
  // Entry: api/_entry.ts — exports the Express app without calling app.listen()
  const entryPoint = path.resolve(rootDir, "api", "_entry.ts");
  // Output: api/index.js — Vercel picks this up as the serverless function
  const outfile = path.resolve(rootDir, "api", "index.js");

  await esbuild({
    entryPoints: [entryPoint],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile,
    logLevel: "info",
    external: [
      // Dotenv — Vercel injects env vars natively, no bundling needed
      "dotenv",
      // Native modules
      "*.node",
      // Pino and its transports are externalized (available in node_modules at Vercel runtime)
      "pino",
      "pino-http",
      "pino-pretty",
      "thread-stream",
      "pino-worker",
      "pino-file",
      "sonic-boom",
      // Other native/problematic packages
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "pg-native",
      "oracledb",
    ],
    sourcemap: "linked",
  });

  console.log("✅ Vercel handler built → api/index.js");
}

buildVercelHandler().catch((err) => {
  console.error(err);
  process.exit(1);
});
