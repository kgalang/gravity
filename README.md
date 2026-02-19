# Gravity

As engineering velocity multiplies with AI, the bottleneck shifts to every team that can't write code — compliance, marketing, operations, support. The expertise to unblock them already exists inside the organization. It's just locked in a few people's heads. Off-the-shelf tools can't help because the value isn't generic automation — it's company-specific judgment.

Gravity is a platform for encoding that expertise into agents and distributing it to everyone who needs it. Inspired by teams like OpenAI's Leverage Engineering, the approach is amplification, not automation: sit with the best operator in a function, learn how they think, and build an agent that makes their judgment available to the whole org.

The platform is designed so a small central team can service an entire organization. Every agent shares the same primitives, so each one ships faster than the last and the marginal cost of maintaining one more agent goes down, not up. Experts author and refine skills directly — no eng cycle required — and agents improve over time through usage and feedback.

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
