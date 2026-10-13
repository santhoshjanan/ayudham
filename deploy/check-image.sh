#!/bin/sh
# Builds the image and proves it under the conditions of production: the roles from
# postgres-roles.sql and valkey-acl.txt, a read-only filesystem, no capabilities.
# Needs the development services: docker compose up -d --wait
# Run from the repository root: pnpm check:image
set -eu
set -f

IMAGE=pokerji:check
NET=pokerji-dev_default
DB="relcheck_$$"
KVUSER="relcheck$$"
PW="check-$(date +%s)-$$"
PORT=4393
PGPW="${POSTGRES_PASSWORD:-pokerji_dev}"

fail() { echo "IMAGE CHECK FAILED: $1"; exit 1; }
psql_admin() { docker compose exec -T -e PGPASSWORD="$PGPW" postgres psql -v ON_ERROR_STOP=1 -U pokerji "$@"; }
kv_admin() { docker compose exec -T valkey valkey-cli "$@"; }

cleanup() {
  docker rm -f pokerji-check >/dev/null 2>&1 || true
  psql_admin -d pokerji -c "drop database if exists $DB with (force)" >/dev/null 2>&1 || true
  psql_admin -d pokerji -c "drop role if exists ${DB}_app" >/dev/null 2>&1 || true
  psql_admin -d pokerji -c "drop role if exists ${DB}_owner" >/dev/null 2>&1 || true
  kv_admin ACL DELUSER "$KVUSER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker build -t "$IMAGE" . >/dev/null 2>"${TMPDIR:-/tmp}/pokerji-build.log" \
  || { tail -20 "${TMPDIR:-/tmp}/pokerji-build.log"; fail "build"; }

# The image itself.
[ "$(docker run --rm "$IMAGE" id -u)" != "0" ] || fail "runs as root"
docker run --rm "$IMAGE" sh -c 'test ! -e /app/.env && test ! -d /app/e2e && test ! -d /app/src' \
  || fail "the image carries files it should not"
docker run --rm "$IMAGE" sh -c 'test -f /app/migrations/001_init.sql' || fail "migrations missing"

# The roles and the Valkey user, exactly as the deployment notes give them.
docker compose exec -T -e PGPASSWORD="$PGPW" postgres psql -v ON_ERROR_STOP=1 -U pokerji -d pokerji \
  -v db="$DB" -v owner="${DB}_owner" -v app="${DB}_app" \
  -v owner_password="$PW" -v app_password="$PW" < deploy/postgres-roles.sql >/dev/null \
  || fail "postgres-roles.sql"
ACL=$(grep '^ACL SETUSER' deploy/valkey-acl.txt | sed "s/PREFIX/$KVUSER/g; s/PASSWORD/$PW/")
# shellcheck disable=SC2086
kv_admin $ACL >/dev/null || fail "valkey-acl.txt"

OWNER_URL="postgres://${DB}_owner:$PW@postgres:5432/$DB"
APP_URL="postgres://${DB}_app:$PW@postgres:5432/$DB"
KV_URL="redis://$KVUSER:$PW@valkey:6379"
COMMON="--network $NET --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -e VALKEY_URL=$KV_URL -e ADDRESS_HMAC_SECRET=image-check-secret-of-32-characters -e KEY_PREFIX=$KVUSER:"

# Before migrating, the app must refuse to start.
# shellcheck disable=SC2086
if docker run --rm $COMMON -e DATABASE_URL="$APP_URL" -e MIGRATIONS=check \
  -e ADDRESS_HEADER=x-forwarded-for "$IMAGE" >/dev/null 2>&1; then
  fail "started against an empty database"
fi

# The app role cannot migrate; the owner can.
# shellcheck disable=SC2086
if docker run --rm $COMMON -e DATABASE_URL="$APP_URL" -e MIGRATE_ONLY=1 "$IMAGE" >/dev/null 2>&1; then
  fail "the app role was able to change the schema"
fi
# shellcheck disable=SC2086
[ "$(docker run --rm $COMMON -e DATABASE_URL="$OWNER_URL" -e MIGRATE_ONLY=1 "$IMAGE")" = "Migrations applied." ] \
  || fail "migrate run as owner"

# The step the notes give for after the first migrate: the app may read the record of
# migrations, not change it.
docker compose exec -T -e PGPASSWORD="$PW" postgres psql -v ON_ERROR_STOP=1 -U "${DB}_owner" -d "$DB" \
  -v app="${DB}_app" < deploy/postgres-after-first-migrate.sql >/dev/null \
  || fail "postgres-after-first-migrate.sql"

# The app, as production runs it.
# shellcheck disable=SC2086
docker run -d --name pokerji-check $COMMON -p "127.0.0.1:$PORT:3000" \
  -e DATABASE_URL="$APP_URL" -e MIGRATIONS=check -e ORIGIN=https://poker.test \
  -e ADDRESS_HEADER=x-forwarded-for -e XFF_DEPTH=1 "$IMAGE" >/dev/null || fail "run"

for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40; do
  [ "$(docker inspect -f '{{.State.Health.Status}}' pokerji-check 2>/dev/null)" = "healthy" ] && break
  sleep 1
done
[ "$(docker inspect -f '{{.State.Health.Status}}' pokerji-check)" = "healthy" ] || fail "never became healthy"

FWD="x-forwarded-for: 203.0.113.9"
CREATED=$(curl -s -D - -o /dev/null -H "$FWD" -H 'Origin: https://poker.test' \
  -d 'name=Mo&deck=fibonacci' "http://127.0.0.1:$PORT/poker")
echo "$CREATED" | grep -qi "^set-cookie: pj_session=.*; Secure" || fail "room not created with a Secure cookie"
echo "$CREATED" | grep -qi "^set-cookie: pj_session=.*HttpOnly" || fail "cookie is readable by scripts"
CROSS=$(curl -s -o /dev/null -w '%{http_code}' -H "$FWD" -H 'Origin: https://evil.example' \
  -d 'name=Mo&deck=fibonacci' "http://127.0.0.1:$PORT/poker")
[ "$CROSS" = "403" ] || fail "cross-site post accepted (got $CROSS)"
# A forged forwarded host must not change what the app thinks its origin is.
FORGED=$(curl -s -o /dev/null -w '%{http_code}' -H "$FWD" -H 'Origin: https://evil.example' \
  -H 'x-forwarded-host: evil.example' -H 'x-forwarded-proto: https' \
  -d 'name=Mo&deck=fibonacci' "http://127.0.0.1:$PORT/poker")
[ "$FORGED" = "403" ] || fail "a forged forwarded host was believed (got $FORGED)"
OWNHEADERS=$(curl -s -o /dev/null -w '%{http_code}' -H "$FWD" -H 'Origin: https://evil.example' \
  -H 'x-pokerji-host: evil.example' -H 'x-pokerji-protocol: https' \
  -d 'name=Mo&deck=fibonacci' "http://127.0.0.1:$PORT/poker")
[ "$OWNHEADERS" = "403" ] || fail "the entry file's own origin headers can be set by a client (got $OWNHEADERS)"

# The app role cannot change the schema, and the Valkey user cannot leave its prefix.
if docker compose exec -T -e PGPASSWORD="$PW" postgres psql -U "${DB}_app" -d "$DB" \
  -c 'create table intruder (id int)' >/dev/null 2>&1; then
  fail "the app role created a table"
fi
if docker compose exec -T -e PGPASSWORD="$PW" postgres psql -v ON_ERROR_STOP=1 -U "${DB}_app" -d "$DB" \
  -c "delete from schema_migrations" >/dev/null 2>&1; then
  fail "the app role changed the record of migrations"
fi
kv_admin --user "$KVUSER" --pass "$PW" --no-auth-warning SET other:key 1 2>&1 | grep -q NOPERM \
  || fail "the Valkey user wrote outside its prefix"
kv_admin --user "$KVUSER" --pass "$PW" --no-auth-warning KEYS '*' 2>&1 | grep -q NOPERM \
  || fail "the Valkey user can list keys"

# Nothing private in the log, and a clean stop.
LOGS=$(docker logs pokerji-check 2>&1)
if echo "$LOGS" | grep -Eqi "203\.0\.113\.9|$PW|pj_session"; then
  fail "the log carries an address, a password or a cookie"
fi
docker stop -t 10 pokerji-check >/dev/null
[ "$(docker inspect -f '{{.State.ExitCode}}' pokerji-check)" = "0" ] || fail "did not stop cleanly"

echo "IMAGE CHECK OK"
