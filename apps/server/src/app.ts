import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { HealthResponse } from "@open-dot-spell/core";

import type { DatabaseInstance } from "@open-dot-spell/db";

export interface AppOptions {
  privacyMode?: "local_only" | "hybrid" | "offline";
  databaseStatus?: "connected" | "disconnected";
  workerStatus?: "active" | "standby" | "stopped";
  db?: DatabaseInstance;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: false
  });

  // Enable loopback CORS for Vite local dev server
  app.register(cors, {
    origin: [
      "http://127.0.0.1:5173",
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "http://localhost:3000"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  });

  // Host header validation to mitigate DNS rebinding
  app.addHook("onRequest", async (request, reply) => {
    const host = request.headers.host;
    if (host) {
      const isLoopback =
        host.startsWith("127.0.0.1") ||
        host.startsWith("localhost") ||
        host.startsWith("::1");
      if (!isLoopback) {
        reply.code(403).send({ error: "Forbidden: invalid host header" });
      }
    }
  });

  // Health endpoint
  app.get<{ Reply: HealthResponse }>("/api/health", async (_request, reply) => {
    let dbStatus = options.databaseStatus ?? "connected";
    if (options.db) {
      try {
        await options.db.client.execute("SELECT 1;");
        dbStatus = "connected";
      } catch {
        dbStatus = "disconnected";
      }
    }

    const response: HealthResponse = {
      status: "healthy",
      version: "0.1.0-alpha",
      privacy_mode: options.privacyMode ?? "local_only",
      database: dbStatus,
      worker: options.workerStatus ?? "active"
    };
    return reply.code(200).send(response);
  });

  return app;
}
