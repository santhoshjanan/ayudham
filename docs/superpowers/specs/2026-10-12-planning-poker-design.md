# Planning Poker — Design

Date: 2026-10-12
Status: awaiting review

## 1. Purpose

A public, free, realtime planning poker service. It is the first tool in a suite of small team tools ("pokerji"). Anyone can create a room, share its link, and estimate stories with their team without signing up.

Security and privacy outrank feature scope and delivery speed. Every choice below that stores, transmits or exposes data is deliberate.

### Success criteria

- A team can go from opening the site to a revealed round in under a minute, with no account.
- No participant, moderator included, can learn another person's vote before reveal.
- The service stores only what this document lists, for no longer than it states.
- The whole service is one container next to an existing Postgres and Valkey.

### Out of scope for v1

Accounts and sign-in; a story backlog; CSV import/export; Jira, GitHub or other integrations; end-to-end encryption; languages other than English; running more than one app instance; a suite shell beyond a minimal home page.

## 2. Architecture

### Stack

- TypeScript throughout, on the current Node LTS.
- SvelteKit (latest stable, Svelte 5) with the Node adapter. Pages are server-rendered and each surface has its own URL.
- WebSockets via the `ws` library, attached to the same HTTP server through a custom Node entry file that also mounts SvelteKit's handler. One process, one port.
- Postgres for rooms, sessions and round history.
- Valkey for rate-limit counters and the per-room instance lock.
- pnpm workspaces.

### Repository layout

```
apps/web               SvelteKit app: all suite routes, custom server entry,
                       WebSocket endpoint, persistence, retention job
packages/poker-engine  room rules as plain TypeScript; no framework, no I/O
packages/protocol      WebSocket message schemas shared by server and browser
packages/ui            design tokens and shared Svelte components
```

`poker-engine` takes commands and returns new state plus events. It knows nothing about sockets, cookies or SQL, so it is testable in isolation. `apps/web` owns all I/O. Later suite tools add routes to `apps/web` and their own engine package.

### Pages

| URL | Surface |
|---|---|
| `/` | Suite home listing the tools |
| `/poker` | Create a room |
| `/poker/r/<code>` | Join form, then the live room |
| `/poker/r/<code>/history` | Past rounds |
| `/poker/r/<code>/settings` | Moderator settings |
| `/poker/r/<code>/recover` | Moderator recovery (secret in URL fragment) |
| `/poker/r/<code>/ws` | WebSocket endpoint |
| `/privacy` | What is stored and for how long |

All responses carry `Referrer-Policy: same-origin`, so a room link is never sent to another site (`no-referrer` cannot be used: it makes browsers send `Origin: null` on same-site form posts, which the cross-site check refuses). All `/poker` responses also carry `X-Robots-Tag: noindex` and `Cache-Control: no-store`.

### Deployment

- One container image containing the server and built assets.
- The owner's existing reverse proxy terminates TLS and routes to the container. The owner configures that proxy; this project ships no proxy configuration, only what the proxy must do (`docs/deploy.md`). The app speaks plain HTTP inside Docker.
- The container joins the existing shared Docker network to reach Postgres and Valkey. It publishes no ports to the host.
- A dedicated Postgres database and role, with no rights on other databases.
- A dedicated Valkey ACL user restricted to the `pokerji:` key prefix.
- Configuration and secrets come from environment variables only.
- The client address is read from the last entry of the proxy's `X-Forwarded-For`. The container publishes no ports and sits only on the proxy's network and the data network, so only what is on those networks can reach it; the app does not check the sender's address itself. The site's origin is fixed by `ORIGIN`, which the entry file states on every request, so forwarded host and protocol headers are never trusted.
- The app's database role cannot change the schema; migrations are applied by a one-shot run of the same image under a separate owner role, and the app refuses to start if the schema is behind.
- The image runs as a non-root user on a read-only filesystem with all capabilities dropped.
- Deployment notes must state that the proxy's access logging for this site should be disabled or have the request path redacted, because the room code is in the path.

