import {
  type ModelProviderAdapter,
  type ObservedModelCapabilities,
  type CapabilitySupport
} from "./types.js";

export interface CapabilityProbeResult {
  readonly modelId: string;
  readonly providerId: string;
  readonly endpointClass: string;
  readonly runtimeVersion: string | null;
  readonly probeTimestamp: string;
  readonly capability: "streaming" | "tool_calling" | "structured_output";
  readonly status: CapabilitySupport;
  readonly failureReason?: string;
  readonly latencyMs?: number;
}

export interface ModelCapabilityReport {
  readonly modelId: string;
  readonly providerId: string;
  readonly probeTimestamp: string;
  readonly probes: CapabilityProbeResult[];
  readonly capabilities: ObservedModelCapabilities;
}

/**
 * Runs deterministic capability probes against a model adapter without modifying
 * or downloading model weights. Unknown results remain strictly "unknown".
 */
export async function probeModelCapabilities(
  adapter: ModelProviderAdapter,
  modelId: string,
  options: { timeoutMs?: number } = {}
): Promise<ModelCapabilityReport> {
  const probeTimestamp = new Date().toISOString();
  const timeoutMs = options.timeoutMs ?? 5000;
  const probes: CapabilityProbeResult[] = [];

  let streamingStatus: CapabilitySupport = "unknown";
  let toolCallingStatus: CapabilitySupport = "unknown";
  let structuredOutputStatus: CapabilitySupport = "unknown";

  // 1. Probe Streaming
  const streamStart = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let chunksCount = 0;
    for await (const event of adapter.streamChat(
      {
        modelId,
        messages: [{ role: "user", content: "ping" }]
      },
      { signal: controller.signal }
    )) {
      if (event.type === "text_delta") {
        chunksCount++;
      }
      if (event.type === "completed") {
        break;
      }
      if (event.type === "error") {
        throw new Error(event.message);
      }
    }
    clearTimeout(timeout);

    streamingStatus = chunksCount > 0 ? "supported" : "unsupported";
    probes.push({
      modelId,
      providerId: adapter.providerId,
      endpointClass: adapter.providerType,
      runtimeVersion: null,
      probeTimestamp,
      capability: "streaming",
      status: streamingStatus,
      latencyMs: Date.now() - streamStart
    });
  } catch (err) {
    streamingStatus = "unsupported";
    probes.push({
      modelId,
      providerId: adapter.providerId,
      endpointClass: adapter.providerType,
      runtimeVersion: null,
      probeTimestamp,
      capability: "streaming",
      status: "unsupported",
      failureReason: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - streamStart
    });
  }

  // 2. Probe Tool Calling
  const toolStart = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let emittedToolCall = false;
    for await (const event of adapter.streamChat(
      {
        modelId,
        messages: [{ role: "user", content: "Probe tool" }],
        tools: [
          {
            name: "probe_tool",
            description: "Probe tool call capability",
            parameters: {
              type: "object",
              properties: { test: { type: "string" } },
              required: ["test"]
            }
          }
        ]
      },
      { signal: controller.signal }
    )) {
      if (event.type === "tool_call_start" || event.type === "tool_call_complete") {
        emittedToolCall = true;
      }
      if (event.type === "error") {
        if (event.category === "unsupported_capability") {
          throw new Error("unsupported_capability: " + event.message);
        }
        throw new Error(event.message);
      }
    }
    clearTimeout(timeout);

    toolCallingStatus = emittedToolCall ? "supported" : "unknown";
    probes.push({
      modelId,
      providerId: adapter.providerId,
      endpointClass: adapter.providerType,
      runtimeVersion: null,
      probeTimestamp,
      capability: "tool_calling",
      status: toolCallingStatus,
      latencyMs: Date.now() - toolStart
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toolCallingStatus = msg.includes("unsupported_capability") ? "unsupported" : "unknown";
    probes.push({
      modelId,
      providerId: adapter.providerId,
      endpointClass: adapter.providerType,
      runtimeVersion: null,
      probeTimestamp,
      capability: "tool_calling",
      status: toolCallingStatus,
      failureReason: msg,
      latencyMs: Date.now() - toolStart
    });
  }

  // 3. Probe Structured Output (Default to unknown unless explicitly verified)
  structuredOutputStatus = "unknown";
  probes.push({
    modelId,
    providerId: adapter.providerId,
    endpointClass: adapter.providerType,
    runtimeVersion: null,
    probeTimestamp,
    capability: "structured_output",
    status: structuredOutputStatus,
    failureReason: "Structured output probe requires active model schema evaluation"
  });

  const capabilities: ObservedModelCapabilities = {
    providerId: adapter.providerId,
    modelId,
    runtimeVersion: null,
    probeDate: probeTimestamp,
    limits: {
      contextLimit: null,
      outputLimit: null,
      requestTimeoutMs: timeoutMs
    },
    streaming: streamingStatus,
    toolCalling: toolCallingStatus,
    structuredOutput: structuredOutputStatus,
    vision: "unknown",
    embeddings: "unknown",
    imageGeneration: "unsupported"
  };

  return {
    modelId,
    providerId: adapter.providerId,
    probeTimestamp,
    probes,
    capabilities
  };
}
