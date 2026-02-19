# Bootstrap Runbook

## CP1 Commands
1. Install dependencies: `npm install`
2. Start scaffold runtime: `npm run dev`
3. Validate baseline checks: `npm run check`

## CP2 Commands
1. Start Postgres: `npm run db:up`
2. Apply migrations + seed: `npm run db:apply`
3. Verify agents:

```sql
SELECT id, name, status, channel_id FROM gravity.agents;
```

4. Stop infra when done: `npm run db:down`

## Migration Commands
1. Create migration file: `npm run db:new -- <migration_name>`
2. Apply pending migrations only: `npm run db:migrate`
3. Check migration state: `npm run db:status`
4. Roll back latest migration: `npm run db:rollback`

## CP5 Verification Commands
1. Ensure Postgres is running and schema is current: `npm run db:up && npm run db:apply`
2. Run CP5 verification harness: `npm run verify:cp5`
3. Run full repository gates: `npm run check`
4. Optional: inspect matrix and live SQL samples in `docs/checkpoints/cp5-verification.md`

## CP5.1 Rearchitecture Parity Commands
1. Ensure Postgres is running and schema is current: `npm run db:up && npm run db:apply`
2. Validate CP5 parity surface: `npm run verify:cp5`
3. Validate proactive parity surface: `npm run verify:cp10`
4. Run full repository gates: `npm run check`
5. Confirm active plan and decision contract: `docs/plans/active/2026-02-18-cp5-1-rearchitecture-parity.md`, `docs/architecture/rearchitecture-decision.md`

## CP10 Verification Commands
1. Ensure Postgres is running and schema is current: `npm run db:up && npm run db:apply`
2. Run CP10 verification harness: `npm run verify:cp10`
3. Run full repository gates: `npm run check`
4. Inspect CP10 matrix and evidence in `docs/checkpoints/cp10-verification.md`
5. Manual wake during live runtime: use mapped slash command text `!wake` or `!wake <trigger-id>`

## CP8 Verification Commands
1. Ensure Postgres is running and schema is current: `npm run db:up && npm run db:apply`
2. Run CP8 verification harness: `npm run verify:cp8`
3. Run full repository gates: `npm run check`
4. Inspect CP8 matrix and evidence in `docs/checkpoints/cp8-verification.md`
5. Optional runtime knobs:
   - `GRAVITY_SELF_AUTHORING_ENABLED=true|false`
   - `GRAVITY_SELF_AUTHORING_QUEUE_MAX_DEPTH=<int>=8 default`

## CP9 Verification Commands
1. Run full repository gates: `npm run check`
2. Confirm Pearlboy ingress is mapped in Slack (`/compliance`, `/pearlboy`) and replies in-thread.
3. Validate conversational follow-up behavior in-thread (ask clarifying questions after initial verdict).
4. Review/update shared compliance guidance:
   - `store/shared/skills/compliance-helper-review-rules.md`
   - `store/shared/skills/compliance-helper-flag-patterns.md`
5. Inspect CP9 matrix context in `docs/checkpoints/cp9-verification.md` when needed for historical rollout evidence.

## Notes
- `db/migrations/` is the source of truth for schema changes; `schema.sql` is a bootstrap snapshot.
- `seed.sql` contains workspace-specific Slack `channel_id` values. Update them before applying in a different workspace.
- Wiggs DuckDB resource path assumes local clone at `/Users/kevingalang/code/jaffle_shop_duckdb`.
- Slack setup requirements (Socket Mode, scopes, events, App Home DM input, slash commands) are documented in `docs/operations/slack-app-setup.md`.
