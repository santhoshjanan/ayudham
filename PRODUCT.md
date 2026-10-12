# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

SvelteKit (latest stable, Svelte 5) with the Node adapter, server-rendered pages with a distinct URL per surface. Chosen by the user. Design tokens live in `apps/web/src/app.css` and shared components in `apps/web/src/lib/ui`; they move to a shared package when a second suite tool needs them.

## Users

Software teams estimating work together on a video call. The room is usually open in a browser tab beside the meeting, often on a shared screen; some participants are on phones. One person facilitates (the moderator); the others vote or watch.

## Product Purpose

pokerji is a suite of small team tools. Its first tool is a public, free, realtime planning poker service: create a room, share the link, estimate stories together, with no account. Success is a team going from opening the site to a revealed round in under a minute.

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
