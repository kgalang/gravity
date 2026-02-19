# CP8 Plan (Self-Authoring Mutation Flow)

Status: active
Owner: kevin + codex
Last Updated: 2026-02-19
Thread: cp8-self-authoring-runtime-loop

## Resume Context
CP7 session-end memory reliability is complete and verified.

Resume evidence:
- `docs/plans/completed/2026-02-18-cp7-session-end-memory-hook-reliability.md` exit criteria are met.
- `docs/checkpoints/cp7-verification.md` captures the CP7 reliability matrix and gate.
- CP7 closure evidence records passing `npm run verify:cp7` and `npm run check`.

## Goal
Deliver CP8 self-authoring so experts can teach agents directly and agents can apply durable skill/memory updates without an engineering deployment cycle.

## Self-Authoring Definition (MVP)
For Gravity MVP, "self-authoring" means:
- teammate teaches an agent in natural language,
- agent updates its durable skills/memory,
- platform records the change in central audit state.

Required artifacts:
- Skill updates in `store/shared/skills` (including namespaced shared skills where applicable).
- Memory updates in `store/agents/{agentId}/memory/MEMORY.md`.
- Evolution audit records in `gravity.skill_versions`.

## Scope Decision
CP8 focuses on self-authoring mutation correctness and operational safety for single-process demo runtime.
CP9 second-agent behavior and post-demo orchestration complexity remain out of scope.

## Runtime Boundary Contract (CP8)
- New runtime complexity introduced in CP8 must be documented as an explicit interface boundary in `docs/architecture/interfaces.md` with owner and rollback path before checkpoint close.
- Stable IDs (`agentId`, `sessionKey`, `runId`) remain required correlation keys across mutation and audit records.

## CP8 In/Out
- In scope: teach/update intent handling, deterministic mutation apply flow, lock/queue behavior for conflicting writes, and skill-version audit logging.
- Out of scope: multi-turn autonomous loop state machines, distributed lease locking, cross-agent fairness budgets, and CP10 scheduler expansion.

## Mutation Surface Policy (CP8 Guardrail)
Allowed write surfaces:
- Create new skill files under `store/shared/skills/` (including agent-namespaced shared skills).
- Edit existing skill files under `store/shared/skills/`.
- Update `store/agents/{agentId}/memory/MEMORY.md`.

Disallowed write surfaces:
- Agent/runtime source code (`src/`, `agents/`, `scripts/`, `tests/`).
- Database schema/migrations (`db/`, `schema.sql`, `seed.sql`).
- Agent definition/config contracts (including code-defined agent declarations).
- Shared resources/connectors (`store/shared/resources/`, `store/shared/connectors/`).
- Any path outside explicit allowlist.

Enforcement contract:
- Mutations are allowlist-only and fail-closed.
- Each proposed write is validated on normalized absolute path before file mutation.
- Disallowed mutations return explicit rejection status (`mutation_policy_denied`) and are audit-visible.

## Proposed Mutation Transaction Model (Draft)
- `request_received`: inbound teach/update request is normalized.
- `authoring_turn_completed`: one authoring turn produces concrete skill/memory delta.
- `mutation_lock_acquired`: write lock is held for target mutation scope.
- `mutation_applied`: durable file changes are written.
- `audit_logged`: `gravity.skill_versions` row is persisted.
- terminal: `completed` or `failed`.

Guardrails:
- No mutation write without lock acquisition.
- No `completed` terminal status without both durable write and audit log.
- Duplicate trigger key does not apply duplicate mutation.

## Concurrency Contract (Pre-demo)
- Mutation lock scope is per `agentId` (simple pre-demo default).
- At most one active self-author mutation per lock scope.
- Conflicting requests queue in deterministic FIFO.
- Trigger idempotency is enforced by normalized trigger key before queue insertion.
- No cross-agent anti-starvation guarantees pre-demo.
- Multi-instance distributed locking is deferred post-demo.

## Queue Contract (CP8 Pre-demo)
Queue keys:
- `lockScopeKey = (agentId)`.
- `triggerKey = normalized(sourceEventId || deterministic_trigger_hash)`.
- `queueItemKey = (lockScopeKey, triggerKey)`.

Enqueue behavior:
- If `triggerKey` is already active or queued for same lock scope, drop duplicate (`deduped_duplicate`).
- Else append with monotonic order (`enqueuedAt`, `queueSeq`).

Dequeue behavior:
- FIFO within lock scope.
- Head item starts immediately when lock is free.
- No priority tiers in CP8.

