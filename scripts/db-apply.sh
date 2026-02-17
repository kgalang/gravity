#!/usr/bin/env bash
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgres://gravity:gravity@localhost:5432/gravity?sslmode=disable}"

echo "Applying migrations to ${DATABASE_URL}"
bash scripts/db-migrate.sh

echo "Applying seed.sql to ${DATABASE_URL}"
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f seed.sql

echo "Database setup complete."
