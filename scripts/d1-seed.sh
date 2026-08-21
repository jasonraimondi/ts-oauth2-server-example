#!/usr/bin/env bash
# Seed a D1 database from the local SQLite file.
#
# seed.ts needs a drizzle connection, and there is none to remote D1, so seed
# the local file first (pnpm db:migrate && pnpm db:seed) and replay its rows
# here. Tables are dumped parent-first because D1 enforces foreign keys.
#
#   scripts/d1-seed.sh --local     # the wrangler dev database
#   scripts/d1-seed.sh --remote    # the deployed database
set -euo pipefail

target="${1:---local}"
source_db="${DATABASE_URL:-file:./data/oauth.db}"
source_db="${source_db#file:}"
out="$(mktemp)"
trap 'rm -f "$out"' EXIT

for table in users oauth_scopes oauth_clients oauth_client_scopes; do
  sqlite3 "$source_db" ".dump $table" | grep '^INSERT' >> "$out"
done

pnpm exec wrangler d1 execute DB "$target" --file "$out"
