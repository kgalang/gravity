# Harness Practices Adopted

This repo applies the key engineering practices from OpenAI's Harness Engineering write-up to the Gravity MVP build.

## Practice Mapping
- Keep docs as system-of-record.
- Keep `AGENTS.md` as a concise route map.
- Enforce standards with automation, not memory.
- Define acceptance criteria for agent-generated output.
- Increase autonomy in stages with explicit guardrails.
- Budget time for cleanup and entropy control.

## How This Repo Implements Them
- System of record: `docs/README.md` and linked architecture/checkpoint/policy docs.
- AGENTS map: `AGENTS.md` is limited and link-first; deep guidance lives under `docs/`.
- Enforcement: `npm run lint:repo` validates required files, checkpoint coverage, AGENTS shape, and doc links.
- Tacit-knowledge ratchets: `npm run test:invariants` enforces cross-file invariants (seed/store parity, checkpoint integrity, active-plan freshness, placeholder guardrails, and stable-ID contracts).
- Merge quality: `docs/policies/merge-gates.md` defines mandatory checks.
- Agent-generated quality bar: `docs/policies/agent-generated.md` defines minimum acceptance criteria.
- Autonomy ladder: `docs/policies/autonomy-ladder.md` defines phased trust expansion.
- Garbage collection: `docs/policies/doc-gardening.md` defines cadence and ownership for cleanup.

## Immediate Gap
The harness article emphasizes continuously maintained docs and clear interfaces. This scaffold establishes the contracts; runtime implementation must preserve them as `src/` grows.
