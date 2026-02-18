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

## Work Items
- [ ] Define and lock `defineConfig(...)` + `defineAgent(...)` contracts and typed registry assembly (`agents/index.ts`).
- [ ] Compile ingress/proactive/session declarations from code and wire runtime to compiled declarations.
- [ ] Migrate slash/message/proactive routing off JSONB-driven config resolution.
- [ ] Introduce executor-manager wiring so all tool calls route through a single `Executor` seam with per-agent runtime selection (host default, sandbox scaffold disabled).
- [ ] Remove legacy modules called out in `docs/architecture/rearchitecture-decision.md`.
- [ ] Preserve durable state contracts (`gravity.runs`, `gravity.sessions`, `gravity.skill_versions`) and stable IDs end-to-end.
- [ ] Prove parity with `npm run verify:cp5`, `npm run verify:cp10`, and live smoke checks.
- [ ] Update architecture/checkpoint/plan docs in the same change set as runtime cutovers.

## Parity Matrix (Required)
- Slash command routing + ack behavior parity.
- App mention + thread reply + DM ingress parity.
- Proactive replay/manual wake/quiet-hours parity.
- Run lifecycle persistence parity (`runId`, `agentId`, `sessionKey`, `source_event_id`).

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
