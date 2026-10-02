import { describe, it, expect } from "vitest";
import {
  type ModelProviderAdapter,
  type ProviderEvent,
  type SyntheticScenario,
  ToolCallStreamAssembler
} from "../src/index.js";

export function runProviderContractTestSuite(
  suiteName: string,
  createAdapter: (scenario?: SyntheticScenario) => ModelProviderAdapter
): void {
  describe(`Provider Contract Suite: ${suiteName}`, () => {
    it("1. Health: returns structured provider health", async () => {
      const adapter = createAdapter("normal_text");
      const health = await adapter.checkHealth();
      expect(typeof health.reachable).toBe("boolean");
      if (health.reachable) {
        expect(typeof health.latencyMs).toBe("number");
      }
    });

    it("2. Model discovery: returns list of discovered models", async () => {
      const adapter = createAdapter("normal_text");
      const models = await adapter.discoverModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]?.modelId).toBeDefined();
      expect(models[0]?.name).toBeDefined();
    });

    it("3. Streamed text, model ID preservation, and event ordering", async () => {
      const adapter = createAdapter("normal_text");
      const requestedModel = "synthetic-model-v1";
      const events: ProviderEvent[] = [];

      for await (const event of adapter.streamChat({
        modelId: requestedModel,
        messages: [{ role: "user", content: "Hello" }]
      })) {
        events.push(event);
        expect(event.modelId).toBe(requestedModel);
      }

      expect(events.length).toBeGreaterThanOrEqual(3);

      // Event ordering: text deltas first, then usage, then completed
      const textEvents = events.filter((e) => e.type === "text_delta");
      expect(textEvents.length).toBeGreaterThan(0);
      const combinedText = textEvents
        .map((e) => (e.type === "text_delta" ? e.delta : ""))
        .join("");
      expect(combinedText).toContain("deterministic test provider");

      const usageEvent = events.find((e) => e.type === "usage");
      expect(usageEvent).toBeDefined();

      const lastEvent = events[events.length - 1];
      expect(lastEvent?.type).toBe("completed");
      if (lastEvent?.type === "completed") {
        expect(lastEvent.finishReason).toBe("stop");
      }
    });

    it("4. Tool-call correlation and safe tool argument assembly", async () => {
      const adapter = createAdapter("valid_tool_call");
      const requestedModel = "synthetic-model-v1";
      const assembler = new ToolCallStreamAssembler(adapter.providerId, requestedModel);
      const events: ProviderEvent[] = [];

      for await (const event of adapter.streamChat({
        modelId: requestedModel,
        messages: [{ role: "user", content: "Write a summary" }],
        tools: [
          {
            name: "write_file",
            description: "Write content to a file",
            parameters: {
              type: "object",
              properties: {
                path: { type: "string" },
                content: { type: "string" }
              },
              required: ["path", "content"]
            }
          }
        ]
      })) {
        events.push(event);

        if (event.type === "tool_call_start") {
          assembler.startToolCall(event.toolCallId, event.toolName);
        } else if (event.type === "tool_call_delta") {
          assembler.appendDelta(event.toolCallId, event.argumentsDelta);
        }
      }

      // Verify complete tool call was assembled cleanly
      const completedCall = assembler.finalizeToolCall("call_synth_001");
      expect(completedCall.toolCallId).toBe("call_synth_001");
      expect(completedCall.toolName).toBe("write_file");
      expect(completedCall.arguments).toEqual({
        path: "docs/SUMMARY.md",
        content: "hello world"
      });

      const completedEvent = events.find((e) => e.type === "completed");
      expect(completedEvent).toBeDefined();
      if (completedEvent?.type === "completed") {
        expect(completedEvent.finishReason).toBe("tool_calls");
      }
    });

    it("5. Malformed arguments: emits structured error and does not silently repair", async () => {
      const adapter = createAdapter("malformed_tool_args");
      const requestedModel = "synthetic-model-v1";
      const events: ProviderEvent[] = [];

      for await (const event of adapter.streamChat({
        modelId: requestedModel,
        messages: [{ role: "user", content: "Read file" }]
      })) {
        events.push(event);
      }

      const errorEvent = events.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type === "error") {
        expect(errorEvent.category).toBe("malformed_response");
        expect(errorEvent.message).toContain("Malformed JSON");
      }
    });

    it("6. Usage semantics: distinguishes populated usage from missing usage (never fabricates 0)", async () => {
      // Populated usage scenario
      const normalAdapter = createAdapter("normal_text");
      const normalEvents: ProviderEvent[] = [];
      for await (const e of normalAdapter.streamChat({
        modelId: "synthetic-model-v1",
        messages: [{ role: "user", content: "hi" }]
      })) {
        normalEvents.push(e);
      }
      const normalUsage = normalEvents.find((e) => e.type === "usage");
      expect(normalUsage).toBeDefined();
      if (normalUsage?.type === "usage") {
        expect(normalUsage.promptTokens).toBe(12);
        expect(normalUsage.completionTokens).toBe(8);
      }

      // Missing usage scenario: MUST return null, never fabricate 0
      const missingAdapter = createAdapter("missing_usage");
      const missingEvents: ProviderEvent[] = [];
      for await (const e of missingAdapter.streamChat({
        modelId: "synthetic-model-v1",
        messages: [{ role: "user", content: "hi" }]
      })) {
        missingEvents.push(e);
      }
      const missingUsage = missingEvents.find((e) => e.type === "usage");
      expect(missingUsage).toBeDefined();
      if (missingUsage?.type === "usage") {
        expect(missingUsage.promptTokens).toBeNull();
        expect(missingUsage.completionTokens).toBeNull();
        expect(missingUsage.totalTokens).toBeNull();
      }
    });

    it("7. Cancellation: honors AbortSignal and does not report successful completion", async () => {
      const adapter = createAdapter("normal_text");
      const controller = new AbortController();
      controller.abort(); // Cancel before start

      const events: ProviderEvent[] = [];
      for await (const e of adapter.streamChat(
        {
          modelId: "synthetic-model-v1",
          messages: [{ role: "user", content: "cancel test" }]
        },
        { signal: controller.signal }
      )) {
        events.push(e);
      }

      const completed = events.find((e) => e.type === "completed");
      expect(completed).toBeDefined();
      if (completed?.type === "completed") {
        expect(completed.finishReason).toBe("cancelled");
        expect(completed.finishReason).not.toBe("stop");
      }
    });

    it("8. Timeout classification: categorizes timeout explicitly without hiding failure", async () => {
      const adapter = createAdapter("timeout");
      const events: ProviderEvent[] = [];

      for await (const e of adapter.streamChat({
        modelId: "synthetic-model-v1",
        messages: [{ role: "user", content: "timeout test" }]
      })) {
        events.push(e);
      }

      const errorEvent = events.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type === "error") {
        expect(errorEvent.category).toBe("timeout");
      }
    });

    it("9. Unsupported capability: rejects unsupported tool call turns cleanly", async () => {
      const adapter = createAdapter("unsupported_capability");
      const caps = await adapter.getCapabilities("synthetic-model-limited");
      expect(caps.toolCalling).toBe("unsupported");

      const events: ProviderEvent[] = [];
      for await (const e of adapter.streamChat({
        modelId: "synthetic-model-limited",
        messages: [{ role: "user", content: "do tool call" }],
        tools: [
          {
            name: "tool_1",
            description: "test",
            parameters: { type: "object", properties: {} }
          }
        ]
      })) {
        events.push(e);
      }

      const errorEvent = events.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type === "error") {
        expect(errorEvent.category).toBe("unsupported_capability");
      }
    });

    it("10. Interrupted stream: classifies unexpected stream cut-off without claiming completion", async () => {
      const adapter = createAdapter("interrupted_stream");
      const events: ProviderEvent[] = [];

      for await (const e of adapter.streamChat({
        modelId: "synthetic-model-v1",
        messages: [{ role: "user", content: "interrupt test" }]
      })) {
        events.push(e);
      }

      const errorEvent = events.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type === "error") {
        expect(errorEvent.category).toBe("interrupted_stream");
      }

      // No successful completed event should be emitted
      const completed = events.find((e) => e.type === "completed" && e.finishReason === "stop");
      expect(completed).toBeUndefined();
    });

    it("11. Capability model: distinguishes verified vs unknown model capabilities and limits", async () => {
      const adapter = createAdapter("normal_text");

      // Known model
      const knownCaps = await adapter.getCapabilities("synthetic-model-v1");
      expect(knownCaps.streaming).toBe("supported");
      expect(knownCaps.toolCalling).toBe("supported");
      expect(knownCaps.limits.contextLimit).toBe(8192);

      // Unknown model: must remain unknown, limits null
      const unknownCaps = await adapter.getCapabilities("unknown-model");
      expect(unknownCaps.streaming).toBe("unknown");
      expect(unknownCaps.toolCalling).toBe("unknown");
      expect(unknownCaps.limits.contextLimit).toBeNull();
    });
  });
}
