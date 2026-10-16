# Package audit

Every package this tool uses was read for network, storage, tracking and code-loading calls before it was added. Re-run this audit when a version changes.

Date: 2026-10-16

| Package | Version | Shipped to visitors | Dependencies |
|---|---|---|---|
| `fflate` | 0.8.3 | yes | none |
| `bwip-js` | 4.11.4 | yes, inside the code maker's worker (bundled into the worker script), and on the page only where workers are missing | none |
| `zxing-wasm` | 3.1.5 | no, tests only (this package's and `apps/web`'s browser tests) | type packages only |
| `pdf-lib` | 1.17.1 | no, tests only | four |

## Command

From `packages/code-maker`:

```sh
PAT='\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|importScripts|eval)\b|document\.cookie|new Function|import\('
grep -nE "$PAT" node_modules/bwip-js/dist/bwip-js-gen.mjs node_modules/bwip-js/dist/bwipp.mjs node_modules/fflate/esm/browser.js
```

## Result

- `bwip-js/dist/bwip-js-gen.mjs` (the `bwip-js/generic` entry this tool uses): no match.
- `bwip-js/dist/bwipp.mjs` (the encoders): 20 matches, all internal to the PostScript port:
  - lines 879, 889, 890: comments describing PostScript's `fetch` operator;
  - line 909: a method named `fetch()` on the encoders' own cache object (`bwipp_fifocache`), which reads from an in-memory `Map`;
  - lines 21499, 22737, 24508, 27139, 29371, 30915, 32640, 34468, 35802, 37439: calls to that cache method by its key, `'fetch'`;
  - lines 6512 to 6543: a variable named `$_.eval`, holding a slice of the input.
- `fflate/esm/browser.js`: no match.
- Neither shipped package uses `globalThis`, timers for work, or any browser object; `bwip-js/generic` is platform neutral by design.

## Test-only packages

- `zxing-wasm` downloads its WebAssembly file from jsDelivr unless given the bytes. The tests always give it `node_modules/zxing-wasm/dist/reader/zxing_reader.wasm` and replace `globalThis.fetch` with a function that throws, so a test can never reach the network. `apps/web/e2e/decode.ts` does the same in the browser tests, decoding screenshots in Node, never in the page.
- `pdf-lib` is used only to load the PDFs this tool writes, proving they parse. It is not shipped: its last release was in 2021 and it brings four dependencies.
