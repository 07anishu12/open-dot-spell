import { useEffect, useState, useRef, useCallback } from "react";
import "./styles.css";
import { Sidebar, type ConversationItem, type DiscoveredModelItem, type ProviderHealthStatus } from "./components/Sidebar.js";
import { ChatView, type ChatMessage, type RunUIState } from "./components/ChatView.js";
import { Composer } from "./components/Composer.js";
import { PairingModal } from "./components/PairingModal.js";
import { streamRunEvents } from "./utils/sse.js";

const DEFAULT_WORKSPACE_ID = "ws_default";
const STORAGE_KEY_MODEL = "ods_selected_model";
const STORAGE_KEY_CONV = "ods_active_conv";

const getStoredItem = (key: string): string | null => {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
};

const setStoredItem = (key: string, value: string): void => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore
  }
};

const removeStoredItem = (key: string): void => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore
  }
};

export function App() {
  // Authentication & Setup state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Workspace & Provider state
  const [workspaceId, setWorkspaceId] = useState<string>(DEFAULT_WORKSPACE_ID);
  const [models, setModels] = useState<DiscoveredModelItem[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return getStoredItem(STORAGE_KEY_MODEL) || "llama3:8b";
  });
  const [providerHealth, setProviderHealth] = useState<ProviderHealthStatus | null>(null);

  // Conversations & Chat state
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("c") || getStoredItem(STORAGE_KEY_CONV) || null;
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [runState, setRunState] = useState<RunUIState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mobile navigation
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Active SSE stream unsubscribe ref
  const closeStreamRef = useRef<(() => void) | null>(null);

  // 1. Initial Authentication Check
  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to check auth status");
      const data = await res.json();
      setIsAuthenticated(Boolean(data.authenticated));
    } catch {
      setIsAuthenticated(false);
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  // 2. Load Provider Status & Discovered Models
  const loadProviderInfo = useCallback(async () => {
    try {
      const statusUrl = selectedModel
        ? `/api/providers/status?model=${encodeURIComponent(selectedModel)}`
        : "/api/providers/status";
      const [statusRes, modelsRes] = await Promise.all([
        fetch(statusUrl, { credentials: "include" }),
        fetch("/api/providers/models", { credentials: "include" })
      ]);

      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as ProviderHealthStatus;
        setProviderHealth(statusData);
      } else if (statusRes.status === 401) {
        setIsAuthenticated(false);
      }

      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        if (Array.isArray(modelsData.models)) {
          setModels(modelsData.models);
          if (modelsData.models.length > 0) {
            // If current selectedModel is not in discovered models, select first discovered
            const hasSelected = modelsData.models.some((m: DiscoveredModelItem) => m.modelId === selectedModel);
            if (!hasSelected && modelsData.models[0]?.modelId) {
              setSelectedModel(modelsData.models[0].modelId);
              setStoredItem(STORAGE_KEY_MODEL, modelsData.models[0].modelId);
            }
          }
        }
      } else if (modelsRes.status === 401) {
        setIsAuthenticated(false);
      }
    } catch {
      setProviderHealth({
        reachable: false,
        latencyMs: null,
        error: "Unable to query provider status on 127.0.0.1:3000",
        state: "ollama_unavailable"
      });
    }
  }, [selectedModel]);

  // 3. Load Workspaces and Conversations
  const loadWorkspaceAndConversations = useCallback(async () => {
    try {
      // Load or auto-initialize default workspace
      const wsRes = await fetch("/api/workspaces", { credentials: "include" });
      if (wsRes.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      let currentWs = DEFAULT_WORKSPACE_ID;
      if (wsRes.ok) {
        const wsData = await wsRes.json();
        currentWs = wsData.activeWorkspaceId || wsData.workspaces?.[0]?.id || DEFAULT_WORKSPACE_ID;
        setWorkspaceId(currentWs);
      }

      // Load conversations for this workspace
      const convRes = await fetch(`/api/workspaces/${encodeURIComponent(currentWs)}/conversations`, {
        credentials: "include"
      });
      if (convRes.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      if (convRes.ok) {
        const convData = await convRes.json();
        const convList = (convData.conversations as ConversationItem[]) || [];
        setConversations(convList);
      }
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void loadProviderInfo();
      void loadWorkspaceAndConversations();
    }
  }, [isAuthenticated, loadProviderInfo, loadWorkspaceAndConversations]);

  // 4. Load Messages for Active Conversation
  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(convId)}/messages`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      setMessages([]);
    }
  }, [workspaceId]);

  const activeConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeConversationId && isAuthenticated) {
      if (activeConversationId !== activeConversationIdRef.current) {
        activeConversationIdRef.current = activeConversationId;
        void loadMessages(activeConversationId);
      }
      setStoredItem(STORAGE_KEY_CONV, activeConversationId);
      const url = new URL(window.location.href);
      url.searchParams.set("c", activeConversationId);
      window.history.replaceState({}, "", url.toString());
    } else {
      activeConversationIdRef.current = null;
      removeStoredItem(STORAGE_KEY_CONV);
      const url = new URL(window.location.href);
      url.searchParams.delete("c");
      window.history.replaceState({}, "", url.toString());
    }
  }, [activeConversationId, isAuthenticated, loadMessages]);

  // Handle Model Selection
  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    setStoredItem(STORAGE_KEY_MODEL, modelId);
  };

  // Handle Create New Conversation
  const handleCreateNewConversation = () => {
    if (closeStreamRef.current) {
      closeStreamRef.current();
      closeStreamRef.current = null;
    }
    setActiveConversationId(null);
    setMessages([]);
    setRunState("idle");
    setErrorMessage(null);
    setIsSidebarOpen(false);
  };

  // 5. Send Message & Subscribe to Real SSE Stream
  const handleSendMessage = async (content: string) => {
    if (!content.trim() || runState === "queued" || runState === "responding") return;

    if (providerHealth && !providerHealth.reachable) {
      setRunState("failed");
      setErrorMessage("Ollama is offline. Run 'ollama serve' to start the local inference service.");
      return;
    }

    if (providerHealth?.state === "model_missing") {
      setRunState("failed");
      setErrorMessage(`Model '${selectedModel}' is not installed in local Ollama. Run 'ollama pull ${selectedModel}' in terminal.`);
      return;
    }

    let targetConvId = activeConversationId;

    try {
      setErrorMessage(null);

      // If no conversation is open, create one first
      if (!targetConvId) {
        const titleSnippet = content.trim().slice(0, 32) + (content.length > 32 ? "..." : "");
        const createRes = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            title: titleSnippet,
            modelId: selectedModel,
            providerId: "ollama"
          })
        });

        if (!createRes.ok) {
          const errData = await createRes.json();
          throw new Error(errData.error || `Failed to create conversation: HTTP ${createRes.status}`);
        }

        const newConvData = await createRes.json();
        const newConv = newConvData.conversation as ConversationItem;
        targetConvId = newConv.id;
        activeConversationIdRef.current = targetConvId;
        setActiveConversationId(targetConvId);
        setConversations((prev) => [newConv, ...prev]);
      }

      // Generate client idempotency key
      const idempotencyKey = `idem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      // Append user message optimistically
      const optimisticUserMsg: ChatMessage = {
        id: `user_${Date.now()}`,
        role: "user",
        content,
        createdAt: new Date().toISOString()
      };

      // Assistant placeholder
      const placeholderAssistantMsg: ChatMessage = {
        id: `asst_temp_${Date.now()}`,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        isStreaming: true
      };

      setMessages((prev) => [...prev, optimisticUserMsg, placeholderAssistantMsg]);
      setRunState("queued");

      // Submit message to server
      const msgRes = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(targetConvId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ content, idempotencyKey })
        }
      );

      if (!msgRes.ok) {
        const errData = await msgRes.json();
        throw new Error(errData.error || `Message submission failed with HTTP ${msgRes.status}`);
      }

      const turnResult = await msgRes.json();
      const runId = turnResult.runId;

      // Close any previous stream
      if (closeStreamRef.current) {
        closeStreamRef.current();
        closeStreamRef.current = null;
      }

      // Subscribe to real SSE stream
      let streamContent = "";
      const stopStream = streamRunEvents({
        workspaceId,
        runId,
        cursor: 0,
        onEvent: (ev) => {
          if (ev.event === "run_started") {
            setRunState("responding");
          } else if (ev.event === "text_delta") {
            setRunState("responding");
            const delta = typeof ev.data === "object" ? String(ev.data["delta"] ?? "") : "";
            streamContent += delta;
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  content: streamContent,
                  isStreaming: true
                };
              }
              return updated;
            });
          } else if (ev.event === "message_completed") {
            const dataObj = typeof ev.data === "object" ? ev.data : {};
            const finalContent = String(dataObj["content"] ?? streamContent);
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  content: finalContent,
                  isStreaming: false
                };
              }
              return updated;
            });
          } else if (ev.event === "run_completed") {
            setRunState("complete");
          } else if (ev.event === "run_failed") {
            const dataObj = typeof ev.data === "object" ? ev.data : {};
            setRunState("failed");
            setErrorMessage(String(dataObj["errorMessage"] ?? "Execution failed"));
          } else if (ev.event === "run_interrupted") {
            setRunState("interrupted");
          } else if (ev.event === "done") {
            const dataObj = typeof ev.data === "object" ? ev.data : {};
            const status = String(dataObj["status"] ?? "complete");
            if (status === "failed") {
              setRunState("failed");
            } else if (status === "interrupted") {
              setRunState("interrupted");
            } else {
              setRunState("complete");
            }

            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  isStreaming: false
                };
              }
              return updated;
            });
          }
        },
        onError: (err) => {
          setRunState("failed");
          setErrorMessage(err.message);
        },
        onClose: () => {
          // Stream completed
        }
      });

      closeStreamRef.current = stopStream;
    } catch (err: unknown) {
      setRunState("failed");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleInterruptStream = () => {
    if (closeStreamRef.current) {
      closeStreamRef.current();
      closeStreamRef.current = null;
    }
    setRunState("interrupted");
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
    } catch {
      // Ignore
    }
    setIsAuthenticated(false);
  };

  // Active conversation object
  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  // If loading authentication status
  if (checkingAuth) {
    return (
      <div className="ods-app-layout" style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div className="ods-spinner" style={{ width: 24, height: 24, margin: "0 auto 1rem auto" }} />
          <p style={{ color: "var(--color-text-muted)" }}>Connecting to Open Dot Spell...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ods-app-layout">
      {/* 1. Setup / Pairing Flow Modal */}
      {!isAuthenticated && (
        <PairingModal
          onPairSuccess={() => {
            setIsAuthenticated(true);
            void checkAuth();
          }}
        />
      )}

      {/* 2. Conversations Sidebar */}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(id) => setActiveConversationId(id)}
        onCreateConversation={handleCreateNewConversation}
        models={models}
        selectedModel={selectedModel}
        onSelectModel={handleSelectModel}
        providerHealth={providerHealth}
        isOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
        onLogout={isAuthenticated ? handleLogout : undefined}
      />

      {/* 3. Main Chat View & Composer */}
      <div className="ods-main-wrapper">
        <ChatView
          conversationTitle={activeConversation?.title}
          modelId={activeConversation?.modelId || selectedModel}
          privacyMode={providerHealth?.privacyMode || "local_only"}
          messages={messages}
          runState={runState}
          errorMessage={errorMessage}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onNewConversation={handleCreateNewConversation}
          isSidebarOpen={isSidebarOpen}
        />

        <footer className="ods-composer-container">
          <Composer
            onSendMessage={handleSendMessage}
            disabled={!isAuthenticated}
            isStreaming={runState === "queued" || runState === "responding"}
            onInterruptStream={handleInterruptStream}
            placeholder={
              providerHealth?.reachable === false
                ? "Send prompt (Ollama offline; start daemon or select synthetic model)..."
                : `Send a message to ${selectedModel}...`
            }
          />
        </footer>
      </div>
    </div>
  );
}
