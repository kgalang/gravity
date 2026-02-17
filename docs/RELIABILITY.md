# Reliability Baseline

## MVP Position
- Single process runtime.
- Best-effort startup checks.
- No durable job replay yet.

## Planned Reliability Contracts
1. Stable identifiers on every run event (`runId`, `agentId`, `sessionKey`).
2. Idempotency key support on source events.
3. Durable scheduler state for heartbeat and cron replay.
4. Deterministic cancellation and timeout semantics.

## Immediate Next Work
1. Add run lifecycle logging wrapper before Slack integration (CP3).
2. Add startup reconciliation checks before proactive behavior (CP10).
