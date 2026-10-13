# Schema Markup Builder — Design Direction

Date: 2026-10-13
Status: confirmed by the owner 2026-10-13
Companion to: `2026-10-13-schema-builder-design.md` (behaviour), `/DESIGN.md` (the visual system) and `/PRODUCT.md` (product truth)

The owner's instruction for this page: hold on to the existing design, and add only the components that are missing, matching the existing ones. So this is not a new direction. It says how the builder is assembled from "Judges' Row" as `DESIGN.md` records it, and names the few pieces that system does not have yet.

## 1. Job and audience

Someone building structured data for their own site: a site owner or marketer who does not know the vocabulary, or a developer who does. They work alone, usually at a desk, sometimes checking a result on a phone. Visitor mode is Operate: scanning and filling in come before expression.

## 2. Outcome

Fill in a form, watch the markup form beside it, copy it. Success is markup on the clipboard without the person having read any documentation, and a clear statement of what is still missing.

## 3. Direction

- Visual authority is `DESIGN.md` as it stands. No token in `apps/web/src/app.css` changes and no existing component is restyled. Planning poker's pages render as they do today.
- The page is a sibling of the live room: a band in place of the stage, then a floor and a rail.
- Copy is the page's one yellow button. Red appears only on Remove and Clear, always with the word.
- Motion is what the system already allows. Sections open and close without animation.
- Findings are never red and never told apart by colour alone: a badge and wording carry the difference.

## 4. Layout

- **From 64rem:** the editor in the column on the left; the markup, its controls and the findings in a rail on the right that stays in view while the editor scrolls. The rail is wider than the moderator's, because markup needs the room. That width is the one new measurement.
- **Below 64rem:** the editor alone in the column, and a dock on the bottom edge holding Copy at full width and a "Markup" button that opens the markup and findings as a sheet, as the moderator's More button does.
- The footer stays on this page. The page reserves space beneath itself so the dock never covers it.
- Content is left-aligned and shares the band's gutter, as everywhere else.

## 5. Components

### Reused unchanged

| Need | Existing piece |
|---|---|
| Page opening | The band: title and one line |
| Text, URL, number and date fields | Inputs, labels above, hints in soft ink |
| Choice fields and the choice of a value's kind | The select with its own chevron |
| Copy | The primary button, through `CopyButton` |
| Script tag / raw JSON | Two toggle buttons; the pressed one holds the inverted fill |
| Download, Add an item, Add another | Default buttons |
| Remove an item, Clear | Destructive buttons |
| Confirm Clear, removing a referred-to item, changing a type | The dialog |
| Required and Recommended | Role badges: filled for Required, outlined for Recommended, none for optional |
| An item | The panel: surface, 1px line, 6px corners, no shadow |
| Findings | Ruled ledger rows, as the home page's promises |
| Markup not there yet | A dashed outline, the system's "not yet" |
| A limit reached, storage unavailable, vocabulary failed | The status box; disabled controls drawn dashed |
| The dock and its sheet | The room's dock and More sheet |

### Added, in the same language

- **Code block.** A surface panel holding the markup in the system monospace, which the Two Faces Rule already assigns to code. Two inks and no new colour: property names in ink at label weight, values in ink, punctuation in soft ink. It scrolls sideways inside itself; the page never does.
- **Search with results.** For picking a type or a property from the vocabulary. An ordinary field; matches appear as a short list directly beneath it in the flow of the page, each with its one-line description. Nothing floats over the page.
- **Nested group.** An item inside an item: a `fieldset` with its legend, stepped in from its parent, bounded by a 1px line. No shadow, and no panel inside a panel.
- **Compact button.** For Up, Down and Remove on repeated values and items, at the height the bar's copy button already uses, with words, not icons.
- **Multi-line field.** The input's style on a `textarea`, for descriptions and other long text.
- **Yes or no.** No new control: the existing select with three answers (Not set, Yes, No). A checkbox, first planned here, cannot tell "no" from "not said".

## 6. States

- Empty draft: the ten types offered as a choice, with "Another type" after them; the dashed outline where the markup will be.
- One item; many items; nesting to five levels; long values; many values of one property.
- A limit reached: the control that would pass it is disabled, with the limit stated.
- The vocabulary loading, loaded, and failed with a retry.
- Local storage unavailable: one notice.
- No JavaScript: the band, the explanation, the list of supported types and the privacy statement, with a line saying the builder needs JavaScript.
- Both themes, each of the above.

## 7. Accessibility

- Every input has a visible label. A field's hint, badge and finding are tied to it for screen readers.
- A finding is a button that opens its item and moves focus to its field.
- The dock, the sheet and the search results are reachable and operable by keyboard. The sheet returns focus to the button that opened it.
- Copy announces its result through a live region.
- WCAG 2.2 AA in both themes. Reduced motion needs nothing extra, since nothing here moves.

## 8. Constraints

- No inline styles: no `style` attributes and no Svelte `transition:`, `in:`, `out:` or `animate:` directives. How far a nested group steps in comes from classes or the `cssVar` action.
- No raw colours in components; tokens only.
- Nothing loaded from another origin.

## 9. Left to the build, within these rules

- The rail's exact width.
- How far each level of nesting steps in on a narrow screen.

## 10. Outside this page

Only what the behaviour spec lists: one more link in the top bar, in the style of the two there; a second row in the home page's tool list, in the existing row's layout, with the widened hero wording; a new section of text on the privacy page.
