# Bootstrap Runbook

## CP1 Commands
1. Install dependencies: `npm install`
2. Start scaffold runtime: `npm run dev`
3. Validate baseline checks: `npm run check`

## CP2 Commands
1. Start Postgres: `npm run db:up`
2. Apply schema + seed: `npm run db:apply`
3. Verify agents:

```sql
SELECT id, name, status, channel_id FROM gravity.agents;
```

4. Stop infra when done: `npm run db:down`

## Notes
- `seed.sql` uses placeholder `channel_id` values (`C_WIGGS`, `C_COMPLIANCE`). Replace with real Slack channel IDs before CP3.
- Wiggs DuckDB connector path assumes local clone at `/Users/kevingalang/code/jaffle_shop_duckdb`.
