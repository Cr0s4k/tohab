#!/bin/sh
set -eu

# The sync server reads DATABASE_URL, but the Postgres password is delivered as a
# Docker secret, not an env var. Assemble DATABASE_URL from the secret file before
# pushing the schema and starting the server.
if [ -z "${DATABASE_URL:-}" ]; then
  if [ ! -r /run/secrets/postgres_password ]; then
    echo "tohab server: /run/secrets/postgres_password is missing or unreadable" >&2
    exit 1
  fi
  password="$(cat /run/secrets/postgres_password)"
  export DATABASE_URL="postgresql://${POSTGRES_USER:-tohab}:${password}@db:5432/${POSTGRES_DB:-tohab}"
fi

pnpm exec drizzle-kit push --force
exec node src/index.ts
