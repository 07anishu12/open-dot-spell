export type ProviderEventType =
  | "text_delta"
  | "tool_call_start"
  | "tool_call_chunk"
  | "tool_call_complete"
  | "usage"
  | "completed"
  | "error";

export type ProviderEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call_start"; toolCallId: string; toolName: string }
  | { type: "tool_call_chunk"; toolCallId: string; argumentsDelta: string }
  | { type: "tool_call_complete"; toolCallId: string; toolName: string; arguments: Record<string, unknown> }
  | { type: "usage"; promptTokens: number; completionTokens: number }
  | { type: "completed"; finishReason: "stop" | "tool_calls" | "length" | "error" }
  | { type: "error"; code: string; message: string; fatal: boolean };

export interface ModelCapability {
  supportsTools: boolean;
  supportsJsonSchema: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  contextLimit: number;
}

export interface ModelProviderAdapter {
  readonly providerId: string;
  readonly providerType: "ollama" | "custom_remote";
  readonly isLocal: boolean;
  getCapabilities(modelName: string): Promise<ModelCapability>;
  testConnection(): Promise<{ reachable: boolean; latencyMs: number }>;
}

export class OllamaProviderStub implements ModelProviderAdapter {
  readonly providerId = "prov_ollama_local";
  readonly providerType = "ollama" as const;
  readonly isLocal = true;

  constructor(private readonly baseUrl: string = "http://127.0.0.1:11434") {}

  async getCapabilities(_modelName: string): Promise<ModelCapability> {
    return {
      supportsTools: true,
      supportsJsonSchema: true,
      supportsVision: false,
      supportsStreaming: true,
      contextLimit: 8192
    };
  }

  async testConnection(): Promise<{ reachable: boolean; latencyMs: number }> {
    return { reachable: false, latencyMs: 0 };
  }
}
