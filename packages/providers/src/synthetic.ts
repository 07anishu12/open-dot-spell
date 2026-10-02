import {
  type ModelProviderAdapter,
  type ProviderChatRequest,
  type StreamChatOptions,
  type ProviderEvent,
  type ProviderHealth,
  type DiscoveredModel,
  type ObservedModelCapabilities
} from "./types.js";

export type SyntheticScenario =
  | "normal_text"
  | "valid_tool_call"
  | "malformed_tool_args"
  | "interrupted_stream"
  | "timeout"
  | "cancellation"
  | "missing_usage"
  | "unsupported_capability";

export interface SyntheticTestProviderOptions {
  scenario?: SyntheticScenario;
  healthy?: boolean;
  modelId?: string;
  simulatedDelayMs?: number;
}

/**
 * Synthetic Test Provider
 *
 * Deterministic test double implementing the ModelProviderAdapter contract.
 * Explicitly labeled as a test fixture: this is NOT a real AI model, NOT a production
 * default, and must never be used to fabricate model performance metrics.
 */
export class SyntheticTestProvider implements ModelProviderAdapter {
  public readonly providerId = "prov_synthetic_test";
  public readonly providerType = "synthetic_test";
  public readonly isLocal = true;

  private currentScenario: SyntheticScenario;
  private isHealthy: boolean;
  private defaultModelId: string;
  private simulatedDelayMs: number;

  constructor(options: SyntheticTestProviderOptions = {}) {
    this.currentScenario = options.scenario ?? "normal_text";
    this.isHealthy = options.healthy ?? true;
    this.defaultModelId = options.modelId ?? "synthetic-model-v1";
    this.simulatedDelayMs = options.simulatedDelayMs ?? 1;
  }

  public setScenario(scenario: SyntheticScenario): void {
    this.currentScenario = scenario;
  }

  public setHealthy(healthy: boolean): void {
    this.isHealthy = healthy;
  }

  public async checkHealth(): Promise<ProviderHealth> {
    if (!this.isHealthy) {
      return {
        reachable: false,
        latencyMs: null,
        error: "Synthetic test provider is configured as unreachable"
      };
    }
    return {
      reachable: true,
      latencyMs: 1
    };
  }

  public async discoverModels(): Promise<DiscoveredModel[]> {
    return [
      {
        modelId: "synthetic-model-v1",
        name: "Synthetic Test Model (Standard)",
        description: "Deterministic test model for unit and contract testing"
      },
      {
        modelId: "synthetic-model-limited",
        name: "Synthetic Test Model (No Tools)",
        description: "Deterministic test model without tool calling capability"
      }
    ];
  }

  public async getCapabilities(modelId: string): Promise<ObservedModelCapabilities> {
    const isLimited = modelId === "synthetic-model-limited" || this.currentScenario === "unsupported_capability";

    if (isLimited) {
      return {
        providerId: this.providerId,
        modelId,
        runtimeVersion: "1.0.0-synthetic",
        probeDate: "2026-10-03T00:00:00.000Z",
        limits: {
          contextLimit: 4096,
          outputLimit: 1024,
          requestTimeoutMs: 5000
        },
        streaming: "supported",
        toolCalling: "unsupported",
        structuredOutput: "unsupported",
        vision: "unsupported",
        embeddings: "unsupported",
        imageGeneration: "unsupported"
      };
    }

    if (modelId === "unknown-model") {
      return {
        providerId: this.providerId,
        modelId,
        runtimeVersion: null,
        probeDate: "2026-10-03T00:00:00.000Z",
        limits: {
          contextLimit: null,
          outputLimit: null,
          requestTimeoutMs: null
        },
        streaming: "unknown",
        toolCalling: "unknown",
        structuredOutput: "unknown",
        vision: "unknown",
        embeddings: "unknown",
        imageGeneration: "unknown"
      };
    }

    return {
      providerId: this.providerId,
      modelId,
      runtimeVersion: "1.0.0-synthetic",
      probeDate: "2026-10-03T00:00:00.000Z",
      limits: {
        contextLimit: 8192,
        outputLimit: 2048,
        requestTimeoutMs: 10000
      },
      streaming: "supported",
      toolCalling: "supported",
      structuredOutput: "supported",
      vision: "unsupported",
      embeddings: "supported",
      imageGeneration: "unsupported"
    };
  }

