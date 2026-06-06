import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { seedAccountingData } from "./lib/accounting-service";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Seed accounting master data
seedAccountingData().then(() => {
  logger.info("Accounting data seeded successfully");
}).catch(err => {
  logger.error(err, "Failed to seed accounting data");
});

app.listen(port, "0.0.0.0", () => {
  logger.info({ port, host: "0.0.0.0" }, "Server listening");
});
