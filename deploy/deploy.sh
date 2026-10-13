#!/bin/sh
# Deploys pokerji on this server, or updates it. Run it on the server, from a checkout
# of the commit you are releasing, after docs/deploy.md sections 2 to 8 are done once
# (Traefik, the Postgres roles, the Valkey user, and deploy/.env filled in).
#
#   sh deploy/deploy.sh               use the image already loaded under POKERJI_IMAGE
#   sh deploy/deploy.sh --build       build the image from this checkout first
#   sh deploy/deploy.sh --backed-up   say the database is backed up, without being asked
#
# It checks the settings, applies migrations, starts the app and waits until it is
# healthy. It prints no setting's value. It changes nothing but this app's containers.
set -eu

cd "$(dirname "$0")"
SELF="$(basename "$0")"
ENV_FILE="${ENV_FILE:-.env}"
BUILD=0
BACKED_UP=0
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=1 ;;
    --backed-up) BACKED_UP=1 ;;
    -h | --help)
      sed -n '2,11p' "$SELF" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)"
      exit 2
      ;;
  esac
done

stop() {
  echo "STOPPED: $1"
  exit 1
}
step() { echo "== $1"; }
compose() { docker compose --env-file "$ENV_FILE" "$@"; }
# The value of one setting. Read without running the file, so nothing in it is executed.
setting() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-; }

step "Checking this machine"
command -v docker >/dev/null 2>&1 || stop "docker is not installed"
docker compose version >/dev/null 2>&1 || stop "docker compose (version 2) is not installed"
docker info >/dev/null 2>&1 || stop "the Docker daemon is not reachable by this user"

step "Checking $ENV_FILE"
[ -f "$ENV_FILE" ] || stop "$ENV_FILE does not exist. Copy .env.example to .env and fill it in."
if [ -n "$(find "$ENV_FILE" \( -perm -040 -o -perm -004 \) 2>/dev/null)" ]; then
  stop "$ENV_FILE can be read by other users. Run: chmod 600 $ENV_FILE"
fi
for name in POKERJI_IMAGE POKERJI_HOST TRAEFIK_NETWORK DATA_NETWORK TRAEFIK_CERT_RESOLVER \
  DATABASE_URL MIGRATE_DATABASE_URL VALKEY_URL ADDRESS_HMAC_SECRET; do
  value="$(setting "$name")"
  [ -n "$value" ] || stop "$name is not set in $ENV_FILE"
  case "$value" in
    *CHANGE-ME*) stop "$name still holds the example value" ;;
  esac
done
[ "$(setting ADDRESS_HMAC_SECRET | wc -c)" -gt 32 ] || stop "ADDRESS_HMAC_SECRET needs 32 or more characters"
case "$(setting POKERJI_HOST)" in
  *://* | */*) stop "POKERJI_HOST is a host name only, without https:// or a path" ;;
  poker.example.org) stop "POKERJI_HOST still holds the example value" ;;
esac
[ "$(setting DATABASE_URL)" != "$(setting MIGRATE_DATABASE_URL)" ] \
  || stop "DATABASE_URL and MIGRATE_DATABASE_URL are the same. The app must not run as the role that owns the schema."
compose --profile migrate config >/dev/null 2>&1 || stop "the compose file does not accept these settings: run 'docker compose --env-file $ENV_FILE config' to see why"

IMAGE="$(setting POKERJI_IMAGE)"
HOST="$(setting POKERJI_HOST)"
for name in TRAEFIK_NETWORK DATA_NETWORK; do
  docker network inspect "$(setting "$name")" >/dev/null 2>&1 \
    || stop "the Docker network named by $name does not exist"
done

if [ "$BUILD" = "1" ]; then
  step "Building $IMAGE from this checkout"
  compose build web || stop "the build failed"
fi
docker image inspect "$IMAGE" >/dev/null 2>&1 \
  || stop "the image $IMAGE is not on this machine. Load it (docs/deploy.md, section 7) or run again with --build."

RUNNING="$(compose ps -q web 2>/dev/null || true)"
if [ -n "$RUNNING" ]; then
  PREVIOUS="$(docker inspect -f '{{.Config.Image}}' "$RUNNING" 2>/dev/null || echo unknown)"
  step "Updating: $PREVIOUS is running"
  if [ "$BACKED_UP" != "1" ]; then
    [ -t 0 ] || stop "this is an update. Back up the database, then run again with --backed-up."
    printf 'Is the pokerji database backed up? Migrations cannot be undone. [y/N] '
    read -r answer
    case "$answer" in
      y | Y | yes | YES) ;;
      *) stop "back up the database first" ;;
    esac
  fi
else
  PREVIOUS=""
  step "First start: nothing is running yet"
fi

step "Applying migrations"
compose --profile migrate run --rm migrate \
  || stop "migrations were not applied. Nothing was started or changed. Check MIGRATE_DATABASE_URL, VALKEY_URL and that both services are reachable on the data network."

step "Starting the app"
compose up -d web || stop "the app container could not be started"

step "Waiting for it to be healthy"
ID="$(compose ps -q web)"
STATE=starting
tries=0
while [ "$tries" -lt 60 ]; do
  STATE="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$ID" 2>/dev/null || echo gone)"
  [ "$STATE" = "healthy" ] && break
  [ "$(docker inspect -f '{{.State.Restarting}}' "$ID" 2>/dev/null || echo false)" = "true" ] && break
  tries=$((tries + 1))
  sleep 2
done
if [ "$STATE" != "healthy" ]; then
  echo "The app says:"
  compose logs --no-log-prefix --tail 5 web 2>&1 | sed 's/^/    /'
  if [ -n "$PREVIOUS" ]; then
    echo "To go back: set POKERJI_IMAGE=$PREVIOUS in $ENV_FILE and run this script again."
  fi
  stop "the app did not become healthy"
fi

step "Checking it from outside, through Traefik"
if command -v curl >/dev/null 2>&1; then
  if HEADERS="$(curl -sS -m 15 -D - -o /dev/null "https://$HOST/" 2>/dev/null)"; then
    echo "$HEADERS" | grep -qi '^strict-transport-security:' \
      || echo "   WARNING: https://$HOST/ answered without the app's security headers. Is this router serving it?"
    echo "$HEADERS" | grep -qi '^content-security-policy:' \
      && echo "   https://$HOST/ is answering with the app's headers."
  else
    echo "   WARNING: https://$HOST/ did not answer. The app is healthy, so look at DNS, the certificate and Traefik's router."
  fi
  REDIRECT="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "http://$HOST/" 2>/dev/null || true)"
  case "$REDIRECT" in
    301 | 302 | 307 | 308) echo "   http://$HOST/ redirects to HTTPS." ;;
    000 | '') echo "   WARNING: http://$HOST/ did not answer." ;;
    *) echo "   WARNING: http://$HOST/ did not redirect to HTTPS (answered $REDIRECT)." ;;
  esac
else
  echo "   curl is not installed, so this was skipped."
fi

echo
echo "DEPLOYED: $IMAGE is running and healthy."
if [ -z "$PREVIOUS" ]; then
  echo
  echo "This was the first start. Three things remain, once (docs/deploy.md):"
  echo "  1. Run postgres-after-first-migrate.sql as the owner role (section 9)."
  echo "  2. Create a room, open it in a second browser, vote and reveal (section 9)."
  echo "  3. Confirm no room address appears in any Traefik log, for https and http (section 4)."
else
  echo "To go back: set POKERJI_IMAGE=$PREVIOUS in $ENV_FILE and run this script again."
fi
