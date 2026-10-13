# Running pokerji

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

## What the reverse proxy must do

The app and its privacy page depend on these, whichever proxy you use:

1. Terminate TLS and forward to the app over plain HTTP, WebSockets included (the live room uses one).
2. Set `X-Forwarded-For` itself and not pass on one a visitor sent. The app limits abuse per visitor address and reads it from the last entry of that header.
3. Not log this site's request paths. A room's code is in its URL and is what keeps the room private, and the privacy page says no such log is kept.

If you use your own Postgres or Valkey instead of the ones in the file, remove those services and set `DATABASE_URL` and `VALKEY_URL` on `web`.
