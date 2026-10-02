import { z } from "zod";
import { createHash } from "node:crypto";

export const PrivacyModeSchema = z.enum(["local_only", "hybrid", "offline"]);
export type PrivacyMode = z.infer<typeof PrivacyModeSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal("healthy"),
  version: z.string(),
  privacy_mode: PrivacyModeSchema,
  database: z.enum(["connected", "disconnected"]),
  worker: z.enum(["active", "standby", "stopped"])
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const GoalStatusSchema = z.enum([
  "draft",
  "planning",
  "ready",
  "active",
  "completed",
  "blocked",
  "needs_approval",
  "paused",
  "failed",
  "cancelled"
]);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

export const TaskStatusSchema = z.enum([
  "pending",
  "ready",
  "running",
  "verifying",
  "completed",
  "needs_approval",
  "paused",
  "blocked",
  "failed",
  "cancelled"
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "interrupted",
  "cancelled"
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const ToolCallStatusSchema = z.enum([
  "prepared",
  "awaiting_approval",
  "dispatched",
  "succeeded",
  "failed",
  "uncertain"
]);
export type ToolCallStatus = z.infer<typeof ToolCallStatusSchema>;

export const ApprovalDecisionSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "expired",
  "invalidated"
]);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

/**
 * Computes an immutable SHA-256 fingerprint for a proposed tool action.
 * Fingerprint = SHA256( toolName + "\n" + canonicalJson(args) + "\n" + targetResource )
 */
export function computeActionFingerprint(
  toolName: string,
  args: Record<string, unknown>,
  targetResource: string
): string {
  const sortedKeys = Object.keys(args).sort();
  const canonicalEntries = sortedKeys.map((k) => [k, args[k]]);
  const canonicalJson = JSON.stringify(canonicalEntries);
  const payload = `${toolName}\n${canonicalJson}\n${targetResource}`;
  return createHash("sha256").update(payload).digest("hex");
}

// ==========================================
// Authentication & Security Schemas
// ==========================================

export const PairingRequestSchema = z.object({
  pairingSecret: z.string().min(1, "Pairing secret is required")
});
export type PairingRequest = z.infer<typeof PairingRequestSchema>;

export const PairingResponseSchema = z.object({
  token: z.string(),
  expiresIn: z.number()
});
export type PairingResponse = z.infer<typeof PairingResponseSchema>;

export const AuthStatusSchema = z.object({
  paired: z.boolean(),
  authenticated: z.boolean()
});
export type AuthStatus = z.infer<typeof AuthStatusSchema>;

export const CredentialReferenceSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  name: z.string(),
  maskedValue: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CredentialReference = z.infer<typeof CredentialReferenceSchema>;

export const StoreCredentialSchema = z.object({
  providerId: z.string().min(1, "Provider ID is required"),
  name: z.string().min(1, "Name is required"),
  secret: z.string().min(1, "Secret value is required")
});
export type StoreCredential = z.infer<typeof StoreCredentialSchema>;

// ==========================================
// Secret Masking & Redaction Utilities
// ==========================================

export function maskSecret(secret: string): string {
  if (!secret || secret.length <= 4) {
    return "****";
  }
  if (secret.startsWith("sk-")) {
    return `sk-...${secret.slice(-4)}`;
  }
  return `...${secret.slice(-4)}`;
}

const SENSITIVE_KEY_REGEX = /^(token|secret|password|authorization|cookie|apikey|key|pairingsecret|x-opendotspell-session)$/i;

/**
 * Recursively redacts sensitive fields (passwords, tokens, keys, authorization headers)
 * from objects, arrays, and strings before logging or serialization.
 */
export function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data === "string") {
    let sanitized = data.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]");
    sanitized = sanitized.replace(/sk-[A-Za-z0-9_-]{8,}/gi, "sk-[REDACTED]");
    return sanitized;
  }
  if (Array.isArray(data)) {
    return data.map(redactSensitiveData);
  }
  if (typeof data === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        redacted[key] = "[REDACTED]";
      } else {
        redacted[key] = redactSensitiveData(value);
      }
    }
    return redacted;
  }
  return data;
}

// ==========================================
// Cryptographic Secret Protection (AES-256-GCM)
// ==========================================

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function deriveMasterKey(secretOrSeed: string): Buffer {
  return createHash("sha256").update(secretOrSeed).digest();
}

export function encryptSecret(plainText: string, key: Buffer): EncryptedPayload {
  if (key.length !== 32) {
    throw new Error("Master encryption key must be 32 bytes for AES-256-GCM");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let ciphertext = cipher.update(plainText, "utf8", "hex");
  ciphertext += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  return {
    ciphertext,
    iv: iv.toString("hex"),
    tag
  };
}

export function decryptSecret(payload: EncryptedPayload, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error("Master encryption key must be 32 bytes for AES-256-GCM");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "hex"));
  decipher.setAuthTag(Buffer.from(payload.tag, "hex"));
  let plainText = decipher.update(payload.ciphertext, "hex", "utf8");
  plainText += decipher.final("utf8");
  return plainText;
}

// ==========================================
// Conversation & Message Request Schemas (Step 09)
// ==========================================

export const CreateConversationRequestSchema = z.object({
  title: z.string().min(1).default("New Conversation"),
  modelId: z.string().min(1, "modelId is required"),
  providerId: z.string().min(1, "providerId is required")
});
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;

export const CreateMessageRequestSchema = z.object({
  content: z.string().min(1, "content cannot be empty"),
  idempotencyKey: z.string().min(1, "idempotencyKey is required")
});
export type CreateMessageRequest = z.infer<typeof CreateMessageRequestSchema>;

export interface RunStreamEvent {
  id: number;
  runId: string;
  sequenceNumber: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export class RunEventBus {
  private listeners = new Map<string, Set<(event: RunStreamEvent) => void>>();

  subscribe(runId: string, handler: (event: RunStreamEvent) => void): () => void {
    let set = this.listeners.get(runId);
    if (!set) {
      set = new Set();
      this.listeners.set(runId, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
      if (set && set.size === 0) {
        this.listeners.delete(runId);
      }
    };
  }

  emit(event: RunStreamEvent): void {
    const set = this.listeners.get(event.runId);
    if (set) {
      for (const handler of Array.from(set)) {
        try {
          handler(event);
        } catch {
          // Ignore listener error
        }
      }
    }
  }

  listenerCount(runId: string): number {
    return this.listeners.get(runId)?.size ?? 0;
  }
}


