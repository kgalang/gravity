# CP10 Verification Matrix

Last Updated: 2026-02-18
Owner: kevin + codex

## Scope
Validate CP10 proactive reliability and control contracts for:
- Replay/backfill of missed `cron` and `heartbeat` runs.
- Manual wake controls for deterministic heartbeat invocation.
- Quiet-hours suppression behavior.
- Proactive run-log persistence parity in `gravity.runs`.

## Matrix

| Area | Contract | Verification Command | Evidence |
| --- | --- | --- | --- |
| Replay/backfill | Scheduler replays missed due runs on startup with bounded catch-up | `npm run verify:cp10` | Replay events emitted and persisted |
| Manual wake | Manual wake can fire heartbeat deterministically and target specific trigger | `npm run verify:cp10` | Manual wake event persisted |
| Quiet hours | Scheduled/replay runs are suppressed during quiet hours; manual wake can bypass | `npm run verify:cp10` | Suppression + bypass assertions pass |
| Delivery routing | Proactive delivery contracts include `channel_thread` and `dm` | `npm run verify:cp10` | Replay events cover both delivery modes |
| Run-log parity | Proactive runs persist `trigger_kind`, `entrypoint`, `status`, `source_event_id`, `session_key` | `npm run verify:cp10` | DB assertions in harness |
| Manual wake operator path | Mapped slash commands can trigger manual wake with `!wake` / `!wake <trigger-id>` | Runtime behavior (`src/index.ts`) | Scheduler `wake()` invoked from slash path |

## Evidence Snapshot (2026-02-18)
- `npm run verify:cp10` result: `verification passed (replay=4, manual=1, quiet_hours_suppressed=true)`.
- Replay run summary: 2 `cron` + 2 `heartbeat` catch-up runs emitted at startup (max replay cap = 2 per trigger).
- Quiet-hours summary: replay during quiet window was suppressed (`reconcileMissed() = 0`), manual wake without bypass was suppressed (`wake(..., bypassQuietHours=false) = 0`), and manual wake with bypass fired (`wake(..., bypassQuietHours=true) = 1`).
- Full repo gate check after CP10 changes: `npm run check` passed.
