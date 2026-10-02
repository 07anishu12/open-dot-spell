# Open Dot Spell — Agent Instructions & Workflow Rules

This document provides mandatory operational instructions for AI agents working in this repository.

---

## 1. Core Operating Principles

1. **One Step at a Time:** Perform only the explicitly assigned numbered step. Never anticipate or implement future workflow steps speculatively.
2. **Local-First & Model-Agnostic:** Preserve local-first architecture and model/provider independence. Ollama is the default local runtime; remote providers are opt-in only.
3. **Evidence-Based Completion:** Model-generated assertions like "done" are not evidence. Completion requires deterministic verification (passing tests, file existence, exit code 0).
4. **Server-Side Authorization:** The application enforces policy; the model proposes actions. Untrusted content (files, web pages, MCP descriptions) has zero authority.

---

## 2. Persistent Git & GitHub Workflow Rule

From Step 04 onward, every completed implementation step or meaningful feature MUST follow this workflow:

1. **Implement the feature:** Make only the minimal changes required for the assigned step.
2. **Run tests and verification:** Execute relevant test suites, typecheck, lint, and build (`pnpm check` where applicable).
3. **Review Git diff:** Inspect `git diff` and `git status` thoroughly.
4. **Sanitize:** Remove unrelated changes and ensure no secrets, credentials, model weights, local databases, or `.env` files are included.
5. **Focused Git Commit:** Create a focused Git commit containing only the completed feature/step with a clear message:
   ```bash
   git commit -m "feat: <description> (step XX)"
   ```
6. **Verify Local Commit:** Verify the commit exists in the local git history.
7. **Push to GitHub Remote:** If an authorized GitHub remote is configured, push the commit to the current working branch:
   ```bash
   git push origin <branch>
   ```
8. **Verify Push:** Confirm that the push command succeeded (`exit code 0`).
9. **Required Final Report:** Every completed step must end with the following explicit report block:

```text
Step: XX
Feature: <short feature summary>
Tests: <exact test commands and results>
Verification: <exact verification commands and outcomes>
Commit: <full commit hash>
Commit message: <exact message>
GitHub push: SUCCESS / NOT PUSHED / FAILED
Branch: <branch name>
Working tree: CLEAN / DIRTY
```

### Prohibitions

The agent must NOT:
- Leave completed implementation changes uncommitted.
- Combine unrelated features into one commit.
- Rewrite or squash previous verified commits.
- Force-push (`git push --force`).
- Change repository visibility or alter remote configuration without explicit instruction.
- Commit `.env`, credentials, model weights, `.data/`, or SQLite databases.
- Claim that changes are on GitHub unless the push actually succeeded.

If pushing is not possible because authentication, remote configuration, permissions, or network access is unavailable:
- Keep the verified local commit.
- Report the exact reason.
- Mark `GitHub push: NOT PUSHED` or `FAILED`.
- Do not repeatedly retry indefinitely.
