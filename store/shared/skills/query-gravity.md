# Shared Skill: Query Gravity

Use Postgres to inspect your own configuration and history.

When asked to introspect runtime state, run read-only SQL and cite the query used.

Required query set:
- Agent definition: `SELECT id, name, model, status, channel_id, config FROM gravity.agents WHERE id = '<agent-id>';`
- Recent runs: `SELECT id, trigger_kind, surface, entrypoint, status, source_event_id, session_key, started_at, completed_at, result_summary, error_message FROM gravity.runs WHERE agent_id = '<agent-id>' ORDER BY started_at DESC LIMIT 20;`
- Run outcomes by trigger: `SELECT trigger_kind, entrypoint, status, count(*) AS run_count FROM gravity.runs WHERE agent_id = '<agent-id>' GROUP BY trigger_kind, entrypoint, status ORDER BY trigger_kind, entrypoint, status;`
- Skill history: `SELECT agent_id, skill_name, version, changed_by, change_summary, created_at FROM gravity.skill_versions WHERE agent_id = '<agent-id>' ORDER BY created_at DESC LIMIT 20;`

Rules:
- Never mutate state in this skill (`SELECT` only).
- If no rows are returned, say that explicitly and suggest a narrower/broader time window query.
- Include `runId`/`sessionKey` when discussing a specific run.
