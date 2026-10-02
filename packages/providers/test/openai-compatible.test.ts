import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { OpenAICompatibleProvider, ProviderError } from "../src/index.js";

describe("OpenAICompatibleProvider Adapter Protocol Tests", () => {
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

  it("1. Health: checks models endpoint with Bearer auth", async () => {
    let capturedAuth: string | undefined;

    mockHandler = (req, res) => {
      capturedAuth = req.headers["authorization"];
      if (req.url === "/v1/models") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [{ id: "gpt-4o-mini" }] }));
      }
    };

    const provider = new OpenAICompatibleProvider({
      baseUrl: `http://127.0.0.1:${serverPort}/v1`,
      apiKey: "sk-test-secret-key-1234"
    });

    const health = await provider.checkHealth();
    expect(health.reachable).toBe(true);
    expect(capturedAuth).toBe("Bearer sk-test-secret-key-1234");
  });

  it("2. Model Discovery: lists available models from OpenAI compatible endpoint", async () => {
    mockHandler = (req, res) => {
      if (req.url === "/v1/models") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            data: [
              { id: "model-alpha", created: 1700000000, owned_by: "system" },
              { id: "model-beta", created: 1700000000, owned_by: "system" }
            ]
          })
        );
      }
    };

    const provider = new OpenAICompatibleProvider({ baseUrl: `http://127.0.0.1:${serverPort}/v1` });
    const models = await provider.discoverModels();
    expect(models).toHaveLength(2);
    expect(models[0]?.modelId).toBe("model-alpha");
    expect(models[1]?.modelId).toBe("model-beta");
  });

  it("3. Streamed Chat: decodes SSE chunks, text deltas, and usage in stream_options", async () => {
    mockHandler = (req, res) => {
      if (req.url === "/v1/chat/completions" && req.method === "POST") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive"
        });
        res.write('data: {"choices":[{"index":0,"delta":{"content":"Open"},"finish_reason":null}]}\n\n');
        res.write('data: {"choices":[{"index":0,"delta":{"content":" Dot"},"finish_reason":null}]}\n\n');
        res.write('data: {"choices":[{"index":0,"delta":{"content":" Spell"},"finish_reason":"stop"}]}\n\n');
        res.write('data: {"choices":[],"usage":{"prompt_tokens":25,"completion_tokens":3,"total_tokens":28}}\n\n');
        res.write("data: [DONE]\n\n");
        res.end();
      }
    };

    const provider = new OpenAICompatibleProvider({ baseUrl: `http://127.0.0.1:${serverPort}/v1` });
    const events = [];

    for await (const ev of provider.streamChat({
      modelId: "gpt-model",
      messages: [{ role: "user", content: "hello" }]
    })) {
      events.push(ev);
    }

    const textEvents = events.filter((e) => e.type === "text_delta");
    expect(textEvents).toHaveLength(3);
    const combined = textEvents.map((e) => (e.type === "text_delta" ? e.delta : "")).join("");
    expect(combined).toBe("Open Dot Spell");

    const usageEvent = events.find((e) => e.type === "usage");
    expect(usageEvent).toBeDefined();
    if (usageEvent?.type === "usage") {
      expect(usageEvent.promptTokens).toBe(25);
      expect(usageEvent.completionTokens).toBe(3);
      expect(usageEvent.totalTokens).toBe(28);
    }

    const completed = events.find((e) => e.type === "completed");
    expect(completed).toBeDefined();
    if (completed?.type === "completed") {
      expect(completed.finishReason).toBe("stop");
    }
  });

  it("4. Tool Calling: accumulates incremental SSE tool arguments into complete call", async () => {
    mockHandler = (req, res) => {
      if (req.url === "/v1/chat/completions" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(
          'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_openai_01","type":"function","function":{"name":"search_docs","arguments":"{\\"q\\": "}}]},"finish_reason":null}]}\n\n'
        );
        res.write(
          `data: ${JSON.stringify({
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: {
                        arguments: '"local AI"}'
                      }
                    }
                  ]
                },
                finish_reason: "tool_calls"
              }
            ]
          })}\n\n`
        );
        res.write("data: [DONE]\n\n");
        res.end();
      }
    };

    const provider = new OpenAICompatibleProvider({ baseUrl: `http://127.0.0.1:${serverPort}/v1` });
    const events = [];

    for await (const ev of provider.streamChat({
      modelId: "gpt-tools",
      messages: [{ role: "user", content: "search for local AI" }],
      tools: [
        {
          name: "search_docs",
          description: "search",
          parameters: { type: "object", properties: { q: { type: "string" } } }
        }
      ]
    })) {
      events.push(ev);
    }

    const toolComplete = events.find((e) => e.type === "tool_call_complete");
    expect(toolComplete).toBeDefined();
    if (toolComplete?.type === "tool_call_complete") {
      expect(toolComplete.toolCallId).toBe("call_openai_01");
      expect(toolComplete.toolName).toBe("search_docs");
      expect(toolComplete.arguments).toEqual({ q: "local AI" });
    }

    const completed = events.find((e) => e.type === "completed");
    expect(completed).toBeDefined();
    if (completed?.type === "completed") {
      expect(completed.finishReason).toBe("tool_calls");
    }
  });

  it("5. Security: rejects non-loopback endpoints in local_only mode", () => {
    expect(() => {
      new OpenAICompatibleProvider({
        baseUrl: "https://api.openai.com/v1",
        privacyMode: "local_only"
      });
    }).toThrowError(ProviderError);
  });

  it("6. Security: allows non-loopback endpoints only when hybrid privacy mode is active", () => {
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://api.openai.com/v1",
      privacyMode: "hybrid"
    });
    expect(provider.isLocal).toBe(false);
  });
});
