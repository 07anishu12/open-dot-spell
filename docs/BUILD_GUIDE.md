# Open Dot Spell — Build & Developer Guide

This document is the definitive technical guide for setting up, building, running, testing, and developing the **Open Dot Spell** repository.

---

## 1. Prerequisites

Before setting up the repository, ensure your local environment satisfies the following requirements:

| Component | Minimum Version | Verified Local Baseline | Purpose |
| :--- | :--- | :--- | :--- |
| **Operating System** | macOS 14+, Linux x86_64/arm64 | macOS 27.0.1 Darwin arm64 (Apple Silicon) | Primary host platform |
| **Node.js** | `>=24.0.0` (pinned in `package.json#engines`) | `v26.10.0` | JavaScript runtime |
| **pnpm** | `12.8.1` (pinned in `package.json#packageManager`) | `12.8.1` | Fast, disk-efficient workspace package manager |
| **Git** | `>=2.40.0` | `2.55.0` | Version control & atomic commit workflows |
| **Ollama** *(Optional)* | `>=0.3.0` | `0.34.4` | Local inference engine (optional; synthetic test doubles provide 100% test coverage) |

> [!IMPORTANT]
> Open Dot Spell strictly enforces loopback-only networking (`127.0.0.1`, `localhost`, `::1`). It refuses to bind to non-loopback network interfaces (`0.0.0.0` or external LAN IPs) to maintain local privacy boundaries.

---

## 2. Node.js & pnpm Setup

### 2.1 Enable or Install pnpm

If you have Corepack enabled with Node.js:

```bash
corepack enable
corepack prepare pnpm@12.8.1 --activate
```

Alternatively, install pnpm globally via npm or standalone script:

```bash
npm install -g pnpm@12.8.1
```

Verify your installed versions:

```bash
node -v   # Must be >= 24.0.0
pnpm -v   # Must be 12.8.1
```

### 2.2 Install Dependencies

From the root of the repository, run:

```bash
pnpm install --frozen-lockfile
```

This installs all dependencies across the monorepo workspaces and links local packages according to `pnpm-workspace.yaml`.

---

## 3. Workspace Architecture

Open Dot Spell is organized as a modular TypeScript monorepo with strict package boundaries:

```text
Free-dots/
├── apps/
│   ├── server/             # Fastify local REST & SSE API server (@open-dot-spell/server)
│   ├── web/                # Vite + React 19 single-owner frontend shell (@open-dot-spell/web)
│   └── worker/             # Decoupled background execution engine (@open-dot-spell/worker)
├── packages/
│   ├── core/               # Domain types, Zod schemas, crypto & event bus (@open-dot-spell/core)
│   ├── db/                 # Embedded LibSQL SQLite, Drizzle schema & migrations (@open-dot-spell/db)
│   └── providers/          # Model provider adapters, probes & synthetic mocks (@open-dot-spell/providers)
├── docs/                   # Architectural specifications, PRD, security & memory
├── package.json            # Root scripts and workspace devDependencies
├── pnpm-workspace.yaml     # Workspace package globs
├── tsconfig.json           # Root TypeScript project reference coordinator
└── eslint.config.js        # Root ESLint configuration
```

### Package Roles and Dependencies

| Package / App | Path | Responsibilities | Dependencies |
| :--- | :--- | :--- | :--- |
| `@open-dot-spell/core` | `packages/core` | Request schemas, crypto utils (AES-256-GCM, PBKDF2), secret masking, log sanitization, `RunEventBus`. | `zod` |
| `@open-dot-spell/db` | `packages/db` | SQLite configuration (WAL mode, foreign keys), schema definition, migrations 1-3, atomic query transactions. | `@libsql/client`, `drizzle-orm`, `@open-dot-spell/core` |
| `@open-dot-spell/providers` | `packages/providers` | `ModelProviderAdapter` contract, `OllamaProvider`, `OpenAICompatibleProvider`, `SyntheticTestProvider`, capability probes. | `@open-dot-spell/core` |
| `@open-dot-spell/server` | `apps/server` | Loopback Fastify HTTP server, pairing authentication, conversation CRUD, transactional turn ingestion, SSE event stream. | `fastify`, `@fastify/cors`, `@fastify/cookie`, `@open-dot-spell/core`, `@open-dot-spell/db`, `@open-dot-spell/providers`, `@open-dot-spell/worker` |
| `@open-dot-spell/worker` | `apps/worker` | Background polling, atomic lease acquisition (`fencing_token`), token stream consumption, delta coalescing, error handling. | `@open-dot-spell/core`, `@open-dot-spell/db`, `@open-dot-spell/providers` |
| `@open-dot-spell/web` | `apps/web` | React 19 UI shell, SSE consumer, local conversation interface. | `react`, `react-dom`, `@open-dot-spell/core`, `vite` |

