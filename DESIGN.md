---
name: pokerji
description: Small tools for teams. Planning poker staged as a judging panel at a diving meet.
colors:
  stage: "#0e6f8c"
  stage-deep: "#0a566d"
  stage-ink: "#ffffff"
  stage-ink-soft: "#cfe9f1"
  action: "#f4c20d"
  action-hover: "#ffd43a"
  action-ink: "#111417"
  flag: "#d7263d"
  flag-ink: "#ffffff"
  danger-text: "#b81c31"
  ground: "#f3f7f8"
  surface: "#ffffff"
  ink: "#111417"
  ink-soft: "#3f5158"
  line: "#c5d3d8"
  tile-line: "rgb(14 111 140 / 0.09)"
  ripple: "#0e6f8c"
  card: "#fbfcfc"
  card-ink: "#111417"
  card-edge: "#c5d3d8"
  card-back: "#0a566d"
  focus: "#111417"
  stage-dark: "#0a5d76"
  stage-deep-dark: "#07475b"
  stage-ink-soft-dark: "#bfe3ee"
  danger-text-dark: "#ff7384"
  ground-dark: "#111417"
  surface-dark: "#181d21"
  ink-dark: "#eef3f4"
  ink-soft-dark: "#a8babf"
  line-dark: "#2c373c"
  tile-line-dark: "rgb(255 255 255 / 0.045)"
  ripple-dark: "#3fb6d8"
  card-edge-dark: "#fbfcfc"
  card-back-dark: "#0d7391"
  focus-dark: "#f4c20d"
typography:
  display:
    fontFamily: "'Big Shoulders Variable', 'Arial Narrow', sans-serif"
    fontSize: "clamp(2.5rem, 1.25rem + 5.2vw, 5.5rem)"
    fontWeight: 900
    lineHeight: 0.98
    letterSpacing: "0.005em"
  count:
    fontFamily: "'Big Shoulders Variable', 'Arial Narrow', sans-serif"
    fontSize: "clamp(9rem, 34dvh, 20rem)"
    fontWeight: 900
    lineHeight: 1
  numeral:
    fontFamily: "'Big Shoulders Variable', 'Arial Narrow', sans-serif"
    fontSize: "2.86rem"
    fontWeight: 900
    lineHeight: 1
  headline:
    fontFamily: "'Big Shoulders Variable', 'Arial Narrow', sans-serif"
    fontSize: "clamp(2.25rem, 1.4rem + 3.6vw, 4rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "0.005em"
  title:
    fontFamily: "'Big Shoulders Variable', 'Arial Narrow', sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "0.005em"
  body:
    fontFamily: "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 650
    lineHeight: 1.5
  small:
    fontFamily: "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.5
  badge:
    fontFamily: "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.05em"
rounded:
  bar: "2px"
  badge: "3px"
  control: "6px"
spacing:
  tile: "32px"
  control-gap: "0.6rem"
  field: "0.9rem"
  section: "2.75rem"
  gutter: "clamp(1rem, 6vw, 5rem)"
  measure: "40rem"
  measure-wide: "62rem"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.55rem 1rem"
    height: "2.75rem"
  button-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.55rem 1rem"
    height: "2.75rem"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
    textColor: "{colors.action-ink}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger-text}"
    rounded: "{rounded.control}"
    padding: "0.55rem 1rem"
    height: "2.75rem"
  button-danger-hover:
    backgroundColor: "{colors.flag}"
    textColor: "{colors.flag-ink}"
  button-disabled:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.6rem 0.7rem"
    height: "2.75rem"
  badge:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.badge}"
    rounded: "{rounded.badge}"
    padding: "0.05rem 0.4rem"
  badge-owner:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
  flag:
    backgroundColor: "{colors.flag}"
    textColor: "{colors.flag-ink}"
    rounded: "{rounded.badge}"
    padding: "0 0.5rem"
    height: "1.35rem"
  scorecard-face:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-ink}"
    typography: "{typography.numeral}"
    rounded: "{rounded.control}"
    width: "5.5rem"
  scorecard-back:
    backgroundColor: "{colors.card-back}"
    rounded: "{rounded.control}"
    width: "5.5rem"
  hand-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-ink}"
    rounded: "{rounded.control}"
    width: "3.4rem"
  stage:
    backgroundColor: "{colors.stage}"
    textColor: "{colors.stage-ink}"
    typography: "{typography.display}"
    padding: "clamp(1.5rem, 4vw, 3rem) clamp(1rem, 6vw, 5rem)"
  site-bar:
    backgroundColor: "{colors.stage-deep}"
    textColor: "{colors.stage-ink}"
    padding: "0.5rem clamp(1rem, 4vw, 2.5rem)"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "1.1rem 1.25rem"
