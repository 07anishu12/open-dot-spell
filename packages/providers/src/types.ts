export type CapabilitySupport = "supported" | "unsupported" | "unknown";

export interface ModelLimits {
  readonly contextLimit: number | null; // null if unknown
  readonly outputLimit: number | null; // null if unknown
  readonly requestTimeoutMs: number | null;
}

export interface ObservedModelCapabilities {
  readonly providerId: string;
  readonly modelId: string;
  readonly runtimeVersion: string | null;
  readonly probeDate: string; // ISO string
  readonly limits: ModelLimits;
  readonly streaming: CapabilitySupport;
  readonly toolCalling: CapabilitySupport;
  readonly structuredOutput: CapabilitySupport;
  readonly vision: CapabilitySupport;
  readonly embeddings: CapabilitySupport;
  readonly imageGeneration: CapabilitySupport;
}

export interface ProviderHealth {
  readonly reachable: boolean;
  readonly latencyMs: number | null;
  readonly error?: string;
}

export interface DiscoveredModel {
  readonly modelId: string;
  readonly name: string;
  readonly description?: string;
  readonly sizeBytes?: number;
  readonly modifiedAt?: string;
}

export interface ProviderMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly toolCallId?: string; // Correlates tool response with tool call
  readonly name?: string;
}

export interface ProviderToolParameterSchema {
  readonly type: "object";
  readonly properties: Record<string, unknown>;
  readonly required?: string[];
  readonly additionalProperties?: boolean;
}

export interface ProviderToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: ProviderToolParameterSchema;
}

export interface ProviderChatRequest {
  readonly modelId: string;
  readonly messages: ProviderMessage[];
  readonly tools?: ProviderToolDefinition[];
  readonly temperature?: number;
  readonly maxTokens?: number;
}

export interface StreamChatOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export type ProviderErrorCategory =
  | "authentication_failure"
  | "connection_failure"
  | "timeout"
  | "cancellation"
  | "unsupported_capability"
  | "malformed_response"
  | "interrupted_stream"
  | "rate_limit"
  | "provider_error";

export type ProviderEvent =
  | {
      readonly type: "text_delta";
      readonly modelId: string;
      readonly delta: string;
    }
  | {
      readonly type: "tool_call_start";
      readonly modelId: string;
      readonly toolCallId: string;
      readonly toolName: string;
    }
  | {
      readonly type: "tool_call_delta";
      readonly modelId: string;
      readonly toolCallId: string;
      readonly argumentsDelta: string;
    }
  | {
      readonly type: "tool_call_complete";
      readonly modelId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly arguments: Record<string, unknown>;
      readonly rawArguments: string;
    }
  | {
      readonly type: "usage";
      readonly modelId: string;
      readonly promptTokens: number | null;
      readonly completionTokens: number | null;
      readonly totalTokens: number | null;
    }
  | {
      readonly type: "completed";
      readonly modelId: string;
      readonly finishReason: "stop" | "tool_calls" | "length" | "cancelled" | "error";
    }
  | {
      readonly type: "error";
      readonly modelId: string;
      readonly category: ProviderErrorCategory;
      readonly message: string;
      readonly fatal: boolean;
      readonly rawError?: unknown;
    };

export interface ModelProviderAdapter {
  readonly providerId: string;
  readonly providerType: string;
  readonly isLocal: boolean;

  checkHealth(): Promise<ProviderHealth>;
  discoverModels(): Promise<DiscoveredModel[]>;
  getCapabilities(modelId: string): Promise<ObservedModelCapabilities>;
  streamChat(request: ProviderChatRequest, options?: StreamChatOptions): AsyncIterable<ProviderEvent>;
}
