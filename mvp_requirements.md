# Gravity — MVP Requirements

_Last updated: 2026-02-17 (v2)_
_Target: Working demo for Immad call, Thursday 2026-02-20_
_Build time budget: ~24 hours_

---

> **"Find your stars, give them gravity."**
>
> Find the best operator in any function, encode their expertise, and use Gravity to distribute it across the org. Not automation — amplification. Not push — pull.

---

## Situational Context

### What is this

Kevin is pitching Immad (CEO, Mercury) on creating an Applied AI team at Mercury. The pitch is a working demo, not a deck. Kevin builds a functioning prototype in ~24 hours that demonstrates the Gravity platform thesis end-to-end.

### Who is Immad

Immad Akhund is CEO of Mercury and a coder himself. He'll evaluate this both as a product leader ("does this solve a real problem?") and as an engineer ("is this real architecture or a hack?"). The demo needs to satisfy both lenses.

### The problem being solved

Engineering velocity is about to outrun every non-eng team at Mercury. The expertise to solve that already exists — it's locked in a few people's heads. Data analysts, compliance reviewers, ops specialists — these people are bottlenecks not because they're slow, but because there's one of them and a hundred people who need their judgment.

Gravity amplifies that expertise. Find the best operator in any function (the "star"), encode their expertise into an AI agent, and distribute it to everyone who needs it. The star still exists — the agent is their reach.

### Why now

- OpenAI has a "Leverage Engineering" team doing exactly this internally
- Shopify, Stripe, Quora are all building internal AI agent platforms
- The tooling (Claude API, pi-mom, dbt, DuckDB) is mature enough to ship a working prototype in 24 hours
- Mercury's competitive advantage compounds if non-eng teams get amplified before competitors' do

### What the demo should prove

The demo should answer two questions for Immad: **"Does this have gravity?"** — is it pulling people in, and is Kevin the person to build it?

| Demo section             | Proves                                                        |
| ------------------------ | ------------------------------------------------------------- |
| Problem framing          | Product thinker who understands Mercury's scaling problem     |
| Platform + live agent    | Builder who ships working software fast                       |
| Self-authoring           | Understands the deeper thesis — amplification, not automation |
| Second agent compounding | Architect who builds platforms, not one-offs                  |
| Central core             | Systems thinker Immad can respect as a coder                  |
| Proactive behavior       | Thinking about environmental design, not just chatbots        |
| Forward roadmap          | Already 3 moves ahead on security, rollout, and org design    |

---

## What We Show (MVP Scope)

> **We are building a platform, not an agent.** The data analyst is the first proof of concept on the platform — the first agent that demonstrates the primitives work end-to-end. The platform is what matters: the skill system, the self-authoring loop, the central state, the shared primitives that make each subsequent agent cheaper to build. The data analyst just happens to be the most compelling first demo.

1. **The platform primitives**: shared skills, self-authoring, central Postgres state, connectors, proactive scheduling — the building blocks every agent uses
2. **A working data analyst agent** (Wiggs) as proof-of-concept: the first agent built on the platform, answering business questions from Slack against a test data source
3. **Self-authoring**: experts teach agents directly, no eng cycle required — the key differentiator
4. **A second agent on the same platform**: different domain, same primitives, proving the platform compounds
5. **A central core** (Postgres) that tracks all agents, runs, and skill evolution across the system
6. **Proactive behavior** — agents that change the environment, not just answer questions
7. Architecture that a coder respects as a real system

---

## What's Out of Scope (Not in MVP)

These are explicitly deferred — not forgotten, just not in the 24-hour build:

