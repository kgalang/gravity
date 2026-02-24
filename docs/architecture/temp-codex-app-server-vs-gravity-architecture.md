# TEMP: Codex App Server vs Gravity (Product + Architecture)

Last Updated: 2026-02-24
Status: temporary comparison note
Owner: kevin + codex

## Why this doc exists
This is a product-and-architecture comparison to answer:
- what Codex App Server is designed to do,
- how that differs from Gravity's product and runtime layer,
- which implementation decisions from Codex App Server are useful for Gravity now,
- which are out of scope for Gravity and should not be copied.

## Executive Summary
- Codex App Server is a transport/protocol control plane for embedding Codex into external apps (IDEs, app surfaces) with a thread/turn/item event model.
- Gravity is an orchestration runtime for Slack-native domain agents with durable org state, scheduled/proactive behavior, and capability-driven context assembly.
- The key lesson is not "copy their API." The key lesson is to copy a few boundary decisions:
  - split loops for ingress/process/outbound with bounded queues,
  - explicit event adaptation boundary,
  - strict config layering and validation,
  - first-class async request/approval correlation for tool calls.
- Recommended sequence for Gravity stays the same:
  1. reliability hardening first,
  2. sandbox rollout second.

## What Codex App Server Is

### Product intent (PM lens)
- A hostable interface so another product can embed Codex interaction loops.
- Optimized for rich interactive UX: streaming deltas, turn interruption, approvals, dynamic tools, thread lifecycle operations.
- Works as a harness bridge between UI/app surfaces and core Codex runtime.

### Runtime intent (CTO lens)
- Protocol adapter over core runtime, not business-domain orchestration.
- Strong connection contract (`initialize` handshake required before other requests).
- Per-connection capability gating and notification behavior.
- Bounded backpressure with explicit overload error signaling.
- Internal control split across transport, processor, and outbound routing loops.

## Architecture Snapshot: Codex App Server

### Boundary map (from implementation)
- Transport boundary:
  - `src/transport.rs` handles stdio/websocket connection plumbing and connection IDs.
  - Uses bounded channels (`CHANNEL_CAPACITY = 128`) between loops.
- Processing boundary:
  - `src/message_processor.rs` enforces initialize-before-use contract and delegates domain requests to `CodexMessageProcessor`.
- Domain operation boundary:
  - `src/codex_message_processor.rs` handles thread/turn/item APIs and request routing.
- Thread state boundary:
  - `src/thread_state.rs` keeps listener/subscription/turn-summary state separate from transport and protocol layers.
- Event adaptation boundary:
  - `src/bespoke_event_handling.rs` maps core events into externally visible protocol notifications and approval flows.
- Outgoing correlation boundary:
  - `src/outgoing_message.rs` correlates server requests to client responses with request IDs and oneshot callbacks.
- Dynamic tool bridge:
  - `src/dynamic_tools.rs` validates and safely maps client tool call responses back to core operations.

### Notable system behaviors
- Overload behavior is explicit and documented (retryable error path).
- Experimental APIs are capability-gated.
- Config is layered with clear precedence and typed overrides.
- Listener lifecycle and thread status tracking are explicit and test-covered.

## Gravity vs Codex App Server

### Product use-case comparison (PM view)

| Dimension | Codex App Server | Gravity |
| --- | --- | --- |
| Primary user journey | Embedded coding harness inside host app UX | Slack-first domain agent workflows |
| Interaction style | High-frequency interactive turn streaming + approvals | Threaded messaging + proactive scheduling |
| Unit of value | Product-integrated coding loop | Reusable org expertise amplification |
| Typical buyer concern | Embed quality, UX control, protocol stability | Operational reliability, policy control, auditability |
| Success signal | Developer adoption in host app | Reduced expert bottlenecks in business teams |

### Technical needs comparison (CTO view)

| Dimension | Codex App Server | Gravity |
| --- | --- | --- |
| Core model | `thread` -> `turn` -> `item` | `agentId` -> `sessionKey` -> `runId` |
| Surface model | Multi-client protocol transport | Slack ingress + proactive scheduler |
| Durable state | Thread rollouts + state DB (runtime-owned) | Postgres (`runs/sessions/skill_versions`) + `store/` |
| Tool approval path | First-class protocol requests/responses | Currently host execution; sandbox seam scaffolded |
| Backpressure | Explicit bounded queues + overload error | Channel queueing exists, overload contract not first-class yet |
| API burden | Public protocol + compatibility surface | Internal runtime contracts + docs/checkpoint discipline |

