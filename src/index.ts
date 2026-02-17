import process from "node:process";
import { loadConfig } from "./runtime/config.js";

const config = loadConfig(process.env);
const startedAt = new Date().toISOString();

console.log(`[gravity] bootstrap started at ${startedAt}`);
console.log(`[gravity] env=${config.env}`);
console.log(`[gravity] database=${config.databaseUrl}`);
console.log("[gravity] runtime scaffold active (CP1 baseline)");

const heartbeat = setInterval(() => {
  const now = new Date().toISOString();
  console.log(`[gravity] alive ${now}`);
}, config.heartbeatSeconds * 1000);

function shutdown(signal: string): void {
  clearInterval(heartbeat);
  console.log(`[gravity] received ${signal}; shutdown complete`);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
