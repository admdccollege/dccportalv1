#!/usr/bin/env bash
# Runs every migration and the RLS test suite against a throwaway local PostgreSQL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
DIR="$(mktemp -d)"; chmod 777 "$DIR"
AS=""; [ "$(id -u)" = 0 ] && AS="su postgres -c"
run() { if [ -n "$AS" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
run "$BIN/initdb -D $DIR/d -A trust -U postgres >/dev/null"
run "$BIN/pg_ctl -D $DIR/d -o '-p 54329 -k $DIR' -w -l $DIR/log start >/dev/null"
trap 'run "$BIN/pg_ctl -D $DIR/d -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
P="psql -h $DIR -p 54329 -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$P -f "$ROOT/supabase/tests/stub_supabase.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do $P -f "$f" >/dev/null; done
$P -c "grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role" >/dev/null
$P -f "$ROOT/supabase/tests/rls_test.sql" 2>&1 | grep -E 'ok - |FAIL|ERROR' | sed -E 's/^.*NOTICE: +//' | tee "$DIR/out"
grep -qE 'FAIL|ERROR' "$DIR/out" && { echo "Database tests FAILED"; exit 1; }
echo "All $(grep -c 'ok - ' "$DIR/out") database tests passed."
