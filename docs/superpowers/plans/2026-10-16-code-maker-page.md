# Code Maker Page and Release (Plan 2 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/codes` on `packages/code-maker`: the worker, the page in its approved design, raster export and Copy image, styled decoding in a real browser, the site changes, and the reviews.

**Architecture:** A browser-only SvelteKit page with no server code. One `Maker` state module holds every choice and builds payloads with the package on the main thread (they are cheap); a Web Worker served by this site loads bwip-js lazily, encodes, styles, checks, and writes SVG, PDF, ZIP and, through `OffscreenCanvas`, PNG and JPG. The page shows the SVG as a `data:` image in a fixed preview box. Only the latest request is worked on, as in the text converters.

**Tech Stack:** SvelteKit 3, Svelte 5 runes, TypeScript, Playwright with axe, zxing-wasm (tests only), pnpm 11, Node 24+.

**Spec:** `docs/superpowers/specs/2026-10-16-code-maker-design.md` (behaviour) and `docs/superpowers/specs/2026-10-16-code-maker-design-direction.md` (design). Read both, and `DESIGN.md`, before any UI step.

## Where this plan sits

Plan 1 (`2026-10-16-code-maker-core.md`) is done on `feat/code-maker`: `packages/code-maker`, 153 tests. Its rulings that bind this plan:

