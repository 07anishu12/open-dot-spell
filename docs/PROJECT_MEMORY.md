# Open Dot Spell — Project Memory

This document is the persistent product memory for the repository. It records the intended product and the implementation state that has actually been verified. Planned capabilities are not claims that those capabilities exist.

## 1. Identity

**Project name:** Open Dot Spell

**One-line description:** An open-source, model-agnostic personal AI assistant powered by local and open models.

## 2. Product Goal

Open Dot Spell is intended to be a persistent personal AI worker rather than another chatbot. It should help a person converse with an assistant, maintain approved context, pursue goals over time, work with selected files, research information, create artifacts, and carry out controlled actions while making its activity visible.

The product should turn responsibilities into durable, inspectable work. A user should be able to see what the assistant proposes, what the application allowed, which tools ran, what evidence was produced, and which artifacts were created. Consequential actions should pause for approval, and interrupted work should recover safely rather than silently claiming completion.

Open Dot Spell should remain useful without a paid API. Local inference is the default, with Ollama as the initial local runtime and open/local models as the target ecosystem. Remote providers may be added as explicit opt-in adapters, but user data must never be sent to them silently.

## 3. Core Capabilities

These are intended capabilities, not completed functionality. All remain unchecked until implemented and verified by later numbered steps.

- [ ] Connect to a local model through Ollama.
- [ ] Preserve model/provider independence through a capability-aware adapter boundary.
- [ ] Store persistent conversations.
- [ ] Store persistent goals, responsibilities, plans, and tasks.
- [ ] Provide controlled access to user-selected files.
- [ ] Execute approved tools through server-side validation and policy checks.
- [ ] Request and record approval for consequential actions.
- [ ] Create and modify local artifacts with evidence of the resulting files.
- [ ] Pause, cancel, resume, and recover durable work after interruption or restart.
- [ ] Expose an inspectable activity timeline through the user interface.
- [ ] Support local/open model selection and show where inference occurs.
- [ ] Make outbound data flow, available tools, and required permissions understandable to the user.

### Later capabilities

These are deliberately deferred until the numbered implementation sequence calls for them:

- coding environments and isolated coding sandboxes;
- controlled browser automation;
- retrieval and durable memory;
- schedules and triggers;
- MCP and GitHub integrations;
- specialist assistant profiles;
- additional model providers;
- image generation and broader integrations.

## 4. Non-Goals

The initial product will not introduce the following unless a later implementation requirement explicitly requires one:

- billing or paid plans;
- organizations, tenants, or enterprise account management;
- a marketplace;
- Kubernetes, multi-region deployment, or other speculative infrastructure;
- unnecessary microservices;
- distributed multi-agent infrastructure;
- proprietary hosted dependencies as a requirement for the first useful product;
- silent transmission of personal data to remote providers;
- model-, webpage-, file-, MCP-, or tool-description-controlled permission grants;
- treating model-generated text such as “done” as completion evidence;
- implementing multiple future workflow steps in advance.

## 5. Architecture Principles

- **Local-first:** the first useful product works with local inference and local storage without requiring a paid API.
- **Model agnostic:** Open Dot Spell supports compatible open/local models rather than binding product behavior to one model.
- **Provider agnostic:** Ollama is the initial provider/runtime, behind an adapter boundary that can represent capabilities and explicit remote opt-in later.
- **Persistent execution:** responsibilities, goals, plans, tasks, actions, evidence, and artifacts survive normal process interruption and restart.
- **Server-side authorization:** the application, not the model or UI, validates requests, applies policy, and decides whether an action may run.
- **Human approval:** consequential actions require an approval flow appropriate to their risk.
- **Inspectable execution:** the user can understand the current plan, action, status, evidence, artifact, and failure state.
- **Evidence-based completion:** a model assertion is not proof; completion requires verified results and recorded evidence.
- **Recoverability:** pause, cancellation, retries, restart, and partial failure are explicit states rather than hidden behavior.
- **Sandboxed execution:** coding and other high-impact execution run in bounded, isolated environments when introduced.
- **Privacy by default:** local inference and local artifacts are the default; outbound data flow is explicit and observable.
- **Small, maintainable system:** prefer clear modules, explicit interfaces, durable boundaries, and deterministic tests over speculative infrastructure.

