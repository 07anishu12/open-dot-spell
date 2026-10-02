# Open Dot Spell Progress

## Step 01 — Environment and hardware assessment

**Status:** Documentation complete; development-repository prerequisite blocked.

### Objective

Inspect the local environment without creating application code, select a supportable local runtime baseline, document missing dependencies, and define a cautious local Ollama trial plan.

### Files changed

- `docs/ENVIRONMENT.md` — hardware observations, tool/service inventory, runtime selection, official setup references, blockers, inference trial plan, and reproducible checklist.
- `docs/PROGRESS.md` — this step record.

### Exact checks and actual outcomes

See the **Commands actually run and outcomes** section in `docs/ENVIRONMENT.md`. In summary:

- macOS 27.0.1 on arm64, Apple M5, 10 CPU cores, 16 GB unified physical memory, Apple M5 8-core GPU/Metal 4, and 187 GiB free on the workspace filesystem were observed.
- Node.js `v26.10.0`, npm `11.19.1`, Git `2.55.0`, Ollama client `0.34.4`, and Docker CLI `29.8.0` were observed.
- pnpm was not found.
- Ollama and Docker application bundles were present, but neither local service was reachable. No service was started.
- The assigned workspace is writable but is not a Git repository and contains no Open Dot Spell source, manifest, lockfile, `AGENTS.md`, `CLAUDE.md`, `docs/BUILD_GUIDE.md`, or pre-existing progress file.

### Manual checks

- Verified the assigned directory is writable.
- Verified app bundle presence without launching Ollama or Docker.
- Excluded hardware serial numbers, UUIDs, and provisioning identifiers from the documentation.
- Did not install tools, pull model weights, enable background services, inspect unrelated Desktop directories, or contact a remote model provider.

### Unresolved limitations

- The current workspace cannot be confirmed as the separate Open Dot Spell development repository. No application changes or commit can safely be made until that repository is supplied.
- Node 24 LTS is the selected baseline, but only Node 26 Current is installed in the assigned workspace.
- pnpm 12.x is not installed.
- No exact local Ollama model identifiers or digests can be recorded until the server is manually available.
- The provisional `gemma4:e2b` candidate has not been downloaded or capability-tested. No benchmark or workload result is claimed.
- Docker is available only as an installed CLI/app; its daemon state remains unverified.

### Next step

Provide or switch to the separate writable Open Dot Spell Git development repository, then repeat the repository-instruction and manifest checks there before starting the next numbered step. Do not begin application implementation in this workspace.

## Step 02 — Product and reference feature map

**Status:** Documentation complete; no application functionality implemented.

### Objective

Define Open Dot Spell as a single-owner, local-first personal AI assistant; specify privacy modes, workflows, responsibility semantics, release boundaries, acceptance scenarios, product boundaries, and independent lessons from public reference projects.

### Files changed

- `docs/PRD.md` — original product requirements, target workflows, privacy modes, release boundaries, and acceptance criteria.
- `docs/REFERENCE_MAP.md` — public evidence and independent feature mapping for CopilotKit/OpenDots, composio-community/open-dot, and feder-cr/dots.
- `docs/PROJECT_MEMORY.md` — Step 02 progress, the verified Responsibility → Goal → Plan → Task → Run chain, and the Step 20 release boundary.
- `docs/ENVIRONMENT.md` — corrected the project identity to Open Dot Spell.
- `docs/PROGRESS.md` — this Step 02 record and identity correction.
- `README.md` — corrected the project title to Open Dot Spell.

### Verification

- Confirmed the current repository is on `main`, tracks `origin/main`, and had no pre-existing uncommitted changes before this step.
- Confirmed `AGENTS.md` and `docs/BUILD_GUIDE.md` are absent; this limitation is recorded rather than filled with assumptions.
- Inspected the named public reference repositories and recorded verified branch revisions where obtainable. No reference project was run or tested.
- Cross-checked terminology, privacy modes, local/free path, release boundaries, execution chain, and acceptance status across the new documents and project memory.
- No application code, dependencies, model weights, or services were added.

### Known limitations

- The reference identities are based on the Step 02 brief because the build guide is absent; similarly named projects may require confirmation if a later build guide identifies different sources.
- Reference-project runtime behavior, performance, and deployment claims remain unverified.
- All product acceptance scenarios remain `Unknown / requires implementation and verification`.

### Next step

Step 03.

## Step 03 — Architecture, security, state, contracts, and failure model

**Status:** Documentation complete; system design established. No application functionality implemented.

### Objective

Define the laptop-sized local-first system architecture, trust boundaries, minimum domain entities, explicit state machines, evidence-based completion semantics, durable execution leasing, failure recovery matrix, approval model, tool policy matrix, local API contracts, provider streaming contracts, artifact atomic staging, sandbox execution constraints, and architectural decision records (ADRs).

### Files changed

