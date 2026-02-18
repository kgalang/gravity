# MVP Checkpoint Status

Last Updated: 2026-02-18

| Checkpoint | Status | Notes | Verification |
| --- | --- | --- | --- |
| CP1 | complete | Runtime scaffold verified: `npm run dev` starts cleanly and `npm run check` passes. | `npm run dev`, `npm run check` |
| CP2 | complete | Postgres started, dbmate migrations + seed applied, and `gravity.agents` query returned seeded rows. Kysely + pg baseline scaffolded for runtime query access. | `npm run db:up`, `npm run db:apply`, `docker compose exec -T postgres psql -U gravity -d gravity -c "SELECT id, name, status, channel_id FROM gravity.agents;"` |
| CP3 | complete | Slack Socket Mode transport is live with slash-command ingestion, static slash routing (`/wiggs` -> `data-analyst`, `/compliance` -> `compliance-helper`), deterministic slash acknowledgements (`ephemeral` for routed and unmapped commands), and `gravity.runs` lifecycle persistence on routed commands. Routed slash commands are then surfaced by posting a root thread message before threaded replies. CP3 established the slash baseline; non-slash ingress expansion is now tracked in CP4. | `npm run check`, `/wiggs <query>` in Slack, `docker compose exec -T postgres psql -U gravity -d gravity -c "SELECT id, agent_id, session_key, source_event_id, status FROM gravity.runs ORDER BY started_at DESC LIMIT 5;"` |
| CP4 | complete | End-to-end Wiggs runtime is live with Claude loop integration, per-turn skill + dbt context loading, output truncation protections, and ingress-binding coverage for slash + `app_mention` + thread/DM message paths. Stable run/session dimensions and source-event idempotency checks are in place. CP10 scheduler foundations delivered during CP4 remain tracked as a separate completion pass. | `docs/plans/completed/2026-02-18-cp4-wiggs-e2e.md`, `/wiggs <query>` in Slack, `npm run check` |
| CP5 | in_progress | CP5 execution is open to verify run logging durability and `store/` conventions, including `query-gravity` + `rollback` skill behavior and failure-path run persistence. | `docs/plans/active/2026-02-18-cp5-run-logging-store-conventions.md` |
| CP6 | not_started | Session manager and compaction not implemented yet. | N/A |
| CP7 | not_started | Session/memory tests not implemented yet. | N/A |
| CP8 | not_started | Self-authoring runtime loop not implemented yet. | N/A |
| CP9 | not_started | Second agent runtime behavior not implemented yet. | N/A |
| CP10 | in_progress | Runtime scheduler now resolves `proactiveTriggers` and executes `cron`/`heartbeat` triggers with Slack delivery routing (`channel_thread`, `dm`) and run/session logging. This work started early during CP4 as a foundation slice. Remaining CP10 work is live trigger validation, replay/backfill behavior, manual wake tooling, and quiet-hours verification. | `src/runtime/proactive-trigger-scheduler.ts` |
| CP11 | not_started | Demo polish and rehearsal not started. | N/A |

## Next Milestones
- Execute CP5 verification matrix across slash, non-slash, and proactive runs and capture `gravity.runs` evidence.
- Validate `query-gravity` and `rollback` skill flows with a controlled skill edit + restore cycle.
- Close CP5 and then run deferred CP10 validation/hardening (`channel_thread`/`dm` delivery validation, replay/backfill, manual wake, quiet hours).
- Start CP6 session + memory scaffolding after CP5 and CP10 completion criteria are met.
