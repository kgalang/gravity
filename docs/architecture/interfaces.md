# Interface Boundaries

Keep moving parts explicit and replaceable.

## Runtime Interfaces (current)
- `DbClient` (`src/runtime/db.ts`): owns typed Postgres connectivity via Kysely and provides the `gravity` schema handle.
- `SlackTransport` (`src/runtime/slack-transport.ts`): owns Slack Socket Mode connection, inbound event normalization, and channel-scoped message queueing.
- `SlashCommandRouter` (`src/runtime/slash-command-router.ts`): current Slack slash-command resolver seam; expected to converge into `IngressBindingResolver` as config-driven ingress matures.
- `SurfaceAdapter`: surface-specific ingress/egress adapters (Slack now; additional surfaces later).
- `TriggerNormalizer` (`src/runtime/trigger-normalizer.ts`): normalizes source events into trigger dimensions (`triggerKind`, `surface`, `entrypoint`).
- `AgentConfig` (`src/runtime/agent-config.ts`): validates and normalizes agent `config` payloads (`ingressBindings`, `deliveryDefaults`, `proactiveTriggers`) into typed runtime contracts with strict fail-closed behavior on invalid config.
- `AgentSpecRepository`: loads `gravity.agents` + MVP `config` into a typed `AgentSpec`.
- `IngressBindingResolver`: enforces `ingressBindings` for Slack entrypoints (slash command, app mention, thread reply, direct message).
- `EventIdempotencyGuard` (`src/runtime/event-idempotency.ts`): blocks duplicate source events across slash and non-slash ingress paths.
- `SessionResolver`: resolves `sessionKey` and session mode (`thread`, `main`, `isolated`) per trigger.
- `SessionCatalog`: stores and resolves session metadata in `gravity.sessions` (ownership, mode, status) while keeping full transcript/context in `workspace/` files.
- `ConnectorRegistry`: resolves connector plugins (for example `duckdb`) and connector-specific context loading.
- `SkillLoader`: loads shared + agent-specific skills from `store/` each turn (no caching).
- `MemoryStore`: loads/writes `MEMORY.md` per agent.
- `ContextAssembler`: builds per-turn system context from agent spec + skills + memory + connector context.
- `TurnRunner` (`PiAgentRunner` for CP4): executes one model turn via `pi-coding-agent` and tool surface.
- `DeliveryAdapter`: posts acknowledgements/final responses using surface-specific delivery defaults.
- `SessionStore`: manages per-session `log.jsonl` and `context.jsonl` files.
- `RunLifecycleLogger` (`src/runtime/run-lifecycle.ts`): emits typed run lifecycle events with stable IDs (`runId`, `agentId`, `sessionKey`) and lifecycle stages (`started`, `completed`, `failed`).
- `RunLogStore` (`src/runtime/run-log-store.ts`): maps lifecycle stages into durable `gravity.runs` inserts/updates.
- `ToolDispatcher`: single dispatch seam for all tool execution (host now, sandbox later).
- `ProactiveTriggerResolver` (`src/runtime/proactive-trigger-resolver.ts`): resolves `proactiveTriggers` + `deliveryDefaults` into validated cron/heartbeat trigger specs.
- `ProactiveTriggerScheduler` (`src/runtime/proactive-trigger-scheduler.ts`): runs cron/heartbeat triggers and dispatches proactive runs.

## Non-Goals for Current Bootstrap
- No full multi-surface adapter set beyond Slack yet.
- No full multi-surface ingress matrix beyond Slack entrypoints yet.
- No full CP6 session manager parity yet (dual-history compaction + session-end memory hook).
- No sandbox enforcement yet.

## Ownership and Rollback Notes
- `DbClient` owner: platform runtime layer.
- `DbClient` rollback path: swap `src/runtime/db.ts` back to direct `pg` access while preserving SQL contracts and migration files.
- `SlackTransport` owner: platform runtime layer.
- `SlackTransport` rollback path: disable live Slack connection in `src/index.ts` and fall back to no-op inbound logging while preserving normalized inbound event contracts.
- `TriggerNormalizer` owner: platform runtime layer.
- `TriggerNormalizer` rollback path: temporarily route Slack ingress directly to runtime handlers while preserving run lifecycle and stable IDs.
- `EventIdempotencyGuard` owner: platform runtime layer.
- `EventIdempotencyGuard` rollback path: disable runtime pre-run duplicate checks and rely on `gravity.runs.source_event_id` uniqueness only.
- `AgentConfig` owner: platform runtime layer.
- `AgentConfig` rollback path: parse minimally typed config directly in repository/runtime call sites while preserving `gravity.agents.config` JSON shape.
- `AgentSpecRepository` owner: platform runtime layer.
- `AgentSpecRepository` rollback path: read minimal agent fields directly from `gravity.agents` and ignore advanced config blocks.
- `SessionResolver` owner: platform runtime layer.
- `SessionResolver` rollback path: revert to deterministic `sessionKey = {agentId}:{sourceEventId}` behavior.
- `SessionCatalog` owner: platform runtime layer.
- `SessionCatalog` rollback path: resolve sessions from `workspace/` path conventions only while preserving `gravity.sessions` schema for forward compatibility.
- `ConnectorRegistry` owner: platform runtime layer.
- `ConnectorRegistry` rollback path: hardcode a single connector path per agent in runtime code while preserving agent config columns.
- `ContextAssembler` owner: platform runtime layer.
- `ContextAssembler` rollback path: inline context assembly in runner code while preserving per-turn reload semantics.
- `RunLifecycleLogger` owner: platform runtime layer.
- `RunLifecycleLogger` rollback path: revert runtime entrypoints to direct `console.log` messages while preserving stable ID fields in log lines.
- `RunLogStore` owner: platform runtime layer.
- `RunLogStore` rollback path: keep lifecycle log lines but disable `gravity.runs` writes from `src/index.ts` while retaining the DB schema contract.
- `ProactiveTriggerScheduler` owner: platform runtime layer.
- `ProactiveTriggerScheduler` rollback path: disable scheduler startup while preserving `proactiveTriggers` config contracts and manual trigger paths.
- `PiAgentRunner` owner: platform runtime layer.
- `PiAgentRunner` rollback path: revert inbound execution paths to deterministic echo-only behavior while preserving `RunLifecycleLogger` + `RunLogStore` contracts.

## Stability Requirement
Do not change interface boundaries without updating this file and `docs/checkpoints/mvp-status.md` in the same change.