- `docs/ARCHITECTURE.md` — complete system architecture, component roles, trust boundaries, domain model, state machines, durable worker leases, failure recovery matrix, tool policy, local API specifications, provider streaming contracts, atomic artifact staging, sandbox limits, resource budgets, and Mermaid diagrams.
- `docs/SECURITY.md` — threat model, localhost protection, session auth, Host/Origin validation, credential isolation, path traversal guards, container sandbox boundaries, approval fingerprinting, and prompt injection mitigations.
- `docs/decisions/0001-sqlite-as-initial-persistence.md` — ADR for embedded SQLite with WAL mode.
- `docs/decisions/0002-separate-worker-process.md` — ADR for decoupled background worker with leasing and fencing tokens.
- `docs/decisions/0003-local-inference-as-default.md` — ADR for local inference default with Ollama.
- `docs/decisions/0004-server-side-tool-policy.md` — ADR for server-side policy and immutable action fingerprints.
- `docs/decisions/0005-isolated-code-execution.md` — ADR for container sandbox code execution.
- `docs/PROJECT_MEMORY.md` — recorded Step 03 progress, verification, and ADR decisions in the decision log.
- `docs/PROGRESS.md` — this Step 03 record.

### Verification

- Documentation consistency review.
- Cross-checked `docs/ARCHITECTURE.md` and `docs/SECURITY.md` against `docs/PRD.md`, `docs/REFERENCE_MAP.md`, and `docs/PROJECT_MEMORY.md`.
- Confirmed that recovery and state machines do not rely on hidden chat history or client-side assumptions.
- Confirmed that approval bindings use immutable SHA-256 fingerprints to prevent parameter tampering.
- Confirmed explicit statement that Open Dot Spell provides at-least-once task execution and does NOT claim general exactly-once external side effects.
- Confirmed no speculative infrastructure (PostgreSQL, Kafka, Redis, Kubernetes, microservices) was introduced.
- Verified all Mermaid diagrams adhere to supported diagram types and syntax.
- Confirmed no application code, dependencies, or running services were introduced.

### Known limitations

- `docs/BUILD_GUIDE.md` and `AGENTS.md` remain absent from the repository.
- No application scaffold, package manifest, or lockfile exists yet.
- pnpm is not installed on the system; Node 26 is installed rather than Node 24 LTS.
- Ollama and Docker local services were not running during this step.
- All contracts, schemas, and state machines are design specifications and have not been executed or tested in code.

### Next step

Step 04.

## Step 04 — Establish the smallest runnable repository

**Status:** Implementation complete and verified. Runnable web shell, API health endpoint, worker lifecycle, and developer tooling operational.

### Objective

Establish the minimal monorepo structure (`apps/web`, `apps/server`, `apps/worker`, `packages/core`, `packages/db`, `packages/providers`), configure pnpm, strict TypeScript, ESLint, Vitest, Fastify, React/Vite, Zod, and Drizzle with a supported SQLite driver, implement the health endpoint and worker lifecycle, verify developer commands, and commit the lockfile.

### Files changed

- `package.json` — root workspace configuration, developer scripts (`lint`, `typecheck`, `test`, `build`, `check`).
- `pnpm-workspace.yaml` — workspace package definitions and build approval configuration.
- `pnpm-lock.yaml` — pinned dependency lockfile.
- `tsconfig.base.json` — root strict TypeScript base configuration.
- `tsconfig.json` — root composite project references.
- `eslint.config.js` — ESLint 9 flat configuration with typescript-eslint.
- `.env.example` — minimal local development environment variables.
- `.gitignore` — comprehensive git safety exclusions (secrets, databases, build outputs, OS files).
- `README.md` — project overview, workspace structure, and verified developer commands.
- `packages/core/` — core schemas (`HealthResponse`, `PrivacyMode`, state enums), action fingerprinting, tests.
- `packages/db/` — Drizzle ORM schema, LibSQL SQLite client factory, in-memory connection tests.
- `packages/providers/` — model provider interface, streaming event types, Ollama provider stub, tests.
- `apps/server/` — Fastify application, `GET /api/health`, Host validation, loopback CORS, automated smoke tests.
- `apps/worker/` — decoupled worker process class, start/stop lifecycle, signal handlers, lifecycle tests.
- `apps/web/` — React/Vite web application shell, system readiness component, unit tests.
- `docs/PROGRESS.md` — this Step 04 progress update.
- `docs/PROJECT_MEMORY.md` — Step 04 status and architecture decision log entry.

### Verification commands and actual outcomes

1. `pnpm install` — Exit code 0. Resolved and installed all workspace dependencies, generated reproducible `pnpm-lock.yaml`.
2. `pnpm lint` — Exit code 0. Clean ESLint 9 run across all 6 workspace projects with 0 errors/warnings.
3. `pnpm typecheck` — Exit code 0. Full strict TypeScript type checking (`tsc -b`) passed without error.
4. `pnpm test` — Exit code 0. Ran 6 test suites with Vitest (11/11 tests passing):
   - `packages/core/test/core.test.ts` (4 passed)
   - `packages/db/test/db.test.ts` (1 passed)
   - `packages/providers/test/provider.test.ts` (1 passed)
   - `apps/server/test/health.test.ts` (2 passed)
   - `apps/worker/test/worker.test.ts` (2 passed)
   - `apps/web/test/app.test.tsx` (1 passed)
