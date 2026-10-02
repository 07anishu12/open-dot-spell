// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { App } from "../src/App.js";

// Create isolated localStorage mock
const createStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((idx: number) => Object.keys(store)[idx] || null)
  };
};

describe("Open Dot Spell Web UI (Step 10)", () => {
  let storageMock: ReturnType<typeof createStorageMock>;

  beforeEach(() => {
    storageMock = createStorageMock();
    Object.defineProperty(window, "localStorage", {
      value: storageMock,
      writable: true,
      configurable: true
    });
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Helper to construct a standard mock fetch handler
  const setupMockFetch = (options: {
    authenticated?: boolean;
    providerReachable?: boolean;
    models?: Array<{ modelId: string; name: string }>;
    conversations?: Array<{ id: string; workspaceId?: string; title: string; modelId: string; providerId: string; createdAt: string; updatedAt: string }>;
    messages?: Array<{ id: string; role: "user" | "assistant"; content: string }>;
    sseChunks?: string[];
  } = {}) => {
    let isAuth = options.authenticated ?? true;
    const isReachable = options.providerReachable ?? true;
    const modelsList = options.models ?? [
      { modelId: "synthetic-model-v1", name: "Synthetic Test Model (Standard)" },
      { modelId: "llama3:8b", name: "Llama 3 8B" }
    ];
    const convList = options.conversations ?? [];
    const msgList = options.messages ?? [];

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      // Auth status
      if (url.includes("/api/auth/status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ authenticated: isAuth, paired: isAuth })
        });
      }

      // Pairing request
      if (url.includes("/api/auth/pair")) {
        const body = JSON.parse(String(init?.body || "{}"));
        if (body.pairingSecret === "valid-secret") {
          isAuth = true;
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, token: "token_123", expiresIn: 3600 })
          });
        }
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ error: "Invalid pairing code" })
        });
      }

      // Workspaces
      if (url.endsWith("/api/workspaces")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            workspaces: [{ id: "ws_default", name: "Default Workspace" }],
            activeWorkspaceId: "ws_default"
          })
        });
      }

      // Provider status
      if (url.includes("/api/providers/status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            providerId: "prov_ollama_local",
            reachable: isReachable,
            latencyMs: isReachable ? 12 : null,
            error: isReachable ? undefined : "Ollama unavailable on 127.0.0.1:11434"
          })
        });
      }

      // Provider models
      if (url.includes("/api/providers/models")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            providerId: "prov_ollama_local",
            models: modelsList
          })
        });
      }

      // List conversations
      if (url.includes("/conversations") && !url.includes("/messages")) {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init?.body || "{}"));
          const newConv = {
            id: `conv_${Date.now()}`,
            workspaceId: "ws_default",
            title: body.title || "New Chat",
            modelId: body.modelId || "synthetic-model-v1",
            providerId: "ollama",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          return Promise.resolve({
            ok: true,
            json: async () => ({ conversation: newConv })
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({ conversations: convList })
        });
      }

      // Messages in conversation
      if (url.includes("/messages")) {
        if (init?.method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              messageId: "msg_user_1",
              runId: "run_test_1",
              status: "queued"
            })
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({ messages: msgList })
        });
      }

      // SSE event stream
      if (url.includes("/events")) {
        const chunks = options.sseChunks ?? [
          "id: 1\nevent: run_started\ndata: {}\n\n",
          'id: 2\nevent: text_delta\ndata: {"delta":"Hello "}\n\n',
          'id: 3\nevent: text_delta\ndata: {"delta":"world!"}\n\n',
          'id: 4\nevent: done\ndata: {"status":"succeeded"}\n\n'
        ];

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          }
        });

        return Promise.resolve({
          ok: true,
          body: stream
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({})
      });
    });

    global.fetch = fetchMock;
    return fetchMock;
  };

  it("1. displays owner pairing setup modal when unauthenticated and pairs successfully", async () => {
    setupMockFetch({ authenticated: false });
    render(<App />);

    // Renders pairing modal
    await waitFor(() => {
      expect(screen.getByText("Open Dot Spell Owner Setup")).toBeDefined();
      expect(screen.getByText("Single-Owner Security")).toBeDefined();
    });

    const input = screen.getByPlaceholderText("Paste pairing code from terminal...");
    const submitBtn = screen.getByText("Establish Owner Session");

    // Invalid code shows error
    fireEvent.change(input, { target: { value: "wrong-code" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Invalid pairing code/i)).toBeDefined();
    });

    // Valid code succeeds
    fireEvent.change(input, { target: { value: "valid-secret" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Open Dot Spell")).toBeDefined();
      expect(screen.queryByText("Open Dot Spell Owner Setup")).toBeNull();
    });
  });

  it("2. displays initial empty state, local_only privacy badge, and model selector", async () => {
    setupMockFetch({ authenticated: true });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Open Dot Spell")).toBeDefined();
      expect(screen.getByText("local_only")).toBeDefined();
      expect(screen.getByText("Ollama Online")).toBeDefined();
      expect(screen.getByText("Welcome to Open Dot Spell")).toBeDefined();
    });

    // Check model options in dropdown
    const select = screen.getByLabelText("Select Active Model") as HTMLSelectElement;
    expect(select.value).toBe("llama3:8b");
  });

  it("3. clearly explains unavailable Ollama provider status when offline", async () => {
    setupMockFetch({ authenticated: true, providerReachable: false, models: [] });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Ollama Offline")).toBeDefined();
      expect(screen.getByText(/ollama serve/i)).toBeDefined();
    });
  });

  it("4. sends message through real API and streams assistant response via SSE", async () => {
    setupMockFetch({ authenticated: true });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("Message input")).toBeDefined();
    });

    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "Explain quantum computing" } });
    const sendBtn = screen.getByLabelText("Send message");
    fireEvent.click(sendBtn);

    // Optimistic user message appears
    await waitFor(() => {
      expect(screen.getAllByText("Explain quantum computing").length).toBeGreaterThanOrEqual(1);
    });

    // Assistant streamed response chunks appear
    await waitFor(() => {
      expect(screen.getByText("Hello world!")).toBeDefined();
    });
  });

  it("5. safely sanitizes markdown links and renders code blocks without script injection", async () => {
    setupMockFetch({
      authenticated: true,
      conversations: [{
        id: "conv_md_test",
        workspaceId: "ws_default",
        title: "Markdown Test",
        modelId: "synthetic-model-v1",
        providerId: "ollama",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }],
      messages: [
        { id: "m1", role: "user", content: "Show markdown" },
        {
          id: "m2",
          role: "assistant",
          content: "Here is code:\n```javascript\nconsole.log('safe');\n```\nAnd a safe [link](https://example.com) and unsafe [bad](javascript:alert(1)) and `<script>bad()</script>`."
        }
      ]
    });

    window.history.replaceState({}, "", "/?c=conv_md_test");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("console.log('safe');")).toBeDefined();
      const safeLink = screen.getByText("link") as HTMLAnchorElement;
      expect(safeLink.href).toBe("https://example.com/");
      expect(safeLink.target).toBe("_blank");

      // Unsafe javascript: link is neutralized (not rendered as active JS anchor)
      expect(document.querySelector('a[href*="javascript:"]')).toBeNull();

      // Raw script tag is rendered as escaped text, never executed
      expect(screen.getByText((content) => content.includes("<script>bad()</script>"))).toBeDefined();
    });
  });

  it("6. reloads an existing conversation after refresh and preserves messages", async () => {
    setupMockFetch({
      authenticated: true,
      conversations: [{
        id: "conv_saved_1",
        workspaceId: "ws_default",
        title: "Saved History Conversation",
        modelId: "synthetic-model-v1",
        providerId: "ollama",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }],
      messages: [
        { id: "m1", role: "user", content: "Hello from previous session" },
        { id: "m2", role: "assistant", content: "Greetings! Previous turn is preserved." }
      ]
    });

    window.history.replaceState({}, "", "/?c=conv_saved_1");
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("Saved History Conversation").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Hello from previous session")).toBeDefined();
      expect(screen.getByText("Greetings! Previous turn is preserved.")).toBeDefined();
    });
  });

  it("7. clearly displays failed and interrupted run UI states", async () => {
    setupMockFetch({
      authenticated: true,
      sseChunks: [
        "id: 1\nevent: run_started\ndata: {}\n\n",
        'id: 2\nevent: text_delta\ndata: {"delta":"Starting run..."}\n\n',
        'id: 3\nevent: run_failed\ndata: {"errorMessage":"Model context window exceeded", "status":"failed"}\n\n',
        'id: 4\nevent: done\ndata: {"status":"failed"}\n\n'
      ]
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("Message input")).toBeDefined();
    });

    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "Trigger failure" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText(/Model context window exceeded/i)).toBeDefined();
      expect(screen.getByText(/Execution Failed:/i)).toBeDefined();
    });
  });

  it("8. supports keyboard navigation (Enter to send, Shift+Enter for newline)", async () => {
    setupMockFetch({ authenticated: true });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("Message input")).toBeDefined();
    });

    const textarea = screen.getByLabelText("Message input");

    // Shift+Enter does NOT submit (allows multiline editing)
    fireEvent.change(textarea, { target: { value: "Line 1" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(document.querySelector(".ods-message-user")).toBeNull();

    // Plain Enter submits
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    await waitFor(() => {
      expect(document.querySelector(".ods-message-user")).not.toBeNull();
      expect(screen.getAllByText("Line 1").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("9. supports narrow viewport mobile toggle", async () => {
    setupMockFetch({ authenticated: true });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("Open conversations sidebar")).toBeDefined();
    });

    const menuBtn = screen.getByLabelText("Open conversations sidebar");
    fireEvent.click(menuBtn);

    await waitFor(() => {
      expect(screen.getByLabelText("Close conversations sidebar")).toBeDefined();
    });
  });

  it("10. supports stopping / interrupting active stream via Composer Stop button", async () => {
    // Hang stream with no done event
    setupMockFetch({
      authenticated: true,
      sseChunks: [
        "id: 1\nevent: run_started\ndata: {}\n\n",
        'id: 2\nevent: text_delta\ndata: {"delta":"Thinking..."}\n\n'
      ]
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("Message input")).toBeDefined();
    });

    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "Long stream query" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByLabelText("Stop generation")).toBeDefined();
    });

    const stopBtn = screen.getByLabelText("Stop generation");
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(screen.getByText("Response interrupted.")).toBeDefined();
    });
  });
});
