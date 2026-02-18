# MVP Checkpoint Status

Last Updated: 2026-02-18

| Checkpoint | Status | Notes | Verification |
| --- | --- | --- | --- |
| CP1 | complete | Runtime scaffold verified: `npm run dev` starts cleanly and `npm run check` passes. | `npm run dev`, `npm run check` |
| CP2 | complete | Postgres started, dbmate migrations + seed applied, and `gravity.agents` query returned seeded rows. Kysely + pg baseline scaffolded for runtime query access. | `npm run db:up`, `npm run db:apply`, `docker compose exec -T postgres psql -U gravity -d gravity -c "SELECT id, name, status, channel_id FROM gravity.agents;"` |
| CP3 | in_progress | Slack Socket Mode transport is live with slash-command ingestion, and slash command routing is now static and explicit (`/wiggs` -> `data-analyst`, `/compliance` -> `compliance-helper`) on a single router bot. Non-slash trigger paths (`app_mention`, `message`) are intentionally disabled for now. Echo replies and run-log writes are still pending. | `npm run check`, `npm run dev` |
| CP4 | not_started | Claude loop + DuckDB querying behavior not implemented yet. | N/A |
| CP5 | not_started | Run logging + store conventions partially scaffolded only. | N/A |
| CP6 | not_started | Session manager and compaction not implemented yet. | N/A |
| CP7 | not_started | Session/memory tests not implemented yet. | N/A |
| CP8 | not_started | Self-authoring runtime loop not implemented yet. | N/A |
| CP9 | not_started | Second agent runtime behavior not implemented yet. | N/A |
| CP10 | not_started | Heartbeat/cron behavior not implemented yet. | N/A |
| CP11 | not_started | Demo polish and rehearsal not started. | N/A |

## Next Milestones
- Add run lifecycle-backed inserts/updates for `gravity.runs` on routed slash commands.
- Add deterministic echo responses for routed slash commands.
- Validate end-to-end in Slack with `/wiggs` and confirm run persistence in Postgres.
