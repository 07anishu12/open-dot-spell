# Open Dot Spell Reference Feature Map

**Step:** 02 — Define the product and reference feature map  
**Status:** Public-documentation/source inspection only. No reference project was run or tested, and no reference source, prompt, branding, or asset was copied.

## Research boundary

`docs/BUILD_GUIDE.md` is absent from the current repository, so the three reference names and URLs below were taken from the Step 02 brief rather than from that file. “OpenDots” is identified here as **CopilotKit/OpenDots** and “Open Dot” as **composio-community/open-dot**. Other public projects use similar names; these identities should be confirmed if a later build guide specifies different projects.

The revision values below were read from the public GitHub branch records during this step. They identify the public source inspected, not a claim that the projects were deployed or tested.

## Reference projects

### OpenDots — CopilotKit

- **Repository:** [github.com/CopilotKit/OpenDots](https://github.com/CopilotKit/OpenDots)
- **Branch/revision:** `main` at [`b01ac1f6a903e5e56c119d960901353ac0a3d171`](https://api.github.com/repos/CopilotKit/OpenDots/branches/main)
- **Documentation inspected:** [`README.md`](https://github.com/CopilotKit/OpenDots/blob/main/README.md), [`docs/SETUP.md`](https://github.com/CopilotKit/OpenDots/blob/main/docs/SETUP.md), [`docs/COMPUTERS.md`](https://github.com/CopilotKit/OpenDots/blob/main/docs/COMPUTERS.md)
- **Source entry points inspected:** [`src/server/page-tools.ts`](https://github.com/CopilotKit/OpenDots/blob/main/src/server/page-tools.ts), [`src/server/page-service.ts`](https://github.com/CopilotKit/OpenDots/blob/main/src/server/page-service.ts), [`src/server/runtime-scope.ts`](https://github.com/CopilotKit/OpenDots/blob/main/src/server/runtime-scope.ts)
- **Observed/documented pattern:** The README documents Spaces, specialist Dots, page conversations, and permissions. The inspected source checks a Dot's Space access before page operations; `PageService.conversation` checks access before creating a page conversation and again before binding its thread. `docs/COMPUTERS.md` documents per-Dot computers and distinguishes fixture checks from live-service verification.
- **Evidence classification:** Access checks are **observed in source**. Product descriptions and computer behavior are **documented claims**. No deployment or live-service behavior was tested.
- **Independent Open Dot Spell decision:** If the product introduces documents or agent workspaces, each operation will use an explicit authorization boundary and recheck that boundary at the operation boundary. Open Dot Spell will use its own policy, persistence, and execution design rather than adopting this project's SDK or storage layout.

### Open Dot — composio-community

- **Repository:** [github.com/composio-community/open-dot](https://github.com/composio-community/open-dot)
- **Branch/revision:** `main` at [`f838e17cf5c3a88ade5ceea54680a8145d048c1d`](https://api.github.com/repos/composio-community/open-dot/branches/main)
- **Documentation inspected:** [`README.md`](https://github.com/composio-community/open-dot/blob/main/README.md), including “What your dots can do,” “Good to know,” and “How it's put together”
- **Source entry points inspected:** [`src/server/agent/tools.ts`](https://github.com/composio-community/open-dot/blob/main/src/server/agent/tools.ts), [`src/server/agent/review.ts`](https://github.com/composio-community/open-dot/blob/main/src/server/agent/review.ts), [`src/server/agent/runtime.ts`](https://github.com/composio-community/open-dot/blob/main/src/server/agent/runtime.ts)
- **Observed/documented pattern:** The README claims that rules and approval cards control risky actions. In source, `review.ts` evaluates matching user rules and prefers `never`, then `ask`, then `allow`; `runtime.ts` pauses a pending tool call for an approval card and handles its answer. Tool definitions provide action descriptions and default decisions.
- **Evidence classification:** The rule precedence and pending approval flow are **observed in source**. README claims about Keychain behavior, connector counts, and background behavior were **not independently verified**. This is not evidence that every action is safely classified in practice.
- **Independent Open Dot Spell decision:** External or irreversible effects will have a conservative default and an explicit, inspectable approval state. Open Dot Spell will implement policy and safe resumption locally and will not assume another project's action classification covers its own tools.

### dots — feder-cr

- **Repository:** [github.com/feder-cr/dots](https://github.com/feder-cr/dots)
- **Branch/revision:** `main` at [`2ff9848c1c8a80460d89242d97beacf23dff05ca`](https://api.github.com/repos/feder-cr/dots/branches/main)
- **Documentation inspected:** [`README.md`](https://github.com/feder-cr/dots/blob/main/README.md)
- **Source entry points inspected:** [`pyproject.toml`](https://github.com/feder-cr/dots/blob/main/pyproject.toml), [`src/dots/cli.py`](https://github.com/feder-cr/dots/blob/main/src/dots/cli.py)
- **Observed/documented pattern:** The README claims persistent browser identity and other browser properties. The inspected source shows a narrower fact: `pyproject.toml` pins `invisible-playwright-mcp==0.70.2`, and `cli.py` forwards `dots` arguments to that dependency's `ui` subcommand.
- **Evidence classification:** The dependency pin and CLI forwarding are **observed in source**. The browser implementation and README browser-behavior claims are **not verified by the inspected source**. The dependency was not inspected or run.
- **Independent Open Dot Spell decision:** Browser automation will be an explicit dependency boundary. Open Dot Spell will document which behavior it implements, which behavior a selected browser provider supplies, and which behavior remains unverified. It will not inherit stealth or reliability claims from a wrapper README.

## Reference feature mapping

The map is for product research, not imitation. “Observed” means visible in the inspected public source; “documented” means stated in public documentation; “not verified” means the inspected material was insufficient and no stronger claim is made.

| Reference Feature | Reference Project | Evidence | Open Dot Spell Requirement | Release | Verification |
| --- | --- | --- | --- | --- | --- |
| Persistent/specialist agents (“Dots”) | [OpenDots README](https://github.com/CopilotKit/OpenDots/blob/main/README.md) | Spaces and specialist Dots are **documented**; persistent execution semantics were not tested. | Model persistent responsibilities, goals, tasks, and runs as single-owner durable records. Specialist profiles, if added, use the same bounded execution system. | Core responsibility model after Step 20; specialist profiles later | Deterministic state tests + integration/E2E tests; `Unknown / requires implementation and verification` |
| Personal computer/workspace interaction | [OpenDots computers docs](https://github.com/CopilotKit/OpenDots/blob/main/docs/COMPUTERS.md) | Per-Dot computers are **documented**; the docs distinguish fixtures from live-service checks. | Expose only explicitly selected workspace scopes and isolated environments; never infer host-wide access from a model request. | Approved local files after Step 20; coding/browser environments later | Integration/E2E + manual verification; `Unknown / requires implementation and verification` |
| Page/document tools and access checks | [OpenDots page tools](https://github.com/CopilotKit/OpenDots/blob/main/src/server/page-tools.ts), [page service](https://github.com/CopilotKit/OpenDots/blob/main/src/server/page-service.ts), [runtime scope](https://github.com/CopilotKit/OpenDots/blob/main/src/server/runtime-scope.ts) | Space access checks are **observed in source** at page-operation boundaries. | Recheck file/workspace authorization where a tool actually uses the resource, in addition to validating the proposal. | Core controlled workspace after Step 20 | Deterministic policy tests + integration tests; `Unknown / requires implementation and verification` |
| Tool execution | [Open Dot tools](https://github.com/composio-community/open-dot/blob/main/src/server/agent/tools.ts) | Tool descriptions/default decisions are **observed in source**. | Normalize model proposals into typed tool contracts and execute only after validation, policy, approval, bounds, and audit recording. | Core controlled tool after Step 20 | Deterministic automated tests + integration/E2E tests; `Unknown / requires implementation and verification` |
| Permissions | [OpenDots page service](https://github.com/CopilotKit/OpenDots/blob/main/src/server/page-service.ts) | Access checks before conversation/thread operations are **observed in source**. | Keep permission decisions server-side, scoped, explicit, and independent of model/tool descriptions. | Core after Step 20 | Deterministic policy tests + E2E tests; `Unknown / requires implementation and verification` |
| Human approval | [Open Dot review](https://github.com/composio-community/open-dot/blob/main/src/server/agent/review.ts), [runtime](https://github.com/composio-community/open-dot/blob/main/src/server/agent/runtime.ts) | Rule precedence and pending approval-card handling are **observed in source**; README approval claims are also **documented**. | Display exact consequential actions, require approval where policy says so, limit approval scope, record the decision, and invalidate stale authority. | Core approval flow after Step 20 | E2E test + manual verification; `Unknown / requires implementation and verification` |
| Persistent work | Open Dot runtime ([source](https://github.com/composio-community/open-dot/blob/main/src/server/agent/runtime.ts)) | Pending tool-call pause is **observed in source**; durable restart recovery was not verified. | Persist runs, events, evidence, and artifacts; recover only from eligible checkpoints after restart. | Core recovery after Step 20 | Deterministic interruption tests + integration/E2E tests; `Unknown / requires implementation and verification` |
| Browser automation | [feder-cr/dots README](https://github.com/feder-cr/dots/blob/main/README.md), [CLI](https://github.com/feder-cr/dots/blob/main/src/dots/cli.py) | Browser identity/reliability behavior is **documented as a claim**; source only shows dependency pin and CLI forwarding. | Treat browser automation as a controlled, separately verified capability with navigation, data, and approval policy. | Later extension | E2E browser tests + manual verification; `Unknown / requires implementation and verification` |
| Scheduling | No directly verified scheduling entry point in the inspected materials | No claim is made from the references. | Add user-visible schedules and safe restart/duplicate-run handling only under a later explicit requirement. | Later extension | Deterministic scheduler tests + integration/E2E tests; `Unknown / requires implementation and verification` |
| Model/provider flexibility | No directly verified provider abstraction in the inspected entry points | No claim is made from the references. | Keep an independent capability-aware provider boundary; Ollama is the first local runtime, not the product identity. | Core local path after Step 20; additional providers later | Integration tests + real-model evaluation; `Unknown / requires implementation and verification` |
| Artifacts | No directly verified artifact contract in the inspected materials | No claim is made from the references. | Produce local artifacts with content, provenance, result, and evidence records. | Core local artifacts after Step 20 | Integration/E2E tests; `Unknown / requires implementation and verification` |
| Task recovery | No directly verified restart/recovery contract in the inspected materials | No claim is made from the references. | Make interruption, stale authority, checkpoint eligibility, retry, and user attention explicit. | Core recovery after Step 20 | Deterministic automated interruption tests + E2E tests; `Unknown / requires implementation and verification` |

## Independent design boundary

Open Dot Spell learns patterns worth evaluating—resource-scoped authorization, explicit approval states, bounded tools, and honest separation between documented claims and observed behavior. It does not copy the reference projects' source, prompts, UI assets, branding, dependency choices, storage layout, or undocumented behavior.

The Open Dot Spell product chain remains:

```text
Responsibility → Goal → Plan → Task → Run → Tool Action → Evidence → Artifact
```

The application validates and authorizes actions; reference-project behavior cannot grant Open Dot Spell permissions.