### Scaling position

v1 runs one instance. Each live room is claimed by an instance through a Valkey lock with a heartbeat. That lock is the hook for adding instances later without changing the client protocol; multi-instance routing itself is not built.

## 3. Room and security model

### Identifiers and secrets

| Item | Form | Stored as |
|---|---|---|
| Room code | 12 random characters from `[A-Za-z0-9]` (~71 bits), from a CSPRNG | Plain (it is the lookup key) |
| Session token | 256 random bits in a cookie | SHA-256 hash |
| Moderator recovery secret | 256 random bits, shown once in a link fragment | SHA-256 hash |
| Passcode (optional) | Chosen by the moderator, 8–64 characters | Argon2id hash |

The room link is the secret. The optional passcode is a second factor the moderator can add.

### Session cookie

One cookie per room: `HttpOnly`, `Secure` (always, except in local development; never derived from a request header), `SameSite=Lax`, `Path=/poker/r/<code>`, rolling 30-day lifetime. `Lax` rather than `Strict` so that following an invite link from a chat app still presents an existing session. Cross-site request forgery is covered by SvelteKit's origin check on form posts and an explicit `Origin` check on the WebSocket upgrade.

### Roles

A session is a voter or a spectator, and may additionally be a moderator. The room creator is a moderator. Moderators can promote others, so a room is not stuck when its creator is away.

### The owner

Every room has exactly one owner. The person who creates the room is its owner.

- Only the owner can delete the room, make a new moderator link, or take moderator rights away from someone.
- The owner is always a moderator and cannot be demoted or removed.
- Using the moderator link makes that person the owner. Whoever was the owner stays a moderator.
- A moderator must be demoted by the owner before they can be removed from the room.
- The owner demotes from the settings page, which lists the room's moderators. It works whether or not that person is connected, because a moderator who has left the room can still change settings.
- A moderator link works once. Using it replaces it, and the new link is shown once to the new owner. A copy of a used link is worth nothing.
- The owner's session is never deleted by removal, by a passcode change, or to make room in a full room.
- Everything else a moderator can do, every moderator can do: run rounds, change settings and the passcode, promote, and remove people who are not moderators.

This replaces the earlier arrangement in which all moderators were equal and none could be demoted.

| Action | Moderator | Voter | Spectator |
|---|---|---|---|
| Vote | If also a voter | Yes | No |
| See who has voted before reveal (not values) | Yes | Yes | Yes |
| Set story title, reveal, new round, start/stop timer | Yes | No | No |
| Change deck, timer length, music track, passcode | Yes | No | No |
| Remove a participant, promote a co-moderator | Yes | No | No |
| Delete a round, all history, or the room | Yes | No | No |
| Switch self between voter and spectator | Yes | Yes | Yes |
| Anonymise own past votes | Yes | Yes | Yes |

### Vote secrecy

Before the Revealed phase, including during the reveal count, the server never sends a vote value to anyone except the person who cast it. This holds for moderators and spectators. It is enforced where snapshots are built, and covered by a dedicated test.

### Joining

1. `/poker/r/<code>` without a valid session renders a join form: display name (1–30 characters), voter or spectator, and a passcode field. Names are compatibility-normalised, must contain a letter or digit, and may not contain invisible or direction-changing characters. A name already in use in the room, ignoring case, is given a number ("Mo 2"), so nobody can pose as someone else; the database enforces this, so it holds even when people join at the same instant. The name "Anonymous" is reserved.
2. The form and its failure response are identical whether the room does not exist, has no passcode, or the passcode is wrong. Room existence is never disclosed.
3. On success the server creates a session, sets the cookie and redirects to the room.
4. The join form states: votes are recorded under the display name you enter and kept for 30 days after the room's last use.

### Moderator recovery

