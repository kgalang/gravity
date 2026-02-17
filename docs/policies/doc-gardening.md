# Documentation Gardening Policy

Prevent entropy by treating cleanup as recurring work.

## Cadence
- Daily: update active plan and checkpoint board.
- Weekly: remove stale docs, archive completed plans, fix broken links.
- Milestone close: prune dead scripts and outdated policy text.

## Owner Checklist
1. Archive finished plans from `docs/plans/active/` to `docs/plans/completed/`.
2. Re-run `npm run lint:repo` after moving docs.
3. Confirm `AGENTS.md` still points to valid canonical docs.
4. Delete or rewrite stale instructions rather than layering contradictory notes.