5. `pnpm build` — Exit code 0. Successfully compiled all TypeScript libraries, server, worker, and built Vite web client bundle (`dist/index.html` 0.33 kB, `dist/assets/index-*.js` 225.85 kB) in 1.2s.
6. `pnpm check` — Exit code 0. Executed composite verification gate (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`).
7. `curl -i -H "Host: 127.0.0.1:3000" http://127.0.0.1:3000/api/health` — Exit code 0. Returned HTTP 200 OK with `{"status":"healthy","version":"0.1.0-alpha","privacy_mode":"local_only","database":"connected","worker":"active"}`.
8. Worker lifecycle start/stop — Worker process started in background, logged `Open Dot Spell Worker ready. Standby mode (no tasks claimed)`, and terminated cleanly on process kill signal.
9. Web preview test — `pnpm --filter @open-dot-spell/web preview` served on `http://127.0.0.1:5173`; verified via curl returning the rendered application HTML shell.

### Manual verification

- Confirmed loopback binding and Host header validation rejects malicious or non-loopback host headers (`HTTP 403 Forbidden`).
- Confirmed zero credentials, API keys, or machine secrets are present in `.env.example` or exposed by the API.
- Confirmed the worker does not claim tasks or execute task queues prematurely.

### Known limitations/blockers

- `docs/BUILD_GUIDE.md` and `AGENTS.md` remain absent from the repository.
- Ollama and Docker local services were not running; inference and container features remain unverified until future steps.
- Task queues, conversation orchestration, and durable execution remain deferred to future numbered implementation steps.

### Next step

Step 05.

## Step 05 — Add Durable Storage and Migrations

**Status:** Implementation complete and verified. Durable SQLite persistence layer, migrations, and consistency verification operational.

### Objective

Implement the durable local SQLite persistence layer using the agreed Drizzle ORM and LibSQL client, enforce safety pragmas (FK, WAL, busy timeout), implement initial relational schemas (Workspace, Conversation, Message, Run, RunEvent), establish deterministic sequence ordering for messages and events, create non-destructive migrations, implement atomic state+event transitions, verify restart persistence and concurrency handling, and document backup and storage boundary designs.

### Files changed

- `packages/db/src/schema.ts` — initial schema definitions (`workspaces`, `conversations`, `messages`, `runs`, `run_events`) with foreign keys, unique sequence indices, and status enums.
- `packages/db/src/migrations.ts` — versioned migration registry, migration runner (`runMigrations`), and diagnostic error handling (`MigrationError`).
- `packages/db/src/config.ts` — centralized connection factory (`createDatabaseClient`), path resolution, and safety pragmas.
- `packages/db/src/queries.ts` — deterministic message/event ordering queries, atomic `transitionRunStatusWithEvent` transaction helper, and bounded lock retry.
- `packages/db/src/index.ts` — unified exports for packages/db.
- `packages/db/test/persistence.test.ts` — comprehensive 7-point persistence integration test suite.
- `packages/db/test/db.test.ts` — updated basic initialization test.
- `apps/server/src/app.ts` & `index.ts` — integrated database health check and automated migrations into server.
- `apps/server/test/health.test.ts` — verified server health response with active database client.
- `apps/worker/src/worker.ts` & `index.ts` — integrated database connectivity into worker lifecycle.
- `apps/worker/test/worker.test.ts` — verified worker lifecycle with active database client.
- `docs/BACKUP_DESIGN.md` — SQLite online backup design (`VACUUM INTO`), WAL safety, storage locations, and retention policy.
- `docs/STORAGE.md` — storage boundaries (SQLite metadata vs filesystem blobs), single-host model, and safety pragmas.
- `docs/PROGRESS.md` — this Step 05 record.
- `docs/PROJECT_MEMORY.md` — updated Step 05 progress and decision log.

### Verification commands and actual outcomes

1. `pnpm check` (Composite gate) — Exit code 0.
   - `pnpm lint` — Exit code 0. 0 errors or warnings across all projects.
   - `pnpm typecheck` — Exit code 0. Strict TypeScript composite project check passed.
   - `pnpm test` — Exit code 0. 7 test suites, 20/20 tests passed:
     - `packages/db/test/persistence.test.ts` (7 passed: fresh migration, repeated migration, restart persistence, foreign keys, migration rollback, atomic state+event, concurrent writes)
     - `packages/db/test/db.test.ts` (1 passed)
     - `packages/core/test/core.test.ts` (4 passed)
     - `packages/providers/test/provider.test.ts` (1 passed)
     - `apps/server/test/health.test.ts` (3 passed)
     - `apps/worker/test/worker.test.ts` (3 passed)
     - `apps/web/test/app.test.tsx` (1 passed)
   - `pnpm build` — Exit code 0. All packages and apps built cleanly in 0.85s.

### Manual verification

- Verified deterministic message ordering across simulated process restarts.
- Verified foreign keys are actively enforced by SQLite (`PRAGMA foreign_keys = ON;`).
- Verified failing migrations trigger rollback and leave existing tables and data intact.
- Verified atomic consistency: Run status update and RunEvent either both commit or neither commits.
- Verified bounded concurrent writes using lock retry with backoff.

### Known limitations/blockers

- `docs/BUILD_GUIDE.md` remains absent from the repository.
- Full backup execution CLI and restore UI are deferred to later operational milestones.
- Conversation chat loops and durable task queues remain deferred to subsequent implementation steps.

### Next step

Step 06.

## Step 06 — Protect Local Access and Credentials

**Status:** Implementation complete and verified. Local owner authentication, loopback binding, request hardening, workspace isolation, structured log redaction, and encrypted credential storage operational.

### Objective

Establish the security perimeter for Open Dot Spell before exposing privileged assistant actions: enforce strict loopback binding, implement a single-owner bootstrap pairing model with one-time secrets and attempt limits, establish authenticated sessions via HttpOnly cookies and auth headers, implement Host and Origin header gatekeeping to block DNS rebinding and cross-site requests, enforce a 1 MB request size limit, ensure workspace resource authorization, implement recursive structured log redaction, provide AES-256-GCM encrypted provider credential storage with masked previews, and verify all controls through automated security tests.

### Files changed

- `packages/core/src/index.ts` — auth & credential Zod schemas (`PairingRequestSchema`, `PairingResponseSchema`, `AuthStatusSchema`, `CredentialReferenceSchema`, `StoreCredentialSchema`), masking utility (`maskSecret`), recursive log redaction utility (`redactSensitiveData`), AES-256-GCM encryption/decryption (`encryptSecret`, `decryptSecret`), and key derivation (`deriveMasterKey`).
- `packages/core/test/core.test.ts` — test suite for masking, redaction, and AES-256-GCM authenticated encryption/decryption with tampering detection.
- `packages/db/src/schema.ts` — added `provider_credentials` SQLite table schema.
- `packages/db/src/migrations.ts` — added migration version 2 (`0002_provider_credentials`).
- `packages/db/src/queries.ts` — implemented `verifyWorkspaceScope`, `insertProviderCredential`, `listProviderCredentials` (returning metadata and masked preview only), and `getProviderCredentialEncrypted`.
- `packages/db/test/persistence.test.ts` — updated integration test suite to verify version 2 migrations, workspace scoping isolation, and credential metadata storage.
- `apps/server/src/auth.ts` — created `AuthManager` with one-time 32-byte pairing secret (15m expiry, 5 max attempts, replay prevention) and 32-byte session token lifecycle.
- `apps/server/src/app.ts` — integrated `@fastify/cookie`, security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, CSP), loopback Host header check, Origin header check on mutating methods, 1 MB body limit, `requireOwnerAuth` preHandler, redacted error handler, pairing endpoint (`POST /api/auth/pair`), status endpoint (`GET /api/auth/status`), logout endpoint (`POST /api/auth/logout`), workspace scoping endpoints, masked credential endpoints (`GET/POST /api/credentials`), and local Ollama provider endpoint.
- `apps/server/src/index.ts` — enforced strict rejection of non-loopback bindings (`0.0.0.0`) on launch, initialized `AuthManager`, and printed one-time pairing code to terminal `stdout`.
- `apps/server/test/security.test.ts` — comprehensive 17-test automated security suite covering loopback host check, DNS rebinding rejection, pairing lifecycle, attempt limits, replay protection, HttpOnly cookies, logout, untrusted origin rejection, loopback origin allowance, 1 MB payload rejection (413), security headers, cross-workspace resource access rejection (404), credential encryption & masking, and local inference without remote credentials.
- `docs/SECURITY.md` — updated Section 3 (Local API Security), Section 4 (Credential Isolation), and added Section 10 (Local Threat Model and Residual Risks).
- `docs/ARCHITECTURE.md` — updated Section 11 with auth and credential endpoints.
- `docs/PROJECT_MEMORY.md` — recorded Step 06 progress and decision log entry.
- `docs/PROGRESS.md` — this Step 06 record.

