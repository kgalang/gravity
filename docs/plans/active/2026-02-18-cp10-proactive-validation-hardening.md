# CP10 Plan (Proactive Validation + Hardening)

Status: active
Owner: kevin + codex
Last Updated: 2026-02-18

## Goal
Close CP10 by validating proactive trigger behavior end to end and hardening replay/manual controls for reliable demo operation.

## Scope Decision
CP10 work now focuses on runtime validation and operational seams around existing `cron`/`heartbeat` execution. Do not expand agent capability scope beyond proactive reliability and control paths.

## CP10 In/Out
- In scope: live proactive trigger validation (`channel_thread` + `dm` delivery), replay/backfill behavior, manual wake trigger tooling, and quiet-hours verification.
- Out of scope: CP6 session compaction internals, CP7 memory test matrix expansion, and CP11 demo polish scripting.

## Work Items
- [ ] Define CP10 validation matrix for proactive `cron` and `heartbeat` triggers across delivery modes.
- [ ] Validate proactive run logging parity in `gravity.runs` (`trigger_kind`, `entrypoint`, `status`, `source_event_id`, `session_key`).
- [ ] Validate delivery behavior for `channel_thread` (root thread + threaded response) and `dm`.
- [ ] Implement and validate replay/backfill behavior for missed proactive runs after restart.
- [ ] Implement manual wake tooling for deterministic demo invocation of heartbeat trigger paths.
- [ ] Add quiet-hours policy checks and verify suppression behavior.
- [ ] Update architecture/runbook/checkpoint docs for proactive operational controls and rollback path.

## Risks
- Scheduler replay semantics can create duplicate or missed proactive deliveries if idempotency boundaries are unclear.
- Quiet-hours logic may suppress expected demo runs if timezone and schedule assumptions are inconsistent.
- Manual wake tooling can bypass safeguards unless it reuses the same trigger normalization and idempotency path.

## Exit Criteria
- `cron` and `heartbeat` proactive triggers are validated live for both `channel_thread` and `dm` deliveries.
- Replay/backfill and manual wake behavior are implemented and verified.
- Quiet-hours policy is enforced and documented.
- `npm run check` passes.
- Checkpoint/docs state updated in the same change.
