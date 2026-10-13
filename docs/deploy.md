# Deploying pokerji

## Quick start

You need a server with Docker, a reverse proxy you already run, and Postgres and Valkey reachable on a Docker network. This project configures none of those; it starts one container and you point your proxy at it.

1. **A database.** As a Postgres superuser, with a password of letters and digits only (`openssl rand -hex 24`):

   ```sql
   create role pokerji login password 'THE-PASSWORD';
   create database pokerji owner pokerji;
   ```

2. **Settings.** Copy `deploy/.env.example` to `deploy/.env` and fill in four lines (the secret is made for you):

   | Setting | What to put |
   |---|---|
   | `POKERJI_HOST` | The site's host name, without `https://` |
   | `PROXY_NETWORK` | The Docker network your reverse proxy is on. Use the exact name `docker network ls` shows; compose adds a prefix, such as `myproject_proxy` |
   | `DATABASE_URL` | `postgres://pokerji:THE-PASSWORD@<postgres host>:5432/pokerji` |
   | `VALKEY_URL` | `redis://:<password>@<valkey host>:6379` |

   If Postgres and Valkey are on a different Docker network from the proxy, also set `DATA_NETWORK` to that network's name.

3. **Start it.** From a checkout of this repository on the server:

   ```bash
   ./deploy/deploy.sh
   ```

   It builds the image, starts the app and waits until it is healthy. The app creates its own tables. If a setting is wrong it stops and says which. It is the same as `docker compose up -d --build` in the `deploy` folder.

4. **Point your proxy at it.** Route the host name to `web`, port 3000, plain HTTP, on the proxy network. See the next section for the few things the proxy must do.

5. **Try it.** Create a room, open its link in a second browser, vote in both and reveal. The cards turning in both at once proves the WebSocket path.

To update later: pull the new code and run `./deploy/deploy.sh` again. Back up the database first; tables are changed forwards only. Live rooms drop for a few seconds and browsers reconnect; votes in a round not yet revealed are lost.

To go back: check out the previous commit and run the script again. If a newer version changed the tables and the old one will not start, restore the backup.

## What your reverse proxy must do

You set this up in your proxy. Each item is something the app or its privacy page depends on.

1. **Route the host to `web:3000`** over plain HTTP, and terminate TLS itself.
2. **Pass WebSocket upgrades through.** The live room uses one at `/poker/r/<code>/ws`.
3. **Redirect HTTP to HTTPS.**
4. **Write `X-Forwarded-For` itself, and not pass on one a visitor sent.** The app limits abuse per visitor address and reads that address from the last entry of this header. If visitors can set it, they can escape the limits; if everyone arrives with the same address, everyone shares one person's limits. With a CDN or second proxy in front, set `XFF_DEPTH` to the number of proxies.
5. **Do not log this site's request paths.** A room's code is in its URL and is what keeps the room private, and the privacy page says no log is kept of the pages a visitor opens. Check the access log, the HTTP-to-HTTPS redirect's log, and tracing if you use it. If you need those logs, change the privacy page first.

The app never trusts `X-Forwarded-Host` or `X-Forwarded-Proto`; its origin is fixed by `POKERJI_HOST`. The container publishes no ports, so only containers on its networks can reach it. Keep untrusted containers off them.

## Things worth knowing

- **Backups.** Back up the `pokerji` database with the rest of Postgres, and set `BACKUP_ROTATION_DAYS` to how long backups are really kept: a deleted room lives on in backups that long, and the privacy page says so using this number.
- **Postgres logging.** With `log_statement` or `log_min_duration_statement` on, Postgres writes names, titles and votes to its log. Check both, and treat that log as holding personal data if either is on.
- **Valkey** holds only rate-limit counters (keyed by a hash of the address, never the address, expiring within an hour) and short-lived room locks. If Valkey is down, nobody can create or join a room until it is back; live rooms carry on. Do not let it evict keys early (`allkeys-*` policies).
- **One instance.** Run exactly one `web` container. Live rooms are held in its memory.
- **Sibling subdomains.** A site on another subdomain of the same parent domain can set a cookie that browsers also send here. Do not give untrusted applications a sibling subdomain.
- **What the app logs.** One line per unexpected problem, with a fixed description and nothing else: no room code, name, vote or address. No request log. If it will not start, `docker compose logs web` in the `deploy` folder says why in fixed words.

