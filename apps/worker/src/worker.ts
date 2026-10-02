export type WorkerStatus = "stopped" | "starting" | "ready" | "stopping";

export class WorkerProcess {
  private status: WorkerStatus = "stopped";
  private shutdownHandlersAttached = false;

  getStatus(): WorkerStatus {
    return this.status;
  }

  async start(): Promise<void> {
    if (this.status === "ready" || this.status === "starting") {
      return;
    }
    this.status = "starting";
    // At Step 04, the worker initializes its lifecycle without claiming tasks.
    // Durable execution and task polling are deliberately deferred to future steps.
    this.status = "ready";
  }

  async stop(): Promise<void> {
    if (this.status === "stopped" || this.status === "stopping") {
      return;
    }
    this.status = "stopping";
    // Perform clean resource release
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
