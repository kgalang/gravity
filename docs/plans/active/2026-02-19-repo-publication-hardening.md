# Publication Hardening Plan

Status: active
Owner: kevin + codex
Last Updated: 2026-02-19
Thread: repo-publication-hardening

## Goal
Maintain public-repo readiness by removing sensitive references, keeping docs coherent, and preserving green merge gates.

## Scope
- Keep checkpoint taxonomy aligned through CP10.
- Remove unnecessary CP11 references and stale plan links.
- Keep `npm run check` passing after documentation updates.

## Work Items
- [x] Remove CP11 references from docs and repo lint configuration.
- [x] Delete deferred CP11 on-hold plan doc.
- [ ] Complete post-change verification and commit handoff.

## Exit Criteria
- `npm run check` passes.
- No `CP11` references remain in tracked files.
