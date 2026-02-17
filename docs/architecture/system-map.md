# System Map

## MVP Topology
- Runtime process: `src/` (single process scaffold, later to host Slack loop + scheduling + tool dispatch).
- Queryable durable state: Postgres schema `gravity` (`schema.sql`).
- Durable file state: `store/` (agent skills, memory, shared connectors, shared knowledge).
- Ephemeral runtime state: `workspace/` (session logs, compactable context, scratch).

## Durable State Contract
- `gravity.agents`: canonical agent registry.
- `gravity.runs`: canonical run log and audit surface.
- `gravity.skill_versions`: canonical skill evolution log.
- `store/agents/{agentId}/skills`: agent-specific behavioral instructions.
- `store/agents/{agentId}/memory/MEMORY.md`: persistent memory loaded each turn.
- `store/shared/skills`: platform primitives inherited by all agents.

## Session Contract (Target)
- Session key format: `{agent-id}:{thread_ts}`.
- Permanent log: `workspace/{agent-id}/sessions/{session-key}/log.jsonl`.
- LLM working context: `workspace/{agent-id}/sessions/{session-key}/context.jsonl`.
- Cross-session search log: `workspace/{agent-id}/agent-log.jsonl`.

## Integration Targets
- Slack Socket Mode routing from `channel_id` to `agentId` via `gravity.agents`.
- Claude API loop with compaction and tool-result truncation from `mvp_requirements.md`.
- DuckDB connector at `/Users/kevingalang/code/jaffle_shop_duckdb/jaffle_shop.duckdb` for Wiggs.
