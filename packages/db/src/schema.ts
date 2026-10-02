import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  rootPath: text("root_path").notNull(),
  allowedGlobs: text("allowed_globs").notNull(), // JSON array
  deniedGlobs: text("denied_globs").notNull(), // JSON array
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    modelId: text("model_id").notNull(),
    providerId: text("provider_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    index("idx_conversations_workspace").on(table.workspaceId)
  ]
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    sequenceNumber: integer("sequence_number").notNull(),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count"),
    createdAt: text("created_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_messages_conv_seq").on(table.conversationId, table.sequenceNumber),
    index("idx_messages_created").on(table.createdAt)
  ]
);

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .references(() => conversations.id, { onDelete: "set null" }),
    workerId: text("worker_id"),
    leaseExpiresAt: text("lease_expires_at"),
    fencingToken: integer("fencing_token").notNull().default(0),
    status: text("status", {
      enum: ["queued", "running", "succeeded", "failed", "interrupted", "cancelled"]
    }).notNull(),
    idempotencyKey: text("idempotency_key"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    errorMessage: text("error_message")
  },
  (table) => [
    index("idx_runs_workspace").on(table.workspaceId),
    index("idx_runs_status").on(table.status),
    index("idx_runs_lease").on(table.leaseExpiresAt),
    uniqueIndex("idx_runs_conv_idempotency").on(table.conversationId, table.idempotencyKey)
  ]
);

export const runEvents = sqliteTable(
  "run_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    sequenceNumber: integer("sequence_number").notNull(),
    eventType: text("event_type").notNull(),
    payload: text("payload").notNull(), // JSON object
    createdAt: text("created_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_run_events_run_seq").on(table.runId, table.sequenceNumber),
    index("idx_run_events_created").on(table.createdAt)
  ]
);

export const providerCredentials = sqliteTable("provider_credentials", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  name: text("name").notNull(),
  maskedValue: text("masked_value").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

export type Run = typeof runs.$inferSelect;
export type InsertRun = typeof runs.$inferInsert;

export type RunEvent = typeof runEvents.$inferSelect;
export type InsertRunEvent = typeof runEvents.$inferInsert;

export type ProviderCredential = typeof providerCredentials.$inferSelect;
export type InsertProviderCredential = typeof providerCredentials.$inferInsert;

