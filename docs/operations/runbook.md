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

## Notes
- `db/migrations/` is the source of truth for schema changes; `schema.sql` is a bootstrap snapshot.
- `seed.sql` contains workspace-specific Slack `channel_id` values. Update them before applying in a different workspace.
- Wiggs DuckDB connector path assumes local clone at `/Users/kevingalang/code/jaffle_shop_duckdb`.
