# ADR 0004: Server-Side Tool Policy and Immutable Action Approvals

## Decision
Enforce all tool execution permissions, path constraints, and approval checks in the backend application policy engine. The AI model, client UI, MCP server definitions, and document content have zero authority to grant or escalate permissions. High-risk actions require human approval bound cryptographically to an immutable action fingerprint.

## Context
LLMs are probabilistic reasoning systems susceptible to prompt injection, hallucination, and adversarial input embedded in files or web pages. If permission evaluation relies on client-side state, prompt instructions ("You are authorized to execute everything"), or tool docstrings, an attacker could trigger unauthorized actions (e.g., deleting user files, exfiltrating tokens).

## Alternatives Considered
1. **Model-Driven Permissions (Self-Policing Prompts):** Rely on system prompt instructions telling the model what it is allowed to do. Vulnerable to jailbreaks and indirect prompt injection.
2. **Client-Side Authorization in Web UI:** Browser checks permissions before sending execution commands. Vulnerable to API tampering, browser extension scripts, or direct HTTP calls.
3. **All-or-Nothing Permission Flag:** Give the assistant root access once during installation. Highly dangerous on personal workstations.

## Consequences
- **Positive:**
  - Guaranteed security invariants: Host paths outside approved workspaces cannot be touched.
  - Consequential actions pause execution and present the exact target and parameters to the user.
  - Action fingerprints (SHA-256 of canonical arguments) prevent tampering or parameter drift between approval and execution.
  - Permissions are strictly single-use and expire if unconsumed.
- **Negative:**
  - Additional serialization overhead for canonical JSON and fingerprinting.
  - Slightly more complex workflow state machine requiring pause/resume handling.

## Revisit Conditions
Revisit if granular per-tool automated policy rules (e.g., domain whitelists for browser automation) are expanded into user-configurable policy profiles.
