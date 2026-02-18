# Interface Boundaries

Keep moving parts explicit and replaceable.

## Runtime Interfaces (current)
- `DbClient` (`src/runtime/db.ts`): owns typed Postgres connectivity via Kysely and provides the `gravity` schema handle.
- `SlackTransport` (`src/runtime/slack-transport.ts`): owns Slack Socket Mode connection, inbound event normalization, and channel-scoped message queueing.
- `defineConfig` / `defineAgent` contracts (`agents/contracts.ts`): canonical code-defined configuration and agent declaration authoring model.
- `AgentRegistry` (`agents/index.ts`): typed registry assembly with duplicate `agentId` and slash-command collision guards.
- `CompiledAgentDeclarations` (`agents/index.ts`): code-defined ingress/proactive/session declarations compiled from `defineConfig` + `defineAgent` contracts for runtime cutover.
- `SurfaceAdapter`: surface-specific ingress/egress adapters (Slack now; additional surfaces later).
- `AgentSpecRepository`: transitional repository seam while behavior source moves off `gravity.agents.config`.
- `EventIdempotencyGuard` (`src/runtime/event-idempotency.ts`): blocks duplicate source events across slash and non-slash ingress paths.
- `SessionKeyBuilder` (`src/runtime/session-key.ts`): canonical builders for mode-dependent session key patterns across slash, message, and proactive entrypoints.
- `SessionResolver`: resolves `sessionKey` and session mode (`thread`, `main`, `isolated`) per trigger.
- `SessionCatalog`: stores and resolves session metadata in `gravity.sessions` (ownership, mode, status) while keeping full transcript/context in `workspace/` files.
- `ResourcePlugin` (`src/resources/types.ts`): typed resource interface (`load(...)`) with discriminated resource specs and compile-time contribution contracts.
- `ResourceRegistry` (`src/resources/registry.ts`): statically maps all resource kinds to plugins with exhaustive compile-time coverage checks and resolves per-turn resource contributions.
- `CapabilityCatalog` (`agents/capability-catalog.ts`): canonical catalog of capability definitions (`resourceSlots`, `skills`, and tool grants).
- `CapabilityBindingContract` (`agents/contracts.ts`): typed `useCapabilities[]` + `bindResources` agent contract with compile-time slot/resource-kind checks.
- `CapabilityCompiler` (`agents/capability-compiler.ts`): compiles capability bindings into per-agent runtime capability profile (required skills/resources + tool grants).
- `SkillResolver` (`src/runtime/context-assembler.ts`): resolves capability-derived shared skill IDs to shared skill markdown each turn (no caching).
- `MemoryStore`: loads/writes `MEMORY.md` per agent.
- `ContextAssembler` (`src/runtime/context-assembler.ts`): builds per-turn system context from compiled capability profile + memory + resource contributions.
- `TurnRunner` (`PiAgentRunner` for CP4): executes one model turn via `pi-coding-agent` and tool surface.
- `DeliveryAdapter`: posts acknowledgements/final responses using surface-specific delivery defaults.
- `SessionStore`: manages per-session `log.jsonl` and `context.jsonl` files.
- `RunLifecycleLogger` (`src/runtime/run-lifecycle.ts`): emits typed run lifecycle events with stable IDs (`runId`, `agentId`, `sessionKey`) and lifecycle stages (`started`, `completed`, `failed`).
- `RunLogStore` (`src/runtime/run-log-store.ts`): maps lifecycle stages into durable `gravity.runs` inserts/updates.
- `ExecutorManager` (`src/runtime/executor-manager.ts`): single executor dispatch seam for all tool execution with per-agent runtime selection (`host` default, sandbox scaffold disabled).
- `ToolDispatcher`: single dispatch seam for all tool execution (implemented through `ExecutorManager` in current runtime).
- `ProactiveTriggerScheduler` (`src/runtime/proactive-trigger-scheduler.ts`): runs cron/heartbeat triggers, replays missed proactive runs from persisted history, enforces quiet-hours suppression, and exposes manual wake control for heartbeat demo triggers.

## Removed Legacy Seams (CP5.1 Step 6)
- `src/runtime/agent-config.ts`
- `src/runtime/ingress-binding-resolver.ts`
- `src/runtime/proactive-trigger-resolver.ts`
- `src/runtime/slash-command-router.ts`
- `src/runtime/trigger-normalizer.ts`

