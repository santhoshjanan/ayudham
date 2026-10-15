# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Every behaviour in the spec works in a browser, in the designed interface ("Judges' Row", light and dark). The second tool, the Schema.org markup builder at `/schema`, is built too; it runs entirely in the browser. The third tool, the text generators and converters at `/text`, is built too; it also runs entirely in the browser. Sound is built too: opt-in music during the countdown, a beep at its end and ticks on the reveal count. It is packaged for release: `Dockerfile`, `compose-dev.yaml`, `docker-compose.yaml` and `docs/deploy.md`. Deployment is the owner's action. The behaviour spec and design direction are in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`, product facts in `PRODUCT.md`, the design system in `DESIGN.md`.

## Commands

Package manager is pnpm (Node 24+).

- Install: `pnpm install`
- All tests: `pnpm test`
- One package: `pnpm --filter @pokerji/poker-engine test`
- One file: `pnpm --filter @pokerji/poker-engine exec vitest run test/rounds.test.ts`
- One test by name: add `-t "part of the test name"` to the line above
- The markup builder's package: `pnpm --filter @pokerji/schema-builder test`
- The text tools' package: `pnpm --filter @pokerji/text-tools test`
- Typecheck: `pnpm typecheck`
- Format: `pnpm format` (check only: `pnpm format:check`)
- The whole app in Docker, for development: `docker compose -f compose-dev.yaml up --build`, then http://localhost:5173/poker. Only Postgres and Valkey, for the test suites: `pnpm services:up` (stop: `pnpm services:down`; wipe data: `pnpm services:wipe`).
- `packages/poker-server` tests need those services running. Each test file uses its own throwaway Postgres schema and Valkey key prefix, so they never touch development data.
- Run the app: copy `.env.example` to `.env`, then `pnpm --filter @pokerji/web dev` and open http://localhost:5173/poker
- Web typecheck: `pnpm --filter @pokerji/web typecheck`
- End-to-end tests: `pnpm --filter @pokerji/web e2e` (builds the app and drives Chromium; first run needs `pnpm --filter @pokerji/web exec playwright install chromium`)
- Production: `docker compose up -d --build` with `docker-compose.yaml` in the root, which needs `ORIGIN`, `POSTGRES_PASSWORD` and `ADDRESS_HMAC_SECRET` (see `docs/deploy.md`).
- Smoke check of a build: `pnpm --filter @pokerji/web build && pnpm --filter @pokerji/web smoke`

Dependencies: pnpm enforces a minimum release age. Do not add `minimumReleaseAgeExclude` entries to install a just-published version; pin the previous release instead.

## Architecture

