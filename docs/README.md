# Docs System of Record

These docs are the canonical source of truth for architecture, execution status, and operational policy.

## Core Documents

- [Architecture system map](architecture/system-map.md)
- [Architecture interfaces](architecture/interfaces.md)
- [MVP checkpoint status](checkpoints/mvp-status.md)
- [Active plan](plans/active/2026-02-18-cp4-wiggs-e2e.md)
- [Planning model](PLANS.md)
- [Harness practices mapping](harness/practices.md)
- [Merge gates policy](policies/merge-gates.md)
- [Agent-generated quality bar](policies/agent-generated.md)
- [Autonomy rollout ladder](policies/autonomy-ladder.md)
- [Doc gardening policy](policies/doc-gardening.md)
- [Bootstrap runbook](operations/runbook.md)
- [Quality scorecard](QUALITY_SCORE.md)
- [Reliability baseline](RELIABILITY.md)
- [Security baseline](SECURITY.md)
- [Tech debt tracker](tech-debt-tracker.md)
- [TypeScript recommendations](typescript_recommendations.md)

## Maintenance Contract
- Every architecture change updates `architecture/`.
- Every checkpoint movement updates `checkpoints/mvp-status.md`.
- Every active execution thread has exactly one active plan file.
- `AGENTS.md` remains an index, not a long playbook.
