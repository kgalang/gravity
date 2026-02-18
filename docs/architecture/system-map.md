# System Map

## MVP Topology
- Runtime process: `src/` (single process scaffold, later to host Slack loop + scheduling + tool dispatch).
- Queryable durable state: Postgres schema `gravity` (versioned in `db/migrations/`, bootstrap snapshot in `schema.sql`).
- Query layer: Kysely + pg dialect (`src/runtime/db.ts`).
- Durable file state: `store/` (agent skills, memory, shared connectors, shared knowledge).
- Ephemeral runtime state: `workspace/` (session logs, compactable context, scratch).

## Durable State Contract
- `gravity.agents`: canonical agent registry.
- `gravity.sessions`: canonical session metadata registry (mode/ownership/status).
- `gravity.runs`: canonical run log and audit surface.
- `gravity.skill_versions`: canonical skill evolution log.
- `store/agents/{agentId}/skills`: agent-specific behavioral instructions.
- `store/agents/{agentId}/memory/MEMORY.md`: persistent memory loaded each turn.
- `store/shared/skills`: platform primitives inherited by all agents.

## Session Contract (Target)
- Session key format: mode-dependent (`{agent-id}:main`, `{agent-id}:{thread_ts}`, `{agent-id}:{source_event_id}`, and proactive keys under `{agent-id}:proactive:*`).
- Session metadata: `gravity.sessions` stores identity, mode, ownership, and last activity.
- Permanent log: `workspace/{agent-id}/sessions/{session-key}/log.jsonl`.
- LLM working context: `workspace/{agent-id}/sessions/{session-key}/context.jsonl`.
- Cross-session search log: `workspace/{agent-id}/agent-log.jsonl`.

## Integration Targets
- Slack Socket Mode routing from slash commands, app mentions, thread replies, and direct messages via `ingressBindings`.
- Routed slash command acknowledgements should return `response_type: ephemeral`; runtime then posts a visible root thread message before replying in thread. Unmapped slash commands should acknowledge with `response_type: ephemeral`.
- Non-slash message triggers are enabled through explicit per-agent ingress bindings.
- Proactive triggers (`cron`, `heartbeat`) run from `gravity.agents.config.proactiveTriggers` with delivery routing to Slack channel thread or Slack DM user.
- Proactive scheduler reconciles missed runs from persisted run history on startup/reload windows and supports manual wake controls for heartbeat triggers.
- Quiet-hours policy can suppress proactive replay/scheduled runs while allowing explicit manual bypass.
- Source-event idempotency is enforced before run execution (in-flight guard + `gravity.runs.source_event_id` check).
- Claude API loop with compaction and tool-result truncation from `mvp_requirements.md`.
- DuckDB connector at `/Users/kevingalang/code/jaffle_shop_duckdb/jaffle_shop.duckdb` for Wiggs.
