# CP6 Plan (Sessions + Memory Scaffolding)

Status: active
Owner: kevin + codex
Last Updated: 2026-02-18
Thread: cp6-sessions-memory-scaffolding

## Resume Context
CP5.1 rearchitecture parity is complete and CP6 is unblocked.

Resume evidence:
- `docs/plans/completed/2026-02-18-cp5-1-rearchitecture-parity.md` exit criteria are met.
- Legacy JSONB-driven routing/resolver modules are removed.
- `npm run verify:cp5` and `npm run verify:cp10` are green after cutover.

## Goal
Deliver CP6 session and memory scaffolding so thread-level context is durable, compactable, and recoverable across runtime restarts.

## Scope Decision
CP6 focuses on runtime session state shape and compaction mechanics. Keep CP10 proactive behavior intact and avoid self-authoring automation work reserved for CP8.
Pre-MVP configuration policy is fail-closed: invalid config must stop feature activation and emit a runtime warning for immediate visibility. Post-demo, this policy can be revisited.

## Priority Update (2026-02-18)
Before deeper session/compaction work, simplify the skill abstraction boundary:
- Canonicalize skill definitions under `store/shared/skills`.
- Keep `defineAgent(...).skills` bindings as the explicit skill application surface.
- Migrate and remove `store/agents/{agentId}/skills` immediately in this checkpoint (no long-lived compatibility period).

## CP6 In/Out
- In scope: skill-boundary simplification (shared catalog + explicit agent bindings), dual-history files (`log.jsonl`, `context.jsonl`), session isolation by thread/session mode, per-turn `MEMORY.md` loading contract, compaction trigger + retry behavior, startup backfill/pre-run sync seams, and session-end memory hook scaffolding.
- Out of scope: full CP7 reliability matrix, CP8 auto-commit/self-author loop, and CP11 demo polish.

## Work Items
- [ ] Lock docs contract: shared-skill catalog is canonical and agent-local skills folders are removal targets in this checkpoint.
- [ ] Migrate existing agent-local skill docs to namespaced entries in `store/shared/skills`.
- [ ] Remove runtime loading of `store/agents/{agentId}/skills` from context assembly and keep only declared shared skill loading.
- [ ] Delete agent-local skills directories and update invariants/tests/verification scripts to enforce shared-skill-only topology.
- [ ] Define CP6 validation matrix for session isolation, compaction, and memory reload behavior.
- [ ] Implement dual-history session file contract under `workspace/{agentId}/sessions/{sessionKey}/`.
- [ ] Ensure per-turn `MEMORY.md` is loaded and reflected on immediate next turn.
- [ ] Implement compaction flow with overflow recovery and automatic retry.
- [ ] Add startup backfill/pre-run sync seam for missed Slack thread history.
- [ ] Add session-end memory hook scaffold for idle-session eviction.
- [ ] Review all CP6-related config surfaces and enforce fail-closed runtime warnings for invalid values (pre-MVP guardrail).
- [ ] Update architecture/checkpoint/reliability docs with session boundary and rollback details.

## Risks
- Skill migration can silently drop behavioral instructions if shared skill IDs and bindings are not aligned before local folder removal.
- Compaction can corrupt context ordering if log/context ownership is not explicit.
- Backfill logic can produce duplicate transcript entries without strict event identity handling.
- Session-end memory writes can race with live inbound events.

## Exit Criteria
- Skill definitions are composed through declared shared skill IDs, and runtime no longer reads `store/agents/{agentId}/skills`.
- CP6 session scaffolding is implemented with deterministic file contracts and thread isolation.
- Compaction and memory reload behavior are validated in tests.
- Startup backfill seam and memory hook scaffolds are in place.
- Invalid CP6-related config values fail closed with runtime warnings visible at run time.
- `npm run check` passes.
- Docs and checkpoint state are updated in the same change.
