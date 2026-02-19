# CP7 Verification Matrix

Last Updated: 2026-02-19
Owner: kevin + codex

## Scope
Validate CP7 session-end memory hook reliability contracts for:
- Silent memory hook turn execution on idle session close.
- Deterministic fail-closed skip behavior when required prerequisites are missing.
- Replay safety: internal hook records remain audit-visible but are excluded from future model context replay.
- Close-flow safety: session close still executes when memory-hook execution fails and stale callbacks cannot close reactivated sessions.
- Durable hook audit trail in session history (`log.jsonl`) and immediate memory reload compatibility.

## Matrix

| Area | Contract | Verification Command | Evidence |
| --- | --- | --- | --- |
| Silent hook turn | Idle close triggers a silent memory hook turn that targets `MEMORY.md` and records hook input/output in session log | `npm run test:unit -- tests/runtime/session-end-memory-hook.test.ts` and `npm run verify:cp7` | Hook prompt includes memory file path; hook input/output entries appended |
| Skip guards | Missing API key or missing memory path skips hook deterministically with warning | `npm run test:unit -- tests/runtime/session-end-memory-hook.test.ts` | `missing_api_key` and `missing_memory_path` branches asserted |
| Replay exclusion | Hook records tagged with `skipContextReplay=true` are retained in `log.jsonl` but never replayed into `context.jsonl` | `npm run test:unit -- tests/runtime/session-history-store.test.ts` and `npm run verify:cp7` | Internal hook prompt remains audit-visible and is absent from synchronized model context |
| Close fallback + stale guard | Session close is attempted even if hook execution throws, and stale idle callbacks cannot close reactivated sessions | `npm run test:unit -- tests/runtime/session-end-memory-hook.test.ts tests/runtime/session-catalog.test.ts` and `npm run verify:cp7` | `memory_hook -> log_failure -> close_if_unchanged` fallback passes; stale guard path logs `stale_callback` and skips close |
| Memory reload compatibility | Hook writes remain compatible with immediate-next-turn `MEMORY.md` reload contract | `npm run test:unit -- tests/runtime/context-assembler.test.ts` | Existing CP6 reload-next-turn assertions remain green |

## Evidence Snapshot (2026-02-19)
- `npm run verify:cp7` result: `verification passed (session_end_memory_hook=true, replay_exclusion=true, idle_close_fallback=true, stale_close_guard=true, no_reply_contract=true)`.
- Unit coverage for CP7 contracts:
  - `tests/runtime/session-end-memory-hook.test.ts`
  - `tests/runtime/session-history-store.test.ts`
  - `tests/runtime/session-catalog.test.ts`
  - `tests/runtime/context-assembler.test.ts` (reload-next-turn compatibility)
