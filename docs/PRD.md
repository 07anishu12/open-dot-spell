# Open Dot Spell Product Requirements Document

**Status:** Product definition for Step 02. This document defines scope and acceptance scenarios; it does not claim that any product capability is implemented.

**Product:** Open Dot Spell  
**Description:** An open-source, model-agnostic personal AI assistant powered by local and open models.

## 1. Product definition and scope

Open Dot Spell is a single-owner, local-first personal AI assistant. It is a persistent AI worker for one person, not a generic chatbot, hosted orchestration service, team product, or autonomous actor with unrestricted access to the user's computer.

The product turns durable responsibilities into inspectable work. It may converse, propose plans, read explicitly permitted data, request approval, invoke bounded tools, create artifacts, and report evidence. The application—not the model—decides what is valid, permitted, approved, executable, and complete.

### In-scope product capabilities

The product scope includes the following capabilities. Release placement and verification status are defined later in this document.

- **Conversational AI:** persistent conversations with streamed responses, model selection, clear provider/runtime identity, and recoverable conversation state.
- **Persistent responsibilities:** ongoing objectives that can produce goals, plans, tasks, and future runs rather than disappearing after one chat turn.
- **Goals and tasks:** durable user-owned goals and bounded tasks with explicit lifecycle state.
- **Local workspace interaction:** access to user-selected files and directories only through an explicit, bounded workspace capability.
- **Controlled tool use:** validated tool requests executed through server-side policy, bounded inputs, bounded resources, and recorded results.
- **Human approval:** explicit approval or rejection for consequential actions, with authority limited to the approved action and scope.
- **Artifact creation:** local, inspectable outputs such as summaries, reports, patches, and generated files, with evidence connecting the artifact to its inputs and actions.
- **Inspectable execution:** a timeline showing proposals, decisions, approvals, runs, tool actions, results, evidence, artifacts, failures, and recovery transitions.
- **Task recovery:** durable state, cancellation, pause, restart recovery, stale-authority invalidation, and safe continuation from eligible checkpoints.
- **Coding assistance:** repository inspection, proposed changes, isolated execution, test runs, patch/diff production, and evidence reporting. Coding execution is never unrestricted host shell access.
- **Controlled browser workflows:** bounded browser interaction in a controlled environment, with explicit navigation/data permissions and evidence of observed results.
- **Memory:** approved information retained according to user-visible scope, provenance, and deletion controls.
- **Retrieval:** search over approved local sources with source/evidence references; retrieval must not silently broaden file permissions.
- **Scheduling:** user-visible scheduled responsibilities and runs with clear enable/disable state and safe restart behavior.
- **Optional integrations:** explicitly configured integrations such as MCP or GitHub when a later step defines their security boundary.
- **Model/provider abstraction:** a capability-aware interface that supports Ollama first and permits other local/open or explicitly configured remote providers without coupling product logic to one model family.

These are product requirements, not statements about the current repository. At this step, no application functionality is implemented.

## 2. Model strategy and conceptual boundaries

Open Dot Spell must not be tied to one vendor or model family. The architectural goal is support for compatible open/local models such as:

- OLMo;
- Qwen;
- Llama;
- Mistral;
- Gemma; and
- other compatible open models.

**Ollama** is the initial local inference path. The product must discover or receive capability information instead of assuming that every model supports tool calling, structured output, vision, reasoning, streaming, embeddings, or the same context size.

Open Dot Spell is software, not an AI model. The following terms remain distinct:

| Term | Meaning | Boundary |
| --- | --- | --- |
| **Open Dot Spell** | The assistant application, persistence, policy, approval, execution, evidence, artifact, and user-interface system. | Owns product behavior and authorization. |
| **Model** | A reasoning/generation system such as an OLMo, Qwen, Llama, Mistral, or Gemma variant. | Proposes text, structured output, or tool calls; never grants itself permission. |
| **Inference runtime** | Software that serves a model, initially Ollama and potentially another compatible runtime later. | Handles model execution and protocol details; does not define Open Dot Spell policy. |
| **Coding environment** | An isolated, bounded environment used for repository inspection, edits, and tests. | Executes coding work only under application-approved limits. |
| **Browser automation** | Controlled interaction with an external browser/session. | A separate capability with explicit navigation, data, and approval boundaries. |
| **Image generation** | An optional separate model/runtime capability. | Not implied by text-model support and not required for the first useful release. |