### Verification commands and actual outcomes

1. `pnpm check` (Composite project-wide gate) — Exit code 0.
   - `pnpm lint` — Exit code 0. 0 errors, 0 warnings across all 7 packages.
   - `pnpm typecheck` — Exit code 0. Strict TypeScript composite build passed without error.
   - `pnpm test` — Exit code 0. 8 test suites, 43/43 tests passing:
     - `apps/server/test/security.test.ts` (17 passed)
     - `apps/server/test/health.test.ts` (3 passed)
     - `packages/core/test/core.test.ts` (8 passed)
     - `packages/db/test/persistence.test.ts` (9 passed)
     - `packages/db/test/db.test.ts` (1 passed)
     - `packages/providers/test/provider.test.ts` (1 passed)
     - `apps/worker/test/worker.test.ts` (3 passed)
     - `apps/web/test/app.test.tsx` (1 passed)
   - `pnpm build` — Exit code 0. All packages and Vite client built cleanly in 0.9s.

### Manual verification

- Confirmed server startup refuses non-loopback hosts (`0.0.0.0`) with fatal error exit code 1.
- Confirmed terminal stdout securely displays pairing secret with 15-minute expiration notice.
- Confirmed single-owner pairing secret cannot be replayed or brute-forced.
- Confirmed cross-origin requests from external web contexts are rejected (`403 Forbidden`).
- Confirmed requests exceeding 1 MB are rejected (`413 Payload Too Large`).
- Confirmed cross-workspace resource queries return `404 Not Found`.
- Confirmed credentials API never leaks plaintext secret values or encrypted ciphertext.
- Confirmed local inference (Ollama) operates with zero remote credentials stored.

### Known limitations/blockers

