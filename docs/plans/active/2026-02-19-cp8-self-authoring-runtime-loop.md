# CP8 Plan (Self-Authoring Runtime Loop)

Status: active
Owner: kevin + codex
Last Updated: 2026-02-19
Thread: cp8-self-authoring-runtime-loop

## Resume Context
CP7 session-end memory reliability is complete and verified.

Resume evidence:
- `docs/plans/completed/2026-02-18-cp7-session-end-memory-hook-reliability.md` exit criteria are met.
- `docs/checkpoints/cp7-verification.md` captures the CP7 reliability matrix and gate.
- `npm run verify:cp7` and `npm run check` are passing in the current branch.

## Goal
Define and deliver the first CP8 self-authoring runtime loop so the platform can close a full agent-work cycle with consistent post-run state transitions and restart-safe continuity.

## Scope Decision
CP8 focuses on autonomous self-authoring loop execution control and durability around that loop. CP9 second-agent runtime behavior and broader orchestration enhancements are intentionally out of scope.

## CP8 In/Out
- In scope: self-authoring loop orchestration, loop trigger surfaces, loop persistence/guardrails, and verification surfaces for deterministic loop transitions.
- Out of scope: post-loop memory capture redesign, CP10 scheduler expansion, and full CP11 demo-level orchestration polish.

## Work Items
- [ ] Define loop state machine for self-author transitions and failure/retry behavior.
- [ ] Implement runtime orchestration for loop start/stop and deterministic loop checkpoints.
- [ ] Ensure loop triggers are idempotent and safe under duplicate runtime events.
- [ ] Add replay and persistence tests around loop reopen/retry after restart.
- [ ] Update architecture/system/reliability docs with CP8 owner/rollback notes.
- [ ] Add `npm run verify:cp8` verification harness and checkpoint matrix updates.
- [ ] Update `docs/checkpoints/mvp-status.md` with current CP8 progress and evidence pointer.

## Risks
- Self-author loops can run continuously without useful stop conditions and consume resources.
- Loop retries can amplify side effects without dedupe/guard rails.
- Loop state transitions can become inconsistent across restart or partial execution.

## Exit Criteria
- Self-authoring runtime loop is implemented and bounded by explicit lifecycle boundaries.
- Loop transition behavior is deterministic, test covered, and restart-safe.
- Checkpoint and docs are advanced together and reflect CP8 current status.
- `npm run verify:cp8` and `npm run check` pass after implementation.
