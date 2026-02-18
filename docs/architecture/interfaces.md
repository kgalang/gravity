# Interface Boundaries

Keep moving parts explicit and replaceable.

## Runtime Interfaces (planned)
- `DbClient` (`src/runtime/db.ts`): owns typed Postgres connectivity via Kysely and provides the `gravity` schema handle.
- `SlackTransport` (`src/runtime/slack-transport.ts`): owns Slack Socket Mode connection, inbound event normalization, and channel-scoped message queueing.
- `SlashCommandRouter` (`src/runtime/slash-command-router.ts`): resolves per-agent slash commands (e.g. `/wiggs`) to stable `agentId` values.
- `PiAgentRunner` (`src/runtime/pi-agent-runner.ts`): runs per-turn `pi-coding-agent` Claude sessions for routed agents, loading `store/` skills + memory + dbt context every turn and persisting session context files under `workspace/`.
- `SessionStore`: manages per-session `log.jsonl` and `context.jsonl` files.
- `SkillLoader`: loads shared + agent-specific skills from `store/` each turn (no caching).
- `MemoryStore`: loads/writes `MEMORY.md` per agent.
- `RunLifecycleLogger` (`src/runtime/run-lifecycle.ts`): emits typed run lifecycle events with stable IDs (`runId`, `agentId`, `sessionKey`) and lifecycle stages (`started`, `completed`, `failed`).
- `RunLogStore` (`src/runtime/run-log-store.ts`): maps lifecycle stages into durable `gravity.runs` inserts/updates.
- `ToolDispatcher`: single dispatch seam for all tool execution (host now, sandbox later).
- `Scheduler`: heartbeat and cron execution with target session behavior.

## Non-Goals for Current Bootstrap
- No non-slash agent triggering from `app_mention`/`message` events in the runtime path.
- No channel-based `channel_id -> agentId` routing fallback in the runtime path.
- No full CP6 session manager parity yet (dual-history compaction + session-end memory hook).
- No sandbox enforcement yet.

## Ownership and Rollback Notes
- `DbClient` owner: platform runtime layer.
- `DbClient` rollback path: swap `src/runtime/db.ts` back to direct `pg` access while preserving SQL contracts and migration files.
- `SlackTransport` owner: platform runtime layer.
- `SlackTransport` rollback path: disable live Slack connection in `src/index.ts` and fall back to no-op inbound logging while preserving normalized inbound event contracts.
- `RunLifecycleLogger` owner: platform runtime layer.
- `RunLifecycleLogger` rollback path: revert runtime entrypoints to direct `console.log` messages while preserving stable ID fields in log lines.
- `RunLogStore` owner: platform runtime layer.
- `RunLogStore` rollback path: keep lifecycle log lines but disable `gravity.runs` writes from `src/index.ts` while retaining the DB schema contract.
- `PiAgentRunner` owner: platform runtime layer.
- `PiAgentRunner` rollback path: revert `src/index.ts` slash command execution path to deterministic echo-only behavior while preserving `RunLifecycleLogger` + `RunLogStore` contracts.

## Stability Requirement
Do not change interface boundaries without updating this file and `docs/checkpoints/mvp-status.md` in the same change.