The model proposes. The application decides.

## 3. Privacy modes

Open Dot Spell exposes an understandable privacy mode rather than silently changing where user data goes.

### Local-only

- Model calls remain on approved local endpoints.
- There is no cloud fallback.
- External telemetry is disabled by default.
- Local files and artifacts remain local unless a separately approved integration is used.
- If a required local capability is unavailable, the system reports the limitation instead of silently sending data elsewhere.

### Hybrid

- The user explicitly enables one or more remote providers.
- The destination, provider identity, model, and relevant data flow are visible before use.
- Provider configuration and any required approval are persisted and inspectable.
- Remote calls are opt-in; local inference remains available where configured.
- The application must make it possible to understand which content is being sent externally.

### Offline

- Core local workflows continue without external network access.
- Local conversations, persistence, approved local files, local artifacts, and locally available model calls remain usable.
- Remote providers, live web research, hosted integrations, model downloads, and other network-dependent features become unavailable or explicitly queued.
- The interface reports unavailable capabilities rather than presenting them as successful.

## 4. Free/local path

A user must be able to install and use the core product without a paid inference API or hosted orchestration service. Optional paid providers may exist later, but they are never mandatory for:

- initial setup;
- local chat;
- persistence;
- basic approved-file workflows; or
- inspecting execution.

“Free” does not mean costless. Local inference consumes hardware, electricity, disk space, and the user's time and resources. The product must describe those local requirements honestly and must not make universal performance claims without measurement.

## 5. Target user

The initial target user is a technically capable individual who wants a personal AI worker under their own control. They can choose local models, approve permissions, select workspace data, inspect activity, and understand that durable automation requires explicit boundaries.

The product is single-owner in its first scope. It does not require teams, organizations, shared tenancy, or a marketplace.

## 6. Target workflows

The following journeys are product requirements and future acceptance scenarios. None is claimed to work at Step 02.

### Journey A — Chat

1. The user starts or resumes a conversation.
2. The user selects or accepts an explicitly identified local model.
3. Open Dot Spell streams a response while showing the provider/runtime identity and relevant state.
4. The conversation, messages, model identity, and terminal status persist across application restart.
5. On failure, the interface reports an incomplete/error state rather than fabricating a completed response.

### Journey B — Workspace summarization

1. The user selects permitted files or a permitted workspace scope.
2. The assistant proposes a summary task and the application validates the selected scope.
3. The system reads only the permitted files.
4. The assistant produces a summary and saves a local artifact.
5. The artifact records source references, relevant evidence, and completion status.
6. A source outside the approved scope is not read merely because a model or file asks for it.

### Journey C — Coding task

1. The user asks Open Dot Spell to inspect an approved repository.
2. The assistant proposes a change and a bounded execution plan.
3. The user or policy approves the coding run as required.
4. The application executes only inside the approved isolated coding environment.
5. Tests run inside that environment.
6. The system produces a patch/diff and reports actual test output and evidence.
7. A model statement that a change is complete is insufficient without the resulting diff and verification.

### Journey D — Approval

1. The assistant proposes a consequential action.
2. The system displays the exact intended action, target, scope, relevant inputs, and expected effects.
3. The user approves or rejects it.
4. Approval authority is limited to that action and bounded scope; it is not a general permission grant.
5. The application executes only after validation and policy evaluation.
6. The decision, execution, result, and evidence are recorded in the activity timeline.

### Journey E — Restart recovery

1. A durable task is running.
2. The process, browser, UI, or worker is interrupted.
3. The application restarts and loads persisted task/run state.
4. Any authority issued to the stale execution is invalidated or revalidated before continuation.
5. The task resumes only from an eligible checkpoint, or is marked for user attention.
6. The recovered run records the interruption and its new outcome.

## 7. Persistent responsibilities

Open Dot Spell distinguishes durable intent from a single chat request:

```text
Responsibility → Goal → Plan → Task → Run
```

