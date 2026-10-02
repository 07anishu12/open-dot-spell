import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

export * from "./schema.js";

export function createDatabaseClient(dbPath: string = ":memory:") {
  const url = dbPath === ":memory:" ? "file::memory:" : `file:${dbPath}`;
  const client: Client = createClient({ url });
  const db: LibSQLDatabase<typeof schema> = drizzle(client, { schema });
  return { client, db };
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
