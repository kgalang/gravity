# Reliability Baseline

## MVP Position
- Single process runtime.
- Best-effort startup checks.
- Run lifecycle wrapper emits typed events with stable IDs to the runtime log sink.
- Source-event idempotency guard prevents duplicate slash/non-slash run execution in-process and checks persisted `gravity.runs.source_event_id`.
- CP5 verification harness (`npm run verify:cp5`) validates persisted run lifecycle fields across slash/non-slash/proactive paths and failure handling.
- No durable job replay yet.

## Planned Reliability Contracts
1. Stable identifiers on every run event (`runId`, `agentId`, `sessionKey`).
2. Idempotency key support on source events.
3. Durable scheduler state for heartbeat and cron replay.
4. Deterministic cancellation and timeout semantics.

## Immediate Next Work
1. Add startup reconciliation checks before proactive behavior (CP10).
2. Add durable scheduler replay/reconciliation for cron and heartbeat triggers after restarts.
