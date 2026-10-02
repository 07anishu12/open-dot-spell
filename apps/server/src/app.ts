import Fastify, { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { randomBytes } from "node:crypto";
import {
  HealthResponse,
  PairingRequestSchema,
  StoreCredentialSchema,
  maskSecret,
  encryptSecret,
  deriveMasterKey,
  redactSensitiveData
} from "@open-dot-spell/core";
import {
  type DatabaseInstance,
  verifyWorkspaceScope,
  insertProviderCredential,
  listProviderCredentials
} from "@open-dot-spell/db";
import { OllamaProviderStub } from "@open-dot-spell/providers";
import { AuthManager } from "./auth.js";

export { AuthManager };

export interface AppOptions {
  privacyMode?: "local_only" | "hybrid" | "offline";
  databaseStatus?: "connected" | "disconnected";
  workerStatus?: "active" | "standby" | "stopped";
  db?: DatabaseInstance;
  authManager?: AuthManager;
  masterKey?: Buffer;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const authManager = options.authManager ?? new AuthManager();
  const masterKey = options.masterKey ?? deriveMasterKey("open-dot-spell-local-master-key-seed");

  const app = Fastify({
    logger: false,
    bodyLimit: 1048576 // 1MB payload limit (enforces 413 rejection for oversized payloads)
  });

  // Redacted error handler to prevent secret leakage in error stacks or messages
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const sanitized = redactSensitiveData({
      error: error.name || "InternalServerError",
      message: error.message
    });
    reply.status(statusCode).send(sanitized);
  });

  // Register cookie support for HttpOnly session cookie
  app.register(cookie);

  // Enable loopback CORS for Vite local dev server
  app.register(cors, {
    origin: [
      "http://127.0.0.1:5173",
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "http://localhost:3000"
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  });

  // Security Headers Hook
  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Content-Security-Policy", "default-src 'self'");
  });

  // Host Header Validation to mitigate DNS rebinding attacks
  app.addHook("onRequest", async (request, reply) => {
    const host = request.headers.host;
    if (!host) {
      return reply.code(403).send({ error: "Forbidden: missing host header" });
    }
    let hostname = host;
    if (host.startsWith("[")) {
      const closingIdx = host.indexOf("]");
      if (closingIdx !== -1) {
        hostname = host.slice(0, closingIdx + 1);
      }
    } else {
      hostname = host.split(":")[0] ?? "";
    }

    const isLoopback =
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname === "[::1]";
    if (!isLoopback) {
      return reply.code(403).send({ error: "Forbidden: invalid host header" });
    }
  });

  // Origin Validation for State-Mutating Requests (protect against CSRF / untrusted web contexts)
  const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);
  app.addHook("onRequest", async (request, reply) => {
    if (MUTATING_METHODS.has(request.method)) {
      const origin = request.headers.origin;
      if (origin) {
        try {
          const parsed = new URL(origin);
          const isLoopbackOrigin =
            parsed.hostname === "127.0.0.1" ||
            parsed.hostname === "localhost" ||
            parsed.hostname === "::1" ||
            parsed.hostname === "[::1]";
          if (!isLoopbackOrigin) {
            return reply.code(403).send({ error: "Forbidden: cross-origin mutation denied" });
          }
        } catch {
          return reply.code(403).send({ error: "Forbidden: invalid origin header" });
        }
      }
    }
  });

  // Token extraction helper (supports header and HttpOnly cookie)
  function extractSessionToken(request: FastifyRequest): string | undefined {
    const customHeader = request.headers["x-opendotspell-session"];
    if (typeof customHeader === "string" && customHeader.trim()) {
      return customHeader.trim();
    }

    const authHeader = request.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      return authHeader.slice(7).trim();
    }

    const cookieToken = request.cookies?.["opendotspell_session"];
    if (typeof cookieToken === "string" && cookieToken.trim()) {
      return cookieToken.trim();
    }

    return undefined;
  }

  // PreHandler to protect routes requiring local owner authorization
  const requireOwnerAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractSessionToken(request);
    if (!token || !authManager.validateSession(token)) {
      return reply.code(401).send({ error: "Unauthorized: valid owner session required" });
    }
  };

  // Health endpoint (public)
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

  // Auth status endpoint (public)
  app.get("/api/auth/status", async (request, reply) => {
    const token = extractSessionToken(request);
    const isAuthenticated = authManager.validateSession(token);
    return reply.code(200).send({
      paired: authManager.isAlreadyPaired(),
      authenticated: isAuthenticated
    });
  });

  // Pairing endpoint (one-time local bootstrap)
  app.post("/api/auth/pair", async (request, reply) => {
    const parseResult = PairingRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Invalid request payload",
        details: parseResult.error.flatten()
      });
    }

    const pairResult = authManager.pair(parseResult.data.pairingSecret);
    if (!pairResult.success) {
      return reply.code(401).send({ error: pairResult.error });
    }

    // Set secure, scoped HttpOnly session cookie
    reply.setCookie("opendotspell_session", pairResult.token!, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      secure: false, // loopback HTTP
      maxAge: pairResult.expiresIn
    });

    return reply.code(200).send({
      token: pairResult.token,
      expiresIn: pairResult.expiresIn
    });
  });

  // Logout endpoint
  app.post("/api/auth/logout", async (request, reply) => {
    const token = extractSessionToken(request);
    if (token) {
      authManager.revokeSession(token);
    }
    reply.clearCookie("opendotspell_session", { path: "/" });
    return reply.code(200).send({ success: true });
  });

  // Protected workspace resource: get conversation scoped to workspace
  app.get<{
    Params: { workspaceId: string; conversationId: string };
  }>(
    "/api/workspaces/:workspaceId/conversations/:conversationId",
    { preHandler: requireOwnerAuth },
    async (request, reply) => {
      const { workspaceId, conversationId } = request.params;
      if (!options.db) {
        return reply.code(500).send({ error: "Database not configured" });
      }

      const isValid = await verifyWorkspaceScope(
        options.db.client,
        "conversation",
        conversationId,
        workspaceId
      );

      if (!isValid) {
        return reply.code(404).send({
          error: "Conversation not found or does not belong to specified workspace"
        });
      }

      return reply.code(200).send({
        workspaceId,
        conversationId,
        status: "accessible"
      });
    }
  );

  // Protected workspace resource: get run scoped to workspace
  app.get<{
    Params: { workspaceId: string; runId: string };
  }>(
    "/api/workspaces/:workspaceId/runs/:runId",
    { preHandler: requireOwnerAuth },
    async (request, reply) => {
      const { workspaceId, runId } = request.params;
      if (!options.db) {
        return reply.code(500).send({ error: "Database not configured" });
      }

      const isValid = await verifyWorkspaceScope(
        options.db.client,
        "run",
        runId,
        workspaceId
      );

      if (!isValid) {
        return reply.code(404).send({
          error: "Run not found or does not belong to specified workspace"
        });
      }

      return reply.code(200).send({
        workspaceId,
        runId,
        status: "accessible"
      });
    }
  );

  // Protected credentials endpoint: list credentials without exposing secret values
  app.get(
    "/api/credentials",
    { preHandler: requireOwnerAuth },
    async (_request, reply) => {
      if (!options.db) {
        return reply.code(500).send({ error: "Database not configured" });
      }

      const creds = await listProviderCredentials(options.db.client);
      return reply.code(200).send(creds);
    }
  );

  // Protected credentials endpoint: store encrypted credential
  app.post(
    "/api/credentials",
    { preHandler: requireOwnerAuth },
    async (request, reply) => {
      if (!options.db) {
        return reply.code(500).send({ error: "Database not configured" });
      }

      const parseResult = StoreCredentialSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Invalid credential payload",
          details: parseResult.error.flatten()
        });
      }

      const { providerId, name, secret } = parseResult.data;
      const encrypted = encryptSecret(secret, masterKey);
      const id = `cred_${randomBytes(8).toString("hex")}`;
      const maskedValue = maskSecret(secret);
      const now = new Date().toISOString();

      await insertProviderCredential(options.db.client, {
        id,
        providerId,
        name,
        maskedValue,
        encryptedValue: JSON.stringify(encrypted),
        createdAt: now,
        updatedAt: now
      });

      // Never return the raw secret in response
      return reply.code(201).send({
        id,
        providerId,
        name,
        maskedValue,
        createdAt: now,
        updatedAt: now
      });
    }
  );

  // Protected provider endpoint: verify local-only mode operates without remote credentials
  app.get(
    "/api/providers/local",
    { preHandler: requireOwnerAuth },
    async (_request, reply) => {
      const ollama = new OllamaProviderStub();
      const capabilities = await ollama.getCapabilities("llama3");

      return reply.code(200).send({
        providerId: ollama.providerId,
        isLocal: ollama.isLocal,
        capabilities,
        configured: true,
        message: "Local inference is fully functional with zero remote credentials"
      });
    }
  );

  return app;
}
