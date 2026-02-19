# CP7 Plan (Session-End Memory Hook Reliability)

Status: complete
Owner: kevin + codex
Last Updated: 2026-02-19
Thread: cp7-session-end-memory-hook-reliability

## Resume Context
CP6 session and memory scaffolding is complete and verified.

Resume evidence:
- `docs/plans/completed/2026-02-18-cp6-sessions-memory-scaffolding.md` exit criteria are met.
- `docs/checkpoints/cp6-verification.md` contracts are green (`npm run verify:cp6`).
- Runtime now executes a real idle-close silent memory hook and guarded close flow in `src/index.ts`.

## Goal
Close CP7 by implementing and validating a real session-end silent memory write hook so idle sessions persist durable learnings to `MEMORY.md` before close.

## Scope Decision
CP7 focuses on session-end memory reliability only:
- implement real hook execution on idle eviction,
- enforce deterministic skip/failure behavior,
- and add verification/tests for meaningful behavioral guarantees.

Do not expand scope to CP8 self-authoring automation or CP11 demo polish.

## CP7 In/Out
- In scope: session-end memory hook runtime module, idle-eviction integration order (`memory hook -> close session`), CP7 verification matrix + harness, and architecture/reliability doc updates.
- Out of scope: proactive scheduler expansion, autonomous self-author loops, and multi-agent orchestration behavior.

## Work Items
- [x] Define and implement `SessionEndMemoryHook` runtime boundary with explicit dependency seams for testability.
- [x] Execute silent memory hook turns on idle eviction with deterministic skip guards (missing API key, missing memory path).
- [x] Ensure session close still executes on hook failure (no session metadata leak).
- [x] Exclude internal memory-hook log records from pre-run context replay while retaining audit visibility in `log.jsonl` and `agent-log.jsonl`.
- [x] Guard idle-close callbacks with `closeSessionIfUnchanged` semantics so stale callbacks cannot close reactivated sessions.
- [x] Add meaningful tests focused on runtime behavior and file-contract side effects (not type-only coverage).
- [x] Add `npm run verify:cp7` harness and CP7 verification checkpoint matrix.
- [x] Update architecture/system/reliability/checkpoint docs with owner/boundary/rollback notes.

## Risks
- Memory-hook execution can stall or fail and block session-close transitions unless failure handling is explicit.
- Weak guardrails can produce noisy or low-signal writes to `MEMORY.md`.
- Hook side effects can regress idle-eviction semantics if callback ordering is incorrect.

## Exit Criteria
- Session-end memory hook is implemented (not scaffold-only) and runs on idle eviction before session close.
- Hook failures are logged and do not prevent session close.
- Internal memory-hook records are audit-only and excluded from future model context replay.
- Idle-close callbacks cannot close sessions whose activity moved forward after timeout fire.
- CP7 verification matrix and harness are in place.
- `npm run verify:cp7` and `npm run check` pass.
- Docs/checkpoint state is updated in the same change.

## Verification Evidence (2026-02-19)
- `npm run test:unit -- tests/runtime/session-end-memory-hook.test.ts` passed.
- `npm run test:unit -- tests/runtime/session-history-store.test.ts tests/runtime/session-catalog.test.ts` passed.
- `npm run verify:cp7` passed (`session_end_memory_hook=true, replay_exclusion=true, idle_close_fallback=true, stale_close_guard=true, no_reply_contract=true`).
- `npm run check` passed after runtime + docs updates.