  public async *streamChat(
    request: ProviderChatRequest,
    options?: StreamChatOptions
  ): AsyncIterable<ProviderEvent> {
    const modelId = request.modelId || this.defaultModelId;
    const signal = options?.signal;

    // Check cancellation immediately
    if (signal?.aborted) {
      yield {
        type: "error",
        modelId,
        category: "cancellation",
        message: "Request was cancelled prior to execution",
        fatal: true
      };
      yield {
        type: "completed",
        modelId,
        finishReason: "cancelled"
      };
      return;
    }

    // Scenario 8: Unsupported capability
    if (this.currentScenario === "unsupported_capability") {
      if (request.tools && request.tools.length > 0) {
        yield {
          type: "error",
          modelId,
          category: "unsupported_capability",
          message: "Model does not support tool calling",
          fatal: true
        };
        yield {
          type: "completed",
          modelId,
          finishReason: "error"
        };
        return;
      }
    }

    // Scenario 5: Timeout
    if (this.currentScenario === "timeout") {
      // Simulate timeout
      yield {
        type: "error",
        modelId,
        category: "timeout",
        message: "Synthetic stream timed out waiting for provider response",
        fatal: true
      };
      yield {
        type: "completed",
        modelId,
        finishReason: "error"
      };
      return;
    }

    // Scenario 6: Cancellation mid-stream
    if (this.currentScenario === "cancellation") {
      yield {
        type: "text_delta",
        modelId,
        delta: "Starting response before cancellation..."
      };

      // Simulates cancellation
      yield {
        type: "error",
        modelId,
        category: "cancellation",
        message: "Stream was cancelled by client",
        fatal: true
      };
      yield {
        type: "completed",
        modelId,
        finishReason: "cancelled"
      };
      return;
    }

    // Scenario 4: Interrupted stream
    if (this.currentScenario === "interrupted_stream") {
      yield {
        type: "text_delta",
        modelId,
        delta: "Interrupted response"
      };
      yield {
        type: "error",
        modelId,
        category: "interrupted_stream",
        message: "Stream connection terminated unexpectedly by remote runtime",
        fatal: true
      };
      return;
    }

    // Scenario 2: Valid tool call
    if (this.currentScenario === "valid_tool_call") {
      const toolCallId = "call_synth_001";
      const toolName = "write_file";

      yield {
        type: "tool_call_start",
        modelId,
        toolCallId,
        toolName
      };

      const chunks = ['{"path":', '"docs/SUMMARY.md",', '"content":"hello world"}'];
      for (const chunk of chunks) {
        if (signal?.aborted) {
          yield {
            type: "completed",
            modelId,
            finishReason: "cancelled"
          };
          return;
        }
        yield {
          type: "tool_call_delta",
          modelId,
          toolCallId,
          argumentsDelta: chunk
        };
      }

      yield {
        type: "tool_call_complete",
        modelId,
        toolCallId,
        toolName,
        rawArguments: '{"path":"docs/SUMMARY.md","content":"hello world"}',
        arguments: {
          path: "docs/SUMMARY.md",
          content: "hello world"
        }
      };

      yield {
        type: "usage",
        modelId,
        promptTokens: 15,
        completionTokens: 25,
        totalTokens: 40
      };

      yield {
        type: "completed",
        modelId,
        finishReason: "tool_calls"
      };
      return;
    }

    // Scenario 3: Malformed tool arguments
    if (this.currentScenario === "malformed_tool_args") {
      const toolCallId = "call_synth_malformed";
      const toolName = "read_file";

      yield {
        type: "tool_call_start",
        modelId,
        toolCallId,
        toolName
      };

      yield {
        type: "tool_call_delta",
        modelId,
        toolCallId,
        argumentsDelta: '{"unclosed_string: 123'
      };

      yield {
        type: "error",
        modelId,
        category: "malformed_response",
        message: "Malformed JSON in tool call arguments for read_file",
        fatal: true
      };

      yield {
        type: "completed",
        modelId,
        finishReason: "error"
      };
      return;
    }

    // Scenario 7: Missing usage
    if (this.currentScenario === "missing_usage") {
      yield {
        type: "text_delta",
        modelId,
        delta: "Synthetic response without usage telemetry."
      };

      // Must explicitly return null rather than fabricating 0
      yield {
        type: "usage",
        modelId,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null
      };

      yield {
        type: "completed",
        modelId,
        finishReason: "stop"
      };
      return;
    }

    // Default: Scenario 1: Normal text response
    const words = ["Hello", " from", " the", " deterministic", " test", " provider."];
    for (const word of words) {
      if (signal?.aborted) {
        yield {
          type: "completed",
          modelId,
          finishReason: "cancelled"
        };
        return;
      }
      yield {
        type: "text_delta",
        modelId,
        delta: word
      };
    }

    yield {
      type: "usage",
      modelId,
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20
    };

    yield {
      type: "completed",
      modelId,
      finishReason: "stop"
    };
  }
}
