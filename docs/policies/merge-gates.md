# Merge Gates

No merge unless all gates pass.

## Required Gates
1. `npm run check` passes.
2. `docs/checkpoints/mvp-status.md` reflects checkpoint movement.
3. `docs/plans/active/*.md` has current `Last Updated` date.
4. Architecture changes include matching updates to `docs/architecture/`.

## Additional Rules
1. Any change to `store/shared/skills` must include a short rationale in the PR description.
2. Any change to `schema.sql` must include a migration note and verification query.
3. Any new runtime component must declare its boundary in `docs/architecture/interfaces.md`.
4. Tacit-knowledge ratchets in `npm run test:invariants` must stay green; do not bypass failing invariants without an explicit policy update.