- Structured payloads keep their own line endings; vCard and iCalendar output is CRLF. Pass payloads to `encode` with `textOptions: { escapes: false, trim: false, newline: 'crlf', eci: <per spec §6> }` for vCard and iCalendar, `newline: 'lf'` for the rest.
- Grid styling exists for the `qr` and `grid` families; `drawn` symbologies get colours and quiet zone only (pass the quiet zone to bwip-js as `paddingwidth`/`paddingheight` in modules × bwip-js's module width).
- Logo limits in `LOGO_LIMITS` are provisional; Task 4 calibrates them by decoding.
- `encode` refuses with `detail: { at, character }` for a character a symbology cannot carry; show it.
- EAN/UPC add-ons and DMRE sizes are not offered; "how much too long" is this plan's (Task 2).
- Aztec takes no logo (its plate shrinks to nothing); say so on the page.

## Global Constraints

- No server code for this tool: no `+page.server.ts`, endpoint, form action, cookie, metric or log line.
- Nothing typed, chosen or uploaded is sent anywhere or stored: no local or session storage, no cookie, nothing in the address but the kind in the fragment.
- The tools render only after `onMount`; the server's HTML holds no code.
- bwip-js is imported only inside the worker (dynamic `import('bwip-js/generic')`), and in the main-thread fallback when workers are unavailable. Never at a page's top level.
- No `{@html}`. The preview is `<img src="data:image/svg+xml,…">`. Typed values are rendered as text.
- Every text input and textarea sets `spellcheck="false"`, `autocomplete="off"`, `autocapitalize="off"`, `autocorrect="off"` and `translate="no"`; so does the rail.
- No inline styles, no Svelte `transition:`/`in:`/`out:`/`animate:`; dynamic values through `cssVar`. No raw colours in components except the code's own colours as data.
- One yellow button: Copy image. No red on `/codes`.
- Randomness (Surprise me) is `crypto.getRandomValues` through the package's `RandomSource`.
- New dependency for tests only: `zxing-wasm@3.1.5` in `apps/web` devDependencies, recorded in `packages/code-maker/AUDIT.md`. The decoder is always handed its local WebAssembly file.
- Every new browser context in a test uses `visitor()`.
- Format before each commit. End commit messages with the session's attribution line.

## Review Focus

1. **A photo as a logo** (a 4,000 × 3,000 JPEG of 4.9 MB): read on the device, scaled down, never sent, and the page stays responsive. Test in Task 4.
2. **Switching kind with half-filled fields** (Wi-Fi to Business card and back): each kind keeps its own fields for the visit; nothing from one leaks into another's payload. Test in Task 2.
3. **A code that will not fit a print size** (a version 40 QR at 10 mm): the page warns that modules would be smaller than a printer can make (below 0.25 mm) rather than exporting silently. Test in Task 5.
4. **Light-on-dark after Invert with a logo**: warnings stack correctly, and the read-back (where available) is honest. Test in Task 3.
5. **The worker failing mid-session**: the page carries on with the main-thread fallback and the preview never empties. Test in Task 1.

## File Structure

```
apps/web/src/lib/ui/        NumberField, TextBox, Toggle moved here from lib/text (shared now)
apps/web/src/lib/codes/
  kinds.ts            QR_KINDS, OTHER_GROUPS, kindFrom(hash)
  payload.ts          payloadFor(kind, fields): Result<{ text, textOptions }>
  maker.svelte.ts     Maker: all state, the request, the latest answer
  worker.ts           the worker: encode, style, check, write (SVG/PDF/ZIP/PNG/JPG)
  work.ts             the job and answer types; answer(job, bwip) shared by worker and fallback
  raster.ts           drawOn(context, drawing, scale): Path2D painter for OffscreenCanvas
  logo.ts             readLogo(file): Promise<Result<Logo image>>
  readBack.ts         readBack(png, expected, format): Promise<'matched' | 'different' | 'unavailable'>
  CodePicker.svelte   QR kind row + Other codes select
  fields/*.svelte     one form per QR kind, and SymbologyFields
  OptionsSection.svelte LookSection.svelte LogoSection.svelte SizeSection.svelte
  ColourField.svelte  ThemeChips.svelte  PreviewBox.svelte  Downloads.svelte  CodeFindings.svelte
apps/web/src/routes/codes/+page.svelte
apps/web/e2e/codes.spec.ts   apps/web/e2e/decode.ts (zxing-wasm helper)
```

---

### Task 1: The page shell, the worker and a Link QR code end to end

**Files:**
- Move: `apps/web/src/lib/text/{NumberField,TextBox,Toggle}.svelte` → `apps/web/src/lib/ui/`; update the 16 imports in `lib/text`.
- Modify: `apps/web/package.json` (+ `@pokerji/code-maker`, devDependency `zxing-wasm@3.1.5`), `packages/code-maker/AUDIT.md` (zxing-wasm now also used by `apps/web` tests).
- Create: `lib/codes/kinds.ts`, `work.ts`, `worker.ts`, `maker.svelte.ts`, `PreviewBox.svelte`, `CodePicker.svelte`, `fields/LinkFields.svelte`, `routes/codes/+page.svelte`, `e2e/decode.ts`.
- Test: `apps/web/e2e/codes.spec.ts`.

**Interfaces:**
- `kinds.ts`: `QR_KINDS: readonly { id: 'qr-link' | 'qr-text' | 'qr-card' | 'qr-event' | 'qr-wifi' | 'qr-place' | 'qr-email' | 'qr-sms' | 'qr-phone'; label: string }[]`; `OTHER_GROUPS: readonly { label: '2D' | 'Product' | 'Linear'; ids: string[] }[]` from `SYMBOLOGIES` (every symbology except `qr`, grouped by `group`); `type KindId`; `kindFrom(hash: string): KindId` (fixed list only; anything else `'qr-link'`).
- `work.ts`: `type Job = { request: EncodeRequest; style: Style | null; output: 'preview' | 'png' | 'jpg' | 'svg' | 'pdf' | 'zip'; size?: ExportSize; page?: PdfPage }`; `type Answer = { ok: true; svg: string; width: number; height: number; findings: Finding[]; file?: Uint8Array } | { ok: false; problem: Problem; detail?: Detail }`; `answer(job: Job, bwip: Bwip): Promise<Answer>`.
- `maker.svelte.ts`: `class Maker { kind: KindId; fields: Record<KindId, object>; options; look; logo; size; current: Answer | undefined; busy: boolean; ask(): void; exact(output): Promise<Answer> }`, with the worker started lazily and the same latest-wins and fallback rules as `lib/text/background.svelte.ts` (copy its structure; it was reviewed).
- `e2e/decode.ts`: `decodePng(png: Buffer, formats?: string[]): Promise<{ text: string; format: string } | null>` using `zxing-wasm` with `fetch` blocked and the local `reader` wasm.

- [ ] **Step 1: Write the failing browser tests** in `codes.spec.ts`:
  - `opens on Link with an empty preview, then makes a QR code that decodes`: heading 1 is "Barcodes and QR codes"; the preview shows the dashed "not there yet" box and Copy image is disabled; fill Address with `https://example.com/`; the preview image appears; a screenshot of the preview box, decoded with `decodePng`, gives `https://example.com/` and format `QRCode`; Copy image is enabled and yellow (`button.primary` count 1).
  - `the server never makes a code`: the HTML for `/codes` contains no `<img` inside the preview and no `data:image/svg`.
  - `without JavaScript the page says so`: heading, `noscript p` contains "needs JavaScript", the about text says nothing typed is sent.
  - `a link straight to a kind opens it, and an unknown fragment opens Link`: `/codes#qr-wifi` shows the Wi-Fi heading; `/codes#<img>` shows Link.
  - `the worker failing mid-session leaves the page working` (Review Focus 5): after one code, terminate the worker (route its script to abort on reload, or `page.evaluate` to make `Worker.prototype.postMessage` throw), change the address, and the preview updates and never shows the empty box in between.
- [ ] **Step 2: Run them:** `pnpm --filter @pokerji/web exec playwright test e2e/codes.spec.ts`. Expected: FAIL, `/codes` not found.
- [ ] **Step 3: Move the shared field components** to `lib/ui`; run `pnpm --filter @pokerji/web typecheck` and `playwright test e2e/text.spec.ts`. Expected: 0 errors; text tests pass.
- [ ] **Step 4: Implement** `kinds.ts`, `work.ts` (Link only for now: `linkPayload`, QR, `styleGrid` with the default style, `check`, `toSvg`), `worker.ts` (`import('bwip-js/generic')` on first job; `postMessage` replies), `maker.svelte.ts`, `PreviewBox.svelte` (fixed square, the dashed empty state, transparency board class), `CodePicker.svelte` (QR row as the text tools' tool row; Other codes select, both setting the fragment), `LinkFields.svelte` (Address field, and "Add https://" using `suggestHttps`), and the page (band, picker, Content section, rail with preview and Copy image, about text, `ready` gate, `Seo` with title "Barcode and QR code maker: free, private, no sign-up · pokerji").
- [ ] **Step 5: Run the tests.** Expected: PASS, 5 tests; text and schema specs still pass.
- [ ] **Step 6: Commit:** `feat: the code maker page, with a Link QR code end to end`.

---

### Task 2: Every QR kind and every other code

**Files:**
- Create: `lib/codes/payload.ts`, `fields/{TextFields,CardFields,EventFields,WifiFields,PlaceFields,EmailFields,SmsFields,PhoneFields,SymbologyFields}.svelte`, `CodeFindings.svelte`.
- Modify: `maker.svelte.ts`, `work.ts`, the page.
- Test: `codes.spec.ts`.

**Interfaces:**
- `payloadFor(kind: KindId, fields: object): Result<{ text: string; id: string; textOptions: TextOptions }>`: QR kinds call the package builders (vCard or MECARD by the card's choice; event offset from the browser: `-new Date(start).getTimezoneOffset()` when "Convert to UTC" is on, else `null`); symbologies pass the typed text with the person's text options.
- "How much too long" (spec §12): when `encode` refuses `too-long` for a QR-family or PDF417 code, `work.ts` finds the longest prefix that fits by binary search over the text and reports `{ problem: 'too-long', over: <characters beyond it> }`; the page says "That is N characters more than this code can hold at this error correction."

- [ ] **Step 1: Write the failing tests:**
  - `each QR kind makes a code that decodes to its payload`: for each kind, fill its form with fixed values and decode the preview screenshot; expect exactly the payload the package builder makes for those values (import the builders into the test).
  - `every other code is offered and decodes`: for each id in `OTHER_GROUPS` except `dotcode`, choose it, type the sample from `packages/code-maker/test/encode.test.ts`'s `SAMPLES`, decode the preview, expect the sample's decoded form (MaxiCode included: it is decoded here, from its picture). DotCode: the preview appears and the page notes that it is drawn to the standard but no reader is available here to check it.
  - `a refused character is named` : Code 39 `ABé` shows "é at position 3 cannot be carried by Code 39"; the preview keeps its last code, marked as old.
  - `too long says by how much`: QR at H with 3,000 characters shows "characters more than this code can hold".
  - `switching kind keeps each kind's own fields` (Review Focus 2): fill Wi-Fi, switch to Business card, fill a name, switch back: Wi-Fi fields are as left; the card's payload never contains the network name.
  - `escapes and the UTF-8 marker are honoured`: Text kind with escapes on, `a\tb`, decodes to `a<TAB>b`; with Grüße and the marker on, the decode reports ECI.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `payload.ts`, the forms (each a small component writing to `maker.fields[kind]`), `SymbologyFields` (text field, "Text options" `details` with escapes, trim, line endings, UTF-8 marker), the too-long search in `work.ts`, and `CodeFindings` (the builder's findings ledger styling: a ruled list; badge "Check" for warnings, a filled badge for refusals).
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: every QR kind and every other code on the code maker page`.

---

### Task 3: Options and Look

**Files:**
- Create: `OptionsSection.svelte`, `LookSection.svelte`, `ColourField.svelte`, `ThemeChips.svelte`.
- Modify: `maker.svelte.ts`, `work.ts`, the page, `apps/web/src/app.css` (only if a shared rule is needed; scoped under `.code-maker`).
- Test: `codes.spec.ts`.

**Interfaces:**
- `OptionsSection` renders each `OptionSpec` of the chosen symbology: `choice` as a select, `integer` as `NumberField` with "Automatic" where `default === 'auto'`, `boolean` as a toggle.
- `ColourField` (`label`, bindable `value: string`): a native `<input type="color">` swatch and a hex text field kept in step through `parseColour`; an invalid hex shows a status line and does not change `value`.
- `ThemeChips`: one toggle per theme in `THEMES` plus Surprise me; each chip's sample colours set through `cssVar` (`--from`, `--to`); Surprise me calls `surprise(random)` each press.
- `LookSection`: colours (foreground, background with a Transparent toggle, corners), Invert (`invert`), fill (solid, linear with angle, radial), and for `qr`/`grid` families the dot, ring and eye toggle rows; for `drawn` families a line: "Bar and stacked codes take colours and a quiet zone; shapes apply to square codes."

- [ ] **Step 1: Write the failing tests:**
  - `every dot shape, corner shape and theme still scans`: for each of the 7 dots × default corners, each of 4 rings and 4 eyes with square dots, and each of the 7 themes and one Surprise me draw: set it, screenshot the preview at its rendered size, decode, expect the link. Any combination that does not decode is a finding: remove it from the offer (and from `DotShape`/`Ring`/`Eye` if needed) with a ruling, never weaken the test.
  - `the colour field takes a picker or a typed hex, and refuses nonsense`: typing `0E6F8C` sets the swatch; `zz` shows the status and leaves the colour.
  - `contrast below 4.5:1 warns, below 2:1 stops export`: foreground `#777777` shows a Check finding mentioning contrast; `#bbbbbb` shows a refusal and Copy image and the downloads are disabled.
  - `Invert swaps the colours and warns light on dark` (Review Focus 4, without logo here; Task 4 adds the logo): after Invert, the light-on-dark finding appears.
  - `options change the code`: QR error correction H makes a denser code than L for the same text (compare preview image natural sizes through the SVG view box).
  - `drawn codes show colours and the shapes note, not shape buttons`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the sections and wire `Style` from `maker.look` into `work.ts` (`styleGrid` for `qr`/`grid`; colours and padding into `encode` for `drawn`).
- [ ] **Step 4: Run them.** Expected: PASS (with rulings for any removed combination).
- [ ] **Step 5: Commit:** `feat: options, colours, themes and shapes on the code maker page`.

---

### Task 4: The logo

**Files:**
- Create: `lib/codes/logo.ts`, `LogoSection.svelte`.
- Modify: `maker.svelte.ts`, `work.ts`, `packages/code-maker/src/checks.ts` (only to lower `LOGO_LIMITS` if decoding demands it, with its test), the page.
- Test: `codes.spec.ts`.

**Interfaces:**
- `readLogo(file: File): Promise<Result<{ width: number; height: number; rgba: Uint8Array; png: Uint8Array }>>`: refuses over `LIMITS.logoBytes` (`logo-too-large`) or a non-image; decodes with `createImageBitmap` (raster) or an `img` from a `data:` address (SVG), scales so the longer side is at most 1,024 px, draws onto an `OffscreenCanvas` (or canvas), reads RGBA and encodes PNG. Never a network request; never an object URL left alive.
- `LogoSection` (matrix codes only): Choose image (a visually standard file input with a button-styled label), size as a share (10 to 40 per cent), padding, plate shape, Remove; for Aztec, a line saying Aztec has no room for a logo; a line saying the image stays on this device.

- [ ] **Step 1: Write the failing tests:**
  - `a logo at the largest size each error correction allows still scans`: for L, M, Q and H, choose a test PNG (generated in the test: a 64 × 64 opaque square), raise the share until the page's check refuses, step back one, decode the preview; it must decode at every level with every plate shape. If one does not, lower that level's limit in `LOGO_LIMITS` (with a failing test in `packages/code-maker/test/checks.test.ts` first) until it does.
  - `a logo too large is refused before export`: past the limit, the refusal shows and export is disabled.
  - `a photo is read on the device and the page stays responsive` (Review Focus 1): set a 4,000 × 3,000, 4.9 MB JPEG (generated in the test) as the file; no request carries any of its bytes; the preview shows it within 3 seconds; a keystroke in the address meanwhile takes under 50 ms (the Event Timing measure from `text.spec.ts`).
  - `a file that is not an image, or over 5 MB, is refused in words`.
  - `Invert with a logo` (Review Focus 4): warnings show light-on-dark and keep the logo check.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `logo.ts`, the section, and pass the logo into `Style.logo`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: a logo on the code maker's codes, read on the device`.

---

### Task 5: Size, exports, Copy image and read-back

**Files:**
- Create: `lib/codes/raster.ts`, `readBack.ts`, `Downloads.svelte`, `SizeSection.svelte`.
- Modify: `work.ts`, `worker.ts`, `maker.svelte.ts`, the page.
- Test: `codes.spec.ts`.

**Interfaces:**
- `drawOn(context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, drawing: Drawing, scale: number): void`: background, each layer as `new Path2D(d)` filled (`'evenodd'` when `evenOdd`), gradients from `gradientAxis`/`gradientRadius`, the logo from an `ImageData` of its RGBA fitted in its square.
- `work.ts` outputs: `png` and `jpg` through `OffscreenCanvas` at `pixelsFor(drawing, size)` (`convertToBlob`, JPG quality 0.92, a transparent background filled with the background colour or white for JPG); `svg` (`toSvg` with the pixel size); `pdf` (`toPdf`); `zip` (`bundle` of all four, named with `fileName`).
- Copy image: `navigator.clipboard.write([new ClipboardItem({ 'image/png': promiseOfPngBlob })])` inside the click, so Safari keeps the gesture.
- `readBack(png, expected, decoderFormat)`: uses `BarcodeDetector` where it exists and supports the format; compares `rawValue` with the payload; otherwise `'unavailable'`.
- `SizeSection`: pixels or print size (mm) with 300 or 600 dpi; PDF page fit, A4 or Letter. A warning when a module would be smaller than 0.25 mm at the chosen print size (Review Focus 3).

- [ ] **Step 1: Write the failing tests:**
  - `each download opens and decodes`: PNG and JPG downloads decode with `decodePng`; the SVG download parses and contains no `<script`; the PDF starts `%PDF-1.4` and loads in `pdf-lib` (add it to `apps/web` devDependencies for tests, recorded in AUDIT.md); the ZIP unzips to four files with names matching `code-qr-link-YYYYMMDD-HHMMSS.*`.
  - `a print size gives the right pixels`: 50 mm at 600 dpi gives a 1181-pixel-wide PNG.
  - `a tiny print size warns that modules are too small` (Review Focus 3): version 40 at 10 mm shows the warning.
  - `Copy image puts a PNG on the clipboard`: with clipboard permissions, `navigator.clipboard.read()` returns an `image/png` item that decodes to the link.
  - `refused export disables Copy image and every download`.
  - `read-back says matched, or not available, honestly`: in Playwright's Chromium the result is whatever `BarcodeDetector` reports; the test asserts the line is one of the three sentences and never "matched" when the payload differs (stub `BarcodeDetector` with `page.addInitScript` to return a different value, expect "did not match").
  - `a 600 dpi export at the size limit is ready within 3 seconds and the page stays usable`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `raster.ts`, the outputs, `Downloads`, Copy image, `readBack`, `SizeSection`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: exports, Copy image and read-back on the code maker page`.

---

### Task 6: Proof that nothing leaves, nothing stays, and nothing waits

**Files:** Test: `codes.spec.ts`. Fix in the owning component if a test fails.

- [ ] **Step 1: Write the tests:**
  - `nothing typed, chosen or uploaded is sent anywhere`: type a sentinel into every field of every kind, choose a logo whose bytes contain a second sentinel, run every export; no request's URL, headers or body contains either sentinel or any part of a generated payload; the only requests after load are the worker script and bwip-js's chunk (both `GET` under `/_app/immutable/`).
  - `nothing is kept`: local storage, session storage, cookies and IndexedDB unchanged; the address holds only the kind's fragment; a reload starts empty.
  - `the content security policy is never broken`, including every export and Copy image.
  - `every field keeps text away from spelling and translation services`: the five attributes on every input and textarea; `translate="no"` on the rail.
  - `on a phone the code comes first and nothing scrolls sideways`: at 390 px the preview's top is above the Content section; `scrollWidth ≤ 390` with a long business card and a 100-column PDF417.
  - `WCAG 2.2 AA in both themes` for each section and each kind family (axe, as in `text.spec.ts`).
  - `keyboard alone`: choose a kind, fill the address, change a theme, and press Copy image without the mouse.
  - `typing never waits`: the worst keystroke in the address of a QR version 40 at H, and in a business card's note at its limit, is under 50 ms (the Event Timing measure); the first code appears within 1 second of opening.
- [ ] **Step 2: Run them:** `pnpm --filter @pokerji/web exec playwright test e2e/codes.spec.ts`. Expected: PASS; fix the page for any failure, never the test.
- [ ] **Step 3: Run the whole browser suite:** `pnpm --filter @pokerji/web e2e`. Expected: PASS.
- [ ] **Step 4: Commit:** `test: the code maker sends nothing, keeps nothing and never waits`.

---

### Task 7: The rest of the site

**Files:** Modify `routes/+layout.svelte`, `routes/+page.svelte`, `routes/privacy/+page.svelte`, `routes/sitemap.xml/+server.ts`. Test `e2e/site.spec.ts`.

- [ ] **Step 1: Change the site tests first:** the bar has a "Codes" link to `/codes` (hidden on a phone); the home page has a fourth programme row "Barcodes and QR codes" with its own yellow link "Make a code" (`.programme a.button` count 4); its title names the code maker; the search-engine and sitemap lists include `/codes`; a privacy test finds the heading "Barcodes and QR codes" and the sentence that a chosen logo is read on the device and never sent. Use wording that does not repeat "never sent to this site" (an existing test finds the builder's sentence by that text).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the bar link (Privacy stays last), the home row and title (description at most 160 characters), the sitemap entry, and the privacy section: what the page does, that the worker script and bwip-js are files of this site, that a logo is read on the device, that nothing is stored, and bwip-js's and fflate's licences.
- [ ] **Step 4: Run** `pnpm --filter @pokerji/web e2e`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: the code maker in the bar, on the home page, in the sitemap and on the privacy page`.

---

### Task 8: Look at it

- [ ] **Step 1:** Add to `apps/web/scripts/capture-pages.mjs` the code maker's states: empty Link; a filled Link; Wi-Fi; a business card; EAN-13; PDF417; a theme with circles and leaf corners; a logo; a low-contrast warning; a refusal; desktop and phone, light and dark.
- [ ] **Step 2:** Build, serve on 127.0.0.1:4398 (environment in `scripts/smoke.sh`), run `node scripts/capture-pages.mjs`, stop the server.
- [ ] **Step 3: Inspect once** against `DESIGN.md` and the direction: one yellow button; no red; the preview box's size fixed across states; the transparency board visible only for a transparent background; theme chips readable in both themes; the phone puts the code first; nothing scrolls sideways. Run `impeccable detect --json apps/web/src/lib/codes apps/web/src/routes/codes` once. Fix everything in one batch, capture once more, stop.
- [ ] **Step 4:** `pnpm --filter @pokerji/web e2e`, then commit: `docs: screenshots of the code maker's states`.

---

### Task 9: The documents

- [ ] Update `PRODUCT.md` (users, purpose, capabilities: the fourth tool), `DESIGN.md` (a "Code maker" section recording the preview box, transparency board, colour field and theme chip as built), `CLAUDE.md` (the package's rules: bwip-js only in the worker, decoding tests as the proof of every offered style, the logo limits never raised without a decoding test, the character detail, the payload line-ending rule, nothing stored, the preview as a data image), `README.md` (a section for the tool; the package row in "How it is built"). Run `pnpm format:check && pnpm test && pnpm typecheck`; commit `docs: the suite has four tools`.

---

### Task 10: Review and release check

- [ ] **Step 1:** Dispatch `octo:skills:octopus-code-review` on `main..HEAD` with both specs, both plans, both Review Focus sections, and Plan 1's deferred minors: clock-dependent ZIP times; years past 9999; one UTC offset for both event ends; mailto local parts; all-hex Wi-Fi names; vCard URL line breaks; PDF colour and page-width guards; the Data Matrix logo fallback test.
- [ ] **Step 2:** Dispatch `octo:skills:octopus-security-audit` on `main..HEAD`: exfiltration through any path (requests, storage, clipboard beyond the press, error reporting, the worker); the logo pipeline (file types, sizes, SVG handling, object URLs); the preview's data URI and SVG output; bwip-js and the worker's isolation; the Content Security Policy; randomness of Surprise me; denial of service from the largest codes and files.
- [ ] **Step 3:** Fix every Critical and Important finding with a failing test first; list every Minor for the owner.
- [ ] **Step 4:** `pnpm format:check && pnpm typecheck && pnpm test && pnpm --filter @pokerji/web e2e && pnpm --filter @pokerji/web build && pnpm --filter @pokerji/web smoke && docker build -t pokerji-codes-check .` then `docker rmi pokerji-codes-check`. Expected: all pass.
- [ ] **Step 5:** Commit the fixes and report to the owner. Merging and deploying are the owner's actions.