Room creation shows a recovery link once: `/poker/r/<code>/recover#m=<secret>`. The fragment is not sent to the server on navigation; the page posts it in a request body. A valid secret sets the moderator flag on the caller's session. Moderators can regenerate the secret in settings, which invalidates the old link. Regenerating does not remove moderator rights from anyone who already used the old link. The page that receives the link removes the secret from the address as soon as it has read it, and the pages that show the link show a full address.

### Removing someone

Removal deletes the session and closes its socket. The live room also refuses that session from then on, so the removal holds even if the database write is delayed. A moderator cannot remove themselves or another moderator, and nobody can be removed during the three-second reveal count. In a room without a passcode that person can rejoin through the link; the removal dialog says so and offers to set a passcode. Changing or setting a passcode deletes all non-moderator sessions, as one step with the change, so nobody who was joining at that moment stays in without it. Changing or removing the passcode clears the room's count of failed guesses.

### Abuse limits

Defaults, all configurable:

| Limit | Value |
|---|---|
| Room creations per client | 10 per hour |
| Room creations per IPv6 /48 | 50 per hour |
| Room creations by the whole service | 1,000 per hour |
| Join attempts per client | 30 per 10 minutes |
| Passcode failures per client per room | 5 per 10 minutes |
| Passcode failures per room, all clients | 50 per hour |
| WebSocket messages per participant, across all their connections | 30 per 10 seconds |
| Connections per participant | 4; a fifth closes the oldest, which is told why and does not reconnect |
| WebSocket connections per session | 60 per minute, counted after the session is verified |
| Moderator changes, per room | Settings 60 per 10 minutes; passcode 5 per 10 minutes; new moderator link 10 per hour; history deletions 120 per 10 minutes |
| Moderator-link attempts, per session | 30 per 10 minutes |
| Remove-my-name requests, per session | 20 per 10 minutes |
| History shown | The newest 200 rounds |
| Passcode checks at once | 4 running and 64 waiting; any more are refused like a wrong passcode, but are not counted as a failed guess |
| Join attempts per IPv6 /48 | 150 per 10 minutes |
| Rounds kept per room | The newest 1,000; older rounds are deleted with their votes |
| Snapshots sent per room | 20 at once per second; further changes are gathered and sent together within 250 ms |
| Session lifetime | A session not used for the retention period is deleted by the hourly job, except the owner's. Past votes keep the name |
| Sessions per room | 200; when full, the non-moderator seen longest ago is signed out to make room |
| Participants per room | 50. A moderator can enter a full room, up to 60 in all |
| WebSocket message size | 2 KB |
| Story title length | 200 characters |
| Custom deck | up to 20 cards, 4 characters each |

The service-wide ceiling protects the database from a flood from many addresses. While it is reached, nobody can create a room until the hour's window ends; existing rooms are unaffected, and the app reports it once every ten minutes.

Limits are keyed in Valkey by an HMAC of the client address with a server secret, with a TTL matching the window. The address is never written to Postgres or logs.

### Browser hardening

