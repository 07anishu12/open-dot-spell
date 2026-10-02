import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as path from "node:path";
import * as fs from "node:fs";
import * as schema from "./schema.js";
import { runMigrations } from "./migrations.js";

export interface DatabaseConfig {
  dbPath?: string;
  autoMigrate?: boolean;
  busyTimeoutMs?: number;
}

export function resolveDatabasePath(customPath?: string): string {
  const p = customPath || process.env["DATABASE_PATH"] || path.join(process.cwd(), ".data", "opendotspell.db");
  if (p === ":memory:") {
    return ":memory:";
  }
  const resolved = path.resolve(p);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return resolved;
}

export async function createDatabaseClient(config: DatabaseConfig = {}) {
  const dbPath = resolveDatabasePath(config.dbPath);
  const url = dbPath === ":memory:" ? "file::memory:" : `file:${dbPath}`;
  const client: Client = createClient({ url });

  // 1. Enforce SQLite safety pragmas
  await client.execute("PRAGMA foreign_keys = ON;");
  const busyTimeout = config.busyTimeoutMs ?? 5000;
  await client.execute(`PRAGMA busy_timeout = ${busyTimeout};`);

  if (dbPath !== ":memory:") {
    await client.execute("PRAGMA journal_mode = WAL;");
    await client.execute("PRAGMA synchronous = NORMAL;");
  }

  // 2. Run migrations if requested (default true)
  if (config.autoMigrate !== false) {
    await runMigrations(client);
  }

  // 3. Initialize Drizzle ORM wrapper
  const db: LibSQLDatabase<typeof schema> = drizzle(client, { schema });

  return {
    client,
    db,
    dbPath,
    async close() {
      client.close();
    }
  };
}

export type DatabaseInstance = Awaited<ReturnType<typeof createDatabaseClient>>;
