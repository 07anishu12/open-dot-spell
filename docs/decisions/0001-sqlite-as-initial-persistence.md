# ADR 0001: SQLite as Initial Persistence

## Decision
Use embedded SQLite with Write-Ahead Logging (WAL) mode as the persistence store for Open Dot Spell's single-owner application state, metadata, event ledgers, leases, and artifacts.

## Context
Open Dot Spell is a local-first, single-user desktop application designed to run on a personal laptop. It requires durable persistence across application restarts for conversations, tasks, runs, tool calls, and approval records. 

Running a dedicated database service (like PostgreSQL or MySQL) or a distributed store would significantly increase setup friction, background resource overhead, and administrative failure modes for a single-user system.

## Alternatives Considered
1. **Plain JSON / Flat Files:** Easy to inspect, but lacks atomic transactions, indexed queries, crash recovery, and transactional locking needed for concurrent worker leases.
2. **PostgreSQL / MySQL:** Provides strong concurrency and features, but requires a background daemon, separate installation/configuration, and non-trivial memory overhead.
3. **Embedded Key-Value Stores (e.g., RocksDB, LevelDB):** Fast, but lacks structured relational querying, foreign keys, and familiar migration tooling.

## Consequences
- **Positive:**
  - Zero external setup: Single local file (`~/.opendotspell/opendotspell.db`).
  - High performance: Sub-millisecond reads, transactional ACID guarantees.
  - WAL mode allows concurrent readers while a single writer commits.
  - Full relational modeling and schema migration support.
- **Negative:**
  - Single writer limitation requires handling `SQLITE_BUSY` with backoff and keeping write transactions short.
  - Long transactions across network or model inference calls must be strictly avoided.

## Revisit Conditions
Revisit if multi-user concurrency or distributed node operation is explicitly introduced in a future major milestone.