---

# Design System: pokerji

## Overview

**Creative North Star: "Judges' Row"**

Estimation is judging. The interface is a judging panel at a diving meet: one field of pool aqua, the stage, carries the story being scored; below it, on a tiled floor, a row of white scorecards sits face down until every one of them turns in the same instant. The highest and lowest are flagged in red and named on the stage, because they speak first. There is no table, no ring of avatars and no illustration; the scene is made from colour fields, a square tile grid and heavy scoreboard numerals.

The system has two themes of equal standing. Light is the day session: cool white tile, dark ink. Dark is the evening final: scoreboard black, the pool deepened to a lit teal, the scorecards still white. The first visit follows the device; the toggle in the bar overrides it; the choice is kept in the browser only (`localStorage` key `pj-theme`) and applied before first paint, so no page flashes the wrong theme. Every colour decision is made twice, once per theme.

Everything apart from the stage and the cards is plain: standard web controls, one measured column for reading and forms, sections divided by a rule. The tool sits beside a meeting and must not compete with it.

**Key Characteristics:**
- One full-bleed aqua field per page: the stage in the room, a band everywhere else.
- Colour is rationed: aqua for the stage, yellow for the one next step, red for flags and deletion.
- Condensed scoreboard numerals for anything that is read across a shared screen; a sturdy legible sans for everything else.
- A 32px square tile grid in the ground, in the stage and, finer, on the card backs.
- Motion is spent on one moment: the count, the turn, and the beat after it when Low and then High are stamped. Nothing else on the page moves.
- No inline styles anywhere; the Content Security Policy forbids them.

## Colors

Three signal colours on a cool neutral ground, each with one job.

### Primary
- **Pool Aqua** (`stage`, dark `stage-dark`): the stage in the room and the band that opens every other page. Also the tally bars, the text selection, the caret and the radio accent.
- **Deep Water** (`stage-deep`, dark `stage-deep-dark`): the site bar, and the full-stage backdrop of the count. In light it is also the scorecard back (`card-back`); in dark the back is a brighter aqua (`card-back-dark`) so it reads against scoreboard black.
- **Lane White** (`stage-ink`) and **Splash** (`stage-ink-soft`, dark `stage-ink-soft-dark`): the two inks allowed on aqua. White for the title and names; Splash for supporting lines, the idle timer and the unset title.

### Secondary
- **Signal Yellow** (`action`, hover `action-hover`, text `action-ink`): the one primary action on a screen. Also the count's sweep line, the ring round the card you played, in-room notices that need acting on, and the focus ring in dark.

### Tertiary
- **Flag Red** (`flag`, text `flag-ink`): the High and Low flags, and the filled hover state of destructive buttons.
- **Flag Red, text weight** (`danger-text`, dark `danger-text-dark`): destructive button labels and borders at rest, and alert text. A separate value per theme so red text passes contrast on both grounds.

