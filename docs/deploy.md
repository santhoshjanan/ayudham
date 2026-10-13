# Deploying pokerji

These notes take a server that already runs Traefik, Postgres and Valkey to a running pokerji. Follow them in order once; "Updating" covers every later release.

## 1. What you are deploying

- One container. It publishes no ports and is reached only through Traefik.
- One Postgres database with two roles: an owner that applies schema migrations, and an app role that reads and writes rows and cannot change the schema.
- One Valkey user that can touch only keys under this app's prefix.

Everything is configured through environment variables in `deploy/.env`. Nothing is stored in the image or on the container's disk.

## 2. Before you start

| You need | How to check |
|---|---|
| Traefik 3.2 or later | `docker exec <traefik container> traefik version` |
| Docker Engine 25 or later | `docker version` |
| Postgres 13 or later | `select version();` |
| The name of Traefik's Docker network | `docker network ls` |
| The name of the network shared with Postgres and Valkey | `docker network ls` |
| A DNS name pointing at the server | `dig +short <name>` |
| Traefik redirects HTTP to HTTPS | Its static configuration has `entryPoints.web.http.redirections.entryPoint.to=websecure` and `entryPoints.web.http.redirections.entryPoint.scheme=https` |
| A certificate resolver configured in Traefik | Its static configuration has a `certificatesResolvers.<name>` section |

## 3. Traefik must be the only way in

The app limits abuse per client address, and takes that address from the last entry of `X-Forwarded-For`. Two things make that trustworthy:

1. **Nothing untrusted can reach the container.** The compose file publishes no ports and joins only Traefik's network and the data network. Do not add a `ports:` entry. Any other container on those two networks can reach the app directly and claim any client address, so keep untrusted containers off both.
2. **Traefik writes the forwarded headers itself.** This is its default: it discards forwarded headers sent by clients unless an entrypoint sets `forwardedHeaders.insecure` or `forwardedHeaders.trustedIPs`. Check that your `websecure` entrypoint sets neither to trust the public internet.

If a CDN or another proxy sits in front of Traefik, raise `XFF_DEPTH` in `deploy/.env` by one for each, list that proxy's addresses in Traefik's `forwardedHeaders.trustedIPs`, and add the label `traefik.http.middlewares.pokerji-flood.ratelimit.sourcecriterion.ipstrategy.depth` with the same number so Traefik's own limit counts visitors and not the proxy.

Check that Traefik sees real client addresses over IPv6 as well as IPv4. If Docker's IPv6 is not set up, every IPv6 visitor arrives as one internal address and they all share one person's limits. A temporary `traefik/whoami` container behind the same entrypoint shows the address Traefik passes on. Get this wrong in one direction and every visitor shares one limit; in the other, a visitor can pick their own address and escape the limits.

The site's origin is fixed by `POKERJI_HOST`. The app does not consult `X-Forwarded-Host` or `X-Forwarded-Proto`.

## 4. Access logs

A room's code is in its URL path, and the code is what keeps a room private. The privacy page tells visitors that no log is kept of the pages they open. That is true only if Traefik does not log this router's requests.

- **Traefik 3.2 or later:** the compose file's label `traefik.http.routers.pokerji.observability.accesslogs=false` turns the access log off for this router only. After the first start, open a room and confirm nothing for `POKERJI_HOST` appears in Traefik's access log.
- **Older Traefik:** turn access logs off, or drop the fields that carry the path in Traefik's static configuration: `accesslog.fields.names.RequestPath=drop`, `accesslog.fields.names.RequestLine=drop`, `accesslog.fields.names.OriginalRequestPath=drop`. Confirm the field names against your version's documentation, then check the log as above.

Two more places can record the path:

- **The HTTP entrypoint.** A request for `http://` is answered by Traefik's own redirect, not by this router, so the label above does not cover it. Turn access logs off for the `web` entrypoint too (Traefik 3.2 or later: `entryPoints.web.observability.accessLogs=false` in the static configuration), or drop the path fields as for older versions. Then request `http://<host>/poker/r/AAAAAAAAAAAA` and confirm the path is in no log.
- **Tracing.** If tracing is enabled in Traefik, spans carry the path. The compose file turns tracing off for this router.

This step is not optional. If you need request logs for this site, change the privacy page first.

## 5. Postgres

As a Postgres superuser, run `deploy/postgres-roles.sql`, choosing two different passwords of letters and digits only (`openssl rand -hex 24`); other characters break a connection string. Put a space before the command, or clear it from your shell history afterwards, because it carries both passwords:

```bash
psql -v ON_ERROR_STOP=1 -v db=pokerji -v owner=pokerji_owner -v app=pokerji_app -v owner_password='FIRST-PASSWORD' -v app_password='SECOND-PASSWORD' -f deploy/postgres-roles.sql
```

