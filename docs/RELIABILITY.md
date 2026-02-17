# Reliability Baseline

## MVP Position
- Single process runtime.
- Best-effort startup checks.
- Run lifecycle wrapper emits typed events with stable IDs to the runtime log sink.
- No durable job replay yet.

## Planned Reliability Contracts
1. Stable identifiers on every run event (`runId`, `agentId`, `sessionKey`).
2. Idempotency key support on source events.
3. Durable scheduler state for heartbeat and cron replay.
4. Deterministic cancellation and timeout semantics.

## Immediate Next Work
1. Route run lifecycle events into persistent `gravity.runs` writes during CP3/CP5 integration.
2. Add startup reconciliation checks before proactive behavior (CP10).
