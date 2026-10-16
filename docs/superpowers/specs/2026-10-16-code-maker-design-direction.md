# Code Maker — Design Direction

Date: 2026-10-16
Status: floor layout and kind picker chosen by the owner 2026-10-16; this document awaits the owner's review
Companion to: `2026-10-16-code-maker-design.md` (behaviour), `/DESIGN.md` (the visual system), `/PRODUCT.md`, and the text tools' direction (`2026-10-14-text-tools-design-direction.md`), whose patterns this page reuses

The owner's standing instruction for a new tool: hold on to the existing design, and add only the components that are missing, matching the existing ones. This page is a sibling of the text tools and the markup builder. It names the four pieces the system lacks.

## 1. Job and audience

Someone who needs a code for something real: a QR code for a menu, a Wi-Fi card for guests, a business card, a product barcode for a label. They work at a desk, sometimes on a phone. They want to see the code change as they work and take away a file that prints sharply. Visitor mode is Operate.

## 2. Outcome

A scannable QR code for a link on the clipboard in under ten seconds. For anything more, the code is visible beside every choice, so a person sees what each change does, and the page says plainly whether the result will scan before they take it away.

## 3. Direction

- Visual authority is `DESIGN.md` as it stands. No token changes; nothing existing restyled.
- The page is a band, the kind picker, then a floor (what goes in the code and how it looks) and a rail (the code itself and what to do with it).
- The yellow button is **Copy image**, the rail's first control, under the preview. It becomes disabled (dashed) when a check refuses export.
- Red is not used on this page. A refusal is words in the status box.
- Nothing animates. A new code replaces the old in place.
- The code's own colours are content, not interface: they appear only inside the preview and the theme chips, set through the `cssVar` action, never as raw colours in a stylesheet.

## 4. Layout