- **Production security enforcement.** The Lethal Trifecta is defined per-agent conceptually but not enforced in code. No tool policy checks, no sandbox isolation. See [Security roadmap](#security-roadmap-post-demo).
- **Sandbox isolation.** All tool execution runs in-process. Docker/Modal/Fly isolation is Phase 2 post-demo.
- **Control plane UI.** No management dashboard. Agents are managed via config files and psql. The contracts for a future UI are in place (stable IDs, typed events, versioned config).
- **Multi-user access control.** No channel allowlists or approval flows. Anyone in the Slack channel can talk to the agent.
- **Production data.** Demo uses dbt's jaffle-shop test data (100 customers, 99 orders). At Mercury, swap the dbt project and everything else stays identical.
- **Reliability hardening.** No idempotency keys, no restart reconciliation, no exponential backoff. Single process, single machine.
- **Personal agents.** MVP has shared team agents only. Per-employee agents are a future milestone.
- **Rich control plane UI and workflow builder.**
- **Complex policy DSL or policy compiler.**
- **Per-team custom runtime orchestration.**

---

## Naming

- **Applied AI** — the team. The internal team that builds and ships these tools.
- **Gravity** — the platform. The system that amplifies expertise and distributes it across Mercury. Used in external/pitch contexts, not necessarily in technical internals.
- **Agents are named after their stars.** The first data analyst agent is modeled on Ryan Wiggins's expertise, so it's called **Wiggs**. Future agents follow the same pattern — named after (or inspired by) the person whose craft they encode. This makes the "amplification not automation" thesis tangible: Wiggs isn't a generic bot, it's Ryan's way of thinking about data, made available to everyone.

Gravity vocabulary (for pitch/demo framing, not internal code):

| Term                          | Meaning                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| **"Does this have gravity?"** | The PMF question. Is it pulling people in without being pushed?                         |
| **"Add gravity"**             | Make a team's environment better with an agent                                          |
| **"Zero gravity"**            | Before the tool exists — floating, unmoored, no structure pulling toward good decisions |
| **Stars**                     | The best operators in each function. The people whose expertise we encode               |

Keep branding in the pitch layer. Technical internals (schema names, directory paths, config keys) stay descriptive and functional — `gravity.agents`, `store/agents/data-analyst/`, etc. Don't let naming create confusion in the codebase.

---

## Reference Codebases

These are local reference implementations to pull patterns and code from during the build:

- **OpenClaw** — `/Users/kevingalang/code/openclaw` — The Gateway pattern, heartbeat system, cron job scheduling, event architecture. Gravity's proactive behavior and scheduling are modeled on OpenClaw's patterns.
- **pi-mom** — `/Users/kevingalang/code/pi-mono/packages/mom` — Slack Socket Mode, agent loop, message routing, tool execution, session management. We copy the relevant source files from pi-mom into Gravity (not a fork — a selective copy-paste of the pieces we need, then modify in place).

---

## Architecture

### Overview

Single process, inspired by OpenClaw's Gateway pattern. Built by copying relevant files from pi-mom and modifying them.

```
┌─────────────────────────────────────────────────────────┐
│  Gravity (from pi-mom) — single process                 │
│                                                         │
│  Surface bindings (Slack Socket Mode, future: portal)   │
│  Agent loop (Claude API calls, session context)         │
│  Routing, scheduling                                    │
│  All durable state                                      │
│  All tool execution (single process for MVP)            │
│                                                         │
│  Postgres (gravity schema)   store/ (central files)     │
│  ┌─────────────────────┐     ┌───────────────────────┐  │
│  │ agents              │     │ agents/{id}/skills/    │  │
│  │ runs                │     │ agents/{id}/memory/    │  │
│  │ skill_versions      │     │ shared/skills/         │  │
│  │                     │     │ shared/knowledge/      │  │
│  └─────────────────────┘     │ connectors/            │  │
│                              └───────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

Design principle: **"Centralize all durable state and policy decisions; isolate only runtime execution and side effects."**

For the MVP, everything runs in one process — the agent loop, tool execution, state management, surface bindings. We copy the relevant pieces from pi-mom (`src/agent.ts`, `src/slack.ts`, `src/tools/`, `src/context.ts`, `src/events.ts`, etc.) and modify them in place. Not a git fork — a selective extraction of the code we need.

The architecture is designed so that tool execution can be isolated later (Docker, Modal, Fly) without restructuring. The seam is already there: all tool calls go through a single code path that currently executes locally. When sandboxing is added post-demo, that code path dispatches untrusted tools to containers instead. See [Security roadmap](#security-roadmap-post-demo) for the phased plan.

### Why this architecture

**Why a single process (not core + sandbox split):**
The LLM loop (calling Claude, managing conversation context) is not a security risk — it's a deterministic API call. The security risk is tool execution: when Claude says "run this bash command," that's where untrusted code runs. For the MVP, there's no untrusted code — we wrote the agents, the data is test data. A single process avoids sync complexity. The seam for sandboxing tool execution exists in code and can be activated in Phase 2 post-demo.

**Why copy from pi-mom (not built from scratch):**
Pi-mom already provides Slack Socket Mode, message routing, per-channel agent isolation, tool execution, session management, and event scheduling. We copy the relevant source files and modify them in place — not a git fork, just selective extraction of proven code. This gives us a working agent runtime in hours, not weeks. We modify it to add: Postgres integration (run logging, skill versioning), `store/` directory conventions, and gravity-specific skill loading.

**Why Postgres + flat files (not just one or the other):**
Postgres for queryable, structured state: agent registry, run history, skill versions. Flat files (git-tracked) for skill content, memory, and knowledge: diffable, rollback-ready, human-readable. This dual model means the agent can `SELECT` its recent runs from Postgres and `cat` its current skills and memory from `store/`. Both are needed.

**Why dbt + DuckDB (not hand-written test data):**
This is just a demo data source — a convenient test dataset that lets us show the platform working end-to-end. dbt's `schema.yml` has column descriptions and `docs.md` has business context, so the agent can understand the data without hand-written guides. At Mercury, the data analyst would connect to Mercury's real data warehouse, other agents would have different connectors entirely (APIs, knowledge bases, internal tools). The data source is a pluggable skill/connector — separate from the platform.

### State ownership

| What                                                 | Where                                        | Why there                                               |
| ---------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| Agent definitions (id, name, model, channel, config) | Postgres `gravity.agents`                    | Queryable, central registry                             |
| Run history (who asked what, status, outcome)        | Postgres `gravity.runs`                      | Auditable, searchable                                   |
| Skill version log (who taught what, when)            | Postgres `gravity.skill_versions`            | Tracks expertise evolution over time                    |
| Agent memory                                         | `store/agents/{id}/memory/MEMORY.md`         | File-based, git-tracked, grep-searchable                |
| Skill content (markdown files)                       | `store/` directory, git-tracked              | Git = versioning, rollback, diffs                       |
| Memory documents (MEMORY.md)                         | `store/` directory, git-tracked              | Durable, diffable                                       |
| Shared knowledge (glossary, context)                 | `store/` directory, git-tracked              | Company-wide, inherited by all agents                   |
| Connector configs                                    | `store/` directory                           | Reusable across agents                                  |
| Test data (jaffle-shop)                              | DuckDB file via dbt                          | Agent queries locally, same pattern as a real warehouse |
| Session conversation log                             | `workspace/{id}/sessions/{ts}/log.jsonl`     | Append-only per-thread, never trimmed                   |
| Session LLM context                                  | `workspace/{id}/sessions/{ts}/context.jsonl` | Compactable, what Claude sees for this thread           |
| Cross-session agent log                              | `workspace/{id}/agent-log.jsonl`             | All threads, for cross-session search                   |
| Temp files, query results, scratch                   | `workspace/{id}/sessions/{ts}/scratch/`      | Ephemeral — disposable on restart                       |

### Directory structure

```
gravity/                              # The project (built from pi-mom source files)
├── src/                              # Agent loop, Slack connection, routing, tools
├── package.json
├── docker-compose.yml                # Postgres
├── schema.sql                        # Gravity schema
├── seed.sql                          # Register initial agents
│
├── store/                            # Durable state (git-tracked, simulates S3)
│   ├── agents/
│   │   ├── data-analyst/
│   │   │   ├── skills/
│   │   │   │   ├── query-patterns.md       # DuckDB SQL idioms and common patterns
│   │   │   │   └── response-formatting.md  # How to format results for humans
│   │   │   └── memory/
│   │   │       └── MEMORY.md               # Persistent agent context
│   │   └── compliance-helper/
│   │       ├── skills/
│   │       │   ├── review-rules.md         # Compliance review framework
│   │       │   └── flag-patterns.md        # What to flag and why
│   │       └── memory/
│   │           └── MEMORY.md
│   └── shared/
│       ├── skills/
│       │   ├── self-author.md              # How to update your own skills
│       │   ├── log-run.md                  # How to log runs to Postgres
│       │   ├── query-gravity.md            # How to read your config from Postgres
│       │   └── rollback.md                 # How to revert a skill change
│       ├── knowledge/
│       │   └── mercury-glossary.md         # Company-wide business terms and definitions
│       └── connectors/
│           └── duckdb.md                   # How to query the DuckDB database file
│
└── workspace/                        # Per-agent runtime state (gitignored)
    ├── data-analyst/
    │   ├── agent-log.jsonl           # Cross-session log (all threads)
    │   └── sessions/
    │       ├── {thread-ts}/          # One session per thread
    │       │   ├── log.jsonl         # Permanent conversation log for this thread
    │       │   ├── context.jsonl     # Live LLM context (compactable)
    │       │   ├── last_prompt.jsonl # Debug snapshot
    │       │   └── scratch/          # Ephemeral working files
    │       └── .../
    └── compliance-helper/
        ├── agent-log.jsonl
        └── sessions/
            └── .../

# jaffle_shop_duckdb lives separately at /Users/kevingalang/code/jaffle_shop_duckdb
# Agent queries it on the same machine via absolute path.
```

---

## Memory, Sessions & Context

How agents remember, how conversations persist, and how the context window is managed. This is modeled on pi-mom's dual-history system with elements from OpenClaw's memory architecture.

### The Three Layers

Gravity agents have three distinct layers of "remembering," each with different lifetimes and purposes:

| Layer               | What                                       | Lifetime                      | Cost               | Example                                       |
| ------------------- | ------------------------------------------ | ----------------------------- | ------------------ | --------------------------------------------- |
| **Context**         | What the model sees for this API call      | One request                   | Expensive (tokens) | Current conversation + system prompt + skills |
| **Session history** | The conversation transcript                | One session (thread lifetime) | Medium (disk)      | `context.jsonl` — compactable, sent to Claude |
| **Memory**          | Durable knowledge that survives compaction | Permanent                     | Cheap (disk)       | `MEMORY.md` files, grep-searchable            |

### Context Assembly (per API call)

Every time an agent responds, it assembles context from agent-scoped paths:

```
[0] System Prompt
    ├── Agent identity and role (from gravity.agents registry)
    ├── Shared skills (store/shared/skills/*.md)
    ├── Agent-specific skills (store/agents/{agent-id}/skills/*.md)
    ├── Memory (store/agents/{agent-id}/memory/MEMORY.md)
    └── Connector configs (store/shared/connectors/ + agent config)
[1] Conversation History (from workspace/{agent-id}/sessions/{session-key}/context.jsonl — may include compaction summaries)
[2] Current Message (with timestamp, username, attachments)
```

Everything is scoped by agent-id. Skills and memory are re-read from disk every turn — never cached. This means self-authored skill changes take effect immediately on the next message.

### Dual-History System (from pi-mom, per-session)

Each session (thread) maintains two parallel history files:

```
workspace/{agent-id}/sessions/{session-key}/
├── log.jsonl           # Permanent log — append-only, never trimmed
└── context.jsonl       # LLM context — compactable, sent to Claude
```

**`log.jsonl`** — the permanent record:

- Every message (user and bot) in this thread, appended as one JSON line
- Never trimmed, never compacted — grows forever
- Format: `{ date, ts, user, userName, text, isBot, attachments }`
- Used for: audit trail, searching older history, backfill on restart

**`context.jsonl`** — the live LLM context:

- Structured session file (SessionManager format from `pi-coding-agent`)
- Tree structure with `id`/`parentId` links — supports branching and compaction
- Entry types: `session`, `message`, `compaction`, `branch_summary`
- This is what actually gets assembled and sent to Claude
- Compactable — old messages get summarized when approaching context limits

**`agent-log.jsonl`** (at `workspace/{agent-id}/agent-log.jsonl`) — cross-session log:

- Append-only log of all messages across all sessions for this agent
- Agent can search this for context from other threads ("what did someone ask me about customers earlier today?")
- Also feeds into `gravity.runs` for the Postgres audit trail

**Why two files per session:** The permanent log preserves everything for audit and search. The context file is what the model actually sees — it can be compacted without losing history. The log is the source of truth; the context is the working set.

### Compaction (context window management)

When conversation history approaches the context window limit, older messages are summarized to free space:

```
Trigger: contextTokens > (contextWindow - reserveTokens)
Default: > 183,616 tokens (200K window - 16K reserve)

Before compaction:
  [Turn 1] ... [Turn 2] ... [Turn 3] ... ... [Turn 150]
  ████████████████████████████████░░░░  ~180K tokens

After compaction:
  [SUMMARY of turns 1-140] [Turn 141] ... [Turn 150]
  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░  ~45K tokens
```

How it works (from pi-mom's `pi-coding-agent`):

1. **Find cut point**: walk backwards from newest messages, keeping ~20K tokens of recent context
2. **Summarize old messages**: Claude generates a structured summary (goal, progress, key decisions, next steps)
3. **Incremental updates**: if there's already a compaction summary, the new one merges with it rather than re-summarizing everything
4. **Write compaction entry**: appended to `context.jsonl` with a pointer to the first kept message
5. **Reload context**: agent gets the compacted message array for the next API call

Compaction is also triggered reactively if Claude returns a context-overflow error — compaction runs, then the request is retried automatically.

### Tool Result Truncation (from pi-mom)

Large tool outputs (query results, file contents, bash output) are truncated at execution time — before they're stored in the context at all. This is pi-mom's simple approach: hard limits per tool, no fancy cache-aware pruning.

| Tool     | Strategy                  | Default limits            | Behavior when truncated                              |
| -------- | ------------------------- | ------------------------- | ---------------------------------------------------- |
| **Bash** | Keep tail (last N)        | 50KB / 2000 lines         | Full output saved to temp file; model told the path  |
| **Read** | Keep head (first N)       | 50KB / 2000 lines         | Model told to use `offset` param to continue reading |
| **Grep** | Keep head + per-line trim | 50KB / 500 chars per line | Truncated lines noted                                |

Why tail for bash: errors and results are at the end. Why head for read: you want to see the beginning of a file.

When output exceeds limits, the model gets a notice like:

```
[Showing lines 1234-1500 of 1500 (50KB limit). Full output: /tmp/gravity-bash-abc123.log]
```

This is critical for the data analyst agent — DuckDB query results can be large. Truncation ensures a single big query doesn't blow the context window. The agent can still access full results via the temp file path if needed.

This is a separate concern from compaction. Truncation limits what goes into context on each turn. Compaction summarizes old turns when the accumulated context gets too large. Both are needed.

### Memory System

Memory is what survives compaction and restarts. Gravity keeps memory **file-based** — simple, transparent, and searchable with standard tools.

**Agent memory (`store/agents/{id}/memory/MEMORY.md`)**:

- Curated, durable knowledge — loaded into the system prompt every turn
- Agent writes to it via standard file tools when it learns something important
- Git-tracked — versioned, diffable, rollback-ready
- Examples: learned preferences, domain rules, important decisions

**Shared knowledge (`store/shared/knowledge/`)**:

- Company-wide context inherited by all agents (glossary, business terms, etc.)
- Also loaded into system prompt

**Memory search**: agents search their memory using `grep` via the bash tool — no vector store, no Postgres memory table, no embeddings. This is the pi-mom approach: simple tools, file-based state. `grep -i "customer segmentation" store/agents/data-analyst/memory/MEMORY.md` is good enough for MVP. If memory files grow large enough to need semantic search, that's a post-demo enhancement.

**How the agent knows to use memory**: the system prompt (assembled from skills) instructs the agent to read MEMORY.md at session start and to write important learnings to it. This is prompt-driven, not code-enforced. The self-author skill also teaches agents to update MEMORY.md when they learn durable facts during a conversation.

### Agent Scope vs Session Scope

**Key distinction:** agent-level state (skills, memory, identity) is shared across all conversations with that agent. Session-level state (conversation history, context window) is isolated per conversation. These are two different scoping levels:

| Scope       | What's shared                                                        | Keyed by                   | Lifetime                                                 |
| ----------- | -------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------- |
| **Agent**   | Skills, MEMORY.md, connectors, Postgres config, identity             | `agent-id`                 | Permanent (until agent is archived)                      |
| **Session** | Conversation history, context.jsonl, compaction state, scratch files | `agent-id` + `session-key` | One conversation (thread lifetime, or until TTL expires) |

An agent is one identity with one set of skills and one memory. A session is one conversation with that identity. Multiple sessions can run against the same agent, each with independent context windows.

### Session Model: Threads as Sessions

**In Slack, threads are the natural session boundary.** This handles both shared and user-specific sessions cleanly:

| Slack surface                               | Session behavior                                                                | Session key                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| Someone @mentions the agent in a channel    | Agent responds in a new thread → **new session**                                | `{agent-id}:{threadTs}`                             |
| Someone replies in an existing agent thread | Continues that thread → **existing session** (shared with anyone in the thread) | `{agent-id}:{threadTs}`                             |
| Someone DMs the agent                       | Each thread in the DM is a session; or the DM channel itself if unthreaded      | `{agent-id}:{threadTs}` or `{agent-id}:{channelId}` |

This means:

- **Shared sessions happen naturally**: two people ask follow-ups in the same thread → same context window, agent remembers what both asked
- **User-specific sessions happen naturally**: different threads → different context windows, completely independent conversations
- **Session isolation is automatic**: no configuration needed, Slack threading does the work

Example: three people use Wiggs in `#ask-wiggs` on the same morning:

- Alice asks "How many customers do we have?" → Thread A, Session A
- Bob asks "What's the payment breakdown?" → Thread B, Session B
- Alice follows up in her thread "Break that down by repeat vs one-time" → Thread A, Session A (agent has context from her first question)
- Carol joins Alice's thread "What about by region?" → Thread A, Session A (shared context — Carol benefits from Alice's prior questions)

Each session gets its own `context.jsonl` (compactable) and `log.jsonl` (permanent). All sessions share the same agent skills and MEMORY.md.

### Session Lifecycle

```
Message arrives on Slack
    │
    ▼
Route to agent (channel_id → agent-id via gravity.agents)
    │
    ▼
Resolve session key:
    ├── Has thread_ts? → session = {agent-id}:{thread_ts}
    └── No thread_ts? → agent creates a new thread → session = {agent-id}:{new_thread_ts}
    │
    ▼
Get or create SessionRunner for this session key
    │
    ▼
Load agent-scoped state (skills, memory, connectors — shared)
Load session-scoped state (context.jsonl, log.jsonl — isolated)
    │
    ▼
Assemble context → call Claude → execute tools → respond in thread
```

**Concurrency model:**

- Messages are processed sequentially within a session (no concurrent runs in the same thread)
- Different sessions for the same agent can run concurrently (Alice's thread and Bob's thread can both be active)
- If a message arrives while a session is running, it gets a "working on it" response
- Multiple agents run concurrently in the same process — they share nothing except `store/shared/` and the Postgres connection

**Session cleanup and memory hook:**

- Sessions accumulate over time (each thread = a session directory with log/context files)
- Idle sessions: SessionRunner is evicted from memory after inactivity (e.g., 30 min), but files persist on disk. Rehydrated on next message.
- **Session-end memory hook** (MVP): when a session goes idle or is evicted, the agent gets a silent turn: "This session is ending. Write any durable learnings from this conversation to MEMORY.md." This ensures knowledge from the conversation survives — modeled on OpenClaw's session memory hook. The agent writes to its MEMORY.md, then the session is closed. If there's nothing to save, it replies `NO_REPLY` and the session closes silently.
- Old sessions: files can be archived or deleted on a TTL (e.g., 7 days). The permanent log in `gravity.runs` preserves the audit trail regardless.

### File Layout (updated for per-session)

```
workspace/{agent-id}/
├── sessions/
│   ├── {thread-ts-1}/           # One session = one thread
│   │   ├── log.jsonl            # Permanent conversation log for this thread
│   │   ├── context.jsonl        # Live LLM context (compactable)
│   │   ├── last_prompt.jsonl    # Debug snapshot
│   │   └── scratch/             # Ephemeral working files for this session
│   ├── {thread-ts-2}/
│   │   ├── log.jsonl
│   │   ├── context.jsonl
│   │   └── scratch/
│   └── ...
└── agent-log.jsonl              # Agent-wide log (all sessions, for cross-session search)
```

### Routing: Channel → Agent → Session

The routing is a two-step lookup:

1. **Channel → Agent**: `gravity.agents.channel_id` maps a Slack channel to an agent. Populated on startup from Postgres. One channel = one agent (MVP). Future: multiple agents per channel via @mention routing.
2. **Message → Session**: `thread_ts` (or lack thereof) determines the session key. If no thread, agent creates one.

In code, pi-mom's `channelRunners: Map<channelId, AgentRunner>` becomes:

- `agentRegistry: Map<agentId, AgentConfig>` — agent-level config, skills, memory paths
- `sessionRunners: Map<sessionKey, SessionRunner>` — per-session state, context, history
- `channelToAgent: Map<channelId, agentId>` — routing lookup

### Backfill and Sync

On startup and before each session run:

1. **Startup backfill**: fetch recent Slack messages for each agent's channel, route to correct session by thread_ts, append to that session's `log.jsonl`
2. **Pre-run sync**: `syncLogToSessionManager()` scans the session's `log.jsonl` for messages not yet in its `context.jsonl` and adds them

### What's deferred (post-demo)

These memory/session capabilities are not in the MVP build:

- **Pre-compaction memory flush**: OpenClaw's agent writes important info to memory files _before_ compaction runs, ensuring nothing is lost in summarization. Gravity MVP relies on compaction's built-in summary quality plus the session-end memory hook. Add the pre-compaction flush as a near-term enhancement — it's the strongest defense against information loss in long sessions.
- **Semantic search over memory**: OpenClaw uses sqlite-vec + FTS5 for hybrid vector/keyword search over memory files. Gravity MVP relies on `grep` via bash tool. Semantic search is a Phase 2 enhancement when memory files grow large enough to need it.
- **Memory size management / rotation**: OpenClaw writes `memory/YYYY-MM-DD.md` daily logs alongside curated MEMORY.md, keeping individual files manageable. Gravity MVP uses a single MEMORY.md per agent. If MEMORY.md grows too large for the system prompt, add daily rotation or split into topic-based files.
- **Cache-TTL-aware pruning**: OpenClaw prunes old tool results when the Anthropic prompt cache expires, reducing re-cache cost. Pi-mom doesn't do this and Gravity MVP won't either. Add if API costs become a concern.
- **Cross-session context**: An agent doesn't automatically know what happened in other sessions. It can search `agent-log.jsonl` or `gravity.runs` for cross-session history, but this is explicit, not automatic.
- **Session-scoped memory**: MVP has agent-scoped memory only (shared across all sessions). Future: per-session or per-user memory for user-specific preferences within a conversation.

---

## Postgres Schema

### Gravity schema (`gravity`)

```sql
CREATE SCHEMA IF NOT EXISTS gravity;

-- Agent registry: what agents exist and how they are configured
CREATE TABLE gravity.agents (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    model           TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
    channel_id      TEXT,                         -- Slack channel this agent lives in (MVP: one active agent per channel)
    skills_path     TEXT,                         -- optional override; default convention is store/agents/{id}/skills/
    memory_path     TEXT,                         -- optional override; default convention is store/agents/{id}/memory/
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- connectors, permissions, model params
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Run history: every interaction logged
CREATE TABLE gravity.runs (
    id              TEXT PRIMARY KEY,             -- runId
    agent_id        TEXT NOT NULL REFERENCES gravity.agents(id) ON DELETE RESTRICT,
    session_key     TEXT NOT NULL,                -- {agent-id}:{thread_ts}
    thread_ts       TEXT,                         -- Slack thread TS (nullable for non-Slack surfaces)
    source          TEXT NOT NULL DEFAULT 'slack' CHECK (source IN ('slack', 'cron', 'heartbeat', 'system')),
    source_event_id TEXT,                         -- idempotency/dedupe key from source event
    channel_id      TEXT,
    user_id         TEXT,
    user_name       TEXT,
    query           TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    result_summary  TEXT,
    error_message   TEXT,
    policy_decisions JSONB NOT NULL DEFAULT '{}'::jsonb, -- policy/tool decisions taken during run
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    tokens_used     INT CHECK (tokens_used IS NULL OR tokens_used >= 0),
    cost_estimate   DECIMAL(10,4) CHECK (cost_estimate IS NULL OR cost_estimate >= 0),
    CHECK (completed_at IS NULL OR completed_at >= started_at)
);

-- Skill versions: how agents evolve through expert teaching
CREATE TABLE gravity.skill_versions (
    id              BIGSERIAL PRIMARY KEY,
    agent_id        TEXT NOT NULL REFERENCES gravity.agents(id) ON DELETE RESTRICT,
    skill_name      TEXT NOT NULL,
    version         INT NOT NULL CHECK (version > 0),
    changed_by      TEXT NOT NULL DEFAULT 'system', -- 'expert:sophie', 'self-authored', 'system'
    change_summary  TEXT,
    file_hash       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agent_id, skill_name, version)
);

-- Routing and integrity indexes
CREATE UNIQUE INDEX idx_agents_active_channel_unique
    ON gravity.agents(channel_id)
    WHERE channel_id IS NOT NULL AND status = 'active';

CREATE UNIQUE INDEX idx_runs_source_event_unique
    ON gravity.runs(source_event_id)
    WHERE source_event_id IS NOT NULL;

-- Query-path indexes (Act 5 queries, audit views, and session drilldowns)
CREATE INDEX idx_runs_agent_started
    ON gravity.runs(agent_id, started_at DESC);

CREATE INDEX idx_runs_session_started
    ON gravity.runs(session_key, started_at DESC);

CREATE INDEX idx_skill_versions_agent_created
    ON gravity.skill_versions(agent_id, created_at DESC);

-- Keep updated_at accurate on row updates
CREATE OR REPLACE FUNCTION gravity.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agents_set_updated_at
    BEFORE UPDATE ON gravity.agents
    FOR EACH ROW
    EXECUTE FUNCTION gravity.set_updated_at();

-- Note: memory is file-based (MEMORY.md), not in Postgres.
-- Agents search memory via grep. Structured memory in Postgres is a future enhancement.
```

---

## Demo Data Source: dbt jaffle-shop on DuckDB

> **This is just a test data source for the demo.** The platform is data-source-agnostic — each agent gets connectors (skills that teach it how to access specific data) as part of its configuration. In production, the data analyst connects to Mercury's real data warehouse; a compliance agent reads from a knowledge base; a support agent queries internal APIs. The data source is a pluggable connector, not part of the platform itself.

Source: [dbt-labs/jaffle_shop_duckdb](https://github.com/dbt-labs/jaffle_shop_duckdb). Lives at `/Users/kevingalang/code/jaffle_shop_duckdb`.

Everything runs locally. `dbt build` creates a `jaffle_shop.duckdb` file. 100 customers, 99 orders, 113 payments. Small but sufficient — the pattern matters, not the volume.

**Setup:** `git clone` → `pip install -r requirements.txt` → `dbt build` → done. Agent queries via `duckdb jaffle_shop.duckdb -cmd "SELECT ..."`.

**What's in the data:** Two mart tables (`customers` with lifetime metrics, `orders` with payment breakdowns) plus staging models. dbt's `schema.yml` has column descriptions and `docs.md` has business context — the agent reads these directly as its schema guide.

---

## Agent Definitions

### Agent 1: Wiggs (Data Analyst)

| Property    | Value                                                                                   |
| ----------- | --------------------------------------------------------------------------------------- |
| ID          | `data-analyst`                                                                          |
| Name        | Wiggs                                                                                   |
| Inspired by | Ryan Wiggins — data/analytics expertise                                                 |
| Channel     | `#ask-wiggs`                                                                            |
| Model       | Claude Sonnet 4.5                                                                       |
| Skills      | query-patterns, response-formatting + all shared skills                                 |
| Connectors  | DuckDB (jaffle_shop.duckdb) via `duckdb` CLI, dbt `.yml` files for schema understanding |
| Purpose     | Answer business questions about Mercury data in natural language                        |

Key behaviors:

- Reads dbt `schema.yml` and `docs.md` to understand the data model and business context
- Translates natural language questions into SQL against jaffle-shop mart tables
- Runs queries via `duckdb` CLI against the local `.duckdb` file, formats results as readable summaries
- Handles follow-up questions with session context
- Logs every run to `gravity.runs`
- Self-authors skill updates when taught by domain experts

### Agent 2: TBD (Compliance Helper)

| Property   | Value                                                            |
| ---------- | ---------------------------------------------------------------- |
| ID         | `compliance-helper`                                              |
| Name       | TBD (named after the compliance star whose expertise it encodes) |
| Channel    | `#ask-compliance`                                                |
| Model      | Claude Sonnet 4.5                                                |
| Skills     | review-rules, flag-patterns + all shared skills                  |
| Connectors | knowledge docs, potentially DuckDB for customer context          |
| Purpose    | Review marketing/external copy against encoded compliance rules  |

Key behaviors:

- Reviews submitted copy against encoded compliance rules
- Flags specific issues with explanations tied to Mercury's regulatory context
- Learns new rules from compliance experts via self-authoring
- References banking charter requirements, advertising regulations

Note: Agent 2 choice is flexible. The point is: different domain, same primitives. Pick whichever creates the most compelling contrast with the data analyst in the demo.

---

## Shared Skills (Platform Primitives)

These skills are inherited by every agent. They encode platform behavior — how agents participate in the system.

### `self-author.md`

Teaches agents how to update their own skill files:

- When to suggest a skill update vs just respond to the current question
- How to write the updated skill content to `store/`
- Auto-commit to git with a descriptive message
- Log the change to `gravity.skill_versions` via psql
- Confirm the change to the user with a summary of what was learned

### `log-run.md`

Teaches agents to log completed interactions to Postgres:

- Insert into `gravity.runs` with query, status, timestamps
- Capture token count and cost estimate when available
- Summarize the result for the audit trail

### `query-gravity.md`

Teaches agents to read their own config and history:

- Look up own agent definition from `gravity.agents`
- Check recent run history
- See skill version history and who taught what

### `rollback.md`

Teaches agents how to revert a skill change:

- `git log` to find the prior version
- `git checkout` to restore the file
- Log the rollback to `gravity.skill_versions`

---

## Runtime (from pi-mom)

Gravity's runtime is built by copying relevant source files from pi-mom (`/Users/kevingalang/code/pi-mono/packages/mom`) and modifying them. Not a git fork — selective extraction of the pieces we need. Single process. Runs the agent orchestration loop, executes all tools, and owns all durable state.

What it does:

- Slack Socket Mode connection and message routing
- Channel → agent routing (lookup from `gravity.agents`) and per-agent sequential message queuing
- Loads agent config, skills, and memory from `store/` — re-read every turn, never cached
- Assembles context: system prompt + skills + memory + conversation history → Claude API call
- Executes all tool calls (bash, read, write, edit, attach)
- Per-session dual-history: `log.jsonl` (permanent) + `context.jsonl` (compactable LLM context) per thread
- Thread-based session model: each Slack thread = one session, multiple users can share a thread/session
- Compaction when approaching context window limits (~20K recent tokens kept)
- Backfill on startup + pre-run sync for missed messages
- Writes all durable state directly (Postgres + `store/` files)
- Heartbeat runner for ambient monitoring + cron scheduler for precise timing (modeled on OpenClaw)

See [Memory, Sessions & Context](#memory-sessions--context) for the full architecture.

What it writes directly:

- Run logs → Postgres `gravity.runs`
- Skill updates → `store/` files + git commit + `gravity.skill_versions`
- Memory updates → `store/agents/{id}/memory/MEMORY.md` (file-based, git-tracked)

Configuration:

- Skills loading: `store/shared/skills/` (global) + `store/agents/{agent-id}/skills/` (agent-specific)
- Memory loading: `store/agents/{agent-id}/memory/`
- Scratch workspace: `workspace/{agent-id}/`
- Self-authoring writes go to `store/` directly
- All CLI tools (`psql`, `duckdb`, `git`) available in the same process

---

## Proactive Behavior

Agents don't just answer questions — they change the environment. Gravity supports two complementary proactive patterns, modeled on OpenClaw's event architecture (see `/Users/kevingalang/code/openclaw/src/infra/heartbeat-runner.ts` and `/Users/kevingalang/code/openclaw/src/cron/`):

### Heartbeats

Periodic low-cost checks that run in the agent's main session. The agent wakes up on an interval, checks if anything needs attention, and either acts or goes back to sleep.

- **Interval-based**: configurable polling interval (e.g., every 30 minutes)
- **Batched checks**: a single heartbeat can check multiple things (inbox, metrics, thresholds)
- **Smart suppression**: if nothing needs attention, the agent stays quiet — no noise
- **Quiet hours**: optional active hours config to silence during off-hours

Heartbeats are the ambient awareness layer. Low cost, always running, context-preserving (runs in main session so the agent remembers recent conversations).

### Cron Jobs

Precisely scheduled tasks that can run in isolated sessions. For things that need exact timing or independence from the main conversation.

- **Schedule kinds**: cron expressions (`"0 9 * * *"`), relative intervals (`"every 4h"`), or one-shot timestamps (`"at 2026-02-20T14:00:00"`)
- **Session targets**: `"main"` (inject into main session, wake heartbeat) or `"isolated"` (fresh session, independent context)
- **Delivery modes**: `"announce"` (post summary to channel), `"none"` (silent), or `"webhook"` (POST result externally)
- **Error handling**: exponential backoff on failures, auto-cleanup of one-shot jobs

### MVP demo: daily metric check

For the demo, Wiggs runs a scheduled check on key metrics (revenue, order volume, customer growth). If anything crosses a threshold, it posts a summary to the channel — unprompted.

```json
{
  "type": "cron",
  "schedule": "0 9 * * *",
  "session": "isolated",
  "delivery": "announce",
  "channel": "#ask-wiggs",
  "prompt": "Run your daily metrics check. Compare revenue, order volume, and customer count to last week. Flag anything that changed more than 10%. Post a summary."
}
```

For the live demo: either set the schedule to fire during the call window, or have a manual trigger ready (a "wake" command that fires the heartbeat immediately, like OpenClaw's wake handler).

---

## Build Checkpoints

Each checkpoint produces a verifiable working state. Evaluate before moving on — if the foundation feels wrong, course-correct early.

### CP1: Repo scaffold — runnable project

- [ ] package.json, tsconfig, deps installed
- [ ] Basic directory structure (`src/`, `store/`, `workspace/`)
- [ ] `npm run dev` starts without crashing (even if it does nothing useful yet)
- [ ] `.gitignore` configured (workspace/ ignored, store/ tracked)

**Eval:** "Is the project structure right? Are we pulling the right deps?"

### CP2: Infra running — Postgres + DuckDB ready

- [ ] docker-compose.yml with Postgres
- [ ] Schema applied (`gravity.agents`, `gravity.runs`, `gravity.skill_versions`)
- [ ] jaffle_shop_duckdb built — `duckdb jaffle_shop.duckdb "SELECT count(*) FROM customers"` returns 100
- [ ] Seed agents inserted into `gravity.agents`

**Eval:** "Schema look right? Data source working? `psql` → `SELECT * FROM gravity.agents` shows both agents."

### CP3: Slack bot connected — responds to messages

- [ ] Pi-mom source files copied and adapted (agent loop, Slack connection, routing, tools)
- [ ] Slack Socket Mode connected, bot shows online
- [ ] Bot receives a message and echoes something back (no Claude yet)
- [ ] Channel → agent routing wired up from Postgres (`channelToAgent` map)

**Eval:** "Did we pull the right pieces from pi-mom? Is the routing clean? Are we drawing the lines correctly?"

### CP4: End-to-end agent — Wiggs answers a question

- [ ] Claude API wired into the agent loop
- [ ] Skills loaded from `store/` into system prompt (re-read every turn, never cached)
- [ ] DuckDB connector skill written (path to `.duckdb` file, CLI query syntax)
- [ ] Query-patterns skill written (DuckDB SQL idioms, business question interpretation)
- [ ] Response-formatting skill written (how to present results in Slack)
- [ ] Agent reads dbt `schema.yml` + `docs.md` for schema understanding
- [ ] Tool result truncation working (bash tail-keeping, read head-keeping) — critical for large DuckDB results
- [ ] Test: "How many customers do we have?" → correct answer in Slack
- [ ] Test: "What's the payment method breakdown by order status?" → accurate formatted answer
- [ ] Test: "Who are our highest-value customers and what do they have in common?" → thoughtful analysis

**Eval:** "Is the skill loading right? Context assembly correct? Does the answer feel good? Do large query results get truncated safely?"

### CP5: Run logging + store conventions verified

- [ ] Runs logged to `gravity.runs` after each interaction (log-run skill working)
- [ ] `store/` directory conventions solid (shared/, agents/, connectors/)
- [ ] Git repo initialized for `store/`
- [ ] `query-gravity.md` skill working — agent can introspect its own config and history
- [ ] `rollback.md` skill working — agent can revert a skill change via git
- [ ] Test: query Wiggs, then `SELECT * FROM gravity.runs` shows the interaction

**Eval:** "Is the state ownership split (Postgres vs files) working as designed? Can the agent see itself in the system?"

### CP6: Sessions + memory scaffolding

- [ ] Dual-history system: `log.jsonl` (permanent, append-only) + `context.jsonl` (compactable) per thread
- [ ] Thread-based sessions working (different threads = different context windows)
- [ ] MEMORY.md loaded into system prompt each turn
- [ ] Compaction logic ported from pi-mom (threshold-based + reactive on context overflow)
- [ ] Agent-log.jsonl for cross-session search
- [ ] Backfill on startup + pre-run sync for missed Slack messages
- [ ] Session-end memory hook (idle session → agent writes learnings to MEMORY.md before eviction)
- [ ] Concurrency: sequential within a session, concurrent across sessions

**Eval:** "Do sessions isolate correctly? Does memory persist across threads? Does compaction fire and recover gracefully?"

### CP7: Tests for sessions and memory

- [ ] Unit/integration tests for session creation, history append, compaction
- [ ] Test: multi-turn conversation maintains context within a thread
- [ ] Test: different threads have independent context windows
- [ ] Test: MEMORY.md changes reflected on the very next turn
- [ ] Test: two threads active concurrently — neither blocks the other
- [ ] Test: context overflow → compaction → auto-retry succeeds

**Eval:** "Are we confident the session system is solid before building on top of it?"

### CP8: Self-authoring loop

- [ ] Self-author skill written and working
- [ ] Agent updates its own skill files in `store/`
- [ ] Git auto-commit on skill changes (descriptive message)
- [ ] Skill version logged to `gravity.skill_versions` (who taught what, when)
- [ ] Test: teach agent a preference → skill file updates → next query reflects new behavior
- [ ] Test: `git log --oneline -3` shows the auto-committed skill change
- [ ] Test: `SELECT * FROM gravity.skill_versions ORDER BY created_at DESC LIMIT 3` shows the tracked change

**Eval:** "Does the full teach-learn-apply-track loop work end-to-end? Is it demo-ready for Act 3?"

### CP9: Second agent (compliance helper)

- [ ] Compliance helper skills written (review-rules, flag-patterns)
- [ ] Second channel configured (`#ask-compliance`)
- [ ] Agent registered in `gravity.agents`
- [ ] Agent responds to domain-specific questions (copy review, compliance checks)
- [ ] Shares platform skills from `store/shared/skills/` (self-author, log-run, query-gravity, rollback)
- [ ] Both agents visible in Postgres, both logging runs

**Eval:** "Does the platform compound? Was this genuinely faster to build than Wiggs? `SELECT agent_id, count(*) FROM gravity.runs GROUP BY agent_id` shows both."

### CP10: Proactive behavior

- [ ] Heartbeat runner implemented (interval-based polling with smart suppression)
- [ ] Cron job for daily metric check created
- [ ] Agent runs scheduled metric check against DuckDB
- [ ] Agent posts proactive summary to channel (unprompted)
- [ ] Manual wake trigger available for demo (fires heartbeat immediately)
- [ ] Quiet hours config respected

**Eval:** "Does proactive behavior feel natural, not spammy? Does the wake trigger work reliably for a live demo?"

### CP11: Demo polish and rehearsal

- [ ] Demo script finalized (see demo flow below)
- [ ] All demo queries tested and reliable
- [ ] Slack channels named clearly (`#ask-wiggs`, `#ask-compliance`)
- [ ] Wiggs bot has proper name and avatar (not generic)
- [ ] Fallback screenshots prepared for each demo section
- [ ] Full rehearsal run-through, timed to ~20 minutes
- [ ] Edge cases handled (slow responses, query failures)

**Done when:** Full demo runs in under 20 minutes without hiccups.

### Buffer: hours 22-24

---

## Demo Flow (Thursday call with Immad)

_Target: ~20 minutes. Read the room — expand or contract sections based on interest._

### Act 1: The Problem (2 min, verbal, no screen)

Frame the problem before showing anything:

> "Engineering velocity is about to outrun every non-eng team at Mercury. The expertise to solve that already exists — it's locked in a few people's brains. Gravity is about amplifying that expertise and distributing it to everyone who needs it."

Quick mention: OpenAI Leverage Eng, Shopify, Stripe, Quora all doing this. Mercury should too.

Then: _"Let me show you what I built."_

### Act 2: Live Data Analyst (4 min, Slack)

Three queries to Wiggs in `#ask-wiggs`:

1. **Simple**: "How many customers do we have, and how many have placed orders?"
2. **Harder**: "What's the payment method breakdown? Which methods are most common and what's the average order value for each?"
3. **Business question**: "Who are our highest-value customers? What patterns do you see in our best vs one-time customers?"

Each shows: natural language in → agent reads dbt schema docs → writes SQL → queries DuckDB → formatted answer out. Wiggs answers like Ryan would — with context, not just numbers.

Note: jaffle-shop's domain is ecommerce, not fintech. Frame it: "This is test data from dbt's standard demo project. At Mercury, the agent reads Mercury's dbt project the same way — swap the dbt models and schema, everything else stays identical."

### Act 3: Self-Authoring (3 min, Slack + terminal)

The thesis moment:

> "Watch what happens when a domain expert shapes the agent."

Teach the agent: _"When someone asks about customers, always segment them into one-time vs repeat buyers and flag if repeat buyer percentage is below 40%."_

Agent updates its skill file. Re-ask about customers — answer now includes the segmentation and flags the ratio.

Switch to terminal:

- `git log --oneline -3` — show the auto-committed skill change
- `SELECT * FROM gravity.skill_versions ORDER BY created_at DESC LIMIT 3;` — show it's tracked

> "No ticket filed. No eng cycle. Sophie teaches the agent once, everyone benefits. Git tracks it. Postgres logs it. Roll back if it breaks."

### Act 4: Second Agent (3 min, Slack)

Switch to `#ask-compliance`. Different agent, different star's expertise, different domain:

Quick interaction showing compliance review capability.

The punchline:

> "The data analyst took me about 8 hours. This one took 3. Same Slack surface. Same self-authoring. Same Postgres. Same shared skills. Only the domain knowledge changed."

Briefly show the directory structure: `store/agents/` with two agents, `store/shared/` with common skills.

> "Every new agent is mostly recombination. The 10th costs less than the 2nd."

### Act 5: The System (3 min, terminal/psql)

This is where Immad the coder leans in:

```sql
-- The registry
SELECT id, name, status, channel_id FROM gravity.agents;

-- What's happened across the system
SELECT agent_id, count(*), max(completed_at) FROM gravity.runs GROUP BY agent_id;

-- How agents evolve through expert teaching
SELECT agent_id, skill_name, changed_by, change_summary, created_at
FROM gravity.skill_versions ORDER BY created_at DESC;
```

> "Every agent registers here. Every run is logged. Every skill change is tracked with who taught it. This is Postgres on my laptop today. Same schema behind an API tomorrow."

Show `store/` directory briefly:

> "Durable files live here — skills, memory, knowledge. Git-tracked. This simulates S3 in production. The workspace is ephemeral and disposable."

### Act 6: Proactive Behavior (2 min, Slack)

> "These agents don't just answer questions. They change the environment people work in."

Show a proactive message Wiggs posted — a metric check it ran without being asked:

> "This morning, Wiggs checked key metrics and flagged that return-pending orders spiked. Nobody asked. It just knows to watch."

### Act 7: Forward Roadmap (3 min, verbal, close laptop)

Only if there's interest — read the room:

- **Security**: "Before any agent ships, three questions — what data can it access, what can it execute, what can it send? The Lethal Trifecta. We scope tightly per agent."
- **Personal agents**: "Eventually every employee has an agent tuned to their role and workflow. Self-authored over time through usage."
- **Rollout strategies**: "Some agents start with one team and expand. Some are org-wide day one. Depends on the data sensitivity and trust boundary."
- **Relationship to AI infra team**: "Applied AI is the first real consumer of whatever the AI engineering team ships. We stress-test their frameworks on internal products before they hit customer-facing code."

Close with:

> "This is a pre-seed bet. One person, 60 days, ship the first real agent, measure if it has gravity — are people pulling it in without being told to? Earn the next round with results. That's all I'm asking for."

---

## Security

### Security model

Inspired by OpenClaw's concentric rings model. Security is three independent knobs, not one:

1. **Tool policy** — which tools each agent can use (allow/deny lists). "Deny always wins." Pure configuration, no infrastructure. A compliance agent that should never run bash simply doesn't have `bash` in its tool list.
2. **Sandbox** — where tool execution happens (host process vs isolated container). Controls blast radius if something goes wrong. Independent of tool policy — a tool can be allowed but sandboxed.
3. **Inbound access control** — who can talk to which agent. Channel allowlists, approval flows, mention gating.

These layer: access control decides if the message reaches the agent → tool policy decides if a tool can run at all → sandbox decides where it runs.

**Lethal Trifecta** — three questions before any agent ships to production:

1. **What private data can it access?** Centrally scoped connectors per agent. Per-agent data permissions. Auditable access decisions.
2. **What can it execute or change?** Tool allow/deny lists per agent. Sandboxed execution for untrusted tools. Bounded resources and mandatory timeouts.
3. **What can it send externally?** Centrally defined outbound channels. Per-run authorization for side effects. Delivery outcomes logged.

Security invariant: no side effects occur without passing policy gates first.

**MVP stance:** Single process, trust-based. Agents are ones we wrote, data is test data. The Lethal Trifecta is defined per-agent in agent config but not enforced in code. This is fine — there's no untrusted input, no production data, no external sends. The architecture knows where enforcement will go.

### Security roadmap (post-demo)

**Phase 1 — Tool policy (weeks 1-2, config only, no infrastructure)**

Per-agent allow/deny lists for tools. Defined in agent config in `gravity.agents`, enforced before any tool executes.

- Data analyst: allow `bash`, `read`, `write`, `duckdb`. Deny `browser`, `network`.
- Compliance helper: allow `read`, `write`. Deny `bash`, `exec`.
- "Deny always wins" — if a tool is denied, nothing can override it.
- Elevated mode as escape hatch: explicit operator approval to temporarily grant a denied tool for a specific session (e.g., debugging).

No infrastructure change. Just a policy check before dispatching any tool call.

**Phase 2 — Sandbox isolation (weeks 3-4, Docker)**

Tool execution dispatches to Docker containers instead of running in-process.

- No network access by default in sandbox containers.
- Workspace access controls per agent: `none` (can't see host files), `ro` (read-only mount), `rw` (read-write mount to scratch space).
- Main process stays on host. Only tool calls go to containers.
- Dangerous bind sources blocked (`/etc`, `/proc`, `/sys`, `/dev`, docker socket).
- Container scope options: per-session (most isolated), per-agent (shared across sessions), or shared (least isolated).

This is where Modal/Fly replaces Docker if we need more scale or stronger isolation.

**Phase 3 — Per-agent security profiles (month 2)**

Full Lethal Trifecta enforcement with graduated trust levels per agent:

- **Full access**: sandbox off, all tools allowed. For trusted, owner-operated agents only.
- **Standard**: sandbox on for bash/exec, tool policy scoped to domain. Most production agents.
- **Read-only**: sandbox on for everything, workspace `ro`, no write/exec/bash. For agents processing untrusted content.
- **Limited**: sandbox on, workspace `none`, only messaging tools. For public-facing or low-trust agents.

Per-agent data scoping: each agent's connectors define exactly which tables/schemas/APIs it can reach. Auditable access decisions logged to `gravity.runs`.

Outbound send controls: agents that post to Slack, send emails, or call external APIs have explicitly defined outbound targets. Delivery outcomes logged.

**Phase 4 — Inbound access control and approval flows (months 2-3)**

- Channel allowlists: which Slack channels/users can trigger which agents.
- Self-authoring confirmation gates: high-sensitivity agents (e.g., compliance) require human approval before skill changes are persisted. Lower-sensitivity agents (e.g., data analyst) auto-approve.
- Approval modes per tool: `auto` (always allowed), `ask` (requires operator approval per invocation), `deny` (blocked).
- Audit command: query `gravity.runs` + `gravity.skill_versions` to review all agent activity, policy decisions, and skill evolution. The data is already there from MVP — this phase adds the tooling to query it.

---

## Reliability (Post-Demo Roadmap)

Not enforced in MVP. Defined here so the contracts exist when needed.

- **Ingress**: idempotency keys on inbound run requests. Accepted response immediately, final response async.
- **Run control**: stable `runId`, `sessionKey`, `agentId` on every event. Deterministic cancellation semantics.
- **Scheduling**: durable job store in Postgres. Restart-safe replay of missed due jobs. Exponential backoff and hard timeout ceilings.
- **Recovery**: startup cleanup for stale in-progress markers. Deterministic re-arm of background timers.

---

## Control Plane Readiness (Post-Demo Roadmap)

No UI required now, but these contracts make one trivial to add later:

1. Stable IDs everywhere (`agentId`, `sessionKey`, `runId`)
2. Typed event schema (run lifecycle, tool lifecycle, policy decisions)
3. API-first service boundaries (registry, memory, policy, scheduler)
4. Versioned configuration and artifacts (rollback-ready)

If these are in place, a control plane becomes a UI layer over existing systems.

---

## Open Questions (Resolve Before Build)

1. **Workspace config**: Confirm how to point the copied pi-mom code's skill loading at `store/` and scratch workspace at `workspace/`. May require workspace path configuration.

2. **DuckDB CLI access**: The agent's bash tool needs access to the `duckdb` CLI binary and the absolute path to `jaffle_shop.duckdb`. Confirm both are available in the process environment.

3. **Jaffle-shop data size**: Default seed is small (100 customers, 99 orders). Fine for demo — the pattern matters more than volume. Could supplement with additional seed CSVs if we want richer "compare to prior period" queries.

4. **Agent 2 domain choice**: Compliance helper is the current default. Could also be onboarding guide or support context tool. Pick whichever is fastest to make compelling.

5. **Slack workspace**: Use personal workspace or a dedicated test workspace? Need bot token and Socket Mode app configured.

6. **Model choice**: Default to Claude Sonnet 4.5 for speed/cost. Could use Opus for the open-ended business question to show reasoning quality.

7. **Git auto-commit mechanism**: Self-author skill triggers git commits. Options: agent runs `git add && git commit` via bash tool, or a hook script on file change in `store/`.

8. **Proactive event timing**: For the live demo, set cron to fire during the call window, or use the manual wake trigger to fire a heartbeat on demand.

9. **dbt metadata access pattern**: The agent can either read `schema.yml` + `docs.md` directly from the `jaffle_shop_duckdb/models/` directory, or we run `dbt docs generate` and have it read the compiled `manifest.json`/`catalog.json`. Direct YAML reading is simpler and more transparent for the demo.

---

## Success Criteria

The demo succeeds if Immad:

1. **Sees a system, not a bot.** Postgres, the store, the separation of concerns — real architecture.
2. **Respects it as a coder.** Clean schema, clear ownership model, git-tracked skills — not a hack.
3. **Understands the compounding.** Two agents, shared primitives, decreasing marginal cost per agent.
4. **Gets the self-authoring thesis.** Experts shape agents directly. No engineering bottleneck.
5. **Feels the gravity.** Leaves the call thinking "I want this at Mercury."
6. **Believes Kevin built this.** 24 hours. Clear roadmap. The right person for the job.
