import { describe, it, expect } from "vitest";
import {
  SyntheticTestProvider,
  OllamaProviderStub,
  ToolCallStreamAssembler,
  ProviderError,
  type SyntheticScenario
} from "../src/index.js";
import { runProviderContractTestSuite } from "./contract-suite.js";

// 1. Run the reusable contract test suite against the SyntheticTestProvider
runProviderContractTestSuite("SyntheticTestProvider", (scenario?: SyntheticScenario) => {
  return new SyntheticTestProvider({ scenario });
});

describe("ToolCallStreamAssembler Unit Tests", () => {
  it("assembles incremental tool argument deltas into a validated object", () => {
    const assembler = new ToolCallStreamAssembler("test_prov", "test_model");
    assembler.startToolCall("call_1", "create_artifact");
    expect(assembler.hasPendingToolCall()).toBe(true);

    assembler.appendDelta("call_1", '{"name":');
    assembler.appendDelta("call_1", '"PRD.md",');
    assembler.appendDelta("call_1", '"content":"# PRD"}');

    const result = assembler.finalizeToolCall("call_1");
    expect(assembler.hasPendingToolCall()).toBe(false);
    expect(result.toolCallId).toBe("call_1");
    expect(result.toolName).toBe("create_artifact");
    expect(result.arguments).toEqual({
      name: "PRD.md",
      content: "# PRD"
    });
  });

  it("handles empty argument string as empty object {}", () => {
    const assembler = new ToolCallStreamAssembler("test_prov", "test_model");
    assembler.startToolCall("call_2", "list_files");
    const result = assembler.finalizeToolCall("call_2");
    expect(result.arguments).toEqual({});
  });

  it("throws ProviderError with malformed_response on invalid JSON syntax", () => {
    const assembler = new ToolCallStreamAssembler("test_prov", "test_model");
    assembler.startToolCall("call_3", "edit_file");
    assembler.appendDelta("call_3", '{broken json syntax: 123');

    expect(() => assembler.finalizeToolCall("call_3")).toThrowError(ProviderError);
    try {
      assembler.finalizeToolCall("call_3");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).category).toBe("malformed_response");
    }
  });

  it("assertStreamComplete detects stream cut-off during pending tool call", () => {
    const assembler = new ToolCallStreamAssembler("test_prov", "test_model");
    assembler.startToolCall("call_4", "fetch_url");
    assembler.appendDelta("call_4", '{"url":"https://example.com"');

    expect(() => assembler.assertStreamComplete()).toThrowError(ProviderError);
    try {
      assembler.assertStreamComplete();
    } catch (err) {
      expect((err as ProviderError).category).toBe("interrupted_stream");
    }
  });

  it("rejects delta with mismatched toolCallId", () => {
    const assembler = new ToolCallStreamAssembler("test_prov", "test_model");
    assembler.startToolCall("call_5", "test_tool");

    expect(() => assembler.appendDelta("call_wrong", "{}")).toThrowError(ProviderError);
  });
});

describe("ProviderError Credential Redaction", () => {
  it("scrubs Bearer tokens and sensitive keywords from provider error messages", () => {
    const err = new ProviderError({
      message: "Failed connecting with Bearer sk-secret-token-1234567890",
      category: "authentication_failure",
      providerId: "openai",
      modelId: "gpt-4o"
    });

    expect(err.message).not.toContain("sk-secret-token-1234567890");
    expect(err.message).toContain("Bearer [REDACTED]");
    expect(err.category).toBe("authentication_failure");
  });
});

describe("OllamaProviderStub contract check", () => {
  it("provides capabilities and implements ModelProviderAdapter without live service", async () => {
    const stub = new OllamaProviderStub();
    expect(stub.isLocal).toBe(true);
    expect(stub.providerType).toBe("ollama");

    const health = await stub.checkHealth();
    expect(health.reachable).toBe(false);

    const caps = await stub.getCapabilities("llama3");
    expect(caps.streaming).toBe("supported");
    expect(caps.toolCalling).toBe("supported");
    expect(caps.limits.contextLimit).toBe(8192);

    const events = [];
    for await (const ev of stub.streamChat({
      modelId: "llama3",
      messages: [{ role: "user", content: "test" }]
    })) {
      events.push(ev);
    }
    const firstEvent = events[0];
    expect(firstEvent?.type).toBe("error");
    if (firstEvent?.type === "error") {
      expect(firstEvent.category).toBe("connection_failure");
    }
  });
});