- **Responsibility:** an ongoing objective owned by the user, such as maintaining a recurring report or monitoring selected notes. It may produce work repeatedly.
- **Goal:** a desired outcome that gives a responsibility a concrete direction.
- **Plan:** an ordered, inspectable proposal for reaching a goal. It is not authority to execute.
- **Task:** a bounded unit of work with inputs, constraints, state, and an expected result.
- **Run:** one execution instance of a task, with lifecycle state, tool actions, evidence, artifacts, approvals, and recovery information.

Examples include monitoring selected notes, preparing a recurring report, maintaining a project task, or performing a scheduled research workflow. These are durable user-owned workflows, not distributed multi-agent orchestration. Specialist profiles may exist later, but they use the same bounded execution system and do not gain independent authority.

## 8. Product boundaries and execution model

The complete conceptual chain is:

```text
Responsibility
→ Goal
→ Plan
→ Task
→ Run
→ Tool Action
→ Evidence
→ Artifact
```

The boundaries are explicit:

1. The **model proposes** text, plans, structured data, or tool actions.
2. The **application validates** the proposal and normalizes it into a known action contract.
3. The **policy engine determines** whether the action is permitted under current scope, risk, privacy mode, and resource limits.
4. The **approval system determines** whether user authorization is required and records the decision.
5. The **execution environment performs** only the bounded, authorized action.
6. **Evidence determines** whether the task can be considered completed; model-generated “done” text is not proof.
7. The application records an audit/event entry and associates verified artifacts with the run.

Models, webpages, files, MCP servers, tool descriptions, and external content cannot grant permissions.

## 9. Non-goals and deferrals

The following are not in the first release:

- teams and organizations;
- billing;
- a marketplace;
- Kubernetes;
- multi-region infrastructure;
- distributed agent orchestration;
- autonomous financial transactions;
- automatic merging or releasing;
- unrestricted host shell execution;
- unrestricted remote desktop control; and
- proprietary model dependency.

“Not in the first release” means a capability may be reconsidered later under a new explicit requirement. It does not promise future support. Any later addition must preserve local-first operation, bounded authority, inspectable execution, and explicit privacy behavior.

## 10. Release definition

### First usable release — after Step 20

The first usable release is the smallest local alpha/MVP that demonstrates this core loop:

```text
conversation → model → persistent state → goal/task → controlled tool use
→ approval where required → artifact/evidence → inspectable run → recovery
```

Before calling it an MVP/alpha, all of the following must be working and tested:

- a local Ollama path with explicit model/runtime identity and capability-aware adapter behavior;
- persistent conversations that survive restart;
- persistent responsibility/goal/task/run state;
- at least one controlled local tool, such as approved file reading or local artifact creation;
- server-side validation, policy evaluation, bounded execution, evidence verification, and audit/event recording;
- an approval flow for at least one consequential action;
- an inspectable activity timeline;
- artifact creation with source/result evidence;
- pause/cancel/recovery behavior that invalidates stale authority; and
- deterministic, integration, E2E, and real-model evaluation coverage appropriate to the implemented slice.

A feature is not part of the MVP merely because its interface or documentation exists.

### Later extensions

After the Step 20 release boundary, later requirements may add:

- isolated coding environments;
- controlled browser workflows;
- retrieval;
- durable memory;
- schedules;
- triggers;
- MCP;
- GitHub integration;
- additional providers;
- specialist profiles;
- optional image generation;
- broader integrations; and
- release/distribution hardening.

Each extension requires its own acceptance scenarios and must not weaken the core authorization, privacy, evidence, or recovery boundaries.

## 11. Acceptance criteria

The following scenarios are requirements, not completed checks. Every status is intentionally `Unknown / requires implementation and verification` until a later step provides evidence.

