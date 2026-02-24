# Evals + Monitoring V1 Plan (Phoenix + Slack Review Agent)

Status: active
Owner: kevin + codex
Last Updated: 2026-02-24
Thread: evals-monitoring-v1

## Goal
Ship a lean centralized review loop where one engineer can monitor multi-agent quality,
review risky sessions and skill mutations, and take corrective actions from Slack.

## Product + Technical Intent
- PM intent: keep SME self-authoring fully enabled while adding centralized quality control.
- Ops intent: allow one engineer to review all agents on a daily cadence without opening a
  separate control-plane UI.
- Technical intent: use self-hosted Phoenix for trace/eval visibility and keep approval state
  in Gravity Postgres as the control-plane source of truth.

## Closed Decisions (2026-02-24)
- Use Phoenix as the observability/evals backend for this thread.
- Primary reviewer UX is a dedicated Slack agent (`central-review`), not a new web UI.
- Keep SME skill self-authoring non-blocking by default.
- Start with Docker Compose local deployment.
- Integration order is CLI-first (`px`/API wrappers), then optional MCP follow-up.

## Scope
In scope:
- Local Phoenix service via `docker compose` for dev/test workflows.
- Runtime instrumentation from Gravity runs into Phoenix with stable ID linkage.
- Risk-based review queue contracts (sessions + skill updates + failures + negative feedback).
- Slack `central-review` agent commands for digest, triage, review, approve, and rollback.
- Review/audit persistence in Gravity Postgres.
- Verification harness and docs updates for this thread.

Out of scope:
- Full web control-plane UI.
- Organization-wide mandatory pre-approval for all skill changes.
- Multi-reviewer assignment workflows and escalations.
- Production hardening of Phoenix cluster topology.

## Boundary Map (Ownership)
- `PhoenixTelemetryAdapter` (new runtime seam): exports run/session/eval telemetry to Phoenix.
- `ReviewQueueService` (new runtime seam): computes prioritized review items from
  `gravity.runs`, skill mutations, and feedback annotations.
- `ReviewAuditStore` (new Postgres seam): stores reviewer actions, decisions, and rationale.
- `central-review` agent runtime declaration (`agents/index.ts` + shared skills): Slack-facing
  operator commands and daily digest behavior.
- Existing `RunLifecycleLogger` + stable IDs (`runId`, `agentId`, `sessionKey`): canonical join
  keys across Gravity and Phoenix records.

## Abstraction Decisions
- Keep observability export as one explicit adapter; do not scatter Phoenix calls through
  ingress handlers.
- Keep reviewer workflow state in Gravity Postgres, not Phoenix, to preserve control-plane
  ownership and rollback semantics.
- Use deterministic command contracts for reviewer actions (`approve`, `request-change`,
  `rollback`, `snooze`) with explicit audit writes.
- Default integration path is CLI/API wrappers; do not block V1 on MCP protocol coverage.

## Tradeoff Summary
- Phoenix-first speeds delivery and reduces infra/design risk.
- Slack-first reviewer UX is fast to adopt but less discoverable than a full dashboard.
- Keeping approvals in Gravity adds one join boundary, but makes governance rules explicit and
  independent from vendor/UI changes.

## Phase 0: Local Phoenix Baseline (Now)
- [ ] Add Phoenix service to local `docker-compose.yml` (persistent volume, default port).
- [ ] Document startup/health commands in runbook (`docker compose up -d ...` + health checks).
- [ ] Add required env contract for Gravity -> Phoenix wiring.
- [ ] Verify local bootstrap path: Postgres + Phoenix + Gravity runtime start cleanly.

## Phase 1: Observability + Evals Wiring
- [ ] Add runtime adapter that emits per-run telemetry with stable IDs.
- [ ] Capture session/run metadata in Phoenix (agent, trigger kind, entrypoint, status).
- [ ] Add baseline eval scoring path for known regression prompts.
- [ ] Add minimal query helpers/scripts for pulling recent failed/low-score sessions.

## Phase 2: Central Review Queue Contracts
- [ ] Define review item schema in Postgres (`item_id`, `agent_id`, `run_id`, `risk_score`,
  `status`, `reviewer`, timestamps, rationale).
- [ ] Build deterministic prioritization: low eval score, failed run, negative feedback,
  recent skill mutation, recurrence.
- [ ] Implement dedupe + state transitions (`open`, `in_review`, `approved`, `needs_followup`,
  `rolled_back`, `snoozed`).

## Phase 3: Slack `central-review` Agent
- [ ] Introduce `central-review` agent declaration + channel/command bindings.
- [ ] Add daily digest summary command (`since-last-check`) with top risky items.
- [ ] Add drill-in command to inspect anonymized session + linked skill diff + evidence.
- [ ] Add action commands that write audit state and trigger rollback when requested.
- [ ] Add a quiet-hours-safe proactive digest trigger.

## Phase 4: Integration Path (CLI First, MCP Optional)
- [ ] Implement CLI/API wrapper scripts used by runtime + skills for Phoenix queries.
- [ ] Add shared skill docs for reviewer workflows and command contracts.
- [ ] Evaluate MCP coverage for required trace/review operations after CLI path is stable.
- [ ] If MCP coverage is sufficient, add MCP adapter as a non-breaking secondary integration.

## Validation Strategy
- Keep merge gates green (`npm run check`, `npm run lint:repo`).
- Add `npm run verify:review` harness covering:
  - risk scoring and queue ordering,
  - reviewer action state transitions and audit writes,
  - rollback action linkage to stable IDs,
  - digest output determinism.
- Add doc sync checks:
  - `docs/checkpoints/mvp-status.md`,
  - `docs/architecture/interfaces.md` (new seams),
  - `docs/operations/runbook.md` (Phoenix local ops path),
  - `docs/RELIABILITY.md` (review reliability contracts).

## Deferrals
- Web dashboard for centralized review.
- Full approval-state machine for all self-authoring events.
- Team-scoped reviewer routing and assignment load balancing.

## Exit Criteria
- One engineer can run a daily centralized quality review from Slack across all agents.
- Phoenix is running locally through Compose and receives runtime telemetry.
- Risk queue and reviewer actions are durable, auditable, and stable-ID linked.
- Verification harness and merge gates pass with docs synchronized.
