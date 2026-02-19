# Gravity

Gravity is a framework for building agents that amplify expert operators.

Instead of shipping one-off bots, Gravity is designed to create compounding leverage:

- each new agent is faster to launch,
- and the marginal maintenance cost per deployed agent decreases as shared platform pieces improve.

The project is inspired by OpenClaw-style gateway patterns and pi-style runtime loops, adapted into a docs-first platform for long-term multi-agent operation.

## Why This Exists

Many organizations have expert operators whose judgment becomes a bottleneck. Gravity exists to encode that judgment into reusable agents so expertise is distributed, not trapped in a few individuals.

The objective is amplification, not replacement:

- preserve expert quality,
- increase expert reach,
- and improve decision speed.

## How To Think About An Agent

In Gravity, an agent is a composition, not a monolith:

`Agent = Capabilities + Surfaces + Triggers + Executor + Memory`

With one expansion:

`Capabilities = Skills + Tools + Resources`

- **Skills**: reusable operating playbooks and judgment patterns.
- **Tools**: actions the agent is allowed to execute.
- **Resources**: docs, data, and systems the agent can load into context.
- **Surfaces**: where the agent appears and communicates (for example, Slack listeners and delivery routes).
- **Triggers**: when the agent runs (for example, slash commands, mentions, thread replies, DMs, cron, heartbeat).
- **Executor**: how tool calls run at runtime (host now, sandbox seam later).
- **Memory**: what persists across runs so behavior compounds over time.

If you ask "where does this agent run?" map that to **surfaces**.
If you ask "when does this agent run?" map that to **triggers**.

This model keeps new agents compositional and predictable: you assemble known parts instead of introducing bespoke runtime behavior each time.

## Boundaries

The platform keeps boundaries explicit:

- runtime orchestration handles routing, scheduling, and agent execution flow,
- Postgres stores queryable, auditable operational state,
- `store/` keeps durable versioned knowledge (skills, resources, memory),
- `workspace/` holds ephemeral per-session runtime artifacts.

This split keeps the system observable and replaceable as the platform grows.

## Scope Today

Current scope is platform-first:

- shared foundations for multi-agent development,
- reusable primitives across domains,
- clear contracts for growth without agent-by-agent rewrites.

## Upcoming Features

### Evals and Observability

- Phoenix integrations for eval tracing, comparisons, and regression review
- central management views for cross-agent performance and operational health
- scheduled "sleep-window" compute to review per-agent session quality and surface follow-ups

### Security and Permission Rollout

- sandboxed tool execution as the primary security milestone (executor layer)
- deeper permissioning for agent actions, self-authoring controls, and team-scoped authority
- rollout strategies from limited cohorts to broad release, with explicit promotion gates

### Queueing and Concurrency

- Postgres-backed job queueing for durable execution, retries, and predictable throughput
- concurrency controls that keep multi-agent workloads stable as volume grows

## Quickstart

1. `npm install`
2. `npm run db:up`
3. `npm run db:apply`
4. `npm run dev`

## Verification

- `npm run check`

## Canonical Docs

- [Interface boundaries](docs/architecture/interfaces.md)
- [System map](docs/architecture/system-map.md)
- [Docs index](docs/README.md)
