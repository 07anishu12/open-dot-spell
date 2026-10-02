import type { Client } from "@libsql/client";
import { type Run, type InsertMessage, type Message, type RunEvent, type InsertRunEvent } from "./schema.js";

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
