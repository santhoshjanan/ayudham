# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Every behaviour in the spec works in a browser, in the designed interface ("Judges' Row", light and dark). Sound is built too: opt-in music during the countdown, a beep at its end and ticks on the reveal count. It is packaged for release: `Dockerfile`, `deploy/` and `docs/deploy.md`. Deployment is the owner's action. The behaviour spec and design direction are in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`, product facts in `PRODUCT.md`, the design system in `DESIGN.md`.

## Commands

Package manager is pnpm (Node 24+).

- Install: `pnpm install`
- All tests: `pnpm test`
- One package: `pnpm --filter @pokerji/poker-engine test`
- One file: `pnpm --filter @pokerji/poker-engine exec vitest run test/rounds.test.ts`
- One test by name: add `-t "part of the test name"` to the line above
- Typecheck: `pnpm typecheck`
- Format: `pnpm format` (check only: `pnpm format:check`)
- Dev Postgres and Valkey: `pnpm services:up` (stop: `pnpm services:down`; wipe data: `pnpm services:wipe`). They are defined in `compose.dev.yaml`; a bare `docker compose` in the repository root finds no file, on purpose, so it cannot be confused with the production file in `deploy/`. Development only; production uses existing shared services.
- `packages/poker-server` tests need those services running. Each test file uses its own throwaway Postgres schema and Valkey key prefix, so they never touch development data.
- Run the app: copy `.env.example` to `.env`, then `pnpm --filter @pokerji/web dev` and open http://localhost:5173/poker
- Web typecheck: `pnpm --filter @pokerji/web typecheck`
- End-to-end tests: `pnpm --filter @pokerji/web e2e` (builds the app and drives Chromium; first run needs `pnpm --filter @pokerji/web exec playwright install chromium`)
- Check the image as production runs it: `pnpm check:image` (needs the development services; builds the image and runs it under the database roles and Valkey user from `deploy/`)
- Deploy or update on the server: `./deploy/deploy.sh` (see `docs/deploy.md`). It reads `deploy/.env`, which is the owner's real settings file and is git-ignored: never read, print or overwrite it.
- Smoke check of a build: `pnpm --filter @pokerji/web build && pnpm --filter @pokerji/web smoke`

Dependencies: pnpm enforces a minimum release age. Do not add `minimumReleaseAgeExclude` entries to install a just-published version; pin the previous release instead.

## Architecture

