import { describe, it, expect } from "vitest";
import { WorkerProcess } from "../src/worker.js";

describe("Worker lifecycle tests", () => {
  it("starts cleanly, reports ready status, and shuts down cleanly", async () => {
    const worker = new WorkerProcess();
    expect(worker.getStatus()).toBe("stopped");

    await worker.start();
    expect(worker.getStatus()).toBe("ready");

    await worker.stop();
    expect(worker.getStatus()).toBe("stopped");
  });

  it("handles idempotent start and stop requests", async () => {
    const worker = new WorkerProcess();
    await worker.start();
    await worker.start();
    expect(worker.getStatus()).toBe("ready");

    await worker.stop();
    await worker.stop();
    expect(worker.getStatus()).toBe("stopped");
  });
});
