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
| The name of Traefik's Docker network | `docker network ls` |
| The name of the network shared with Postgres and Valkey | `docker network ls` |
| A DNS name pointing at the server | `dig +short <name>` |
| Traefik redirects HTTP to HTTPS | Its static configuration has `entryPoints.web.http.redirections.entryPoint.to=websecure` and `entryPoints.web.http.redirections.entryPoint.scheme=https` |
| A certificate resolver configured in Traefik | Its static configuration has a `certificatesResolvers.<name>` section |

## 3. Traefik must be the only way in

The app limits abuse per client address, and takes that address from the last entry of `X-Forwarded-For`. Two things make that trustworthy:

1. **Nothing but Traefik can reach the container.** The compose file publishes no ports and joins only Traefik's network and the data network. Do not add a `ports:` entry.
2. **Traefik writes the forwarded headers itself.** This is its default: it discards forwarded headers sent by clients unless an entrypoint sets `forwardedHeaders.insecure` or `forwardedHeaders.trustedIPs`. Check that your `websecure` entrypoint sets neither to trust the public internet.

If a CDN or another proxy sits in front of Traefik, raise `XFF_DEPTH` in `deploy/.env` by one for each, and list that proxy's addresses in Traefik's `forwardedHeaders.trustedIPs`. Get this wrong in one direction and every visitor shares one limit; in the other, a visitor can pick their own address and escape the limits.

The site's origin is fixed by `POKERJI_HOST`. The app does not consult `X-Forwarded-Host` or `X-Forwarded-Proto`.

## 4. Access logs

A room's code is in its URL path, and the code is what keeps a room private. The privacy page tells visitors that no log is kept of the pages they open. That is true only if Traefik does not log this router's requests.

- **Traefik 3.2 or later:** the compose file's label `traefik.http.routers.pokerji.observability.accesslogs=false` turns the access log off for this router only. After the first start, open a room and confirm nothing for `POKERJI_HOST` appears in Traefik's access log.
- **Older Traefik:** turn access logs off, or drop the fields that carry the path in Traefik's static configuration: `accesslog.fields.names.RequestPath=drop`, `accesslog.fields.names.RequestLine=drop`, `accesslog.fields.names.OriginalRequestPath=drop`. Confirm the field names against your version's documentation, then check the log as above.

This step is not optional. If you need request logs for this site, change the privacy page first.

## 5. Postgres

As a Postgres superuser, run `deploy/postgres-roles.sql`, choosing two different long random passwords:

```bash
psql -v db=pokerji -v owner=pokerji_owner -v app=pokerji_app -v owner_password='FIRST-PASSWORD' -v app_password='SECOND-PASSWORD' -f deploy/postgres-roles.sql
```

`pokerji_owner` owns the database and is used only by the one-shot migrate run. `pokerji_app` is what the running app uses: it can select, insert, update and delete rows, and nothing else. `pnpm check:image` proves, on a development machine, that the app role cannot create a table and that the app refuses to start when the schema is behind.

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

It must end with `IMAGE CHECK OK`. Then, on the server, from a checkout of the same commit:

```bash
docker build -t pokerji:1 .
```

Use a new tag for each release, so you can go back.

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
| `VALKEY_URL` | Connection string for the Valkey user | Yes |
| `KEY_PREFIX` | Prefix of this app's Valkey keys; must match the ACL, and end with a colon | No |
| `ADDRESS_HMAC_SECRET` | 32 or more random characters: `openssl rand -base64 48`. Changing it only resets rate-limit counters | Yes |
| `XFF_DEPTH` | 1 when Traefik is the only proxy; see section 3 | No |
| `RETENTION_DAYS` | Days of inactivity after which a room is deleted. The pages show this number | No |
| `BACKUP_ROTATION_DAYS` | How long your Postgres backups are kept. The privacy page shows this number. Empty if there are no backups | No |

## 9. First start

From the `deploy` folder:

```bash
docker compose --profile migrate run --rm migrate
```

It prints `Migrations applied.` and exits. Then:

```bash
docker compose up -d
```

Check:

1. `docker compose ps` shows `web` as `healthy` within a minute.
2. `curl -sI https://$POKERJI_HOST/` shows `content-security-policy` and `strict-transport-security` headers.
3. `curl -sI http://$POKERJI_HOST/` redirects to HTTPS.
4. In a browser, create a room. Open its link in a second browser, vote in both, and reveal. The cards should turn in both at once: that proves the WebSocket path through Traefik.
5. Nothing for this host appears in Traefik's access log (section 4).

If `web` restarts repeatedly, `docker compose logs web` gives one fixed line. "could not start" means a wrong connection string, an unreachable service, or migrations not applied.

## 10. Updating

1. Run `pnpm check:image` on a development machine at the new commit.
2. On the server, build a new tag and set `POKERJI_IMAGE` to it.
3. `docker compose --profile migrate run --rm migrate`
4. `docker compose up -d`

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
| People in a room | 50 |
| Requests per address at Traefik | 100 a second, bursts of 400 |

- A room holds 50 people, but more than 30 behind one address (one office) cannot all join within ten minutes. If that happens to you, raise `LIMITS.join` in `packages/poker-server/src/limiter.ts`.
- While the service-wide ceiling is reached, nobody can create a room until the hour's window ends. Existing rooms are unaffected.
- All limits are refused, not skipped, when Valkey is unreachable: no rooms can be created or joined until it returns. Live rooms carry on.

## 14. Sibling subdomains

A site on another subdomain of the same parent domain can set a cookie that browsers also send to this site. Host pokerji under a parent domain where every subdomain is yours, and do not give untrusted applications a sibling subdomain.

## 15. What is logged

The app writes one JSON line to its standard error for each unexpected problem, with a fixed description and nothing else: no room code, name, vote, address or error text. It writes no request log.
