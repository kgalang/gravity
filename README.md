# Gravity

Gravity is a platform prototype for amplifying expert operators through domain-specific agents.

## Current Scope
- CP1 bootstrap scaffold (Node/TypeScript runtime, docs system, store/workspace layout).
- CP2 infra scaffold (Postgres via Docker, dbmate migrations, seed agents).
- Harness-style engineering conventions (docs-as-system-of-record, explicit merge gates, agent-quality definitions).
- Typed SQL runtime setup with Kysely + pg.

## Quickstart
1. Install dependencies: `npm install`
2. Start Postgres: `npm run db:up`
3. Apply migrations and seed data: `npm run db:apply`
4. Start runtime scaffold: `npm run dev`

## Database Commands
- Create a migration: `npm run db:new -- <migration_name>`
- Apply pending migrations: `npm run db:migrate`
- Show migration status: `npm run db:status`
- Roll back latest migration: `npm run db:rollback`
- Source of truth: `db/migrations/` (with `schema.sql` kept as a bootstrap snapshot).

## Verification
- Full checks: `npm run check`
- Repo policy checks only: `npm run lint:repo`
- Markdown checks only: `npm run lint:md`
- Tacit-invariant ratchet checks only: `npm run test:invariants`

## Key Docs
- [AGENTS.md](AGENTS.md)
- [docs/README.md](docs/README.md)
- [docs/checkpoints/mvp-status.md](docs/checkpoints/mvp-status.md)
