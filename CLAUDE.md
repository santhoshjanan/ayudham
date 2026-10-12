# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

A full round is playable in a browser. `packages/protocol`, `packages/poker-engine`, `packages/poker-server` and `apps/web` exist. The pages use plain markup; the designed interface, and the settings, history, recovery and privacy pages, are Plan 4. The behaviour spec and design direction are in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`, product facts in `PRODUCT.md`.

## Commands

Package manager is pnpm (Node 24+).

- Install: `pnpm install`
- All tests: `pnpm test`
- One package: `pnpm --filter @pokerji/poker-engine test`
- One file: `pnpm --filter @pokerji/poker-engine exec vitest run test/rounds.test.ts`
- One test by name: add `-t "part of the test name"` to the line above
- Typecheck: `pnpm typecheck`
- Format: `pnpm format` (check only: `pnpm format:check`)
- Dev Postgres and Valkey: `docker compose up -d --wait` (stop: `docker compose down`; wipe data: `docker compose down -v`). Development only; production uses existing shared services.
- `packages/poker-server` tests need those services running. Each test file uses its own throwaway Postgres schema and Valkey key prefix, so they never touch development data.
- Run the app: copy `.env.example` to `.env`, then `pnpm --filter @pokerji/web dev` and open http://localhost:5173/poker
- Web typecheck: `pnpm --filter @pokerji/web typecheck`
- End-to-end tests: `pnpm --filter @pokerji/web e2e` (builds the app and drives Chromium; first run needs `pnpm --filter @pokerji/web exec playwright install chromium`)
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
- Behind Traefik the app needs `PROTOCOL_HEADER=x-forwarded-proto`, `HOST_HEADER=x-forwarded-host`, `ADDRESS_HEADER=x-forwarded-for` and `XFF_DEPTH=1`. Without the first two, every form post is refused. `INSECURE_HTTP=1` is for local testing only; `server.js` refuses to start with it unless `HOST` is a loopback address, and refuses to start without `ADDRESS_HEADER` otherwise.
- The Content Security Policy applies to builds, not to `vite dev`. It forbids inline styles: no `style` attributes and no Svelte `transition:` or `animate:` directives in `apps/web`. The single exception, allowed by hash in `vite.config.ts`, is SvelteKit's own route announcer.
- `Referrer-Policy` must stay `same-origin`, not `no-referrer`: with `no-referrer` browsers send `Origin: null` on same-site form posts and SvelteKit refuses every form.
- The session cookie is always `Secure` outside local development. Never derive it from the request: a forwarded-protocol header must not be able to switch it off.
- WebSocket upgrades are authenticated first and rate-limited per session, not per address, so refused attempts from the same network cannot lock a team out.
- The room page reconnects forever with a backoff and never reloads itself. The server closes a connection with code 4001 when a participant has too many; the page then stops instead of reconnecting.
- Join failures must stay indistinguishable (unknown room, wrong passcode, locked out, full). Do not add a branch that answers differently.

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