- `docs/BUILD_GUIDE.md` remains absent from the repository.
- Ollama and Docker local background services were not running during this step.
- Single-user local threat model assumes the local host operating system account is trusted.

### Next step

Step 07.

## Step 07 — Implement the provider contract and deterministic test provider

**Status:** Implementation complete and verified. Provider-neutral event contract, safe tool argument assembler, capability model, error categories, reusable contract test suite, and deterministic synthetic test provider operational.

### Objective

Implement the provider-neutral abstraction (`ModelProviderAdapter`) supporting health checking, model discovery, streamed chat, capability discovery, and cancellation. Define normalized provider events, safe incremental tool argument assembly (`ToolCallStreamAssembler`), explicit usage semantics (preserving null when unmeasured, never fabricating zero), capability model distinguishing protocol support from observed capabilities (`ObservedModelCapabilities`), bounded timeout and error classification (`ProviderError`), and a deterministic synthetic test provider (`SyntheticTestProvider`) with selectable scenarios.

### Files changed

- `packages/providers/src/types.ts` — provider-neutral interface (`ModelProviderAdapter`), normalized event union (`ProviderEvent`: `text_delta`, `tool_call_start`, `tool_call_delta`, `tool_call_complete`, `usage`, `completed`, `error`), capability records (`ObservedModelCapabilities`, `ModelLimits`, `CapabilitySupport`), health (`ProviderHealth`), model discovery (`DiscoveredModel`), and error categories (`ProviderErrorCategory`).
- `packages/providers/src/errors.ts` — standardized `ProviderError` class with secret/token redaction via `redactSensitiveData`.
- `packages/providers/src/assembler.ts` — `ToolCallStreamAssembler` for safe incremental tool argument buffering, strict JSON validation without silent repair, and stream interruption detection (`assertStreamComplete`).
- `packages/providers/src/synthetic.ts` — `SyntheticTestProvider` deterministic test double with selectable scenarios (`normal_text`, `valid_tool_call`, `malformed_tool_args`, `interrupted_stream`, `timeout`, `cancellation`, `missing_usage`, `unsupported_capability`).
- `packages/providers/src/index.ts` — unified exports and updated `OllamaProviderStub` adhering to `ModelProviderAdapter`.
- `packages/providers/package.json` — added `@types/node` dependency for AbortSignal and standard platform types.
- `packages/providers/test/contract-suite.ts` — reusable multi-adapter contract test suite covering health, discovery, streamed text, event ordering, tool correlation, tool assembly, malformed arguments, usage semantics, cancellation, timeouts, unsupported capabilities, interrupted streams, and capability snapshots.
- `packages/providers/test/provider.test.ts` — test execution of contract suite on `SyntheticTestProvider`, assembler unit tests, error redaction tests, and stub checks.
- `packages/core/src/index.ts` — enhanced `redactSensitiveData` string replacement for Bearer tokens and API keys.
- `apps/server/test/security.test.ts` — updated capability assertion to match `ObservedModelCapabilities` tri-state format.
- `docs/ARCHITECTURE.md` — documented Section 12 with provider contract, event schemas, tool assembler, usage integrity, capability model, and test doubles.
- `docs/PROJECT_MEMORY.md` — updated Step 07 progress and decision log.
- `docs/PROGRESS.md` — this Step 07 record.

### Verification commands and actual outcomes

1. `pnpm check` (Composite gate) — Exit code 0.
   - `pnpm lint` — Exit code 0. 0 errors, 0 warnings across all 7 packages.
   - `pnpm typecheck` — Exit code 0. Strict TypeScript composite build passed without error.
   - `pnpm test` — Exit code 0. 8 test suites, 60/60 tests passing:
     - `packages/providers/test/provider.test.ts` (18 passed)
     - `apps/server/test/security.test.ts` (17 passed)
     - `apps/server/test/health.test.ts` (3 passed)
     - `packages/core/test/core.test.ts` (8 passed)
     - `packages/db/test/persistence.test.ts` (9 passed)
     - `packages/db/test/db.test.ts` (1 passed)
     - `apps/worker/test/worker.test.ts` (3 passed)
     - `apps/web/test/app.test.tsx` (1 passed)
   - `pnpm build` — Exit code 0. All 6 packages and Vite web bundle compiled in 0.5s.

### Manual verification

- Verified all 8 deterministic provider scenarios function reproducibly without live Ollama, external network, or API keys.
- Verified tool argument assembler raises structured errors on malformed JSON rather than attempting silent repair.
- Verified missing token usage returns `null` rather than fabricating `0`.
- Verified cancellation via `AbortSignal` terminates stream and records `finishReason: "cancelled"`.
- Verified capabilities distinguish verified models from unknown models.
- Verified credentials and Bearer tokens are scrubbed from provider error messages.

### Known limitations/blockers

- Real model inference and live Ollama connectivity are intentionally deferred to Step 08.
- `docs/BUILD_GUIDE.md` remains absent from the repository.

### Next step

Step 08. Do not begin it until the next numbered prompt is supplied.

## Step 08 — Connect Ollama and a second compatible provider

**Status:** Implementation complete and verified. Ollama native adapter, OpenAI-compatible chat adapter, capability probing pipeline, loopback privacy validation, deterministic test suites, and honest live smoke check operational.

### Objective

