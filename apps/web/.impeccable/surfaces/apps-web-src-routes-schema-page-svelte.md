---
version: 1
slug: "apps-web-src-routes-schema-page-svelte"
primary_target: "apps/web/src/routes/schema/+page.svelte"
related_targets: []
---

# Schema markup builder — surface brief

Scope: the builder at `/schema`.
Visitor mode: Operate.

Audience and job: someone building structured data for their own site, alone at a desk or checking on a phone. Fill in a form, watch the markup form beside it, copy it.

Constraints: the owner's instruction is to hold on to the existing design and add only missing components, matching the existing ones. Content Security Policy forbids inline styles. Fonts and assets self-hosted. Light and dark to equal standard. WCAG 2.2 AA.

Build path: code-led.

## Direction contract

THESIS: A sibling of the live room in "Judges' Row", not a new world. A band in place of the stage, then a floor (the editor) and a rail (the markup).

OWN-WORLD: `DESIGN.md` unchanged. No token changes; no existing component restyled.

FIRST VIEWPORT: The site bar; the aqua band with the page title and one line; on the tile, the editor in the column and, from 64rem, the markup rail beside it, staying in view. Below 64rem a dock on the bottom edge: Copy at full width and a Markup button that opens a sheet.

FORM: Copy is the one yellow button. Red only on Remove and Clear, with the word. Required and Recommended are role badges (filled, outlined). Findings are ledger rows, never red. Nothing animates.

ADDED COMPONENTS: code block (system monospace, two inks); search with results in the page; nested group (fieldset, stepped in, 1px line); compact button (the bar's copy button height, with words); multi-line field; checkbox tinted aqua.

Full brief: `docs/superpowers/specs/2026-10-13-schema-builder-design-direction.md`.
