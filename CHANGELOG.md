# Changelog

## Unreleased

- The suite is now called ayudham.app. *Ayudham* is Tamil and Malayalam for the tools of a trade, and the home page says so.
- Everything that carried the old name was renamed with it: the `@ayudham/*` packages, the `ayudham_*` metrics, `AYUDHAM_VERSION`, the database and its user, the Valkey key prefix (`ayudham:`), the compose project names and the browser storage keys (`ay-theme`, `ay-sound`, `ay-volume`, `ay-schema-draft`). A saved theme, sound setting or markup draft from before is forgotten once, and an existing deployment needs its database name, user and scrape configuration renamed to match.

## v0.1.0

The first release: three small tools on one site, run with a single compose file.

### Planning poker, at `/poker`

- A room is a 12-character secret link, with an optional passcode. Nobody signs up; you type a display name.
- Secret votes and one reveal: nobody, the moderator included, sees a vote before it. A 3-2-1 count, then every card turns at once, and the High and Low voters are flagged and named.
- A story title, a countdown timer, built-in and custom decks, voters and spectators, co-moderators and "vote again".
- One owner per room, who can delete it, replace the moderator link and demote moderators. Other moderator powers are shared.
- Round history with the title, the result and who voted what. Anyone can remove their own name from past votes.
- Opt-in sound: music during the countdown, a beep at its end, and ticks on the reveal. Off until you turn it on.

### Schema.org markup builder, at `/schema`

- Ten guided types (organization, local business, website, breadcrumbs, article, FAQ page, product, event, person, recipe) and any other Schema.org type.
- Says what search engines require and recommend and what is still missing. Several items can refer to each other.
- Copies JSON-LD as a script tag or as raw JSON.
- Runs entirely in the browser. Nothing typed is sent to the server; the draft is kept in the browser's own storage.

### Text tools, at `/text`

- Generators: passwords with an exact strength figure, passphrases from the EFF long word list, random strings, PINs and numbers, UUID v4 and v7, ULID and short identifiers, dice, coins and picks from a list.
- Converters: twelve case forms, slugs, Base64, hex, URL and HTML entity encoding both ways, SHA-2 hashes, line tools and counts. They work in a background worker, so typing never waits.
- Runs entirely in the browser. Every random choice comes from the browser's cryptographic random source, without bias. Nothing typed or made is sent anywhere or stored.

### Privacy and security

- No accounts and nothing loaded from other sites: a strict Content Security Policy, with fonts, scripts, images and audio all served by the site itself.
- A room and everything in it is deleted after a period without use (30 days by default), or at once by its owner.
- Client addresses are not stored. Rate limits use a keyed hash that expires within the hour.
- Logs carry fixed descriptions of problems only: no room links, names, titles or votes.

### Running it

- `docker-compose.yaml` runs the web app, Postgres and Valkey with three settings: `ORIGIN`, `POSTGRES_PASSWORD` and `ADDRESS_HMAC_SECRET`. `compose-dev.yaml` runs the same for development. See `docs/deploy.md`.
- Optional Prometheus metrics on a separate private port, with totals for the whole service only.
- CI on every pull request: format check, typecheck, all tests, a build with a smoke check, browser tests and an image build.
- Each push to `main` and each version tag that passes CI publishes the image to `ghcr.io/santhoshjanan/pokerji`. This release is `:0.1.0`.
