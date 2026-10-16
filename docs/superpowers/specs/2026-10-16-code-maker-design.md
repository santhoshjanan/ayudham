# Code Maker — Design

Date: 2026-10-16
Status: approved by the owner 2026-10-16, with the colour picker, Invert and the contrast warning added

## 1. Intent

A free maker of barcodes and 2D codes at `/codes`, the fourth tool in the pokerji suite. Someone picks a kind of code, types or fills in what it should hold, styles it, and copies or downloads it: a QR code for a business card, a Wi-Fi network, an event or a place; an EAN-13 for a product; a Data Matrix, Aztec, PDF417 or any other common symbology.

It is for anyone who needs a code and does not want to hand their data to a code website to get it.

### What the owner said

- The kinds of code: Aztec, Data Matrix, DotCode, MaxiCode, Micro QR, rectangular Micro QR, MicroPDF417, PDF417, QR; EAN/UPC; linear codes; QR codes for business cards, calendar events, Wi-Fi (network name, password, encryption) and map locations. "Add anything that is useful."
- QR options: Unicode, new lines, escape sequences, error correction levels, white space (the quiet zone), corner shapes, dot shapes, background and foreground colours.
- Colours chosen freely, a centre image or logo, and generated colours such as rainbow and other themes. "Surprise me."
- Copy the image; download a high-resolution PNG, JPG or PDF, or all formats in one ZIP.
- Privacy is the foundation. "No memory whatsoever. If at all, store in browser's local storage."
- Proven, privacy-respecting packages may be used, at the builder's judgement; fill the gaps ourselves.
- ShotCode and SpotCode are dropped: proprietary, never published, no longer read by anything.
- No batch mode (many codes from a list).
- The same design as the rest of the suite. Further UX direction goes through the Impeccable skill.
- The thing that would make the owner wince: "a sloppy, unpredictable performance".

### Success looks like

- Someone opens `/codes` and has a scannable QR code for a link on the clipboard in under ten seconds.
- Every code the page lets you export scans. A styled QR code with a logo either scans or the page says plainly why it may not, before export.
- Typing never stutters, and the preview never jumps: it keeps its place and size while it updates.
- No request the page makes carries anything typed, chosen or uploaded, and nothing is stored anywhere.

## 2. Goals, non-goals, anti-goals

**Goals**

- Every symbology in section 5, correct to its standard and proven to scan by the test suite.
- Structured QR content (business card, event, Wi-Fi, location and the others in section 6) built correctly, with the escaping each format needs.
- Rich styling for matrix codes: colours, themes, gradients, dot shapes, corner shapes, a centre logo.
- Exports: Copy (PNG), PNG and JPG at a chosen resolution, vector PDF, vector SVG, and a ZIP of all four.
- Fast and predictable, by the measures in section 10.

**Non-goals (version one)**

- Batch generation from a list.
- Remembering anything between visits (a later, opt-in "remember my style" in local storage is possible and needs nothing else to change).
- Reading or scanning codes from an image or the camera.
- Looking up an address to find its coordinates (it would need an outside service).
- ShotCode, SpotCode and other unpublished symbologies.
- The other symbologies `bwip-js` supports (postal, composite, HIBC and the rest). The owner, 2026-10-16: offering specialty codes this site cannot prove scan is not worth it. Only the curated list in section 5 is offered.

**Anti-goals: this would be a failure even if it worked**

- Any request carrying what was typed or uploaded, to this site or any other.
- Short links, redirect links, "dynamic" QR codes or scan counting. A code made here points exactly where the person said, and this site is never in the path.
- An export that looks right but does not scan, with no warning.
- A preview that freezes the page, flickers, or changes size while typing.
- Anything stored: no local storage, session storage, cookie, or content in the address.

## 3. Constraints

- The suite's rules in `CLAUDE.md` hold: no server code for this tool, strict Content Security Policy (no change to it), no inline styles, tokens only, both themes to the same standard, nothing loaded from another site.
- The page draws its tools only after it has mounted in the browser, as `/text` does, so the server never makes a code.
- The design follows `DESIGN.md` ("Judges' Row"). The owner's standing instruction for new tools: keep the existing design, add only missing components, matching the existing ones. A design direction for this page is written through the Impeccable skill before the page is planned.
- English only.

## 4. Architecture (the builder's calls, stated)

### Where things live