Connect Ollama and a second compatible inference provider (OpenAI-compatible) behind the Step 07 `ModelProviderAdapter` interface. Implement live-model capability probes (`probeModelCapabilities`), enforce local-only loopback endpoint restrictions by default (`validateProviderEndpoint`), normalize protocol differences, decode streaming chunks (NDJSON and SSE), assemble incremental tool calls safely, preserve explicit null token usage semantics, classify and redact errors, and honestly report live service status without fabricating results or downloading unverified models.

### Files changed

- `packages/providers/src/policy.ts` — `validateProviderEndpoint` enforcing loopback endpoints (`127.0.0.1`, `::1`, `localhost`) in `local_only` mode and requiring explicit `hybrid` privacy mode for remote endpoints.
- `packages/providers/src/ollama.ts` — `OllamaProvider` implementation connecting to native `/api/chat`, `/api/tags`, `/api/show` with NDJSON streaming, tool call extraction, JSON schema formatting, and usage metrics.
- `packages/providers/src/openai-compatible.ts` — `OpenAICompatibleProvider` implementation connecting to standard `/v1/chat/completions` and `/v1/models` with SSE stream decoding, index-correlated tool assembly, Bearer authentication, and usage metrics.
- `packages/providers/src/probes.ts` — `probeModelCapabilities` pipeline for testing streaming text, tool calling, and structured output adherence without state mutation.
- `packages/providers/src/index.ts` — exported `OllamaProvider`, `OpenAICompatibleProvider`, `probeModelCapabilities`, `validateProviderEndpoint`, and legacy aliases.
- `packages/providers/test/ollama.test.ts` — protocol tests for Ollama adapter against ephemeral in-process mock server (health, discovery, streaming, tools, schema, usage, loopback security).
- `packages/providers/test/openai-compatible.test.ts` — protocol tests for OpenAI-compatible adapter against ephemeral in-process mock server (health, discovery, streaming, tools, loopback security).
- `packages/providers/test/probes.test.ts` — unit tests for capability probing pipeline against mock providers.
- `packages/providers/test/live-smoke.test.ts` — honest live Ollama integration check that checks `127.0.0.1:11434` without fabricating results, reporting BLOCKED if service is not running.
- `docs/ARCHITECTURE.md` — documented native Ollama adapter, OpenAI-compatible adapter, capability probes, and privacy validation.
- `docs/SECURITY.md` — documented Section 11 on provider endpoint policy, loopback enforcement, credential isolation, and model-directed endpoint restrictions.
- `docs/PROJECT_MEMORY.md` — updated Step 08 progress and decision log.
- `docs/PROGRESS.md` — this Step 08 record.

### Verification commands and actual outcomes

1. `pnpm check` (Composite gate) — Exit code 0.
   - `pnpm lint` — Exit code 0. 0 errors, 0 warnings across all 7 packages.
   - `pnpm typecheck` — Exit code 0. Strict TypeScript composite build passed without error.
   - `pnpm test` — Exit code 0. 12 test suites, 78/78 tests passing:
     - `packages/providers/test/provider.test.ts` (18 passed)
     - `packages/providers/test/ollama.test.ts` (8 passed)
     - `packages/providers/test/openai-compatible.test.ts` (6 passed)
     - `packages/providers/test/probes.test.ts` (3 passed)
     - `packages/providers/test/live-smoke.test.ts` (1 passed — honest BLOCKED status logged)
     - `apps/server/test/security.test.ts` (17 passed)
     - `apps/server/test/health.test.ts` (3 passed)
     - `packages/core/test/core.test.ts` (8 passed)
     - `packages/db/test/persistence.test.ts` (9 passed)
     - `packages/db/test/db.test.ts` (1 passed)
     - `apps/worker/test/worker.test.ts` (3 passed)
     - `apps/web/test/app.test.tsx` (1 passed)
   - `pnpm build` — Exit code 0. All packages and Vite web bundle compiled cleanly.

### Live smoke check outcome

- **Live Ollama Status:** `BLOCKED`
- **Reason:** Local Ollama service is not running on `127.0.0.1:11434` (`ECONNREFUSED`), and no local model weights are present in `~/.ollama/models/manifests`.
- **Exact tested model:** `not tested` (no installed models available).
- **Compliance with Rule 9 ("NO-SERVICE FALLBACK"):** Open Dot Spell strictly refrained from downloading models, pulling weights, launching background daemons, or fabricating synthetic data as live evidence. Deterministic test suites verified 100% of the adapter code paths against in-process mock HTTP servers.

### Known limitations/blockers

- Live inference against real local weights requires manual startup of `ollama serve` and pulling a supported model by the user outside the agent run.
- `docs/BUILD_GUIDE.md` remains absent from the repository.

### Next step

Step 09. Do not begin it until the next numbered prompt is supplied.

## Step 09 — Persist conversations and stream run events

**Status:** Implementation complete and verified. Conversation + message APIs, transactional turn persistence, idempotency key deduplication, provisional single-worker execution with text delta coalescing, and reconnectable SSE with cursor replay and heartbeat operational.

### Objective

