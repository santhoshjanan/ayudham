---
version: 1
slug: "apps-web-src-routes-text-page-svelte"
primary_target: "apps/web/src/routes/text/+page.svelte"
related_targets: []
---

# Text tools — surface brief

Scope: the generators and converters at `/text`.
Visitor mode: Operate.

Audience and job: someone in the middle of other work, at a desk or on a phone, who needs one result. Choose a tool, set or type, copy, leave.

Constraints: the owner's instruction is to hold on to the existing design and add only missing components, matching the existing ones. Content Security Policy forbids inline styles. Fonts and assets self-hosted. Light and dark to equal standard. WCAG 2.2 AA. Nothing typed or generated may leave the browser or be stored.

Build path: code-led.

## Direction contract

THESIS: A sibling of the markup builder in "Judges' Row", not a new world. A band, two rows of tools, then a floor (what you set or type) and a rail (what you take away).

OWN-WORLD: `DESIGN.md` unchanged. No token changes; no existing component restyled.

FIRST VIEWPORT: The site bar; the aqua band with "Text tools" and one line; on the tile, the Generate and Convert rows with Password open; from 64rem the options in the 40rem column and the rail beside it holding the yellow Generate again, the strength line and a password with its Copy. Below 64rem one column, rail after floor, no dock.

FORM: The rail's first control is the one yellow button: Generate again, Copy, or Copy all. No red anywhere. Strength is a sentence, never a meter. On-or-off options are toggle buttons with the inverted fill. Nothing animates.

ADDED COMPONENTS: tool row (links drawn as toggle buttons, wrapping, `aria-current` on the open one); result row (ruled line, optional name in soft ink, value in the code block's monospace, compact Copy).

Full brief: `docs/superpowers/specs/2026-10-14-text-tools-design-direction.md`.
