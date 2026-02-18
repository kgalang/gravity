# MVP Checkpoint Status

Last Updated: 2026-02-18

| Checkpoint | Status | Notes | Verification |
| --- | --- | --- | --- |
| CP1 | complete | Runtime scaffold verified: `npm run dev` starts cleanly and `npm run check` passes. | `npm run dev`, `npm run check` |
| CP2 | complete | Postgres started, dbmate migrations + seed applied, and `gravity.agents` query returned seeded rows. Kysely + pg baseline scaffolded for runtime query access. | `npm run db:up`, `npm run db:apply`, `docker compose exec -T postgres psql -U gravity -d gravity -c "SELECT id, name, status, channel_id FROM gravity.agents;"` |
| CP3 | complete | Slack Socket Mode transport is live with slash-command ingestion, static slash routing (`/wiggs` -> `data-analyst`, `/compliance` -> `compliance-helper`), deterministic slash acknowledgements (`ephemeral` for routed and unmapped commands), and `gravity.runs` lifecycle persistence on routed commands. Routed slash commands are then surfaced by posting a root thread message before threaded replies. CP3 established the slash baseline; non-slash ingress expansion is now tracked in CP4. | `npm run check`, `/wiggs <query>` in Slack, `docker compose exec -T postgres psql -U gravity -d gravity -c "SELECT id, agent_id, session_key, source_event_id, status FROM gravity.runs ORDER BY started_at DESC LIMIT 5;"` |
| CP4 | complete | End-to-end Wiggs runtime is live with Claude loop integration, per-turn skill + dbt context loading, output truncation protections, and ingress-binding coverage for slash + `app_mention` + thread/DM message paths. Stable run/session dimensions and source-event idempotency checks are in place. CP10 scheduler foundations delivered during CP4 remain tracked as a separate completion pass. | `docs/plans/completed/2026-02-18-cp4-wiggs-e2e.md`, `/wiggs <query>` in Slack, `npm run check` |
| CP5 | complete | Run logging and `store/` conventions are verified with a DB-backed CP5 harness (`npm run verify:cp5`), store-convention invariants, explicit shared skill contracts (`query-gravity`, `rollback`), and evidence queries across slash/non-slash/proactive/failure run dimensions. | `docs/plans/completed/2026-02-18-cp5-run-logging-store-conventions.md`, `docs/checkpoints/cp5-verification.md`, `npm run verify:cp5`, `docker compose exec -T postgres psql -U gravity -d gravity -c "SELECT trigger_kind, entrypoint, status, count(*) AS run_count FROM gravity.runs GROUP BY trigger_kind, entrypoint, status ORDER BY trigger_kind, entrypoint, status;"` |
| CP5.1 | in_progress | Rearchitecture parity checkpoint is active. Step 1 and Step 2 are complete (`defineConfig`/`defineAgent` contracts + typed `agents` registry + compiled ingress/proactive/session declarations); remaining work is runtime cutover + legacy module removal + parity verification before resuming CP6. | `docs/plans/active/2026-02-18-cp5-1-rearchitecture-parity.md`, `docs/architecture/rearchitecture-decision.md`, `agents/index.ts`, `agents/contracts.ts` |
| CP6 | blocked | CP6 session + memory scaffolding is on hold pending CP5.1 rearchitecture parity completion and legacy-module removal gate. | `docs/plans/on-hold/2026-02-18-cp6-sessions-memory-scaffolding.md` |
| CP7 | not_started | Session/memory tests are blocked until CP5.1 parity completes and CP6 resumes. | N/A |
| CP8 | not_started | Self-authoring runtime loop not implemented yet. | N/A |
| CP9 | not_started | Second agent runtime behavior not implemented yet. | N/A |
| CP10 | complete | Proactive runtime now includes replay/backfill reconciliation from durable run history, manual wake controls (`!wake` command text on mapped slash commands), and quiet-hours suppression with optional manual bypass. CP10 verification harness validates replay/manual/quiet-hours behavior and proactive run-log persistence contracts. | `docs/plans/completed/2026-02-18-cp10-proactive-validation-hardening.md`, `docs/checkpoints/cp10-verification.md`, `npm run verify:cp10`, `src/runtime/proactive-trigger-scheduler.ts` |
| CP11 | not_started | Demo polish and rehearsal not started. | N/A |

## Next Milestones
- Complete CP5.1 code-defined rearchitecture parity (`defineConfig`/`defineAgent` contracts, compiled declarations, and runtime cutover).
- Remove legacy JSONB-driven runtime modules listed in `docs/architecture/rearchitecture-decision.md`.
- Re-run parity gates (`npm run verify:cp5`, `npm run verify:cp10`) and full repo checks after cutover.
- Resume CP6 from on-hold once CP5.1 exit criteria are met.
- Execute CP7 test matrix after CP6 scaffolding lands.
