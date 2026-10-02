import {
  type ModelProviderAdapter,
  type ProviderChatRequest,
  type StreamChatOptions,
  type ProviderEvent,
  type ProviderHealth,
  type DiscoveredModel,
  type ObservedModelCapabilities
} from "./types.js";
import { ProviderError } from "./errors.js";
import { validateProviderEndpoint } from "./policy.js";

export interface OllamaProviderOptions {
  baseUrl?: string;
  privacyMode?: "local_only" | "hybrid" | "offline";
  requestTimeoutMs?: number;
}

interface OllamaTagModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  modified_at: string;
  details?: {
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface OllamaTagsResponse {
  models?: OllamaTagModel[];
}

interface OllamaChatChunk {
  model?: string;
  created_at?: string;
  message?: {
    role?: string;
    content?: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, unknown> | string;
      };
    }>;
  };
  done?: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements ModelProviderAdapter {
  public readonly providerId = "prov_ollama_local";
  public readonly providerType = "ollama";
  public readonly isLocal = true;
  public readonly baseUrl: string;
  private readonly privacyMode: "local_only" | "hybrid" | "offline";
  private readonly defaultTimeoutMs: number;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = (options.baseUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
    this.privacyMode = options.privacyMode || "local_only";
    this.defaultTimeoutMs = options.requestTimeoutMs || 30000;

    // Validate endpoint adherence to privacy policy
    validateProviderEndpoint(this.baseUrl, this.privacyMode, this.providerId);
  }

  public async checkHealth(): Promise<ProviderHealth> {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return {
          reachable: false,
          latencyMs: null,
          error: `Ollama returned HTTP ${res.status}: ${res.statusText}. Start Ollama and retry.`
        };
      }

      return {
        reachable: true,
        latencyMs: Date.now() - startTime
      };
    } catch {
      return {
        reachable: false,
        latencyMs: null,
        error: "Ollama is unavailable at " + this.baseUrl + ". Start Ollama and retry."
      };
    }
  }

  public async discoverModels(): Promise<DiscoveredModel[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
      if (!res.ok) {
        throw new ProviderError({
          message: `Ollama returned HTTP ${res.status} while querying models. Start Ollama and retry.`,
          category: "connection_failure",
          providerId: this.providerId,
          modelId: "unknown",
          fatal: true
        });
      }

      const data = (await res.json()) as OllamaTagsResponse;
      if (!data.models || !Array.isArray(data.models)) {
        return [];
      }

      return data.models.map((m) => ({
        modelId: m.name,
        name: m.name,
        sizeBytes: m.size,
        modifiedAt: m.modified_at,
        description: m.details?.parameter_size ? `Parameter size: ${m.details.parameter_size}` : undefined
      }));
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError({
        message: "Ollama is unavailable. Start Ollama and retry.",
        category: "connection_failure",
        providerId: this.providerId,
        modelId: "unknown",
        fatal: true,
        rawError: err
      });
    }
  }

  public async getCapabilities(modelId: string): Promise<ObservedModelCapabilities> {
    try {
      const res = await fetch(`${this.baseUrl}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelId })
      });

      if (!res.ok) {
        return {
          providerId: this.providerId,
          modelId,
          runtimeVersion: null,
          probeDate: new Date().toISOString(),
          limits: { contextLimit: null, outputLimit: null, requestTimeoutMs: null },
          streaming: "unknown",
          toolCalling: "unknown",
          structuredOutput: "unknown",
          vision: "unknown",
          embeddings: "unknown",
          imageGeneration: "unsupported"
        };
      }

      const showData = (await res.json()) as Record<string, unknown>;
      const details = (showData["details"] as Record<string, unknown>) || {};
      const family = String(details["family"] || "").toLowerCase();

      // Models in llama3/qwen2/mistral families generally support tool calling in modern Ollama
      const knownToolFamilies = new Set(["llama", "qwen", "mistral", "command-r"]);
      const toolSupport = knownToolFamilies.has(family) ? "supported" : "unknown";

      return {
        providerId: this.providerId,
        modelId,
        runtimeVersion: String(details["format"] || details["parameter_size"] || "ollama-model"),
        probeDate: new Date().toISOString(),
        limits: {
          contextLimit: 8192,
          outputLimit: 2048,
          requestTimeoutMs: this.defaultTimeoutMs
        },
        streaming: "supported",
        toolCalling: toolSupport,
        structuredOutput: "supported",
        vision: family.includes("vision") || family.includes("llava") ? "supported" : "unsupported",
        embeddings: "supported",
        imageGeneration: "unsupported"
      };
    } catch {
      return {
        providerId: this.providerId,
        modelId,
        runtimeVersion: null,
        probeDate: new Date().toISOString(),
        limits: { contextLimit: null, outputLimit: null, requestTimeoutMs: null },
        streaming: "unknown",
        toolCalling: "unknown",
        structuredOutput: "unknown",
        vision: "unknown",
        embeddings: "unknown",
        imageGeneration: "unsupported"
      };
    }
  }

  public async *streamChat(
    request: ProviderChatRequest,
    options?: StreamChatOptions
  ): AsyncIterable<ProviderEvent> {
    const modelId = request.modelId;
    const signal = options?.signal;

    if (signal?.aborted) {
      yield { type: "error", modelId, category: "cancellation", message: "Request cancelled by client", fatal: true };
      yield { type: "completed", modelId, finishReason: "cancelled" };
      return;
    }

    const payload: Record<string, unknown> = {
      model: modelId,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content
      })),
      stream: true,
      options: {
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { num_predict: request.maxTokens } : {})
      }
    };

    if (request.tools && request.tools.length > 0) {
      payload["tools"] = request.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      }));
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal
      });
    } catch (err: unknown) {
      if (signal?.aborted) {
        yield { type: "error", modelId, category: "cancellation", message: "Request was cancelled", fatal: true };
        yield { type: "completed", modelId, finishReason: "cancelled" };
        return;
      }
      const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.message.includes("timeout"));
      const category = isTimeout ? "timeout" : "connection_failure";
      const message = isTimeout
        ? "Ollama request timed out"
        : "Failed to connect to Ollama at " + this.baseUrl + ". Start Ollama and retry.";

      yield { type: "error", modelId, category, message, fatal: true, rawError: err };
      yield { type: "completed", modelId, finishReason: "error" };
      return;
    }

    if (!response.ok) {
      let errMsg = `Ollama returned HTTP ${response.status}: ${response.statusText}`;
      try {
        const errJson = (await response.json()) as { error?: string };
        if (errJson.error) {
          errMsg = errJson.error;
        }
      } catch {
        // use default error message
      }

      if (response.status === 404) {
        errMsg = `Model "${modelId}" not found in Ollama. Install a model explicitly, then retry.`;
      }

      yield { type: "error", modelId, category: "provider_error", message: errMsg, fatal: true };
      yield { type: "completed", modelId, finishReason: "error" };
      return;
    }

    if (!response.body) {
      yield {
        type: "error",
        modelId,
        category: "malformed_response",
        message: "Ollama returned empty response body",
        fatal: true
      };
      yield { type: "completed", modelId, finishReason: "error" };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let hasToolCalls = false;
    let toolCallIndex = 0;

    try {
      while (true) {
        if (signal?.aborted) {
          reader.cancel().catch(() => {});
          yield { type: "completed", modelId, finishReason: "cancelled" };
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let chunk: OllamaChatChunk;
          try {
            chunk = JSON.parse(trimmed) as OllamaChatChunk;
          } catch (jsonErr) {
            yield {
              type: "error",
              modelId,
              category: "malformed_response",
              message: "Malformed NDJSON chunk from Ollama: " + (jsonErr instanceof Error ? jsonErr.message : String(jsonErr)),
              fatal: true,
              rawError: trimmed
            };
            yield { type: "completed", modelId, finishReason: "error" };
            return;
          }

          if (chunk.message?.content) {
            yield {
              type: "text_delta",
              modelId,
              delta: chunk.message.content
            };
          }

          if (chunk.message?.tool_calls && chunk.message.tool_calls.length > 0) {
            hasToolCalls = true;
            for (const tc of chunk.message.tool_calls) {
              const toolCallId = `call_ollama_${++toolCallIndex}`;
              const argsObj =
                typeof tc.function.arguments === "string"
                  ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
                  : tc.function.arguments;
              const rawArgs = typeof tc.function.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function.arguments);

              yield {
                type: "tool_call_start",
                modelId,
                toolCallId,
                toolName: tc.function.name
              };
              yield {
                type: "tool_call_delta",
                modelId,
                toolCallId,
                argumentsDelta: rawArgs
              };
              yield {
                type: "tool_call_complete",
                modelId,
                toolCallId,
                toolName: tc.function.name,
                rawArguments: rawArgs,
                arguments: argsObj
              };
            }
          }

          if (chunk.done) {
            // Explicit usage reporting: preserve null if missing, never fabricate 0
            const promptTokens = chunk.prompt_eval_count ?? null;
            const completionTokens = chunk.eval_count ?? null;
            const totalTokens =
              promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null;

            yield {
              type: "usage",
              modelId,
              promptTokens,
              completionTokens,
              totalTokens
            };

            yield {
              type: "completed",
              modelId,
              finishReason: hasToolCalls ? "tool_calls" : "stop"
            };
            return;
          }
        }
      }

      // If stream ended without done flag, it's an interrupted stream
      yield {
        type: "error",
        modelId,
        category: "interrupted_stream",
        message: "Ollama stream closed unexpectedly before sending done completion",
        fatal: true
      };
      yield { type: "completed", modelId, finishReason: "error" };
    } catch (err: unknown) {
      if (signal?.aborted) {
        yield { type: "completed", modelId, finishReason: "cancelled" };
        return;
      }
      yield {
        type: "error",
        modelId,
        category: "interrupted_stream",
        message: "Error reading Ollama stream: " + (err instanceof Error ? err.message : String(err)),
        fatal: true,
        rawError: err
      };
      yield { type: "completed", modelId, finishReason: "error" };
    }
  }
}