## Limits you should know

| Limit | Value |
|---|---|
| Rooms created per client | 10 per hour |
| Rooms created per IPv6 /48 | 50 per hour |
| Rooms created by the whole service | 1,000 per hour |
| Join attempts per client | 30 per 10 minutes |
| Join attempts per IPv6 /48 | 150 per 10 minutes |
| People in a room | 50, or 60 counting moderators who enter a full room |
| Rounds kept per room | The newest 1,000 |

- A room holds 50 people, but more than 30 behind one address (one office) cannot all join within ten minutes. If that happens to you, raise `LIMITS.join` in `packages/poker-server/src/limiter.ts`.
- While the service-wide ceiling is reached, nobody can create a room until the hour's window ends. Existing rooms are unaffected. The app logs `room creation ceiling reached` at most once every ten minutes while it lasts. Someone with a few hundred addresses can reach it on purpose; if that happens, raise `LIMITS.roomCreateAll`, at the cost of more rows an attacker can make you store.
- If the shared Valkey evicts keys under memory pressure (an `allkeys-*` policy), counters and lockouts can disappear early. Use `noeviction` or a `volatile-*` policy with enough memory.
- All limits are refused, not skipped, when Valkey is unreachable: no rooms can be created or joined until it returns. Live rooms carry on. The app logs `valkey unreachable` at most once a minute while it lasts.

## Optional hardening

None of this is needed to run. Each item narrows what a fault or a break-in could do on a server shared with other applications. They were recommended by the security audit and are tested by `pnpm check:image`.

### A database user that cannot change tables

The quick start gives the app one database user that owns its tables. To split that in two, create the roles with `deploy/postgres-roles.sql` instead of the two SQL lines above (put a space before the command so the passwords stay out of your shell history):

```bash
psql -v ON_ERROR_STOP=1 -v db=pokerji -v owner=pokerji_owner -v app=pokerji_app -v owner_password='FIRST-PASSWORD' -v app_password='SECOND-PASSWORD' -f deploy/postgres-roles.sql
```

Then in `deploy/.env` set `DATABASE_URL` to the `pokerji_app` user and add `MIGRATE_DATABASE_URL` for the `pokerji_owner` user. The script sees the second setting and applies table changes in a separate one-shot run before starting the app, which then only reads and writes rows. After the first start, run once:

```bash
psql -v ON_ERROR_STOP=1 -v app=pokerji_app -f deploy/postgres-after-first-migrate.sql "<the MIGRATE_DATABASE_URL value>"
```

You can also confine both roles to this database in `pg_hba.conf`, and cap connections with `alter role pokerji_app connection limit 20;`.

### A Valkey user confined to this app's keys

`deploy/valkey-acl.txt` holds one line. Replace `PREFIX` with `pokerji` and `PASSWORD` with a long random value, run it in `valkey-cli` as an administrator, and make it permanent (`ACL SAVE`, or the same line in Valkey's configuration). Then use that user in `VALKEY_URL`: `redis://pokerji:<password>@<valkey host>:6379`, with no database number at the end.

### Checking the image before you ship it

On a development machine with the development services running, `pnpm check:image` builds the image and runs it as production would, under the roles and Valkey user above. It must end with `IMAGE CHECK OK`.

### Other settings

| Setting | Meaning |
|---|---|
| `DATA_NETWORK` | The Docker network Postgres and Valkey are on, when it is not the proxy's |
| `ADDRESS_HMAC_SECRET` | 32 or more random characters. The script makes one if it is empty. Changing it only resets rate-limit counters |
| `POKERJI_IMAGE` | The image tag to build and run. Default `pokerji:latest`. Use a new tag per release if you want to switch back without rebuilding |
| `RETENTION_DAYS` | Days of inactivity after which a room is deleted, and after which an unused sign-in ends. Default 30. The pages show this number |
| `BACKUP_ROTATION_DAYS` | How long your Postgres backups are kept. The privacy page shows it |
| `XFF_DEPTH` | Number of proxies between visitors and the app. Default 1 |
| `KEY_PREFIX` | Prefix of this app's Valkey keys. Default `pokerji:` |
| `POKERJI_CPUS` | CPUs the app may use. Default 2 |
| `MIGRATIONS` | `apply` (default) or `check`. The script sets `check` itself when `MIGRATE_DATABASE_URL` is present |
