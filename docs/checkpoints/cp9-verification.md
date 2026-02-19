# CP9 Verification Matrix

Last Updated: 2026-02-19
Owner: kevin + codex
Status: complete

## Scope
Validate CP9 `pearlboy` compliance bot contracts for:
- Slack-first marketing copy review flow,
- conversational follow-up behavior in-thread,
- shared compliance guidance context for marketing-copy review,
- stable-ID observability (`runId`, `agentId`, `sessionKey`) through normal run logging.

## Matrix

| Area | Contract | Verification Command | Evidence |
| --- | --- | --- | --- |
| Conversational runtime path | Pearlboy requests use the standard model turn runtime | `npm run check` | `src/index.ts` routes `/compliance` and `/pearlboy` through `executeAgentRun` |
| Follow-up behavior | Thread replies stay conversational instead of deterministic section output | `npm run check` + Slack dry-run | No CP9 branch in `src/index.ts`; thread replies use normal message run path |
| Guidance source | Compliance posture comes from shared skill guidance files | `npm run check` | `store/shared/skills/compliance-helper-review-rules.md`, `store/shared/skills/compliance-helper-flag-patterns.md` |
| Stable-ID observability | Review runs include `agentId`, `sessionKey`, and `runId` linkage | `npm run check` | `src/runtime/run-log-store.ts`, `tests/runtime/run-log-store.test.ts` |

## Evidence Snapshot (2026-02-19)
- CP9 deterministic reviewer path was removed from active routing.
- Pearlboy now shares the same runtime flow as other agents (`executeAgentRun`).
- Repository gates pass with the simplified path (`npm run check`).
