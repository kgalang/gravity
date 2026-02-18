# AGENTS

This repository follows a harness-oriented workflow: docs first, clear interfaces, and strict merge gates.

## Fast Map
- Canonical docs index: [docs/README.md](docs/README.md)
- Canonical rearchitecture decision: [docs/architecture/rearchitecture-decision.md](docs/architecture/rearchitecture-decision.md)
- Current execution plan: [docs/plans/active/2026-02-18-cp5-1-rearchitecture-parity.md](docs/plans/active/2026-02-18-cp5-1-rearchitecture-parity.md)
- Checkpoint board: [docs/checkpoints/mvp-status.md](docs/checkpoints/mvp-status.md)
- CP10 verification matrix: [docs/checkpoints/cp10-verification.md](docs/checkpoints/cp10-verification.md)
- System map: [docs/architecture/system-map.md](docs/architecture/system-map.md)
- Interface boundaries: [docs/architecture/interfaces.md](docs/architecture/interfaces.md)
- Harness practices adopted here: [docs/harness/practices.md](docs/harness/practices.md)
- Design beliefs: [docs/DESIGN.md](docs/DESIGN.md)
- Planning model: [docs/PLANS.md](docs/PLANS.md)
- Quality scorecard: [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md)
- Reliability baseline: [docs/RELIABILITY.md](docs/RELIABILITY.md)
- Security baseline: [docs/SECURITY.md](docs/SECURITY.md)
- Tech debt tracker: [docs/tech-debt-tracker.md](docs/tech-debt-tracker.md)
- TypeScript style guide: [docs/typescript_recommendations.md](docs/typescript_recommendations.md)
- Merge gates: [docs/policies/merge-gates.md](docs/policies/merge-gates.md)
- Agent-generated acceptance bar: [docs/policies/agent-generated.md](docs/policies/agent-generated.md)
- Autonomy rollout ladder: [docs/policies/autonomy-ladder.md](docs/policies/autonomy-ladder.md)
- Doc maintenance policy: [docs/policies/doc-gardening.md](docs/policies/doc-gardening.md)
- Bootstrap runbook: [docs/operations/runbook.md](docs/operations/runbook.md)

## Working Rules
- Treat `docs/` as system-of-record. If code and docs diverge, update docs in the same change.
- Keep `AGENTS.md` short and navigational. Put detailed guidance in linked docs.
- Run `npm run check` before handoff.
- Keep stable IDs (`agentId`, `sessionKey`, `runId`) explicit in code and docs.
- Keep durable state split: Postgres for queryable state, `store/` for skills and memory, `workspace/` ephemeral.
- Do not add runtime complexity without documenting owner, boundary, and rollback path.

## Done Criteria
- CP1 baseline remains runnable (`npm run dev` starts cleanly).
- CP2 baseline remains reproducible (`docker compose up -d postgres`, `npm run db:apply`).
- All required docs and checkpoints remain valid (`npm run lint:repo`).
