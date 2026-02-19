# Gravity Canonical Architecture Decision

Status: accepted
Date: 2026-02-18
Owners: kevin + codex
Scope: current migration baseline through CP11 demo readiness

## Purpose
This document is the source of truth for Gravity's architecture direction during the current rearchitecture.

It defines:
1. what we are building now,
2. canonical contracts and ownership boundaries,
3. explicit legacy removals,
4. pre-mortem risks and controls for downstream engineers.

## Architecture Direction (Now)
Gravity is a **code-defined, control-plane-first multi-agent runtime**.

Core commitments:
1. Agent definitions are TypeScript code, not Postgres JSONB.
2. Gravity owns routing, sessioning, scheduling, context assembly, and durable logging.
3. `pi-coding-agent` is used as a runtime library for turn execution/session primitives.
4. Tool execution goes through a single executor seam selected per-agent runtime policy.
5. The pre-MVP bias is simplicity: remove legacy paths after parity, do not keep parallel architectures.

## Why This Direction
1. It removes accidental complexity from schema/normalization/resolver layers.
2. It keeps agent configuration legible to humans and coding agents.
3. It matches proven headless Slack patterns from `pi-mom` while preserving Gravity control-plane ownership.
4. It keeps security evolution seams explicit without building production-grade isolation too early.

## Canonical Runtime Contracts

### 1) Authoring Model + Source of Truth
- Agent definitions: `agents/<agent-slug>/agent.ts`
- Agent registry: `agents/index.ts`
- Shared resources: `store/shared/`
- Workspace runtime state: `workspace/`

One-writer contract:
- Canonical behavior source: code-defined agent declarations.
- Queryable projection: Postgres runtime metadata for audit/search/reporting.
- Runtime execution must not depend on `gravity.agents.config` JSONB after migration completion.

Compatibility window for skills/memory paths:
- Existing `store/` paths remain valid during this migration.
- Skill composition contract (2026-02-18 decision): canonical skill definitions live in `store/shared/skills`, and agents apply them via capability definitions referenced from `defineAgent(...).useCapabilities`.
- CP6 outcome (2026-02-18): runtime no longer loads `store/agents/{agentId}/skills`, and agent-local skills directories are not part of the supported topology.
- Memory remains agent-scoped at `store/agents/{agentId}/memory/MEMORY.md`.
- Final path consolidation for memory/resources (`store/` only vs full co-location) remains deferred.

### 2) `defineConfig(...)` Minimum Contract
`defineConfig` must support:
1. Infra: DB, Slack, model provider credentials/config.
2. Defaults: model, runtime, session defaults, quiet-hours default.
3. Paths: shared resource root and workspace root.

Resolution order for overridable fields:
1. Agent-level explicit value
2. Framework default
3. Hardcoded fallback

Security guardrail:
- Credentials are loaded from environment/runtime secret providers; never hardcoded in agent declaration code.

### 3) `defineAgent(...)` Minimum Contract
Required fields:
- `id`
- `name`
- `listen`
- `useCapabilities`

Expected optional fields:
- `description`
- `model`
- `proactive`
- `resources`
- `runtime`
- `quietHours`
- `session`

Resource config contract:
- Resource-specific settings must be nested inside the resource declaration (`resources` array).
- Example: DuckDB path is declared as `resources: [{ id: "warehouse", kind: "duckdb", path: "<path>" }]`.
- Capabilities are declared through `useCapabilities: [{ capability: "<capability-id>", bindResources?: { "<slot>": "<resource-id>" } }]`.
- Capability definitions (catalog) own the skill set, required resource slots, and tool grants.
- No top-level resource-specific fields are allowed in `defineAgent(...)`.

Policy boundary:
- Self-authoring may modify skills and memory files.
- Agent definition code changes are human-initiated in this phase.

### 4) Runtime Ownership
Gravity runtime owns:
- Slack ingress/egress
- Listener routing and agent resolution
- Session key resolution and lifecycle
- Capability compilation + context assembly (capabilities, skills, memory, history, resource guidance)
- Proactive scheduling (`cron`, `heartbeat`, manual wake)
- Durable run and skill logging

`pi-coding-agent` usage:
- `AgentSession` for turn execution loop
- `SessionManager` for session persistence/compaction primitives

### 5) Tool Execution Boundary
- All tool calls dispatch through a single `Executor` seam.
- Runtime selection is per-agent via runtime config.
- Tool implementations stay executor-agnostic.
- Tool binding to executors happens in framework wiring.

