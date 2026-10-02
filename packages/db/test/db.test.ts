import { describe, it, expect } from "vitest";
import { createDatabaseClient, workspaces } from "../src/index.js";

describe("db package initialization and queries", () => {
  it("initializes in-memory sqlite client and runs schema queries", async () => {
    const { client, db, close } = await createDatabaseClient({ dbPath: ":memory:", autoMigrate: true });
    expect(client).toBeDefined();
    expect(db).toBeDefined();

    const now = new Date().toISOString();
    await db.insert(workspaces).values({
      id: "ws_test_1",
      name: "Default Workspace",
      rootPath: "/Users/anny/Desktop/Free-dots",
      allowedGlobs: JSON.stringify(["**/*"]),
      deniedGlobs: JSON.stringify(["**/.env*"]),
      createdAt: now,
      updatedAt: now
    });

    const results = await db.select().from(workspaces);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("ws_test_1");
    expect(results[0]?.name).toBe("Default Workspace");

    await close();
  });
});
