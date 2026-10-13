# pokerji

Planning poker without the sign-up. Create a room, share the link, and estimate stories together in real time. No accounts, no trackers, nothing loaded from anyone else's servers.

![pokerji: five scorecards showing 3, 5, 5, 8 and 13, the lowest and highest flagged](apps/web/static/og.jpg)

pokerji is the first tool in a planned suite of small tools for teams.

## What it does

- **Rooms by link.** A room is a 12-character secret link, with an optional passcode. Nobody signs up; you type a display name.
- **Secret votes, one reveal.** Nobody, the moderator included, can see a vote before the reveal. A 3-2-1 count, then every card turns at once, and the highest and lowest are flagged to speak first.
- **Running a round.** A prominent story title, a countdown timer, built-in and custom decks, voters and spectators, and co-moderators.
- **History.** Each room keeps its rounds: the title, the result and who voted what. Anyone can remove their own name from past votes.
- **Opt-in sound.** Classical music during the countdown, a telegraph beep at its end, a tick on each beat of the reveal count. Off until you turn it on.
- **Light and dark themes,** phones included.

## Privacy

- No account, email or login anywhere.
- A strict Content Security Policy: fonts, scripts, images and audio are served by the site itself.
- Rooms and everything in them are deleted after 30 days without use, or at once by their owner.
- Client addresses are never stored; rate limits use a keyed hash that expires within the hour.
- The app logs fixed descriptions of problems and nothing else: no room links, names, titles or votes.

The privacy page in the app says exactly what is stored and for how long.

## Run it

You need Docker.

**Development**, the whole app with nothing to configure:

```bash
docker compose -f compose-dev.yaml up --build
```

Then open http://localhost:5173/poker.

**Production**, a bare-minimum file to adapt to your server:

```bash
cp .env.example .env   # set ORIGIN, POSTGRES_PASSWORD and ADDRESS_HMAC_SECRET
docker compose up -d --build
```

The app listens on port 3000 over plain HTTP. Put an HTTPS reverse proxy in front of it; [docs/deploy.md](docs/deploy.md) lists the three things that proxy must do.

## Metrics

Optional Prometheus metrics, off by default. Set `METRICS_PORT` and the app serves `GET /metrics` on that second port, for a Prometheus server on a private network; the public port never serves them. Every series is a total for the whole service, and no label carries anything about a room or a person. The metric list is in [docs/deploy.md](docs/deploy.md#metrics-optional).

## Develop

Node 24 or later and pnpm.

```bash
pnpm install
pnpm services:up                      # Postgres and Valkey for the tests
pnpm test                             # unit and integration tests
pnpm typecheck
pnpm --filter @pokerji/web e2e        # browser tests against a production build
```

To run the app outside Docker, copy the development lines from `.env.example` into `.env` and run `pnpm --filter @pokerji/web dev`.

## How it is built

| Part | What it is |
|---|---|
| `packages/protocol` | Limits, decks and WebSocket message schemas shared by server and browser |
| `packages/poker-engine` | The room's rules as a pure function: no I/O, no clock, no framework. Vote secrecy is enforced in one place here |
| `packages/poker-server` | Everything that touches Postgres, Valkey, the clock or a socket |
| `apps/web` | A thin SvelteKit app: pages, forms and the live room |

Postgres holds rooms, sessions and history. Valkey holds rate-limit counters and room locks. One server instance holds the live rooms in memory.

More detail: [CLAUDE.md](CLAUDE.md) for the architecture and its rules, [DESIGN.md](DESIGN.md) for the visual system, and the behaviour spec in [docs/superpowers/specs](docs/superpowers/specs).

## Credits

- Music: Chopin recordings from [Musopen](https://archive.org/details/musopen-chopin) and Bach's Goldberg Variations played by Kimiko Ishizaka, from the [Open Goldberg Variations](https://archive.org/details/The_Open_Goldberg_Variations-11823). Both are released under CC0. Details in [apps/web/static/audio/LICENSES.md](apps/web/static/audio/LICENSES.md).
- Typefaces: Big Shoulders and Atkinson Hyperlegible Next, self-hosted.

Made in New Jersey. See also [phostrich.com](https://phostrich.com) and [santhoshj.com](https://santhoshj.com).
