import { WorkerProcess } from "./worker.js";
import { createDatabaseClient } from "@open-dot-spell/db";

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
