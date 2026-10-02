import { describe, it, expect } from "vitest";
import { createDatabaseClient, workspaces } from "../src/index.js";

describe("db package initialization and queries", () => {
  it("initializes in-memory sqlite client and runs schema queries", async () => {
    const { client, db } = createDatabaseClient(":memory:");
    expect(client).toBeDefined();
    expect(db).toBeDefined();

    // Create table directly in memory to verify connection
    await client.execute(`
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        allowed_globs TEXT NOT NULL,
        denied_globs TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    await db.insert(workspaces).values({
      id: "ws_test_1",
      name: "Default Workspace",
      rootPath: "/Users/anny/Desktop/Free-dots",
      allowedGlobs: JSON.stringify(["**/*"]),
      deniedGlobs: JSON.stringify(["**/.env*"]),
      createdAt: new Date().toISOString()
    });

    const results = await db.select().from(workspaces);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("ws_test_1");
    expect(results[0]?.name).toBe("Default Workspace");
  });
});
