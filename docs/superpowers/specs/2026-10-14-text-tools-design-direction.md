# Text Tools — Design Direction

Date: 2026-10-14
Status: layout and home heading chosen by the owner 2026-10-14; this document awaits the owner's review
Companion to: `2026-10-14-text-tools-design.md` (behaviour), `/DESIGN.md` (the visual system) and `/PRODUCT.md` (product truth)

The owner's standing instruction for a new tool: hold on to the existing design, and add only the components that are missing, matching the existing ones. So this is not a new direction. It says how the text tools are assembled from "Judges' Row" as `DESIGN.md` records it, and names the two pieces that system does not have yet.

## 1. Job and audience

Someone in the middle of other work who needs one thing: a password, an identifier, a name in another case, a decoded value. Most often a developer or an administrator at a desk; sometimes on a phone. They arrive, take the result and leave. Visitor mode is Operate: finding the tool and copying the result come before expression.

## 2. Outcome

Open the page and have a strong password on the clipboard with one press. For any other tool: one press to choose it, then type or adjust, then copy.

## 3. Direction

- Visual authority is `DESIGN.md` as it stands. No token in `apps/web/src/app.css` changes and no existing component is restyled. Planning poker and the markup builder render as they do today.
- The page is a sibling of the markup builder: a band, then a floor (what you set or type) and a rail (what you take away).
- The rail's first control is the page's one yellow button, and it is always the next step: **Generate again** on a generator, **Copy** on a converter with one result, **Copy all** on a converter with several.
- Red is not used on this page. Nothing here deletes anything, and a refusal is a sentence in the status box.
- Nothing animates. A result replaces the last outright, as the count does.
- Strength is a sentence ("128 bits"), never a meter, a bar or a colour.

## 4. Layout

- **The band:** the heading "Text tools" and one line, sharing the floor's gutter as the builder's does.
- **The tool rows:** directly under the band, two rows, each headed by its group: Generate, then Convert. Each row is a set of buttons that wraps, as the builder's "Add an item" row does. The open tool's button holds the inverted fill.
- **From 64rem:** two columns beneath the tool rows, with the builder's measurements. On the left the floor, up to 40rem: the tool's name, one line about it, then its options or its text box. On the right the rail, between 22rem and 36rem, which stays in view while the floor scrolls: the yellow button, the strength line where there is one, then the results.
- **Below 64rem:** one column. The rail's contents follow the floor's. There is no dock: a generator's options are short, so its results are already close, and a dock would cover the text a person is typing into a converter.
- **Beneath both:** the "about" text in the 40rem column, opened by a ruled line, as on the builder.
- The page never scrolls sideways. A long result wraps inside its row.

## 5. Components

### Reused unchanged

| Need | Existing piece |
|---|---|
| Page opening | The band: title and one line |
| A group's heading (Generate, Convert) and the open tool's name | The title face, as "Add an item" and an item's type are set |
| Length, how many, words, sides, bounds | The number input, label above, limits in the hint |
| Kind, separator, order, direction of encoding | The select with its own chevron |
| On or off (lowercase, digits, no look-alikes, capitals, trim, number the lines) | The toggle button: pressed holds the inverted fill, as Script tag and Raw JSON do |
| Typed text | The multi-line field |
| Own alphabet | The text input |
| Generate again; Copy; Copy all on a converter | The primary button, through `CopyButton` where it copies |
| Copy all on a generator; Shuffle again | Default buttons |
| A row's own Copy | The compact button, through `CopyButton` |
| Results not there yet | A dashed outline, the system's "not yet" |
| A refusal, a limit, the word list failing, no random source | The status box, with a default button for Try again |
| What the tools do, where the text goes, the word list's credit | Body text and the hint, as on the builder |

### Added, in the same language

- **Tool row.** A `nav` holding links drawn as the system's toggle buttons, in a row that wraps. The link to the open tool carries `aria-current` and the inverted fill the pressed toggle has. They are links, not buttons, because each names a place: the fragment for that tool. Derived from the Script tag and Raw JSON pair and the "Add an item" row.
- **Result row.** One result on a ruled line, as a finding is: an optional name in the label style and soft ink (a case form, a hash, a count), the value in the code block's monospace at 0.875rem in ink, and a compact Copy at the right. The value wraps anywhere, so nothing is cut short and nothing scrolls sideways. A row with no value to copy (a count) has no button. Derived from the findings ledger, the code block's type and the compact button.

No checkbox is added. An on-or-off option is the toggle button the system already has.

## 6. States

- Arriving: Password open with one result, and Generate again in yellow.
- Each of the twelve tools open, with its defaults.
- A generator making one result, several, and one hundred.
- A long result (256 characters, a 128-byte hex string) wrapping in its row.
- A converter before anything is typed: the dashed outline in the rail, and no yellow button drawn as ready (it is disabled, with the dashed border).
- A converter with text; with text at the limit; with text over the limit (the status box, no results).
- A value that cannot be decoded: the status box says what is wrong; the rail shows the dashed outline.
- Decoded bytes that are not text: the result row holds the hex, and a hint says so.
- An option outside its limits: the status box names the limit; the last good results stay.
- The word list loading, loaded, and failed with Try again.
- No random source; no hashing: the status box in that tool, the other tools unaffected.
- The clipboard refused: a line beside the button, as on the builder.
- No JavaScript: the band, a line saying the tools need JavaScript, and the "about" text.
- Both themes, and a phone width, each of the above.

## 7. Accessibility

- The tool rows are one `nav` named "Tools", with each group's heading inside it. The open tool's link has `aria-current="true"`.
- Choosing a tool moves nothing but the page beneath the rows; focus stays on the link, so a keyboard user can step through tools.
- Every input has a visible label. A hint or a limit is tied to its field.
- A toggle button states its condition with `aria-pressed`, never by colour alone: the fill inverts.
- Generating announces once through a live region ("5 passwords made"). A converter's results are not announced on each keystroke; its refusals are, through the status box.
- Copy announces its result through the live region `CopyButton` already has. Each row's Copy is named for its row ("Copy snake case").
- Results are selectable text, so they can be copied by hand.
- WCAG 2.2 AA in both themes. Reduced motion needs nothing extra, since nothing here moves.

## 8. Constraints

- No inline styles: no `style` attributes and no Svelte `transition:`, `in:`, `out:` or `animate:` directives.
- No raw colours in components; tokens only.
- Nothing loaded from another origin.
- Every field sets `spellcheck="false"`, `autocomplete="off"`, `autocapitalize="off"` and `autocorrect="off"`.

## 9. Left to the build, within these rules

- Whether the rail's results list scrolls inside itself when one hundred results are made, or the page grows. Whichever keeps the yellow button in view.
- The order of options within each tool's floor.
- The wording of each tool's one line and each hint.

## 10. Outside this page

- **The bar:** a fourth link, "Text tools", in the style of the three there. Check at phone width that the bar still fits on one line; if it does not, the fix is in the bar's own layout, not a new component.
- **The home page:** the heading becomes "Small tools, without the sign-up." (chosen by the owner). The line beneath it stays. The programme gains a third row in the existing row's layout: "Text tools", one sentence, and its own yellow link, "Open the tools", under the Row's Own Step Rule. The page's title and description name all three tools.
- **The privacy page:** a new section of text, as the builder has.
- **`DESIGN.md`:** a section for the text tools recording the two added components, written after the build from what was built.