`pokerji_owner` owns the database and is used only by the one-shot migrate run. `pokerji_app` is what the running app uses: it can select, insert, update and delete rows, and nothing else. `pnpm check:image` proves, on a development machine, that the app role cannot create a table and that the app refuses to start when the schema is behind.

Three settings of the shared Postgres matter to what the privacy page promises:

- **Statement logging.** With `log_statement` set to anything but `none`, or `log_min_duration_statement` set, Postgres writes names, titles and votes to its log. Even without them, a clash of two identical names in one room logs the name once as an error detail. Check both settings (`show log_statement; show log_min_duration_statement;`), and treat the Postgres log as holding personal data if either is on.
- **Reach.** In `pg_hba.conf`, allow the two roles to connect to the `pokerji` database only.
- **Connections.** `alter role pokerji_app connection limit 20;` keeps a fault in this app from using every connection the shared server has.

## 6. Valkey

`deploy/valkey-acl.txt` holds one line. Replace `PREFIX` with `pokerji` and `PASSWORD` with a long random value, and run it in `valkey-cli` as an administrator. Then make it permanent: `ACL SAVE` if Valkey is configured with an ACL file, otherwise add the same line (without `ACL SETUSER`, as a `user` line) to its configuration.

What Valkey holds for this app:

- Rate-limit counters. Their keys contain a keyed hash of the client's address, never the address, and each expires within an hour.
- A lock for each live room, held for seconds.

Nothing there needs to survive a restart. If your shared Valkey writes its data to disk, those counters are written with it and can remain in a snapshot until the next one replaces it. That is consistent with the privacy page, which describes them as short-lived and keyed by a hash; if your snapshots are kept or backed up for long, shorten that or exclude this prefix.

## 7. Build the image

On a development machine, at the commit you are releasing, with the development services running:

```bash
pnpm check:image
```

It must end with `IMAGE CHECK OK`. The check leaves the image it tested as `pokerji:check`. Ship that image, so what runs is what was checked:

```bash
docker tag pokerji:check pokerji:1 && docker save pokerji:1 | ssh <server> docker load
```

If your development machine and server have different processor types (an Apple laptop and an x86 server, for example), build on the server instead, from a checkout of the same commit, and accept that it is a rebuild. From the `deploy` folder, with `POKERJI_IMAGE=pokerji:1` in `.env`: `docker compose build`

Use a new tag for each release, so you can go back. The base image is pinned by digest in the `Dockerfile`, and pnpm by checksum in `package.json`; the `Dockerfile` says how to move to a newer base image.

## 8. Configure

```bash
cp deploy/.env.example deploy/.env && chmod 600 deploy/.env
```

| Variable | Meaning | Secret |
|---|---|---|
| `POKERJI_IMAGE` | The image tag to run, such as `pokerji:1` | No |
| `POKERJI_HOST` | The site's DNS name, without `https://` | No |
| `TRAEFIK_NETWORK` | Traefik's Docker network | No |
| `DATA_NETWORK` | The network shared with Postgres and Valkey | No |
| `TRAEFIK_ENTRYPOINT` | Traefik's HTTPS entrypoint, usually `websecure` | No |
| `TRAEFIK_CERT_RESOLVER` | The certificate resolver's name in Traefik | No |
| `DATABASE_URL` | Connection string for the app role | Yes |
| `MIGRATE_DATABASE_URL` | Connection string for the owner role; used only by the migrate run | Yes |
| `VALKEY_URL` | Connection string for the Valkey user. No database number at the end: this user may not select one | Yes |
| `KEY_PREFIX` | Prefix of this app's Valkey keys; must match the ACL, and end with a colon | No |
| `ADDRESS_HMAC_SECRET` | 32 or more random characters: `openssl rand -base64 48`. Changing it only resets rate-limit counters | Yes |
| `XFF_DEPTH` | 1 when Traefik is the only proxy; see section 3 | No |
| `POKERJI_CPUS` | CPUs the app may use, so it cannot starve the services it shares the server with | No |
| `RETENTION_DAYS` | Days of inactivity after which a room is deleted. The pages show this number | No |
| `BACKUP_ROTATION_DAYS` | How long your Postgres backups are kept. The privacy page shows this number. Empty if there are no backups | No |

## 9. First start

The short way, from the repository root on the server:

```bash
sh deploy/deploy.sh
```

It checks `deploy/.env` (present, private, complete, no example values left), checks the two networks and the image, applies migrations, starts the app, waits until it is healthy and then asks the site for a page from outside. It stops with a reason at the first thing that is wrong, and prints no setting's value. Add `--build` to build the image from the checkout first. It does the same as the steps below, which you can also run by hand.

From the `deploy` folder:

```bash
docker compose --profile migrate run --rm migrate
```

It prints `Migrations applied.` and exits. Once only, take away the app role's right to alter the record of migrations:

```bash
psql -v ON_ERROR_STOP=1 -v app=pokerji_app -f postgres-after-first-migrate.sql "<the MIGRATE_DATABASE_URL value>"
```

