# CP5.1 Plan (Rearchitecture + Parity)

Status: active
Owner: kevin + codex
Last Updated: 2026-02-18

## Goal
Complete the CP5.1 rearchitecture so runtime behavior is driven by code-defined agent declarations and reaches parity with the current Slack/message/proactive behavior before resuming downstream checkpoints.

## Scope Decision
CP5.1 is a control-plane migration checkpoint between CP5 and CP6.

- In scope: code-defined `defineConfig`/`defineAgent` contracts, compiled runtime declarations, removal of JSONB-driven resolver/router modules, parity verification, and docs alignment.
- Out of scope: CP6 session/memory scaffolding implementation details, CP7 reliability matrix, CP8 self-authoring automation, and CP11 demo polish.

## CP5.1 In/Out
- In scope: contract lock + registry assembly, declaration compilation, ingress/proactive/session cutovers, executor seam consolidation, legacy module removal, parity verification, and checkpoint/docs updates.
- Out of scope: CP6 dual-history/compaction implementation, CP7 reliability matrix expansion, CP8 self-authoring runtime loop, and CP11 demo polish.

## Step-by-Step Execution Plan (Ordered)

### Step 1 - Lock contracts + typed registry
Status: complete

Deliverables:
- Define and lock `defineConfig(...)` and `defineAgent(...)` minimum contracts per `docs/architecture/rearchitecture-decision.md`.
- Assemble typed registry in `agents/index.ts` with explicit `agentId` ownership and duplicate/collision guards.
- Establish code declarations as the canonical authoring source and prepare runtime cutover (runtime behavior source-of-truth cutover lands in Steps 2-4).

Gate:
- `npm run check`

### Step 2 - Compile runtime declarations from code
Status: complete

Deliverables:
- Emit typed declarations for ingress listeners, proactive triggers, and session dimensions from code-defined agents.
- Compile trigger dimensions directly at ingress/proactive boundaries (no trigger normalizer dependency).
- Keep stable IDs explicit through compiled shapes (`agentId`, `sessionKey`, `runId`).

Gate:
- `npm run check`

### Step 3 - Cut over slash + message ingress routing
Status: next

Deliverables:
- Rewire slash routing to compiled listener declarations.
- Rewire app mention, thread reply, and DM ingress resolution to compiled declarations.
- Preserve existing ack behavior and run lifecycle writes in `gravity.runs`.

Gate:
- `npm run check`

### Step 4 - Cut over proactive routing + session keys
Status: pending

Deliverables:
- Rewire proactive trigger resolution/scheduling to compiled proactive declarations.
- Validate canonical session key patterns across slash/app mention/thread/DM/proactive entrypoints.
- Preserve durable state contract (`gravity.runs`, `gravity.sessions`, `gravity.skill_versions`).

Gate:
- `npm run check`

### Step 5 - Consolidate executor seam
Status: pending

Deliverables:
- Introduce executor-manager wiring so all tool calls route through one `Executor` seam.
- Select runtime per-agent policy (host default; sandbox scaffold disabled for this checkpoint).
- Keep tool implementations executor-agnostic.

Gate:
- `npm run check`

### Step 6 - Remove JSONB-driven legacy modules
Status: pending

Deliverables:
- Remove the following modules after cutovers are fully wired:
  - `src/runtime/agent-config.ts`
  - `src/runtime/ingress-binding-resolver.ts`
  - `src/runtime/proactive-trigger-resolver.ts`
  - `src/runtime/slash-command-router.ts`
  - `src/runtime/trigger-normalizer.ts`
- Verify no runtime imports remain.

Gate:
- `npm run check`

### Step 7 - Prove parity + close docs/checkpoints
Status: pending

Deliverables:
- Verify CP5/CP10 harness parity and live smoke matrix.
- Update docs/checkpoints/plan state in the same change set.
- Mark CP5.1 complete and unblock CP6 only after all gates pass.

Gate:
- `npm run verify:cp5`
- `npm run verify:cp10`
- `npm run check`
- `npm run lint:repo`

## Evidence Snapshot (Step 1, 2026-02-18)
- Added code-defined contracts in `agents/contracts.ts` (`defineConfig`, `defineAgent`, and resolution-order helpers).
- Added code-defined agent declarations in `agents/data-analyst/agent.ts` and `agents/compliance-helper/agent.ts`.
- Added typed registry assembly + collision guards in `agents/index.ts` (duplicate `agentId` and slash-command collision checks).
- Added unit coverage in `tests/agents/contracts.test.ts` and `tests/agents/index.test.ts`.
- Verification gates passed after Step 1 changes: `npm run check`, `npm run build`.
- Runtime routing/resolution remains on legacy DB JSONB seams until Step 2-6 cutovers are complete.
- Added compiled declaration outputs in `agents/index.ts`:
  - ingress listeners (slash + message),
  - proactive triggers (resolved delivery/session dimensions),
  - session dimensions (`sessionKey` pattern contracts),
  - trigger dimensions (`triggerKind`, `surface`, `entrypoint`, `runId` pattern).
- Added Step 2 unit coverage in `tests/agents/index.test.ts` for compiled declarations, proactive/session dimension compilation, and fail-closed proactive delivery checks.
- Runtime routing/resolution still runs through legacy DB JSONB resolver seams until Step 3-6 cutovers are complete.

## Parity Matrix (Required)
- Slash command routing + ack behavior parity.
- App mention + thread reply + DM ingress parity.
- Proactive replay/manual wake/quiet-hours parity.
- Run lifecycle persistence parity (`runId`, `agentId`, `sessionKey`, `source_event_id`).

## Legacy Removal Gate
- `src/runtime/agent-config.ts` removed.
- `src/runtime/ingress-binding-resolver.ts` removed.
- `src/runtime/proactive-trigger-resolver.ts` removed.
- `src/runtime/slash-command-router.ts` removed.
- `src/runtime/trigger-normalizer.ts` removed.
- No runtime imports remain for removed modules.

## Risks
- Hidden behavior dependencies on `gravity.agents.config` can break routing after cutover.
- Session key drift can fragment history and invalidate CP6 assumptions.
- Legacy removal can regress edge cases if parity checks are too narrow.

## Exit Criteria
- Runtime uses code-defined declarations as the behavior source of truth.
- Legacy modules listed in `docs/architecture/rearchitecture-decision.md` are removed.
- `npm run check` passes.
- `npm run verify:cp5` passes.
- `npm run verify:cp10` passes.
- Checkpoint/docs state reflects CP5.1 completion and CP6 resume readiness.
