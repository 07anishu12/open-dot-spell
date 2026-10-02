import { randomBytes } from "node:crypto";
import type { DatabaseInstance } from "@open-dot-spell/db";
import {
  claimQueuedRun,
  getConversationMessages,
  completeAssistantRun,
  getRunEventsAfterCursor,
  type ClaimedRun
} from "@open-dot-spell/db";
import type { ModelProviderAdapter, ProviderMessage } from "@open-dot-spell/providers";
import { OllamaProvider, OpenAICompatibleProvider, ProviderError } from "@open-dot-spell/providers";
import type { RunEventBus } from "@open-dot-spell/core";

export type WorkerStatus = "stopped" | "starting" | "ready" | "stopping";

export interface WorkerProcessOptions {
  db?: DatabaseInstance;
  workerId?: string;
  eventBus?: RunEventBus;
  providerResolver?: (providerId: string) => ModelProviderAdapter | Promise<ModelProviderAdapter>;
  pollingIntervalMs?: number;
  coalesceIntervalMs?: number;
  coalesceChunkSize?: number;
}

export class WorkerProcess {
  private status: WorkerStatus = "stopped";
  private shutdownHandlersAttached = false;
  private readonly db?: DatabaseInstance;
  private readonly workerId: string;
  private readonly eventBus?: RunEventBus;
  private readonly providerResolver?: (providerId: string) => ModelProviderAdapter | Promise<ModelProviderAdapter>;
  private readonly pollingIntervalMs: number;
  private readonly coalesceIntervalMs: number;
  private readonly coalesceChunkSize: number;

  private pollTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private activeRunPromise: Promise<void> | null = null;

  constructor(optionsOrDb?: DatabaseInstance | WorkerProcessOptions) {
    if (!optionsOrDb) {
      this.workerId = `worker_${process.pid}_${randomBytes(4).toString("hex")}`;
      this.pollingIntervalMs = 250;
      this.coalesceIntervalMs = 80;
      this.coalesceChunkSize = 64;
    } else if ("client" in optionsOrDb && "db" in optionsOrDb) {
      // Passed as DatabaseInstance directly (backward-compatible)
      this.db = optionsOrDb;
      this.workerId = `worker_${process.pid}_${randomBytes(4).toString("hex")}`;
      this.pollingIntervalMs = 250;
      this.coalesceIntervalMs = 80;
      this.coalesceChunkSize = 64;
    } else {
      const opts = optionsOrDb as WorkerProcessOptions;
      this.db = opts.db;
      this.workerId = opts.workerId ?? `worker_${process.pid}_${randomBytes(4).toString("hex")}`;
      this.eventBus = opts.eventBus;
      this.providerResolver = opts.providerResolver;
      this.pollingIntervalMs = opts.pollingIntervalMs ?? 250;
      this.coalesceIntervalMs = opts.coalesceIntervalMs ?? 80;
      this.coalesceChunkSize = opts.coalesceChunkSize ?? 64;
    }
  }

  getStatus(): WorkerStatus {
    return this.status;
  }

  getWorkerId(): string {
    return this.workerId;
  }

  async start(): Promise<void> {
    if (this.status === "ready" || this.status === "starting") {
      return;
    }
    this.status = "starting";

    // Verify database connectivity if instance was provided
    if (this.db) {
      await this.db.client.execute("SELECT 1;");
    }

    this.status = "ready";

    // Start background polling loop if polling interval is enabled
    if (this.pollingIntervalMs > 0 && this.db) {
      this.pollTimer = setInterval(() => {
        if (this.status === "ready" && !this.isProcessing) {
          void this.processNextRun().catch(() => {});
        }
      }, this.pollingIntervalMs);
    }
  }

  async stop(): Promise<void> {
    if (this.status === "stopped" || this.status === "stopping") {
      return;
    }
    this.status = "stopping";

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // Await active run execution completion if running
    if (this.activeRunPromise) {
      await this.activeRunPromise.catch(() => {});
    }

    if (this.db) {
      await this.db.close();
    }
    this.status = "stopped";
  }

  /**
   * Provisional one-worker claim: claims and executes the next available queued run.
   */
  async processNextRun(): Promise<boolean> {
    if (this.status !== "ready" || this.isProcessing || !this.db) {
      return false;
    }

    const claimed = await claimQueuedRun(this.db.client, this.workerId);
    if (!claimed) {
      return false;
    }

    this.isProcessing = true;
    const executePromise = this.executeClaimedRun(claimed);
    this.activeRunPromise = executePromise;

    try {
      await executePromise;
      return true;
    } finally {
      this.isProcessing = false;
      this.activeRunPromise = null;
    }
  }

  /**
   * Resolves the ModelProviderAdapter for a given provider identifier.
   */
  private async resolveProvider(providerId: string): Promise<ModelProviderAdapter> {
    if (this.providerResolver) {
      return await this.providerResolver(providerId);
    }

    if (providerId === "ollama" || providerId.startsWith("ollama")) {
      return new OllamaProvider();
    }

    if (providerId === "openai" || providerId.startsWith("openai")) {
      return new OpenAICompatibleProvider();
    }

    // Default local fallback is Ollama
    return new OllamaProvider();
  }