## What We Should Learn (and Apply)

### 1) Split control loops with explicit queue contracts
Reasoning:
- PM: better incident behavior under load means fewer dropped interactions and clearer operator messaging.
- CTO: isolates slow outbound I/O from request processing, reduces shared mutable state risk.

Gravity application:
- Keep Slack ingress, run execution, and outbound delivery as explicit queue-linked stages.
- Add an overload policy with deterministic response behavior instead of implicit degradation.

### 2) Keep event adaptation as a dedicated seam
Reasoning:
- PM: allows product-facing event/UI evolution without destabilizing runtime correctness.
- CTO: avoids coupling internal runtime events to surface-specific wire formats.

Gravity application:
- Maintain a clear adapter between core run events and Slack-facing delivery patterns.
- Avoid placing product formatting logic inside core execution paths.

### 3) Use strict config layering and typed override precedence
Reasoning:
- PM: predictable behavior when operators change settings.
- CTO: prevents hidden precedence conflicts and hard-to-debug runtime divergence.

Gravity application:
- Keep explicit precedence order documented and enforced for runtime and agent overrides.
- Keep runtime assumptions explicit in docs and tests now; evaluate a dedicated preflight command later.

### 4) Treat approvals/callbacks as first-class correlated flows
Reasoning:
- PM: reduces confusing "pending" states in user-facing approval actions.
- CTO: establishes deterministic timeout/cancel semantics and safe response correlation.

Gravity application:
- Reuse this pattern for sandbox approval workflows and potential human-in-the-loop policy controls.
- Correlate by stable IDs and explicit lifecycle states.

### 5) Validate dynamic extension points aggressively
Reasoning:
- PM: fewer runtime surprises for teams adding capabilities.
- CTO: fail-closed validation reduces arbitrary/unsafe runtime behavior.

Gravity application:
- Validate capability/resource/tool bindings and dynamic mutation intent at boundaries before execution.

## What We Should Not Copy
- Full thread/turn/item external API as Gravity's core abstraction.
- Broad auth/account/login surface from app-server.
- Legacy v1/v2 compatibility burden.
- Embedding-first UX assumptions as runtime requirements.

## Proposed Gravity Decisions from this Comparison

### Decision A: reliability phase should adopt queue/overload clarity
- Add explicit ingress overload handling and operator-visible signals.
- Separate delivery-side failures from core execution lifecycle persistence.

### Decision B: sandbox phase should adopt approval correlation model
- Add request IDs, timeout semantics, and deterministic final statuses for sandbox approvals.
- Preserve stable IDs (`runId`, `agentId`, `sessionKey`) across approval transitions.

### Decision C: keep Gravity's control-plane-first domain model
- Retain code-defined agent contracts and capability-driven context assembly.
- Do not reframe Gravity into a generic protocol server.

## Roadmap Impact

### Near-term (Reliability first)
1. Harden shutdown and queue boundary behavior.
2. Add explicit overload behavior and observability around ingress/delivery.
3. Expand targeted runtime tests for slash lifecycle and delivery edge paths.
4. Defer a dedicated `doctor` command until after initial reliability and sandbox phases are complete.

### Next (Sandbox second)
1. Upgrade `ExecutorManager` from scaffold to real sandbox dispatch.
2. Introduce correlated approval and cancellation contracts.
3. Add policy and audit surfaces for sandboxed tool execution.

## Open Questions
1. Should Gravity expose any public protocol surface, or remain Slack/control-plane internal for now?
2. Do we need per-connection/per-surface capability flags before adding another surface beyond Slack?
3. What overload behavior should Slack users see (drop, defer, or explicit retry response)?

## Sources
- Codex App Server docs: <https://developers.openai.com/codex/app-server/>
- Codex app-server source tree: <https://github.com/openai/codex/tree/main/codex-rs/app-server>
- Snapshot used for this note: `openai/codex` commit `0679e70` (2026-02-24 UTC)

Key implementation anchors:
- `codex-rs/app-server/src/lib.rs`
- `codex-rs/app-server/src/transport.rs`
- `codex-rs/app-server/src/message_processor.rs`
- `codex-rs/app-server/src/codex_message_processor.rs`
- `codex-rs/app-server/src/thread_state.rs`
- `codex-rs/app-server/src/bespoke_event_handling.rs`
- `codex-rs/app-server/src/outgoing_message.rs`
- `codex-rs/app-server/src/dynamic_tools.rs`
