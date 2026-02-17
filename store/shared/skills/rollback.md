# Shared Skill: Rollback

If a skill update regresses behavior:
1. Find the previous commit touching the skill file.
2. Restore that version.
3. Commit the rollback with a clear reason.
4. Insert a rollback record in `gravity.skill_versions` describing what was reverted.
