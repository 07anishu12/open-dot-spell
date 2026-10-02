import type { DatabaseInstance } from "@open-dot-spell/db";

export type WorkerStatus = "stopped" | "starting" | "ready" | "stopping";

export class WorkerProcess {
  private status: WorkerStatus = "stopped";
  private shutdownHandlersAttached = false;

  constructor(private readonly db?: DatabaseInstance) {}

  getStatus(): WorkerStatus {
    return this.status;
  }

  async start(): Promise<void> {
    if (this.status === "ready" || this.status === "starting") {
      return;
    }
    this.status = "starting";
    // Verify database connectivity if instance was provided
    if (this.db) {
      await this.db.client.execute("SELECT 1;");
    }
    // Standby mode: task claiming is deferred to future steps
    this.status = "ready";
  }

  async stop(): Promise<void> {
    if (this.status === "stopped" || this.status === "stopping") {
      return;
    }
    this.status = "stopping";
    if (this.db) {
      await this.db.close();
    }
    this.status = "stopped";
  }

  attachSignalHandlers(): void {
    if (this.shutdownHandlersAttached) return;
    this.shutdownHandlersAttached = true;

    const onSignal = async (signal: string) => {
      console.log(`Open Dot Spell Worker received ${signal}, shutting down...`);
      await this.stop();
      process.exit(0);
    };

    process.on("SIGINT", () => void onSignal("SIGINT"));
    process.on("SIGTERM", () => void onSignal("SIGTERM"));
  }
}
