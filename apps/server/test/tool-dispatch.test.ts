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
  runs,
  conversations
} from "@open-dot-spell/db";
import {
  z,
  RunEventBus,
  ToolRegistry,
  ToolDefinition,
  testEchoTool,
  formatTextTool,
  createDefaultToolRegistry
} from "@open-dot-spell/core";
import { ToolDispatcher, createDatabaseToolPersistence } from "../src/tools/dispatcher.js";

describe("Open Dot Spell Step 11 — Typed Tools & Single Dispatch Boundary", () => {
  let tempDir: string;
  let dbFile: string;
  let db: DatabaseInstance;
  let authManager: AuthManager;
  let eventBus: RunEventBus;
  const pairingSecret = "test-step11-pairing-secret-1234567890abcdef";
  let sessionToken: string;
  const workspaceId = "ws_test_step11";
  const otherWorkspaceId = "ws_test_other";
  let runId: string;
  let conversationId: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ods-step11-"));
    dbFile = path.join(tempDir, "step11.db");
    db = await createDatabaseClient({ dbPath: dbFile, autoMigrate: true });
    authManager = new AuthManager({ pairingSecret });
    eventBus = new RunEventBus();

    // Authenticate owner session
    const pair = authManager.pair(pairingSecret);
    sessionToken = pair.token!;

    const now = new Date().toISOString();

    // Seed test workspaces
    await db.db.insert(workspaces).values({
      id: workspaceId,
      name: "Step 11 Test Workspace",
      rootPath: tempDir,
      allowedGlobs: "[]",
      deniedGlobs: "[]",
      createdAt: now,
      updatedAt: now
    });

    await db.db.insert(workspaces).values({
      id: otherWorkspaceId,
      name: "Other Workspace",
      rootPath: tempDir,
      allowedGlobs: "[]",
      deniedGlobs: "[]",
      createdAt: now,
      updatedAt: now
    });

    // Seed conversation and active run
    conversationId = "conv_step11_test";
    await db.db.insert(conversations).values({
      id: conversationId,
      workspaceId,
      title: "Step 11 Conversation",
      modelId: "mock-model",
      providerId: "mock-provider",
      createdAt: now,
      updatedAt: now
    });

    runId = "run_step11_active";
    await db.db.insert(runs).values({
      id: runId,
      workspaceId,
      conversationId,
      userMessageId: "msg_user_1",
      status: "running",
      modelId: "mock-model",
      providerId: "mock-provider",
      startedAt: now,
      createdAt: now,
      updatedAt: now
    });
  });

  afterEach(async () => {
    try {
      if (db) await db.close();
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  describe("1. Tool Registry & Initial Pure Tools", () => {
    it("initializes default registry with test_echo and format_text tools", () => {
      const registry = createDefaultToolRegistry();
      expect(registry.has("test_echo")).toBe(true);
      expect(registry.has("format_text")).toBe(true);
      expect(registry.list()).toHaveLength(2);

      const echo = registry.get("test_echo");
      expect(echo?.name).toBe("test_echo");
      expect(echo?.version).toBe("1.0.0");
      expect(echo?.sideEffectClassification).toBe("none");
      expect(echo?.riskClass).toBe("pure");

      const format = registry.get("format_text");
      expect(format?.name).toBe("format_text");
      expect(format?.version).toBe("1.0.0");
      expect(format?.sideEffectClassification).toBe("none");
      expect(format?.riskClass).toBe("pure");
    });

    it("prevents duplicate registration in ToolRegistry", () => {
      const registry = new ToolRegistry();
      registry.register(testEchoTool);
      registry.register(formatTextTool);
      expect(() => registry.register(testEchoTool)).toThrow(/already registered/);
      expect(() => registry.register(formatTextTool)).toThrow(/already registered/);
    });
  });

  describe("2. Dispatch Boundary: Successful Pure Tool Execution", () => {
    it("successfully executes test_echo tool", async () => {
      const registry = createDefaultToolRegistry();
      const dispatcher = new ToolDispatcher({
        registry,
        persistence: createDatabaseToolPersistence(db),
        eventBus
      });

      const response = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_echo_1",
        toolName: "test_echo",
        rawArguments: { message: "Hello Open Dot Spell" }
      });

      expect(response.success).toBe(true);
      expect(response.toolName).toBe("test_echo");
      expect(response.toolVersion).toBe("1.0.0");
      expect((response.output as { echo: string }).echo).toBe("Hello Open Dot Spell");
      expect((response.output as { receivedAt: string }).receivedAt).toBeDefined();
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("successfully executes format_text with operations (uppercase, json_pretty, sort_lines, word_count)", async () => {
      const registry = createDefaultToolRegistry();
      const dispatcher = new ToolDispatcher({
        registry,
        persistence: createDatabaseToolPersistence(db),
        eventBus
      });

      // Uppercase
      const upRes = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_fmt_up",
        toolName: "format_text",
        rawArguments: { text: "hello world", operation: "uppercase" }
      });
      expect(upRes.success).toBe(true);
      expect((upRes.output as { formatted: string }).formatted).toBe("HELLO WORLD");

      // JSON pretty
      const jsonRes = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_fmt_json",
        toolName: "format_text",
        rawArguments: { text: '{"a":1,"b":[2,3]}', operation: "json_pretty" }
      });
      expect(jsonRes.success).toBe(true);
      expect((jsonRes.output as { formatted: string }).formatted).toBe(
        JSON.stringify({ a: 1, b: [2, 3] }, null, 2)
      );

      // Sort lines
      const sortRes = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_fmt_sort",
        toolName: "format_text",
        rawArguments: { text: "banana\napple\ncherry", operation: "sort_lines" }
      });
      expect(sortRes.success).toBe(true);
      expect((sortRes.output as { formatted: string }).formatted).toBe("apple\nbanana\ncherry");

      // Word count
      const wcRes = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_fmt_wc",
        toolName: "format_text",
        rawArguments: { text: "one two three four five", operation: "word_count" }
      });
      expect(wcRes.success).toBe(true);
      expect((wcRes.output as { wordCount: number }).wordCount).toBe(5);
    });

    it("accepts stringified JSON arguments from model output", async () => {
      const registry = createDefaultToolRegistry();
      const dispatcher = new ToolDispatcher({
        registry,
        persistence: createDatabaseToolPersistence(db)
      });

      const res = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_str_json",
        toolName: "format_text",
        rawArguments: JSON.stringify({ text: "stringified arguments", operation: "uppercase" })
      });

      expect(res.success).toBe(true);
      expect((res.output as { formatted: string }).formatted).toBe("STRINGIFIED ARGUMENTS");
    });
  });

  describe("3. Untrusted Input Handling & Schema Validation", () => {
    let dispatcher: ToolDispatcher;

    beforeEach(() => {
      dispatcher = new ToolDispatcher({
        registry: createDefaultToolRegistry(),
        persistence: createDatabaseToolPersistence(db)
      });
    });

    it("rejects malformed arguments (unparseable JSON string)", async () => {
      const res = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_bad_json",
        toolName: "test_echo",
        rawArguments: "{ text: invalid json"
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("MALFORMED_ARGUMENTS");
    });

    it("rejects malformed arguments (primitive non-object arguments)", async () => {
      const res = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_primitive",
        toolName: "test_echo",
        rawArguments: 42
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("MALFORMED_ARGUMENTS");
    });

    it("rejects missing required arguments", async () => {
      const res = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_missing_arg",
        toolName: "test_echo",
        rawArguments: {} // missing 'text'
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("MISSING_ARGUMENTS");
    });

    it("rejects extra / prohibited fields on strict input schema", async () => {
      const res = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_extra_fields",
        toolName: "test_echo",
        rawArguments: {
          message: "hello",
          unrecognized_param: "should_fail"
        }
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("PROHIBITED_FIELDS");
    });
  });

  describe("4. Unknown Tools & Version Enforcement", () => {
    it("rejects unknown tool", async () => {
      const dispatcher = new ToolDispatcher({
        registry: createDefaultToolRegistry(),
        persistence: createDatabaseToolPersistence(db)
      });

      const res = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_unknown",
        toolName: "non_existent_tool",
        rawArguments: {}
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("UNKNOWN_TOOL");
    });

    it("rejects tool when requested version does not match", async () => {
      const dispatcher = new ToolDispatcher({
        registry: createDefaultToolRegistry(),
        persistence: createDatabaseToolPersistence(db)
      });

      const res = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_ver_mismatch",
        toolName: "test_echo",
        toolVersion: "2.0.0", // Only 1.0.0 is registered
        rawArguments: { text: "hello" }
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("UNKNOWN_TOOL");
    });
  });

  describe("5. Output Validation, Size Budgets & Timeouts", () => {
    it("rejects tool execution when output violates output schema", async () => {
      const registry = new ToolRegistry();
      const faultyTool: ToolDefinition<{ text: string }, { result: number }> = {
        name: "faulty_output_tool",
        version: "1.0.0",
        description: "Returns invalid output type",
        riskClass: "pure",
        sideEffectClassification: "none",
        verificationMethod: "deterministic",
        requiredPermissions: [],
        timeout: 1000,
        inputSchema: z.object({ text: z.string() }).strict(),
        outputSchema: z.object({ result: z.number() }).strict(),
        async execute() {
          // Returns string instead of required number
          return { result: "not a number" as unknown as number };
        }
      };
      registry.register(faultyTool);

      const dispatcher = new ToolDispatcher({
        registry,
        persistence: createDatabaseToolPersistence(db)
      });

      const res = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_invalid_output",
        toolName: "faulty_output_tool",
        rawArguments: { text: "test" }
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("INVALID_OUTPUT");
    });

    it("rejects oversized output (> 64KB limit)", async () => {
      const registry = new ToolRegistry();
      const oversizedTool: ToolDefinition<{ size: number }, { data: string }> = {
        name: "oversized_tool",
        version: "1.0.0",
        description: "Generates massive output",
        riskClass: "pure",
        sideEffectClassification: "none",
        verificationMethod: "deterministic",
        requiredPermissions: [],
        timeout: 2000,
        inputSchema: z.object({ size: z.number() }).strict(),
        outputSchema: z.object({ data: z.string() }).strict(),
        async execute(input) {
          return { data: "A".repeat(input.size) };
        }
      };
      registry.register(oversizedTool);

      const dispatcher = new ToolDispatcher({
        registry,
        persistence: createDatabaseToolPersistence(db)
      });

      const res = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_oversized",
        toolName: "oversized_tool",
        rawArguments: { size: 70000 } // > 64 KB (65536 bytes)
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("OVERSIZED_OUTPUT");
    });

    it("enforces execution timeout budget", async () => {
      const registry = new ToolRegistry();
      const hangingTool: ToolDefinition<{ delayMs: number }, { ok: boolean }> = {
        name: "hanging_tool",
        version: "1.0.0",
        description: "Sleeps longer than timeout budget",
        riskClass: "pure",
        sideEffectClassification: "none",
        verificationMethod: "deterministic",
        requiredPermissions: [],
        timeout: 50, // 50ms strict timeout
        inputSchema: z.object({ delayMs: z.number() }).strict(),
        outputSchema: z.object({ ok: z.boolean() }).strict(),
        async execute(input, context) {
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve({ ok: true }), input.delayMs);
            context.signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new Error("aborted"));
            });
          });
        }
      };
      registry.register(hangingTool);

      const dispatcher = new ToolDispatcher({
        registry,
        persistence: createDatabaseToolPersistence(db)
      });

      const res = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_timeout",
        toolName: "hanging_tool",
        rawArguments: { delayMs: 500 }
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("EXECUTION_TIMEOUT");
    });
  });

  describe("6. Workspace & Run Scope Authorization", () => {
    let dispatcher: ToolDispatcher;

    beforeEach(() => {
      dispatcher = new ToolDispatcher({
        registry: createDefaultToolRegistry(),
        persistence: createDatabaseToolPersistence(db)
      });
    });

    it("rejects unauthorized workspace (cross-workspace run access)", async () => {
      const res = await dispatcher.dispatch({
        workspaceId: otherWorkspaceId, // run belongs to workspaceId, not otherWorkspaceId
        runId,
        toolCallId: "call_cross_ws",
        toolName: "test_echo",
        rawArguments: { text: "hello" }
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("UNAUTHORIZED_WORKSPACE");
    });

    it("rejects non-existent run (invalid run scope)", async () => {
      const res = await dispatcher.dispatch({
        workspaceId,
        runId: "run_non_existent",
        toolCallId: "call_bad_run",
        toolName: "test_echo",
        rawArguments: { text: "hello" }
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("INVALID_RUN_SCOPE");
    });

    it("rejects run in terminal state (completed/cancelled/failed)", async () => {
      const now = new Date().toISOString();
      const closedRunId = "run_closed_terminal";
      await db.db.insert(runs).values({
        id: closedRunId,
        workspaceId,
        conversationId,
        userMessageId: "msg_user_1",
        status: "succeeded",
        modelId: "mock-model",
        providerId: "mock-provider",
        startedAt: now,
        createdAt: now,
        updatedAt: now
      });

      const res = await dispatcher.dispatch({
        workspaceId,
        runId: closedRunId,
        toolCallId: "call_closed_run",
        toolName: "test_echo",
        rawArguments: { text: "hello" }
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("RUN_NOT_ACTIVE");
    });
  });

  describe("7. Step 11 Pure Tool Policy Enforcement", () => {
    it("rejects non-pure tools before Step 12", async () => {
      const registry = new ToolRegistry();
      const impureTool: ToolDefinition<{ path: string }, { done: boolean }> = {
        name: "impure_tool",
        version: "1.0.0",
        description: "Tool with filesystem side effects",
        riskClass: "high_risk",
        sideEffectClassification: "write_workspace",
        verificationMethod: "human_approval",
        requiredPermissions: ["filesystem:write"],
        timeout: 1000,
        inputSchema: z.object({ path: z.string() }).strict(),
        outputSchema: z.object({ done: z.boolean() }).strict(),
        async execute() {
          return { done: true };
        }
      };
      registry.register(impureTool);

      const dispatcher = new ToolDispatcher({
        registry,
        persistence: createDatabaseToolPersistence(db)
      });

      const res = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_impure",
        toolName: "impure_tool",
        rawArguments: { path: "/tmp/foo" }
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("POLICY_VIOLATION");
    });
  });

  describe("8. Event Recording & Ledger Verification", () => {
    it("records tool_call_prepared and tool_call_result in run_events with matching fingerprints", async () => {
      const emittedEvents: unknown[] = [];
      eventBus.subscribe(runId, (event) => {
        emittedEvents.push(event);
      });

      const dispatcher = new ToolDispatcher({
        registry: createDefaultToolRegistry(),
        persistence: createDatabaseToolPersistence(db),
        eventBus
      });

      const dispatchRes = await dispatcher.dispatch({
        workspaceId,
        runId,
        toolCallId: "call_ledger_test",
        toolName: "test_echo",
        rawArguments: { message: "Audit trail test" }
      });

      expect(dispatchRes.success).toBe(true);

      // Verify DB run_events
      const rows = await db.client.execute({
        sql: "SELECT sequence_number, event_type, payload FROM run_events WHERE run_id = ? ORDER BY sequence_number ASC;",
        args: [runId]
      });

      expect(rows.rows.length).toBeGreaterThanOrEqual(2);

      const preparedRow = rows.rows.find((r) => r["event_type"] === "tool_call_prepared");
      const resultRow = rows.rows.find((r) => r["event_type"] === "tool_call_result");

      expect(preparedRow).toBeDefined();
      expect(resultRow).toBeDefined();

      const preparedPayload = JSON.parse(String(preparedRow!["payload"]));
      const resultPayload = JSON.parse(String(resultRow!["payload"]));

      expect(preparedPayload.toolCallId).toBe("call_ledger_test");
      expect(preparedPayload.toolName).toBe("test_echo");
      expect(preparedPayload.toolVersion).toBe("1.0.0");
      expect(preparedPayload.actionFingerprint).toBeDefined();

      expect(resultPayload.toolCallId).toBe("call_ledger_test");
      expect(resultPayload.toolName).toBe("test_echo");
      expect(resultPayload.actionFingerprint).toBe(preparedPayload.actionFingerprint);
      expect(resultPayload.success).toBe(true);
      expect(resultPayload.output.echo).toBe("Audit trail test");
      expect(resultPayload.output.receivedAt).toBeDefined();

      // Verify sequence ordering
      expect(Number(preparedRow!["sequence_number"])).toBeLessThan(
        Number(resultRow!["sequence_number"])
      );

      // Verify EventBus published both events
      expect(emittedEvents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("9. Single Protected HTTP Dispatch Boundary & Unprotected Access Rejection", () => {
    it("successfully dispatches pure tool via HTTP endpoint with owner auth", async () => {
      const app = buildApp({ db, authManager, eventBus });

      const res = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/runs/${runId}/tools/dispatch`,
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": sessionToken
        },
        payload: {
          toolCallId: "http_call_1",
          toolName: "format_text",
          arguments: { text: "http dispatch test", operation: "uppercase" }
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.toolName).toBe("format_text");
      expect(body.output.formatted).toBe("HTTP DISPATCH TEST");
    });

    it("rejects unauthorized direct HTTP dispatch (missing auth cookie/token) with 401", async () => {
      const app = buildApp({ db, authManager });

      const res = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/runs/${runId}/tools/dispatch`,
        headers: {
          host: "127.0.0.1:3000"
          // Missing session token
        },
        payload: {
          toolCallId: "call_unauth",
          toolName: "test_echo",
          arguments: { text: "hello" }
        }
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 404 for nonexistent direct/unprotected tool execution paths", async () => {
      const app = buildApp({ db, authManager });

      // There must be NO unprotected direct endpoints such as /api/tools/format_text
      const res = await app.inject({
        method: "POST",
        url: "/api/tools/format_text",
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": sessionToken
        },
        payload: { text: "hello", operation: "uppercase" }
      });

      expect(res.statusCode).toBe(404);

      const getRes = await app.inject({
        method: "GET",
        url: "/api/tools/test_echo",
        headers: { host: "127.0.0.1:3000" }
      });
      expect(getRes.statusCode).toBe(404);
    });

    it("returns 403 when HTTP dispatch targets unauthorized workspace", async () => {
      const app = buildApp({ db, authManager });

      const res = await app.inject({
        method: "POST",
        url: `/api/workspaces/${otherWorkspaceId}/runs/${runId}/tools/dispatch`,
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": sessionToken
        },
        payload: {
          toolCallId: "http_cross_ws",
          toolName: "test_echo",
          arguments: { text: "hello" }
        }
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED_WORKSPACE");
    });
  });
});
