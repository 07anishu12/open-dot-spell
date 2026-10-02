import { useState, type FormEvent } from "react";

interface PairingModalProps {
  onPairSuccess: () => void;
}

export function PairingModal({ onPairSuccess }: PairingModalProps) {
  const [pairingSecret, setPairingSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePair = async (e: FormEvent) => {
    e.preventDefault();
    if (!pairingSecret.trim()) {
      setError("Please enter the pairing code.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/pair", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ pairingSecret: pairingSecret.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Pairing failed with status ${res.status}`);
      }

      onPairSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ods-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pairing-title">
      <div className="ods-modal-card">
        <header className="ods-modal-header">
          <div className="ods-badge ods-badge-warning">Single-Owner Security</div>
          <h2 id="pairing-title" className="ods-modal-title">
            Open Dot Spell Owner Setup
          </h2>
          <p className="ods-modal-subtitle">
            To protect your local environment and files, Open Dot Spell requires a one-time
            owner pairing code to establish a secure browser session.
          </p>
        </header>

        <section className="ods-setup-instructions" aria-label="Setup Instructions">
          <p>
            <strong>Where to find your pairing code:</strong>
          </p>
          <div className="ods-terminal-hint">
            Check the terminal where you started the server (<code>pnpm dev:server</code> or <code>pnpm start</code>). Look for:
            <pre>One-Time Pairing Code: &lt;64-character-hex-secret&gt;</pre>
          </div>
        </section>

        <form onSubmit={handlePair} className="ods-form">
          <div className="ods-field">
            <label htmlFor="pairing-code-input" className="ods-label">
              One-Time Pairing Code
            </label>
            <div className="ods-input-row">
              <input
                id="pairing-code-input"
                type={showSecret ? "text" : "password"}
                value={pairingSecret}
                onChange={(e) => setPairingSecret(e.target.value)}
                placeholder="Paste pairing code from terminal..."
                className="ods-input"
                autoComplete="off"
                disabled={submitting}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="ods-btn ods-btn-ghost"
                aria-label={showSecret ? "Hide pairing code" : "Show pairing code"}
              >
                {showSecret ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <div className="ods-error-banner" role="alert">
              <strong>Pairing Error:</strong> {error}
            </div>
          )}

          <div className="ods-modal-actions">
            <button
              type="submit"
              disabled={submitting || !pairingSecret.trim()}
              className="ods-btn ods-btn-primary"
            >
              {submitting ? "Pairing Device..." : "Establish Owner Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
