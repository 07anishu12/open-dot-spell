import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { createDatabaseClient } from "@open-dot-spell/db";

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
