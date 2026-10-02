import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { OllamaProvider, ProviderError } from "../src/index.js";

describe("OllamaProvider Adapter Protocol Tests", () => {
  let server: http.Server;
  let serverPort: number;
  let mockHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (mockHandler) {
        mockHandler(req, res);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        serverPort = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("1. Health: reports healthy when Ollama /api/tags returns 200", async () => {
    mockHandler = (req, res) => {
      if (req.url === "/api/tags") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ models: [{ name: "llama3:latest", size: 4000000000 }] }));
      }
    };

    const provider = new OllamaProvider({ baseUrl: `http://127.0.0.1:${serverPort}` });
    const health = await provider.checkHealth();
    expect(health.reachable).toBe(true);
    expect(typeof health.latencyMs).toBe("number");
  });

  it("2. Health: reports unhealthy when endpoint returns HTTP error", async () => {
    mockHandler = (_req, res) => {
      res.writeHead(503);
      res.end("Service Unavailable");
    };

    const provider = new OllamaProvider({ baseUrl: `http://127.0.0.1:${serverPort}` });
    const health = await provider.checkHealth();
    expect(health.reachable).toBe(false);
    expect(health.error).toContain("503");
  });

  it("3. Model Discovery: lists installed models without downloading or modifying state", async () => {
    mockHandler = (req, res) => {
      if (req.url === "/api/tags") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            models: [
              {
                name: "qwen2.5-coder:7b",
                size: 4700000000,
                digest: "sha256:12345",
                modified_at: "2026-10-01T12:00:00Z",
                details: { parameter_size: "7B" }
              }
            ]
          })
        );
      }
    };

    const provider = new OllamaProvider({ baseUrl: `http://127.0.0.1:${serverPort}` });
    const models = await provider.discoverModels();
    expect(models).toHaveLength(1);
    expect(models[0]?.modelId).toBe("qwen2.5-coder:7b");
    expect(models[0]?.sizeBytes).toBe(4700000000);
  });

  it("4. Streamed Chat: decodes NDJSON stream, text deltas, usage, and completion", async () => {
    mockHandler = (req, res) => {
      if (req.url === "/api/chat" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: "Hello" }, done: false }) + "\n");
        res.write(JSON.stringify({ message: { role: "assistant", content: " world" }, done: false }) + "\n");
        res.write(
          JSON.stringify({
            message: { role: "assistant", content: "!" },
            done: true,
            prompt_eval_count: 14,
            eval_count: 3
          }) + "\n"
        );
        res.end();
      }
    };

    const provider = new OllamaProvider({ baseUrl: `http://127.0.0.1:${serverPort}` });
    const events = [];

    for await (const ev of provider.streamChat({
      modelId: "llama3",
      messages: [{ role: "user", content: "Hi" }]
    })) {
      events.push(ev);
    }

    const textEvents = events.filter((e) => e.type === "text_delta");
    expect(textEvents).toHaveLength(3);
    const combined = textEvents.map((e) => (e.type === "text_delta" ? e.delta : "")).join("");
    expect(combined).toBe("Hello world!");

    const usageEvent = events.find((e) => e.type === "usage");
    expect(usageEvent).toBeDefined();
    if (usageEvent?.type === "usage") {
      expect(usageEvent.promptTokens).toBe(14);
      expect(usageEvent.completionTokens).toBe(3);
      expect(usageEvent.totalTokens).toBe(17);
    }

    const completedEvent = events.find((e) => e.type === "completed");
    expect(completedEvent).toBeDefined();
    if (completedEvent?.type === "completed") {
      expect(completedEvent.finishReason).toBe("stop");
    }
  });

  it("5. Tool Calling: parses Ollama tool calls into correlation events", async () => {
    mockHandler = (req, res) => {
      if (req.url === "/api/chat" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(
          JSON.stringify({
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  function: {
                    name: "calculate_sum",
                    arguments: { a: 10, b: 20 }
                  }
                }
              ]
            },
            done: true,
            prompt_eval_count: 20,
            eval_count: 10
          }) + "\n"
        );
        res.end();
      }
    };

    const provider = new OllamaProvider({ baseUrl: `http://127.0.0.1:${serverPort}` });
    const events = [];

    for await (const ev of provider.streamChat({
      modelId: "qwen2.5-coder",
      messages: [{ role: "user", content: "10 + 20" }],
      tools: [
        {
          name: "calculate_sum",
          description: "sum",
          parameters: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } } }
        }
      ]
    })) {
      events.push(ev);
    }

    const toolComplete = events.find((e) => e.type === "tool_call_complete");
    expect(toolComplete).toBeDefined();
    if (toolComplete?.type === "tool_call_complete") {
      expect(toolComplete.toolName).toBe("calculate_sum");
      expect(toolComplete.arguments).toEqual({ a: 10, b: 20 });
    }

    const completed = events.find((e) => e.type === "completed");
    expect(completed).toBeDefined();
    if (completed?.type === "completed") {
      expect(completed.finishReason).toBe("tool_calls");
    }
  });

  it("6. Actionable Error: produces actionable setup error when model not found (404)", async () => {
    mockHandler = (_req, res) => {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "model 'missing-model' not found" }));
    };

    const provider = new OllamaProvider({ baseUrl: `http://127.0.0.1:${serverPort}` });
    const events = [];

    for await (const ev of provider.streamChat({
      modelId: "missing-model",
      messages: [{ role: "user", content: "test" }]
    })) {
      events.push(ev);
    }

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === "error") {
      expect(errorEvent.message).toContain("Install a model explicitly, then retry");
    }
  });

  it("7. Security: rejects non-loopback endpoints in local_only mode", () => {
    expect(() => {
      new OllamaProvider({
        baseUrl: "http://remote-cloud-ollama.com:11434",
        privacyMode: "local_only"
      });
    }).toThrowError(ProviderError);
  });

  it("8. Cancellation: ceases streaming when AbortSignal triggers", async () => {
    mockHandler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      res.write(JSON.stringify({ message: { content: "part 1" }, done: false }) + "\n");
      // Delayed second part
      setTimeout(() => {
        if (!res.writableEnded) {
          res.write(JSON.stringify({ message: { content: "part 2" }, done: true }) + "\n");
          res.end();
        }
      }, 500);
    };

    const provider = new OllamaProvider({ baseUrl: `http://127.0.0.1:${serverPort}` });
    const controller = new AbortController();
    const events = [];

    for await (const ev of provider.streamChat(
      {
        modelId: "llama3",
        messages: [{ role: "user", content: "cancel test" }]
      },
      { signal: controller.signal }
    )) {
      events.push(ev);
      // Abort after first event
      controller.abort();
    }

    const completed = events.find((e) => e.type === "completed");
    expect(completed).toBeDefined();
    if (completed?.type === "completed") {
      expect(completed.finishReason).toBe("cancelled");
    }
  });
});