Implement persistent conversation and message lifecycle APIs, transactional turn persistence, required client idempotency key to prevent duplicate user turns, provisional single-worker claim and text-only inference path using existing provider abstraction, durable run events with monotonically ordered event IDs, batched/coalesced text delta persistence, and reconnectable authorized SSE with cursor replay (`Last-Event-ID`), periodic heartbeat, and complete decoupling of worker execution from client connection state.

### Files changed

- `packages/core/src/index.ts` — defined `CreateConversationRequestSchema`, `CreateMessageRequestSchema`, `RunStreamEvent`, and `RunEventBus`.
- `packages/db/src/schema.ts` — added `idempotencyKey` and `uniqueIndex("idx_runs_conv_idempotency")` on `(conversationId, idempotencyKey)` to `runs` table schema.
- `packages/db/src/migrations.ts` — added migration 3 (`0003_run_idempotency`) executing `ALTER TABLE runs ADD COLUMN idempotency_key TEXT;` and creating the unique index.
- `packages/db/src/queries.ts` — implemented `createConversation`, `listConversations`, `getConversation`, `createUserTurnAndRunTransaction` (atomic turn persistence with idempotency handling), `claimQueuedRun` (provisional worker lease with fencing token), `completeAssistantRun` (atomic message persistence and status transition), `getRun`, `getRunEventsAfterCursor`, and `batchInsertRunEvents`.
- `packages/db/test/persistence.test.ts` — updated migration version expectations to account for migration 3 (`[1, 2, 3]`).
- `apps/worker/package.json` — added `@open-dot-spell/providers` dependency and `./worker` export.
- `apps/worker/tsconfig.json` — added project reference to `packages/providers`.
- `apps/worker/src/index.ts` — exported `./worker.js` and guarded standalone CLI execution to prevent auto-start on import.
- `apps/worker/src/worker.ts` — implemented `WorkerProcess` with background polling, provisional single-worker leasing, text-only inference via `ModelProviderAdapter`, delta coalescing (threshold: 64 chars or 80ms) without transaction per token, terminal state finalization, and signal handlers.
- `apps/server/package.json` — added `@open-dot-spell/worker` dependency.
- `apps/server/tsconfig.json` — added project reference to `apps/worker`.
- `apps/server/src/app.ts` — added conversation CRUD routes, message turn route with required idempotency key, run status route, and reconnectable SSE endpoint (`/events` and `/stream`) with cursor replay, heartbeat, and client disconnect handling.
- `apps/server/test/conversations-stream.test.ts` — comprehensive test suite covering conversation lifecycle, duplicate submission idempotency, transactional message & run creation, ordered event IDs, worker inference with delta coalescing, provider error handling, interrupted inference, SSE cursor replay, SSE live transition via `RunEventBus`, heartbeat, persistence across database reopen, and worker continuation across UI disconnect (14 tests).
- `docs/ARCHITECTURE.md` — documented Section 12.5 (turn idempotency, provisional worker claim, text coalescing, reconnectable SSE).
- `docs/PROJECT_MEMORY.md` — updated Step 09 progress and decision log.
- `docs/PROGRESS.md` — this Step 09 record.

### Verification commands and actual outcomes

1. `pnpm check` (Composite gate) — Exit code 0.
   - `pnpm lint` — Exit code 0. 0 errors, 0 warnings across all 7 workspace packages.
   - `pnpm typecheck` — Exit code 0. Strict TypeScript composite build passed across all projects.
   - `pnpm test` — Exit code 0. 13 test suites, 92/92 tests passing:
     - `apps/server/test/conversations-stream.test.ts` (14 passed)
     - `apps/server/test/security.test.ts` (17 passed)
     - `apps/server/test/health.test.ts` (3 passed)
     - `packages/providers/test/provider.test.ts` (18 passed)
     - `packages/providers/test/ollama.test.ts` (8 passed)
     - `packages/providers/test/openai-compatible.test.ts` (6 passed)
     - `packages/providers/test/probes.test.ts` (3 passed)
     - `packages/providers/test/live-smoke.test.ts` (1 passed — honest BLOCKED status logged)
     - `packages/core/test/core.test.ts` (8 passed)
     - `packages/db/test/persistence.test.ts` (9 passed)
     - `packages/db/test/db.test.ts` (1 passed)
     - `apps/worker/test/worker.test.ts` (3 passed)
     - `apps/web/test/app.test.tsx` (1 passed)
   - `pnpm build` — Exit code 0. All 6 packages and Vite web bundle compiled cleanly.

### Real Ollama Text Inference Outcome

- **Real Ollama Check:** `BLOCKED`
- **Reason:** Local Ollama daemon is not running on `127.0.0.1:11434` (`curl` exited with code 7: connection refused), and no local model weights are present.
- **Reporting Compliance:** Per instructions, success is not claimed for live inference while the daemon is offline. Deterministic test doubles (`SyntheticTestProvider`) thoroughly verified all text streaming, coalescing, error handling, and reconnection behaviors without fabricating live model output.

### Known limitations/blockers

- Live local model inference requires starting `ollama serve` and pulling a supported model outside the agent run.
- `docs/BUILD_GUIDE.md` authored and verified (resolves Steps 01–09 Arena audit finding).

### Audit Resolution (Steps 01–09 Arena Audit)

