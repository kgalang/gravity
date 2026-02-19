# TEMP: CP7 Session-End Memory Hook Deep Dive

Last Updated: 2026-02-19
Status: temporary explainer
Owner: kevin + codex

## Purpose
Explain what CP7 introduced, why it matters at product level, where the boundaries are, what is implemented now, and what must be fixed next.

## The Product Problem
Without a session-end memory hook, important learnings in a long thread can disappear when context compacts or the process restarts.

The hook exists to preserve durable learnings into `MEMORY.md` at session close, while keeping the session transcript compact and restart-safe.

## Product Situations Where This Is Useful

| Situation | Risk without hook | Value with hook |
| --- | --- | --- |
| Long analyst thread with evolving business definitions | Definitions live only in chat history and get lost | Durable facts are written to memory for future turns |
| DM support thread that goes idle overnight | Session context can be stale or compacted by next day | Agent keeps durable preferences and can resume faster |
| Repeated weekly operations thread | Agent relearns the same rules each week | Memory accumulates stable policies and constraints |
| Process restart after active conversations | Thread context continuity is fragile | Durable memory survives restart independently of context file |

## What Is Implemented Now (CP7)

Runtime flow:

```text
Idle Timer Fires
  -> SessionEndMemoryHook.run(...)
    -> load agent memory_path from gravity.agents
    -> run silent model turn with "write durable learnings to MEMORY.md"
    -> append hook input/output records to session log.jsonl
  -> close gravity.sessions row
```

Main files:
- `src/runtime/session-end-memory-hook.ts`
- `src/index.ts`
- `tests/runtime/session-end-memory-hook.test.ts`
- `scripts/verify-cp7.ts`
- `docs/checkpoints/cp7-verification.md`

Current CP7 guarantees:
- Hook can run silently on idle close.
- Deterministic skip guards when prerequisites are missing:
  - `missing_api_key`
  - `missing_memory_path`
- Session close still executes if hook throws.
- Verification gate exists: `npm run verify:cp7`.

## Boundaries and Decisions

### Decisions made
- Memory remains file-based (`store/agents/{agentId}/memory/MEMORY.md`), not Postgres memory tables.
- Hook runs as an internal silent turn (no Slack user-facing output).
- Hook behavior is fail-closed on missing prerequisites (skip with warning).
- Stable IDs stay explicit (`agentId`, `sessionKey`, derived `sourceEventId`).

### Boundary map

```text
SessionIdleEvictionCoordinator (timer + event)
  -> runSessionIdleCloseFlow (orchestration boundary)
    -> SessionEndMemoryHook (memory-write boundary)
      -> PiAgentRunner turn + MEMORY.md side effects
    -> SessionCatalog closeSession (session metadata boundary)
```

### Out of scope for CP7
- Pre-compaction memory flush.
- Autonomy/self-author loops (CP8).
- Compliance bot policy/review rollout behavior (CP9).

## Hardening Follow-up Applied (2026-02-19)

### P1 resolved: Hook prompts are audit-only, not replayed into model context
Implemented behavior:
- Hook log entries are tagged with `skipContextReplay: true`.
- `SessionHistoryStore.syncLogToSessionContext(...)` excludes entries with that flag.
- Hook records remain in `log.jsonl` and `agent-log.jsonl` for audit.

Coverage:
- `tests/runtime/session-history-store.test.ts`
- `tests/runtime/session-end-memory-hook.test.ts`
- `npm run verify:cp7`

### P2 resolved: Stale idle-close callbacks cannot close reactivated sessions
Implemented behavior:
- Idle close flow now calls guarded close semantics (`closeSessionIfUnchanged`).
- Close only applies when persisted `last_activity_at` has not advanced since timeout fire.
- Stale callbacks log `stale_callback` and skip close.

Coverage:
- `tests/runtime/session-end-memory-hook.test.ts`
- `tests/runtime/session-catalog.test.ts`
- `npm run verify:cp7`

## Why These Solutions Are Correct

P1 fix aligns with separation of concerns:
- `log.jsonl` remains full audit log.
- `context.jsonl` remains model-facing conversational context only.

P2 fix aligns with concurrency safety:
- Session close becomes an optimistic compare-and-set, not unconditional overwrite.
- Prevents timer-era callbacks from mutating fresh session state.

## Sequence Diagram With Race (Current vs Target)

```text
Current:
T0 idle timeout -> hook starts
T1 new user message -> session reopened/updated
T2 hook finishes -> unconditional close  (bad)

Target:
T0 idle timeout -> hook starts
T1 new user message -> session reopened/updated
T2 hook finishes -> conditional close(last_activity <= T0?) -> false -> no close
```

## Near-Term Plan

1. Keep CP7 replay-exclusion + stale-close guards as locked reliability invariants.
2. Revisit long-term memory capture strategy post-demo (session-end only vs hybrid with optional continuous auto-capture).
3. Evaluate pre-compaction memory flush as a separate reliability enhancement.

## Quick Summary
CP7 established a real session-end memory hook, and hardening now closes the two key correctness gaps: internal hook prompts are excluded from context replay, and stale idle callbacks cannot overwrite reactivated session state.