- `packages/protocol`: limits, decks, and WebSocket message schemas shared by server and browser.
- `packages/poker-engine`: the room rules as a pure reducer, `apply(state, command, now)` returning `{ state, effects }`. No I/O, no clock, no framework. A host (the server) feeds it commands and carries out its effects.
- Vote secrecy is enforced in one place, `snapshotFor` in the engine. Anything that sends room state to a browser must go through it.
- `packages/poker-server`: everything that touches Postgres, Valkey, the clock or a socket, with no web framework. `RoomHost` is one live room: it owns the engine state, sends each connection its own snapshot, and carries out engine effects. `RoomRegistry` loads hosts under a Valkey lock and unloads idle ones. `attachSocket` puts one untrusted socket behind size, rate and parse checks.
- A participant's id is their session id. Saved rounds get their own generated id so a retried save cannot store a round twice.
- `report(problem)` receives fixed strings only. Never pass it, or log, room codes, names, titles, votes, tokens or client addresses.
- Rate limits fail closed when Valkey is unreachable; live rooms keep running.
- `apps/web` is a thin SvelteKit 3 shell. Rules live in the packages; a route only parses a form, calls a flow, sets a cookie and renders.
- SvelteKit 3 differences that matter here: configuration is in `vite.config.ts` (no `svelte.config.js`); hook types come from `@sveltejs/kit/hooks`; the library alias is `#lib` and imports through it carry the file extension.
- One runtime object per process lives on `globalThis` under `Symbol.for('pokerji.runtime')` (`apps/web/src/lib/server/pokerji.ts`). `apps/web/server.js`, the production entry, uses it to hand WebSocket upgrades to `createUpgradeHandler`; a Vite plugin does the same in dev.
- The owner runs and configures the reverse proxy themselves. This repository ships no proxy configuration of any kind (no Traefik labels, no nginx or Caddy files); `deploy/compose.yaml` only joins the proxy's network, and `docs/deploy.md` says what any proxy must do. Do not add proxy configuration unless asked.
- Production sets `ORIGIN` (the site's one origin), `ADDRESS_HEADER=x-forwarded-for` and `XFF_DEPTH=1`; see `deploy/compose.yaml`. Without `ORIGIN` the app works out its origin from `PROTOCOL_HEADER` and `HOST_HEADER`, and without those every form post is refused. `INSECURE_HTTP=1` is for local testing only; `server.js` refuses to start with it unless `HOST` is a loopback address, and refuses to start without `ADDRESS_HEADER` otherwise.
- Deployment is simple by default, at the owner's request: one database user, the app migrates itself at start (`MIGRATIONS=apply`), and `./deploy/deploy.sh` is `docker compose up -d --build` with the settings checked first. Keep it that way; do not add required steps or settings. The stricter set-up is optional: with `MIGRATE_DATABASE_URL` set, the script applies migrations in a one-shot run (`MIGRATE_ONLY=1`) and starts the app with `MIGRATIONS=check`, under which it refuses to start if the schema is behind.
- `apps/web/server.js` sets the base security headers on every response, because static files never reach `hooks.server.ts`. When `ORIGIN` is set it also states the site's origin on every request, in two headers of its own that it overwrites; this version of the Node adapter takes a fixed origin only at build time. The WebSocket upgrade reads `ORIGIN` directly.
- `deploy/postgres-roles.sql` and `deploy/valkey-acl.txt` are what `docs/deploy.md` tells the owner to run and what `pnpm check:image` tests. A new Valkey command or database need must be added there, or production will refuse it.
- The Content Security Policy applies to builds, not to `vite dev`. It forbids inline styles: no `style` attributes and no Svelte `transition:` or `animate:` directives in `apps/web`. The single exception, allowed by hash in `vite.config.ts`, is SvelteKit's own route announcer.
- `Referrer-Policy` must stay `same-origin`, not `no-referrer`: with `no-referrer` browsers send `Origin: null` on same-site form posts and SvelteKit refuses every form.
- The session cookie is always `Secure` outside local development. Never derive it from the request: a forwarded-protocol header must not be able to switch it off.
- WebSocket upgrades are authenticated first and rate-limited per session, not per address, so refused attempts from the same network cannot lock a team out.
- The room page reconnects forever with a backoff and never reloads itself. The server closes a connection with code 4001 when a participant has too many; the page then stops instead of reconnecting.
- Join failures must stay indistinguishable (unknown room, wrong passcode, locked out, full). Do not add a branch that answers differently.
- `packages/poker-server/src/moderation.ts` holds every moderator and member flow. Each takes an `Actor` (the room and session `resumeSession` found for this request) and checks `actor.session.moderator` itself. A route's guard (`moderatorOf` in `apps/web/src/lib/server/actor.ts`) is a convenience, never the only check.
- Form actions return `{ notice }` on success and `fail(status, { message })` on failure; pages show `notice` as a status and `message` as an alert.
- The moderator recovery secret travels in the URL fragment and is posted in a form body, so it never appears in a server log. The recovery page removes it from the address as soon as it is read, because browsers carry a fragment across a redirect. It is returned to a page once and stored only as a hash.
- A passcode change and the sign-out of non-moderators are one transaction (`setPasscodeAndSignOut`), and a join inserts its session only if the passcode is still the one it was checked against (`insertJoiningSession`, under a row lock). Keep both: together they stop anyone joining a room on an out-of-date check.
- Settings go to the live room first (`RoomHost.applySettings` checks and applies in one step and returns whether it did), then to the database, so the two never disagree.
- A room host sends at most `BROADCAST_LIMIT` snapshots at once per second and gathers the rest for the next tick, because each change costs one snapshot per person. Do not send room state outside `announce`.
- A passcode check can come back `busy` (too many Argon2 checks waiting). Refuse it like a wrong passcode but never count it as a failed guess.
- The app pings Valkey at start and refuses to start without it.
- Every moderator and member action is rate limited in its flow (`CHANGE_LIMITS` in `moderation.ts`). Add a limit with any new action: anyone can create a room and so become a moderator.
- Names are unique within a room, ignoring case, by a database index; a join retries with the next number on a clash.
- The retention period shown on pages comes from the root layout's data (`retentionDays`), never a hardcoded number.
- A room has exactly one owner (a database index enforces it): its creator, or whoever last used the moderator link. Only the owner can delete the room, replace the moderator link, or demote a moderator; `deleteRoomNow` and `regenerateRecovery` check `actor.session.owner`, and demotion is the `demoteModerator` flow on the settings page (there is no room message for it, so it works on moderators who are not connected). The moderator link is replaced each time it is used. In the live room, a joiner whose session says `owner` clears that flag from everyone else, and `transferOwnership` clears it even when the new owner is absent: the stored owner is the truth. Every other moderator power is shared.
- Bundled music is listed in `MUSIC_TRACKS` in `packages/protocol`; an id is also its file name under `apps/web/static/audio/`. Adding a track means a CC0 release by the recording's maker, the file exactly as published, and a row with its checksum in `apps/web/static/audio/LICENSES.md` (a browser test compares them). A Public Domain Mark is not enough.
- All sound goes through `apps/web/src/lib/ui/sound.svelte.ts`. It opens no audio device and requests no file while a person's sound is off; keep it that way. The toggle and volume live in local storage (`pj-sound`, `pj-volume`) and are never sent to the server.
- Browser tests give each browser context its own client address (`visitor()` in the spec files), so they do not trip the per-address rate limits. Use it for every new context.

## Design

`DESIGN.md` is the record of the visual system; read it before any UI change. It was derived from the built app, so if the two disagree, check which is wrong before changing either. The rules most often at stake:

- Colour is rationed. Pool aqua is the stage and the bands. Yellow is the one next step on a screen and moves with it (Reveal, then New round). Red is only High, Low and destructive actions, always with the word.
- No inline styles (the Content Security Policy forbids them): no `style` attributes, no Svelte `transition:`, `in:`, `out:` or `animate:`. Dynamic values go through the `cssVar` action in `apps/web/src/lib/ui/cssVar.ts`.
- Both themes are built to the same standard. Check any change in light and dark.
- The stage keeps one height through the reveal, so nothing below it moves when the cards turn.
- Roles are badges, never text beside a name.
- Tokens live in `apps/web/src/app.css`; do not add raw colours in components.
- To look at the result: with a build listening on 127.0.0.1:4398 (see `apps/web/scripts/smoke.sh` for the environment), `node scripts/capture.mjs` and `node scripts/capture-pages.mjs` from `apps/web` write screenshots of every state to `apps/web/.impeccable/review/`.
- Design work goes through the Impeccable skill. The direction contract is in `apps/web/.impeccable/surfaces/`.

## What this is

A "swiss-army knife" suite of small team tools. The first app is an interactive, realtime (WebSocket) planning poker tool.

Reference products for the first app — similar to, but not limited to:

- https://planningpokeronline.com/
- https://www.scrumpoker-online.org/en/features/

Because this is a suite, structural decisions made for planning poker (repo layout, shared UI/design tokens, realtime transport, auth/identity, deployment) should be made with a second and third app in mind rather than baked into the poker app.

## Non-negotiable: security and privacy

Security and privacy are of paramount importance and outrank feature scope and delivery speed. Treat them as design inputs from the first spec, not a hardening pass at the end:

- Every spec and plan must state its data-collection, retention, and trust-boundary decisions explicitly (what is stored, where, for how long, who can read it).
- Default to collecting and persisting the minimum needed; any new piece of user data, third-party script, analytics, or external service needs to be called out to the user for a decision, not added silently.
- Realtime messages from clients are untrusted input: authorize and validate server-side per message, not only at connection time.

## Workflow: which toolset owns what

The user has assigned each phase of work to a specific plugin. Follow this division rather than mixing them:

| Phase | Owner | How |
|---|---|---|
| Planning and execution | Superpowers | `superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:executing-plans` / `superpowers:subagent-driven-development`, with `superpowers:test-driven-development` and `superpowers:verification-before-completion` |
| UX and UI direction | Impeccable | `impeccable` skill (and the `impeccable-*` agents) for design direction, critique, polish, accessibility |
| Review | Octopus | `octo:*` reviewers — notably `octo:skills:octopus-code-review` and `octo:skills:octopus-security-audit` |

Notes:

- Octopus agents are meant to be started only when a review is explicitly called for; use them at review checkpoints, not for implementation.
- Given the security/privacy priority, a review of anything touching realtime transport, session/room access, identity, or stored data should include the Octopus security audit, not only the general code review.
