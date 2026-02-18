# CP6 Verification Matrix

Last Updated: 2026-02-18
Owner: kevin + codex

## Scope
Validate CP6 session + memory scaffolding contracts for:
- Dual-history session files (`log.jsonl` + `context.jsonl`) and agent-wide log append.
- Thread/session context isolation and deterministic pre-run log sync.
- Per-turn `MEMORY.md` reload behavior.
- Context-overflow recovery via compaction + retry.
- Startup backfill seam and idle session memory-hook scaffold.
- Fail-closed CP6 config behavior with runtime warnings.

## Matrix

| Area | Contract | Verification Command | Evidence |
| --- | --- | --- | --- |
| Dual-history files | Each session has deterministic `workspace/{agentId}/sessions/{sessionKey}/{log.jsonl,context.jsonl}` and append-only agent log | `npm run verify:cp6` | Session + agent log files created and appended |
| Session isolation | Session keys remain mode/thread bound and deterministic | `npm run test:unit -- tests/runtime/session-key.test.ts` | Canonical key pattern assertions pass |
| Pre-run sync seam | Unsynced user/system `log.jsonl` entries are synced into `context.jsonl` with source-event dedupe | `npm run test:unit -- tests/runtime/session-history-store.test.ts` and `npm run verify:cp6` | Sync appends expected entries once |
| Startup backfill seam | Active Slack thread sessions can be backfilled into `log.jsonl` through a pluggable source | `npm run test:unit -- tests/runtime/session-startup-backfill.test.ts` | Backfilled entries appended with oldest-ts handoff |
| MEMORY reload | `MEMORY.md` edits are reflected on the immediate next turn | `npm run test:unit -- tests/runtime/context-assembler.test.ts` and `npm run verify:cp6` | Second turn prompt includes updated memory |
| Overflow recovery | Context-overflow error triggers compaction and immediate retry | `npm run test:unit -- tests/runtime/session-overflow-recovery.test.ts` and `npm run verify:cp6` | `prompt -> compact -> prompt` sequence asserted |
| Idle session hook scaffold | Idle eviction closes session metadata and triggers scaffold callback | `npm run test:unit -- tests/runtime/session-idle-eviction.test.ts` and `npm run verify:cp6` | Idle timeout emits `idle_eviction` event |
| Fail-closed config | Invalid CP6 config disables affected feature with runtime warning | `npm run test:unit -- tests/runtime/config.test.ts` | Invalid inputs force disabled feature flags |

## Evidence Snapshot (2026-02-18)
- `npm run verify:cp6` result: `verification passed (dual_history=true, pre_run_sync=true, memory_reload=true, overflow_recovery=true, idle_hook_scaffold=true)`.
- Unit coverage added for CP6 seams:
  - `tests/runtime/session-history-store.test.ts`
  - `tests/runtime/session-startup-backfill.test.ts`
  - `tests/runtime/session-overflow-recovery.test.ts`
  - `tests/runtime/session-idle-eviction.test.ts`
  - `tests/runtime/context-assembler.test.ts` (memory immediate-next-turn assertion)
  - `tests/runtime/config.test.ts` (fail-closed session config assertions)
