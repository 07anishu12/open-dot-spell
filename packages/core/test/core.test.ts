import { describe, it, expect } from "vitest";
import {
  HealthResponseSchema,
  computeActionFingerprint,
  GoalStatusSchema,
  TaskStatusSchema,
  RunStatusSchema,
  maskSecret,
  redactSensitiveData,
  encryptSecret,
  decryptSecret,
  deriveMasterKey
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

  describe("security and credentials helpers", () => {
    it("masks secrets appropriately without leaking full value", () => {
      expect(maskSecret("short")).toBe("...hort");
      expect(maskSecret("123")).toBe("****");
      expect(maskSecret("sk-proj-1234567890abcdef")).toBe("sk-...cdef");
    });

    it("redacts sensitive fields recursively from logs and data structures", () => {
      const data = {
        user: "owner",
        apiKey: "sk-real-secret-1234",
        nested: {
          token: "jwt-token-value",
          pairingSecret: "secret-code",
          normalField: "safe-value"
        },
        items: [
          { password: "hidden-password" },
          "safe-string",
          "Bearer secret-bearer-token-123"
        ]
      };

      interface RedactedShape {
        apiKey: string;
        nested: { token: string; pairingSecret: string; normalField: string };
        items: [{ password: string }, string, string];
      }
      const redacted = redactSensitiveData(data) as unknown as RedactedShape;
      expect(redacted.apiKey).toBe("[REDACTED]");
      expect(redacted.nested.token).toBe("[REDACTED]");
      expect(redacted.nested.pairingSecret).toBe("[REDACTED]");
      expect(redacted.nested.normalField).toBe("safe-value");
      expect(redacted.items[0].password).toBe("[REDACTED]");
      expect(redacted.items[1]).toBe("safe-string");
      expect(redacted.items[2]).toBe("Bearer [REDACTED]");
    });

    it("encrypts and decrypts secrets with AES-256-GCM authenticated cipher", () => {
      const key = deriveMasterKey("test-master-secret-seed");
      const plaintext = "sk-ant-api03-very-secret-key-material";

      const encrypted = encryptSecret(plaintext, key);
      expect(encrypted.ciphertext).not.toEqual(plaintext);
      expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex chars
      expect(encrypted.tag).toHaveLength(32); // 16 bytes = 32 hex chars

      const decrypted = decryptSecret(encrypted, key);
      expect(decrypted).toEqual(plaintext);
    });

    it("fails decryption when ciphertext or tag is tampered", () => {
      const key = deriveMasterKey("test-master-secret-seed");
      const encrypted = encryptSecret("secret-value", key);

      const tampered = { ...encrypted, tag: "00".repeat(16) };
      expect(() => decryptSecret(tampered, key)).toThrow();
    });
  });
});

