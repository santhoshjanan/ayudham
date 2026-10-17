# Running ayudham.app

Two compose files in the repository root. Each brings up the whole app: the web app, Postgres and Valkey.

## Development

```bash
docker compose -f compose-dev.yaml up --build
```

Open http://localhost:5173/poker. Nothing to configure. Edits to the source show up without a rebuild; rebuild after changing dependencies.

## Production

`docker-compose.yaml` is a bare minimum to adapt to your server. Set three values in a `.env` file beside it (see `.env.example`):

| Setting | What to put |
|---|---|
| `ORIGIN` | The address people use, for example `https://poker.example.org` |
| `POSTGRES_PASSWORD` | Any password, letters and digits only |
| `ADDRESS_HMAC_SECRET` | 32 or more random characters: `openssl rand -hex 24` |

```bash
docker compose up -d --build
```

The app listens on port 3000 (change with `PORT`) over plain HTTP and creates its own tables. Put your HTTPS reverse proxy in front of it.

To update: pull the new code and run the same command again. Back up the Postgres volume first.

### A prebuilt image (optional)

Every push to `main` and every `v*` tag that passes CI publishes the same image to the GitHub Container Registry: `ghcr.io/<owner>/<repo>:main`, `:sha-<commit>`, and for a tag `v1.2.3` also `:1.2.3`, `:1.2` and `:latest`. To use it instead of building on the server, replace `build: .` under `web` in your copy of `docker-compose.yaml` with `image:` and that address, then `docker compose pull && docker compose up -d`. Prefer a version or `sha-` tag over `latest`, so an update happens only when you change the line. The package is private until you make it public in its GitHub settings; pulling a private one needs `docker login ghcr.io` first.

## Metrics (optional)

Off by default. Set `METRICS_PORT` on `web` and the app starts a second listener on that port that answers `GET /metrics` in the Prometheus text format, and nothing else. The public port never serves metrics: `/metrics` on port 3000 is always 404.

```yaml
    environment:
      METRICS_PORT: 9464
      # METRICS_TOKEN: ${METRICS_TOKEN:?set METRICS_TOKEN}
```

- **Keep the port on an internal network.** Do not publish it with `ports:` and do not route it through the reverse proxy. Prometheus should reach `web:9464` over a Docker network the two share. The listener answers on every network the container is attached to, so anything on those networks can read it unless you set a token.
- **`METRICS_TOKEN`** (optional, 16 or more characters) makes the listener require `Authorization: Bearer <token>`. It is a second line of defence, not a reason to expose the port. An empty value means no token: the app says at start whether a token is required, so check that line.
- **Who can read it matters.** The numbers identify no room and no person, but on a quiet service they show that someone is using it, roughly how many people, and when. Treat the port as private. If you send the metrics to a monitoring service run by someone else, the privacy page should say so.
- **`AYUDHAM_VERSION`** (optional) is shown as the `version` label of `ayudham_build_info`. Default `dev`.
- **`METRICS_HOST`** (optional) is the address the listener binds to. Default: the same as the app.
- The path is exactly `/metrics`, with no query string. If the port cannot be opened the app logs one line and runs without metrics.
- With `METRICS_PORT` unset nothing listens and no process metrics are collected. The app's own counters are a few numbers in memory and are always kept.

A Prometheus scrape job:

```yaml
scrape_configs:
  - job_name: ayudham
    static_configs:
      - targets: ['web:9464']
    # authorization:
    #   credentials: <METRICS_TOKEN>
```

Every series is a total for the whole service. No series, label or value carries a room code, a name, a title, a vote, a token or an address; label values come from short fixed lists in `packages/poker-server/src/metrics.ts`. Run one `web` instance, as elsewhere in these notes: the gauges describe that one process.

| Metric | Type | Labels |
|---|---|---|
| `ayudham_rooms_active` | gauge | |
| `ayudham_room_loads_total` | counter | |
| `ayudham_room_unloads_total` | counter | `reason`: idle, lock_lost, closed (the room was deleted, or the server is stopping) |
| `ayudham_websocket_connections` | gauge | |
| `ayudham_websocket_connections_total` | counter | |
| `ayudham_websocket_closes_total` | counter | `reason`: normal, abnormal, oversize, rate_limited, bad_message, too_many_connections, closed_by_server |
| `ayudham_websocket_upgrades_refused_total` | counter | `reason`: bad_request, auth, rate_limited, unavailable, error |
| `ayudham_websocket_messages_total` | counter | `type`: vote, clearVote, reveal, newRound, setTitle, startTimer, stopTimer, setRole, promote, removeParticipant |
| `ayudham_websocket_messages_rejected_total` | counter | `reason`: rate_limited, oversize, invalid |
| `ayudham_rate_limit_hits_total` | counter | `bucket`: create, create48, join (passcode lockouts are counted here too), join48, ws, settings, passcode, recovery, recover, history, anonymise |
| `ayudham_rate_limit_errors_total` | counter | |
| `ayudham_room_lock_wait_seconds` | histogram | |
| `ayudham_room_lock_failures_total` | counter | |
| `ayudham_room_lock_lost_total` | counter | |
| `ayudham_valkey_up`, `ayudham_postgres_up` | gauge | |
| `ayudham_http_requests_total` | counter | `route_class`: page, api, static, healthz; `status_class`: 1xx to 5xx |
| `ayudham_build_info` | gauge | `version` |
| `ayudham_metrics_errors_total` | counter | |

Any label can also read `other`, for a value the app did not expect. The standard Node process metrics (`process_*`, `nodejs_*`: CPU, memory, event-loop lag, garbage collection, open file handles) are included under their usual names, so ready-made Node dashboards work. One of them, `nodejs_version_info`, carries the exact Node version.

## What the reverse proxy must do

The app and its privacy page depend on these, whichever proxy you use:

1. Terminate TLS and forward to the app over plain HTTP, WebSockets included (the live room uses one).
2. Set `X-Forwarded-For` itself and not pass on one a visitor sent. The app limits abuse per visitor address and reads it from the last entry of that header.
3. Not log this site's request paths. A room's code is in its URL and is what keeps the room private, and the privacy page says no such log is kept.

If you use your own Postgres or Valkey instead of the ones in the file, remove those services and set `DATABASE_URL` and `VALKEY_URL` on `web`.
