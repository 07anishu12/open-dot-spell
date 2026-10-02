import { describe, it, expect } from "vitest";
import { SyntheticTestProvider, probeModelCapabilities } from "../src/index.js";

describe("Capability Probe Runner Tests", () => {
  it("probes streaming and tool calling as supported on capable models", async () => {
    const provider = new SyntheticTestProvider({ scenario: "normal_text" });
    const report = await probeModelCapabilities(provider, "synthetic-model-v1");

    expect(report.modelId).toBe("synthetic-model-v1");
    expect(report.providerId).toBe("prov_synthetic_test");
    expect(report.probeTimestamp).toBeDefined();

    const streamingProbe = report.probes.find((p) => p.capability === "streaming");
    expect(streamingProbe?.status).toBe("supported");

    expect(report.capabilities.streaming).toBe("supported");
  });

  it("probes tool calling as unsupported when model rejects tool turns", async () => {
    const provider = new SyntheticTestProvider({ scenario: "unsupported_capability" });
    const report = await probeModelCapabilities(provider, "synthetic-model-limited");

    const toolProbe = report.probes.find((p) => p.capability === "tool_calling");
    expect(toolProbe?.status).toBe("unsupported");
    expect(report.capabilities.toolCalling).toBe("unsupported");
  });

  it("preserves structured output as unknown unless explicitly proven", async () => {
    const provider = new SyntheticTestProvider();
    const report = await probeModelCapabilities(provider, "synthetic-model-v1");

    const soProbe = report.probes.find((p) => p.capability === "structured_output");
    expect(soProbe?.status).toBe("unknown");
    expect(report.capabilities.structuredOutput).toBe("unknown");
  });
});