### Neutral
- **Tile White** (`ground`) / **Scoreboard Black** (`ground-dark`): the page ground.
- **Surface** (`surface`, `surface-dark`): controls, the moderator rail, the dock, history entries, the dialog.
- **Ink** (`ink`, `ink-dark`) and **Ink Soft** (`ink-soft`, `ink-soft-dark`): text and secondary text. Ink is also the default button border.
- **Line** (`line`, `line-dark`): dividers, field borders, the empty-seat outline, the tally track.
- **Tile Line** (`tile-line`, `tile-line-dark`): the grid drawn in the ground. On aqua the grid is white at 7% in both themes; on card backs white at 12%.
- **Scorecard** (`card`, `card-ink`): identical in both themes. A scorecard is white with black numerals in the evening final too. Only its edge changes (`card-edge`, `card-edge-dark`).
- **Ripple** (`ripple`, `ripple-dark`): the tint of the pointer ripple.

### Named Rules
**The Three Signals Rule.** Aqua owns the stage and the bands. Yellow is the next step. Red is a flag or a deletion. None of the three is used for decoration, and none borrows another's job.

**The Moving Yellow Rule.** A screen has one yellow button, and it is whatever comes next: Reveal while voting, New round after the reveal, Create or Join on a form. The same button loses its yellow when it stops being the next step. Secondary actions on the same screen are outlined in ink.

**The Word With The Flag Rule.** Red never carries meaning alone. A flag always holds the word High or Low, and the same names are repeated in text on the stage.

**The Twice Rule.** Every colour is specified for both themes and checked in both. Contrast measured from the shipped values: body ink on ground 17:1 light and 16.5:1 dark; white on the stage 5.7:1 light and 7.4:1 dark; ink on yellow 11:1.

## Typography

**Display Font:** Big Shoulders, variable (with 'Arial Narrow', sans-serif)
**Body Font:** Atkinson Hyperlegible Next, variable (with system-ui, sans-serif)

**Character:** A condensed scoreboard face for what the whole room reads at once, and a face designed for legibility for what one person reads up close. Both are SIL OFL and self-hosted through fontsource packages; no font is fetched from a third party. Body text sets `font-variant-numeric: tabular-nums`, so counts and clocks do not jitter.

