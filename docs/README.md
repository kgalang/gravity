# Docs System of Record

These docs are the canonical source of truth for architecture, execution status, and operational policy.

## Core Documents

- [Canonical rearchitecture decision](architecture/rearchitecture-decision.md)
- [Architecture system map](architecture/system-map.md)
- [Architecture interfaces](architecture/interfaces.md)
- [TEMP CP7 memory-hook deep dive](architecture/temp-cp7-session-end-memory-hook-explainer.md)
- [TEMP OpenClaw vs Gravity session/memory strategy](architecture/temp-openclaw-vs-gravity-session-memory.md)
- [MVP checkpoint status](checkpoints/mvp-status.md)
- [CP6 verification matrix](checkpoints/cp6-verification.md)
- [CP7 verification matrix](checkpoints/cp7-verification.md)
- [CP10 verification matrix](checkpoints/cp10-verification.md)
- [Active plan](plans/active/2026-02-18-cp7-session-end-memory-hook-reliability.md)
- [Planning model](PLANS.md)
- [Harness practices mapping](harness/practices.md)
- [Merge gates policy](policies/merge-gates.md)
- [Agent-generated quality bar](policies/agent-generated.md)
- [Autonomy rollout ladder](policies/autonomy-ladder.md)
- [Doc gardening policy](policies/doc-gardening.md)
- [Bootstrap runbook](operations/runbook.md)
- [Slack app setup](operations/slack-app-setup.md)
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
