import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { buildApp } from "../src/app.js";
import { AuthManager } from "../src/auth.js";
import {
  createDatabaseClient,
  DatabaseInstance,
  workspaces,
  getConversationMessages,
  getRun
} from "@open-dot-spell/db";
import {
  SyntheticTestProvider,
  ProviderError,
  type ModelProviderAdapter,
  type ObservedModelCapabilities
} from "@open-dot-spell/providers";
import { WorkerProcess } from "@open-dot-spell/worker";
import { RunEventBus } from "@open-dot-spell/core";

const mockCaps = (): ObservedModelCapabilities => ({
  modelId: "mock",
  providerId: "mock",
  streaming: "supported",
  toolCalling: "unsupported",
  structuredOutput: "unsupported",
  vision: "unsupported",
  embeddings: "unsupported",
  imageGeneration: "unsupported",
  limits: { contextLimit: 4096, outputLimit: 2048, requestTimeoutMs: 30000 },
  observedAt: new Date().toISOString()
});

describe("Open Dot Spell Step 09 — Conversations & Streaming Run Events", () => {
  let tempDir: string;
  let dbFile: string;
  let db: DatabaseInstance;
  let authManager: AuthManager;
  let eventBus: RunEventBus;
  const pairingSecret = "test-step09-pairing-secret-1234567890abcdef";
  let sessionToken: string;
  const workspaceId = "ws_test_step09";

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ods-step09-"));
    dbFile = path.join(tempDir, "step09.db");
    db = await createDatabaseClient({ dbPath: dbFile, autoMigrate: true });
    authManager = new AuthManager({ pairingSecret });
    eventBus = new RunEventBus();

    // Authenticate owner session
    const pair = authManager.pair(pairingSecret);
    sessionToken = pair.token!;

    // Seed test workspace
    const now = new Date().toISOString();
    await db.db.insert(workspaces).values({
      id: workspaceId,
      name: "Step 09 Test Workspace",
      rootPath: tempDir,
      allowedGlobs: "[]",
      deniedGlobs: "[]",
      createdAt: now,
      updatedAt: now
    });
  });

  afterEach(async () => {
    await db.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe("1. Conversation + Message APIs", () => {
    it("creates a conversation, lists conversations, and reloads conversation", async () => {
      const app = buildApp({ db, authManager, eventBus });

      // Create conversation
      const createRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations`,
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": sessionToken
        },
        payload: {
          title: "My Step 09 Conversation",
          modelId: "llama3",
          providerId: "ollama"
        }
      });

      expect(createRes.statusCode).toBe(201);
      const conv = JSON.parse(createRes.body).conversation;
      expect(conv.id).toMatch(/^conv_/);
      expect(conv.title).toBe("My Step 09 Conversation");
      expect(conv.modelId).toBe("llama3");
      expect(conv.providerId).toBe("ollama");

      // List conversations
      const listRes = await app.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/conversations`,
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": sessionToken
        }
      });
      expect(listRes.statusCode).toBe(200);
      const convs = JSON.parse(listRes.body).conversations;
      expect(convs).toHaveLength(1);
      expect(convs[0].id).toBe(conv.id);

      // Reload conversation
      const reloadRes = await app.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/conversations/${conv.id}`,
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": sessionToken
        }
      });
      expect(reloadRes.statusCode).toBe(200);
      const reloadBody = JSON.parse(reloadRes.body);
      expect(reloadBody.status).toBe("accessible");
      expect(reloadBody.conversation.id).toBe(conv.id);
    });

    it("rejects unauthorized conversation requests with 401", async () => {
      const app = buildApp({ db, authManager });

      const res = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations`,
        headers: { host: "127.0.0.1:3000" },
        payload: { title: "Secret", modelId: "m", providerId: "p" }
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects malformed conversation requests with 400", async () => {
      const app = buildApp({ db, authManager });

      const res = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations`,
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": sessionToken
        },
        payload: { title: "" } // Missing modelId and providerId
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("2. Transactional User Message & Idempotency", () => {
    it("persists user message and run intent transactionally before returning IDs", async () => {
      const app = buildApp({ db, authManager, eventBus });

      // Create conversation
      const convRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { title: "Turn Test", modelId: "test_model", providerId: "synthetic" }
      });
      const convId = JSON.parse(convRes.body).conversation.id;

      // Submit user turn
      const msgRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations/${convId}/messages`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: {
          content: "Hello Open Dot Spell",
          idempotencyKey: "idem_turn_001"
        }
      });

      expect(msgRes.statusCode).toBe(201);
      const data = JSON.parse(msgRes.body);
      expect(data.isDuplicate).toBe(false);
      expect(data.messageId).toMatch(/^msg_/);
      expect(data.runId).toMatch(/^run_/);
      expect(data.status).toBe("queued");

      // Verify user message exists in database
      const messages = await getConversationMessages(db.client, convId);
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe(data.messageId);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("Hello Open Dot Spell");

      // Verify run exists in database
      const run = await getRun(db.client, data.runId, workspaceId);
      expect(run).toBeDefined();
      expect(run?.status).toBe("queued");
      expect(run?.idempotencyKey).toBe("idem_turn_001");
    });

    it("prevents duplicate user turns when using the same idempotency key", async () => {
      const app = buildApp({ db, authManager, eventBus });

      const convRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { title: "Idempotency Test", modelId: "test_model", providerId: "synthetic" }
      });
      const convId = JSON.parse(convRes.body).conversation.id;

      // First submission
      const firstRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations/${convId}/messages`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: {
          content: "Repeated question",
          idempotencyKey: "idem_repeated_123"
        }
      });
      expect(firstRes.statusCode).toBe(201);
      const firstData = JSON.parse(firstRes.body);
      expect(firstData.isDuplicate).toBe(false);

      // Repeated submission with same idempotencyKey
      const secondRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations/${convId}/messages`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: {
          content: "Repeated question (second attempt)",
          idempotencyKey: "idem_repeated_123"
        }
      });
      expect(secondRes.statusCode).toBe(200);
      const secondData = JSON.parse(secondRes.body);
      expect(secondData.isDuplicate).toBe(true);
      expect(secondData.runId).toBe(firstData.runId);
      expect(secondData.messageId).toBe(firstData.messageId);

      // Verify no duplicate message was inserted in DB
      const messages = await getConversationMessages(db.client, convId);
      expect(messages).toHaveLength(1);
    });

    it("rejects message submission without required idempotencyKey with 400", async () => {
      const app = buildApp({ db, authManager, eventBus });

      const convRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { title: "Test", modelId: "m", providerId: "p" }
      });
      const convId = JSON.parse(convRes.body).conversation.id;

      const res = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations/${convId}/messages`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { content: "Missing idempotency key" }
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("3. Minimal Worker Inference & Coalesced Stream Events", () => {
    it("claims queued run, streams inference from provider, coalesces deltas, and persists assistant turn", async () => {
      const testProvider = new SyntheticTestProvider("normal_text");
      const worker = new WorkerProcess({
        db,
        eventBus,
        pollingIntervalMs: 0, // Manual execution for deterministic test
        providerResolver: () => testProvider,
        coalesceChunkSize: 32,
        coalesceIntervalMs: 50
      });
      await worker.start();

      const app = buildApp({ db, authManager, worker, eventBus });

      // Create conversation
      const convRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { title: "Inference Test", modelId: "synth_model", providerId: "synthetic" }
      });
      const convId = JSON.parse(convRes.body).conversation.id;

      // Submit user turn
      const msgRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations/${convId}/messages`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { content: "Tell me a story", idempotencyKey: "idem_inference_01" }
      });
      const runId = JSON.parse(msgRes.body).runId;

      // Execute worker claim & processing
      const processed = await worker.processNextRun();
      expect(processed).toBe(true);

      // Verify run status transitioned to succeeded
      const run = await getRun(db.client, runId, workspaceId);
      expect(run?.status).toBe("succeeded");
      expect(run?.finishedAt).toBeDefined();

      // Verify assistant message persisted in messages table
      const messages = await getConversationMessages(db.client, convId);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("user");
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].content).toContain("Hello from the deterministic test provider");
      expect(messages[1].tokenCount).toBe(8);

      // Verify run events in run_events table have ordered IDs
      const eventRes = await db.client.execute({
        sql: "SELECT * FROM run_events WHERE run_id = ? ORDER BY id ASC;",
        args: [runId]
      });
      expect(eventRes.rows.length).toBeGreaterThanOrEqual(4);
      const eventTypes = eventRes.rows.map((r) => String(r["event_type"]));
      expect(eventTypes).toContain("run_queued");
      expect(eventTypes).toContain("run_started");
      expect(eventTypes).toContain("text_delta");
      expect(eventTypes).toContain("run_completed");

      // Verify monotonic event IDs
      const ids = eventRes.rows.map((r) => Number(r["id"]));
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeGreaterThan(ids[i - 1]!);
      }

      await worker.stop();
    });

    it("persists provider failure as readable terminal outcome without crashing worker", async () => {
      // Provider that emits an error
      const failingProvider: ModelProviderAdapter = {
        providerId: "failing_mock",
        isLocal: true,
        async checkHealth() {
          return { ok: false, error: "Mock failure" };
        },
        async discoverModels() {
          return [];
        },
        async getCapabilities() {
          return mockCaps();
        },
        async *streamChat() {
          yield {
            type: "error" as const,
            modelId: "m",
            category: "provider_error" as const,
            message: "Simulated out of memory error in provider",
            fatal: true
          };
        }
      };

      const worker = new WorkerProcess({
        db,
        eventBus,
        pollingIntervalMs: 0,
        providerResolver: () => failingProvider
      });
      await worker.start();

      const app = buildApp({ db, authManager, worker, eventBus });

      const convRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { title: "Error Test", modelId: "m", providerId: "failing_mock" }
      });
      const convId = JSON.parse(convRes.body).conversation.id;

      const msgRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations/${convId}/messages`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { content: "Fail me", idempotencyKey: "idem_fail_01" }
      });
      const runId = JSON.parse(msgRes.body).runId;

      await worker.processNextRun();

      // Verify run status is failed with the readable error message
      const run = await getRun(db.client, runId, workspaceId);
      expect(run?.status).toBe("failed");
      expect(run?.errorMessage).toBe("Simulated out of memory error in provider");

      await worker.stop();
    });
  });

  describe("4. Reconnectable SSE Stream", () => {
    it("replays persisted events from cursor and terminates with done event", async () => {
      const testProvider = new SyntheticTestProvider("normal_text");
      const worker = new WorkerProcess({
        db,
        eventBus,
        pollingIntervalMs: 0,
        providerResolver: () => testProvider
      });
      await worker.start();

      const app = buildApp({ db, authManager, worker, eventBus });

      // Create conversation and submit message
      const convRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { title: "SSE Replay", modelId: "synth_model", providerId: "synthetic" }
      });
      const convId = JSON.parse(convRes.body).conversation.id;

      const msgRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations/${convId}/messages`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { content: "Hello SSE", idempotencyKey: "idem_sse_01" }
      });
      const runId = JSON.parse(msgRes.body).runId;

      // Process run to completion
      await worker.processNextRun();

      // Connect to SSE stream
      const sseRes = await app.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/runs/${runId}/events`,
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": sessionToken
        }
      });

      expect(sseRes.statusCode).toBe(200);
      expect(sseRes.headers["content-type"]).toBe("text/event-stream");

      const body = sseRes.body;
      expect(body).toContain("event: run_queued");
      expect(body).toContain("event: run_started");
      expect(body).toContain("event: text_delta");
      expect(body).toContain("event: done");
      expect(body).toContain('"status":"succeeded"');

      // Test cursor replay from midway
      const sseReplayRes = await app.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/runs/${runId}/events?cursor=2`,
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": sessionToken
        }
      });
      expect(sseReplayRes.statusCode).toBe(200);
      expect(sseReplayRes.body).not.toContain("id: 1\n");
      expect(sseReplayRes.body).not.toContain("id: 2\n");
      expect(sseReplayRes.body).toContain("event: done");

      await worker.stop();
    });

    it("seamlessly transitions from replay to live events via RunEventBus without duplicates", async () => {
      const app = buildApp({ db, authManager, eventBus });

      // Create conversation and submit message
      const convRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { title: "SSE Live", modelId: "m", providerId: "p" }
      });
      const convId = JSON.parse(convRes.body).conversation.id;

      const msgRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations/${convId}/messages`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { content: "Live transition", idempotencyKey: "idem_live_01" }
      });
      const runId = JSON.parse(msgRes.body).runId;

      // Simulate live event emission while SSE connects
      setTimeout(() => {
        eventBus.emit({
          id: 2,
          runId,
          sequenceNumber: 2,
          eventType: "text_delta",
          payload: { delta: "live chunk" },
          createdAt: new Date().toISOString()
        });
        eventBus.emit({
          id: 3,
          runId,
          sequenceNumber: 3,
          eventType: "run_completed",
          payload: { status: "succeeded" },
          createdAt: new Date().toISOString()
        });
      }, 50);

      const sseRes = await app.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/runs/${runId}/events`,
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": sessionToken
        }
      });

      expect(sseRes.statusCode).toBe(200);
      expect(sseRes.body).toContain("event: run_queued");
      expect(sseRes.body).toContain("event: text_delta");
      expect(sseRes.body).toContain("live chunk");
      expect(sseRes.body).toContain("event: run_completed");
      expect(sseRes.body).toContain("event: done");
    });

    it("emits periodic heartbeat comments to keep connection alive", async () => {
      // Use very short heartbeat for test
      const app = buildApp({ db, authManager, eventBus, sseHeartbeatMs: 40 });

      const convRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { title: "Heartbeat", modelId: "m", providerId: "p" }
      });
      const convId = JSON.parse(convRes.body).conversation.id;

      const msgRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations/${convId}/messages`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { content: "Wait heartbeat", idempotencyKey: "idem_hb_01" }
      });
      const runId = JSON.parse(msgRes.body).runId;

      // After 100ms, complete the run to end stream
      setTimeout(() => {
        eventBus.emit({
          id: 2,
          runId,
          sequenceNumber: 2,
          eventType: "run_completed",
          payload: { status: "succeeded" },
          createdAt: new Date().toISOString()
        });
      }, 100);

      const sseRes = await app.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/runs/${runId}/events`,
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": sessionToken
        }
      });

      expect(sseRes.statusCode).toBe(200);
      expect(sseRes.body).toContain(": heartbeat\n\n");
    });
  });

  describe("5. Persistence across Restart & Disconnect Decoupling", () => {
    it("retains all conversations, messages, and runs after database close and reopen", async () => {
      const app = buildApp({ db, authManager, eventBus });

      // Create conversation and message
      const convRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { title: "Restart Test", modelId: "llama3", providerId: "ollama" }
      });
      const convId = JSON.parse(convRes.body).conversation.id;

      const msgRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations/${convId}/messages`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { content: "Persistent message", idempotencyKey: "idem_restart_01" }
      });
      const runId = JSON.parse(msgRes.body).runId;

      // Close database connection
      await db.close();

      // Reopen database connection to the same file
      const reopenedDb = await createDatabaseClient({ dbPath: dbFile, autoMigrate: false });

      // Verify conversation and message survive restart
      const msgs = await getConversationMessages(reopenedDb.client, convId);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toBe("Persistent message");

      const run = await getRun(reopenedDb.client, runId, workspaceId);
      expect(run).toBeDefined();
      expect(run?.id).toBe(runId);

      await reopenedDb.close();
      // Re-create memory db for afterEach cleanup
      db = await createDatabaseClient({ dbPath: ":memory:" });
    });

    it("continues worker execution when UI/client disconnects", async () => {
      // Slow provider that streams multiple chunks
      const slowProvider: ModelProviderAdapter = {
        providerId: "slow_mock",
        isLocal: true,
        async checkHealth() {
          return { ok: true };
        },
        async discoverModels() {
          return [];
        },
        async getCapabilities() {
          return mockCaps();
        },
        async *streamChat() {
          yield { type: "text_delta", modelId: "m", delta: "chunk 1 " };
          await new Promise((r) => setTimeout(r, 50));
          yield { type: "text_delta", modelId: "m", delta: "chunk 2 " };
          await new Promise((r) => setTimeout(r, 50));
          yield { type: "text_delta", modelId: "m", delta: "chunk 3" };
        }
      };

      const worker = new WorkerProcess({
        db,
        eventBus,
        pollingIntervalMs: 0,
        providerResolver: () => slowProvider
      });
      await worker.start();

      const app = buildApp({ db, authManager, worker, eventBus });

      const convRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { title: "Disconnect Decoupling", modelId: "m", providerId: "slow_mock" }
      });
      const convId = JSON.parse(convRes.body).conversation.id;

      const msgRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations/${convId}/messages`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { content: "Start slow run", idempotencyKey: "idem_slow_01" }
      });
      const runId = JSON.parse(msgRes.body).runId;

      // Start processing in background
      const processPromise = worker.processNextRun();

      // Client connects and immediately disconnects (aborted request)
      const controller = new AbortController();
      const clientPromise = app.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/runs/${runId}/events`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        signal: controller.signal
      });

      // Disconnect client after 20ms
      setTimeout(() => controller.abort(), 20);
      await clientPromise.catch(() => {});

      // Wait for worker to finish
      await processPromise;

      // Verify worker completed successfully despite client disconnect
      const run = await getRun(db.client, runId, workspaceId);
      expect(run?.status).toBe("succeeded");

      const messages = await getConversationMessages(db.client, convId);
      expect(messages).toHaveLength(2);
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].content).toBe("chunk 1 chunk 2 chunk 3");

      await worker.stop();
    });

    it("handles interrupted inference by persisting partial response and setting interrupted terminal state", async () => {
      const interruptedProvider: ModelProviderAdapter = {
        providerId: "interrupted_mock",
        isLocal: true,
        async checkHealth() {
          return { ok: true };
        },
        async discoverModels() {
          return [];
        },
        async getCapabilities() {
          return mockCaps();
        },
        async *streamChat() {
          yield { type: "text_delta", modelId: "m", delta: "Partial thoughts before interrupt..." };
          throw new ProviderError({
            message: "Stream connection severed mid-generation",
            category: "interrupted_stream",
            providerId: "interrupted_mock",
            modelId: "m",
            fatal: true
          });
        }
      };

      const worker = new WorkerProcess({
        db,
        eventBus,
        pollingIntervalMs: 0,
        providerResolver: () => interruptedProvider
      });
      await worker.start();

      const app = buildApp({ db, authManager, worker, eventBus });

      const convRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { title: "Interrupt Test", modelId: "m", providerId: "interrupted_mock" }
      });
      const convId = JSON.parse(convRes.body).conversation.id;

      const msgRes = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/conversations/${convId}/messages`,
        headers: { host: "127.0.0.1:3000", "x-opendotspell-session": sessionToken },
        payload: { content: "Will be interrupted", idempotencyKey: "idem_interrupt_01" }
      });
      const runId = JSON.parse(msgRes.body).runId;

      await worker.processNextRun();

      // Verify run status is interrupted
      const run = await getRun(db.client, runId, workspaceId);
      expect(run?.status).toBe("interrupted");
      expect(run?.errorMessage).toContain("Stream connection severed mid-generation");

      // Verify partial assistant message was preserved
      const messages = await getConversationMessages(db.client, convId);
      expect(messages).toHaveLength(2);
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].content).toBe("Partial thoughts before interrupt...");

      // Verify run_interrupted event in run_events
      const eventRes = await db.client.execute({
        sql: "SELECT * FROM run_events WHERE run_id = ? AND event_type = 'run_interrupted';",
        args: [runId]
      });
      expect(eventRes.rows).toHaveLength(1);

      await worker.stop();
    });
  });
});
