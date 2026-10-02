import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  rootPath: text("root_path").notNull(),
  allowedGlobs: text("allowed_globs").notNull(), // JSON
  deniedGlobs: text("denied_globs").notNull(), // JSON
  createdAt: text("created_at").notNull()
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  modelId: text("model_id").notNull(),
  providerId: text("provider_id").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  tokenCount: integer("token_count"),
  createdAt: text("created_at").notNull()
});

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  successCriteria: text("success_criteria").notNull(), // JSON array
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull().references(() => goals.id),
  title: text("title").notNull(),
  status: text("status").notNull(),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  workerId: text("worker_id"),
  leaseExpiresAt: text("lease_expires_at"),
  fencingToken: integer("fencing_token").notNull().default(0),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  errorMessage: text("error_message")
});

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => runs.id),
  toolCallId: text("tool_call_id").notNull(),
  actionFingerprint: text("action_fingerprint").notNull(),
  actionSummary: text("action_summary").notNull(),
  decision: text("decision", { enum: ["pending", "approved", "denied", "expired", "invalidated"] }).notNull().default("pending"),
  decidedAt: text("decided_at"),
  consumedAt: text("consumed_at"),
  expiresAt: text("expires_at").notNull()
});

export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  currentVersion: integer("current_version").notNull().default(1),
  createdAt: text("created_at").notNull()
});
