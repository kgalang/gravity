# System Map

## MVP Topology
- Runtime process: `src/` (single process scaffold, later to host Slack loop + scheduling + tool dispatch).
- Queryable durable state: Postgres schema `gravity` (versioned in `db/migrations/`, bootstrap snapshot in `schema.sql`).
- Query layer: Kysely + pg dialect (`src/runtime/db.ts`).
- Durable file state: `store/` (shared skills/resources/knowledge and agent memory).
- Ephemeral runtime state: `workspace/` (session logs, compactable context, scratch).

CP5.1 migration note:
- Runtime behavior source of truth is moving to code-defined agent declarations.
- `gravity.agents` remains a queryable projection/registry surface, not canonical behavior config.
- Capability composition source of truth is `defineAgent(...).useCapabilities`; capabilities resolve shared skills/resources/tool grants, and runtime no longer loads `store/agents/{agentId}/skills`.

## Durable State Contract
- `gravity.agents`: queryable agent registry projection and metadata surface.
- `gravity.sessions`: canonical session metadata registry (mode/ownership/status).
- `gravity.runs`: canonical run log and audit surface.
- `gravity.skill_versions`: canonical skill evolution log.
- `store/shared/skills`: canonical skill catalog inherited/composed by all agents (platform primitives + namespaced agent-specific modules).
- `store/agents/{agentId}/memory/MEMORY.md`: persistent memory loaded each turn.

## Session Contract (CP6 + CP7)
- Session key format: mode-dependent (`{agent-id}:main`, `{agent-id}:{thread_ts}`, `{agent-id}:{source_event_id}`, and proactive keys under `{agent-id}:proactive:*`).
- Session metadata: `gravity.sessions` stores identity, mode, ownership, and last activity.
- Permanent log: `workspace/{agent-id}/sessions/{session-key}/log.jsonl`.
- LLM working context: `workspace/{agent-id}/sessions/{session-key}/context.jsonl`.
- Cross-session search log: `workspace/{agent-id}/agent-log.jsonl`.
- Pre-run sync seam: unsynced `log.jsonl` user/system entries are loaded into `context.jsonl` via source-event dedupe markers, while records tagged `skipContextReplay=true` remain audit-only and are excluded.
- Startup backfill seam: active Slack thread sessions can ingest missed thread history into `log.jsonl` before normal processing.
- Idle-session close flow: idle timers execute a silent session-end memory hook turn (when enabled) and then perform guarded close (`closeSessionIfUnchanged`) so stale callbacks cannot overwrite reactivated session state.

## Integration Targets
- Slack Socket Mode routing from slash commands, app mentions, thread replies, and direct messages via compiled code-defined listener declarations.
- Routed slash command acknowledgements should return `response_type: ephemeral`; runtime then posts a visible root thread message before replying in thread. Unmapped slash commands should acknowledge with `response_type: ephemeral`.
- Non-slash message triggers are enabled through explicit per-agent listener declarations.
- Proactive triggers (`cron`, `heartbeat`) run from compiled code-defined proactive declarations with delivery routing to Slack channel thread or Slack DM user.
- Proactive scheduler reconciles missed runs from persisted run history on startup/reload windows and supports manual wake controls for heartbeat triggers.
- Quiet-hours policy can suppress proactive replay/scheduled runs while allowing explicit manual bypass.
- Source-event idempotency is enforced before run execution (in-flight guard + `gravity.runs.source_event_id` check).
- CP8 self-authoring mutation flow supports teach/update intent detection, allowlist-only writes (`store/shared/skills/*.md`, `store/agents/{agentId}/memory/MEMORY.md`), per-agent FIFO mutation queueing, and `gravity.skill_versions` audit logging.
- CP9 Pearlboy compliance flow is routed through the standard agent runtime (same turn engine as other agents) and uses shared compliance skills to produce conversational review guidance in Slack threads.
- Claude API loop with compaction and tool-result truncation from `mvp_requirements.md`.
- CP6 fail-closed runtime config: invalid session/compaction/retry/hook settings disable feature activation and emit runtime warnings.
- DuckDB resource at `/Users/kevingalang/code/jaffle_shop_duckdb/jaffle_shop.duckdb` for Wiggs.
