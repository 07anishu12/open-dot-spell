# Open Dot Spell

An open-source, model-agnostic personal AI assistant powered by local and open models.

Open Dot Spell is designed as a single-owner, local-first personal assistant rather than a generic chatbot. It turns persistent human responsibilities into durable, inspectable, bounded work.

---

## Workspace Structure

```text
apps/
  web/       # Minimal React/Vite application shell
  server/    # Fastify local API server (/api/health)
  worker/    # Decoupled background execution worker process

packages/
  core/      # Domain schemas, Zod validators, action fingerprinting
  db/        # Drizzle ORM schema and LibSQL / SQLite client
  providers/ # Model provider interfaces and Ollama adapter stubs
```

---

## Verified Developer Commands

All commands below have been tested and verified locally with Node.js 26 and pnpm 12.8.

### 1. Installation
Install all monorepo dependencies and generate/verify the lockfile:
```bash
pnpm install
```

### 2. Linting
Run ESLint 9 across all packages and apps:
```bash
pnpm lint
```

### 3. Type Checking
Perform strict TypeScript project reference verification:
```bash
pnpm typecheck
```

### 4. Automated Tests
Run Vitest across all unit, smoke, and contract test suites:
```bash
pnpm test
```

### 5. Production Build
Build all packages and compile the web client bundle:
```bash
pnpm build
```

### 6. Full Verification Gate
Run lint, typecheck, test, and build in sequence:
```bash
pnpm check
```

---

## Running the Application

### 1. Start the API Server
```bash
node apps/server/dist/index.js
```
The server listens on `http://127.0.0.1:3000`.

### 2. Verify Server Health
Query the deterministic health endpoint:
```bash
curl -i -H "Host: 127.0.0.1:3000" http://127.0.0.1:3000/api/health
```
Expected response:
```json
{
  "status": "healthy",
  "version": "0.1.0-alpha",
  "privacy_mode": "local_only",
  "database": "connected",
  "worker": "active"
}
```

### 3. Start the Background Worker
```bash
node apps/worker/dist/index.js
```
The worker starts in standby mode and cleanly shuts down on `SIGINT` or `SIGTERM`.

### 4. Start the Web Development UI
```bash
pnpm --filter @open-dot-spell/web dev
```
Open `http://127.0.0.1:5173` in your browser. The UI displays the system readiness status fetched from the local API server.
