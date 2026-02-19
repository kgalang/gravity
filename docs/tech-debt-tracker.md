# Tech Debt Tracker

Last Updated: 2026-02-19

| ID | Debt Item | Impact | Planned Fix |
| --- | --- | --- | --- |
| TD-001 | Runtime tests still do not cover run-lifecycle-backed slash command execution paths end-to-end | CP3 regressions can slip in routed slash handling, run persistence, and threaded reply behavior | Add focused tests for `/wiggs` command routing through lifecycle + run-log + reply seams before CP3 merge |
| TD-002 | Docker daemon dependency not validated in CI | Local setup drift can block CP2 | Add compose smoke job or documented fallback |
| TD-003 | No CI migration smoke test yet | Migration regressions can slip until manual runtime checks | Add CI job for `npm run db:up && npm run db:migrate && npm run db:apply` |
| TD-004 | `schema.sql` snapshot is maintained manually | Schema snapshot can drift from `db/migrations/` over time | Add a repo check that validates `schema.sql` matches migration output |
| TD-005 | Shutdown path does not enforce best-effort process exit when Slack disconnect fails | Runtime can hang or exit non-deterministically during SIGINT/SIGTERM under socket/network failure | Wrap Slack transport stop in guarded shutdown logic (`try/finally`), log disconnect errors, and always complete process termination |
| TD-006 | No `npm run doctor` command for runtime/live-definition misconfiguration checks | Misconfigured agent specs, resource paths, ingress bindings, required CLIs, or runtime writability can fail late at runtime | Add `npm run doctor` with scoped runtime checks that explicitly avoid overlap with TypeScript/static guarantees |
| TD-007 | Long-term memory strategy is currently session-end-hook-centric; no optional continuous capture mode yet | Low-volume sessions can miss durable extraction opportunities until idle close, and memory quality policy remains implicit | Post-demo: evaluate hybrid strategy (session-end hook + optional continuous capture + optional pre-compaction flush), define quality gates/telemetry, and stage rollout behind config flags |