### 6) Durable State Contract
Canonical queryable state:
- `gravity.agents` (registry projection/metadata)
- `gravity.sessions` (session metadata and ownership)
- `gravity.runs`
- `gravity.skill_versions`

Canonical file state:
- skills/memory/shared resources on disk

Canonical ephemeral state:
- session and scratch state in `workspace/`

### 7) Session Contract
Session boundaries are mode-dependent (`thread`, `main`, `isolated`).

Canonical session key patterns:
- Main mode: `{agentId}:main`
- Thread mode (Slack thread): `{agentId}:{threadTs}`
- Thread mode DM fallback (no thread id): `{agentId}:{channelId}`
- Isolated mode (per inbound event): `{agentId}:{sourceEventId}`
- Proactive thread mode: `{agentId}:proactive:{triggerId}:thread`
- Proactive isolated mode: `{agentId}:proactive:{triggerId}:{sourceEventId}`

Dual history is canonical:
- permanent transcript (`log.jsonl`)
- compactable model context (`context.jsonl`)

### 8) Stable IDs
Mandatory IDs across runtime flows and docs:
- `agentId`
- `sessionKey`
- `runId`

## Scope Boundaries

### In Scope Now
- Code-defined agents as first-class runtime contracts
- Control-plane-owned runtime flow
- Executor seam as sandbox-ready boundary
- Capability-first composition with shared-skill catalog + resource bindings
- Removal of JSONB-driven legacy routing/resolver modules after parity

### Explicitly Deferred
- Full extensibility framework and plugin ecosystem
- Phoenix-style TurnContext pipeline/plugs as a formal public API
- Multi-surface abstraction beyond Slack for this phase
- Runtime hot-reload of full agent definitions
- Marketplace/distribution concerns

## Migration Sequence (Execution Order)
1. Add `defineConfig` and `defineAgent` contracts plus `agents/index.ts` registry.
2. Add a compile step that produces typed runtime declarations for ingress, proactive triggers, sessions, and trigger dimensions.
3. Rewire Slack slash/message/proactive paths to consume compiled declarations.
4. Rewire context assembly to code-defined agent sources (capabilities/skills/memory/resources).
5. Prove parity via verification + smoke matrix.
6. Delete legacy JSONB-driven modules (no long-lived dual path).

## Legacy Module Removal Decisions
The following modules are explicitly targeted for removal once compiled code-defined declarations are in use.

| Module | Decision | Replacement seam |
| --- | --- | --- |
| `src/runtime/agent-config.ts` | Remove | compiled `defineAgent` + `defineConfig` declarations |
| `src/runtime/ingress-binding-resolver.ts` | Remove | compiled listener routing map |
| `src/runtime/proactive-trigger-resolver.ts` | Remove | compiled proactive schedule declarations |
| `src/runtime/slash-command-router.ts` | Remove | compiled slash command listener declarations |
| `src/runtime/trigger-normalizer.ts` | Remove | typed trigger dimensions emitted directly at ingress/proactive boundaries |

Removal gate:
- No runtime imports of these modules remain.
- `npm run check`, `npm run verify:cp5`, and `npm run verify:cp10` all pass.
- Live smoke matrix passes.

## Done Criteria for CP5.1 Rearchitecture Parity
Required before declaring CP5.1 complete:
1. `npm run check` passes.
2. `npm run verify:cp5` passes.
3. `npm run verify:cp10` passes.
4. Legacy module removal gate is satisfied (all listed modules removed, no imports remain).
5. Live smoke matrix passes:
   - slash command
   - app mention
   - thread reply
   - DM path
   - DuckDB answer quality
   - run log persistence
   - proactive wake path
6. Stable IDs (`agentId`, `sessionKey`, `runId`) are preserved end-to-end.

CP6 note:
- Session/memory scaffolding resumed after CP5.1 parity and is verified via `docs/checkpoints/cp6-verification.md`.

## Resolved Questions (Answered Now)

1. **Should agent behavior configuration stay in Postgres JSONB?**
Answer: No. Agent behavior is code-defined. Postgres stores queryable runtime/audit state.

2. **Should pi extensions be the primary authoring model?**
Answer: No. Use `pi-coding-agent` as a library; keep Gravity as the control plane.

3. **Should we build the full Phoenix-style pipeline/plugs system now?**
Answer: No. Defer until a concrete cross-cutting threshold is met.

4. **Should self-authoring modify agent definition code in this phase?**
Answer: No. Self-authoring is limited to skills and memory.

5. **What is the DM fallback contract when thread mode has no thread id?**
Answer: Use `{agentId}:{channelId}`.