| Requirement | Acceptance Scenario | Verification Type | Release | Status |
| --- | --- | --- | --- | --- |
| Model/provider abstraction | Configure Ollama with one local model, expose its identity/capabilities, and switch to another compatible adapter without changing conversation/task policy code. | Integration test + real-model evaluation | After Step 20 / later provider extensions | Unknown / requires implementation and verification |
| Local-only privacy | With Local-only selected, a request uses only approved local endpoints and fails visibly when the local runtime is unavailable; no cloud fallback occurs. | Integration test + manual verification | After Step 20 | Unknown / requires implementation and verification |
| Hybrid privacy | Enable a remote provider explicitly and show destination, model, and relevant outbound data before a request is sent. | E2E test + manual verification | Later extension | Unknown / requires implementation and verification |
| Offline mode | Disable external networking and complete local chat, persistence, approved-file, and local-artifact workflows while clearly marking live web/remote features unavailable. | E2E test | After Step 20 / later extensions | Unknown / requires implementation and verification |
| Persistent chat | Send a streamed local response, restart the application, and find the conversation with its terminal state and model identity intact. | Integration test + E2E test + real-model evaluation | After Step 20 | Unknown / requires implementation and verification |
| Responsibility hierarchy | Create a responsibility, goal, plan, task, and run; each remains linked and independently inspectable. | Deterministic automated test + E2E test | After Step 20 | Unknown / requires implementation and verification |
| Approved workspace access | Select two files, run summarization, and verify that only those files were read and source references are attached to the artifact. | Integration test + E2E test | After Step 20 | Unknown / requires implementation and verification |
| Controlled tool execution | Submit malformed, out-of-scope, and policy-disallowed tool requests and verify they are rejected before execution. | Deterministic automated test + integration test | After Step 20 | Unknown / requires implementation and verification |
| Human approval | Present a consequential action with exact target/scope, reject it, and verify no side effect; approve an equivalent action and verify authority is limited to that action. | E2E test + manual verification | After Step 20 | Unknown / requires implementation and verification |
| Evidence-based completion | Make a tool report failure while the model says “done”; the run remains incomplete and the timeline exposes the failure. | Deterministic automated test + integration test | After Step 20 | Unknown / requires implementation and verification |
| Artifact creation | Create a summary or report in local storage and verify content, path, source references, and write result are recorded. | Integration test + E2E test | After Step 20 | Unknown / requires implementation and verification |
| Inspectable execution | View a run timeline containing proposal, policy decision, approval, action, result, evidence, artifact, and final state. | E2E test + manual verification | After Step 20 | Unknown / requires implementation and verification |
| Recovery | Interrupt a run, restart the worker, invalidate stale authority, and resume only from a safe checkpoint or request attention. | Deterministic automated test + integration test + E2E test | After Step 20 | Unknown / requires implementation and verification |
| Coding assistance | In an approved isolated repository, produce a patch, run tests, and report actual diff/test evidence without executing unrestricted host commands. | E2E test + real-model evaluation + manual verification | Later extension | Unknown / requires implementation and verification |
| Controlled browser workflow | Execute a synthetic browser task inside a controlled session, enforce navigation/data policy, and retain observable evidence. | E2E test + manual verification | Later extension | Unknown / requires implementation and verification |
| Memory | Save explicitly approved information with provenance, retrieve it within scope, and delete it so later retrieval no longer returns it. | Deterministic automated test + integration test | Later extension | Unknown / requires implementation and verification |
| Retrieval | Search only approved local sources and return source references; an unapproved source is not indexed or read. | Integration test + E2E test | Later extension | Unknown / requires implementation and verification |
| Scheduling | Create, disable, and recover a scheduled responsibility without duplicate unsafe runs after restart. | Deterministic automated test + integration test | Later extension | Unknown / requires implementation and verification |
| Optional integrations | Enable one integration explicitly, show its permissions, enforce its policy, and record its results; disabled integrations remain unavailable. | Integration test + manual verification | Later extension | Unknown / requires implementation and verification |
| Local/free path | From a clean machine with Ollama/local dependencies but no paid API key or hosted orchestrator, install and use local chat, persistence, basic files, and execution inspection. | E2E test + manual verification | After Step 20 | Unknown / requires implementation and verification |

Documentation alone never satisfies an acceptance criterion. A result is only verified when the listed check has actually run and its evidence is recorded.

## 12. Current implementation boundary

Step 02 defines the product and reference map only. It does not implement chat, models, persistence, tools, approvals, workers, artifacts, browser control, coding environments, memory, retrieval, scheduling, or integrations. Those remain `Unknown / requires implementation and verification` until their numbered steps are supplied and completed.
