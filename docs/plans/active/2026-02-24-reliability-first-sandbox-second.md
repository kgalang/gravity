# Sandbox-First Security Proof Plan (Lean)

Status: active
Owner: kevin + codex
Last Updated: 2026-02-24
Thread: sandbox-security-proof

## Goal
Prove a security-minded runtime boundary by shipping a minimal, fail-closed sandbox execution path now (pre-customer).

## Product + Technical Intent
- PM intent: show clear security posture during live runtime execution before customer rollout.
- CTO intent: establish one explicit execution boundary (`ExecutorManager`) with deterministic allow/deny behavior and rollback.
- Scope guardrails: no `doctor` command in this thread and no full approval-state machine yet.

## Scope
In scope:
- Minimal sandbox execution path through `ExecutorManager` (`host` vs `sandbox`).
- Fail-closed policy decision contract (`allow`/`deny` with explicit reason).
- Stable-ID-linked auditability for sandbox decisions (`runId`, `agentId`, `sessionKey`).
- Lean test coverage for routing, deny, failure, and rollback behavior.

Out of scope:
- Public protocol/server surface (Codex App Server-style transport API).
- Full async approval lifecycle (`request_id`, timeout, cancel, multi-step pending state).
- Broad reliability hardening expansion (tracked as tech debt).
- `npm run doctor` command implementation.

## Boundary Map (Ownership)
- `ExecutorManager` (`src/runtime/executor-manager.ts`): single execution boundary; selects host or sandbox path.
- Sandbox policy seam (runtime config + policy evaluator): decides `allow` vs `deny` before execution.
- `RunLifecycleLogger` + `RunLogStore`: persist sandbox decision metadata with stable IDs.
- Runtime orchestration (`src/index.ts`, `src/runtime/pi-agent-runner.ts`): passes execution context and handles fail-closed result mapping.

## Abstraction Decisions
- Keep `ExecutorManager` as the single execution abstraction; do not add parallel tool-dispatch layers.
- Use one policy shape for MVP: `{ decision: "allow" | "deny", reason }`.
- Keep deny/failure behavior deterministic and fail-closed.
- Defer approval correlation and timeout/cancel semantics to a later hardening pass.

## Tradeoff Summary
- Sandbox-first improves security narrative quickly and intentionally leaves broader hardening as debt for later.
- Lean policy shape speeds delivery and keeps behavior debuggable; it is less flexible than full approval workflows.
- Deferring `doctor` and advanced fallback logic keeps this thread focused on one measurable proof.

## Phase 1: Sandbox MVP (Now)
- [x] Define MVP sandbox policy contract (`allow`/`deny` + reason) and fail-closed defaults.
- [x] Implement `ExecutorManager` routing for host vs sandbox with a simple rollback switch (host-only mode).
- [x] Implement deterministic deny handling and deterministic sandbox-failure handling (explicit failed runs; no silent host fallback).
- [x] Persist sandbox decision metadata tied to stable IDs (`runId`, `agentId`, `sessionKey`).
- [x] Update docs (`interfaces`, `system-map`, `RELIABILITY`, `mvp-status`) with boundary ownership and rollback notes.
- [x] Add lean unit tests for routing behavior (host vs sandbox).
- [x] Add lean unit tests for policy deny behavior.
- [x] Add lean unit tests for sandbox runtime failure behavior (fail-closed).
- [x] Add lean unit tests for force-host mode behavior (sandbox-declared runs denied fail-closed).

## Explicit Deferral
- [x] TD-006 (`npm run doctor`) remains deferred.
- [x] TD-008 (full sandbox approval-state workflow) remains deferred.
- [x] TD-009 (broader reliability hardening backlog) remains deferred.

## Validation Strategy
- Keep merge gates green (`npm run check`, `npm run lint:repo`).
- Require passing lean sandbox unit tests (routing, deny, failure, rollback).
- Keep docs synchronized in the same change (`interfaces`, `system-map`, `RELIABILITY`, `mvp-status`).

## Exit Criteria
- Sandbox MVP is merged with fail-closed behavior, stable-ID-linked decision logs, and rollback switch.
- Merge gates pass and docs/debt board remain synchronized with real runtime behavior.
