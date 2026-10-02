import { useEffect, useState } from "react";
import type { HealthResponse } from "@open-dot-spell/core";

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Health check failed with status: ${res.status}`);
        }
        return res.json() as Promise<HealthResponse>;
      })
      .then((data) => {
        setHealth(data);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <header style={{ borderBottom: "1px solid #e0e0e0", paddingBottom: "1rem", marginBottom: "2rem" }}>
        <h1 style={{ margin: "0 0 0.5rem 0" }}>Open Dot Spell</h1>
        <p style={{ margin: 0, color: "#666" }}>
          An open-source, model-agnostic personal AI assistant powered by local and open models.
        </p>
      </header>

      <main>
        <section style={{ background: "#f9f9f9", padding: "1.5rem", borderRadius: "8px", border: "1px solid #eee" }}>
          <h2 style={{ marginTop: 0 }}>System Status</h2>
          {loading && <p>Checking system readiness...</p>}
          {error && (
            <p style={{ color: "#d32f2f" }}>
              Unable to connect to local server: {error}
            </p>
          )}
          {health && (
            <div>
              <p>
                <strong>Status:</strong>{" "}
                <span style={{ color: health.status === "healthy" ? "#2e7d32" : "#d32f2f" }}>
                  {health.status}
                </span>
              </p>
              <p><strong>Version:</strong> {health.version}</p>
              <p><strong>Privacy Mode:</strong> {health.privacy_mode}</p>
              <p><strong>Database:</strong> {health.database}</p>
              <p><strong>Worker:</strong> {health.worker}</p>
            </div>
          )}
        </section>
      </main>

      <footer style={{ marginTop: "2rem", borderTop: "1px solid #e0e0e0", paddingTop: "1rem", color: "#888", fontSize: "0.875rem" }}>
        Step 04 Shell Verification
      </footer>
    </div>
  );
}
