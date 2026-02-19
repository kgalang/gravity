# CP9 Plan (Pearlboy Compliance Bot)

Status: complete
Owner: kevin + codex
Last Updated: 2026-02-19
Thread: cp9-pearlboy-compliance-bot

## Resume Context
CP8 self-authoring mutation flow is complete and verified.

Resume evidence:
- `docs/plans/completed/2026-02-19-cp8-self-authoring-runtime-loop.md` is complete.
- `docs/checkpoints/cp8-verification.md` captures the CP8 matrix and gate.
- CP8 closure evidence records passing `npm run verify:cp8` and `npm run check`.

## Goal
Deliver CP9 as a Slack-first compliance review assistant for marketing copy, named `pearlboy`.

Core outcome:
- marketing associates and copywriters can submit draft copy in Slack,
- `pearlboy` returns deterministic compliance feedback before publication,
- high-risk or uncertain cases are escalated for human compliance review.

## Scope Decision
CP9 focuses on compliance review quality, traceable policy sourcing, and Slack workflow usability for marketing copy review.

Do not expand scope to autonomous legal approval workflows, multi-agent orchestration, or post-demo governance automation.

## Initial Policy Research Track (Requested)
Research is explicitly part of CP9 and will be captured with source traceability.

Seed tracks:
- Mercury/neobank public disclaimer inventory:
  - collect and catalog disclaimer text from public Mercury legal/marketing pages,
  - extract representation constraints (for example, not representing the company as a bank),
  - capture where disclosure language is required when terms like "banking" are used.
- Fintech marketing baseline:
  - gather public fintech marketing/compliance guidance relevant to claims, disclosures, and ambiguity risk,
  - normalize those findings into deterministic review rules used by `pearlboy`.
- Source traceability contract:
  - every operational rule must include source URL, capture date, and short rationale,
  - unresolved or ambiguous rules must remain in `needs_human_review` status until approved.

## CP9 In/Out
- In scope: Slack review flow, policy-pack ingestion, phrase/disclaimer checks, structured compliance response format, escalation path, and CP9 verification harness/docs.
- Out of scope: automatic final legal sign-off, channel posting approvals, paid-ad platform integrations, and long-horizon policy lifecycle automation.

## Proposed Slack Workflow
1. Marketing user submits draft copy via `/compliance`, mention, or reply in the agent-owned review thread.
2. `pearlboy` analyzes text against rule IDs from the CP9 policy pack.
3. Response includes:
   - verdict (`pass`, `needs_revision`, or `block`),
   - exact flagged phrases and reasons,
   - required disclaimers and placement notes,
   - safer rewrite suggestion,
   - escalation marker when uncertainty is high.
4. Run logs retain stable IDs (`agentId`, `sessionKey`, `runId`) plus rule IDs used in the decision.

## Rule-Pack Contract (Draft)
Each compliance rule should remain deterministic and auditable:
- `ruleId` (stable),
- `category` (representation, disclosure, certainty-claim, eligibility, etc.),
- `severity` (warn/block),
- `triggerPattern` (literal/regex/semantic marker),
- `requiredDisclosure` (if applicable),
- `source` metadata (URL + captured date),
- `owner` (`compliance`).

## Work Items
- [x] Reposition existing `compliance-helper` behavior as `pearlboy` while preserving `/compliance` access.
- [x] Define CP9 runtime boundary contracts in `docs/architecture/interfaces.md` before checkpoint close.
- [x] Build CP9 policy-source intake process with traceability metadata.
- [x] Collect Mercury/neobank disclaimer and representation constraints from public sources.
- [x] Collect fintech marketing rule sources and normalize into deterministic rules.
- [x] Implement phrase-level checks for representation/disclosure/certainty risks.
- [x] Implement disclaimer-presence and placement checks (including "banking" terminology guardrails).
- [x] Emit structured review responses with verdict, flags, disclaimers, and revised copy.
- [x] Add deterministic escalation status for unknown/ambiguous rule coverage.
- [x] Add `npm run verify:cp9` harness and maintain `docs/checkpoints/cp9-verification.md`.
- [x] Update runbook/operations docs for marketing workflow and owner escalation path.
- [x] Update checkpoint board/docs index links as CP9 progresses.
## Verification Matrix Seeds (for `docs/checkpoints/cp9-verification.md`)
- Policy traceability: every active rule maps to at least one source URL + capture date.
- Representation guardrail: copy cannot present company as a bank.
- "Banking" disclosure guardrail: flagged unless required disclaimer is present and visible.
- Claim certainty guardrail: absolute/guaranteed claims are flagged with revision guidance.
- Structured response contract: verdict/flags/disclosures/rewrite fields always present.
- Escalation guardrail: unknown rule domains route to `needs_human_review`.
- Stable-ID observability: review runs retain `agentId`, `sessionKey`, and `runId`.

## Closed Decisions (2026-02-19)
- CP9 is the compliance bot rollout checkpoint.
- Bot name for this track is `pearlboy`.
- Slack is the primary interaction surface for marketing review.
- Human compliance owner remains final authority; bot output is pre-publish guidance, not legal sign-off.

## Open Decisions To Close Early
- Exact canonical disclaimer text(s) and required placement thresholds by channel type.
- Whether CP9 launches with warn-only mode first or immediate block mode for severe violations.
- Whether policy sources are persisted only in skills/docs or also in a structured store artifact.

## Risks
- Policy drift if source updates are not tracked with capture date and refresh cadence.
- False negatives can create legal/compliance exposure.
- False positives can slow marketing iteration and reduce trust in the assistant.
- Ambiguous wording can produce inconsistent guidance without deterministic rule IDs.

## Exit Criteria
- Marketing users can submit copy in Slack and receive deterministic, structured compliance review.
- Mercury/neobank disclaimer constraints and broader fintech marketing constraints are codified with source traceability.
- Representation/disclosure/certainty guardrails are test-covered, including "bank" and "banking" scenarios.
- Escalation path exists for uncertain cases.
- `npm run verify:cp9`, `npm run check`, and `npm run lint:repo` pass.

## Verification Evidence (2026-02-19)
- `npm run verify:cp9` passed (`policy_traceability=true, representation_guardrail=true, banking_disclosure_guardrail=true, certainty_claims=true, escalation_guardrail=true, stable_id_observability=true, structured_response_contract=true`).
- `npm run test:unit` passed with CP9 runtime coverage (`tests/runtime/pearlboy-compliance-review.test.ts`).
- `npm run check` passed after CP9 runtime, policy-pack, and docs updates.
