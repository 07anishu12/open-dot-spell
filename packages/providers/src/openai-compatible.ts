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
import { ToolCallStreamAssembler } from "./assembler.js";

export interface OpenAICompatibleProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  providerId?: string;
  privacyMode?: "local_only" | "hybrid" | "offline";
  requestTimeoutMs?: number;
}

interface OpenAIModelItem {
  id: string;
  created?: number;
  owned_by?: string;
}

interface OpenAIModelsResponse {
  data?: OpenAIModelItem[];
}

interface OpenAIChatChunk {
  id?: string;
  model?: string;
  choices?: Array<{
    index: number;
    delta?: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: "stop" | "tool_calls" | "length" | "content_filter" | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export class OpenAICompatibleProvider implements ModelProviderAdapter {
  public readonly providerId: string;
  public readonly providerType = "openai_compatible";
  public readonly isLocal: boolean;
  public readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly privacyMode: "local_only" | "hybrid" | "offline";
  private readonly defaultTimeoutMs: number;

  constructor(options: OpenAICompatibleProviderOptions = {}) {
    this.providerId = options.providerId || "prov_openai_compatible";
    this.baseUrl = (options.baseUrl || "http://127.0.0.1:8000/v1").replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.privacyMode = options.privacyMode || "local_only";
    this.defaultTimeoutMs = options.requestTimeoutMs || 30000;

    // Check if loopback
    const isLoopback =
      this.baseUrl.includes("127.0.0.1") ||
      this.baseUrl.includes("localhost") ||
      this.baseUrl.includes("::1");
    this.isLocal = isLoopback;

    // Validate endpoint adherence to privacy policy
    validateProviderEndpoint(this.baseUrl, this.privacyMode, this.providerId);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  public async checkHealth(): Promise<ProviderHealth> {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return {
          reachable: false,
          latencyMs: null,
          error: `Provider returned HTTP ${res.status}: ${res.statusText}`
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
        error: `Provider endpoint is unreachable at ${this.baseUrl}`
      };
    }
  }

  public async discoverModels(): Promise<DiscoveredModel[]> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers: this.getHeaders()
      });

      if (!res.ok) {
        throw new ProviderError({
          message: `Endpoint returned HTTP ${res.status} when listing models`,
          category: res.status === 401 || res.status === 403 ? "authentication_failure" : "connection_failure",
          providerId: this.providerId,
          modelId: "unknown",
          fatal: true
        });
      }

      const data = (await res.json()) as OpenAIModelsResponse;
      if (!data.data || !Array.isArray(data.data)) {
        return [];
      }

