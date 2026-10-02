import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthManager } from "../src/auth.js";
import {
  createDatabaseClient,
  DatabaseInstance,
  workspaces,
  conversations,
  runs
} from "@open-dot-spell/db";

describe("Open Dot Spell Security & Access Control Suite (Step 06)", () => {
  let db: DatabaseInstance;
  let authManager: AuthManager;
  const pairingSecret = "test-pairing-secret-1234567890abcdef1234567890abcdef";

  beforeEach(async () => {
    db = await createDatabaseClient({ dbPath: ":memory:" });
    authManager = new AuthManager({ pairingSecret });
  });

  afterEach(async () => {
    await db.close();
  });

  describe("1. Loopback Host & DNS Rebinding Protection", () => {
    it("permits loopback host headers (127.0.0.1, localhost, [::1])", async () => {
      const app = buildApp({ db, authManager });

      const res1 = await app.inject({
        method: "GET",
        url: "/api/health",
        headers: { host: "127.0.0.1:3000" }
      });
      expect(res1.statusCode).toBe(200);

      const res2 = await app.inject({
        method: "GET",
        url: "/api/health",
        headers: { host: "localhost:3000" }
      });
      expect(res2.statusCode).toBe(200);

      const res3 = await app.inject({
        method: "GET",
        url: "/api/health",
        headers: { host: "[::1]:3000" }
      });
      expect(res3.statusCode).toBe(200);
    });

    it("rejects non-loopback host headers with 403 Forbidden", async () => {
      const app = buildApp({ db, authManager });

      const res = await app.inject({
        method: "GET",
        url: "/api/health",
        headers: { host: "evil-rebinding-domain.com:3000" }
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error).toContain("Forbidden");
    });
  });

  describe("2. Single-Owner Pairing & Session Lifecycle", () => {
    it("reports initially unpaired and unauthenticated", async () => {
      const app = buildApp({ db, authManager });
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/status",
        headers: { host: "127.0.0.1:3000" }
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({
        paired: false,
        authenticated: false
      });
    });

    it("rejects invalid pairing secrets", async () => {
      const app = buildApp({ db, authManager });
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/pair",
        headers: { host: "127.0.0.1:3000" },
        payload: { pairingSecret: "wrong-secret" }
      });

      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toContain("Invalid pairing secret");
    });

    it("locks pairing after maximum failed attempts", async () => {
      const app = buildApp({ db, authManager });

      // Fail 5 times
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: "POST",
          url: "/api/auth/pair",
          headers: { host: "127.0.0.1:3000" },
          payload: { pairingSecret: `wrong-${i}` }
        });
      }

      // Even correct secret is now rejected
      const lockedRes = await app.inject({
        method: "POST",
        url: "/api/auth/pair",
        headers: { host: "127.0.0.1:3000" },
        payload: { pairingSecret }
      });

      expect(lockedRes.statusCode).toBe(401);
      expect(JSON.parse(lockedRes.body).error).toContain("maximum attempts exceeded");
    });

    it("successfully pairs with one-time secret, sets HttpOnly cookie, and prevents replay", async () => {
      const app = buildApp({ db, authManager });

      // First pairing attempt: succeeds
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/pair",
        headers: { host: "127.0.0.1:3000" },
        payload: { pairingSecret }
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.token).toBeDefined();
      expect(data.token).toHaveLength(64); // 32 bytes hex

      // Verify HttpOnly, SameSite=Strict cookie
      const cookieHeader = res.headers["set-cookie"];
      expect(cookieHeader).toBeDefined();
      const cookieStr = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
      expect(cookieStr).toContain("opendotspell_session=");
      expect(cookieStr).toContain("HttpOnly");
      expect(cookieStr).toContain("SameSite=Strict");

      // Verify status is now paired and authenticated
      const statusRes = await app.inject({
        method: "GET",
        url: "/api/auth/status",
        headers: {
          host: "127.0.0.1:3000",
          cookie: `opendotspell_session=${data.token}`
        }
      });
      expect(JSON.parse(statusRes.body)).toEqual({
        paired: true,
        authenticated: true
      });

      // Second pairing attempt (replay attack): must FAIL because secret was consumed
      const replayRes = await app.inject({
        method: "POST",
        url: "/api/auth/pair",
        headers: { host: "127.0.0.1:3000" },
        payload: { pairingSecret }
      });
      expect(replayRes.statusCode).toBe(401);
    });

    it("supports logout to invalidate session and clear cookie", async () => {
      const app = buildApp({ db, authManager });

      // Pair first
      const pairRes = await app.inject({
        method: "POST",
        url: "/api/auth/pair",
        headers: { host: "127.0.0.1:3000" },
        payload: { pairingSecret }
      });
      const token = JSON.parse(pairRes.body).token;

      // Logout
      const logoutRes = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": token
        }
      });
      expect(logoutRes.statusCode).toBe(200);

      // Verify session is no longer valid
      const statusRes = await app.inject({
        method: "GET",
        url: "/api/auth/status",
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": token
        }
      });
      expect(JSON.parse(statusRes.body).authenticated).toBe(false);
    });
  });

  describe("3. Cross-Origin and Request Protections", () => {
    it("blocks cross-origin mutating requests from untrusted origins", async () => {
      const app = buildApp({ db, authManager });

      // Pair to get valid token
      const pair = authManager.pair(pairingSecret);
      expect(pair.success).toBe(true);

      const res = await app.inject({
        method: "POST",
        url: "/api/credentials",
        headers: {
          host: "127.0.0.1:3000",
          origin: "http://malicious-website.com",
          "x-opendotspell-session": pair.token
        },
        payload: {
          providerId: "anthropic",
          name: "Test Key",
          secret: "sk-ant-12345"
        }
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error).toContain("Forbidden: cross-origin mutation denied");
    });

    it("allows loopback origin mutating requests", async () => {
      const app = buildApp({ db, authManager });
      const pair = authManager.pair(pairingSecret);

      const res = await app.inject({
        method: "POST",
        url: "/api/credentials",
        headers: {
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:5173",
          "x-opendotspell-session": pair.token
        },
        payload: {
          providerId: "anthropic",
          name: "Test Key",
          secret: "sk-ant-test-key-1234"
        }
      });

      expect(res.statusCode).toBe(201);
    });

    it("enforces payload body limit (rejects oversized payload with 413)", async () => {
      const app = buildApp({ db, authManager });
      const pair = authManager.pair(pairingSecret);

      // Send payload exceeding 1MB (1048576 bytes)
      const oversizedString = "A".repeat(1024 * 1024 + 100);

      const res = await app.inject({
        method: "POST",
        url: "/api/credentials",
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": pair.token
        },
        payload: {
          providerId: "anthropic",
          name: "Huge Key",
          secret: oversizedString
        }
      });

      expect(res.statusCode).toBe(413);
    });

    it("sets mandatory security headers on all responses", async () => {
      const app = buildApp({ db, authManager });
      const res = await app.inject({
        method: "GET",
        url: "/api/health",
        headers: { host: "127.0.0.1:3000" }
      });

      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    });
  });

  describe("4. Workspace Scoped Authorization Enforcement", () => {
    it("rejects unauthenticated requests to workspace resources with 401", async () => {
      const app = buildApp({ db, authManager });
      const res = await app.inject({
        method: "GET",
        url: "/api/workspaces/ws_1/conversations/conv_1",
        headers: { host: "127.0.0.1:3000" }
      });

      expect(res.statusCode).toBe(401);
    });

    it("allows access to resources within the correct workspace", async () => {
      const app = buildApp({ db, authManager });
      const pair = authManager.pair(pairingSecret);
      const now = new Date().toISOString();

      // Seed workspace and conversation
      await db.db.insert(workspaces).values({
        id: "ws_target",
        name: "Target Workspace",
        rootPath: "/tmp/target",
        allowedGlobs: "[]",
        deniedGlobs: "[]",
        createdAt: now,
        updatedAt: now
      });

      await db.db.insert(conversations).values({
        id: "conv_target",
        workspaceId: "ws_target",
        title: "Target Conv",
        modelId: "llama3",
        providerId: "prov_ollama_local",
        createdAt: now,
        updatedAt: now
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/workspaces/ws_target/conversations/conv_target",
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": pair.token
        }
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).status).toBe("accessible");
    });

    it("rejects cross-workspace access attempts with 404 (isolation barrier)", async () => {
      const app = buildApp({ db, authManager });
      const pair = authManager.pair(pairingSecret);
      const now = new Date().toISOString();

      // Workspace 1 with conversation 1
      await db.db.insert(workspaces).values({
        id: "ws_1",
        name: "Workspace 1",
        rootPath: "/tmp/ws1",
        allowedGlobs: "[]",
        deniedGlobs: "[]",
        createdAt: now,
        updatedAt: now
      });
      await db.db.insert(conversations).values({
        id: "conv_1",
        workspaceId: "ws_1",
        title: "Conv 1",
        modelId: "llama3",
        providerId: "prov_ollama_local",
        createdAt: now,
        updatedAt: now
      });

      // Workspace 2
      await db.db.insert(workspaces).values({
        id: "ws_2",
        name: "Workspace 2",
        rootPath: "/tmp/ws2",
        allowedGlobs: "[]",
        deniedGlobs: "[]",
        createdAt: now,
        updatedAt: now
      });

      // Attempt to access conv_1 using ws_2 path: MUST FAIL
      const crossRes = await app.inject({
        method: "GET",
        url: "/api/workspaces/ws_2/conversations/conv_1",
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": pair.token
        }
      });

      expect(crossRes.statusCode).toBe(404);
      expect(JSON.parse(crossRes.body).error).toContain("does not belong to specified workspace");

      // Seed run in workspace 1
      await db.db.insert(runs).values({
        id: "run_ws1",
        workspaceId: "ws_1",
        status: "running",
        startedAt: now
      });

      // Attempt to access run_ws1 using ws_2 path: MUST FAIL
      const crossRunRes = await app.inject({
        method: "GET",
        url: "/api/workspaces/ws_2/runs/run_ws1",
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": pair.token
        }
      });
      expect(crossRunRes.statusCode).toBe(404);
      expect(JSON.parse(crossRunRes.body).error).toContain("does not belong to specified workspace");
    });
  });

  describe("5. Credential Storage Foundation & Secret Leakage Prevention", () => {
    it("stores encrypted credentials and returns only masked metadata", async () => {
      const app = buildApp({ db, authManager });
      const pair = authManager.pair(pairingSecret);

      const postRes = await app.inject({
        method: "POST",
        url: "/api/credentials",
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": pair.token
        },
        payload: {
          providerId: "openai",
          name: "Production OpenAI",
          secret: "sk-proj-abcdef1234567890ghijkl"
        }
      });

      expect(postRes.statusCode).toBe(201);
      const cred = JSON.parse(postRes.body);
      expect(cred.id).toBeDefined();
      expect(cred.providerId).toBe("openai");
      expect(cred.name).toBe("Production OpenAI");
      expect(cred.maskedValue).toBe("sk-...ijkl");
      // Raw secret and encryptedValue must NEVER be returned in response!
      expect(cred.secret).toBeUndefined();
      expect(cred.encryptedValue).toBeUndefined();
    });

    it("listing credentials never returns raw secrets or ciphertext", async () => {
      const app = buildApp({ db, authManager });
      const pair = authManager.pair(pairingSecret);

      // Store a credential
      await app.inject({
        method: "POST",
        url: "/api/credentials",
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": pair.token
        },
        payload: {
          providerId: "anthropic",
          name: "Anthropic Claude Key",
          secret: "sk-ant-super-secret-claude-key-9999"
        }
      });

      // List credentials
      const listRes = await app.inject({
        method: "GET",
        url: "/api/credentials",
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": pair.token
        }
      });

      expect(listRes.statusCode).toBe(200);
      const list = JSON.parse(listRes.body);
      expect(list).toHaveLength(1);
      expect(list[0].maskedValue).toBe("sk-...9999");
      expect(list[0].secret).toBeUndefined();
      expect(list[0].encryptedValue).toBeUndefined();
    });
  });

  describe("6. Local-Only Mode Without Remote Credentials", () => {
    it("allows local inference provider to function with zero remote credentials", async () => {
      const app = buildApp({ db, authManager });
      const pair = authManager.pair(pairingSecret);

      // Query local provider endpoint
      const res = await app.inject({
        method: "GET",
        url: "/api/providers/local",
        headers: {
          host: "127.0.0.1:3000",
          "x-opendotspell-session": pair.token
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.providerId).toBe("prov_ollama_local");
      expect(body.isLocal).toBe(true);
      expect(body.configured).toBe(true);
      expect(body.capabilities.supportsStreaming).toBe(true);
    });
  });
});
