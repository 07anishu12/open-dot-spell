import type { Client, InStatement } from "@libsql/client";
import { randomBytes } from "node:crypto";
import {
  type Conversation,
  type InsertConversation,
  type Run,
  type InsertMessage,
  type Message,
  type RunEvent,
  type InsertRunEvent,
  type ProviderCredential,
  type InsertProviderCredential
} from "./schema.js";

/**
 * Retrieves conversation messages deterministically ordered by sequence number and timestamp.
 */
export async function getConversationMessages(client: Client, conversationId: string): Promise<Message[]> {
  const result = await client.execute({
    sql: "SELECT * FROM messages WHERE conversation_id = ? ORDER BY sequence_number ASC, created_at ASC;",
    args: [conversationId]
  });

  return result.rows.map((row) => ({
    id: String(row["id"]),
    conversationId: String(row["conversation_id"]),
    sequenceNumber: Number(row["sequence_number"]),
    role: String(row["role"]) as Message["role"],
    content: String(row["content"]),
    tokenCount: row["token_count"] != null ? Number(row["token_count"]) : null,
    createdAt: String(row["created_at"])
  }));
}

/**
 * Inserts a message using parameterized query.
 */
export async function insertMessage(client: Client, msg: InsertMessage): Promise<void> {
  await client.execute({
    sql: `INSERT INTO messages (id, conversation_id, sequence_number, role, content, token_count, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?);`,
    args: [
      msg.id,
      msg.conversationId,
      msg.sequenceNumber,
      msg.role,
      msg.content,
      msg.tokenCount ?? null,
      msg.createdAt
    ]
  });
}

/**
 * Retrieves run events deterministically ordered by sequence number and ID.
 */
export async function getRunEvents(client: Client, runId: string): Promise<RunEvent[]> {
  const result = await client.execute({
    sql: "SELECT * FROM run_events WHERE run_id = ? ORDER BY sequence_number ASC, id ASC;",
    args: [runId]
  });

  return result.rows.map((row) => ({
    id: Number(row["id"]),
    runId: String(row["run_id"]),
    sequenceNumber: Number(row["sequence_number"]),
    eventType: String(row["event_type"]),
    payload: String(row["payload"]),
    createdAt: String(row["created_at"])
  }));
}

/**
 * Inserts a run event using parameterized query.
 */
export async function insertRunEvent(client: Client, event: InsertRunEvent): Promise<void> {
  await client.execute({
    sql: `INSERT INTO run_events (run_id, sequence_number, event_type, payload, created_at)
          VALUES (?, ?, ?, ?, ?);`,
    args: [
      event.runId,
      event.sequenceNumber,
      event.eventType,
      event.payload,
      event.createdAt
    ]
  });
}

export interface TransitionRunParams {
  runId: string;
  newStatus: Run["status"];
  eventType: string;
  payload: Record<string, unknown>;
  eventSequenceNumber: number;
  errorMessage?: string | null;
}

/**
 * Atomically commits a Run status transition along with its corresponding RunEvent.
 * If either operation fails, neither is committed.
 */
export async function transitionRunStatusWithEvent(client: Client, params: TransitionRunParams): Promise<void> {
  const now = new Date().toISOString();
  const payloadStr = JSON.stringify(params.payload);

  // Use batch for atomic multi-statement transaction
  await client.batch(
    [
      {
        sql: `UPDATE runs SET status = ?, error_message = ? WHERE id = ?;`,
        args: [params.newStatus, params.errorMessage ?? null, params.runId]
      },
      {
        sql: `INSERT INTO run_events (run_id, sequence_number, event_type, payload, created_at)
              VALUES (?, ?, ?, ?, ?);`,
        args: [params.runId, params.eventSequenceNumber, params.eventType, payloadStr, now]
      }
    ],
    "write"
  );
}

/**
 * Bounded retry helper for transient SQLite lock contention.
 */
