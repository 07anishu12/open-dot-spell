import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthManager } from "../src/auth.js";
import { createDatabaseClient } from "@open-dot-spell/db";
import type { ModelProviderAdapter, ProviderHealth, DiscoveredModel, ObservedModelCapabilities } from "@open-dot-spell/providers";

describe("GET /api/health smoke and contract test", () => {
  it("returns deterministic 200 OK with expected readiness structure", async () => {
    const db = await createDatabaseClient({ dbPath: ":memory:" });
    const app = buildApp({ db });
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        host: "127.0.0.1:3000"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body).toEqual({
      status: "healthy",
      version: "0.1.0-alpha",
      privacy_mode: "local_only",
      database: "connected",
      worker: "active"
    });

    // Ensure no sensitive or environment data leaks
    expect(body.apiKey).toBeUndefined();
    expect(body.path).toBeUndefined();
    expect(body.rootPath).toBeUndefined();
    expect(body.stack).toBeUndefined();

    await db.close();
  });

  it("reports database disconnected when client fails", async () => {
    const db = await createDatabaseClient({ dbPath: ":memory:" });
    await db.close(); // closing causes subsequent execute to fail
    const app = buildApp({ db });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        host: "127.0.0.1:3000"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.database).toBe("disconnected");
  });

  it("rejects non-loopback host headers", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        host: "malicious-site.com"
      }
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toContain("Forbidden");
  });
});

describe("GET /api/providers/status 4-State Detection (Step 10 Requirement 3.2)", () => {
  const pairingSecret = "test-secret-1234567890abcdef1234567890abcdef";

  const defaultCapabilities: ObservedModelCapabilities = {
    providerId: "prov_ollama_local",
    modelId: "mock",
    runtimeVersion: null,
    probeDate: new Date().toISOString(),
    limits: { contextLimit: null, outputLimit: null, requestTimeoutMs: null },
    streaming: "supported",
    toolCalling: "unknown",
    structuredOutput: "unknown",
    vision: "unknown",
    embeddings: "unknown",
    imageGeneration: "unsupported"
  };

  const createProviderMock = (options: {
    health: ProviderHealth;
    models?: DiscoveredModel[];
    throwOnModels?: boolean;
  }): ModelProviderAdapter => ({
    providerId: "prov_ollama_local",
    providerType: "ollama",
    isLocal: true,
    checkHealth: async () => options.health,
    discoverModels: async () => {
      if (options.throwOnModels) {
        throw new Error("Internal daemon timeout");
      }
      return options.models ?? [];
    },
    getCapabilities: async () => defaultCapabilities,
    streamChat: async function* () {}
  });

  it("1. distinguishes Ollama unavailable when daemon is offline", async () => {
    const offlineProvider = createProviderMock({
      health: { reachable: false, latencyMs: null, error: "Connection refused on 127.0.0.1:11434" }
    });

    const auth = new AuthManager({ pairingSecret });
    const pair = auth.pair(pairingSecret);
    const app = buildApp({ authManager: auth, provider: offlineProvider });

    const res = await app.inject({
      method: "GET",
      url: "/api/providers/status?model=llama3:8b",
      headers: { host: "127.0.0.1:3000", "x-opendotspell-session": pair.token! }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.reachable).toBe(false);
    expect(body.state).toBe("ollama_unavailable");
    expect(body.modelAvailable).toBe(false);
    expect(body.error).toContain("Connection refused");
  });

  it("2. distinguishes Ollama available but configured model missing", async () => {
    const missingModelProvider = createProviderMock({
      health: { reachable: true, latencyMs: 8 },
      models: [{ modelId: "gemma:2b", name: "gemma:2b" }]
    });

    const auth = new AuthManager({ pairingSecret });
    const pair = auth.pair(pairingSecret);
    const app = buildApp({ authManager: auth, provider: missingModelProvider });

    const res = await app.inject({
      method: "GET",
      url: "/api/providers/status?model=llama3:8b",
      headers: { host: "127.0.0.1:3000", "x-opendotspell-session": pair.token! }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.reachable).toBe(true);
    expect(body.state).toBe("model_missing");
    expect(body.modelAvailable).toBe(false);
    expect(body.warning).toContain("ollama pull llama3:8b");
  });

  it("3. distinguishes model available when Ollama is running and model exists", async () => {
    const healthyProvider = createProviderMock({
      health: { reachable: true, latencyMs: 14 },
      models: [{ modelId: "llama3:8b", name: "llama3:8b" }]
    });

    const auth = new AuthManager({ pairingSecret });
    const pair = auth.pair(pairingSecret);
    const app = buildApp({ authManager: auth, provider: healthyProvider });

    const res = await app.inject({
      method: "GET",
      url: "/api/providers/status?model=llama3:8b",
      headers: { host: "127.0.0.1:3000", "x-opendotspell-session": pair.token! }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.reachable).toBe(true);
    expect(body.state).toBe("model_available");
    expect(body.modelAvailable).toBe(true);
    expect(body.latencyMs).toBe(14);
  });

  it("4. distinguishes provider request failure when model query throws", async () => {
    const failingProvider = createProviderMock({
      health: { reachable: true, latencyMs: 10 },
      throwOnModels: true
    });

    const auth = new AuthManager({ pairingSecret });
    const pair = auth.pair(pairingSecret);
    const app = buildApp({ authManager: auth, provider: failingProvider });

    const res = await app.inject({
      method: "GET",
      url: "/api/providers/status?model=llama3:8b",
      headers: { host: "127.0.0.1:3000", "x-opendotspell-session": pair.token! }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.state).toBe("request_failed");
    expect(body.modelAvailable).toBe(false);
    expect(body.error).toContain("Internal daemon timeout");
  });
});