6. **How does rollback work after legacy-module deletion?**
Answer: Rollback is deployment-level: revert to the pre-removal tagged revision while keeping durable schema/contracts unchanged (`gravity.runs`, `gravity.sessions`, `gravity.skill_versions`).

7. **Should skills be split between shared files and agent-local folders as a long-term model?**
Answer: No. Long-term model is shared-skill catalog + capability catalog + explicit agent capability bindings, and CP6 removes agent-local skill loading as an immediate migration gate.

## Deferred Questions for Downstream Implementers
These are intentionally deferred. Each item includes trigger conditions and the default until decided.

1. **Memory/resource path end-state: keep `store/` as canonical vs full co-location under `agents/`?**
Context: skills are decided shared-first; memory/resources path end-state is still open.
Trigger: decide before deleting compatibility loaders.
Default until decided: support current `store/` + code-defined agents without forcing a path migration.

2. **When to introduce formal TurnContext pipeline + plugs?**
Context: Phoenix-inspired design is compelling but adds framework surface area.
Trigger: at least three cross-cutting concerns need lifecycle interception (for example tool policy + cost tracking + audit transforms).
Default until decided: keep explicit stage functions and direct composition.

3. **Pipeline insertion syntax (named insertion points vs category buckets)?**
Context: named points are precise; buckets are simpler.
Trigger: first implementation of pluggable turn middleware.
Default until decided: do not expose user plug insertion API.

4. **TurnContext mutability model (mutable object vs immutable returns)?**
Context: immutable is safer; mutable is simpler in TypeScript runtime code.
Trigger: first formal plug API design.
Default until decided: keep internal mutable context with strict stage ownership conventions.

5. **Framework-level vs agent-level plug ordering model?**
Context: ordering affects audit and policy correctness.
Trigger: first introduction of global + per-agent middleware at same insertion point.
Default until decided: framework-before-agent ordering.

6. **Extension escape hatch for advanced use cases?**
Context: may be useful for custom providers or advanced interception later.
Trigger: concrete requirement that cannot be met by current `defineAgent` + executor + control-plane seams.
Default until decided: no extension escape hatch in current runtime.

## Pre-Mortem (What Could Go Wrong)
1. **Split-brain between code declarations and DB registry projection**
Failure mode: routing or scheduling reads stale DB data and diverges from code.
Control: code declarations are the only runtime behavior source; DB is projection only; fail startup on projection mismatch.

2. **Session key drift across entrypoints**
Failure mode: duplicate or fragmented sessions; compaction and replay become inconsistent.
Control: central session key builder contract + matrix tests across slash/app mention/thread/DM/proactive.

3. **Replay storm or duplicate proactive deliveries after restart**
Failure mode: noisy channels, duplicate runs, loss of operator trust.
Control: bounded replay caps, idempotency checks, quiet-hours suppression, manual wake audit trail.

4. **Dual-history corruption (`log.jsonl` vs `context.jsonl`) during compaction**
Failure mode: lost chronology or invalid model context.
Control: strict ownership rules (`log.jsonl` append-only, `context.jsonl` compactable) + recovery retry path.

5. **Legacy removal regresses ingress coverage**
Failure mode: one or more paths (slash/thread/DM/proactive) silently stop routing.
Control: required smoke matrix + CP5/CP10 verification before declaring migration done.

6. **Credential leakage into code-defined configs**
Failure mode: secrets committed to repo and leaked in logs.
Control: secrets only from environment/runtime providers; no raw credential literals in agent declaration files.

7. **New engineers cannot reconstruct intent and rollback steps quickly**
Failure mode: slow incident response, ad hoc architectural forks.
Control: this doc stays authoritative, `docs/README.md` links to it, and rollback is defined as a deployment-level revision revert.

## Engineer Takeover Checklist
1. Read this document first.
2. Read `docs/architecture/system-map.md` and `docs/architecture/interfaces.md` for current runtime topology.
3. Read `docs/plans/active/2026-02-19-cp11-demo-polish-rehearsal.md` for active execution details.
4. Run `npm run check` and both verification harnesses (`npm run verify:cp5`, `npm run verify:cp10`).
5. Confirm removed legacy modules do not exist/import anywhere in runtime paths.

## Operational Rule
When older docs conflict with this decision, this file is authoritative for current architecture direction until alignment updates land.

## Follow-Up (Separate Changes)
1. Align `mvp_requirements.md` with this architecture decision.
2. Align checkpoint/docs contracts to this source of truth.
3. Keep verification gates stable (`npm run check`) throughout migration.
