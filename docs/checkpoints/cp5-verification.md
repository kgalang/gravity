# CP5 Verification Matrix

Last Updated: 2026-02-18
Owner: kevin + codex

## Scope
Validate CP5 contracts for:
- `gravity.runs` lifecycle durability (started/completed/failed) with stable identifiers.
- Trigger-dimension coverage across slash, non-slash, and proactive entrypoints.
- `store/` layout conventions and root-repo git ownership.
- Shared skill behavior for `query-gravity` and `rollback`.

## Matrix

| Area | Contract | Verification Command | Evidence |
| --- | --- | --- | --- |
| Run logging lifecycle | Started + completed/failed rows persist in `gravity.runs` | `npm run verify:cp5` | Pass/fail summary from script |
| Trigger coverage | Slash (`slash_command`), non-slash (`app_mention`, `thread_reply`), proactive (`cron`, `heartbeat`) persist dimensions | `npm run verify:cp5` | Script asserts `trigger_kind` + `entrypoint` fields |
| Failure path | Failed runs persist `status=failed`, `error_message`, `completed_at`, null `result_summary` | `npm run verify:cp5` | Script assertions |
| Store conventions | `store/shared/*` and `store/agents/*` paths exist; no nested `store/.git` | `npm run verify:cp5` and `npm run test:invariants` | Script + invariant checks |
| Query skill contract | Agent can introspect config/runs/skill history with read-only SQL | `cat store/shared/skills/query-gravity.md` | Required query set present |
| Rollback skill contract | File-scoped git rollback procedure is explicit and non-destructive | `cat store/shared/skills/rollback.md` | Required procedure/rules present |

## Evidence Snapshot (2026-02-18)
- `npm run verify:cp5` result: `verification passed (5 runs validated across slash/non-slash/proactive + failure paths)`.
- Run-dimension query sample:
  - `cron / cron / completed = 2`
  - `heartbeat / heartbeat / completed = 2`
  - `message / slash_command / completed = 14`
  - `message / app_mention / completed = 4`
  - `message / direct_message / completed = 3`
  - `message / thread_reply / completed = 6`
  - `message / thread_reply / failed = 2`
- Rollback validation cycle:
  - file: `store/agents/compliance-helper/skills/review-rules.md`
  - pre-edit hash: `194f7b6f1f44d04a8101437ce7ab87f4bb97f224`
  - post-restore hash: `194f7b6f1f44d04a8101437ce7ab87f4bb97f224`
  - result: `rollback_cycle=ok`

## Optional Live Sampling
Use these after live Slack runs to inspect production-like evidence:

```sql
SELECT id, agent_id, trigger_kind, surface, entrypoint, status, source_event_id, session_key, started_at, completed_at
FROM gravity.runs
ORDER BY started_at DESC
LIMIT 50;
```

```sql
SELECT trigger_kind, entrypoint, status, count(*) AS run_count
FROM gravity.runs
GROUP BY trigger_kind, entrypoint, status
ORDER BY trigger_kind, entrypoint, status;
```