  /**
   * Executes a claimed run: reads conversation context, streams inference from provider,
   * coalesces deltas to SQLite without a transaction per token, and finalizes assistant response.
   */
  private async executeClaimedRun(claimed: ClaimedRun): Promise<void> {
    if (!this.db) return;

    const { run, conversation } = claimed;
    const runId = run.id;
    const conversationId = conversation.id;

    // 1. Emit run_started event to eventBus (already persisted to SQLite in claimQueuedRun)
    const startedEventRes = await this.db.client.execute({
      sql: "SELECT * FROM run_events WHERE run_id = ? AND event_type = 'run_started' ORDER BY id DESC LIMIT 1;",
      args: [runId]
    });
    if (startedEventRes.rows.length > 0) {
      const row = startedEventRes.rows[0];
      this.eventBus?.emit({
        id: Number(row["id"]),
        runId,
        sequenceNumber: Number(row["sequence_number"]),
        eventType: "run_started",
        payload: JSON.parse(String(row["payload"])),
        createdAt: String(row["created_at"])
      });
    }

    let assistantText = "";
    let completionTokens: number | null = null;
    let pendingDelta = "";
    let lastFlushTime = Date.now();

    // Query starting event sequence number
    const maxSeqRes = await this.db.client.execute({
      sql: "SELECT COALESCE(MAX(sequence_number), 0) AS max_seq FROM run_events WHERE run_id = ?;",
      args: [runId]
    });
    let currentEventSeq = Number(maxSeqRes.rows[0]["max_seq"]);

    // Helper to flush coalesced text delta to SQLite and notify eventBus
    const flushDelta = async () => {
      if (pendingDelta.length === 0 || !this.db) return;
      const deltaToFlush = pendingDelta;
      pendingDelta = "";
      lastFlushTime = Date.now();
      currentEventSeq++;

      const now = new Date().toISOString();
      const payload = { delta: deltaToFlush, runId };

      const insertRes = await this.db.client.execute({
        sql: "INSERT INTO run_events (run_id, sequence_number, event_type, payload, created_at) VALUES (?, ?, 'text_delta', ?, ?);",
        args: [runId, currentEventSeq, JSON.stringify(payload), now]
      });

      const eventId = Number(insertRes.lastInsertRowid);
      this.eventBus?.emit({
        id: eventId,
        runId,
        sequenceNumber: currentEventSeq,
        eventType: "text_delta",
        payload,
        createdAt: now
      });
    };

    try {
      // 2. Fetch conversation history
      const dbMessages = await getConversationMessages(this.db.client, conversationId);
      const chatMessages: ProviderMessage[] = dbMessages.map((m) => ({
        role: m.role,
        content: m.content
      }));

      // 3. Resolve inference adapter
      const provider = await this.resolveProvider(conversation.providerId);

      // 4. Stream chat from provider
      let providerError: string | null = null;

      for await (const event of provider.streamChat({
        modelId: conversation.modelId,
        messages: chatMessages
      })) {
        if (event.type === "text_delta") {
          assistantText += event.delta;
          pendingDelta += event.delta;

          // Check if coalescing threshold reached (length or time)
          if (
            pendingDelta.length >= this.coalesceChunkSize ||
            Date.now() - lastFlushTime >= this.coalesceIntervalMs
          ) {
            await flushDelta();
          }
        } else if (event.type === "usage") {
          completionTokens = event.completionTokens ?? null;
        } else if (event.type === "error") {
          providerError = event.message;
          break;
        }
      }

      // Flush any remaining buffered delta
      await flushDelta();

      if (providerError) {
        // Persist provider failure as readable terminal outcome
        await completeAssistantRun(this.db.client, {
          runId,
          conversationId,
          assistantContent: assistantText,
          tokenCount: completionTokens,
          status: "failed",
          errorMessage: providerError
        });
      } else {
        // Persist successful assistant turn transactionally
        await completeAssistantRun(this.db.client, {
          runId,
          conversationId,
          assistantContent: assistantText,
          tokenCount: completionTokens,
          status: "succeeded"
        });
      }
    } catch (err: unknown) {
      // Flush any pending delta before recording error
      await flushDelta().catch(() => {});

      const isInterrupted =
        (err instanceof ProviderError &&
          (err.category === "interrupted_stream" || err.category === "cancellation")) ||
        (err instanceof Error &&
          (err.name === "AbortError" ||
            err.message.toLowerCase().includes("interrupted") ||
            err.message.toLowerCase().includes("abort")));

      const finalStatus = isInterrupted ? "interrupted" : "failed";
      const errMsg = err instanceof Error ? err.message : String(err);

      await completeAssistantRun(this.db.client, {
        runId,
        conversationId,
        assistantContent: assistantText,
        tokenCount: completionTokens,
        status: finalStatus,
        errorMessage: errMsg
      });
    }

    // 5. Broadcast final terminal events from SQLite to eventBus
    const terminalEvents = await getRunEventsAfterCursor(this.db.client, runId, 0);
    for (const te of terminalEvents) {
      if (
        te.eventType === "message_completed" ||
        te.eventType === "run_completed" ||
        te.eventType === "run_failed" ||
        te.eventType === "run_interrupted"
      ) {
        let parsedPayload: Record<string, unknown> = {};
        try {
          parsedPayload = JSON.parse(te.payload);
        } catch {
          // Fallback
        }
        this.eventBus?.emit({
          id: te.id,
          runId,
          sequenceNumber: te.sequenceNumber,
          eventType: te.eventType,
          payload: parsedPayload,
          createdAt: te.createdAt
        });
      }
    }
  }

  attachSignalHandlers(): void {
    if (this.shutdownHandlersAttached) return;
    this.shutdownHandlersAttached = true;

    const onSignal = async (signal: string) => {
      console.log(`Open Dot Spell Worker received ${signal}, shutting down...`);
      await this.stop();
      process.exit(0);
    };

    process.on("SIGINT", () => void onSignal("SIGINT"));
    process.on("SIGTERM", () => void onSignal("SIGTERM"));
  }
}
