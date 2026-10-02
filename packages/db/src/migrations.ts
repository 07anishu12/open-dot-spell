import type { Client } from "@libsql/client";

export interface Migration {
  version: number;
  name: string;
  sql: string[];
}

export class MigrationError extends Error {
  constructor(
    public readonly version: number,
    public readonly migrationName: string,
    message: string,
    public override readonly cause?: unknown
  ) {
    super(`Migration ${version} (${migrationName}) failed: ${message}`);
    this.name = "MigrationError";
  }
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "0001_initial_schema",
    sql: [
      `CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        allowed_globs TEXT NOT NULL,
        denied_globs TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        model_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);`,
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sequence_number INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        token_count INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conv_seq ON messages(conversation_id, sequence_number);`,
      `CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);`,
      `CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        conversation_id TEXT,
        worker_id TEXT,
        lease_expires_at TEXT,
        fencing_token INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'succeeded', 'failed', 'interrupted', 'cancelled')),
        started_at TEXT NOT NULL,
        finished_at TEXT,
        error_message TEXT,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_runs_workspace ON runs(workspace_id);`,
      `CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);`,
      `CREATE INDEX IF NOT EXISTS idx_runs_lease ON runs(lease_expires_at);`,
      `CREATE TABLE IF NOT EXISTS run_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        sequence_number INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_run_events_run_seq ON run_events(run_id, sequence_number);`,
      `CREATE INDEX IF NOT EXISTS idx_run_events_created ON run_events(created_at);`
    ]
  }
];

export async function runMigrations(client: Client, customMigrations: Migration[] = MIGRATIONS): Promise<{ appliedCount: number }> {
  // 1. Ensure migrations tracking table exists
  await client.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  // 2. Query already applied migrations
  const res = await client.execute("SELECT version FROM _migrations ORDER BY version ASC;");
  const appliedVersions = new Set(res.rows.map((r) => Number(r["version"])));

  let appliedCount = 0;

  // 3. Apply pending migrations sequentially
  for (const migration of customMigrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    try {
      // Execute each statement in the migration
      for (const statement of migration.sql) {
        await client.execute(statement);
      }

      // Record applied migration
      await client.execute({
        sql: "INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?);",
        args: [migration.version, migration.name, new Date().toISOString()]
      });

      appliedCount++;
    } catch (err) {
      throw new MigrationError(
        migration.version,
        migration.name,
        err instanceof Error ? err.message : String(err),
        err
      );
    }
  }

  return { appliedCount };
}

export async function getAppliedMigrationVersions(client: Client): Promise<number[]> {
  try {
    const res = await client.execute("SELECT version FROM _migrations ORDER BY version ASC;");
    return res.rows.map((r) => Number(r["version"]));
  } catch {
    return [];
  }
}
