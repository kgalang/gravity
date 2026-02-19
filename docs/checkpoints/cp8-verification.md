# CP8 Verification Matrix

Last Updated: 2026-02-19
Owner: kevin + codex

## Scope
Validate CP8 self-authoring mutation contracts for:
- teach/update intent detection and deterministic delta generation,
- per-agent lock + FIFO queueing with replay-safe dedupe,
- mutation allowlist enforcement and explicit policy-denied status,
- deterministic skill/memory writes with rollback snapshot output,
- skill evolution audit writes in `gravity.skill_versions` with stable-ID linkage.

## Matrix

| Area | Contract | Verification Command | Evidence |
| --- | --- | --- | --- |
| Teach-learn-apply | Expert instruction produces durable skill/memory updates without deployment | `npm run verify:cp8` | Skill + memory files updated in temp store scaffold |
| Mutation correctness | Approved deltas apply exactly once | `npm run verify:cp8` | Duplicate trigger is deduped and does not reapply |
| Auditability | Each self-authored skill change writes a linked `gravity.skill_versions` row | `npm run verify:cp8` | Audit rows inserted with `runId`, `sessionKey`, and `sourceEventId` in `change_summary` |
| Idempotent trigger handling | Duplicate trigger key is dropped replay-safely | `npm run verify:cp8` | Duplicate source-event request returns `deduped_duplicate` |
| Lock/queue correctness | Conflicting writes serialize FIFO by `agentId` lock scope | `npm run verify:cp8` | FIFO marker order in skill file (`fifo-order-one` before `fifo-order-two`) |
| Overflow behavior | Queue-full requests reject with explicit `queue_overflow` | `npm run verify:cp8` | Second concurrent request rejected at `maxDepth=1` |
| Mutation policy guardrail | Non-allowlisted paths fail closed with explicit status | `npm run verify:cp8` | `update file src/index.ts` returns `mutation_policy_denied` |
| Stable-ID observability | Self-authoring audit linkage carries stable IDs | `npm run verify:cp8` | `change_summary` includes `runId=`, `sessionKey=`, `sourceEventId=` |
| Agent-definition immutability | Self-authoring cannot modify runtime/agent declaration surfaces | `npm run verify:cp8` | Disallowed path mutation is denied before write |

## Evidence Snapshot (2026-02-19)
- `npm run verify:cp8` result: `verification passed (teach_apply=true, mutation_correctness=true, auditability=true, idempotent_dedupe=true, lock_fifo=true, queue_overflow=true, mutation_policy_guardrail=true, stable_id_linkage=true)`.
- CP8 harness validated allowlist-only mutation surfaces:
  - `store/shared/skills/*.md`
  - `store/agents/{agentId}/memory/MEMORY.md`
- Skill audit rows were verified for stable-ID linkage in `gravity.skill_versions.change_summary`.
