export * from "./types.js";
export * from "./errors.js";
export * from "./assembler.js";
export * from "./synthetic.js";

import {
  type ModelProviderAdapter,
  type ObservedModelCapabilities,
  type ProviderHealth,
  type DiscoveredModel,
  type ProviderChatRequest,
  type StreamChatOptions,
  type ProviderEvent
} from "./types.js";

// Backward-compatibility alias
export type ModelCapability = ObservedModelCapabilities;

export class OllamaProviderStub implements ModelProviderAdapter {
  readonly providerId = "prov_ollama_local";
  readonly providerType = "ollama" as const;
  readonly isLocal = true;

  constructor(public readonly baseUrl: string = "http://127.0.0.1:11434") {}

  async checkHealth(): Promise<ProviderHealth> {
    return { reachable: false, latencyMs: null, error: "Ollama service not reached (stub)" };
  }

  async testConnection(): Promise<{ reachable: boolean; latencyMs: number }> {
    return { reachable: false, latencyMs: 0 };
  }

  async discoverModels(): Promise<DiscoveredModel[]> {
    return [];
  }

  async getCapabilities(modelId: string): Promise<ObservedModelCapabilities> {
    return {
      providerId: this.providerId,
      modelId,
      runtimeVersion: null,
      probeDate: "2026-10-03T00:00:00.000Z",
      limits: {
        contextLimit: 8192,
        outputLimit: 2048,
        requestTimeoutMs: 30000
      },
      streaming: "supported",
      toolCalling: "supported",
      structuredOutput: "supported",
      vision: "unknown",
      embeddings: "unknown",
      imageGeneration: "unsupported"
    };
  }

  async *streamChat(
    request: ProviderChatRequest,
    _options?: StreamChatOptions
  ): AsyncIterable<ProviderEvent> {
    yield {
      type: "error",
      modelId: request.modelId,
      category: "connection_failure",
      message: "Ollama local service is not reachable. Live connection deferred to Step 08.",
      fatal: true
    };
    yield {
      type: "completed",
      modelId: request.modelId,
      finishReason: "error"
    };
  }
}
