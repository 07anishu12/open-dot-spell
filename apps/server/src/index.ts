import { buildApp } from "./app.js";
import { AuthManager } from "./auth.js";
import { createDatabaseClient } from "@open-dot-spell/db";
import { WorkerProcess } from "@open-dot-spell/worker";
import { RunEventBus } from "@open-dot-spell/core";

const PORT = Number(process.env["PORT"] || 3000);
const HOST = process.env["HOST"] || "127.0.0.1";

// Strictly prohibit non-loopback bindings (e.g. 0.0.0.0 or external LAN interfaces)
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
if (!LOOPBACK_HOSTS.has(HOST)) {
  console.error(
    `Security Violation: Refusing to bind to non-loopback address "${HOST}". ` +
      `Open Dot Spell is a local application and must bind to loopback (127.0.0.1 or ::1) only.`
  );
  process.exit(1);
}

// Initialize database with automated migrations
const db = await createDatabaseClient();

// Initialize single-owner auth manager with one-time pairing secret
const authManager = new AuthManager();
const pairingSecret = authManager.getPairingSecretForBootstrap();

// Shared event bus for live worker inference events and SSE subscribers
const eventBus = new RunEventBus();

// Initialize and start decoupled background worker for inference
const worker = new WorkerProcess({ db, eventBus });
await worker.start();

const app = buildApp({ db, authManager, worker, eventBus });

app.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    console.error("Failed to start Open Dot Spell API server:", err);
    process.exit(1);
  }
  console.log("==================================================================");
  console.log("  Open Dot Spell Local API Server (Single-Owner Model)");
  console.log(`  Listening on: ${address} (Loopback Only)`);
  console.log(`  Database path: ${db.dbPath}`);
  console.log(`  One-Time Pairing Code: ${pairingSecret}`);
  console.log("  (Valid for 15 minutes. Required to establish an authenticated UI session.)");
  console.log("==================================================================");
});