```
packages/code-maker        content builders, escape handling, symbology catalogue,
                           QR styling geometry, colour themes, scannability checks,
                           SVG and PDF writers, ZIP assembly; no DOM, no I/O
apps/web/src/routes/codes  the page
apps/web/src/lib/codes     its components and its worker
```

`packages/code-maker` follows `packages/text-tools`: plain TypeScript, Vitest, a purity test. It may import only its own files, `bwip-js` and `fflate`.

### Packages

| Package | Version at writing | Licence | Dependencies | Use |
|---|---|---|---|---|
| `bwip-js` | 4.11.4 | MIT | none | encoding every symbology; drawing the ones not styled here |
| `fflate` | 0.8.3 | MIT | none | the ZIP; compression inside the PDF |
| `pdf-lib` | 1.17.1 | MIT | four | **tests only**: every PDF this tool writes must load in it |
| a barcode decoder (ZXing's, as `zxing-wasm` or `@zxing/library`; the plan picks after review) | — | Apache-2.0 | — | **tests only**: every code the tests make is decoded and compared with its input |

Before adding each, the plan reads its source for any network, storage, timer-based or tracking call and records the result. Versions are pinned and must satisfy pnpm's minimum release age. `pdf-lib` is not shipped: it has not been released since 2022, so the PDF writer is ours (section 9).

### The worker

`bwip-js` is large and encoding a big symbol takes time, so encoding and drawing happen in a Web Worker served by this site, as the text converters do: only the latest request is worked on, keystrokes meanwhile replace it, and the last code stays on screen until the next arrives. `bwip-js` is loaded inside that worker the first time a code is made, so it never delays the page itself. Where workers are missing, the same functions run on the page.

### The preview

The finished code is shown as an image whose source is the SVG as a `data:` address. An SVG shown as an image cannot run script or load anything, so even text that reached it unescaped could do no harm, and `img-src 'self' data:` already allows it. Typed text is never inserted into the page as markup.

The preview sits in a box of fixed size. A new code replaces the old one in place; nothing around it moves.

## 5. Symbologies

### 2D

QR (Model 2, versions 1 to 40), Micro QR (M1 to M4), rectangular Micro QR (rMQR), Aztec (compact and full), Aztec Rune, Data Matrix (square and rectangular, including DMRE sizes), DotCode, MaxiCode (modes 2 to 6), PDF417 (standard and compact), MicroPDF417.

### Product codes

EAN-13, EAN-8, UPC-A, UPC-E, ISBN-13, ISSN, each with optional 2- and 5-digit add-ons. The check digit is worked out if left off; a wrong one is reported, never silently replaced.

### Linear

Code 128 (automatic subsets), GS1-128, Code 39, Code 39 extended, Code 93, Interleaved 2 of 5, ITF-14, Codabar, MSI, Code 11, Pharmacode. GS1 DataBar Omnidirectional, Limited and Expanded.

### Options per family

| Family | Options |
|---|---|
| QR | error correction L, M, Q, H; version automatic or fixed; mask automatic or fixed; quiet zone 0 to 10 modules (warning below 4) |
| Micro QR and rMQR | version, error correction where the standard allows |
| Aztec | error correction percentage, layers automatic or fixed, compact or full |
| Data Matrix | square or rectangular, size automatic or fixed |
| PDF417 | columns, rows, error correction level 0 to 8, compact |
| MicroPDF417 | columns |
| MaxiCode | mode, and the structured carrier message for modes 2 and 3 |
| DotCode | columns or aspect ratio |
| Product and linear | bar height, module width, human-readable text on or off, check digit shown or hidden, quiet zones |

## 6. What a QR code can hold

Each kind has its own form; the page builds the text a scanner expects, with that format's escaping, and shows it.

| Kind | Fields | Written as |
|---|---|---|
| Text | free text | as typed |
| Link | address | the address; a missing `https://` is offered, never added silently |
| Business card | name, organisation, title, phones, emails, website, address, note | vCard 3.0, or MECARD (shorter, so a smaller code); the person chooses |
| Event | title, start, end, all day, time zone, place, description | iCalendar `VEVENT` |
| Wi-Fi | network name, password, encryption (WPA/WPA2/WPA3, WEP, none), hidden network | `WIFI:` with its escaping of `\ ; , : "` |
| Location | coordinates, or an address | `geo:` with coordinates; an address as `geo:0,0?q=…`, or as a link to OpenStreetMap, Apple Maps or Google Maps, the person's choice. The page never contacts any of them |
| Email | to, subject, body | `mailto:` |
| SMS | number, message | `SMSTO:` |
| Phone | number | `tel:` |

### Text options (every kind that takes text)

- **Unicode.** Text is encoded as UTF-8. The builder's call, by symbology:
  - QR, Aztec, Data Matrix, PDF417, MaxiCode and DotCode: non-ASCII text carries the ECI header that says "UTF-8" by default, with an option to leave it out for old readers.
  - Business card, Wi-Fi and the other structured QR kinds: no ECI header by default, because the phone camera apps that read them expect plain UTF-8; the same option turns it on.
  - Micro QR and rMQR cannot carry an ECI header: their text is written as plain UTF-8 bytes, and the page says that some readers may show non-ASCII characters wrongly.
  - Linear and product codes that cannot carry a character refuse it with a sentence naming the character; nothing is replaced silently.
- **New lines.** Kept as typed; a choice between LF and CRLF where a format cares.
- **Escape sequences**, off by default: `\n`, `\r`, `\t`, `\\`, `\xHH` and `\u{H…}` are read as the characters they name. A malformed sequence is reported, not passed through.
- **White space.** Kept exactly; an option trims leading and trailing space.
- **GS1 data** for the symbologies that carry it: application identifiers in brackets, checked.

## 7. Styling

Matrix codes drawn from their grid (QR, Micro QR, rMQR, Data Matrix, Aztec) are drawn here, from the grid `bwip-js` returns, so they can be styled. The rest are drawn by `bwip-js` and take colours, quiet zone and size.

- **Dot shapes:** square, rounded square, circle, diamond, connected (neighbouring dots join smoothly), vertical bars, horizontal bars.
- **Corner shapes (QR family's three finder patterns):** outer ring square, rounded, circle or leaf; inner eye square, rounded, circle or diamond. Corners may take their own colour.
- **Colours:** foreground, background (or transparent), corner colour; solid, or a linear or radial gradient. Every colour is chosen with a colour picker (the browser's own) beside a field for a hex value, and colours apply to every symbology, not only matrix codes.
- **Invert:** one press swaps foreground and background (owner, 2026-10-16).
- **Themes:** Rainbow (hue across the code), Sunset, Ocean, Forest, Pool (the suite's aqua), Ink, Neon, and **Surprise me**: a random palette drawn from the browser's cryptographic random source, redrawn until it passes the contrast check.
- **Centre logo:** an image from the person's own device (PNG, JPG, WebP or SVG, at most 5 MB). Size as a share of the code; a cleared plate behind it, with padding and a square, rounded or circular shape. Choosing a logo raises error correction to H unless the person has fixed it.

### Scannability, checked before export

- **Contrast (owner, 2026-10-16).** When foreground and background fall below WCAG 2.2 AA contrast, the page warns. The builder's call on the threshold: 4.5:1, the AA figure for text, because product and linear codes carry human-readable text and scanners need more contrast than the 3:1 AA asks of graphics. With a gradient or theme, the weakest pair is the one measured. Themes and Surprise me never fall below it. A transparent background is measured against white, and the warning says so. Light-on-dark codes (after Invert, for example) carry a second warning: some readers cannot read them. Export is refused only below a lower floor that the decoding tests show scanners cannot read.
- **Logo size.** The modules a logo covers must stay well inside what the chosen error correction can recover; past that, export is refused with the reason.
- **Quiet zone.** Below the standard's minimum, a warning.
- **Read-back.** Where the browser has a built-in barcode reader (the `BarcodeDetector` interface, today mainly Chrome on macOS, Android and ChromeOS), the page reads its own rendered code back and says whether it matched. Where it has none, the page says so; no decoder is shipped for this.
- **Proven in tests, not hoped for.** For most visitors read-back is unavailable, so the guarantee comes from the test suite (section 13): every curated symbology, every dot shape, every corner shape and every theme is decoded there, and logos are decoded at the coverage limit. A style or combination the tests cannot decode reliably is not offered. The checks above then hold each export inside the space the tests proved.

## 8. Output

- **Copy:** a PNG on the clipboard, the only image format browsers accept there.
- **PNG and JPG:** at a pixel size, or a print size with 300 or 600 dpi; at most 10,000 pixels on a side. JPG has no transparency: a transparent background becomes the chosen background colour, white by default.
- **SVG:** vector.
- **PDF:** vector, one page the size of the code plus its quiet zone, or centred on A4 or US Letter.
- **All formats:** one ZIP with PNG, JPG, SVG and PDF.
- File names come from the kind of code and the time, never from what was typed.
- A logo goes into SVG and PDF as a raster image, never as pasted SVG markup, so an uploaded SVG cannot carry script into a downloaded file.

## 9. The PDF writer

Ours, small, in the package: one page, filled paths and rectangles in the code's colours, gradients as PDF shadings, and at most one raster image (the logo) compressed with `fflate`. Tests check structure and cross-reference offsets, and that every PDF the tests produce loads in `pdf-lib`.

## 10. Performance (the owner's first concern)

Measured in browser tests against a production build, as the text tools are:

- The page is usable before `bwip-js` has loaded; the first code appears within one second of opening on a mid-range laptop.
- No keystroke takes longer than 50 ms to be handled and painted, whatever the code.
- A typical code (a link, a business card, an EAN-13) updates within 100 ms of the last keystroke.
- The largest symbols (QR version 40 at H, a full PDF417) update without freezing the page; while one is being worked on, the last code stays and the preview never empties.
- A 600 dpi PNG at the size limit is ready within three seconds, with a visible "making" state; the page stays responsive meanwhile.
- The same input always gives the same code: identical options produce identical files, apart from Surprise me, whose palette is shown and kept until the person asks again.

## 11. Privacy and data

| Data | Where | For how long | Who can read it |
|---|---|---|---|
| Typed content and options | the page's memory and its worker | until the tab closes | the person at the browser |
| An uploaded logo | the page's memory, read from the file on the device | until replaced or the tab closes | the person at the browser |
| A copied image | the clipboard | as long as the device keeps it | whatever that device allows |
| A downloaded file | where the browser saves it | the person decides | the person |

The server receives the request for the page and, once a code is made, for the worker script. Neither carries anything typed, chosen or uploaded. The tool sets no cookie, stores nothing in the browser, adds no metric and logs nothing. The address names at most the kind of code, in the fragment.

Trust boundaries: typed text and uploaded files are untrusted input to the package and the page; every limit is checked, nothing throws, files are decoded only by the browser's image decoder, and nothing typed is ever inserted as markup.

## 12. Failure behaviour

Each failure is a sentence in the status box, never a blank or a broken image: text too long for the chosen symbology or version (with how much too long), characters a symbology cannot carry, a wrong check digit, a malformed escape sequence, a logo too large or unreadable, contrast too low, the worker failing (the page carries on without it), the clipboard refused, an export too large.

## 13. Testing

- **Package:** every content builder against reference payloads (vCard, MECARD, iCalendar, `WIFI:`, `geo:`, `mailto:`, `SMSTO:`, `tel:`), including every escaping rule; escape-sequence reading; check digits; the styling geometry; theme contrast; logo coverage; the SVG writer's escaping; the PDF writer's structure, with every PDF loading in `pdf-lib`; the ZIP; limits; a purity test; no function throws.
- **Decoding:** in a browser test, each curated symbology and each QR content kind is rendered by the production build and decoded by the test-only decoder, and the decoded text must equal the input. The same for each dot shape, corner shape and theme, and for logos at the largest size the page allows.
- **Browser:** no request carries anything typed or uploaded; nothing is stored; the server's HTML holds no code; the Content Security Policy holds; every export downloads and opens (PNG, JPG and ZIP read back, PDF loads, SVG parses); Copy puts a PNG on the clipboard; the timings in section 10; both themes and a phone width; WCAG 2.2 AA.
- **Review:** the Octopus code review and security audit before merge.

## 14. Order of work

1. The owner approves this document.
2. The plan for `packages/code-maker` (no page), written and carried out.
3. The design direction for `/codes`, through the Impeccable skill, holding to the existing design.
4. The plan for the page, the site changes, browser tests and the reviews, written against the package's real interfaces and the approved direction.

## 15. Left to the builder

- The page's layout, controls and wording, through the Impeccable design direction.
- How the catalogue is grouped on the page.
- The exact contrast floor and logo-coverage limit, from the standards and testing with real scanners.
- Which further QR content kinds, symbology options and themes beyond those listed are worth including.
- Defaults for every option.
