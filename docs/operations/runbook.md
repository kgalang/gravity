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

## Notes
- `db/migrations/` is the source of truth for schema changes; `schema.sql` is a bootstrap snapshot.
- `seed.sql` contains workspace-specific Slack `channel_id` values. Update them before applying in a different workspace.
- Wiggs DuckDB connector path assumes local clone at `/Users/kevingalang/code/jaffle_shop_duckdb`.
- Slack setup requirements (Socket Mode, scopes, events, App Home DM input, slash commands) are documented in `docs/operations/slack-app-setup.md`.
