export interface SSEMessage {
  id: number;
  event: string;
  data: Record<string, unknown> | string;
}

export interface StreamEventsOptions {
  workspaceId: string;
  runId: string;
  cursor?: number;
  onEvent: (msg: SSEMessage) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
}

/**
 * Connects to the real backend SSE event stream for a run, with cursor tracking and replay support.
 */
export function streamRunEvents(options: StreamEventsOptions): () => void {
  const controller = new AbortController();
  let maxReceivedId = options.cursor ?? 0;
  let isClosed = false;

  const url = new URL(
    `/api/workspaces/${encodeURIComponent(options.workspaceId)}/runs/${encodeURIComponent(options.runId)}/events`,
    window.location.origin
  );
  if (maxReceivedId > 0) {
    url.searchParams.set("cursor", String(maxReceivedId));
  }

  const runStream = async () => {
    try {
      const headers: Record<string, string> = {
        Accept: "text/event-stream"
      };
      if (maxReceivedId > 0) {
        headers["Last-Event-ID"] = String(maxReceivedId);
      }

      const res = await fetch(url.toString(), {
        method: "GET",
        headers,
        signal: controller.signal,
        credentials: "include"
      });

      if (!res.ok) {
        throw new Error(`SSE stream failed with HTTP ${res.status}: ${res.statusText}`);
      }

      if (!res.body) {
        throw new Error("Response body is not readable");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      let currentId = maxReceivedId;
      let currentEvent = "message";
      let currentDataLines: string[] = [];

      while (!isClosed) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trimEnd();

          // Heartbeat comment
          if (trimmed.startsWith(":")) {
            continue;
          }

          if (trimmed === "") {
            // End of event message block
            if (currentDataLines.length > 0 || currentEvent === "done") {
              const rawData = currentDataLines.join("\n");
              let parsedData: Record<string, unknown> | string = rawData;
              try {
                parsedData = JSON.parse(rawData);
              } catch {
                // Preserve raw string if not JSON
              }

              if (currentId > maxReceivedId) {
                maxReceivedId = currentId;
              }

              options.onEvent({
                id: currentId,
                event: currentEvent,
                data: parsedData
              });

              if (currentEvent === "done") {
                isClosed = true;
                options.onClose?.();
                return;
              }
            }
            currentEvent = "message";
            currentDataLines = [];
            continue;
          }

          if (trimmed.startsWith("id:")) {
            const parsed = parseInt(trimmed.slice(3).trim(), 10);
            if (!isNaN(parsed)) {
              currentId = parsed;
            }
          } else if (trimmed.startsWith("event:")) {
            currentEvent = trimmed.slice(6).trim();
          } else if (trimmed.startsWith("data:")) {
            currentDataLines.push(trimmed.slice(5).trimStart());
          }
        }
      }

      if (!isClosed) {
        isClosed = true;
        options.onClose?.();
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      isClosed = true;
      options.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  void runStream();

  return () => {
    isClosed = true;
    controller.abort();
  };
}