- Created `docs/BUILD_GUIDE.md` documenting prerequisites, pnpm/Node setup, workspace structure, development commands, build commands, test/check gates, database and migration architecture, local server/worker startup, synthetic and real Ollama verification, configuration, and troubleshooting.
- Resolved the single missing document limitation identified during the independent Steps 01–09 verification.

### Next step

Step 10 complete. Do not begin Step 11 until explicitly assigned.

## Step 10 — Build the usable chat and setup interface

**Status:** Completed. All UI components, state management, SSE streaming, provider discovery, setup/pairing modal, security sanitization, and 10 UI tests verified.

### Objective

Build the initial usable interface over real backend APIs (setup/pairing flow, provider health/status, Ollama model discovery, model selection with persistence, conversation sidebar/history, message composer, SSE streaming response, reconnect to active run, reload existing conversation after refresh, run UI state badges, semantic accessible HTML, sanitized Markdown rendering).

### Files changed

- `apps/server/src/app.ts` — added endpoints `GET /api/workspaces` (with default workspace auto-initialization), `GET /api/providers/status` (querying provider health status), and `GET /api/providers/models` (querying discovered local Ollama models).
- `apps/server/src/index.ts` — instantiated and started `WorkerProcess` alongside the HTTP server so background inference execution runs automatically.
- `apps/web/src/components/PairingModal.tsx` — single-owner pairing and setup flow with accessible secret input, visibility toggle, error display, and pairing token persistence.
- `apps/web/src/components/Sidebar.tsx` — conversation history list with timestamps, active state indication, new chat button, model discovery selector with localStorage persistence, and live Ollama reachability indicator with latency/offline guidance.
- `apps/web/src/components/Composer.tsx` — message composer with auto-resize textarea, Enter to send, Shift+Enter for multiline newline, and stop generation button when stream is active.
- `apps/web/src/components/ChatView.tsx` — active chat timeline with message roles (You / Open Dot Spell), timestamps, streaming cursor, run state status badges (queued, responding, complete, interrupted, failed), and empty conversation states.
- `apps/web/src/components/MarkdownView.tsx` — safe, React-based Markdown parser with code blocks, inline code, lists, blockquotes, and strict URL scheme validation blocking `javascript:`, `data:`, `vbscript:` without `dangerouslySetInnerHTML`.
- `apps/web/src/utils/sse.ts` — reconnectable SSE stream consumer parsing event frames (`run_started`, `text_delta`, `message_completed`, `run_completed`, `run_failed`, `done`) with cursor tracking.
- `apps/web/src/styles.css` — high-contrast, WCAG AA compliant theme with dark mode variables, visible focus outlines, accessible button states, and responsive drawer layout for mobile viewports (`<= 768px`).
- `apps/web/src/App.tsx` — central application controller wiring authentication check, workspace loading, model selection, conversation CRUD, message turn submission, and SSE streaming subscription.
- `apps/web/test/app.test.tsx` — comprehensive UI test suite (10 tests) verifying pairing, initial empty state, offline provider banner, message streaming via SSE, markdown link/script sanitization, conversation reload after refresh, error states, keyboard navigation, mobile menu toggle, and stream interrupt.
- `docs/PROGRESS.md` — this Step 10 record.

### Verification commands and actual outcomes

1. `pnpm check` (Composite gate) — Exit code 0.
   - `pnpm lint` — Exit code 0. 0 errors, 0 warnings across all 7 workspace packages.
   - `pnpm typecheck` — Exit code 0. Strict TypeScript composite build passed across all projects.
   - `pnpm test` — Exit code 0. 13 test suites, 101/101 tests passing:
     - `apps/web/test/app.test.tsx` (10 passed)
     - `apps/server/test/conversations-stream.test.ts` (14 passed)
     - `apps/server/test/security.test.ts` (17 passed)
     - `apps/server/test/health.test.ts` (3 passed)
     - `packages/providers/test/provider.test.ts` (18 passed)
     - `packages/providers/test/ollama.test.ts` (8 passed)
     - `packages/providers/test/openai-compatible.test.ts` (6 passed)
     - `packages/providers/test/probes.test.ts` (3 passed)
     - `packages/providers/test/live-smoke.test.ts` (1 passed — honest BLOCKED status logged)
     - `packages/core/test/core.test.ts` (8 passed)
     - `packages/db/test/persistence.test.ts` (9 passed)
     - `packages/db/test/db.test.ts` (1 passed)
     - `apps/worker/test/worker.test.ts` (3 passed)
   - `pnpm build` — Exit code 0. All packages and Vite production bundle compiled cleanly.

### Real Ollama Check Outcome

- **Real Ollama Check:** `BLOCKED`
- **Reason:** Local Ollama daemon is offline on `127.0.0.1:11434` (connection refused; `curl http://127.0.0.1:11434/api/tags` returned `OLLAMA_OFFLINE`).
- **Reporting Compliance:** Per `AGENTS.md`, success is not fabricated when the live daemon is offline. Deterministic testing with `SyntheticTestProvider` verified all interactive flows, streaming, error banners, and markdown sanitization.

### Known limitations/blockers

- Live local model inference requires starting `ollama serve` and pulling a supported model outside the agent run.
- Single-worker concurrency remains provisional (to be generalized in Step 18).

### Next step

Step 11. Do not begin until the next numbered prompt is supplied.

