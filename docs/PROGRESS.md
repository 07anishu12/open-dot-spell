# OpenDoor Progress

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
- The assigned workspace is writable but is not a Git repository and contains no OpenDoor source, manifest, lockfile, `AGENTS.md`, `CLAUDE.md`, `docs/BUILD_GUIDE.md`, or pre-existing progress file.

### Manual checks

- Verified the assigned directory is writable.
- Verified app bundle presence without launching Ollama or Docker.
- Excluded hardware serial numbers, UUIDs, and provisioning identifiers from the documentation.
- Did not install tools, pull model weights, enable background services, inspect unrelated Desktop directories, or contact a remote model provider.

### Unresolved limitations

- The current workspace cannot be confirmed as the separate OpenDoor development repository. No application changes or commit can safely be made until that repository is supplied.
- Node 24 LTS is the selected baseline, but only Node 26 Current is installed in the assigned workspace.
- pnpm 12.x is not installed.
- No exact local Ollama model identifiers or digests can be recorded until the server is manually available.
- The provisional `gemma4:e2b` candidate has not been downloaded or capability-tested. No benchmark or workload result is claimed.
- Docker is available only as an installed CLI/app; its daemon state remains unverified.

### Next step

Provide or switch to the separate writable OpenDoor Git development repository, then repeat the repository-instruction and manifest checks there before starting the next numbered step. Do not begin application implementation in this workspace.
