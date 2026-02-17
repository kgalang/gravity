# Interface Boundaries

Keep moving parts explicit and replaceable.

## Runtime Interfaces (planned)
- `DbClient` (`src/runtime/db.ts`): owns typed Postgres connectivity via Kysely and provides the `gravity` schema handle.
- `AgentRegistry`: reads agent definitions from Postgres and exposes `channelId -> agentId` routing.
- `SessionStore`: manages per-session `log.jsonl` and `context.jsonl` files.
- `SkillLoader`: loads shared + agent-specific skills from `store/` each turn (no caching).
- `MemoryStore`: loads/writes `MEMORY.md` per agent.
- `RunLifecycleLogger` (`src/runtime/run-lifecycle.ts`): emits typed run lifecycle events with stable IDs (`runId`, `agentId`, `sessionKey`) and lifecycle stages (`started`, `completed`, `failed`).
- `RunLogStore`: writes run lifecycle records to `gravity.runs`.
- `ToolDispatcher`: single dispatch seam for all tool execution (host now, sandbox later).
- `Scheduler`: heartbeat and cron execution with target session behavior.

## Non-Goals for Current Bootstrap
- No live Slack integration yet.
- No live Claude tool loop yet.
- No sandbox enforcement yet.

## Ownership and Rollback Notes
- `DbClient` owner: platform runtime layer.
- `DbClient` rollback path: swap `src/runtime/db.ts` back to direct `pg` access while preserving SQL contracts and migration files.
- `RunLifecycleLogger` owner: platform runtime layer.
- `RunLifecycleLogger` rollback path: revert runtime entrypoints to direct `console.log` messages while preserving stable ID fields in log lines.

## Stability Requirement
Do not change interface boundaries without updating this file and `docs/checkpoints/mvp-status.md` in the same change.
