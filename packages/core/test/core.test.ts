import { describe, it, expect } from "vitest";
import {
  HealthResponseSchema,
  computeActionFingerprint,
  GoalStatusSchema,
  TaskStatusSchema,
  RunStatusSchema
} from "../src/index.js";

describe("core package schemas and utilities", () => {
  it("validates healthy health response schema", () => {
    const valid = {
      status: "healthy",
      version: "0.1.0-alpha",
      privacy_mode: "local_only",
      database: "connected",
      worker: "active"
    };
    expect(HealthResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid privacy mode in health response", () => {
    const invalid = {
      status: "healthy",
      version: "0.1.0-alpha",
      privacy_mode: "public_cloud",
      database: "connected",
      worker: "active"
    };
    expect(HealthResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it("computes deterministic SHA-256 action fingerprint regardless of key order", () => {
    const fp1 = computeActionFingerprint("write_file", { path: "docs/PRD.md", content: "hello" }, "docs/PRD.md");
    const fp2 = computeActionFingerprint("write_file", { content: "hello", path: "docs/PRD.md" }, "docs/PRD.md");
    expect(fp1).toEqual(fp2);
    expect(fp1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("validates lifecycle state schemas", () => {
    expect(GoalStatusSchema.safeParse("active").success).toBe(true);
    expect(TaskStatusSchema.safeParse("verifying").success).toBe(true);
    expect(RunStatusSchema.safeParse("queued").success).toBe(true);
  });
});
