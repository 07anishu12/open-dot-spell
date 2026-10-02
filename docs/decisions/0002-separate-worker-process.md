# ADR 0002: Separate Worker Process for Durable Execution

## Decision
Execute long-running tasks, tool invocations, and model orchestration in a dedicated background worker process (or decoupled worker thread pool) rather than inside the synchronous HTTP request/response cycle of the API server.

## Context
Tasks in Open Dot Spell (such as workspace summarization, repository analysis, and test execution) can run for minutes, require streaming model interaction, pause for human approval, and survive unexpected interruptions. If task execution is coupled to the HTTP server process, restarting the API or reloading the web page would kill in-progress work.

## Alternatives Considered
1. **In-Process HTTP Handlers:** Execute tasks directly inside the API request handler. This causes HTTP timeouts, blocks the event loop, and drops running work if the browser disconnects or the server reloads.
2. **External Distributed Queue (Celery, BullMQ, Temporal):** Robust, but introduces mandatory Redis/RabbitMQ or external orchestrator daemons, violating our local-first, minimal-infrastructure principle.
3. **In-Memory Thread Pool without DB Leases:** Simpler, but loses tasks completely on process termination with no recovery checkpoint.

## Consequences
- **Positive:**
  - Tasks continue running independently of user interface navigation or browser tab closures.
  - Workers claim tasks using database leases (`runs` table with expiration and fencing tokens).
  - Clear crash recovery semantics: Dead workers are detected by expired leases, allowing clean resumption.
  - The API server remains responsive for UI queries and approvals even during heavy model inference.
- **Negative:**
  - Requires inter-process coordination via SQLite leases and event polling or notifications.
  - Requires handling stale workers and lease expiration.

## Revisit Conditions
Revisit if a lightweight unified single-process architecture with strict background task fibers proves simpler to test and distribute while preserving identical crash recovery semantics.