---

## 4. Development Commands

The repository provides root scripts for running development processes, compiling code, and executing verification gates:

### 4.1 Running Local Processes

| Command | Action | Default Port / Target |
| :--- | :--- | :--- |
| `pnpm dev:server` | Starts the Fastify API server with `ts-node/esm` loader | `http://127.0.0.1:3000` |
| `pnpm dev:worker` | Starts the background worker in polling execution mode | Reads SQLite database (`.data/opendotspell.db`) |
| `pnpm dev:web` | Starts the Vite development server for the UI shell | `http://127.0.0.1:5173` |
| `pnpm start` | Runs the compiled server entry point (`node ./dist/index.js`) | Requires prior `pnpm build` |

---

## 5. Build & Compilation Commands

Open Dot Spell uses TypeScript project references (`tsc -b`) to guarantee clean, incremental compilation across package boundaries:

```bash
# Build all packages and the web application bundle
pnpm build
```

This runs:
1. `tsc -b` on `packages/core`
2. `tsc -b` on `packages/db`
3. `tsc -b` on `packages/providers`
4. `tsc -b` on `apps/worker`
5. `tsc -b` on `apps/server`
6. `vite build` on `apps/web`

To build an individual workspace:

```bash
pnpm --filter @open-dot-spell/core build
pnpm --filter @open-dot-spell/db build
pnpm --filter @open-dot-spell/providers build
pnpm --filter @open-dot-spell/server build
pnpm --filter @open-dot-spell/worker build
pnpm --filter @open-dot-spell/web build
```

---

## 6. Verification & Quality Gates

Every implementation step in Open Dot Spell must pass the mandatory composite verification gate before commit:

```bash
# Run the complete verification gate (Lint -> Typecheck -> Test -> Build)
pnpm check
```

### 6.1 Individual Verification Commands

| Command | Action | Expected Outcome |
| :--- | :--- | :--- |
| `pnpm lint` | Runs `eslint .` across the workspace | 0 errors, 0 warnings |
| `pnpm typecheck` | Runs `tsc -b` composite type check | 0 TypeScript diagnostic errors |
| `pnpm test` | Runs `vitest run` across all 13 test suites | 92/92 tests passing |

### 6.2 Running Targeted Tests

To run test suites for a specific workspace:

```bash
# Run server integration tests
pnpm --filter @open-dot-spell/server test

# Run database and migration tests
pnpm --filter @open-dot-spell/db test

# Run provider adapter and contract tests
pnpm --filter @open-dot-spell/providers test
```

To run a single test file by path:

```bash
pnpm test -- apps/server/test/conversations-stream.test.ts
pnpm test -- apps/server/test/security.test.ts
pnpm test -- packages/providers/test/provider.test.ts
```

---

## 7. Database & Migrations

Open Dot Spell uses embedded SQLite managed by `@libsql/client` with Drizzle ORM schemas.

### 7.1 Database Characteristics

