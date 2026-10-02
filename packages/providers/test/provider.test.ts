import { describe, it, expect } from "vitest";
import { OllamaProviderStub } from "../src/index.js";

describe("providers package interfaces and stubs", () => {
  it("initializes Ollama provider stub with local-first defaults", async () => {
    const provider = new OllamaProviderStub();
    expect(provider.isLocal).toBe(true);
    expect(provider.providerType).toBe("ollama");

    const caps = await provider.getCapabilities("gemma2:9b");
    expect(caps.supportsStreaming).toBe(true);
    expect(caps.contextLimit).toBe(8192);
  });
});
