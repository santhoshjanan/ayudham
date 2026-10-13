#!/bin/sh
# Starts the built app and checks that it answers with the right headers.
# Run from apps/web after `pnpm build`, with the development services up.
set -eu

PORT=4391
export PORT HOST=127.0.0.1 INSECURE_HTTP=1 PROTOCOL_HEADER=x-forwarded-proto
export DATABASE_URL="${DATABASE_URL:-postgres://pokerji:pokerji_dev@127.0.0.1:5432/pokerji}"
export VALKEY_URL="${VALKEY_URL:-redis://:pokerji_dev@127.0.0.1:6379}"
export ADDRESS_HMAC_SECRET="${ADDRESS_HMAC_SECRET:-development-only-address-hmac-secret}"
export KEY_PREFIX="smoke-$$:"

fail() { echo "SMOKE FAILED: $1"; exit 1; }

# The entry file must refuse unsafe configurations before it starts anything.
if HOST=0.0.0.0 node server.js >/dev/null 2>&1; then
  fail "INSECURE_HTTP was accepted on a public address"
fi
if (unset INSECURE_HTTP ADDRESS_HEADER; node server.js >/dev/null 2>&1); then
  fail "started without ADDRESS_HEADER"
fi

# The migrate-only run applies migrations and exits without serving.
[ "$(MIGRATE_ONLY=1 node server.js)" = "Migrations applied." ] || fail "migrate-only run"
# A schema that cannot be verified stops the app rather than letting it serve errors.
if MIGRATIONS=check MIGRATIONS_DIR="$(mktemp -d)/none" node server.js >/dev/null 2>&1; then
  fail "started with an unreadable migrations directory in check mode"
fi
export MIGRATIONS=check

node server.js &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT

for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if curl -fs "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then break; fi
  sleep 0.5
done

[ "$(curl -fs "http://127.0.0.1:$PORT/healthz")" = "ok" ] || fail "healthz"

HEADERS=$(curl -s -D - -o /dev/null "http://127.0.0.1:$PORT/poker/r/AAAAAAAAAAAA")
echo "$HEADERS" | grep -qi "content-security-policy: default-src 'self'" || fail "content security policy"
echo "$HEADERS" | grep -qi "script-src 'self' 'nonce-" || fail "script nonce"
echo "$HEADERS" | grep -qi "frame-ancestors 'none'" || fail "frame-ancestors"
echo "$HEADERS" | grep -qi "x-content-type-options: nosniff" || fail "nosniff"
echo "$HEADERS" | grep -qi "referrer-policy: same-origin" || fail "referrer policy"
echo "$HEADERS" | grep -qi "cache-control: no-store" || fail "no-store on room pages"
echo "$HEADERS" | grep -qi "x-robots-tag: noindex" || fail "noindex on room pages"
echo "$HEADERS" | grep -qi "cross-origin-opener-policy: same-origin" || fail "opener policy"

# Static files do not pass through the page hooks; they must carry the base headers too.
AUDIO=$(curl -s -D - -o /dev/null "http://127.0.0.1:$PORT/audio/bach-goldberg-var1.mp3")
echo "$AUDIO" | grep -qi "^HTTP/1.1 200" || fail "audio file not served"
echo "$AUDIO" | grep -qi "x-content-type-options: nosniff" || fail "nosniff on static files"
echo "$AUDIO" | grep -qi "cross-origin-resource-policy: same-origin" || fail "resource policy on static files"
echo "$AUDIO" | grep -qi "cache-control: public, max-age=604800" || fail "cache lifetime on audio"
RANGE=$(curl -s -o /dev/null -w '%{http_code}' -H 'Range: bytes=0-99' "http://127.0.0.1:$PORT/audio/bach-goldberg-var1.mp3")
[ "$RANGE" = "206" ] || fail "audio does not answer range requests (got $RANGE)"
MISSING=$(curl -s -D - -o /dev/null "http://127.0.0.1:$PORT/audio/nothing.mp3")
echo "$MISSING" | grep -qi "x-content-type-options: nosniff" || fail "nosniff on a missing file"

CROSS=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: https://evil.example' \
  -d 'name=Mo&deck=fibonacci' "http://127.0.0.1:$PORT/poker")
[ "$CROSS" = "403" ] || fail "cross-origin form post was not refused (got $CROSS)"

echo "SMOKE OK"
