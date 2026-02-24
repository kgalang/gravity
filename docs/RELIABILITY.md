# Reliability Baseline

## MVP Position
- Single process runtime.
- Best-effort startup checks.
- Run lifecycle wrapper emits typed events with stable IDs to the runtime log sink.
- Source-event idempotency guard prevents duplicate slash/non-slash run execution in-process and checks persisted `gravity.runs.source_event_id`.
- CP5 verification harness (`npm run verify:cp5`) validates persisted run lifecycle fields across slash/non-slash/proactive paths and failure handling.
- CP6 session scaffolding (`npm run verify:cp6`) validates dual-history file contracts, pre-run sync seams, memory reload-next-turn behavior, and overflow compaction recovery.
- CP7 session-end memory hook harness (`npm run verify:cp7`) validates silent hook execution, skip guards, replay exclusion (`skipContextReplay`), close-flow fallback behavior, and stale idle-close guard behavior.
- CP8 self-authoring mutation harness (`npm run verify:cp8`) validates teach/apply mutation correctness, allowlist guardrails, per-agent FIFO queueing, queue-overflow rejection, duplicate-trigger dedupe, rollback snapshot output, and stable-ID audit linkage in `gravity.skill_versions`.
- CP10 proactive scheduler replay/backfill (`npm run verify:cp10`) rehydrates missed `cron`/`heartbeat` runs from persisted run history.
- Sandbox boundary now uses fail-closed runtime decisions (`allow`/`deny` + reason); policy-denied runs return deterministic deny responses, while runtime failures surface as explicit failed runs (no silent host fallback).
- Sandbox decision metadata is persisted in run logs (`gravity.runs.policy_decisions`) and linked to stable IDs (`runId`, `agentId`, `sessionKey`).

## Planned Reliability Contracts
1. Stable identifiers on every run event (`runId`, `agentId`, `sessionKey`).
2. Idempotency key support on source events.
3. Durable scheduler state for heartbeat and cron replay.
4. Deterministic cancellation and timeout semantics.
5. Session-end memory hook execution with deterministic skip/failure behavior.

## Immediate Next Work
1. Add full sandbox approval-state workflow (`request_id`, timeout, cancel, pending states) with correlated verification coverage (TD-008).
2. Harden runtime behavior for higher load and edge conditions (ingress overload policy, delivery fallback contracts, and targeted reliability tests; TD-009).
3. Add pre-compaction memory flush hooks to reduce information-loss risk on long sessions.
