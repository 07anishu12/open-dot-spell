# ADR 0005: Isolated Code Execution via Constrained Sandboxes

## Decision
Execute all model-generated code, script evaluations, and repository test suites inside an isolated, constrained execution environment (container sandbox) rather than executing arbitrary shell commands directly on the host operating system.

## Context
A key capability of Open Dot Spell is assisting developers with coding tasks, repository inspection, refactoring, and running automated tests. However, executing arbitrary shell code on the host machine poses extreme risks: malicious code could access host secrets (`~/.ssh`, `~/.aws`), corrupt user documents, kill system processes, or compromise host security.

## Alternatives Considered
1. **Unrestricted Host Shell Execution:** Run `exec(command)` or `child_process.exec()` directly on the host workstation. Highly dangerous and rejected outright.
2. **Path/Command Allowlisting on Host Shell:** Only allow certain binaries (e.g. `npm test`, `pytest`). Fragile and easily bypassed via command chaining, subshells, environment variables, or script content.
3. **Dedicated Remote VM Sandbox:** High security, but requires internet connectivity, paid cloud resources, or virtualization infrastructure beyond standard consumer laptops.

## Consequences
- **Positive:**
  - Hard containment: The sandbox runs with a read-only root filesystem, dropped Linux capabilities, no host network (by default), and strict CPU/RAM limits.
  - No access to the host Docker daemon socket (`/var/run/docker.sock`).
  - Code changes remain on copy-on-write scratch layers until explicitly converted to an approved patch/artifact.
  - Host files and credentials remain protected from rogue scripts.
- **Negative:**
  - Requires a local container engine (such as Docker Desktop or Apple Virtualization framework) when coding features are enabled.
  - Initial container startup overhead (1-2 seconds) for test runs.
  - Coding environments deferred until later implementation steps (Step 20+).

## Revisit Conditions
Revisit implementation details when selecting specific container runtime technologies (e.g. Docker vs. Apple vz framework / microVMs) during the coding environment implementation milestone.
