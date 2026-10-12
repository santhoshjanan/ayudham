---
version: 1
slug: "apps-web-src-routes-poker-r-code-page-svelte"
primary_target: "apps/web/src/routes/poker/r/[code]/+page.svelte"
related_targets: []
---

# Live room — surface brief

Scope: the live room at `/poker/r/<code>` (join form and room), and by extension the create, settings, history, recovery, privacy and home pages, which share its world.
Visitor mode: Operate. (Privacy page: Read. Home: Persuade, kept small.)

Audience and job: a software team on a video call, estimating one story at a time; the room sits beside the meeting, often screen-shared, sometimes on a phone. Read the story, pick a card, watch the reveal, see who should speak first.

Constraints: plain semantic markup already exists and works, with labels and test ids that must survive. Content Security Policy forbids inline styles: no `style` attributes, no Svelte `transition:`/`animate:`; motion comes from stylesheets, the Web Animations API or canvas. Fonts and assets self-hosted. Light and dark themes to equal standard. WCAG 2.2 AA. Reduced motion respected. Sound opt-in.

Build path: code-led (no image generation in this environment).

## Direction contract

THESIS: Estimation is judging. Independent judges score in secret, every scorecard goes up in the same instant, and the highest and lowest speak first. It refuses the category default: an oval table ringed with avatars above a row of rounded cards.

OWN-WORLD: Pool aqua (#0e6f8c) as one full-bleed field, the stage, owning a third to a half of every room view. Light: cool white tile ground. Dark: scoreboard black (#111417), stage deepened to lit-pool teal. Flash-card white scorecards with heavy condensed scoreboard numerals. Signal yellow (#f4c20d) for the one primary action. Flag red (#d7263d) only for High, Low and destructive actions. A faint square tile grid in the ground. A sturdy quiet sans for everything else; standard web controls in these colours.

STORY: A joiner sees the story on the stage and their hand under their thumb. A row of face-down cards fills as teammates vote. At reveal, 3-2-1 takes the stage, the whole row turns at once, and High and Low name who talks first.

FIRST VIEWPORT: Top bar: wordmark, room link with copy, sound, theme, name and role, Settings. Under it the aqua stage, full-bleed, about 40% of the viewport height, the story title the largest text on the page, left-aligned with wide margins, timer in the stage's corner. Under the stage, on the tile ground: the row of scorecards with names beneath, then the tally after a reveal. The hand is docked along the bottom edge. Moderator controls on the right edge at wide widths, with Reveal in yellow as the primary action; on phones a bar above the hand.

FORM: Judges' Row, first of seven grounded candidates, chosen by the owner over the rolled direction. Seed key b9faa2af. Signature interaction: the count-in that takes over the stage, then every card turning in the same instant. Motion grammar: one beat per second, hard cuts on the count, one 300 ms turn in unison, nothing else moves. Under a fine pointer the tiles near it brighten and fade like a ripple.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Carried from the reviews

- Role labels (owner, moderator) must be visually distinct from names: a badge, not text in the same run.
- Confirm before promote, remove, clear history. The removal dialog says the person can rejoin through the link and offers to set a passcode.
- Restore a minimum-length hint on the passcode input, with a proper message.
- Custom deck fields must not need JavaScript to appear.
- A displaced owner should be told ownership moved.

## Unresolved

- The two typefaces (openly licensed, self-hostable).
- The bundled music tracks and their licences.
