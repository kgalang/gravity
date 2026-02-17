# Tech Debt Tracker

Last Updated: 2026-02-17

| ID | Debt Item | Impact | Planned Fix |
| --- | --- | --- | --- |
| TD-001 | Runtime unit coverage is still narrow (config + lifecycle only) | CP3 regressions can still slip in Slack routing and agent registry behavior | Add unit tests for Slack event handling and `channel_id -> agentId` routing before CP3 merge |
| TD-002 | Docker daemon dependency not validated in CI | Local setup drift can block CP2 | Add compose smoke job or documented fallback |
| TD-003 | No CI migration smoke test yet | Migration regressions can slip until manual runtime checks | Add CI job for `npm run db:up && npm run db:migrate && npm run db:apply` |
| TD-004 | `schema.sql` snapshot is maintained manually | Schema snapshot can drift from `db/migrations/` over time | Add a repo check that validates `schema.sql` matches migration output |