Then:

```bash
docker compose up -d
```

Run exactly one `web` container. Live rooms are held in its memory; a second instance would not see them.

Check:

1. `docker compose ps` shows `web` as `healthy` within a minute.
2. `curl -sI https://$POKERJI_HOST/` shows `content-security-policy` and `strict-transport-security` headers.
3. `curl -sI http://$POKERJI_HOST/` redirects to HTTPS.
4. In a browser, create a room. Open its link in a second browser, vote in both, and reveal. The cards should turn in both at once: that proves the WebSocket path through Traefik.
5. Nothing for this host appears in Traefik's access log (section 4).

If `web` restarts repeatedly, `docker compose logs web` says why in fixed words: a setting that is missing or malformed (it names the setting, never its value), Valkey unreachable, or "could not start", which means a wrong database connection string, an unreachable database, or migrations not applied.

## 10. Updating

The short way: back up the database, ship or build the new image, set `POKERJI_IMAGE`, and run `sh deploy/deploy.sh`. On an update it asks whether the database is backed up (or takes `--backed-up`), and if the new version does not become healthy it tells you the image that was running before. By hand:

1. Run `pnpm check:image` on a development machine at the new commit.
2. Back up the `pokerji` database.
3. Ship the image under a new tag (section 7) and set `POKERJI_IMAGE` to it.
4. `docker compose --profile migrate run --rm migrate`
5. `docker compose up -d`

Always run the migrate step, even when you believe nothing changed: it does nothing when there is nothing to do, and the app refuses to start if a migration is missing.

A restart closes live rooms for a few seconds. Browsers reconnect by themselves. A round whose cards were already revealed is saved; votes in a round that had not yet been revealed are lost, and the team votes again.

## 11. Rolling back

Set `POKERJI_IMAGE` to the previous tag and run `docker compose up -d`. Migrations only go forward. An older image runs against a newer schema when the migration only added things; if it does not start, restore the database from the backup taken before the update.

## 12. Backups

Back up the `pokerji` database with the rest of Postgres. Set `BACKUP_ROTATION_DAYS` to how long backups are really kept: a deleted room remains in backups for that long, and the privacy page says so using this number.

## 13. Limits you should know

| Limit | Value |
|---|---|
| Rooms created per client | 10 per hour |
| Rooms created per IPv6 /48 | 50 per hour |
| Rooms created by the whole service | 1,000 per hour |
| Join attempts per client | 30 per 10 minutes |
| Join attempts per IPv6 /48 | 150 per 10 minutes |
| People in a room | 50, or 60 counting moderators who enter a full room |
| Rounds kept per room | The newest 1,000 |
| Requests per address at Traefik | 100 a second, bursts of 400 |

- A room holds 50 people, but more than 30 behind one address (one office) cannot all join within ten minutes. If that happens to you, raise `LIMITS.join` in `packages/poker-server/src/limiter.ts`.
- While the service-wide ceiling is reached, nobody can create a room until the hour's window ends. Existing rooms are unaffected. The app logs `room creation ceiling reached` at most once every ten minutes while it lasts. Someone with a few hundred addresses can reach it on purpose; if that happens, raise `LIMITS.roomCreateAll`, at the cost of more rows an attacker can make you store.
- If the shared Valkey evicts keys under memory pressure (an `allkeys-*` policy), counters and lockouts can disappear early. Use `noeviction` or a `volatile-*` policy with enough memory.
- All limits are refused, not skipped, when Valkey is unreachable: no rooms can be created or joined until it returns. Live rooms carry on. The app logs `valkey unreachable` at most once a minute while it lasts.

## 14. Sibling subdomains

A site on another subdomain of the same parent domain can set a cookie that browsers also send to this site. Host pokerji under a parent domain where every subdomain is yours, and do not give untrusted applications a sibling subdomain.

## 15. What is logged

The app writes one JSON line to its standard error for each unexpected problem, with a fixed description and nothing else: no room code, name, vote, address or error text. It writes no request log.

## Before the first deployment

From the security audit of 2026-10-13. Each is something only you can check on the server.

1. Traefik is 3.2 or later, and after the first start neither an `https://` nor an `http://` room address appears in any Traefik log (section 4). Tracing, if you use it, shows no span for this host.
2. Traefik passes on real client addresses for IPv4 and IPv6 (section 3).
3. Postgres statement logging is off or accounted for, the two roles are confined to this database, and `BACKUP_ROTATION_DAYS` is the real figure, counting archived write-ahead logs (sections 5 and 12).
4. The Valkey user is permanent, snapshots are not kept long, and the eviction policy does not drop keys with a time to live early (sections 6 and 13).
5. No untrusted container shares Traefik's network or the data network, and no untrusted site has a sibling subdomain (sections 3 and 14).
6. `postgres-after-first-migrate.sql` has been run (section 9).
7. You have listened to the sound on a phone and a laptop.