- **Storage Engine:** Embedded SQLite.
- **Default Database File:** `.data/opendotspell.db` in the repository root (created automatically).
- **Custom Location:** Set via `DATABASE_PATH` environment variable (e.g. `DATABASE_PATH=/path/to/custom.db`).
- **In-Memory Testing:** Supported via `DATABASE_PATH=:memory:`.
- **Concurrency & Pragmas:**
  - `PRAGMA foreign_keys = ON;` (Referential integrity enforced).
  - `PRAGMA journal_mode = WAL;` (Write-Ahead Logging for high concurrency).
  - `PRAGMA synchronous = NORMAL;` (Safe local durability without disk bottleneck).
  - `PRAGMA busy_timeout = 5000;` (5-second timeout on lock contention with automated retries).

### 7.2 Migrations

Migrations are stored in [`packages/db/src/migrations.ts`](file:///Users/anny/Desktop/Free-dots/packages/db/src/migrations.ts) and tracked in the `_migrations` table:

1. `0001_initial_schema`: Creates `workspaces`, `conversations`, `messages`, `runs`, and `run_events` tables and indexes.
2. `0002_provider_credentials`: Creates `provider_credentials` table for AES-256-GCM encrypted provider secrets.
3. `0003_run_idempotency`: Adds `idempotency_key` column to `runs` and unique index `idx_runs_conv_idempotency` on `(conversation_id, idempotency_key)`.

Migrations are executed automatically whenever `createDatabaseClient({ autoMigrate: true })` is invoked (default behavior during server and worker startup).

---

## 8. Server & Worker Runtime Startup

### 8.1 Local API Server Startup

Start the server:

```bash
pnpm dev:server
```

When started, the server outputs:
```text
==================================================================
  Open Dot Spell Local API Server (Single-Owner Model)
  Listening on: http://127.0.0.1:3000 (Loopback Only)
  Database path: /Users/anny/Desktop/Free-dots/.data/opendotspell.db
  One-Time Pairing Code: <64-character-hex-secret>
  (Valid for 15 minutes. Required to establish an authenticated UI session.)
==================================================================
```

#### Authentication & Pairing Flow
1. Copy the **One-Time Pairing Code** printed in stdout.
2. Pair via HTTP request:
   ```bash
   curl -X POST http://127.0.0.1:3000/api/auth/pair \
     -H "Content-Type: application/json" \
     -H "Host: 127.0.0.1:3000" \
     -d '{"pairingSecret": "<64-character-hex-secret>"}'
   ```
3. The server issues an `HttpOnly`, `SameSite=Strict` cookie named `opendotspell_session` and returns `{ success: true, token: "..." }`.
4. Subsequent requests can pass the cookie automatically or include the `x-opendotspell-session: <token>` header.

### 8.2 Worker Process Startup

Start the background worker in a separate terminal:

```bash
pnpm dev:worker
```

The worker:
- Connects to `.data/opendotspell.db`.
- Polls for runs with `status = 'queued'` or stale leases every 250ms.
- Acquires atomic leases using an incrementing `fencing_token`.
- Consumes tokens from the provider, coalesces deltas to SQLite (64 chars or 80ms threshold), and publishes to `RunEventBus`.
- Attaches `SIGINT` and `SIGTERM` handlers for graceful shutdown without orphan leases.

---

## 9. Model Providers: Synthetic vs. Live Ollama

### 9.1 Synthetic Test Provider (Default for Offline & CI)

The repository provides a complete deterministic test double in [`packages/providers/src/synthetic.ts`](file:///Users/anny/Desktop/Free-dots/packages/providers/src/synthetic.ts):
- Implements `ModelProviderAdapter` interface.
- Simulates realistic text streaming, tool calling, token counts, and error states without network access or model downloads.
- Used across the integration test suite to verify SSE streaming, cursor reconnects, and error handling deterministically.

To run synthetic provider tests:

```bash
pnpm --filter @open-dot-spell/providers test
```

### 9.2 Real Model Verification with Local Ollama

To verify real model inference locally:

1. **Install Ollama:** Download and install from [ollama.com](https://ollama.com).
2. **Start the Ollama daemon:**
   ```bash
   ollama serve
   ```
3. **Verify Ollama reachability:**
   ```bash
   curl -s http://127.0.0.1:11434/api/tags
   ```
4. **Pull an open model candidate:**
   ```bash
   # Lightweight candidate:
   ollama pull gemma:2b
   # Or standard general-purpose candidate:
   ollama pull llama3:8b
   ```
5. **Run the Live Smoke Test:**
   ```bash
   pnpm test -- packages/providers/test/live-smoke.test.ts
   ```
   - If Ollama is running and has models, the test probes real capabilities dynamically and exercises live chat streaming.
   - If Ollama is stopped or has no models, the test logs an honest `BLOCKED` status:
     ```text
     [Live Model Smoke Check]: Ollama service is not running on 127.0.0.1:11434. Live validation outcome: BLOCKED.
     ```
     The test passes deterministically without faking execution.

---

## 10. Environment Variables Reference

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `HOST` | `127.0.0.1` | Loopback bind address. Must be `127.0.0.1`, `localhost`, or `::1`. Any non-loopback host causes process termination. |
| `PORT` | `3000` | Port for the Fastify local API server. |
| `DATABASE_PATH` | `.data/opendotspell.db` | Absolute or relative path to the SQLite database file. Set to `:memory:` for ephemeral in-memory storage. |
| `ODS_PAIRING_SECRET` | Auto-generated 32-byte hex | Predefined pairing code for automated testing. If omitted, generated freshly on each startup. |
| `ODS_MASTER_KEY` | Derived from seed | 32-byte key used for AES-256-GCM encryption of provider credentials. |

---

## 11. Troubleshooting Common Local Development Failures

### 11.1 Port 3000 Already in Use (`EADDRINUSE`)
- **Symptom:** Fastify fails to bind to `127.0.0.1:3000`.
- **Remedy:** Check for existing Node processes:
  ```bash
  lsof -i :3000
  kill -9 <PID>
  ```

### 11.2 403 Forbidden: Missing Host Header / DNS Rebinding
- **Symptom:** HTTP requests return `{"error": "Forbidden: missing host header"}` or `{"error": "Forbidden: invalid host header"}`.
- **Remedy:** The server rejects DNS rebinding attempts. Ensure your client sends `Host: 127.0.0.1:3000` or `Host: localhost:3000`. When using `curl`, this is passed automatically.

### 11.3 403 Forbidden: Invalid Origin on Mutating Requests
- **Symptom:** `POST`, `PUT`, or `DELETE` requests return `{"error": "Forbidden: invalid origin for state-modifying request"}`.
- **Remedy:** Browser requests from unexpected origins are blocked. Only whitelisted loopback origins (`http://127.0.0.1:5173`, `http://localhost:5173`, etc.) or requests without an `Origin` header (CLI/curl) are permitted.

### 11.4 401 Unauthorized: Missing or Expired Session
- **Symptom:** Requests to `/api/workspaces/...` return `{"error": "Unauthorized: missing session"}`.
- **Remedy:** Establish an authenticated session using the pairing flow (`POST /api/auth/pair`) and pass the resulting session token in the `x-opendotspell-session` header or session cookie.

### 11.5 400 Bad Request: Missing Idempotency Key
- **Symptom:** Submitting a message to `/api/workspaces/:workspaceId/conversations/:conversationId/messages` returns `400 Invalid message payload`.
- **Remedy:** Every message creation request requires an `idempotencyKey` field in the JSON body (e.g. `{"content": "Hello", "idempotencyKey": "unique-client-key-123"}`) to prevent accidental duplicate turns.

### 11.6 SQLite Busy / Lock Contention (`SQLITE_BUSY`)
- **Symptom:** SQLite reports database locked during concurrent writes.
- **Remedy:** The LibSQL client includes `PRAGMA busy_timeout = 5000;` and queries use `withLockRetry` (up to 3 retries). Do not open `.data/opendotspell.db` in an external GUI editor with exclusive locks while tests or the worker are running.

### 11.7 TypeScript Composite Build Errors
- **Symptom:** `tsc -b` fails with `Cannot find module '@open-dot-spell/...'`.
- **Remedy:** Dependent packages must have their `.d.ts` declaration files built first. Run `pnpm build` from the repository root to build packages in topological order.
