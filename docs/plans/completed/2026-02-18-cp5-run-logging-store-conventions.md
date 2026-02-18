# CP5 Plan (Run Logging + Store Conventions)

Status: complete
Owner: kevin + codex
Last Updated: 2026-02-18

## Goal
Close CP5 by validating run logging behavior end to end and locking `store/` conventions for shared and agent-local skills.

## Scope Decision
CP5 focuses on verification and contract-hardening, not major runtime expansion. Keep the CP4 Claude loop and trigger model intact, and only make targeted fixes required by CP5 verification results.

## CP5 In/Out
- In scope: `gravity.runs` lifecycle verification, run-summary/failure logging checks, `store/` layout contract validation, `query-gravity.md` and `rollback.md` skill validation, and doc updates for durable state ownership.
- Out of scope: CP6 session manager + compaction, CP7 session/memory test matrix, CP8 self-authoring automation, and deferred CP10 live validation/hardening work.

## Work Items
- [x] Define CP5 verification matrix for slash, non-slash, and proactive trigger runs.
- [x] Validate `gravity.runs` lifecycle writes (start, success/failure, summaries, stable IDs) across trigger paths.
- [x] Validate failure-path persistence in `gravity.runs` (error fields + completion timestamps).
- [x] Verify `store/` directory contracts remain stable (`shared/skills`, `shared/connectors`, `agents/{agentId}/{skills,memory}`).
- [x] Validate `store/shared/skills/query-gravity.md` behavior for agent/config/run introspection.
- [x] Validate `store/shared/skills/rollback.md` behavior with a controlled skill edit + git rollback.
- [x] Confirm `store/` versioning workflow uses the repo git history cleanly (no nested repo requirement).
- [x] Update checkpoint board and architecture/reliability docs for any CP5 boundary clarifications.

## Verification Evidence (2026-02-18)
- `npm run verify:cp5` passed and validated five persisted runs across `slash_command`, `app_mention`, `thread_reply` (failed), `cron`, and `heartbeat`.
- `docker compose exec -T postgres psql -U gravity -d gravity -c "SELECT trigger_kind, entrypoint, status, count(*) AS run_count FROM gravity.runs GROUP BY trigger_kind, entrypoint, status ORDER BY trigger_kind, entrypoint, status;"` showed persisted rows for slash/non-slash/proactive dimensions and failed thread replies.
- `git` file-scoped rollback cycle passed (`store/agents/compliance-helper/skills/review-rules.md` edited, then restored with `git restore --source=HEAD -- <file>`, hash matched pre-edit value).
- `query-gravity` SQL introspection queries executed successfully against `gravity.agents`, `gravity.runs`, and `gravity.skill_versions`.

## Risks
- Live Slack traffic can produce inconsistent run samples for validation.
- Rollback workflows can be risky if git operations are not tightly scoped to target files.
- Run summaries for failed/proactive paths may be incomplete and require runtime tuning.

## Exit Criteria
- CP5 verification evidence shows `gravity.runs` is reliable across ingress modes with stable IDs.
- `query-gravity` and `rollback` skills are validated against live runtime behavior.
- `store/` ownership and layout conventions are documented and unambiguous.
- `npm run check` passes.
- Docs and checkpoint state are updated in the same change.
