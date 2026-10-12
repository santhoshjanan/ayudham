# Planning Poker — Design Direction: "Judges' Row"

Date: 2026-10-12
Status: awaiting confirmation (replaces the earlier "Downbeat" direction)
Companion to: `2026-10-12-planning-poker-design.md` (behaviour) and `/PRODUCT.md` (product truth)

This is a design brief, not a token sheet. Exact colours, typefaces and component code are settled in the first Impeccable build pass and recorded in `DESIGN.md` afterwards. A builder must not invent the items listed under "Open decisions".

## 1. Job and audience

A software team on a video call, estimating one story at a time. The room sits in a browser tab beside the meeting and is often screen-shared, so it is read at a distance and through video compression. Some people are on phones. Everyone is mid-conversation; the room gets glances, not study.

Surface modes:

| Surface | Mode |
|---|---|
| Live room, join form, create, settings, history, recovery | Operate |
| Privacy page | Read |
| Suite home | Persuade, kept small |

## 2. Outcome

The primary task is: read the story, pick a card, watch the reveal, see at once whether the team agrees and who should speak first. Success is that a first-time joiner can vote without instruction and that the reveal is the moment people look up for.

## 3. Selected direction

**Thesis.** Estimation is judging. Independent judges score in secret, then every scorecard goes up in the same instant, and the highest and lowest are the ones who explain. The room refuses the category default of an oval table ringed with avatars.

**World.** The judging panel at a diving or gymnastics meet: the row of judges, flash scorecards, the scoreboard, the tiled pool. Under Operate rules the world lends exactly four things: type, palette, density and one signature move. It does not supply layout, navigation or controls.

**Commitment level: bold.** The colour field, the numerals and the reveal are played at full strength. Restraint lives in the spacing and the plain controls, not in a muted palette.

- **Palette.** Committed: pool aqua owns a third to a half of every room view as one full-bleed field, the stage. Reference values from the chosen card: aqua `#0e6f8c`, scoreboard black `#111417`, card white `#fafafa`, signal yellow `#f4c20d`, flag red `#d7263d`.
  - **Light, "day session".** Cool white tile ground; the aqua stage at full saturation; black numerals and text; yellow fills the primary action; red marks only the high and low flags and destructive actions.
  - **Dark, "evening final".** Scoreboard-black ground; the stage deepens to a lit-pool teal; scorecards stay white and become the brightest things on screen; yellow and red keep their roles.
  - Both themes are designed, built and reviewed to the same standard.
- **Theme choice.** The first visit follows the device's light or dark preference. A toggle in the top bar overrides it, and the choice is remembered in that browser only.
- **Type.** A sturdy, quiet sans for all interface text. One heavy, condensed display face with flash-card numeral character, used only for card values, the count-in, the timer and the result.
- **Density.** Sparse. The stage and the row each own a large share of the viewport, with wide margins. No bordered panels around everything and no cards inside cards.
- **Signature move: the row.** Described in section 6.

**Principles carried over from the directions it was weighed against.**

- Agreement is seen before it is read: a tally under the row shows each value with a bar sized by how many chose it.
- The stage and the row own the viewport; every moderator control lives on one edge.
- History keeps people in a fixed order across rounds, so rounds compare at a glance.
- On the home and privacy pages each privacy claim sits beside the mechanism that enforces it.

## 4. Scope and boundaries

In scope: all surfaces in the behaviour spec, at production fidelity, in a light and a dark theme.

Anti-goals:

- An oval table with avatars around it.
- A grid of rounded cards, soft shadows, gradient glows or glass panels.
- Sports clip-art: medals, podiums, lane ropes, swimmer silhouettes, stopwatches, whistles.
- Athletic styling: slanted speed type, racing stripes, team-jersey numbering.
- Confetti or mascots.
- Sporting puns in interface copy. Actions keep plain names: Reveal, New round, Start timer.
- Costumed controls. Buttons, inputs, selects and dialogs are standard web controls in the world's colours.

## 5. States and ranges

Participants: 1 minimum, 5–9 typical, 50 maximum. Deck: up to 20 cards of up to 4 characters. Title: up to 200 characters, sometimes just an issue id. Names: up to 30 characters.