export async function withLockRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseBackoffMs = 50
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (err: unknown) {
      attempt++;
      const isLockError =
        err instanceof Error &&
        (err.message.includes("SQLITE_BUSY") ||
          err.message.includes("database is locked") ||
          err.message.includes("busy"));

      if (!isLockError || attempt > maxRetries) {
        throw err;
      }

      const backoff = baseBackoffMs * Math.pow(2, attempt - 1) + Math.random() * 20;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

/**
 * Verifies that a resource exists and belongs strictly to the given workspace.
 */
export async function verifyWorkspaceScope(
  client: Client,
  resourceType: "conversation" | "run" | "message",
  resourceId: string,
  workspaceId: string
): Promise<boolean> {
  if (resourceType === "conversation") {
    const res = await client.execute({
      sql: "SELECT id FROM conversations WHERE id = ? AND workspace_id = ?;",
      args: [resourceId, workspaceId]
    });
    return res.rows.length > 0;
  }

  if (resourceType === "run") {
    const res = await client.execute({
      sql: "SELECT id FROM runs WHERE id = ? AND workspace_id = ?;",
      args: [resourceId, workspaceId]
    });
    return res.rows.length > 0;
  }

  if (resourceType === "message") {
    const res = await client.execute({
      sql: `SELECT m.id FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE m.id = ? AND c.workspace_id = ?;`,
      args: [resourceId, workspaceId]
    });
    return res.rows.length > 0;
  }

  return false;
}

/**
 * Inserts or replaces a provider credential.
 */
export async function insertProviderCredential(
  client: Client,
  cred: InsertProviderCredential
): Promise<void> {
  await client.execute({
    sql: `INSERT OR REPLACE INTO provider_credentials (id, provider_id, name, masked_value, encrypted_value, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?);`,
    args: [
      cred.id,
      cred.providerId,
      cred.name,
      cred.maskedValue,
      cred.encryptedValue,
      cred.createdAt,
      cred.updatedAt
    ]
  });
}

/**
 * Lists all provider credentials metadata without ever returning the encrypted or raw secrets.
 */
export async function listProviderCredentials(
  client: Client
): Promise<Omit<ProviderCredential, "encryptedValue">[]> {
  const res = await client.execute(
    "SELECT id, provider_id, name, masked_value, created_at, updated_at FROM provider_credentials ORDER BY created_at ASC;"
  );
  return res.rows.map((row) => ({
    id: String(row["id"]),
    providerId: String(row["provider_id"]),
    name: String(row["name"]),
    maskedValue: String(row["masked_value"]),
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"])
  }));
}

/**
 * Retrieves an encrypted provider credential for internal runtime decryption only.
 */
export async function getProviderCredentialEncrypted(
  client: Client,
  id: string
): Promise<ProviderCredential | null> {
  const res = await client.execute({
    sql: "SELECT * FROM provider_credentials WHERE id = ?;",
    args: [id]
  });
  if (res.rows.length === 0) {
    return null;
  }
  const row = res.rows[0];
  return {
    id: String(row["id"]),
    providerId: String(row["provider_id"]),
    name: String(row["name"]),
    maskedValue: String(row["masked_value"]),
    encryptedValue: String(row["encrypted_value"]),
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"])
  };
}

// ==========================================
// Step 09: Conversations & Runs Operations
// ==========================================

export async function createConversation(
  client: Client,
  conv: InsertConversation
): Promise<Conversation> {
  await client.execute({
    sql: `INSERT INTO conversations (id, workspace_id, title, model_id, provider_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?);`,
    args: [
      conv.id,
      conv.workspaceId,
      conv.title,
      conv.modelId,
      conv.providerId,
      conv.createdAt,
      conv.updatedAt
    ]
  });

  return {
    id: conv.id,
    workspaceId: conv.workspaceId,
    title: conv.title,
    modelId: conv.modelId,
    providerId: conv.providerId,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt
  };
}

export async function listConversations(
  client: Client,
  workspaceId: string
): Promise<Conversation[]> {
  const res = await client.execute({
    sql: "SELECT * FROM conversations WHERE workspace_id = ? ORDER BY updated_at DESC, created_at DESC;",
    args: [workspaceId]
  });

  return res.rows.map((row) => ({
    id: String(row["id"]),
    workspaceId: String(row["workspace_id"]),
    title: String(row["title"]),
    modelId: String(row["model_id"]),
    providerId: String(row["provider_id"]),
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"])
  }));
}

export async function getConversation(
  client: Client,
  conversationId: string,
  workspaceId?: string
): Promise<Conversation | null> {
  const sql = workspaceId
    ? "SELECT * FROM conversations WHERE id = ? AND workspace_id = ?;"
    : "SELECT * FROM conversations WHERE id = ?;";
  const args = workspaceId ? [conversationId, workspaceId] : [conversationId];

  const res = await client.execute({ sql, args });
  if (res.rows.length === 0) return null;

  const row = res.rows[0];
  return {
    id: String(row["id"]),
    workspaceId: String(row["workspace_id"]),
    title: String(row["title"]),
    modelId: String(row["model_id"]),
    providerId: String(row["provider_id"]),
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"])
  };
}

export interface CreateUserTurnParams {
  workspaceId: string;
  conversationId: string;
  content: string;
  idempotencyKey: string;
}

export interface CreateUserTurnResult {
  isDuplicate: boolean;
  messageId: string;
  runId: string;
  status: Run["status"];
}

/**
 * Persists user message and run intent transactionally before returning IDs.
 * Strictly prevents duplicate user turns via conversation-scoped idempotencyKey.
 */
export async function createUserTurnAndRunTransaction(
  client: Client,
  params: CreateUserTurnParams
): Promise<CreateUserTurnResult> {
  // 1. Check if run with this idempotency key already exists for this conversation
  const existingRunRes = await client.execute({
    sql: "SELECT id, status FROM runs WHERE conversation_id = ? AND idempotency_key = ?;",
    args: [params.conversationId, params.idempotencyKey]
  });

  if (existingRunRes.rows.length > 0) {
    const runRow = existingRunRes.rows[0];
    const runId = String(runRow["id"]);
    const status = String(runRow["status"]) as Run["status"];

    // Find the associated user message ID from initial run event
    const eventRes = await client.execute({
      sql: "SELECT payload FROM run_events WHERE run_id = ? AND event_type = 'run_queued' LIMIT 1;",
      args: [runId]
    });

    let messageId = "";
    if (eventRes.rows.length > 0) {
      try {
        const payload = JSON.parse(String(eventRes.rows[0]["payload"]));
        messageId = payload.messageId ?? "";
      } catch {
        // Fallback
      }
    }

    return {
      isDuplicate: true,
      messageId,
      runId,
      status
    };
  }

  // 2. Fetch current maximum sequence number for this conversation
  const maxSeqRes = await client.execute({
    sql: "SELECT COALESCE(MAX(sequence_number), 0) AS max_seq FROM messages WHERE conversation_id = ?;",
    args: [params.conversationId]
  });
  const nextSeq = Number(maxSeqRes.rows[0]["max_seq"]) + 1;

  const messageId = `msg_${randomBytes(8).toString("hex")}`;
  const runId = `run_${randomBytes(8).toString("hex")}`;
  const now = new Date().toISOString();
  const initialPayload = JSON.stringify({
    messageId,
    content: params.content,
    conversationId: params.conversationId
  });

  try {
    // 3. Atomically persist user message, run intent, initial run_event, and touch conversation
    await client.batch(
      [
        {
          sql: `INSERT INTO messages (id, conversation_id, sequence_number, role, content, token_count, created_at)
                VALUES (?, ?, ?, 'user', ?, NULL, ?);`,
          args: [messageId, params.conversationId, nextSeq, params.content, now]
        },
        {
          sql: `INSERT INTO runs (id, workspace_id, conversation_id, worker_id, lease_expires_at, fencing_token, status, idempotency_key, started_at, finished_at, error_message)
                VALUES (?, ?, ?, NULL, NULL, 0, 'queued', ?, ?, NULL, NULL);`,
          args: [runId, params.workspaceId, params.conversationId, params.idempotencyKey, now]
        },
        {
          sql: `INSERT INTO run_events (run_id, sequence_number, event_type, payload, created_at)
                VALUES (?, 1, 'run_queued', ?, ?);`,
          args: [runId, initialPayload, now]
        },
        {
          sql: `UPDATE conversations SET updated_at = ? WHERE id = ?;`,
          args: [now, params.conversationId]
        }
      ],
      "write"
    );

    return {
      isDuplicate: false,
      messageId,
      runId,
      status: "queued"
    };
  } catch (err: unknown) {
    // Check if error is due to concurrent duplicate insertion on unique index
    const isUniqueError =
      err instanceof Error &&
      (err.message.includes("UNIQUE constraint failed") ||
        err.message.includes("constraint failed"));

    if (isUniqueError) {
      // Re-query the existing run
      const retryRes = await client.execute({
        sql: "SELECT id, status FROM runs WHERE conversation_id = ? AND idempotency_key = ?;",
        args: [params.conversationId, params.idempotencyKey]
      });
      if (retryRes.rows.length > 0) {
        const runRow = retryRes.rows[0];
        const rId = String(runRow["id"]);
        const rStatus = String(runRow["status"]) as Run["status"];

        const eventRes = await client.execute({
          sql: "SELECT payload FROM run_events WHERE run_id = ? AND event_type = 'run_queued' LIMIT 1;",
          args: [rId]
        });
        let msgId = "";
        if (eventRes.rows.length > 0) {
          try {
            const payload = JSON.parse(String(eventRes.rows[0]["payload"]));
            msgId = payload.messageId ?? "";
          } catch {
            // Fallback
          }
        }

        return {
          isDuplicate: true,
          messageId: msgId,
          runId: rId,
          status: rStatus
        };
      }
    }

    throw err;
  }
}

export interface ClaimedRun {
  run: Run;
  conversation: Conversation;
}

/**
 * Claims the next queued or expired lease run for a single worker using transactional fencing.
 */
export async function claimQueuedRun(
  client: Client,
  workerId: string,
  leaseDurationMs = 30000
): Promise<ClaimedRun | null> {
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseExpiresIso = new Date(now.getTime() + leaseDurationMs).toISOString();

  // Find candidate run
  const res = await client.execute({
    sql: `SELECT r.*, c.title AS conv_title, c.model_id AS conv_model_id, c.provider_id AS conv_provider_id,
                 c.created_at AS conv_created_at, c.updated_at AS conv_updated_at
          FROM runs r
          JOIN conversations c ON r.conversation_id = c.id
          WHERE r.status = 'queued'
             OR (r.status = 'running' AND r.lease_expires_at IS NOT NULL AND r.lease_expires_at < ?)
          ORDER BY r.started_at ASC
          LIMIT 1;`,
    args: [nowIso]
  });

  if (res.rows.length === 0) {
    return null;
  }

  const row = res.rows[0];
  const runId = String(row["id"]);

  // Attempt atomic lease update with fencing token increment
  const updateRes = await client.execute({
    sql: `UPDATE runs
          SET status = 'running', worker_id = ?, lease_expires_at = ?, fencing_token = fencing_token + 1
          WHERE id = ? AND (status = 'queued' OR (status = 'running' AND lease_expires_at < ?));`,
    args: [workerId, leaseExpiresIso, runId, nowIso]
  });

  if (updateRes.rowsAffected === 0) {
    // Another worker claimed it concurrently
    return null;
  }

  // Record run_started event
  const maxEventRes = await client.execute({
    sql: "SELECT COALESCE(MAX(sequence_number), 0) AS max_seq FROM run_events WHERE run_id = ?;",
    args: [runId]
  });
  const nextSeq = Number(maxEventRes.rows[0]["max_seq"]) + 1;

  await client.execute({
    sql: `INSERT INTO run_events (run_id, sequence_number, event_type, payload, created_at)
          VALUES (?, ?, 'run_started', ?, ?);`,
    args: [runId, nextSeq, JSON.stringify({ workerId, leaseExpiresAt: leaseExpiresIso }), nowIso]
  });

  const run: Run = {
    id: runId,
    workspaceId: String(row["workspace_id"]),
    conversationId: row["conversation_id"] ? String(row["conversation_id"]) : null,
    workerId,
    leaseExpiresAt: leaseExpiresIso,
    fencingToken: Number(row["fencing_token"]) + 1,
    status: "running",
    idempotencyKey: row["idempotency_key"] ? String(row["idempotency_key"]) : null,
    startedAt: String(row["started_at"]),
    finishedAt: null,
    errorMessage: null
  };

  const conversation: Conversation = {
    id: String(row["conversation_id"]),
    workspaceId: String(row["workspace_id"]),
    title: String(row["conv_title"]),
    modelId: String(row["conv_model_id"]),
    providerId: String(row["conv_provider_id"]),
    createdAt: String(row["conv_created_at"]),
    updatedAt: String(row["conv_updated_at"])
  };

  return { run, conversation };
}

export async function getRun(
  client: Client,
  runId: string,
  workspaceId?: string
): Promise<Run | null> {
  const sql = workspaceId
    ? "SELECT * FROM runs WHERE id = ? AND workspace_id = ?;"
    : "SELECT * FROM runs WHERE id = ?;";
  const args = workspaceId ? [runId, workspaceId] : [runId];

  const res = await client.execute({ sql, args });
  if (res.rows.length === 0) return null;

  const row = res.rows[0];
  return {
    id: String(row["id"]),
    workspaceId: String(row["workspace_id"]),
    conversationId: row["conversation_id"] ? String(row["conversation_id"]) : null,
    workerId: row["worker_id"] ? String(row["worker_id"]) : null,
    leaseExpiresAt: row["lease_expires_at"] ? String(row["lease_expires_at"]) : null,
    fencingToken: Number(row["fencing_token"]),
    status: String(row["status"]) as Run["status"],
    idempotencyKey: row["idempotency_key"] ? String(row["idempotency_key"]) : null,
    startedAt: String(row["started_at"]),
    finishedAt: row["finished_at"] ? String(row["finished_at"]) : null,
    errorMessage: row["error_message"] ? String(row["error_message"]) : null
  };
}

export async function getRunEventsAfterCursor(
  client: Client,
  runId: string,
  cursor: number
): Promise<RunEvent[]> {
  const res = await client.execute({
    sql: "SELECT * FROM run_events WHERE run_id = ? AND id > ? ORDER BY id ASC;",
    args: [runId, cursor]
  });

  return res.rows.map((row) => ({
    id: Number(row["id"]),
    runId: String(row["run_id"]),
    sequenceNumber: Number(row["sequence_number"]),
    eventType: String(row["event_type"]),
    payload: String(row["payload"]),
    createdAt: String(row["created_at"])
  }));
}

export async function batchInsertRunEvents(
  client: Client,
  events: InsertRunEvent[]
): Promise<void> {
  if (events.length === 0) return;

  const statements = events.map((e) => ({
    sql: `INSERT INTO run_events (run_id, sequence_number, event_type, payload, created_at)
          VALUES (?, ?, ?, ?, ?);`,
    args: [e.runId, e.sequenceNumber, e.eventType, e.payload, e.createdAt]
  }));

  await client.batch(statements, "write");
}

export interface CompleteRunParams {
  runId: string;
  conversationId: string;
  assistantContent: string;
  tokenCount: number | null;
  status: "succeeded" | "failed" | "interrupted";
  errorMessage?: string | null;
  terminalPayload?: Record<string, unknown>;
}

export async function completeAssistantRun(
  client: Client,
  params: CompleteRunParams
): Promise<void> {
  const now = new Date().toISOString();

  // Get max sequence number in messages
  const maxMsgSeqRes = await client.execute({
    sql: "SELECT COALESCE(MAX(sequence_number), 0) AS max_seq FROM messages WHERE conversation_id = ?;",
    args: [params.conversationId]
  });
  const nextMsgSeq = Number(maxMsgSeqRes.rows[0]["max_seq"]) + 1;

  // Get max sequence number in run_events
  const maxEventSeqRes = await client.execute({
    sql: "SELECT COALESCE(MAX(sequence_number), 0) AS max_seq FROM run_events WHERE run_id = ?;",
    args: [params.runId]
  });
  let nextEventSeq = Number(maxEventSeqRes.rows[0]["max_seq"]) + 1;

  const batchStmts: InStatement[] = [];

  if (params.status === "succeeded") {
    const assistantMsgId = `msg_${randomBytes(8).toString("hex")}`;
    batchStmts.push(
      {
        sql: `INSERT INTO messages (id, conversation_id, sequence_number, role, content, token_count, created_at)
              VALUES (?, ?, ?, 'assistant', ?, ?, ?);`,
        args: [
          assistantMsgId,
          params.conversationId,
          nextMsgSeq,
          params.assistantContent,
          params.tokenCount,
          now
        ]
      },
      {
        sql: `UPDATE runs SET status = 'succeeded', finished_at = ?, error_message = NULL WHERE id = ?;`,
        args: [now, params.runId]
      },
      {
        sql: `INSERT INTO run_events (run_id, sequence_number, event_type, payload, created_at)
              VALUES (?, ?, 'message_completed', ?, ?);`,
        args: [
          params.runId,
          nextEventSeq++,
          JSON.stringify({
            messageId: assistantMsgId,
            role: "assistant",
            content: params.assistantContent,
            tokenCount: params.tokenCount
          }),
          now
        ]
      },
      {
        sql: `INSERT INTO run_events (run_id, sequence_number, event_type, payload, created_at)
              VALUES (?, ?, 'run_completed', ?, ?);`,
        args: [
          params.runId,
          nextEventSeq++,
          JSON.stringify(params.terminalPayload ?? { status: "succeeded" }),
          now
        ]
      },
      {
        sql: `UPDATE conversations SET updated_at = ? WHERE id = ?;`,
        args: [now, params.conversationId]
      }
    );
  } else if (params.status === "failed") {
    batchStmts.push(
      {
        sql: `UPDATE runs SET status = 'failed', finished_at = ?, error_message = ? WHERE id = ?;`,
        args: [now, params.errorMessage ?? "Inference failed", params.runId]
      },
      {
        sql: `INSERT INTO run_events (run_id, sequence_number, event_type, payload, created_at)
              VALUES (?, ?, 'run_failed', ?, ?);`,
        args: [
          params.runId,
          nextEventSeq++,
          JSON.stringify({
            errorMessage: params.errorMessage ?? "Inference failed",
            status: "failed"
          }),
          now
        ]
      },
      {
        sql: `UPDATE conversations SET updated_at = ? WHERE id = ?;`,
        args: [now, params.conversationId]
      }
    );
  } else if (params.status === "interrupted") {
    if (params.assistantContent.trim().length > 0) {
      const assistantMsgId = `msg_${randomBytes(8).toString("hex")}`;
      batchStmts.push({
        sql: `INSERT INTO messages (id, conversation_id, sequence_number, role, content, token_count, created_at)
              VALUES (?, ?, ?, 'assistant', ?, ?, ?);`,
        args: [
          assistantMsgId,
          params.conversationId,
          nextMsgSeq,
          params.assistantContent,
          params.tokenCount,
          now
        ]
      });
    }

    batchStmts.push(
      {
        sql: `UPDATE runs SET status = 'interrupted', finished_at = ?, error_message = ? WHERE id = ?;`,
        args: [now, params.errorMessage ?? "Inference interrupted", params.runId]
      },
      {
        sql: `INSERT INTO run_events (run_id, sequence_number, event_type, payload, created_at)
              VALUES (?, ?, 'run_interrupted', ?, ?);`,
        args: [
          params.runId,
          nextEventSeq++,
          JSON.stringify({
            errorMessage: params.errorMessage ?? "Inference interrupted",
            status: "interrupted"
          }),
          now
        ]
      },
      {
        sql: `UPDATE conversations SET updated_at = ? WHERE id = ?;`,
        args: [now, params.conversationId]
      }
    );
  }

  await client.batch(batchStmts, "write");
}


