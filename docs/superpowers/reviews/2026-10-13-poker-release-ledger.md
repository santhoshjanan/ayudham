# Review ledger: release (`feat/poker-release`)

Final Octopus security audit of the whole app as deployed, and Octopus code review of the branch, 2026-10-13. No Critical findings. One High, five Medium, ten Low from the audit; three Important from the code review.

## Rulings made while executing the plan

- adapter-node 6 takes a fixed origin only at build time and ignores the `ORIGIN` variable the plan relied on. `server.js` sets two private headers from `ORIGIN` on every request and points `PROTOCOL_HEADER` and `HOST_HEADER` at them. Found by the image check. Cost if wrong: one block in `server.js`; the image check's forged-header cases fail first.
- `postgres-roles.sql` takes the owner and app role names as separate variables. Cost if wrong: none.
- An empty `BACKUP_ROTATION_DAYS` is treated as unset, because a compose file passes it that way. Cost if wrong: none.
- `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` in the build stage, after the first build hung. Cost if wrong: none.
- The test that pins the limits table was updated for the new limits. Cost if wrong: none.

## Fixed, each with a test that failed first

- High: one person could slow every room, because each message sent one snapshot per participant and moderators were exempt from the room's size. A room now sends at most 20 snapshots at once per second and gathers the rest for the next tick, and a room holds at most 60 with moderators. Tests: "sends a bounded burst of snapshots in one second", "turns even a moderator away".
- Medium: someone connected whose stored session had been dropped to make space stayed in the room after a passcode was set. Setting a passcode now signs out every non-moderator in the live room, and a join that drops a session tells the live room. Tests: "signs out someone still connected whose session is already gone", "signs out everyone who is not a moderator when asked", "tells the room when it signs someone out to make space".
- Medium: no limit on saved rounds; a script could fill the shared database. A room keeps its newest 1,000. Test: "keeps the newest rounds and deletes the rest with their votes".
- Medium, and Important in the code review: a passcode check refused for load was counted as a wrong guess, so a flood left real members locked out. Such a check is refused but not counted, and joins are also limited per IPv6 /48. Tests: "does not count a passcode check refused for load as a wrong guess", "tells a match from a wrong passcode, and both from a check refused for load", "refuses the 151st join attempt from one IPv6 /48".
- Medium: the access-log label did not cover the HTTP entrypoint, tracing or Postgres logging. Tracing is off for the router; the notes cover the other two and add them to the checks.
- Medium: the service-wide creation ceiling was silent. It is reported at most once every ten minutes. Test: "reports once when the service-wide ceiling is reached".
- Important: the site was unrouted for about 30 seconds after each start. The health check probes every two seconds while starting.
- Important: `postgres-roles.sql` broke the migrate run on Postgres 14 or older. The owner is granted the schema explicitly.
- Low, done with the rest: `ORIGIN` must be an http or https origin with a host (test: "returns nothing for an ORIGIN that parses but is not an http or https origin"); an empty forwarded port is no port (test); a last-resort handler prints a fixed line for an uncaught error; removing the passcode is rate limited (test: "counts removing the passcode against the same allowance"); the app refuses to start without Valkey (test: "refuses to start, so a wrong address or password is found at once"); a missing audio file is no longer cacheable (smoke); start-up names a malformed setting; the keep-alive time exceeds Traefik's; the app role can no longer alter the record of migrations (image check); the worker pool is larger than the Argon2 cap; CPU and log size limits in compose; `.env` files are excluded from the build at any depth; the privacy page says the owner deletes a room, lists the music choice and states the 1,000-round limit; the spec's limits table is a table again.

## Rulings on findings left as they are

- The service-wide ceiling stays at 1,000 rooms an hour. Someone with a few hundred addresses can reach it and deny room creation for the rest of the hour. Raising it lets the same person store more rows. Cost if wrong: an hour without new rooms, visible in the log. The audit's alternative, deleting rooms never used within 24 hours so the ceiling can be much higher, is a change to what the service promises and is the owner's decision.
- While a socket stays open, a session's "last seen" time does not move, so in a room with 200 sessions the longest-connected person can be the one signed out to make space. They are now told and removed cleanly. Cost if wrong: one person rejoins.

## Deferred

- Low: two simultaneous uses of the moderator link can both succeed in showing the new link (L5). Fix: swap the stored hash conditionally and proceed only if one row changed.
- Low: the base image, the Dockerfile syntax image and pnpm are not pinned by checksum (L7).
- Low: sessions do not expire while their room is in use (L10).
- Low: Valkey trouble after start is still silent; only the start is checked (L8, second half).
- Low: the Valkey user has `+evalsha`, `+ping` and `+info`; the first two are unused and the third exposes server-wide statistics. Removing them needs a check that the client still connects.
- Minor: `check-image.sh` and `smoke.sh` hang rather than fail if a "must refuse to start" case regresses.
- Minor: the Dockerfile reinstalls dependencies after any source change.
- Minor: no test opens a WebSocket with `ORIGIN` set; the unit tests cover `requestOrigin`, and the image check covers form posts.
- Informational: static files carry no Content Security Policy of their own; `/healthz` reports that the app started, not that its services are well; Traefik's rate limit does not bound audio bandwidth.

## Not verifiable here

The Traefik labels against a real Traefik; the owner's Traefik, Postgres and Valkey settings; Docker's IPv6 set-up; the audit's load figures, which are calculated and not measured; sound on real devices.