The live room must be designed for each of these states:

- Join form; unknown room or wrong passcode (one generic message).
- Alone in the room, with a prompt to copy the link.
- No title yet.
- Voting: nobody voted, some voted, everybody voted.
- Counting in.
- Revealed: unanimous, a spread, and a spread that includes non-numeric cards.
- Revealed but not saved.
- Timer idle, running, expired.
- Sound off, sound on.
- Voter, spectator and moderator views.
- Reconnecting.
- Removed from the room.

## 6. Interaction and layout

### Room layout

- **Top bar.** Text wordmark, room link with a copy button, sound toggle, theme toggle, your name and role, and a settings link for moderators.
- **The stage.** A full-bleed aqua field under the top bar. It holds the story title, the largest text on the page, and after a reveal the result. Moderators edit the title in place.
- **The row.** Beneath the stage: one scorecard per voter with the name under it. Spectators are listed separately and smaller.
- **The tally.** Under the row after a reveal: each value with a bar sized by its count, plus average, lowest and highest in words.
- **Your hand.** Docked along the bottom edge, reachable by thumb on phones, scrolling sideways for large decks. Spectators see a "watching" line in its place.
- **Moderator controls.** One edge only: a rail on the right on wide screens, a bar above the hand on phones. Reveal is the primary action, in yellow.
- **Timer.** In a corner of the stage, in scoreboard numerals, with a thin line that shortens.

### The row

- While voting, each scorecard shows its back. It changes from outlined to solid when that person has voted.
- At reveal every card turns in the same instant. People stay in the order they joined; nothing reshuffles.
- The highest and lowest numeric cards are flagged in red and labelled "High" and "Low" in words. They are the people to hear from first.
- A unanimous round has no flags; the stage shows the value with the word "Unanimous".
- Non-numeric cards turn like the rest and are never flagged.
- With many people the row wraps and the cards step down through fixed sizes. Names stay legible at every step.

### The count-in

- The moderator presses Reveal. Votes lock.
- 3, 2, 1 take over the stage, one second apart, in the display face at the largest size the stage allows.
- On zero the stage snaps to the result and the whole row turns at once.
- With sound on, each beat has a soft synthesised tick.
- Values are not sent to any browser until zero, so the drama is real.

### The water (pointer trail)

- The ground carries a faint tile grid. As the pointer moves, nearby tiles brighten slightly and the effect spreads and fades like a ripple.
- Mild by design: it never moves text or controls, and it idles at no cost when the pointer is still.
- Fine pointers only. Off on touch devices and under reduced motion.

### Other surfaces

- **Home.** The suite as a meet programme: a list of events, with planning poker the only entry. Privacy claims are paired with their mechanisms.
- **Create.** One choice (deck) and one button. After creation, the moderator recovery link is shown once with a clear instruction to save it.
- **History.** A score sheet: one row per round with title, result and spread. Opening a round shows its row of cards with High and Low flagged. Moderators get delete controls; everyone gets "Remove my name".
- **Settings.** A plain form in sections: deck, timer, music, passcode, recovery link, delete.
- **Privacy.** Plain language, generous measure, each claim beside how it is enforced.

### Responsive behaviour

- Phones: stage, row, tally, moderator bar, hand, in that order. The stage stays full-bleed.
- Shared screens: the title, the turned cards and the result must be legible at a distance.

## 7. Constraints

- Fonts, images and audio are self-hosted. No third-party origins.
- A strict Content Security Policy applies; motion must work within it.
- WCAG 2.2 AA contrast in both themes, including text on the aqua stage.
- The theme is applied before first paint, so a page never flashes the wrong theme.
- A full round is operable by keyboard.
- The reveal is announced to screen readers in words.
- Colour is never the only carrier of meaning: High, Low and Unanimous are always written out.
- Reduced motion: the count-in shows its numerals without movement, cards change face without a flip, and the water is off.
- Sound is opt-in per person.
- No logo, imagery or testimonials exist and none may be invented. The wordmark is text.

## 8. Open decisions

- The two typefaces. They must be openly licensed and self-hostable.
- The bundled music tracks and their verified licences.
