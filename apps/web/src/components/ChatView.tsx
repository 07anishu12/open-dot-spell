import { useEffect, useRef } from "react";
import { MarkdownView } from "./MarkdownView.js";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokenCount?: number | null;
  createdAt?: string;
  isStreaming?: boolean;
}

export type RunUIState = "idle" | "queued" | "responding" | "complete" | "interrupted" | "failed";

interface ChatViewProps {
  conversationTitle?: string;
  modelId?: string;
  privacyMode?: string;
  messages: ChatMessage[];
  runState: RunUIState;
  errorMessage?: string | null;
  onToggleSidebar: () => void;
  onNewConversation: () => void;
  isSidebarOpen: boolean;
}

export function ChatView({
  conversationTitle,
  modelId,
  privacyMode = "local_only",
  messages,
  runState,
  errorMessage,
  onToggleSidebar,
  onNewConversation,
  isSidebarOpen
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or streaming deltas
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, runState]);

  return (
    <main className="ods-chat-container" aria-label="Active conversation">
      {/* Top Navigation Bar */}
      <header className="ods-chat-header">
        <div className="ods-header-left">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="ods-btn ods-btn-ghost ods-btn-menu"
            aria-label={isSidebarOpen ? "Close conversations sidebar" : "Open conversations sidebar"}
          >
            ☰
          </button>
          <div className="ods-chat-title-group">
            <h2 className="ods-chat-title">{conversationTitle || "New Conversation"}</h2>
            {modelId && <span className="ods-badge ods-badge-model">{modelId}</span>}
          </div>
        </div>

        <div className="ods-header-right">
          <div
            className="ods-privacy-indicator"
            title={
              privacyMode === "local_only"
                ? "All prompts and inference remain strictly local on loopback"
                : privacyMode === "hybrid"
                  ? "Hybrid execution mode enabled"
                  : "Local execution"
            }
          >
            <span className="ods-privacy-lock-icon" aria-hidden="true">🔒</span>
            <span className="ods-privacy-text">
              {privacyMode === "hybrid" ? "Hybrid Mode" : privacyMode === "offline" ? "Offline Mode" : "Local Loopback"}
            </span>
          </div>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <section className="ods-messages-area" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="ods-empty-chat-state">
            {errorMessage && (
              <div className="ods-run-status ods-status-failed" style={{ marginBottom: "1.5rem", width: "100%", maxWidth: 600 }} role="alert">
                <span aria-hidden="true">❌</span>
                <span><strong>Execution Failed:</strong> {errorMessage}</span>
              </div>
            )}
            <div className="ods-empty-icon" aria-hidden="true">✨</div>
            <h3 className="ods-empty-title">
              {conversationTitle ? `Start chatting with ${modelId || "local model"}` : "Welcome to Open Dot Spell"}
            </h3>
            <p className="ods-empty-desc">
              Your personal, local-first AI assistant. All conversations, tool executions, and model inference run strictly on your machine.
            </p>
            {!conversationTitle && (
              <button
                type="button"
                onClick={onNewConversation}
                className="ods-btn ods-btn-primary"
              >
                Start a New Conversation
              </button>
            )}
          </div>
        ) : (
          <div className="ods-messages-list">
            {messages.map((msg, idx) => {
              const isUser = msg.role === "user";
              return (
                <article
                  key={msg.id || `msg_${idx}`}
                  className={`ods-message-row ${isUser ? "ods-message-user" : "ods-message-assistant"}`}
                >
                  <div className="ods-message-bubble">
                    <header className="ods-message-meta">
                      <span className="ods-message-role-label">
                        {isUser ? "You" : "Open Dot Spell"}
                      </span>
                      {msg.createdAt && (
                        <time className="ods-message-time">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </time>
                      )}
                    </header>

                    <div className="ods-message-content">
                      {isUser ? (
                        <p className="ods-user-text">{msg.content}</p>
                      ) : (
                        <MarkdownView content={msg.content} />
                      )}
                    </div>

                    {!isUser && msg.isStreaming && (
                      <div className="ods-streaming-cursor" aria-label="Assistant is writing...">
                        <span className="ods-dot-pulse" />
                      </div>
                    )}
                  </div>
                </article>
              );
            })}

            {/* Run Status Indicators */}
            {runState === "queued" && (
              <div className="ods-run-status ods-status-queued" role="status">
                <span className="ods-spinner" aria-hidden="true" />
                <span>Queued for worker execution...</span>
              </div>
            )}

            {runState === "responding" && (
              <div className="ods-run-status ods-status-responding" role="status">
                <span className="ods-spinner" aria-hidden="true" />
                <span>Streaming response from local model...</span>
              </div>
            )}

            {runState === "interrupted" && (
              <div className="ods-run-status ods-status-interrupted" role="alert">
                <span aria-hidden="true">⚠️</span>
                <span>Response interrupted.</span>
              </div>
            )}

            {runState === "failed" && (
              <div className="ods-run-status ods-status-failed" role="alert">
                <span aria-hidden="true">❌</span>
                <span><strong>Execution Failed:</strong> {errorMessage || "Inference failed"}</span>
              </div>
            )}

            <div ref={messagesEndRef} aria-hidden="true" />
          </div>
        )}
      </section>
    </main>
  );
}
