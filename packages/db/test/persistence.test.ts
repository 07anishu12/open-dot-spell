import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  createDatabaseClient,
  runMigrations,
  getAppliedMigrationVersions,
  MigrationError,
  getConversationMessages,
  insertMessage,
  getRunEvents,
  transitionRunStatusWithEvent,
  workspaces,
  conversations,
  runs,
  withLockRetry
} from "../src/index.js";

describe("Persistence Layer Integration Tests", () => {
  let tempDir: string;
  let dbFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ods-db-test-"));
    dbFile = path.join(tempDir, "test.db");
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on busy file
    }
  });

  it("1. Fresh migration: starts with empty database and migrates successfully", async () => {
    const { client, close } = await createDatabaseClient({ dbPath: dbFile, autoMigrate: false });

    // Verify no tables exist initially
    const beforeTables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
    );
    expect(beforeTables.rows).toHaveLength(0);

    // Run migrations
    const res = await runMigrations(client);
    expect(res.appliedCount).toBe(1);

    // Verify tables exist
    const afterTables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC;"
    );
    const tableNames = afterTables.rows.map((r) => r["name"]);
    expect(tableNames).toContain("_migrations");
    expect(tableNames).toContain("workspaces");
    expect(tableNames).toContain("conversations");
    expect(tableNames).toContain("messages");
    expect(tableNames).toContain("runs");
    expect(tableNames).toContain("run_events");

    const versions = await getAppliedMigrationVersions(client);
    expect(versions).toEqual([1]);

    await close();
  });

  it("2. Repeated migration: running migrations against current database is idempotent", async () => {
    const { client, close } = await createDatabaseClient({ dbPath: dbFile, autoMigrate: true });

    // Re-run migrations
    const res = await runMigrations(client);
    expect(res.appliedCount).toBe(0);

    const versions = await getAppliedMigrationVersions(client);
    expect(versions).toEqual([1]);

    await close();
  });

  it("3. Restart persistence: data survives closing and reopening database connection", async () => {
    // Session 1: Create client, populate synthetic entities
    const session1 = await createDatabaseClient({ dbPath: dbFile, autoMigrate: true });
    const now = new Date().toISOString();

    await session1.db.insert(workspaces).values({
      id: "ws_synth_1",
      name: "Synthetic Workspace",
      rootPath: "/tmp/synthetic-ws",
      allowedGlobs: JSON.stringify(["**/*"]),
      deniedGlobs: JSON.stringify(["**/.env*"]),
      createdAt: now,
      updatedAt: now
    });

    await session1.db.insert(conversations).values({
      id: "conv_synth_1",
      workspaceId: "ws_synth_1",
      title: "Synthetic Test Conversation",
      modelId: "gemma2:9b",
      providerId: "prov_ollama_local",
      createdAt: now,
      updatedAt: now
    });

    // Insert messages out of order to verify deterministic sorting
    await insertMessage(session1.client, {
      id: "msg_2",
      conversationId: "conv_synth_1",
      sequenceNumber: 2,
      role: "assistant",
      content: "Second message",
      tokenCount: 10,
      createdAt: new Date(Date.now() + 1000).toISOString()
    });

    await insertMessage(session1.client, {
      id: "msg_1",
      conversationId: "conv_synth_1",
      sequenceNumber: 1,
      role: "user",
      content: "First message",
      tokenCount: 5,
      createdAt: now
    });

    await session1.db.insert(runs).values({
      id: "run_synth_1",
      workspaceId: "ws_synth_1",
      conversationId: "conv_synth_1",
      workerId: "worker_local_1",
      leaseExpiresAt: new Date(Date.now() + 30000).toISOString(),
      fencingToken: 1,
      status: "running",
      startedAt: now,
      finishedAt: null,
      errorMessage: null
    });

    // Close session 1
    await session1.close();

    // Session 2: Reopen from same file path
    const session2 = await createDatabaseClient({ dbPath: dbFile, autoMigrate: false });

    // Verify workspace
    const ws = await session2.db.select().from(workspaces);
    expect(ws).toHaveLength(1);
    expect(ws[0]?.id).toBe("ws_synth_1");

    // Verify conversation
    const conv = await session2.db.select().from(conversations);
    expect(conv).toHaveLength(1);
    expect(conv[0]?.id).toBe("conv_synth_1");

    // Verify messages deterministic sequence ordering
    const messages = await getConversationMessages(session2.client, "conv_synth_1");
    expect(messages).toHaveLength(2);
    expect(messages[0]?.sequenceNumber).toBe(1);
    expect(messages[0]?.content).toBe("First message");
    expect(messages[1]?.sequenceNumber).toBe(2);
    expect(messages[1]?.content).toBe("Second message");

    // Verify run
    const runList = await session2.db.select().from(runs);
    expect(runList).toHaveLength(1);
    expect(runList[0]?.id).toBe("run_synth_1");
    expect(runList[0]?.status).toBe("running");

    await session2.close();
  });

  it("4. Foreign key enforcement: rejects invalid relational references", async () => {
    const { client, db, close } = await createDatabaseClient({ dbPath: dbFile, autoMigrate: true });
    const now = new Date().toISOString();

    // Attempt to insert conversation referencing nonexistent workspace
    await expect(
      db.insert(conversations).values({
        id: "conv_invalid",
        workspaceId: "ws_nonexistent",
        title: "Invalid Conv",
        modelId: "gemma2:9b",
        providerId: "prov_ollama_local",
        createdAt: now,
        updatedAt: now
      })
    ).rejects.toThrow();

    // Attempt to insert message referencing nonexistent conversation
    await expect(
      insertMessage(client, {
        id: "msg_invalid",
        conversationId: "conv_nonexistent",
        sequenceNumber: 1,
        role: "user",
        content: "Hello",
        tokenCount: 2,
        createdAt: now
      })
    ).rejects.toThrow();

    await close();
  });

  it("5. Migration failure: reports error and preserves existing database without destructive resets", async () => {
    const { client, close } = await createDatabaseClient({ dbPath: dbFile, autoMigrate: true });
    const now = new Date().toISOString();

    // Seed existing valid data
    await client.execute({
      sql: `INSERT INTO workspaces (id, name, root_path, allowed_globs, denied_globs, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?);`,
      args: ["ws_preserve", "Preserve Me", "/tmp/preserve", "[]", "[]", now, now]
    });

    // Define a failing migration (invalid SQL syntax)
    const badMigration = [
      {
        version: 2,
        name: "0002_broken_migration",
        sql: ["CREATE BROKEN TABLE syntax_error;"]
      }
    ];

    await expect(runMigrations(client, badMigration)).rejects.toThrowError(MigrationError);

    // Verify existing workspace data was preserved and not reset/dropped
    const ws = await client.execute("SELECT id, name FROM workspaces WHERE id = 'ws_preserve';");
    expect(ws.rows).toHaveLength(1);
    expect(ws.rows[0]?.["id"]).toBe("ws_preserve");

    // Verify migration version 2 was not marked applied
    const versions = await getAppliedMigrationVersions(client);
    expect(versions).toEqual([1]);

    await close();
  });

  it("6. Transaction consistency: atomic state transition + RunEvent commit or rollback together", async () => {
    const { client, db, close } = await createDatabaseClient({ dbPath: dbFile, autoMigrate: true });
    const now = new Date().toISOString();

    // Seed workspace and run
    await db.insert(workspaces).values({
      id: "ws_atomic_1",
      name: "Atomic WS",
      rootPath: "/tmp/atomic",
      allowedGlobs: "[]",
      deniedGlobs: "[]",
      createdAt: now,
      updatedAt: now
    });

    await db.insert(runs).values({
      id: "run_atomic_1",
      workspaceId: "ws_atomic_1",
      conversationId: null,
      status: "queued",
      startedAt: now,
      fencingToken: 0
    });

    // Execute atomic transition: status queued -> running + event run_started
    await transitionRunStatusWithEvent(client, {
      runId: "run_atomic_1",
      newStatus: "running",
      eventType: "run_started",
      payload: { worker: "worker_1" },
      eventSequenceNumber: 1
    });

    // Verify both updated
    const updatedRuns = await db.select().from(runs);
    expect(updatedRuns[0]?.status).toBe("running");

    const events = await getRunEvents(client, "run_atomic_1");
    expect(events).toHaveLength(1);
    expect(events[0]?.sequenceNumber).toBe(1);
    expect(events[0]?.eventType).toBe("run_started");

    // Failure case: attempt transition with duplicate event sequence number (unique constraint violation)
    await expect(
      transitionRunStatusWithEvent(client, {
        runId: "run_atomic_1",
        newStatus: "succeeded",
        eventType: "duplicate_event",
        payload: { error: true },
        eventSequenceNumber: 1 // duplicate sequence number causes rollback
      })
    ).rejects.toThrow();

    // Verify status was NOT changed to succeeded because transaction rolled back
    const rolledBackRuns = await db.select().from(runs);
    expect(rolledBackRuns[0]?.status).toBe("running");

    await close();
  });

  it("7. Concurrent writes: bounded concurrent writes handle locking and preserve message ordering", async () => {
    const { client, db, close } = await createDatabaseClient({ dbPath: dbFile, autoMigrate: true });
    const now = new Date().toISOString();

    await db.insert(workspaces).values({
      id: "ws_concurrent",
      name: "Concurrent WS",
      rootPath: "/tmp/concurrent",
      allowedGlobs: "[]",
      deniedGlobs: "[]",
      createdAt: now,
      updatedAt: now
    });

    await db.insert(conversations).values({
      id: "conv_concurrent",
      workspaceId: "ws_concurrent",
      title: "Concurrent Conv",
      modelId: "gemma2:9b",
      providerId: "prov_ollama_local",
      createdAt: now,
      updatedAt: now
    });

    // Write 10 messages concurrently with distinct sequence numbers using withLockRetry
    const writePromises = Array.from({ length: 10 }, (_, i) => {
      const seq = i + 1;
      return withLockRetry(async () => {
        await insertMessage(client, {
          id: `msg_concurrent_${seq}`,
          conversationId: "conv_concurrent",
          sequenceNumber: seq,
          role: seq % 2 === 1 ? "user" : "assistant",
          content: `Content ${seq}`,
          tokenCount: 5,
          createdAt: new Date().toISOString()
        });
      });
    });

    await Promise.all(writePromises);

    const messages = await getConversationMessages(client, "conv_concurrent");
    expect(messages).toHaveLength(10);
    // Verify ascending sequence order
    for (let i = 0; i < 10; i++) {
      expect(messages[i]?.sequenceNumber).toBe(i + 1);
      expect(messages[i]?.content).toBe(`Content ${i + 1}`);
    }

    await close();
  });
});