### Hierarchy
- **Display** (900, clamp(2.5rem, 1.25rem + 5.2vw, 5.5rem), 0.98): the story title on the stage, the largest text in the room, held to 20ch. A title over 70 characters drops to 800 at clamp(1.6rem, 1.1rem + 1.9vw, 2.6rem), line height 1.08, 48ch. An unset title is weight 600 in Splash.
- **Count** (900, clamp(9rem, 34dvh, 20rem), 1): the 3, 2, 1. On screens up to 40rem wide, clamp(5rem, 16dvh, 8.5rem), so the numeral fits the shorter stage with its beat.
- **Numeral** (900, 52% of the card's width, 1): the value on a scorecard face; 2.86rem on the large card. Hand cards use 1.7rem. The tally and history use 800 at 1.35 to 1.4rem.
- **Headline** (800, clamp(2.25rem, 1.4rem + 3.6vw, 4rem), 1.05): page titles. Inside a band the weight is 900 and the line height 0.98.
- **Title** (800, 1.75rem, 1.05): section headings. 2.25rem for an entry in the home programme, 1.5rem for dialog headings and claims, 1.25rem inside the room. The wordmark is the word "pokerji" at 900, 1.6rem.
- **Timer and verdict** (800, clamp(1.75rem, 1.2rem + 2vw, 3rem), 1): the stage clock and the Low/High result line.
- **Body** (400, 1.0625rem, 1.5): everything read as prose. Band introductions are 1.15rem, held to 46ch; reading columns are 40rem wide.
- **Label** (650, 1.0625rem): field labels, buttons, names under cards, alerts.
- **Small** (400, 0.95rem): hints, metadata, bar navigation. 0.9rem for the retention note.
- **Badge** (700, 0.7rem, 0.05em, uppercase): role badges only.

### Named Rules
**The Scoreboard Rule.** Big Shoulders is for things read from across the room: the story title, card numerals, the count, the timer, the verdict, headings, and the one large action button in the rail or bar (800, 1.5rem, 0.03em). It never sets a sentence of body text, a label or a field.

**The Two Faces Rule.** There are two families and no third. Code samples and links to copy fall back to the system monospace.

## Layout

The room is three horizontal regions stacked on the page: the site bar, the stage, the floor. The stage is full-bleed, bottom-aligned, with a minimum height of clamp(15rem, 40dvh, 26rem), or clamp(10rem, 26dvh, 15rem) on screens up to 40rem wide. Stage and floor share one gutter, clamp(1rem, 6vw, 5rem), so the title and the first scorecard sit on the same left edge. Content is left-aligned throughout.

The row of scorecards wraps. Cards are 5.5rem wide for up to 8 voters, 4.25rem for up to 18, 3.25rem beyond that, so a full room of fifty still fits; on screens up to 40rem the sizes are 4.25rem and 3rem. Cards keep a 5:7 ratio at every size.

The hand is docked to the bottom edge of the viewport, a fixed strip that scrolls sideways when the deck is wider than the screen. The room reserves padding beneath itself so the dock never covers content.

The moderator's controls move with width. At 64rem and up they are a rail, 18.5rem wide, beside the row. Below 64rem they are a bar in the dock, above the hand: the next step at full width, and a More button that opens the remaining controls as a sheet up to 50dvh tall. The largest control in either place is always the next thing to do.

Every other page opens with a band of aqua holding the page title and at most one supporting line, then one column on the tile: 40rem for forms and reading, 62rem for the home page. The home band holds the words on the left and the turning row on the right (below the words under 52rem). The privacy promises on the home page are a ledger, one promise to a ruled line with its term in an 18rem left column, matching the programme above; they are never equal columns. Sections in a column are separated by 2.75rem and a single rule, not boxed. Fields are spaced 0.9rem apart; grouped buttons 0.6rem.

Breakpoints, all in rem: 34rem (the bar drops its text labels and the visitor's name, keeping icons, links and the role badge), 40rem (shorter stage, smaller cards), 44rem (home lists take a term column), 52rem (home band puts the row beside the words), 64rem (rail in place of bar).

### Named Rules
**The Still Stage Rule.** The stage keeps one height through the reveal. The slot for the result is reserved before there is a result (4.25rem, or 5.25rem from 40rem wide), and the count is laid over the stage, not inserted into it. When the cards turn, nothing below the stage moves.

**The Under The Thumb Rule.** What a person does most often sits at the bottom edge: the hand for a voter, the next step for a moderator on a phone.

## Elevation & Depth

Flat, with tonal layering. Depth comes from the colour fields: aqua stage, tiled ground, white surface. Shadows are kept for physical objects, things that could be picked up.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 1px 2px rgb(17 20 23 / 0.08), 0 6px 16px rgb(17 20 23 / 0.08)`; dark `0 1px 2px rgb(0 0 0 / 0.4), 0 8px 20px rgb(0 0 0 / 0.35)`): scorecards, hand cards and the confirmation dialog.
- **Played** (`box-shadow: 0 0 0 3px` in Signal Yellow, over the card shadow): the card in your hand that you played, which also sits 0.5rem higher.
- **Dock** (`box-shadow: 0 -6px 18px rgb(17 20 23 / 0.1)`): the upper edge of the docked hand.

### Named Rules
**The Objects Only Rule.** A shadow means "this is a card or a sheet above the page". Panels, the rail, history entries, fields and buttons are separated by a 1px line, never a shadow.

## Shapes

Square-shouldered. One radius (6px) for every control, card, panel and field; 3px for badges and flags; 2px for tally bars. Nothing is pill-shaped or circular. Borders do the work: 1.5px on buttons and fields, 1px on panels and dividers, 3px of white round a face-down card. A dashed border means "not yet" or "not now": an empty seat in the row, a disabled button, an Away badge.

The square tile is the recurring figure: 32px in the ground and the stage, 0.6rem on card backs, and the unit the pointer ripple lights.

## Components

### Buttons
Plain and outlined; they look like controls, not ornaments.
- **Shape:** gently squared (6px), 1.5px border, at least 2.75rem tall, padding 0.55rem 1rem, weight 650.
- **Default:** surface fill, ink text and ink border. Hover inverts it: ink fill, ground text. Pressing moves it down 1px.
- **Primary:** Signal Yellow fill, ink text, ink border; a lighter yellow on hover. One per screen. In the rail and the moderator bar it is set in the display face (800, 1.5rem in the rail at 3.5rem tall; 1.35rem in the bar at 3rem tall).
- **Destructive:** red text and red border at rest; filled Flag Red with white text on hover. Used for Remove, Delete this round, Delete all history, Delete room.
- **Disabled:** drawn, not faded. Transparent fill, soft ink text, a dashed line-colour border. A faded control turns to mud on the dark theme.
- **Toggle state:** a pressed toggle (Manage people) holds the inverted fill.
- **Link as button:** a link that is the page's next step takes the primary treatment, padding 0.65rem 1.15rem.
- **On the bar:** a 1px Splash outline on transparent; hover fills white with deep-water text. Icon-only controls are 2.5rem square with a 14% tint on hover.
- **Focus:** a 3px outline, offset 2px, in ink (light) or yellow (dark). On the pool (the bar, the bands, the stage) it is yellow in both themes, because ink would not show there. The ring keeps the control's own corners.

### Badges and flags
- **Role badge:** a 1px outline in the current text colour, uppercase, 0.7rem, 3px corners. Owner is filled (ink on the page, white on the bar); Moderator is outlined; Away is dashed and soft.
- **Flag:** Flag Red with white display type (800, 0.95rem, 0.06em, uppercase), sitting above the card. Its space is reserved on every card, so flags appearing does not shift the row. A flagged card's face carries a 3px Flag Red edge.

### Scorecards
The signature component.
- **Face:** scorecard white, black numeral in the display face at 900, 1.5px edge, card shadow, 5:7.
- **Back:** deep water with a fine tile grid and a 3px white border.
- **Empty seat:** a 2px dashed outline in the line colour, no fill, no shadow.
- **Turn:** each card rotates about its vertical axis in one 300 ms move, `cubic-bezier(0.16, 1, 0.3, 1)`. Every card turns on the same state change, so the row turns in unison.
- **The beat:** only on a screen that watched the cards turn (`data-reveal="live"` on the room), never for someone who opens the room afterwards. 450 ms after the turn the Low flag is stamped on (it drops in from 1.8 times its size in 240 ms), its card dips 0.3rem and takes its red edge, and the Low name lands on the stage; High follows at 850 ms. A unanimous round has no flags: the verdict lands with the count's beat and the row hops, one card 45 ms after the next. Under reduced motion all of it is simply present.
- **Outside the room:** `Scorecard.svelte` in `apps/web/src/lib/ui` is the one implementation. The home band shows a decorative row of five that turns once, 900 ms after the page opens.
- **Sound:** the reveal count ticks once per number, and a countdown ends in a telegraph key (three short, one long) after the music has faded. All of it is off until a person turns it on.
- **Away:** the card and name of someone who has left the tab drop to half opacity, with an Away badge.
- **The break card:** a drawn cup in the numeral's stroke weight, not an emoji.

### The hand
A strip of smaller scorecards (3.4rem wide), always face up. Hover lifts a card 0.3rem; the played card sits 0.5rem up with the yellow ring. A card that cannot be played stays white with its numeral receded and its shadow removed.

### Stage and band
- **Stage:** full-bleed Pool Aqua with the 32px grid. Holds the timer in the top right corner, the story title, any notice, and the result. After the reveal the result reads as one line in the display face (Low 3, High 13), the average beside it, then who holds Low and High.
- **The count:** takes the whole stage on a deep-water backdrop. One numeral a second, 3 then 2 then 1. Each number cuts in with no fade, settling from 1.22 scale to 1 over its second, while a 0.5rem yellow line sweeps the bottom edge from left to right, linearly, once per beat.
- **Band:** the same aqua and grid on every other page, holding an optional back link, the title and one line.

### Inputs / Fields
- **Style:** surface fill, 1.5px line border, 6px corners, at least 2.75rem tall. Labels sit above in weight 650. The select draws its own chevron to match.
- **Border:** `field-line`, a mid tone that reads as an edge at 3:1 or better on its surface (`#6c8088` light, `#71848b` dark). **Hover:** the border goes to ink. **Focus:** the shared 3px outline.
- **Radios:** native, tinted Pool Aqua.
- **Hints** are soft ink at 0.95rem. **Alerts** are a surface box with a red border and red text at weight 650; status messages the same box with a line border.

### Navigation
One bar in deep water for the whole site: the wordmark on the left, links in 0.95rem with underline on hover, the theme toggle on the right. In a room the same bar carries the room's own things in place of the site links: copy room link, History, Settings for moderators, then your name and role badge. There is never a second bar beneath it.

### Panels
- **Rail and history entries:** surface fill, 1px line border, 6px corners, padding about 1.1rem, no shadow.
- **Dialog:** the same, with the card shadow, up to 28rem wide, over a 55% ink backdrop. Cancel on the left, the confirming action on the right in yellow, or in red when it removes someone.
- **Tally:** one row per card value: the numeral, a 0.9rem track in the line colour with an aqua bar, then the count.

### Pointer ripple
Under a fine pointer, the tiles within about two tiles of the pointer brighten to at most 16% of the ripple colour and fade over roughly a second. It is drawn on one fixed canvas behind the page, aligned to the ground grid, and stops drawing when nothing is lit. It is off on touch devices and under reduced motion.

## Do's and Don'ts

### Do:
- **Do** give every screen one yellow button, and make it the next step. Move the yellow when the next step changes.
- **Do** open every page with a full-bleed field of Pool Aqua: the stage in the room, a band elsewhere.
- **Do** show a role as a badge after the name. A name is free text, so a role written in the same run of text could be forged by a name.
- **Do** pair red with the word it stands for.
- **Do** design and check both themes together; neither is the default.
- **Do** pass dynamic values to CSS through the `cssVar` action, which sets custom properties from script, and keep every other style in a stylesheet.
- **Do** take motion from stylesheets (`transition`, `@keyframes`) and the one canvas, and let `prefers-reduced-motion` reduce all of it.
- **Do** reserve the space for anything that appears later (the result, a flag), so its arrival moves nothing.
- **Do** set anything read across a shared screen in Big Shoulders at 800 or 900.
- **Do** draw disabled buttons with a dashed border, not lowered opacity.

### Don't:
- **Don't** write a `style` attribute, or use Svelte's `transition:`, `in:`, `out:` or `animate:` directives. The Content Security Policy blocks inline styles and they will fail silently in production.
- **Don't** use red for emphasis, errors of taste, or branding. It means High, Low, or "this deletes something".
- **Don't** put a second yellow button on a screen, and don't use yellow as a background tint or highlight.
- **Don't** seat people round a table, draw avatars, or round the cards into playing cards. The room is a row of judges with scorecards.
- **Don't** animate anything other than the count, the card turn, the lift of a hand card and the ripple. No entrance animations, no fades between states.
- **Don't** ease or fade the count. Each number replaces the last outright.
- **Don't** use shadows to separate panels, fields or buttons; use a 1px line.
- **Don't** load a font, image, script or sound from another origin. Everything is self-hosted.
- **Don't** change the scorecard for dark mode. It is white with black numerals in both themes.
- **Don't** add a third typeface.
