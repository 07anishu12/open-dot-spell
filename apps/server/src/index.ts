import { buildApp } from "./app.js";

const PORT = Number(process.env["PORT"] || 3000);
const HOST = process.env["HOST"] || "127.0.0.1";

const app = buildApp();

app.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    console.error("Failed to start Open Dot Spell API server:", err);
    process.exit(1);
  }
  console.log(`Open Dot Spell API listening on ${address}`);
});