- `packages/protocol`: limits, decks, and WebSocket message schemas shared by server and browser.
- `packages/poker-engine`: the room rules as a pure reducer, `apply(state, command, now)` returning `{ state, effects }`. No I/O, no clock, no framework. A host (the server) feeds it commands and carries out its effects.
- `packages/schema-builder`: the markup builder's rules as pure functions over an immutable draft. `serialize` writes JSON-LD, `check` reports what is missing or malformed, `unpack` reads a stored draft without trusting it. No I/O, no DOM; a test (`purity.test.ts`) enforces that.
- The builder's page (`apps/web/src/routes/schema`, components in `apps/web/src/lib/schema`) has no server code: no form action, no endpoint, no cookie. Nothing typed into it may be sent anywhere; a browser test checks that no request carries typed text. Keep it that way.
- The script-tag form of the markup writes every `<` as `\u003c` (`toScriptTag`), so nothing typed can end the script element on the site it is pasted into. Typed values are rendered as text only, never as HTML.
- The builder's draft lives in local storage under `pj-schema-draft` and is read only through `unpack`, which enforces every limit in `LIMITS` and accepts only plain names (letters and digits) and no repeated property. A tab writes it only after changing the draft itself (`Builder.flush`), so an idle tab cannot remove another tab's draft. The builder's fields set `spellcheck="false"`; keep it, or typed text can reach a browser's spelling service.
- The Schema.org vocabulary is vendored as `apps/web/static/schema/vocabulary.json`, made by `packages/schema-builder/scripts/compact-vocabulary.ts` from a pinned release and recorded with its checksum in `apps/web/static/schema/LICENSES.md` (a test compares them). It is fetched from this site only when the escape hatch is opened. Nothing is fetched from schema.org at build or run time. To move to a new release, follow `LICENSES.md`.
- A guided type's required and recommended levels come from `packages/schema-builder/RULES.md`. Change a level, that file and `RULES_CHECKED` together.
- `packages/text-tools`: the text tools' rules as pure functions: unbiased sampling, the generators, the converters and the word list reader. No I/O, no DOM, no dependency. Randomness and the clock are arguments (`random`, `now`), never reached for; a test (`purity.test.ts`) enforces that and allows only the package's own files to be imported. Generator and converter operations validate input and return a `Result`; byte and text helpers return plain values.
- Every bounded random choice goes through `below` in `packages/text-tools/src/random.ts`, which draws again instead of taking a remainder. Raw random bytes come directly from the supplied source. Never use `Math.random` or a remainder of a random value, in the package or the page.
- A strength figure must be the true one for the rule. `passwordBits` counts the allowed passwords exactly; change a rule and its figure together.
- The text tools' page (`apps/web/src/routes/text`, components in `apps/web/src/lib/text`) has no server code, like the builder's. It also stores nothing: no local or session storage, no cookie, nothing in the address but the open tool's name in the fragment. Browser tests check that no request carries anything typed or made and that nothing is stored. Keep it that way.
- The tools are drawn only after the page has mounted in a browser (`ready` in the page). The server could make a password too, and it would then cross the network, so it is never asked to; a test checks the page's HTML holds no result.
- The EFF long word list is vendored exactly as published at `apps/web/static/text/eff_large_wordlist.txt`, with its checksum in `LICENSES.md` beside it and in `WORD_LIST_SHA256` (a test compares the three). The page fetches it from this site only when the passphrase tool is opened, and checks its checksum and its shape before using a word.
- The text tools' fields set `spellcheck="false"`, `autocomplete="off"`, `autocapitalize="off"` and `autocorrect="off"`, and they and the results rail carry `translate="no"`, so nothing reaches a spelling or translation service. Typed and generated values are rendered as text only, never as HTML.
- The converters (Case, Slug, Count, Encode and decode, Lines except Shuffled) work in a Web Worker served by this site (`apps/web/src/lib/text/convert.worker.ts`, driven by `background.svelte.ts`, answering through `jobs.ts`), so typing at the limit never stalls. Text goes to it by `postMessage` inside the browser only. Copy takes `Background.exact()`, which works the answer out on the page if the worker has not answered, so a copy never holds results for older text, and copies nothing when that answer is empty or a refusal; where no `exact` exists (Hash), Copy is disabled while newer results are on their way. Anything that draws random numbers stays on the page. Without workers the same `answer` function runs on the page.
- A text box takes one character past `LIMITS.text`, so a longer paste is refused with the limit named instead of being cut short silently (a cut text would hash or count as if it were the whole).
- The text tools' layout classes in `app.css` are scoped under `.text-tools`: the builder has fields of the same name.
- Vote secrecy is enforced in one place, `snapshotFor` in the engine. Anything that sends room state to a browser must go through it.
- `packages/poker-server`: everything that touches Postgres, Valkey, the clock or a socket, with no web framework. `RoomHost` is one live room: it owns the engine state, sends each connection its own snapshot, and carries out engine effects. `RoomRegistry` loads hosts under a Valkey lock and unloads idle ones. `attachSocket` puts one untrusted socket behind size, rate and parse checks.
- A participant's id is their session id. Saved rounds get their own generated id so a retried save cannot store a round twice.
- Metrics (`packages/poker-server/src/metrics.ts`) follow the same rule as `report`: aggregates for the whole service only, and every label value picked from a fixed list in that file through `pick`. Never add a per-room or per-person series, never pass a room code, name, title, vote, token, address or request path as a label, and never serve metrics from the public port. To count something new, add a function to `metrics`, add its label values to a fixed list, and call it from the code path; calls cannot throw. `apps/web/server.js` serves them on `METRICS_PORT` only.
- `report(problem)` receives fixed strings only. Never pass it, or log, room codes, names, titles, votes, tokens or client addresses.
- Rate limits fail closed when Valkey is unreachable; live rooms keep running.
- `apps/web` is a thin SvelteKit 3 shell. Rules live in the packages; a route only parses a form, calls a flow, sets a cookie and renders.
- SvelteKit 3 differences that matter here: configuration is in `vite.config.ts` (no `svelte.config.js`); hook types come from `@sveltejs/kit/hooks`; the library alias is `#lib` and imports through it carry the file extension.
- One runtime object per process lives on `globalThis` under `Symbol.for('pokerji.runtime')` (`apps/web/src/lib/server/pokerji.ts`). `apps/web/server.js`, the production entry, uses it to hand WebSocket upgrades to `createUpgradeHandler`; a Vite plugin does the same in dev.
- The owner runs and configures the reverse proxy themselves. This repository ships no proxy configuration of any kind. Do not add any unless asked.
- Production sets `ORIGIN` (the site's one origin), `ADDRESS_HEADER=x-forwarded-for` and `XFF_DEPTH=1`; see `docker-compose.yaml`. Without `ORIGIN` the app works out its origin from `PROTOCOL_HEADER` and `HOST_HEADER`, and without those every form post is refused. `INSECURE_HTTP=1` is for local testing only; `server.js` refuses to start with it unless `HOST` is a loopback address, and refuses to start without `ADDRESS_HEADER` otherwise.
- Deployment is two compose files in the repository root, at the owner's insistence: `compose-dev.yaml` and `docker-compose.yaml`, each bringing up the whole app (web, Postgres, Valkey) with one command. Keep them bare. Do not add deployment scripts, extra required settings, external networks or anything specific to the owner's server; they adapt the production file themselves. The app still supports a database user that cannot change tables (`MIGRATIONS=check`, with migrations applied by a one-shot `MIGRATE_ONLY=1` run of the image), but nothing in the repository sets that up.
- `apps/web/server.js` sets the base security headers on every response, because static files never reach `hooks.server.ts`. When `ORIGIN` is set it also states the site's origin on every request, in two headers of its own that it overwrites; this version of the Node adapter takes a fixed origin only at build time. The WebSocket upgrade reads `ORIGIN` directly.
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
- Public pages (home, `/poker`, `/schema`, `/text`, `/privacy`) use `Seo.svelte` for their title, description, canonical address and link-preview tags, and are listed in `/sitemap.xml`. Everything below `/poker/` is a room: it carries `X-Robots-Tag: noindex` and is disallowed in `/robots.txt`. Never make a room page indexable or list one anywhere.
- The footer's outbound links are plain links. Nothing is loaded from other sites, and `Referrer-Policy: same-origin` means they receive no referrer.
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