      return data.data.map((m) => ({
        modelId: m.id,
        name: m.id,
        description: m.owned_by ? `Owner: ${m.owned_by}` : undefined,
        modifiedAt: m.created ? new Date(m.created * 1000).toISOString() : undefined
      }));
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError({
        message: `Failed to discover models at ${this.baseUrl}`,
        category: "connection_failure",
        providerId: this.providerId,
        modelId: "unknown",
        fatal: true,
        rawError: err
      });
    }
  }

  public async getCapabilities(modelId: string): Promise<ObservedModelCapabilities> {
    // OpenAI-compatible protocol supports streaming, tool calling, and structured outputs in general,
    // but specific models must have capabilities probed or configured.
    return {
      providerId: this.providerId,
      modelId,
      runtimeVersion: "openai-v1-compatible",
      probeDate: new Date().toISOString(),
      limits: {
        contextLimit: 8192,
        outputLimit: 4096,
        requestTimeoutMs: this.defaultTimeoutMs
      },
      streaming: "supported",
      toolCalling: "supported",
      structuredOutput: "supported",
      vision: "unknown",
      embeddings: "unknown",
      imageGeneration: "unknown"
    };
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
        content: m.content,
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        ...(m.name ? { name: m.name } : {})
      })),
      stream: true,
      stream_options: { include_usage: true },
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {})
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
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        signal
      });
    } catch (err: unknown) {
      if (signal?.aborted) {
        yield { type: "error", modelId, category: "cancellation", message: "Request cancelled", fatal: true };
        yield { type: "completed", modelId, finishReason: "cancelled" };
        return;
      }
      const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.message.includes("timeout"));
      const category = isTimeout ? "timeout" : "connection_failure";
      const message = isTimeout
        ? "Request timed out"
        : `Connection to provider failed at ${this.baseUrl}`;

      yield { type: "error", modelId, category, message, fatal: true, rawError: err };
      yield { type: "completed", modelId, finishReason: "error" };
      return;
    }

    if (!response.ok) {
      let errMsg = `Provider returned HTTP ${response.status}: ${response.statusText}`;
      try {
        const errJson = (await response.json()) as { error?: { message?: string } | string };
        if (typeof errJson.error === "object" && errJson.error?.message) {
          errMsg = errJson.error.message;
        } else if (typeof errJson.error === "string") {
          errMsg = errJson.error;
        }
      } catch {
        // use default error message
      }

      let category: "authentication_failure" | "rate_limit" | "provider_error" = "provider_error";
      if (response.status === 401 || response.status === 403) {
        category = "authentication_failure";
      } else if (response.status === 429) {
        category = "rate_limit";
      }

      yield { type: "error", modelId, category, message: errMsg, fatal: true };
      yield { type: "completed", modelId, finishReason: "error" };
      return;
    }

    if (!response.body) {
      yield {
        type: "error",
        modelId,
        category: "malformed_response",
        message: "Empty response body from chat completions endpoint",
        fatal: true
      };
      yield { type: "completed", modelId, finishReason: "error" };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const assembler = new ToolCallStreamAssembler(this.providerId, modelId);
    let finishReason: "stop" | "tool_calls" | "length" | "cancelled" | "error" = "stop";
    let reportedUsage = false;

    // Track active tool call IDs by tool call index
    const toolCallIdMap = new Map<number, { id: string; name: string }>();

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
          if (!trimmed || !trimmed.startsWith("data:")) continue;

          const dataPayload = trimmed.slice(5).trim();
          if (dataPayload === "[DONE]") {
            // Stream complete
            continue;
          }

          let chunk: OpenAIChatChunk;
          try {
            chunk = JSON.parse(dataPayload) as OpenAIChatChunk;
          } catch (jsonErr) {
            yield {
              type: "error",
              modelId,
              category: "malformed_response",
              message: "Malformed SSE chunk from provider: " + (jsonErr instanceof Error ? jsonErr.message : String(jsonErr)),
              fatal: true,
              rawError: dataPayload
            };
            yield { type: "completed", modelId, finishReason: "error" };
            return;
          }

          // Handle usage if emitted in stream_options
          if (chunk.usage) {
            reportedUsage = true;
            yield {
              type: "usage",
              modelId,
              promptTokens: chunk.usage.prompt_tokens ?? null,
              completionTokens: chunk.usage.completion_tokens ?? null,
              totalTokens: chunk.usage.total_tokens ?? null
            };
          }

          const choice = chunk.choices?.[0];
          if (!choice) continue;

          if (choice.delta?.content) {
            yield {
              type: "text_delta",
              modelId,
              delta: choice.delta.content
            };
          }

          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index ?? 0;
              let callMeta = toolCallIdMap.get(idx);

              if (tc.id || tc.function?.name) {
                const callId = tc.id || `call_${idx}_${Date.now()}`;
                const callName = tc.function?.name || "unnamed_tool";
                callMeta = { id: callId, name: callName };
                toolCallIdMap.set(idx, callMeta);

                yield {
                  type: "tool_call_start",
                  modelId,
                  toolCallId: callId,
                  toolName: callName
                };

                // If previous tool call on assembler was still pending, finalize it
                if (assembler.hasPendingToolCall()) {
                  // finalized below
                }
                assembler.startToolCall(callId, callName);
              }

              if (tc.function?.arguments) {
                if (callMeta) {
                  yield {
                    type: "tool_call_delta",
                    modelId,
                    toolCallId: callMeta.id,
                    argumentsDelta: tc.function.arguments
                  };
                  assembler.appendDelta(callMeta.id, tc.function.arguments);
                }
              }
            }
          }

          if (choice.finish_reason) {
            if (choice.finish_reason === "tool_calls") {
              finishReason = "tool_calls";
              // Finalize any active tool calls in the assembler
              for (const [, meta] of toolCallIdMap) {
                try {
                  const assembled = assembler.finalizeToolCall(meta.id);
                  yield {
                    type: "tool_call_complete",
                    modelId,
                    toolCallId: assembled.toolCallId,
                    toolName: assembled.toolName,
                    rawArguments: assembled.rawArguments,
                    arguments: assembled.arguments
                  };
                } catch (assemErr) {
                  if (assemErr instanceof ProviderError) {
                    yield {
                      type: "error",
                      modelId,
                      category: assemErr.category,
                      message: assemErr.message,
                      fatal: true
                    };
                    yield { type: "completed", modelId, finishReason: "error" };
                    return;
                  }
                }
              }
            } else if (choice.finish_reason === "length") {
              finishReason = "length";
            } else {
              finishReason = "stop";
            }
          }
        }
      }

      // If usage was not emitted, yield explicit null usage
      if (!reportedUsage) {
        yield {
          type: "usage",
          modelId,
          promptTokens: null,
          completionTokens: null,
          totalTokens: null
        };
      }

      yield {
        type: "completed",
        modelId,
        finishReason
      };
    } catch (err: unknown) {
      if (signal?.aborted) {
        yield { type: "completed", modelId, finishReason: "cancelled" };
        return;
      }
      yield {
        type: "error",
        modelId,
        category: "interrupted_stream",
        message: "Error reading stream from provider: " + (err instanceof Error ? err.message : String(err)),
        fatal: true,
        rawError: err
      };
      yield { type: "completed", modelId, finishReason: "error" };
    }
  }
}
