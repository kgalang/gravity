# MVP Checkpoint Status

Last Updated: 2026-02-18

| Checkpoint | Status | Notes | Verification |
| --- | --- | --- | --- |
| CP1 | complete | Runtime scaffold verified: `npm run dev` starts cleanly and `npm run check` passes. | `npm run dev`, `npm run check` |
| CP2 | complete | Postgres started, dbmate migrations + seed applied, and `gravity.agents` query returned seeded rows. Kysely + pg baseline scaffolded for runtime query access. | `npm run db:up`, `npm run db:apply`, `docker compose exec -T postgres psql -U gravity -d gravity -c "SELECT id, name, status, channel_id FROM gravity.agents;"` |
| CP3 | complete | Slack Socket Mode transport is live with slash-command ingestion, static slash routing (`/wiggs` -> `data-analyst`, `/compliance` -> `compliance-helper`), deterministic slash acknowledgements (`ephemeral` for routed and unmapped commands), and `gravity.runs` lifecycle persistence on routed commands. Routed slash commands are then surfaced by posting a root thread message before threaded replies. CP3 established the slash baseline; non-slash ingress expansion is now tracked in CP4. | `npm run check`, `/wiggs <query>` in Slack, `docker compose exec -T postgres psql -U gravity -d gravity -c "SELECT id, agent_id, session_key, source_event_id, status FROM gravity.runs ORDER BY started_at DESC LIMIT 5;"` |
| CP4 | in_progress | `pi-*` dependencies are installed and `/wiggs` is wired to a `pi-coding-agent` Claude loop with per-turn `store/` skill loading, dbt context loading, and built-in read/bash truncation behavior. Runtime now includes ingress-binding-driven non-slash triggers (`app_mention`, `message` thread/DM), split run dimensions (`trigger_kind`, `surface`, `entrypoint`), `gravity.sessions` metadata writes, proactive trigger scheduling (`cron` + `heartbeat`), and source-event idempotency guard checks. Remaining CP4 work is live Slack E2E validation and tuning against target prompts. | `docs/plans/active/2026-02-18-cp4-wiggs-e2e.md` |
| CP5 | not_started | Run logging + store conventions partially scaffolded only. | N/A |
| CP6 | not_started | Session manager and compaction not implemented yet. | N/A |
| CP7 | not_started | Session/memory tests not implemented yet. | N/A |
| CP8 | not_started | Self-authoring runtime loop not implemented yet. | N/A |
| CP9 | not_started | Second agent runtime behavior not implemented yet. | N/A |
| CP10 | in_progress | Runtime scheduler now resolves `proactiveTriggers` and executes `cron`/`heartbeat` triggers with Slack delivery routing (`channel_thread`, `dm`) and run/session logging. Remaining work is live trigger validation, replay/backfill behavior, and manual wake tooling. | `src/runtime/proactive-trigger-scheduler.ts` |
| CP11 | not_started | Demo polish and rehearsal not started. | N/A |

## Next Milestones
- Run `/wiggs` Slack E2E validation against CP4 prompts and tune prompt/tool behavior based on failures.
- Validate ingress-binding-driven non-slash trigger behavior (`app_mention`, `thread_reply`, DM message) end to end with live Slack traffic.
- Validate proactive trigger delivery paths (`channel_thread`, `dm`) with real Slack trigger executions.
- Confirm `gravity.runs` summaries and failure paths during real Claude runs, then close CP4.
