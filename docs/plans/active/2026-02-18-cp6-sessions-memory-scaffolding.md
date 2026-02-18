# CP6 Plan (Sessions + Memory Scaffolding)

Status: active
Owner: kevin + codex
Last Updated: 2026-02-18

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

## CP6 In/Out
- In scope: dual-history files (`log.jsonl`, `context.jsonl`), session isolation by thread/session mode, per-turn `MEMORY.md` loading contract, compaction trigger + retry behavior, startup backfill/pre-run sync seams, and session-end memory hook scaffolding.
- Out of scope: full CP7 reliability matrix, CP8 auto-commit/self-author loop, and CP11 demo polish.

## Work Items
- [ ] Define CP6 validation matrix for session isolation, compaction, and memory reload behavior.
- [ ] Implement dual-history session file contract under `workspace/{agentId}/sessions/{sessionKey}/`.
- [ ] Ensure per-turn `MEMORY.md` is loaded and reflected on immediate next turn.
- [ ] Implement compaction flow with overflow recovery and automatic retry.
- [ ] Add startup backfill/pre-run sync seam for missed Slack thread history.
- [ ] Add session-end memory hook scaffold for idle-session eviction.
- [ ] Review all CP6-related config surfaces and enforce fail-closed runtime warnings for invalid values (pre-MVP guardrail).
- [ ] Update architecture/checkpoint/reliability docs with session boundary and rollback details.

## Risks
- Compaction can corrupt context ordering if log/context ownership is not explicit.
- Backfill logic can produce duplicate transcript entries without strict event identity handling.
- Session-end memory writes can race with live inbound events.

## Exit Criteria
- CP6 session scaffolding is implemented with deterministic file contracts and thread isolation.
- Compaction and memory reload behavior are validated in tests.
- Startup backfill seam and memory hook scaffolds are in place.
- Invalid CP6-related config values fail closed with runtime warnings visible at run time.
- `npm run check` passes.
- Docs and checkpoint state are updated in the same change.
