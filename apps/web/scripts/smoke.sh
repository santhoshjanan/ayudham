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

node server.js &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT

for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if curl -fs "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then break; fi
  sleep 0.5
done

fail() { echo "SMOKE FAILED: $1"; exit 1; }

[ "$(curl -fs "http://127.0.0.1:$PORT/healthz")" = "ok" ] || fail "healthz"

HEADERS=$(curl -s -D - -o /dev/null "http://127.0.0.1:$PORT/poker/r/AAAAAAAAAAAA")
echo "$HEADERS" | grep -qi "content-security-policy: default-src 'self'" || fail "content security policy"
echo "$HEADERS" | grep -qi "script-src 'self' 'nonce-" || fail "script nonce"
echo "$HEADERS" | grep -qi "frame-ancestors 'none'" || fail "frame-ancestors"
echo "$HEADERS" | grep -qi "x-content-type-options: nosniff" || fail "nosniff"
echo "$HEADERS" | grep -qi "referrer-policy: no-referrer" || fail "referrer policy"
echo "$HEADERS" | grep -qi "cache-control: no-store" || fail "no-store on room pages"
echo "$HEADERS" | grep -qi "x-robots-tag: noindex" || fail "noindex on room pages"

CROSS=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: https://evil.example' \
  -d 'name=Mo&deck=fibonacci' "http://127.0.0.1:$PORT/poker")
[ "$CROSS" = "403" ] || fail "cross-origin form post was not refused (got $CROSS)"

echo "SMOKE OK"
