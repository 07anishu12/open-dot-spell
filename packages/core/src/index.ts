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