## Non-Goals for Current Bootstrap
- No full multi-surface adapter set beyond Slack yet.
- No full multi-surface ingress matrix beyond Slack entrypoints yet.
- No full CP6 session manager parity yet (dual-history compaction + session-end memory hook).
- No sandbox enforcement yet.

## Ownership and Rollback Notes
- Legacy seam rollback: removed CP5.1 seams are restored only via revision revert.
- `DbClient` owner: platform runtime layer.
- `DbClient` rollback path: swap `src/runtime/db.ts` back to direct `pg` access while preserving SQL contracts and migration files.
- `SlackTransport` owner: platform runtime layer.
- `SlackTransport` rollback path: disable live Slack connection in `src/index.ts` and fall back to no-op inbound logging while preserving normalized inbound event contracts.
- `defineConfig` / `defineAgent` contracts owner: platform runtime layer.
- `defineConfig` / `defineAgent` rollback path: revert `agents/contracts.ts` to previous declaration shape while preserving required IDs (`agentId`, `sessionKey`, `runId`) in downstream runtime contracts.
- `AgentRegistry` owner: platform runtime layer.
- `AgentRegistry` rollback path: pin `agents/index.ts` to previous known-good declarations and keep DB projection unchanged.
- `EventIdempotencyGuard` owner: platform runtime layer.
- `EventIdempotencyGuard` rollback path: disable runtime pre-run duplicate checks and rely on `gravity.runs.source_event_id` uniqueness only.
- `SessionKeyBuilder` owner: platform runtime layer.
- `SessionKeyBuilder` rollback path: revert session-key builders to previous deterministic patterns while preserving DB session metadata and stable IDs.
- `AgentSpecRepository` owner: platform runtime layer.
- `AgentSpecRepository` rollback path: read minimal agent fields directly from `gravity.agents` and ignore advanced config blocks.
- `SessionResolver` owner: platform runtime layer.
- `SessionResolver` rollback path: revert to deterministic `sessionKey = {agentId}:{sourceEventId}` behavior.
- `SessionCatalog` owner: platform runtime layer.
- `SessionCatalog` rollback path: resolve sessions from `workspace/` path conventions only while preserving `gravity.sessions` schema for forward compatibility.
- `ResourceRegistry` owner: platform runtime layer.
- `ResourceRegistry` rollback path: hardcode a single resource path per agent in runtime code while preserving agent config columns.
- `CapabilityCompiler` owner: platform runtime layer.
- `CapabilityCompiler` rollback path: inline capability expansion in runner/context code while preserving capability declarations in `agents/contracts.ts`.
- `SkillResolver` owner: platform runtime layer.
- `SkillResolver` rollback path: revert context assembly to direct shared skill loading while preserving capability-derived skill IDs.
- `ContextAssembler` owner: platform runtime layer.
- `ContextAssembler` rollback path: inline context assembly in runner code while preserving per-turn reload semantics.
- `RunLifecycleLogger` owner: platform runtime layer.
- `RunLifecycleLogger` rollback path: revert runtime entrypoints to direct `console.log` messages while preserving stable ID fields in log lines.
- `RunLogStore` owner: platform runtime layer.
- `RunLogStore` rollback path: keep lifecycle log lines but disable `gravity.runs` writes from `src/index.ts` while retaining the DB schema contract.
- `ExecutorManager` owner: platform runtime layer.
- `ExecutorManager` rollback path: revert `pi-agent-runner` tool wiring to direct host tool construction while keeping runtime policy fields backward-compatible.
- `ProactiveTriggerScheduler` owner: platform runtime layer.
- `ProactiveTriggerScheduler` rollback path: disable scheduler startup and replay/wake control surfaces while preserving `proactiveTriggers` config contracts.
- `PiAgentRunner` owner: platform runtime layer.
- `PiAgentRunner` rollback path: revert inbound execution paths to deterministic echo-only behavior while preserving `RunLifecycleLogger` + `RunLogStore` contracts.

## Stability Requirement
Do not change interface boundaries without updating this file and `docs/checkpoints/mvp-status.md` in the same change.
