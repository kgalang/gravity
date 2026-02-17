# Shared Skill: Log Run

For each completed interaction:
1. Write a row to `gravity.runs` with `agent_id`, `session_key`, source metadata, status, and summary.
2. Record `completed_at` for terminal states.
3. Capture token and cost metadata when available.
4. Preserve errors in `error_message` when status is `failed`.
