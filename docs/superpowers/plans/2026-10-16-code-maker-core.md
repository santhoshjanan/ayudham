# Code Maker Core (Plan 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/code-maker`: everything the code maker knows (content payloads, text preparation, the symbology catalogue, encoding through bwip-js, styling geometry, colour and themes, scannability checks, and the SVG, PDF and ZIP writers), with every curated code proven to decode.

**Architecture:** A pure TypeScript package in the style of `packages/text-tools`: no DOM, no I/O. bwip-js is passed in as an argument (`Bwip`), so the page can load it lazily inside its worker and the package itself ships no encoder. Every code becomes one `Drawing` (paths in a small absolute `M L C Z` grammar plus paints and an optional logo), which the SVG writer, the PDF writer and, in Plan 2, the browser canvas (`Path2D`) all draw identically.

**Tech Stack:** TypeScript 7, Vitest 5, pnpm 11, Node 24+. Runtime dependency: `fflate@0.8.3`. Development only: `bwip-js@4.11.4`, `zxing-wasm@3.1.5`, `pdf-lib@1.17.1`.

**Spec:** `docs/superpowers/specs/2026-10-16-code-maker-design.md` (read it; sections 4 to 13 are this plan's authority).

## Facts established on 2026-10-16 while writing this plan

Probed in Node against the published packages (in a scratch folder, not the repository):

- `bwip-js` has a platform-neutral entry, `bwip-js/generic`. Its **default export** carries `raw(bcid, text, options)`, `render(options, drawing)`, `toSVG(options)` and `FontLib`. The named export `raw` is a symbology of that name; do not use it.
- `raw` returns `[{ pixs, pixx, pixy, width, height }]` for grid symbologies: `pixs` is row-major, `1` dark. Linear and product codes return `[{ sbs, bhs, bbs, txt }]`. MaxiCode returns `pixs` only (a hexagonal layout) and DotCode returns a grid of dots; both are drawn through `render`, not styled.
- `toSVG` draws human-readable text as filled paths (glyphs from `FontLib.getpaths`), never as `<text>`. bwip-js's own `DrawingSVG` (`dist/bwip-js-gen.mjs`, from line 1748) is the reference for a drawing context.
- Errors are thrown as `Error('bwipp.<code>#<n>: <message>')`, e.g. `bwipp.qrcodeInputTooLong`, `bwipp.ean13badCheckDigit`, `bwipp.code39badCharacter`, `bwipp.qrcodeNoValidSymbol`, `bwipp.qrcodeRMQRwithoutVersion`.
- **Text.** A plain JavaScript string is encoded as UTF-8 without an ECI marker, and decodes correctly. UTF-8 **with** an ECI marker is the text `'^ECI000026' + bytes`, where `bytes` is the UTF-8 encoding written one character per byte with every `^` as `^094`, and options `{ parsefnc: true, binarytext: true }`. Decoded with the marker present for QR, rMQR, Data Matrix, Aztec and PDF417. Micro QR refuses it.
- Speed: QR version 40 at level H took 62 ms; PDF417 of 1,000 characters 20 ms; a small QR 2 ms.
- The test decoder `zxing-wasm` reads QR, Micro QR, rMQR, Data Matrix, Aztec, Aztec Rune, PDF417, MicroPDF417, MaxiCode, EAN-13, EAN-8, UPC-A, UPC-E, ISBN, Code 128, Code 39, Code 93, ITF, ITF-14, Codabar and GS1 DataBar. It does **not** read DotCode. By default it downloads its WebAssembly from jsDelivr; tests must hand it the local file instead.
- Audit: in `bwip-js` the only matches for `fetch`, `eval` and `self` are PostScript dictionary keys and a local variable; there is no network, storage or code-loading call. `fflate` has none either. The plan records this in `packages/code-maker/AUDIT.md` (Task 1).

## Global Constraints

- Node `>=24`; pnpm only. TypeScript `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`; relative imports carry `.ts`.
- `packages/code-maker/src` may import at run time only its own files and `fflate`. It may `import type` from `bwip-js/generic`. No DOM, no Node built-ins, no clock, no `Math.random`, no network or storage word; a purity test enforces it (Task 1).
- Randomness is an argument (`random: (count: number) => Uint8Array`), as in `packages/text-tools`; bounded choices go through a rejection sampler, never a remainder.
- Every exported operation that takes typed input or options returns a `Result` and never throws.
- Versions pinned exactly: `fflate@0.8.3`; development `bwip-js@4.11.4`, `zxing-wasm@3.1.5`, `pdf-lib@1.17.1`. Do not add `minimumReleaseAgeExclude` entries.
- Tests never touch the network: the decode helper replaces `globalThis.fetch` with a function that throws.
- Path data in a `Drawing` uses only absolute `M`, `L`, `C` and `Z`, with numbers rounded to 4 decimal places.
- Same input, same output: SVG, PDF and ZIP bytes are identical for identical input (no timestamps; the ZIP's entry times fixed at 1980-01-01).
- Contrast warning below 4.5:1 (WCAG relative luminance, the weakest foreground and background pair; a transparent background measured as white). Export refused below 2:1 (provisional; Plan 2's styled decoding tests may raise it).
- Typed text limit `LIMITS.text = 7089` characters; logo at most 5 MB and 4096 px a side; exports at most 10,000 px a side; quiet zone 0 to 10 modules; print sizes 10 to 1000 mm at 300 or 600 dpi.
- File names come from the kind of code and a supplied time, never from typed text.
- Format with `pnpm format` before each commit. End commit messages with the session's attribution line.

## Review Focus

1. **A character a symbology cannot carry** (an `é` in Code 39, a letter in EAN-13): refused with a sentence that names the character, never replaced. Test in Task 4.
2. **A Wi-Fi password holding `;` `,` `:` `\` `"` or spaces at its ends**: escaped so the phone joins with exactly that password. Test in Task 3.
3. **An event that ends before it starts, crosses midnight or spans several all-day dates**: refused or written exactly, never shifted. Test in Task 3.
4. **A logo on a very small QR code** (version 1 or 2): the cleared plate never touches the finder, timing or format areas, and the coverage check refuses what cannot be recovered. Test in Task 7.
5. **Colours typed loosely** (`#FFF`, `fff`, `0E6F8C`, uppercase, `transparent`): parsed to one canonical form, and an unparseable colour refused rather than defaulting to black. Test in Task 6.

## File Structure

```
packages/code-maker/
  package.json  tsconfig.json  vitest.config.ts  AUDIT.md
  src/
    index.ts      what the page may import
    limits.ts     LIMITS
    result.ts     Result, Problem, PROBLEMS, ok, refuse, explain
    random.ts     RandomSource, below (rejection sampling)
    text.ts       readEscapes, prepareText
    content.ts    payload builders for every QR kind
    catalogue.ts  SYMBOLOGIES, options validation
    encode.ts     encode(): grid or drawing, bwip error mapping
    drawing.ts    Drawing, Paint, path helpers
    recorder.ts   a bwip drawing context that records a Drawing
    colour.ts     parseColour, contrast, invert
    themes.ts     THEMES, surprise, paints per module
    style.ts      styleGrid: dot shapes, finders, logo plate
    checks.ts     check(): warnings and refusals before export
    svg.ts        toSvg
    pdf.ts        toPdf
    bundle.ts     pixel sizing, file names, zip
  test/
    helpers.ts    loadBwip, decodeGrid, decodeBars, fixedRandom
    one test file per source file, plus purity and robustness
```

---

### Task 1: The package, its audit and its test helpers

**Files:**
- Create: `packages/code-maker/package.json`, `tsconfig.json`, `vitest.config.ts`, `AUDIT.md`
- Create: `src/limits.ts`, `src/result.ts`, `src/random.ts`, `src/index.ts`
- Test: `test/purity.test.ts`, `test/result.test.ts`, `test/random.test.ts`, `test/helpers.ts`, `test/helpers.test.ts`

**Interfaces:**
- Produces: `LIMITS`; `PROBLEMS` and `type Problem`; `type Result<T>`; `ok`, `refuse`, `explain(problem)`; `type RandomSource`; `below(n, random): number` (throws `RandomFailure`, caught by callers' `guard`); `guard<T>(make: () => T): Result<T>`.
- Test helpers: `loadBwip(): Promise<Bwip>`; `decodeGrid(cells, columns, rows): Promise<{ text: string; format: string; hasECI: boolean } | null>`; `decodeBars(sbs: number[]): Promise<{ text; format } | null>`; `fixedRandom(bytes: number[]): RandomSource`.

- [ ] **Step 1: Create the package files.** Copy the shape of `packages/text-tools/package.json` and `tsconfig.json`. Name `@pokerji/code-maker`; `dependencies: { "fflate": "0.8.3" }`; `devDependencies: { "@types/node": "^24.0.0", "bwip-js": "4.11.4", "zxing-wasm": "3.1.5", "pdf-lib": "1.17.1" }`. Run `pnpm install`; expected: the four packages added, no other new ones beyond their own dependencies.

- [ ] **Step 2: Repeat the audit and record it.** In `node_modules`, search `bwip-js/dist/bwip-js-gen.mjs`, `bwip-js/dist/bwipp.mjs` and `fflate/esm/browser.js` for `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, `importScripts`, `eval`, `new Function` and dynamic `import(`. Read every match in context. Write `AUDIT.md`: the date, each version, each command, each match and what it is. Expected: the same result as in "Facts established" above; if anything else appears, stop and report it.

- [ ] **Step 3: Write the failing tests.**
  - `purity.test.ts`: reuse the stricter check from `packages/text-tools/test/purity.test.ts`, changed so that an import specifier must be `./…`, or `fflate`, or appear in an `import type` from `bwip-js/generic`. Its self-test cases must include `import bwip from 'bwip-js/generic'` (refused: a run-time import) and `import type { default as B } from 'bwip-js/generic'` (allowed).
  - `result.test.ts`: every problem has a sentence ending in a full stop; `explain` never includes anything passed in.
  - `random.test.ts`: `below(6)` redraws 7 and 6 and returns 5 from `[7, 6, 5]`; over all 256 byte values each of six outcomes comes up 32 times; a source that never yields a usable value makes `guard` return `refuse('no-random')`.
  - `helpers.test.ts`: `decodeGrid` reads back a QR grid made by `bwip.raw('qrcode', 'hello', {})` as `{ text: 'hello', format: 'QRCode' }`; `decodeBars` reads back `bwip.raw('code128', 'ABC-123', {})`; calling the decoder with `globalThis.fetch` replaced by a throwing function still works (proof it never downloads).

- [ ] **Step 4: Run them:** `pnpm --filter @pokerji/code-maker test`. Expected: FAIL, missing modules.

- [ ] **Step 5: Implement.**
  - `LIMITS`: `text: 7089`, `logoBytes: 5_000_000`, `logoPixels: 4096`, `exportPixels: 10_000`, `quietZoneMax: 10`, `printMm: { min: 10, max: 1000 }`, `dpi: [300, 600]`, `redraws: 1000`.
  - `PROBLEMS`: `too-long`, `bad-character`, `bad-check-digit`, `bad-length`, `bad-escape`, `empty`, `out-of-range`, `bad-colour`, `bad-address`, `bad-coordinates`, `bad-date`, `bad-email`, `bad-phone`, `logo-too-large`, `contrast-too-low`, `export-too-large`, `not-encodable`, `no-random`. Each with a plain sentence.
  - `random.ts`: port `below` and `guard` from `packages/text-tools/src/random.ts` unchanged in behaviour.
  - `helpers.ts`: `loadBwip` imports `bwip-js/generic` default; `decodeGrid` and `decodeBars` draw the modules or bars four pixels each with a four-module quiet zone into an RGBA buffer and call `zxing-wasm`'s `readBarcodes` with `{ tryHarder: true, formats: [] }`. Prepare the module once with `prepareZXingModule({ overrides: { wasmBinary: <bytes of node_modules/zxing-wasm/dist/reader/zxing_reader.wasm> }, fireImmediately: true })`, after replacing `globalThis.fetch` with a function that throws.

- [ ] **Step 6: Run the tests.** Expected: PASS.

- [ ] **Step 7: Commit:** `feat: the code-maker package, its audit and its decoding helpers`.

---

### Task 2: Text preparation

**Files:** Create `src/text.ts`. Test `test/text.test.ts`.

**Interfaces:**
- Consumes: `Result`, `refuse`.
- Produces:
  - `readEscapes(text: string): Result<string>`: `\n`, `\r`, `\t`, `\\`, `\xHH`, `\u{H…}` (1 to 6 hex digits, a valid code point, not a surrogate); anything else after a backslash is `bad-escape`.
  - `type TextOptions = { escapes: boolean; trim: boolean; newline: 'lf' | 'crlf'; eci: boolean }`.
  - `type TextCapability = 'eci' | 'utf8' | 'ascii' | 'digits'`.
  - `prepareText(text: string, options: TextOptions, capability: TextCapability): Result<{ text: string; bwip: { parsefnc?: true; binarytext?: true }; warnings: ('no-eci')[] }>`.

- [ ] **Step 1: Write the failing tests** (`text.test.ts`):
  - `readEscapes('a\\nb\\t\\\\\\x41\\u{1F600}')` gives `'a\nb\t\\A😀'`; `'\\q'`, `'\\x4'`, `'\\u{110000}'` and `'\\u{D800}'` give `refuse('bad-escape')`.
  - `prepareText('Grüße', { eci: true, … }, 'eci')` gives text `'^ECI000026GrÃ¼Ã\u009fe'` and `bwip: { parsefnc: true, binarytext: true }`; a `^` in the input becomes `^094`.
  - The same with `eci: false` gives the plain string and empty `bwip` options.
  - ASCII-only text with `eci: true` carries no marker (the marker is only for non-ASCII).
  - Capability `'utf8'` (Micro QR) with non-ASCII gives the plain string and the warning `'no-eci'`.
  - Capability `'ascii'` with `é` refuses `bad-character`; capability `'digits'` with `12a` refuses `bad-character`.
  - `newline: 'crlf'` turns every line ending into `\r\n`; `trim` removes leading and trailing white space only.
  - **Decoding:** for QR, rMQR (`version: 'R17x139'`), Data Matrix, Aztec and PDF417, `prepareText('Grüße 😀 €', { eci: true }, 'eci')` encoded by bwip-js decodes to `'Grüße 😀 €'` with `hasECI: true`; with `eci: false`, decodes to the same text with `hasECI: false`.

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Implement** in `src/text.ts`. Order: escapes, then newline, then trim, then capability check, then the ECI form. The UTF-8 byte string is `String.fromCharCode(...new TextEncoder().encode(text))`, built in chunks so 7,089 characters do not overflow the call stack.

- [ ] **Step 4: Run it.** Expected: PASS.

- [ ] **Step 5: Commit:** `feat: text preparation for the code maker, with escapes and the UTF-8 marker`.

---

### Task 3: What a QR code can hold

**Files:** Create `src/content.ts`. Test `test/content.test.ts`.

**Interfaces:**
- Produces, each returning `Result<string>`:
  - `linkPayload(address: string)`: returns the address; refuses `bad-address` if `new URL` cannot parse it. Also `suggestHttps(address: string): string | null`: returns `'https://' + address` when there is no scheme and the address looks like a host name.
  - `type Contact = { given: string; family: string; organisation?: string; title?: string; phones: { number: string; kind: 'cell' | 'work' | 'home' }[]; emails: string[]; website?: string; address?: { street?: string; city?: string; region?: string; postcode?: string; country?: string }; note?: string }`
  - `vCard(contact: Contact)`: vCard 3.0, CRLF line endings, values escaped (`\` `,` `;` and new line as `\n`), lines folded at 75 octets.
  - `meCard(contact: Contact)`: `MECARD:N:Family,Given;TEL:…;EMAIL:…;…;;`, escaping `\ ; , :` with a backslash.
  - `type CalendarEvent = { title: string; start: string; end: string; allDay: boolean; utcOffsetMinutes: number | null; place?: string; description?: string }`. `start` and `end` are `YYYY-MM-DDTHH:MM` (or `YYYY-MM-DD` when `allDay`). `utcOffsetMinutes: null` writes floating local time; a number converts to UTC with a `Z`.
  - `calendarEvent(event: CalendarEvent)`: `BEGIN:VCALENDAR` … `BEGIN:VEVENT` with `SUMMARY`, `DTSTART`, `DTEND`, `LOCATION`, `DESCRIPTION`, escaped and folded as iCalendar requires. All-day uses `;VALUE=DATE` and an exclusive end (the day after the last day). No `UID` or `DTSTAMP` (they would add a time and make output vary; scanners do not need them).
  - `type Wifi = { ssid: string; password: string; security: 'wpa' | 'wep' | 'none'; hidden: boolean }`
  - `wifi(network: Wifi)`: `WIFI:T:WPA;S:…;P:…;H:true;;` (`T:WPA` for WPA, WPA2 and WPA3; `T:nopass` and no `P` when `none`; `H` only when hidden). Escape `\ ; , : "` with a backslash.
  - `type Place = { kind: 'coordinates'; latitude: number; longitude: number } | { kind: 'address'; address: string; as: 'geo' | 'openstreetmap' | 'apple' | 'google' }`
  - `place(where: Place)`: `geo:<lat>,<lon>` with at most 6 decimals; an address as `geo:0,0?q=<encoded>` or `https://www.openstreetmap.org/search?query=…`, `https://maps.apple.com/?q=…`, `https://www.google.com/maps/search/?api=1&query=…`.
  - `email(to: string, subject?: string, body?: string)`: `mailto:` per RFC 6068, percent-encoded.
  - `sms(number: string, message?: string)`: `SMSTO:<number>:<message>`.
  - `phone(number: string)`: `tel:<number>`, digits and a leading `+` only after removing spaces, dashes, dots and brackets.

- [ ] **Step 1: Write the failing tests**, with exact expected strings for each builder. Must include:
  - `wifi({ ssid: 'Café;Net', password: ' p;a,s:s\\w"d ', security: 'wpa', hidden: true })` equals `'WIFI:T:WPA;S:Café\\;Net;P: p\\;a\\,s\\:s\\\\w\\"d ;H:true;;'` (spaces kept exactly).
  - `wifi` with `security: 'none'` writes `T:nopass` and no `P:`.
  - `calendarEvent` with end before start refuses `bad-date`; all-day `2026-12-30` to `2026-12-31` writes `DTSTART;VALUE=DATE:20261230` and `DTEND;VALUE=DATE:20270101`; an event from `2026-10-16T23:30` to `2026-10-17T00:30` with offset `-240` writes `DTSTART:20261017T033000Z` and `DTEND:20261017T043000Z`; floating time writes no `Z`; a description with `,`, `;` and a new line escapes them; a 200-character description is folded with CRLF plus a space.
  - `vCard` escapes `Smith, Jr.` in the name and folds a long note; `meCard` escapes `:`.
  - `place` refuses a latitude of 91 or a longitude of -181 (`bad-coordinates`); rounds `12.3456789` to `12.345679`.
  - `email` with a subject `Hi & bye?` gives `mailto:a@b.c?subject=Hi%20%26%20bye%3F`; an address without `@` refuses `bad-email`.
  - `phone('+1 (201) 555-0100')` gives `tel:+12015550100`; `phone('call me')` refuses `bad-phone`.
  - Every builder refuses an all-blank required field with `empty`.
  - **Decoding:** each builder's output, encoded as a QR code through `prepareText` and bwip-js, decodes to exactly that output.

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Implement** in `src/content.ts`. One small escaping function per format; folding counts UTF-8 octets and never splits a character.

- [ ] **Step 4: Run it.** Expected: PASS.

- [ ] **Step 5: Commit:** `feat: payloads for business cards, events, Wi-Fi, places, email, SMS and phone`.

---

### Task 4: The catalogue and encoding

**Files:** Create `src/catalogue.ts`, `src/encode.ts`, `src/drawing.ts`. Test `test/catalogue.test.ts`, `test/encode.test.ts`.

**Interfaces:**
- Consumes: `prepareText`, `TextCapability`, `Result`.
- Produces:
  - `type Bwip = Pick<typeof import('bwip-js/generic').default, 'raw' | 'render' | 'FontLib'>` (type only).
  - `type Family = 'qr' | 'grid' | 'drawn'` (`qr` and `grid` are styled from their module grid; `drawn` is drawn by bwip-js).
  - `type OptionSpec = { key: string; label: string; kind: 'choice'; values: readonly (string | number)[]; default: string | number } | { key: string; label: string; kind: 'integer'; min: number; max: number; default: number | 'auto' } | { key: string; label: string; kind: 'boolean'; default: boolean }`.
  - `type Symbology = { id: string; label: string; group: '2d' | 'product' | 'linear'; bcid: string; family: Family; capability: TextCapability; decoder: string | null; options: readonly OptionSpec[]; quietZone: number }` (`quietZone` is the standard's minimum, in modules).
  - `SYMBOLOGIES: readonly Symbology[]`.
  - `checkOptions(id: string, options: Record<string, unknown>): Result<Record<string, string | number | boolean>>`: unknown keys and out-of-range values refuse `out-of-range`; `'auto'` drops the key.
  - `type Grid = { kind: 'grid'; columns: number; rows: number; cells: Uint8Array; finders: { column: number; row: number }[] }`.
  - `type Encoded = { symbology: Symbology; grid: Grid | null; drawing: Drawing | null; warnings: ('no-eci')[] }`.
  - `encode(bwip: Bwip, request: { id: string; text: string; textOptions: TextOptions; options: Record<string, unknown>; colours: { foreground: string; background: string | null } }): Result<Encoded>`: grid families return `grid`; `drawn` families return `drawing` (Task 5's recorder).
  - `bwipProblem(error: unknown): Problem`: maps by the `bwipp.<code>` name: `InputTooLong`, `NoValidSymbol`, `TooLong` to `too-long`; `badCharacter` to `bad-character`; `badCheckDigit` to `bad-check-digit`; `badLength` to `bad-length`; anything else to `not-encodable`. The thrown message itself is never shown.
- `drawing.ts` produces `type Paint = { type: 'solid'; colour: string } | { type: 'linear'; from: string; to: string; angle: number } | { type: 'radial'; inner: string; outer: string }`, `type Layer = { paint: Paint; d: string }`, `type Logo = { width: number; height: number; rgba: Uint8Array; png: Uint8Array; x: number; y: number; size: number }`, `type Drawing = { width: number; height: number; background: Paint | null; layers: Layer[]; logo: Logo | null }`, and path helpers `rect`, `circle`, `roundedRect`, `diamond` returning path data in the `M L C Z` grammar.

The catalogue (labels are the builder's; ids, `bcid`, family, capability and decoder are fixed here):

| id | bcid | family | capability | decoder |
|---|---|---|---|---|
| qr | qrcode | qr | eci | QRCode |
| micro-qr | microqrcode | qr | utf8 | MicroQRCode |
| rmqr | rectangularmicroqrcode | qr | eci | rMQRCode |
| data-matrix | datamatrix | grid | eci | DataMatrix |
| data-matrix-rect | datamatrixrectangular | grid | eci | DataMatrix |
| aztec | azteccode | grid | eci | Aztec |
| aztec-compact | azteccodecompact | grid | eci | Aztec |
| aztec-rune | aztecrune | grid | digits | Aztec |
| pdf417 | pdf417 | drawn | eci | PDF417 |
| pdf417-compact | pdf417compact | drawn | eci | PDF417 |
| micro-pdf417 | micropdf417 | drawn | utf8 | MicroPDF417 |
| maxicode | maxicode | drawn | eci | MaxiCode |
| dotcode | dotcode | drawn | eci | **null** (see the note below) |
| ean-13 | ean13 | drawn | digits | EAN13 |
| ean-8 | ean8 | drawn | digits | EAN8 |
| upc-a | upca | drawn | digits | UPCA |
| upc-e | upce | drawn | digits | UPCE |
| isbn | isbn | drawn | digits | ISBN |
| issn | issn | drawn | digits | EAN13 |
| code-128 | code128 | drawn | ascii | Code128 |
| gs1-128 | gs1-128 | drawn | ascii | Code128 |
| code-39 | code39 | drawn | ascii | Code39 |
| code-39-ext | code39ext | drawn | ascii | Code39 |
| code-93 | code93 | drawn | ascii | Code93 |
| itf | interleaved2of5 | drawn | digits | ITF |
| itf-14 | itf14 | drawn | digits | ITF |
| codabar | rationalizedCodabar | drawn | ascii | Codabar |
| databar-omni | databaromni | drawn | digits | DataBar |
| databar-limited | databarlimited | drawn | digits | DataBarLimited |
| databar-expanded | databarexpanded | drawn | ascii | DataBarExpanded |

**DotCode is the one open question for the owner** (see the handoff). It is kept with `decoder: null`; the decode test lists it as the only exception. If the owner drops it, delete its row and its exception.

Options, by id (bwip-js option names; `auto` means the key is left out):
- `qr`: `eclevel` L/M/Q/H, default M; `version` 1 to 40 or auto; `mask` 1 to 8 or auto.
- `micro-qr`: `version` M1 to M4 or auto; `eclevel` L/M/Q, default M.
- `rmqr`: `version` one of the 32 R-sizes from `R7x43` to `R17x139` (required: bwip-js has no automatic size, so the default is the smallest that fits, chosen by `encode` by trying the sizes in order); `eclevel` M/H.
- `data-matrix`, `data-matrix-rect`: `version` (the standard's sizes) or auto.
- `aztec`, `aztec-compact`: `eclevel` 5 to 95 per cent, default 23; `layers` or auto.
- `pdf417`, `pdf417-compact`: `columns` 1 to 30 or auto; `rows` 3 to 90 or auto; `eclevel` 0 to 8 or auto.
- `micro-pdf417`: `columns` 1 to 4 or auto.
- `maxicode`: `mode` 2 to 6, default 4.
- `dotcode`: `columns` 5 to 200 or auto.
- Product and linear: `height` 5 to 50 mm, default 15; `includetext` default true; `includecheck` where bwip-js supports it, default true; `includecheckintext` default true.

- [ ] **Step 1: Write the failing tests.**
  - `catalogue.test.ts`: every row above exists with those values; every option default lies within its range; `checkOptions('qr', { eclevel: 'Z' })`, `{ version: 41 }`, `{ colour: 'red' }` refuse `out-of-range`; `{ version: 'auto' }` gives `{}`.
  - `encode.test.ts`:
    - **Every symbology decodes:** for each row with a decoder, a sample text valid for it (the test file holds one per id) encodes and decodes to that text (grids through `decodeGrid`; linear and product codes through `decodeBars` from `bwip.raw`; PDF417 and MicroPDF417 by decoding the grid of `bwip.raw` drawn as square modules). Two rows are skipped, by name: DotCode (no decoder reads it) and MaxiCode (its layout is hexagonal, so it is decoded from its rendered drawing in Plan 2's browser tests). Aztec Rune decodes a number as three digits, so `42` is expected back as `042`.
    - EAN-13 `590123412345` gains check digit `7` and decodes as `5901234123457`; `5901234123458` refuses `bad-check-digit`; `59012341234X` refuses `bad-character`.
    - EAN-13 with a 5-digit add-on (`5901234123457 12345`) decodes with the add-on when the decoder is asked to read add-ons.
    - Code 39 with `é` refuses `bad-character`, and the refusal's sentence does not contain the typed text.
    - QR of 8,000 characters refuses `too-long`; rMQR without a version picks the smallest size that fits.
    - Micro QR with `Grüße` encodes and returns the warning `no-eci`.
    - `bwipProblem(new Error('bwipp.qrcodeInputTooLong#27120: …'))` is `too-long`; an error with a message holding `secret` maps to `not-encodable` and nothing returned contains `secret`.
    - A QR grid has three finders at (0, 0), (columns − 7, 0) and (0, rows − 7); Micro QR has one at (0, 0); rMQR has one at (0, 0).

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement** `catalogue.ts`, `drawing.ts` and `encode.ts`. `encode` calls `checkOptions`, then `prepareText` with the symbology's capability, then `bwip.raw` (grid families) or Task 5's `record` (drawn families), inside `try`/`catch` mapped by `bwipProblem`. Until Task 5 lands, `drawn` families return `drawing: null` and their decode tests use `bwip.raw` directly, as described above.

- [ ] **Step 4: Run them.** Expected: PASS, with DotCode and MaxiCode the only skipped rows.

- [ ] **Step 5: Commit:** `feat: the code maker's catalogue, every code decoded`.

---

### Task 5: Recording what bwip-js draws

**Files:** Create `src/recorder.ts`. Modify `src/encode.ts`. Test `test/recorder.test.ts`.

**Interfaces:**
- Consumes: `Bwip`, `Drawing`, `Layer`, path helpers.
- Produces: `record(bwip: Bwip, bcid: string, text: string, options: Record<string, string | number | boolean>, colours: { foreground: string; background: string | null; text?: string }): Drawing`, used by `encode` for `drawn` families.

The recorder is a bwip-js drawing context (the `DrawingContext` interface in `bwip-js-gen.d.ts`), adapted from bwip-js's own `DrawingSVG` (MIT; keep its copyright line in a comment): `line` becomes a filled rectangle, `polygon`, `hexagon` and `ellipse` become paths (ellipses as four cubic curves, using its constant), `fill(rgb)` closes the current path into a layer of that colour, and `text` draws glyphs from `FontLib.getpaths`, converting quadratic curves to cubic. Units are bwip-js's pixels at `scale: 1`. Layers of one colour are merged.

- [ ] **Step 1: Write the failing tests:**
  - For EAN-13 `5901234123457`, the recorded drawing's bars (layers in the bar colour, excluding glyphs) have the same count and widths as `bwip.raw`'s `sbs` (bars at even indexes).
  - With `includetext`, the drawing has a layer for the text colour whose path is non-empty, and no layer holds the digits as text.
  - The recorded drawing for MaxiCode holds hexagon paths and the bullseye's rings.
  - Every layer's path matches `^(?:[MLCZ](?: -?\d+(?:\.\d{1,4})?)*)+$` (spaces normalised).
  - Colours given as `0E6F8C` appear as `#0e6f8c`; background `null` gives `background: null`.
  - `encode` for `pdf417` now returns a `drawing`, and its width and height match `toSVG`'s `viewBox` for the same input.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement** `record` and switch `encode`'s `drawn` branch to it.

- [ ] **Step 4: Run them.** Expected: PASS; Task 4's tests still pass.

- [ ] **Step 5: Commit:** `feat: a drawing context that records what bwip-js draws`.

---

### Task 6: Colour, contrast and themes

**Files:** Create `src/colour.ts`, `src/themes.ts`. Test `test/colour.test.ts`, `test/themes.test.ts`.

**Interfaces:**
- Consumes: `RandomSource`, `below`, `guard`, `Paint`.
- Produces:
  - `parseColour(input: string): Result<string>`: accepts `#rgb`, `#rrggbb`, the same without `#`, any case, and `transparent`; returns `#rrggbb` lowercase or `'transparent'`; anything else refuses `bad-colour`.
  - `contrast(a: string, b: string): number`: WCAG 2.2 contrast ratio (relative luminance with the sRGB transfer function), `transparent` measured as white, rounded to 2 decimals.
  - `invert<T extends { foreground: string; background: string }>(colours: T): T`: swaps the two.
  - `weakestPair(paints: Paint[], background: string): { foreground: string; background: string; ratio: number }`: the lowest-contrast colour any paint contains against the background.
  - `type ThemeId = 'rainbow' | 'sunset' | 'ocean' | 'forest' | 'pool' | 'ink' | 'neon'`; `THEMES: Record<ThemeId, { label: string; background: string; paint: Paint; perModule?: (column: number, row: number, columns: number, rows: number) => string }>`.
  - `surprise(random: RandomSource): Result<{ background: string; paint: Paint }>`: a random palette redrawn until `weakestPair` reaches 4.5:1 (at most `LIMITS.redraws` tries).
  - `CONTRAST_WARNING = 4.5`, `CONTRAST_FLOOR = 2`.

- [ ] **Step 1: Write the failing tests:**
  - `parseColour` gives `#ffffff` for `#FFF`, `fff` and `FFFFFF`; `#0e6f8c` for `0E6F8C`; `transparent` for `Transparent`; refuses `bad-colour` for `#ggg`, `red`, `#12345`, an empty string.
  - `contrast('#000000', '#ffffff')` is 21; `contrast('#777777', '#ffffff')` is 4.48; `contrast('#767676', '#ffffff')` is 4.54; `contrast('#0e6f8c', 'transparent')` equals `contrast('#0e6f8c', '#ffffff')`.
  - `invert({ foreground: '#111111', background: '#ffffff' })` swaps them and keeps other fields.
  - Every theme's `weakestPair` against its background is at least 4.5; Rainbow's per-module colours across a 25 × 25 grid all reach 4.5 against its background.
  - `surprise(fixedRandom(...))` is deterministic for the same bytes and always reaches 4.5; a source stuck on one value gives `refuse('no-random')`.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** Theme hues are the builder's within the contrast rule; Pool uses the suite's stage colours from `DESIGN.md` (`#0e6f8c`, `#0a566d`).

- [ ] **Step 4: Run them.** Expected: PASS.

- [ ] **Step 5: Commit:** `feat: colours, WCAG contrast and themes for the code maker`.

---

### Task 7: Styling a grid

**Files:** Create `src/style.ts`. Test `test/style.test.ts`.

**Interfaces:**
- Consumes: `Grid`, `Drawing`, `Paint`, path helpers, `THEMES`.
- Produces:
  - `type DotShape = 'square' | 'rounded' | 'circle' | 'diamond' | 'connected' | 'vertical' | 'horizontal'`
  - `type Ring = 'square' | 'rounded' | 'circle' | 'leaf'`; `type Eye = 'square' | 'rounded' | 'circle' | 'diamond'`
  - `type Style = { dots: DotShape; ring: Ring; eye: Eye; foreground: Paint; background: string | null; corners: Paint | null; perModule: ((column: number, row: number, columns: number, rows: number) => string) | null; quietZone: number; logo: Omit<Logo, 'x' | 'y' | 'size'> & { share: number; padding: number; plate: 'square' | 'rounded' | 'circle' } | null }`
  - `styleGrid(grid: Grid, style: Style): Drawing`: one unit per module; the drawing includes the quiet zone; finders (7 × 7) are drawn as a ring and an eye in `corners ?? foreground`; other dark modules as `dots`; per-module colours are grouped into at most 24 colour layers; a logo clears every module whose centre falls inside its plate.
  - `protectedCells(grid: Grid, symbologyId: string): Uint8Array`: the finder patterns with their separators, the timing patterns and the format and version information areas for the QR family; the finders and timing for Data Matrix and Aztec. The plate never clears a protected cell; if it would, `styleGrid` shrinks the plate until it does not.
  - `logoCoverage(grid: Grid, style: Style): number`: the share of the grid's data modules the plate clears.

- [ ] **Step 1: Write the failing tests:**
  - With `dots: 'square'`, no logo and plain paints, the drawing's dark area (sum of the rectangles) equals the number of dark modules, and rasterising the drawing at module centres (a small point-in-rectangle check, in the test) reproduces the grid; that grid decodes.
  - Each dot shape produces paths in the `M L C Z` grammar; `connected` joins horizontally and vertically adjacent dark modules into one outline per run; `vertical` and `horizontal` produce one path per run.
  - A QR grid styled with `ring: 'circle'` has three ring paths and three eye paths in the corner paint; Micro QR has one.
  - A logo of share 0.3 on a QR version 1 (21 × 21) grid never clears a protected cell (assert against `protectedCells`), and on version 10 clears a centred square of the expected size.
  - `logoCoverage` for share 0 is 0 and grows with share.
  - The quiet zone of 4 adds 4 units on every side; a background of `null` gives `background: null`.
  - Rainbow per-module colours give at most 24 layers.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement** `style.ts`. Connected dots trace the outline of each 4-connected region with rounded convex corners (radius 0.5 module) and square concave corners; the rest are per-module shapes merged into one path per paint.

- [ ] **Step 4: Run them.** Expected: PASS.

- [ ] **Step 5: Commit:** `feat: dot shapes, corner shapes and a logo plate for matrix codes`.

---

### Task 8: Checks before export

**Files:** Create `src/checks.ts`. Test `test/checks.test.ts`.

**Interfaces:**
- Consumes: `Encoded`, `Style`, `contrast`, `weakestPair`, `logoCoverage`, `CONTRAST_WARNING`, `CONTRAST_FLOOR`.
- Produces: `type Finding = { level: 'warning' | 'refusal'; code: 'contrast-low' | 'contrast-too-low' | 'light-on-dark' | 'quiet-zone-small' | 'logo-too-large' | 'no-eci' | 'transparent-measured-as-white' }` and `check(encoded: Encoded, style: Style | null, colours: { foreground: string; background: string | null }): Finding[]`.

Rules:
- Weakest pair below 4.5 → warning `contrast-low`; below 2 → refusal `contrast-too-low`.
- Foreground lighter than background (relative luminance) → warning `light-on-dark`.
- Quiet zone below the symbology's `quietZone` → warning `quiet-zone-small`.
- Logo coverage above the limit for the error correction level → refusal `logo-too-large`. Limits (share of data modules): L 0.03, M 0.06, Q 0.09, H 0.12. Provisional: Plan 2's styled decoding tests may lower them; never raise them without a decoding test.
- A transparent background → warning `transparent-measured-as-white`.
- `encoded.warnings` carry through (`no-eci`).

- [ ] **Step 1: Write the failing tests** for each rule at, just under and just over its threshold, and that a clean default QR yields no findings.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `check`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: checks before export: contrast, quiet zone, logo size`.

---

### Task 9: The SVG writer

**Files:** Create `src/svg.ts`. Test `test/svg.test.ts`.

**Interfaces:**
- Consumes: `Drawing`.
- Produces: `toSvg(drawing: Drawing, size: { width: number; height: number } | null): string`: an SVG with a `viewBox` of the drawing's units, `width` and `height` when `size` is given, the background as a `rect`, each layer as a `path` with `fill` or a `fill="url(#g<n>)"` referencing a `linearGradient` or `radialGradient` in `defs`, and the logo as an `image` whose `href` is `data:image/png;base64,<png>`.

- [ ] **Step 1: Write the failing tests:**
  - The output starts with `<svg xmlns="http://www.w3.org/2000/svg"` and has one `path` per layer and one `rect` when there is a background.
  - Gradient ids are sequential and deterministic; two calls with the same drawing give identical strings.
  - The logo appears only as a base64 PNG `data:` address; an `rgba`/`png` pair whose PNG bytes contain `<script>` cannot place markup in the output (the only place bytes appear is base64).
  - The output contains no `<script`, no `on…=` attribute, no `href` other than the logo's `data:image/png;base64,` and no `<text`.
  - Colours are written lowercase `#rrggbb`; a `transparent` background writes no `rect`.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `toSvg`; base64 by hand (no `btoa`: the purity test forbids browser globals).
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: the code maker's SVG writer`.

---

### Task 10: The PDF writer

**Files:** Create `src/pdf.ts`. Test `test/pdf.test.ts`.

**Interfaces:**
- Consumes: `Drawing`, `zlibSync` from `fflate`.
- Produces: `toPdf(drawing: Drawing, page: { kind: 'fit'; widthMm: number } | { kind: 'a4' | 'letter'; widthMm: number }): Uint8Array`.

The writer: PDF 1.4, one page; `fit` makes the page the drawing's size at `widthMm`, `a4` (210 × 297 mm) and `letter` (215.9 × 279.4 mm) centre it. Objects: catalog, pages, page, a content stream (Flate-compressed), shading dictionaries for gradients (`/ShadingType 2` axial, `3` radial, with a `/FunctionType 2` interpolation between two RGB colours), and for a logo an image XObject (`/DeviceRGB`, 8 bits, Flate) with an `/SMask` image for alpha. Paths map one to one: `M`→`m`, `L`→`l`, `C`→`c`, `Z`→`h`, filled with `f` (non-zero). The y axis is flipped once with a `cm` matrix. No `/CreationDate`, `/ModDate`, `/Producer` or `/ID`. The cross-reference table has exact byte offsets.

- [ ] **Step 1: Write the failing tests:**
  - The bytes start with `%PDF-1.4` and end with `%%EOF\n`; every offset in the `xref` table points at the start of its `n 0 obj`; `startxref` points at `xref`.
  - `PDFDocument.load` from `pdf-lib` loads every PDF the tests make (plain, gradient, radial gradient, logo with alpha, A4, Letter) and reports one page of the expected size in points (A4 595.28 × 841.89, within 0.01).
  - Two calls with the same drawing give identical bytes; the output contains none of `/CreationDate`, `/ModDate`, `/Producer`, `/ID`.
  - A drawing of 30,000 modules (QR version 40 styled `square`) writes in under 200 ms in Node.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `toPdf`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: the code maker's vector PDF writer`.

---

### Task 11: Sizes, names and the ZIP

**Files:** Create `src/bundle.ts`. Test `test/bundle.test.ts`.

**Interfaces:**
- Consumes: `zipSync` from `fflate`, `LIMITS`.
- Produces:
  - `pixelsFor(drawing: Drawing, size: { kind: 'pixels'; width: number } | { kind: 'print'; widthMm: number; dpi: 300 | 600 }): Result<{ width: number; height: number; scale: number }>`: keeps the drawing's aspect; refuses `export-too-large` above 10,000 px a side and `out-of-range` outside 10 to 1000 mm or another dpi.
  - `fileName(symbologyId: string, kind: string, at: { year: number; month: number; day: number; hour: number; minute: number; second: number }, extension: 'png' | 'jpg' | 'svg' | 'pdf' | 'zip'): string`: `code-<kind>-<YYYYMMDD>-<HHMMSS>.<ext>`, e.g. `code-wifi-20261016-143005.png`; `kind` is the QR content kind or the symbology id.
  - `bundle(files: { name: string; data: Uint8Array }[]): Uint8Array`: a ZIP with images stored (level 0) and SVG and PDF compressed, every entry's time 1980-01-01 00:00.

- [ ] **Step 1: Write the failing tests:** 600 dpi at 100 mm gives 2362 px; 300 dpi at 1000 mm (11,811 px) refuses `export-too-large`; a non-square drawing keeps its ratio; `fileName` never contains anything but `[a-z0-9.-]`; `bundle` of four files unzips (with `fflate`'s `unzipSync`) to the same four names and bytes; two bundles of the same files are identical.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `bundle.ts`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: export sizes, file names and the ZIP for the code maker`.

---

### Task 12: Nothing throws, and the index

**Files:** Modify `src/index.ts`. Test `test/robustness.test.ts`.

**Interfaces:**
- Produces: `src/index.ts` exports everything Tasks 1 to 11 list as produced, except `below` and the test helpers.

- [ ] **Step 1: Write the test:**
  - For every symbology and every content builder, a set of awkward inputs (empty, 7,090 characters, lone surrogates, `\0`, `^`, `^ECI`, `‮`, emoji sequences, 7,089 digits, a field of 1 MB, `null` or `undefined` options cast in) never throws and returns a `Result`.
  - Every option at, just below and just above its limits returns ok or `out-of-range`, never throws.
  - `encode` with a `Bwip` whose `raw` throws an unexpected error returns `not-encodable`.
  - `toSvg` and `toPdf` on an empty drawing (no layers) still produce a valid file.
- [ ] **Step 2: Run it:** `pnpm --filter @pokerji/code-maker test`. Expected: PASS; fix any failure in the owning file with a test in that file's own test.
- [ ] **Step 3: Run everything:** `pnpm test && pnpm typecheck && pnpm format:check`. Expected: all pass.
- [ ] **Step 4: Commit:** `test: no code-maker operation throws, whatever it is given`.

---

## After this plan

1. The design direction for `/codes`, through the Impeccable skill, holding to the existing design.
2. Plan 2: the worker (bwip-js loaded lazily inside it), the page, raster export (PNG, JPG, Copy) through `OffscreenCanvas` and `Path2D`, the logo reader, the `BarcodeDetector` read-back, styled decoding tests in a real browser, the site changes, and the Octopus code review and security audit.
