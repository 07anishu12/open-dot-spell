# Open Dot Spell — Storage Architecture and Boundaries

**Status:** Architecture and Storage Boundaries Specification for Step 05.  
**Scope:** Single-host, local-first storage design.

---

## 1. Storage Boundaries: SQLite vs. Filesystem

Open Dot Spell maintains an intentional division between relational state stored in SQLite and file blobs stored on the local filesystem.

| Data Type | Storage Layer | Justification |
| :--- | :--- | :--- |
| **Workspaces, Allowed/Denied Globs** | SQLite | Relational queryability, atomic updates. |
| **Conversations & Message Turns** | SQLite | Strict sequence numbering, conversational retrieval. |
| **Goals, Plans, Tasks, Runs** | SQLite | Relational state machines, transactional leasing, fencing tokens. |
| **Run Events & Audit Logs** | SQLite | Append-only event streams, relational joins on `run_id`. |
| **Approvals & Action Fingerprints** | SQLite | Atomic single-use consumption (`consumed_at`), verification. |
| **Artifact Metadata & Provenance** | SQLite | Searchable index, SHA-256 content hashes, source references. |
| **Artifact Content Blobs (>64 KB)** | Filesystem | Prevent SQLite database bloat and excessive page fragmentation. |
| **User Code Repositories** | Filesystem | Managed directly on host/container workspace paths. |
| **Temporary Write Staging** | Filesystem | Staging directory (`~/.opendotspell/staging/<hash>.tmp`). |
| **Model Weights & Cache** | External Runtime | Managed independently by Ollama (`~/.ollama/models`). |

---

## 2. Supported Single-Host Storage Model

Open Dot Spell runs strictly on a single host. 

- **No Remote Database Server:** No network-attached database (PostgreSQL, MySQL) is required or supported.
- **Embedded Database:** Embedded SQLite via `@libsql/client` with local file URLs (`file:${DATABASE_PATH}`).
- **Configurable Location:** Configured via `DATABASE_PATH` environment variable. Defaults to `.data/opendotspell.db` in development and `~/.opendotspell/opendotspell.db` in user installations.
- **Directory Creation:** The database initialization layer automatically creates parent directories (`.data/`) if they do not exist.
- **Git Protection:** `.data/`, `*.db`, `*.db-wal`, and `*.db-shm` are excluded in `.gitignore` and must never be committed.

---

## 3. SQLite Safety Configuration

To ensure database consistency, prevent data loss, and eliminate concurrency deadlocks, the following pragmas are executed on every connection:

1. **Foreign Key Enforcement (`PRAGMA foreign_keys = ON;`):**
   - Enforces referential integrity at the database engine level.
   - Prevents orphaned messages or run events.
2. **Write-Ahead Logging (`PRAGMA journal_mode = WAL;`):**
   - Allows concurrent readers while a single writer commits.
   - Eliminates read/write contention between the API server and the background worker.
3. **Busy Timeout (`PRAGMA busy_timeout = 5000;`):**
   - Configures a 5-second automatic kernel wait on write lock contention before returning `SQLITE_BUSY`.
   - Paired with application-level exponential backoff with jitter (`withLockRetry`).
4. **Synchronous Mode (`PRAGMA synchronous = NORMAL;`):**
   - Provides optimal balance of durability and write performance in WAL mode.
   - Commits WAL frames safely to disk on checkpoints.

---

## 4. Short-Lived Transactions

Long-running operations (such as LLM generation, web requests, container test runs) must **never** hold an open SQLite transaction.

**Allowed in a Transaction:**
- Reading task metadata + updating lease timestamp (sub-millisecond).
- Transitioning Run status + inserting RunEvent (sub-millisecond).
- Inserting a message turn (sub-millisecond).

**Prohibited in a Transaction:**
- Calling Ollama API (`/api/chat`).
- Running Docker container commands.
- Reading external network URLs.
- Awaiting user human approvals.
