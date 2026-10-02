# Open Dot Spell — Backup and Disaster Recovery Design

**Status:** System Design for Step 05 (Durable Storage and Migrations).  
**Scope:** Single-host, local-first SQLite persistence backup architecture.

---

## 1. Overview and Core Philosophy

Open Dot Spell persists application metadata, conversations, messages, runs, and event ledgers in embedded SQLite with Write-Ahead Logging (WAL) enabled. 

In WAL mode, SQLite maintains two auxiliary files alongside the primary database file:
- `opendotspell.db-wal` (Write-Ahead Log containing active, uncheckpointed write transactions)
- `opendotspell.db-shm` (Shared-Memory index mapping WAL frames)

> [!CAUTION] Blind Filesystem Copies Cause Data Corruption
> Copying the main `.db` file using standard OS tools (`cp`, `rsync`) while the application is writing can create a corrupt or incomplete backup because active transactions reside in the `-wal` file. Backup operations must use SQLite-supported consistent snapshot mechanisms.

---

## 2. Supported Consistent Backup Strategy

### Primary Approach: SQLite Online Vacuum (`VACUUM INTO`)

SQLite provides the `VACUUM INTO '<destination-path>'` command (and SQLite Online Backup API). This command:
1. Acquires a read lock on the database.
2. Checks out consistent pages from both the main database and the WAL log.
3. Writes a compact, defragmented, standalone SQLite database file to the target path.
4. Completes without disrupting active readers or concurrent worker operations.

### Execution Pattern

```sql
VACUUM INTO '/Users/user/.opendotspell/backups/opendotspell-backup-2026-10-03T00-00-00.db';
```

When using the `@libsql/client` or SQLite shell:
```typescript
export async function createBackup(client: Client, backupDir: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `opendotspell-backup-${timestamp}.db`);
  await client.execute(`VACUUM INTO '${backupPath}';`);
  return backupPath;
}
```

---

## 3. Backup Contents and Exclusions

### What is Backed Up

1. **SQLite Database Snapshot:**
   - Workspaces and directory permissions.
   - Conversations, ordered message histories.
   - Durable goals, tasks, runs, and append-only run event logs.
   - Approvals and cryptographic action fingerprints.
   - Artifact metadata, provenance links, and SHA-256 hashes.
   - Schema migration ledger (`_migrations`).

### What is NOT Backed Up in the Database Snapshot

- **Actual Workspace Source Repositories:** User code repositories are managed by Git on the host filesystem.
- **Large Artifact Blobs:** File artifacts (patches, generated documents) reside on the filesystem under `.opendotspell/artifacts/`.
- **Model Weights:** GGUF/bin model weights reside in Ollama's local storage cache and are not duplicated into application backups.
- **Temporary Staging Files:** Uncommitted partial writes in `.opendotspell/staging/` are excluded.

---

## 4. Backup Storage Location and Retention

- **Default Location:** `.data/backups/` or `~/.opendotspell/backups/`
- **Permissions:** Restrictive user-only permissions (`chmod 0700` for directory, `chmod 0600` for backup files).
- **Naming Convention:** `opendotspell-backup-YYYY-MM-DDTHH-MM-SS.db`
- **Retention Policy:**
  - Keep 7 daily backups.
  - Automatically prune snapshots older than 30 days.

---

## 5. What is Explicitly Deferred

- Automatic background cloud replication (S3, Dropbox, iCloud) is deferred.
- Interactive point-in-time recovery (PITR) UI is deferred.
- Encryption-at-rest with passphrase management is deferred to security hardening milestones.