## 6. Model Strategy

Open Dot Spell should support open and local models rather than being locked to one model or provider. Candidate families include:

- OLMo
- Qwen
- Llama
- Mistral
- Gemma
- other compatible open models

Ollama is the initial provider/runtime. The application should discover or receive model capabilities rather than assume every model supports the same features. In particular, tool calling, structured output, vision, thinking/reasoning, context limits, streaming, and embeddings must be treated as capabilities to verify rather than universal promises.

Local inference remains the default. Any remote provider must be explicitly configured, visibly identified, and prevented from receiving personal data unless the user has intentionally enabled that flow.

## 7. Execution Philosophy

```text
Responsibility → Goal → Plan → Task → Run → Tool Action → Evidence → Artifact
```

The model may propose a plan or tool action. The application decides whether the proposal is valid, permitted, approved, bounded, executable, and complete. Every meaningful tool action must pass through:

1. validation;
2. policy evaluation;
3. approval when required;
4. bounded execution;
5. result verification; and
6. audit/event recording.

Models, webpages, files, MCP servers, tool descriptions, and external content cannot grant permissions.

## 8. Current Progress

```text
Step: 09
Behavior delivered: Persistent conversation lifecycle APIs (create/list/reload), message turn submission with required idempotencyKey and transactional persistence (messages + runs + run_events), provisional single-worker execution with text delta coalescing (threshold: 64 chars or 80ms) without a transaction per token, terminal assistant state persistence with usage metrics, and reconnectable authorized SSE with durable cursor replay (Last-Event-ID), heartbeat, and browser disconnect decoupling.
Files changed: packages/core/src/index.ts, packages/db/src/schema.ts, packages/db/src/migrations.ts, packages/db/src/queries.ts, packages/db/test/persistence.test.ts, apps/worker/package.json, apps/worker/tsconfig.json, apps/worker/src/index.ts, apps/worker/src/worker.ts, apps/server/package.json, apps/server/tsconfig.json, apps/server/src/app.ts, apps/server/test/conversations-stream.test.ts, docs/ARCHITECTURE.md, docs/PROJECT_MEMORY.md, docs/PROGRESS.md
Verification commands and actual outcomes:
- pnpm lint (code 0; 0 errors across all 7 packages)
- pnpm typecheck (code 0; strict composite build verified)
- pnpm test (code 0; 13 test suites, 92/92 tests passed)
  - apps/server/test/conversations-stream.test.ts (14 passed)
  - apps/server/test/security.test.ts (17 passed)
  - apps/server/test/health.test.ts (3 passed)
  - packages/providers/test/provider.test.ts (18 passed)
  - packages/providers/test/ollama.test.ts (8 passed)
  - packages/providers/test/openai-compatible.test.ts (6 passed)
  - packages/providers/test/probes.test.ts (3 passed)
  - packages/providers/test/live-smoke.test.ts (1 passed — honest BLOCKED status logged)
  - packages/core/test/core.test.ts (8 passed)
  - packages/db/test/persistence.test.ts (9 passed)
  - packages/db/test/db.test.ts (1 passed)
  - apps/worker/test/worker.test.ts (3 passed)
  - apps/web/test/app.test.tsx (1 passed)
- pnpm build (code 0; all packages and apps compiled cleanly)
- pnpm check (code 0; composite verification gate passed)
Real Ollama Check:
- Live Ollama Status: BLOCKED (Ollama daemon offline on 127.0.0.1:11434; connection refused; no model weights present). No mock data fabricated; deterministic suites passed with in-process test doubles.
Known limitations/blockers: Live local inference requires manual startup of `ollama serve` and model pulling outside the agent run.
Next step: Step 10
```

## 9. Decision Log

