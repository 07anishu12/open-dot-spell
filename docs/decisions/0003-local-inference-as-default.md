# ADR 0003: Local Inference as Default Runtime

## Decision
Design Open Dot Spell to use local inference as the default and primary execution path, with Ollama as the initial supported local runtime. Remote inference providers are strictly opt-in and secondary.

## Context
The core value proposition of Open Dot Spell is providing an open-source personal AI worker under the user's complete control, capable of operating offline or without recurring subscription fees or API costs. Requiring an external commercial API (such as OpenAI, Anthropic, or Google Gemini) for core functionality would compromise user privacy and violate the free/local accessibility requirement.

## Alternatives Considered
1. **Cloud-First / API-First Architecture:** Easier to develop with large frontier models, but compromises data privacy, requires user payment/keys, and fails when offline.
2. **Proprietary Embedded LLM Engine (e.g. custom llama.cpp bindings directly linked in C++):** Fast, but creates heavy native compilation and platform packaging hurdles across diverse desktop hardware compared to standard local runtimes.
3. **Multi-Provider Agnostic without a Default:** Forces the user to configure API keys or complex setups before basic initial chat or file exploration works.

## Consequences
- **Positive:**
  - Complete data privacy by default: No prompt tokens leave the machine.
  - Zero cost for inference: Accessible to anyone with capable consumer hardware.
  - Works offline without an internet connection.
  - Uses Ollama's standardized HTTP API and model management ecosystem.
- **Negative:**
  - Local models have lower context windows, higher latency on modest hardware, and variable tool-calling reliability compared to commercial frontier models.
  - The application must discover model capabilities dynamically rather than assuming frontier model features.

## Revisit Conditions
Revisit provider defaults only if the user explicitly switches the privacy mode to `Hybrid` and configures a remote provider.
