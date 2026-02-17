# Tech Debt Tracker

Last Updated: 2026-02-17

| ID | Debt Item | Impact | Planned Fix |
| --- | --- | --- | --- |
| TD-001 | No runtime tests yet | Regression risk rises quickly in CP3+ | Add test scaffold before Slack loop merge |
| TD-002 | Docker daemon dependency not validated in CI | Local setup drift can block CP2 | Add compose smoke job or documented fallback |
| TD-003 | No migration framework yet | Schema evolution risk after CP2 | Add migration tooling before first nontrivial schema change |
| TD-004 | No lockfile committed yet | Dependency drift over time | Commit `package-lock.json` with baseline |