- **Band:** "Barcodes and QR codes" and one line ("Make a code for a link, a Wi-Fi network, a business card or a product. Nothing you type or add leaves your browser.").
- **Kind picker (owner's choice):** the nine QR kinds as a tool row headed "QR code" (Link, Text, Business card, Event, Wi-Fi, Location, Email, SMS, Phone), then "Other codes": one select with three groups (2D, Product, Linear) holding every other symbology. Both change the fragment (`#qr-wifi`, `#ean-13`); the fragment is matched against the fixed list.
- **Floor (owner's choice): ruled sections on one page**, each headed in the title face and separated by a 1px rule, all visible as one scrolls:
  1. **Content:** the kind's own fields (a business card's name, phones, emails…; Wi-Fi's network, password, encryption, hidden). For a symbology, one text field, and a "Text options" fold (escapes, trim, line endings, the UTF-8 marker) using the builder's `details` pattern.
  2. **Options:** the symbology's own options from the catalogue (error correction, size, columns, bar height, show the text). Only what applies to the kind chosen.
  3. **Look:** theme chips; foreground, background and corner colours, each with a colour picker and a hex field; Invert; solid, linear or radial fill. For matrix codes, dot shapes and corner shapes (ring and eye). For bars and stacked codes, colours and quiet zone only, and a line saying why.
  4. **Logo** (matrix codes only): Choose image, size, padding, plate shape, Remove. The line under it says the image stays on this device.
  5. **Size:** pixels, or print size with 300 or 600 dpi; PDF page (fit, A4, US Letter).
- **Rail, from 64rem:** sticky, as the builder's and the text tools' are: the preview box, Copy image (yellow), a row of downloads (PNG, JPG, SVG, PDF, All as ZIP), the read-back line, then the findings.
- **Below 64rem: one column, rail first.** The preview and Copy come straight after the kind picker, before the floor, so a person on a phone sees the code first; they scroll down to change it. No dock: a dock would cover the fields being typed into.
- **Beneath:** the "about" text in the 40rem column, as on the other tools, with the privacy statement and the licences of what is bundled.

## 5. Components

### Reused unchanged

| Need | Existing piece |
|---|---|
| Band, about text | As on `/text` and `/schema` |
| QR kinds | The text tools' tool row (links drawn as compact buttons, `aria-current`) |
| Other codes, fills, encryption, page size, dpi | The select with its own chevron |
| Section headings | The title face, ruled above, as the builder's sections |
| Text options | The builder's `details` fold |
| Fields, numbers, long text | Inputs, `NumberField`, `TextBox` from the text tools |
| On-or-off options (show text, hidden network, escapes) | The toggle button |
| Dot shapes, ring, eye | Toggle buttons in a wrapping row, with words, not icons |
| Invert, Remove logo, downloads | Compact buttons |
| Copy image | The primary button |
| Findings | The builder's findings ledger with its badges: Check for a warning, and a filled badge for one that stops export |
| Not there yet | The dashed outline, inside the preview box |
| Refusals | The status box |

### Added, in the same language

- **Preview box.** A square panel (surface, 1px line, the system radius) of fixed size, so nothing around it moves: the full rail width up to 36rem on desktop, the column width on a phone. The code is an `img` whose source is the SVG as a `data:` address, centred and contained. Its `alt` says what kind of code it is and what it holds, cut short at 60 characters.
- **Transparency board.** When the background is transparent, the preview box shows a checkerboard in two existing tokens (`--line` on `--surface`), so transparent is visibly different from white.
- **Colour field.** A label, a square swatch (the browser's colour picker, 2.75rem, bordered as a field) and a hex text field beside it, kept in step. Typing an invalid hex shows the field's status, not black.
- **Theme chip.** A compact toggle button whose small square sample shows the theme's colours (a gradient where the theme has one), with the theme's name in words beside it. The sample's colours are set through `cssVar`. Surprise me is the last chip; pressing it again draws again.

## 6. States

- Arriving: Link chosen, the field empty, the preview showing the dashed "not there yet" outline and Copy disabled.
- A typed link: the code appears; Copy turns yellow.
- Each QR kind's form, filled; each family of symbology (matrix, stacked, bars, product).
- Every refusal in words (too long, a character it cannot carry, a wrong check digit, a malformed escape), with the preview keeping its last good code under the status box, marked as old.
- Warnings in the findings: low contrast, light on dark, small quiet zone, transparent measured as white, no UTF-8 marker.
- A refusal that stops export (contrast too low, logo too large): Copy and downloads dashed and disabled, the reason in the findings.
- A logo chosen; a logo too large; a logo file refused (too big, not an image).
- Read-back: matched, did not match, or not available in this browser.
- Exporting a large PNG: the download button says "Making…" and the page stays usable.
- The worker unavailable: everything still works, more slowly, with no notice needed.
- No JavaScript: the band, a line saying the maker needs JavaScript, and the about text.
- Light and dark, desk and phone, each of the above.

## 7. Accessibility

- The kind row is a `nav` named "QR code kinds"; the other codes select has a visible label.
- Every field is labelled; each colour field's swatch and hex input share one label and describe the same value.
- Toggle buttons state their condition with `aria-pressed`.
- The preview's `alt` is updated with the code; the findings are announced politely when they change, not on every keystroke.
- Copy announces its result; a download announces when its file is ready.
- Focus never jumps when the code updates.
- WCAG 2.2 AA in both themes. Nothing moves, so reduced motion needs nothing extra.

## 8. Constraints

- No inline styles: no `style` attributes and no Svelte `transition:`, `in:`, `out:` or `animate:`. Theme samples and any dynamic value go through `cssVar`.
- No raw colours in components, apart from the code's own colours reaching the preview as data.
- Nothing loaded from another origin. The preview never uses `{@html}`.
- Every text field sets `spellcheck="false"`, `autocomplete="off"`, `autocapitalize="off"`, `autocorrect="off"` and `translate="no"`; so does the rail.

## 9. Left to the build, within these rules

- The preview box's exact size on each width.
- The order of fields within each QR kind's form.
- Wording of hints and of each finding.

## 10. Outside this page

- **The bar:** a fifth link, "Codes", in the style of the others; hidden on a phone like them.
- **The home page:** the heading stays "Small tools, without the sign-up." A fourth programme row: "Barcodes and QR codes", one sentence, and its own yellow link, "Make a code". The title and description name the tool.
- **The privacy page:** a section in the text tools' manner, including that a chosen logo is read on the device and never sent.
- **`DESIGN.md`:** a section for the code maker recording the four added components, written after the build from what was built.