- Content Security Policy via SvelteKit with per-request nonces; `default-src 'self'`; no third-party origins for scripts, styles, fonts, images, media or connections.
- `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, HSTS.
- Display names, titles and card values are rendered as text only. No `{@html}` on user input.
- No analytics, trackers, external fonts or third-party scripts.

## 4. Realtime protocol

### Connection

After joining, the room page opens a WebSocket to `/poker/r/<code>/ws`. The upgrade is accepted only with a valid session cookie for that room and an `Origin` equal to the site's origin. The server sends a snapshot immediately.

### Authority

The server is the only authority. Each incoming message is checked against its schema, the sender's role and the round's state. Invalid or unauthorized messages are dropped and count against the rate limit; repeated offences close the connection.

### Messages

Browser to server: `vote`, `clearVote`, `setRole` (voter/spectator), `setTitle`, `reveal`, `newRound` (keep or clear title), `startTimer`, `stopTimer`, `removeParticipant`, `promote`.

Server to browser: `snapshot` (full room state for that recipient), `timerExpired`, `removed`, `error`.

A snapshot is sent to every connection after every state change. It contains the participant list with role, presence and has-voted flags; the title; the deck; the round phase; the server's current time; the reveal time and timer deadline; the recipient's own vote; and, once revealed, all votes and statistics. Full per-recipient snapshots are used instead of incremental updates because rooms are small.

Settings changes and deletions are form posts on the settings and history pages. After one succeeds, the server pushes a fresh snapshot to the room.

### Round lifecycle

- **Voting.** Votes and the title live in memory only. Voters may change or clear their vote.
- **Counting.** When a moderator sends `reveal`, votes lock and the server sets a reveal time three seconds ahead. Snapshots carry the phase and that time, and still no vote values. A running timer is stopped. The count cannot be cancelled. At the reveal time the server moves to Revealed.
- **Revealed.** All values are shown with statistics: average, lowest, highest, distribution, and whether the vote was unanimous. Lowest, highest and unanimity are taken from the order of the deck's value cards, so they work for non-numeric decks such as T-shirt sizes. The average is given only when every value card voted is a number. Special cards (`?`, break) appear in the distribution and in nothing else. The people holding the lowest and highest cards are identified unless the vote was unanimous. The round is written to Postgres at reveal. A reveal with no votes is not saved.
- **New round.** Clears votes and returns to voting. Not available during the count.

The story title can be changed only during voting. It is a single line of up to 200 characters, with no control characters or text-direction overrides.

### Decks

A deck is an ordered list of value cards, lowest first, plus a list of special cards. Built in: Fibonacci, modified Fibonacci, T-shirt sizes, powers of two; each has the special cards `?` and a break card. A moderator can define a custom deck with at least two value cards. Cards may contain letters, digits, punctuation and symbols only: no spaces, invisible or control characters, combining marks or text-direction overrides. Two cards that look the same after Unicode normalisation count as duplicates. Changing the deck is allowed only between rounds: after a reveal, or during voting before anyone has voted. A deck change starts a new round and keeps the title.

### Timer

Optional. A room has no timer until the moderator sets a length (10 seconds to 10 minutes). The moderator chooses each round whether to start it. The server holds the deadline; browsers draw the countdown from it. On expiry the server sends `timerExpired`. Reveal is never automatic.

### Music and sound

- The moderator picks one bundled track for the room, or none.
- Each person has a sound toggle, off by default. Nothing plays for a person who has not turned it on. Volume and the toggle are kept in that browser's local storage and never sent to the server.
- Music loops only while the countdown runs.
- The music fades out over the last two seconds of the countdown, so it is silent when the countdown reaches zero, and at zero a short telegraph-style beep sounds (three short tones and one long). The beep is synthesised in the browser with the Web Audio API; it is not an audio file.
- The track starts from its beginning each time the countdown starts, and for a person who turns sound on part-way through.
- If the moderator stops the timer or reveals early, the music fades out over about two seconds with no beep.
- During the three-second reveal count, each beat has a soft synthesised tick for people with sound on.
- Tracks are recordings released under CC0 by whoever made the recording; a Public Domain Mark alone is not accepted. The four bundled tracks are Chopin's Nocturne Op. 9 No. 2 and Waltz Op. 64 No. 1 (Musopen) and the Aria and Variation 1 of Bach's Goldberg Variations (Kimiko Ishizaka). Each track's source, licence and checksum is recorded in `apps/web/static/audio/LICENSES.md`, and a browser test checks each served file against its row. Files are MP3, served by the app, and fetched only for a person who has sound on, in a room that has a track, while a countdown runs.
- In a page the person has not yet touched (a newly opened tab with sound already on), nothing is played or queued; sound starts at their first click, tap or key press. Turning sound off closes the audio device.
- Music stops at once for someone who is removed from the room.
- The sound toggle is in the site bar while in a room, with a volume slider beside it on wider screens. Turning sound on plays one tick as confirmation.

### Theme

Light and dark themes. The first visit follows the device preference; a toggle overrides it. The choice is kept in that browser's local storage and never sent to the server. It is applied before first paint by a small inline script carrying the page's CSP nonce.

### Presence, reconnects and restarts

- A dropped connection marks the participant away and keeps their vote. The browser reconnects with increasing delays and shows a banner meanwhile.
- A participant away for ten minutes is dropped from the live list. Their session remains valid.
- A room unloads from memory five minutes after its last connection closes, releasing its lock.
- A server restart loses unrevealed votes and the current title of rounds in progress. This is intended: they are never written to disk.

## 5. Data and retention

### Postgres

| Table | Columns of note |
|---|---|
| `rooms` | internal id, code (unique), deck, timer length, music track, passcode hash, recovery secret hash, created, last active |
| `sessions` | id, room, token hash, display name, role, moderator flag, last seen |
| `rounds` | id, room, title, revealed at |
| `votes` | round, session (nullable), voter name (nullable), card value |

Votes carry a copy of the voter's name so history survives the session being removed. Deleting a room cascades to everything under it.

### Valkey

Rate-limit counters and room locks under the `pokerji:` prefix. No names, titles or votes.

### Never stored

- Unrevealed votes and the title of a round in progress.
- Client addresses, in Postgres or logs.
- Room codes, display names, titles and vote values in logs. Logs refer to rooms by internal id.

### Deletion

- **Automatic.** An hourly job hard-deletes rooms whose last activity is more than 30 days old. Activity means someone joined, a round was revealed, or the settings were changed.
- **Moderator.** Delete one round, clear all history, or delete the room. Immediate.
- **Participant.** "Remove my name from history" clears the voter name on their votes in that room; they show as "Anonymous". It works only for votes cast under the session they are using now. Someone who was removed, or signed out by a passcode change, comes back as a new participant and cannot reach their earlier votes; a moderator can delete those rounds for them. The privacy page says so.

Deleted data persists in Postgres backups until they rotate. The rotation period is a configured value shown on the privacy page.

### Privacy page

Plain-language statement of: what is stored, for how long, who can see it, the one functional cookie per room, local-storage use for sound and theme preferences, backup rotation, and the absence of analytics and third parties.

## 6. Failure behaviour

| Failure | Behaviour |
|---|---|
| Postgres unavailable | Room creation and joins fail with a clear page. Live rounds continue. A reveal that cannot be saved is marked "not saved" in the room and retried every five seconds for ten minutes, then abandoned and reported. Removals, promotions and role changes are retried the same way. On shutdown one last attempt is made to save what is queued. |
| Valkey unavailable | Room creation, joins and passcode attempts are refused, because limits cannot be enforced. Rooms already live continue. |
| Invalid or unauthorized message | Dropped; repeated offences close the connection. |
| Unknown room or wrong passcode | Same generic response. |
| Connection lost | Banner and automatic reconnection, retried for as long as it takes at intervals up to 15 seconds. The page never reloads itself. If the session no longer exists, the join form is shown. |
| Audio blocked or fails to load | Silent; the countdown is unaffected. |

## 7. Testing

- **Engine unit tests:** round lifecycle, statistics, timer, deck rules.
- **Authorization matrix:** every message type as every role, asserting only permitted ones change state.
- **Vote secrecy:** multi-client tests asserting no pre-reveal snapshot contains another person's vote value.
- **Integration:** the server against real Postgres and Valkey from Docker Compose, covering create, join, passcode, indistinguishable failures, rate limits, recovery, removal, anonymisation, deletion and the retention job.
- **End to end:** Playwright with two browsers through a full round, including timer expiry.
- **Process:** test-first. UI direction through Impeccable. Octopus code review at checkpoints and an Octopus security audit before first deployment.

## 8. Development environment

Docker Compose provides local Postgres and Valkey for development and CI. Production uses the existing shared services; nothing in the repo starts databases in production.