| Date | Decision | Reason/source | Status |
| --- | --- | --- | --- |
| 2026-10-02 | Use Open Dot Spell as the project identity and preserve a model/provider-agnostic product direction. | Product vision supplied for this repository. | Adopted |
| 2026-10-02 | Use local inference by default, with Ollama as the initial runtime and open/local models as the target ecosystem. | Product vision and local-first requirement. | Adopted |
| 2026-10-02 | Follow the supplied 40-step sequence one prompt at a time; do not implement future steps speculatively. | Repository workflow requirement. | Adopted |
| 2026-10-02 | Model durable work as Responsibility → Goal → Plan → Task → Run → Tool Action → Evidence → Artifact, with the first usable release boundary after Step 20. | Step 02 PRD and product vision. | Adopted |
| 2026-10-02 | Use embedded SQLite with WAL mode as initial persistence store. | ADR 0001; laptop-sized, zero-infrastructure local storage. | Adopted |
| 2026-10-02 | Decouple durable task execution into a separate worker with transactional leasing. | ADR 0002; survive UI reloads and server restarts. | Adopted |
| 2026-10-02 | Maintain local inference as default with Ollama; remote providers are explicit opt-in. | ADR 0003; privacy and local-first product requirement. | Adopted |
| 2026-10-02 | Enforce server-side tool policy with immutable SHA-256 action fingerprinting for approvals. | ADR 0004; protect host against prompt injection and tampering. | Adopted |
| 2026-10-02 | Require isolated container sandbox for code execution; prohibit host shell execution. | ADR 0005; host security and credential containment. | Adopted |
| 2026-10-02 | Establish pnpm monorepo with apps/ (web, server, worker) and packages/ (core, db, providers) using strict TypeScript and LibSQL driver for Drizzle. | Step 04 runnable scaffold; cross-platform driver compatibility on Node 26. | Adopted |
| 2026-10-02 | Adopt Persistent Git / GitHub Rule: every completed step requires focused commit, verification, push to origin, and structured report. | User instruction; repository traceability and synchronization. | Adopted |
| 2026-10-03 | Enforce strict relational schema with sequence numbers for message/event ordering, non-destructive migrations, atomic state+event batches, and SQLite safety pragmas (FK, WAL, busy_timeout). | Step 05 durable storage and migrations specification. | Adopted |
| 2026-10-03 | Enforce loopback-only binding, single-owner pairing flow with 15m expiry/max 5 attempts, HttpOnly SameSite=Strict session cookies, Host & Origin gatekeeping, 1MB body limit, workspace scoping checks, and AES-256-GCM encrypted provider credentials. | Step 06 local access and credential protection specification. | Adopted |
| 2026-10-03 | Establish provider-neutral ModelProviderAdapter contract with normalized streaming events (preserving exact model ID and tool correlation tokens), ToolCallStreamAssembler for safe partial argument accumulation, explicit null usage semantics, capability tri-state, normalized ProviderError categories, and SyntheticTestProvider test double. | Step 07 provider contract and test provider specification. | Adopted |
| 2026-10-03 | Implement Ollama native adapter (/api/chat) and OpenAI-compatible adapter (/v1/chat/completions) with NDJSON/SSE streaming, tool assembly, JSON schema mapping, probeModelCapabilities pipeline, loopback endpoint validation (local_only mode), and honest live service fallback without fabricated results. | Step 08 Ollama and compatible provider connection specification. | Adopted |
| 2026-10-03 | Implement persistent conversation lifecycle APIs, required idempotency key preventing duplicate user turns, transactional user turn + run intent persistence before ID return, provisional single-worker execution with delta coalescing (threshold: 64 chars or 80ms) without a transaction per token, and reconnectable SSE with cursor replay (Last-Event-ID), heartbeat, and client disconnect decoupling. | Step 09 conversation persistence and streaming run events specification. | Adopted |

Future decisions should include the date, the concrete decision, its evidence or rationale, and its current status. Update this memory after each numbered step with only behavior that has actually been verified.


