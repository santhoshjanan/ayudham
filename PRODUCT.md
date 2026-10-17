# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

SvelteKit (latest stable, Svelte 5) with the Node adapter, server-rendered pages with a distinct URL per surface. Chosen by the user. Design tokens live in `apps/web/src/app.css` and shared components in `apps/web/src/lib/ui`; they are shared by every tool from there, and move to a package of their own only if a tool outside `apps/web` needs them.

## Users

Software teams estimating work together on a video call. The room is usually open in a browser tab beside the meeting, often on a shared screen; some participants are on phones. One person facilitates (the moderator); the others vote or watch.

The markup builder is used by one person at a time: a site owner or marketer who does not know the Schema.org vocabulary, or a developer who does, usually at a desk.

The text tools are used by one person in the middle of other work, most often a developer or an administrator at a desk: they open the page, take one result and leave.

The code maker is used by anyone who needs a real code and does not want to hand their data to a code website to get it: a QR code for a menu, a Wi-Fi card for guests, a business card, a product barcode for a label. Mostly at a desk, sometimes on a phone.

## Product Purpose

ayudham.app is a suite of small tools, each free and without an account. Its first tool is a public, realtime planning poker service: create a room, share the link, estimate stories together. Success there is a team going from opening the site to a revealed round in under a minute. Its second is a Schema.org markup builder: fill in a form, copy JSON-LD for your own site. Success there is markup on the clipboard without having read any documentation. Its third is a set of text generators and converters: passwords, passphrases, random strings, identifiers, case, encoding, hashes. Success there is a strong password on the clipboard with one press. Its fourth is a maker of barcodes and QR codes: pick a kind, fill it in, style it, copy or download it. Success there is a scannable QR code for a link on the clipboard in under ten seconds, and no exported code that fails to scan without a warning.

## Positioning

No accounts, no trackers, no third parties. Nobody, the moderator included, can see a vote before the reveal. The service stores only what its privacy page lists and deletes rooms after 30 days of inactivity.

## Operating Context

- Used live during sprint planning and refinement meetings, in short repeated rounds.
- A round: the moderator sets a story title, voters pick a card, votes stay hidden, the moderator reveals, the team discusses.
- An optional countdown timer per round, with opt-in classical background music that fades into a telegraph-style beep when time runs out.
- Roles: moderator, voter, spectator.

## Capabilities and Constraints

- Behaviour is specified in `docs/superpowers/specs/2026-10-12-planning-poker-design.md`.
- Surfaces: suite home, create room, join form and live room, history, moderator settings, moderator recovery, privacy page.
- The markup builder's behaviour is specified in `docs/superpowers/specs/2026-10-13-schema-builder-design.md`. It runs entirely in the browser: nothing typed into it reaches the server. Surface: `/schema`.
- The text tools' behaviour is specified in `docs/superpowers/specs/2026-10-14-text-tools-design.md`. They run entirely in the browser: nothing typed or made reaches the server, and nothing is stored anywhere. Surface: `/text`.
- The code maker's behaviour is specified in `docs/superpowers/specs/2026-10-16-code-maker-design.md`, its design in `2026-10-16-code-maker-design-direction.md`. It runs entirely in the browser: nothing typed, chosen or uploaded reaches the server, nothing is stored anywhere, and every offered style is proven to scan by decoding tests. Surface: `/codes`.
- Strict Content Security Policy: fonts, images, audio and scripts are self-hosted; no third-party origins.
- Rooms hold at most 50 participants.
- English only.
- Sound is off for each person until they turn it on.

## Brand Commitments

Stated by the user:

- A professional look.
- Generous breathing space.
- Must not read as generic SaaS or AI-generated.
- A mild cursor-trail animation, in the spirit of omarchy.org but well below its intensity.
- The reveal is a 3-2-1 countdown with drama.

## Evidence on Hand

No logo, wordmark, imagery, testimonials or usage figures exist. None may be invented.

## Product Principles

- Privacy is the product, not a setting.
- The link is enough: no sign-up stands between a team and its first round.
- Secrecy until reveal is absolute.
- The tool serves the meeting; it never competes with the conversation.

## Accessibility & Inclusion

Must work on phones during a call and be legible on a shared screen. Motion and sound are optional and must respect reduced-motion preferences.
