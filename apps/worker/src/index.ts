export * from "./worker.js";

import { fileURLToPath } from "node:url";
import { WorkerProcess } from "./worker.js";
import { createDatabaseClient } from "@open-dot-spell/db";

// Run standalone worker if executed directly as entrypoint
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  // Initialize database with automated migrations
  const db = await createDatabaseClient();

  const worker = new WorkerProcess(db);
  worker.attachSignalHandlers();

  console.log("Starting Open Dot Spell Worker...");
  await worker.start();
  console.log(`Open Dot Spell Worker ready. Standby mode (database: ${db.dbPath}).`);

  // Keep process alive in standby
  const interval = setInterval(() => {
    // Heartbeat check (standby)
  }, 60000);

  process.on("exit", () => {
    clearInterval(interval);
  });
}
