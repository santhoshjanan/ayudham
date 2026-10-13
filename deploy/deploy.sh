#!/bin/sh
# Builds and starts pokerji on this server, or updates it. Run it from a checkout:
#   ./deploy/deploy.sh
# It reads deploy/.env (see .env.example), and is the same as running
#   docker compose up -d --build
# in this folder, with the settings checked first and a wait for the app at the end.
set -eu
cd "$(dirname "$0")"

stop() {
  echo "STOPPED: $1"
  exit 1
}
# One setting's value, read without running the file.
setting() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2-; }

[ -f .env ] || stop "deploy/.env does not exist. Copy deploy/.env.example to deploy/.env and fill it in."
chmod 600 .env

for name in POKERJI_HOST PROXY_NETWORK DATABASE_URL VALKEY_URL; do
  [ -n "$(setting "$name")" ] || stop "$name is empty in deploy/.env"
done
for name in PROXY_NETWORK DATA_NETWORK; do
  # DATA_NETWORK may be left out when Postgres and Valkey are on the proxy's network.
  [ -n "$(setting "$name")" ] || continue
  if ! docker network inspect "$(setting "$name")" >/dev/null 2>&1; then
    echo "$name is set to \"$(setting "$name")\", and there is no Docker network with that name."
    echo "The networks on this server are:"
    docker network ls --format '{{.Name}}' | grep -v -x -E 'bridge|host|none' | sed 's/^/    /'
    stop "put the right name after $name= in deploy/.env"
  fi
done
if [ -z "$(setting ADDRESS_HMAC_SECRET)" ]; then
  grep -v '^ADDRESS_HMAC_SECRET=' .env > .env.new
  echo "ADDRESS_HMAC_SECRET=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')" >> .env.new
  mv .env.new .env && chmod 600 .env
  echo "Made a random ADDRESS_HMAC_SECRET and saved it in deploy/.env."
fi

# Only with the optional hardening: a separate database user applies the migrations.
if [ -n "$(setting MIGRATE_DATABASE_URL)" ]; then
  docker compose build web
  docker compose --profile migrate run --rm migrate || stop "migrations were not applied; nothing was started"
  # The app's own user cannot change tables, so it only checks that they are up to date.
  MIGRATIONS=check
  export MIGRATIONS
fi

docker compose up -d --build web || stop "the app could not be built or started"

echo "Waiting for the app..."
ID="$(docker compose ps -q web)"
tries=0
while [ "$tries" -lt 45 ]; do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$ID" 2>/dev/null)" = "healthy" ] && break
  tries=$((tries + 1))
  sleep 2
done
if [ "$(docker inspect -f '{{.State.Health.Status}}' "$ID" 2>/dev/null)" != "healthy" ]; then
  echo "The app says:"
  docker compose logs --no-log-prefix --tail 4 web 2>&1 | sed 's/^/    /'
  stop "the app did not start. The lines above say why."
fi

echo "RUNNING. Point your reverse proxy at  web:3000  on the network \"$(setting PROXY_NETWORK)\","
echo "for the host $(setting POKERJI_HOST). WebSockets must pass through."
