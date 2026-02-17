# Shared Skill: Query Gravity

Use Postgres to inspect your own configuration and history.

Useful queries:
- Agent definition: `SELECT * FROM gravity.agents WHERE id = '<agent-id>';`
- Recent runs: `SELECT * FROM gravity.runs WHERE agent_id = '<agent-id>' ORDER BY started_at DESC LIMIT 20;`
- Skill history: `SELECT * FROM gravity.skill_versions WHERE agent_id = '<agent-id>' ORDER BY created_at DESC LIMIT 20;`
