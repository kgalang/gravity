#!/usr/bin/env bash
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgres://gravity:gravity@localhost:5432/gravity?sslmode=disable}"

echo "Applying dbmate migrations to ${DATABASE_URL}"
dbmate \
  --url "${DATABASE_URL}" \
  --migrations-dir db/migrations \
  --schema-file schema.sql \
  --no-dump-schema \
  --wait \
  up
