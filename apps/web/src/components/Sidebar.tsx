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
  providerId?: string;
  privacyMode?: string;
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
  onCloseMobile
}: SidebarProps) {
  const isOnline = providerHealth?.reachable === true;

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
            <div className="ods-inference-badge" title="Enforced loopback execution. No external cloud dependencies.">
              <span className="ods-privacy-dot" />
              <span>local_only</span>
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
              className={`ods-status-indicator ${isOnline ? "ods-status-online" : "ods-status-offline"}`}
              title={
                isOnline
                  ? `Ollama reachable (${providerHealth?.latencyMs ?? 0}ms)`
                  : providerHealth?.error || "Ollama service unavailable on 127.0.0.1:11434"
              }
            >
              <span className="ods-status-dot" />
              <span>{isOnline ? "Ollama Online" : "Ollama Offline"}</span>
            </div>
          </div>

          <select
            id="model-select"
            value={selectedModel}
            onChange={(e) => onSelectModel(e.target.value)}
            className="ods-select"
            aria-label="Select Active Model"
          >
            {models.length > 0 ? (
              models.map((m) => (
                <option key={m.modelId} value={m.modelId}>
                  {m.name}
                </option>
              ))
            ) : (
              <>
                <option value="llama3:8b">llama3:8b (Ollama)</option>
                <option value="gemma:2b">gemma:2b (Ollama)</option>
                <option value="synthetic-model-v1">synthetic-model-v1 (Deterministic Double)</option>
              </>
            )}
          </select>

          {!isOnline && (
            <div className="ods-provider-warning" role="note">
              <strong>Ollama offline:</strong> Run <code>ollama serve</code> to connect local models, or use synthetic mode.
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
      </aside>
    </>
  );
}
