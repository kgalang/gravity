# Bootstrap Plan (CP1 + CP2)

Status: active
Owner: kevin + codex
Last Updated: 2026-02-17

## Goal
Create a runnable repo baseline aligned with `mvp_requirements.md` and harness engineering practices.

## Work Items
- [x] Create Node/TypeScript runtime skeleton with a no-crash `npm run dev` entrypoint.
- [x] Create `store/` and `workspace/` directory contracts.
- [x] Add Postgres infra files (`docker-compose.yml`, `db/migrations`, `schema.sql`, `seed.sql`, `db-apply.sh`).
- [x] Add concise `AGENTS.md` map and system-of-record docs scaffold.
- [x] Add repository lint checks for docs and checkpoint discipline.
- [x] Verify runtime and policy checks in this environment.
- [x] Verify Postgres startup and schema apply in this environment.

## Risks
- Docker daemon may not be available on this machine.
- Dependency versions may drift and require lockfile refresh.

## Exit Criteria
- `npm run dev` starts cleanly.
- `npm run check` passes.
- `npm run db:up && npm run db:apply` succeeds.
