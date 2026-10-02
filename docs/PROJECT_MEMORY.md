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
Step: 03
Behavior delivered: Architecture, security, state, contracts, and failure model
Files changed: docs/ARCHITECTURE.md, docs/SECURITY.md, docs/decisions/0001-sqlite-as-initial-persistence.md, docs/decisions/0002-separate-worker-process.md, docs/decisions/0003-local-inference-as-default.md, docs/decisions/0004-server-side-tool-policy.md, docs/decisions/0005-isolated-code-execution.md, docs/PROJECT_MEMORY.md, docs/PROGRESS.md
Verification: Documentation consistency review. Cross-checked ARCHITECTURE.md, SECURITY.md, and ADRs against PRD.md, REFERENCE_MAP.md, and PROJECT_MEMORY.md. Verified explicit trust boundaries, at-least-once task execution, cryptographic approval fingerprinting, state machine completeness, and no speculative microservice infrastructure. No application code was implemented.
Known limitations: docs/BUILD_GUIDE.md and AGENTS.md remain absent; no application scaffold, package manifest, or lockfile exists; pnpm is unavailable; Ollama and Docker local services were not running; all contracts and state machines remain design specifications pending future implementation steps.
Next step: Step 04
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

Future decisions should include the date, the concrete decision, its evidence or rationale, and its current status. Update this memory after each numbered step with only behavior that has actually been verified.
