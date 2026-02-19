# CP11 Plan (Demo Polish + Rehearsal)

Status: active
Owner: kevin + codex
Last Updated: 2026-02-19
Thread: cp11-demo-polish-rehearsal

## Resume Context
CP9 Pearlboy compliance bot rollout is complete and verified.

Resume evidence:
- `docs/plans/completed/2026-02-19-cp9-pearlboy-compliance-bot.md` is complete.
- `docs/checkpoints/cp9-verification.md` captures CP9 verification evidence.
- CP9 closure evidence records Pearlboy routing through the standard conversational runtime and passing `npm run check`.

## Goal
Prepare a stable, high-confidence demo flow across core product paths (`/wiggs`, `/compliance` / Pearlboy, proactive wake controls) with rehearsal scripts and operator runbooks.

## Scope Decision
CP11 focuses on polish, clear operator flow, and rehearsal readiness.

Do not expand scope to new runtime features unless required to remove demo blockers.

## CP11 In/Out
- In scope: demo scripts, operator checklists, response-format polish, and high-signal observability for live demos.
- Out of scope: major architecture changes and new product capability checkpoints.

## Work Items
- [ ] Define end-to-end demo script covering Wiggs + Pearlboy + proactive wake.
- [ ] Add operator checklist for pre-demo environment and failure fallback.
- [ ] Capture and resolve top UX rough edges from dry-run transcripts.
- [ ] Validate all checkpoint verification commands in one pre-demo run.
- [ ] Finalize CP11 checkpoint evidence in docs/checkpoints.

## Risks
- Live demo failures due to environment drift or token/scopes mismatch.
- Ambiguous operator steps during run transitions.
- Low-signal logs slowing incident response during rehearsal.

## Exit Criteria
- Demo operator can run scripted end-to-end walkthrough without ad hoc debugging.
- Rehearsal checklist is documented and repeatable.
- Required gates pass (`npm run check` + relevant verify scripts).