Drop policy:
- Duplicate trigger keys dropped (`deduped_duplicate`).
- If queue depth exceeds configured max, reject newest enqueue (`queue_overflow`) with explicit status.
- No silent drops.

## Work Items
- [x] Document CP8 runtime boundary in `docs/architecture/interfaces.md` with owner and rollback notes before merge.
- [x] Implement teach/update intent detection for self-authoring requests.
- [x] Implement single-turn self-authoring delta generation contract (structured mutation payload).
- [x] Implement mutation lock + FIFO queue for conflicting self-author writes.
- [x] Implement mutation-path allowlist enforcement (skills + agent memory only).
- [x] Reject disallowed mutation targets with explicit `mutation_policy_denied` status.
- [x] Implement deterministic mutation apply flow for skills + memory writes.
- [x] Persist self-author skill evolution records in `gravity.skill_versions`.
- [x] Ensure rollback path is explicit for self-authored skill changes.
- [x] Add replay-safe duplicate-trigger handling for mutation requests.
- [x] Add `npm run verify:cp8` verification harness.
- [x] Create and maintain `docs/checkpoints/cp8-verification.md` as the CP8 matrix of contracts and evidence.
- [x] Update architecture/system/reliability/runbook docs with CP8 owner/rollback notes and operational controls.
- [x] Update `docs/checkpoints/mvp-status.md` with current CP8 progress and evidence pointer.
- [x] Ensure docs index references remain current (`docs/README.md`) when CP8 verification artifacts are added.

## Verification Matrix Seeds (for `docs/checkpoints/cp8-verification.md`)
- Teach-learn-apply: expert-taught update changes durable skill/memory behavior on next turn.
- Mutation correctness: approved deltas are applied exactly once.
- Auditability: each self-authored skill change writes a linked `gravity.skill_versions` row.
- Idempotent trigger handling: duplicate trigger does not produce duplicate mutation.
- Lock/queue correctness: conflicting updates serialize via FIFO under lock scope.
- Overflow behavior: queue-full requests return explicit `queue_overflow` status.
- Stable-ID observability: run/mutation records include `agentId`, `sessionKey`, and `runId`.
- Mutation policy guardrail: non-allowlisted paths are blocked and reported as `mutation_policy_denied`.
- Agent-definition immutability: self-authoring requests cannot modify agent declarations/config contracts.

## Closed Decisions (2026-02-19)
- CP8 is self-authoring mutation flow (not a multi-turn autonomous loop state machine).
- Pre-demo conflict handling uses per-agent lock scope plus FIFO queueing.
- Idempotency is mandatory via normalized trigger-key dedupe.
- Cross-agent anti-starvation fairness is explicitly deferred to post-demo scope.
- Multi-instance distributed locking is deferred to deployment-infra phase (post-demo).
- Self-authoring write scope is restricted to skills + agent memory; code/resources/agent-definitions are immutable under CP8.
- Pre-demo mutation queue depth default is 8 (`GRAVITY_SELF_AUTHORING_QUEUE_MAX_DEPTH`).
- Skill rollback path is explicit via per-run rollback snapshots in `workspace/self-authoring-rollbacks/`.

## Open Decisions To Close Early
- Whether lock scope should remain per-agent or move to per-target-path post-demo.
- Whether user confirmation is required before applying mutation in specific channels/surfaces.

## Risks
- Incorrect delta generation can write low-quality or unsafe skill updates.
- Missing lock discipline can cause conflicting writes under concurrent teach events.
- Weak audit linkage can make rollback and trust harder during demo.
- Queue overflow without explicit status can hide dropped teach requests.

## Exit Criteria
- Self-authoring can apply expert-taught skill/memory updates without an eng deployment cycle.
- Mutation behavior is deterministic, test-covered, and duplicate-safe.
- CP8 runtime boundary is documented in `docs/architecture/interfaces.md` with owner + rollback path.
- Checkpoint and docs are advanced together and reflect CP8 current status (`docs/checkpoints/cp8-verification.md`, `docs/checkpoints/mvp-status.md`, and impacted system docs).
- `npm run verify:cp8`, `npm run check`, and `npm run lint:repo` pass after implementation.

## Current Evidence Snapshot (2026-02-19)
- `npm run verify:cp8` passes with all CP8 contract flags.
- Unit coverage includes new CP8 runtime modules (`self-authoring-intent`, `self-authoring-mutation-policy`, `self-authoring-mutation-queue`, `self-authoring-mutation-coordinator`).
