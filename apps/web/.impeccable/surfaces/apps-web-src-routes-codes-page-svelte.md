---
version: 1
slug: "apps-web-src-routes-codes-page-svelte"
primary_target: "apps/web/src/routes/codes/+page.svelte"
related_targets: []
---

# Barcodes and QR codes — surface brief

Scope: the code maker at `/codes`.
Visitor mode: Operate.

Audience and job: someone who needs a real code (a link, a Wi-Fi card, a business card, a product barcode), at a desk or on a phone. Choose the kind, fill it in, see it change, take away a file that prints sharply.

Constraints: hold on to the existing design; add only missing components, matching the existing ones. Content Security Policy forbids inline styles. Light and dark to equal standard. WCAG 2.2 AA. Nothing typed or uploaded leaves the browser or is stored.

Build path: code-led.

## Direction contract

THESIS: A sibling of the text tools and the builder in "Judges' Row". A band, the kind picker (QR kinds as a tool row, other codes in one grouped select), then a floor of ruled sections (Content, Options, Look, Logo, Size) and a rail holding the code.

OWN-WORLD: `DESIGN.md` unchanged. No token changes; no existing component restyled.

FIRST VIEWPORT: The bar; the aqua band with "Barcodes and QR codes" and one line; the QR kind row with Link chosen and the Other codes select; from 64rem the Content section beside the sticky rail, whose fixed preview box shows the dashed "not there yet" outline above a disabled Copy image. Below 64rem the rail comes first, then the floor.

FORM: Copy image is the one yellow button, under the preview. No red. Findings use the builder's ledger and badges. The code's own colours appear only in the preview and the theme chips, through `cssVar`. Nothing animates.

ADDED COMPONENTS: preview box (fixed square, the code as a data-URI image); transparency board (checkerboard in `--line` on `--surface`); colour field (swatch picker plus hex field); theme chip (toggle with a colour sample through `cssVar`).

Full brief: `docs/superpowers/specs/2026-10-16-code-maker-design-direction.md`.
