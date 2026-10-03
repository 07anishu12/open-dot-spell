export interface ConversationItem {
  id: string;
  workspaceId: string;
  title: string;
  modelId: string;
  providerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoveredModelItem {
  modelId: string;
  name: string;
  description?: string;
}

export interface ProviderHealthStatus {
  reachable: boolean;
  latencyMs: number | null;
  error?: string;
  warning?: string;
  providerId?: string;
  privacyMode?: string;
  model?: string;
  modelAvailable?: boolean;
  state?: "ollama_unavailable" | "model_missing" | "model_available" | "request_failed" | "ollama_online";
}

interface SidebarProps {
  conversations: ConversationItem[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onCreateConversation: () => void;
  models: DiscoveredModelItem[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  providerHealth: ProviderHealthStatus | null;
  isOpen: boolean;
  onCloseMobile: () => void;
  onLogout?: () => void;
}

export function Sidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onCreateConversation,
  models,
  selectedModel,
  onSelectModel,
  providerHealth,
  isOpen,
  onCloseMobile,
  onLogout
}: SidebarProps) {
  // Determine 4-state display
  const isOnline = providerHealth?.reachable === true;
  const healthState = providerHealth?.state;

  let indicatorClass = "ods-status-offline";
  let indicatorLabel = "Ollama Offline";
  let indicatorTooltip = providerHealth?.error || "Ollama service unavailable on 127.0.0.1:11434";

  if (healthState === "model_available") {
    indicatorClass = "ods-status-online";
    indicatorLabel = "Ollama Online";
    indicatorTooltip = `Model '${selectedModel}' is installed and ready (${providerHealth?.latencyMs ?? 0}ms).`;
  } else if (healthState === "model_missing") {
    indicatorClass = "ods-status-warning";
    indicatorLabel = "Model Missing";
    indicatorTooltip = providerHealth?.warning || `Model '${selectedModel}' is not installed in local Ollama.`;
  } else if (healthState === "request_failed") {
    indicatorClass = "ods-status-offline";
    indicatorLabel = "Provider Error";
    indicatorTooltip = providerHealth?.error || "Provider communication failed.";
  } else if (isOnline) {
    indicatorClass = "ods-status-online";
    indicatorLabel = "Ollama Online";
    indicatorTooltip = `Ollama service is reachable on loopback (${providerHealth?.latencyMs ?? 0}ms).`;
  }

  const privacyMode = providerHealth?.privacyMode || "local_only";
  const privacyTitle =
    privacyMode === "local_only"
      ? "Enforced loopback execution. No external cloud dependencies."
      : privacyMode === "hybrid"
        ? "Hybrid inference mode enabled."
        : "Local execution.";

  return (
    <>
      {isOpen && (
        <div
          className="ods-sidebar-overlay"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`ods-sidebar ${isOpen ? "ods-sidebar-open" : ""}`}
        aria-label="Conversations and Model Settings"
      >
        <div className="ods-sidebar-header">
          <div className="ods-brand">
            <h1 className="ods-brand-title">Open Dot Spell</h1>
            <div className="ods-inference-badge" title={privacyTitle}>
              <span className="ods-privacy-dot" />
              <span>{privacyMode}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCreateConversation}
            className="ods-btn ods-btn-primary ods-btn-new-chat"
            aria-label="Start new conversation"
          >
            <span aria-hidden="true">+</span> New Conversation
          </button>
        </div>

        {/* Model Selection and Provider Status */}
        <div className="ods-sidebar-section">
          <div className="ods-section-header">
            <label htmlFor="model-select" className="ods-section-title">
              Inference Model
            </label>
            <div
              className={`ods-status-indicator ${indicatorClass}`}
              title={indicatorTooltip}
            >
              <span className="ods-status-dot" />
              <span>{indicatorLabel}</span>
            </div>
          </div>

          <select
            id="model-select"
            value={selectedModel}
            onChange={(e) => onSelectModel(e.target.value)}
            className="ods-select"
            aria-label="Select Active Model"
            disabled={models.length === 0}
          >
            {models.length > 0 ? (
              <>
                {models.map((m) => (
                  <option key={m.modelId} value={m.modelId}>
                    {m.name}
                  </option>
                ))}
                {selectedModel && !models.some((m) => m.modelId === selectedModel) && (
                  <option value={selectedModel} disabled>
                    {selectedModel} (Not installed)
                  </option>
                )}
              </>
            ) : (
              <option value="" disabled>
                {providerHealth?.reachable === false
                  ? "Ollama offline (no models available)"
                  : "No models installed in Ollama"}
              </option>
            )}
          </select>

          {healthState === "model_missing" && (
            <div className="ods-provider-warning" role="note">
              <strong>Model missing:</strong> Model <code>{selectedModel}</code> is not installed in local Ollama. Run <code>ollama pull {selectedModel}</code> in terminal.
            </div>
          )}

          {(!isOnline || healthState === "ollama_unavailable") && (
            <div className="ods-provider-warning" role="note">
              <strong>Ollama offline:</strong> Run <code>ollama serve</code> to start the local inference service.
            </div>
          )}

          {healthState === "request_failed" && (
            <div className="ods-provider-warning" role="note">
              <strong>Provider error:</strong> {providerHealth?.error || "Inference request failed."}
            </div>
          )}
        </div>

        {/* Conversation History */}
        <nav className="ods-conversation-list" aria-label="Past conversations">
          <div className="ods-section-header">
            <span className="ods-section-title">Conversations ({conversations.length})</span>
          </div>

          {conversations.length === 0 ? (
            <div className="ods-empty-list">No conversations yet. Click "New Conversation" to start.</div>
          ) : (
            <ul className="ods-nav-list" role="list">
              {conversations.map((c) => {
                const isActive = c.id === activeConversationId;
                const formattedDate = new Date(c.updatedAt || c.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                });

                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectConversation(c.id);
                        onCloseMobile();
                      }}
                      className={`ods-conversation-btn ${isActive ? "ods-conversation-active" : ""}`}
                      aria-current={isActive ? "true" : undefined}
                    >
                      <div className="ods-conversation-btn-title" title={c.title}>
                        {c.title || "Untitled Conversation"}
                      </div>
                      <div className="ods-conversation-btn-meta">
                        <span className="ods-badge ods-badge-subtle">{c.modelId}</span>
                        <time className="ods-meta-time">{formattedDate}</time>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {onLogout && (
          <div className="ods-sidebar-footer" style={{ padding: "0.75rem 1rem", borderTop: "1px solid var(--color-border)" }}>
            <button
              type="button"
              onClick={onLogout}
              className="ods-btn ods-btn-ghost"
              style={{ width: "100%", justifyContent: "center", fontSize: "0.8rem", color: "var(--color-text-muted)" }}
              aria-label="Sign out of owner session"
            >
              Sign Out Owner Session
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
