# Pearlboy Policy Intake

This document defines the CP9 guidance-intake process for Pearlboy compliance updates.

## Canonical Artifacts
- `store/shared/skills/compliance-helper-review-rules.md`
- `store/shared/skills/compliance-helper-flag-patterns.md`
- Owner: compliance + platform runtime
- Verification gate: `npm run check`

## Intake Workflow
1. Update policy guidance language in shared skills.
2. Keep examples practical for marketer follow-up conversations, not checklist-only outputs.
3. Preserve high-signal hard blocks and escalation guidance.
4. Run `npm run check`.
5. Update `docs/checkpoints/cp9-verification.md` evidence snapshot when behavior changes.

## Evidence Requirement
- Guidance updates should reference real policy rationale in plain language.
- Changes must preserve conversational review quality in Slack thread follow-ups.
