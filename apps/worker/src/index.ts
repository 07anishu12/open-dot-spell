import { WorkerProcess } from "./worker.js";

const worker = new WorkerProcess();
worker.attachSignalHandlers();

console.log("Starting Open Dot Spell Worker...");
await worker.start();
console.log("Open Dot Spell Worker ready. Standby mode (no tasks claimed).");

// Keep process alive in standby
const interval = setInterval(() => {
  // Heartbeat check (standby)
}, 60000);

process.on("exit", () => {
  clearInterval(interval);
});
