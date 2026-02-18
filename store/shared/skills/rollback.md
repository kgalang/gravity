# Shared Skill: Rollback

If a skill update regresses behavior:
1. Identify the exact skill file and last known good commit:
   `git log --oneline -- <skill-file>`
2. Preview the candidate rollback:
   `git show <good-commit>:<skill-file>`
3. Restore only the target file (never broad reset commands):
   `git restore --source=<good-commit> -- <skill-file>`
4. Verify the scoped diff:
   `git diff -- <skill-file>`
5. Commit with a clear rollback reason:
   `git add <skill-file> && git commit -m "rollback(<agent-id>): restore <skill-name> to <good-commit>"`
6. Record the rollback in `gravity.skill_versions`:
   `INSERT INTO gravity.skill_versions (agent_id, skill_name, version, changed_by, change_summary, file_hash) VALUES (...)`

Rules:
- Do not use destructive commands (`git reset --hard`, `git checkout -- .`).
- Keep rollback file-scoped unless explicitly asked for multi-file rollback.
- If rollback is aborted, leave the working tree in a clean state for the touched file.
