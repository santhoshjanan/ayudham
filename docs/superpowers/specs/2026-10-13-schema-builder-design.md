# Schema Markup Builder — Design

Date: 2026-10-13
Status: approved 2026-10-13; amended the same day (sections 3, 5, 6 and 7) after reading the sources

## 1. Purpose

A free builder for Schema.org structured data in JSON-LD. It is the second tool in the pokerji suite. Someone picks a type, fills in a form, and copies markup ready to paste into their site. It has guided forms for ten common types and an escape hatch to the whole Schema.org vocabulary.

It is for site owners and marketers who want correct markup without learning the vocabulary, and for developers and SEO specialists who know the vocabulary and want it written faster.

Security and privacy outrank feature scope and delivery speed, as everywhere in this repository. The builder runs entirely in the browser: nothing typed into it is sent to or stored on the server.

### Success criteria

- Someone who has never written JSON-LD can produce valid markup for one of the ten guided types and copy it, without leaving the page.
- Someone who knows Schema.org can build any type with any of its properties, nested to five levels.
- Several items can be emitted together as one `@graph`, referring to each other.
- The page states what search engines require and recommend for each guided type, and what is still missing.
- No request made by the page carries anything the person typed.

### Out of scope for the first version

Importing existing JSON-LD; share links; saving drafts on the server; languages other than English; Microdata or RDFa output; fetching or testing a live page; JSON-LD on pokerji's own pages.

## 2. Architecture

### Where things live

```
packages/schema-builder     draft model, serialiser, guided types, checks,
                            vocabulary reader; no I/O, no DOM, no framework
apps/web/src/routes/schema  the page: renders the editor, wires copy,
                            download and local storage
apps/web/static/schema      the compacted vocabulary and its licence record
```

`packages/schema-builder` follows `packages/poker-engine`: plain TypeScript, tested with Vitest, exported from `src/index.ts`. It depends on Zod and nothing else.

Nothing is added to `packages/poker-server`, Postgres, Valkey or the WebSocket path. The server's only new work is serving one page and one static file. There is no form action, no endpoint and no cookie for this tool.

### Pages

| URL | Surface |
|---|---|
| `/schema` | The builder |
| `/schema/vocabulary.json` | Static file: the compacted Schema.org vocabulary |

`/schema` is public and indexable. It uses `Seo.svelte` for its title, description, canonical address and link-preview tags, and is added to `/sitemap.xml`. Nothing exists below it except static files, so nothing there needs `noindex`.

### One editor

One Svelte editor renders any list of fields. A guided type supplies its list as data. A type outside the ten gets its list from the vocabulary. Guided and free-form items are therefore the same thing to the model, the serialiser and the checks; a guided definition only decides which fields come first, what they are called, and which are required or recommended.

## 3. The draft model

A draft is an ordered list of items.

An item has:

- a key: a locally generated identifier, stable for the life of the draft, never emitted;
- a type: a Schema.org type name;
- an optional `@id` set by the person;
- values: a map from property name to an ordered list of values.

A value is one of:

| Kind | Holds |
|---|---|
| text | a string |
| number | a string that should parse as a number |
| boolean | true or false |
| date | an ISO 8601 date |
| date-time | an ISO 8601 date and time |
| time | an ISO 8601 time |
| URL | a string that should be an absolute URL |
| item | a nested item |
| reference | the key of a top-level item |

Values are held as the person typed them, so a half-typed date is not lost. Whether a value fits its kind is the checks' business, not the model's.

### Limits

| Limit | Value |
|---|---|
| Top-level items | 20 |
| Nesting depth | 5 |
| Values per property | 50 |
| Properties per item | 100 |
| Text value length | 5,000 characters |
| Type or property name | 100 characters, letters and digits only |
| Values in the whole draft, at every depth | 2,000 |

The editor refuses to go past a limit and says which one was reached. The limits live in `packages/schema-builder` and are enforced there, so stored data read back is held to the same ones.

### Changing a draft

The package exports pure functions that take a draft and return a new one: add, remove and move an item; set an item's type or `@id`; add, change, remove and move a value. Each returns the same draft unchanged, with a reason from a fixed list, when it would break a limit. The page holds the draft in Svelte state and calls these.

Removing a top-level item that others refer to leaves those references in place; the checks report them. The page asks before removing such an item.

Changing an item's type keeps every value whose property the new type also has, and drops the rest after the page has asked.

## 4. The output

`serialize(draft)` returns a plain object.

- No items: nothing. The page shows an empty state instead of output.
- One item: one object, with `"@context": "https://schema.org"` first.
- Several items: `{ "@context": "https://schema.org", "@graph": [ … ] }`, in the draft's order.

Within an item:

- `@type` first, then `@id` if there is one, then properties in the order the editor shows them.
- A property with no non-empty value is left out. Whitespace-only text counts as empty. A nested item with no properties is left out.
- One value is written as a scalar; several as an array.
- Text, dates, times and URLs are written as strings. A number is written as a JSON number when it parses as one, and as a string otherwise. Booleans are written as booleans.
- A reference is written as `{ "@id": "…" }`.

### `@id`

An item is given an `@id` in the output when the person set one, or when another item refers to it. A generated `@id` is `#` followed by the item's type in lower case and, if that type appears more than once among referred-to items, a number: `#organization`, `#person-2`. The page explains that a fragment `@id` is relative to the page the markup is placed on, and that the person can replace it with a full address.

A reference whose target no longer exists is left out of the output and reported by the checks.

### Two forms

- **Raw JSON:** `JSON.stringify` with two-space indentation.
- **Script tag:** the same JSON inside `<script type="application/ld+json">` and `</script>`, with every `<` in the JSON written as `<`. Text such as `</script>` or `<!--` in a description therefore cannot end the block early or change how the page it is pasted into is parsed. This escaping is part of the package and has its own tests. The raw form is not escaped.

The output is stable: the same draft always serialises to the same text.

## 5. Guided types

Ten guided definitions:

| Guided type | Variants offered | Nested types it uses |
|---|---|---|
| Organization | | PostalAddress, ContactPoint |
| LocalBusiness | | PostalAddress, GeoCoordinates, OpeningHoursSpecification |
| WebSite | | |
| BreadcrumbList | | ListItem |
| Article | Article, BlogPosting, NewsArticle | Person, Organization, ImageObject |
| FAQPage | | Question, Answer |
| Product | | Offer, AggregateRating, Brand, Review |
| Event | | Place, PostalAddress, Offer, Person, Organization, PerformingGroup |
| Person | | PostalAddress |
| Recipe | | NutritionInformation, HowToStep, AggregateRating |

A guided definition is data:

- the type, and any variants the person can switch between without losing values;
- an ordered list of fields. Each field names a property, a label and a one-line hint in plain English, the kinds of value it takes, whether it repeats, a level (required, recommended or optional), and for a nested item the definition used for it;
- optionally a note shown at the top of the form, for anything Google states about eligibility;
- optionally groups of fields of which at least one must have a value (a product needs an offer, a rating or a review).

Nested types have definitions of the same shape, without variants.

BreadcrumbList and FAQPage are lists at heart. Their definitions mark the repeating property, so the editor shows "Add a step" and "Add a question" and numbers breadcrumb positions itself.

Any item, guided or not, can have further properties added from the vocabulary. They appear after the guided fields.

### Where the levels come from

Required and recommended levels come from Google Search Central's structured data documentation for each type, read at implementation time. They are not written from memory.

`packages/schema-builder/RULES.md` records, for each guided type, the documentation page used and the date it was checked. The package exports that date. The page shows it, and says that meeting these rules does not guarantee a rich result.

Where Google documents no rich result for a type, the definition has no required fields, its recommended fields are the ones the definition's author judged most useful, and `RULES.md` says so. That is the case for Person, and for FAQPage: Google removed its FAQ result and its documentation in June 2026. FAQPage stays a guided type because the markup is valid Schema.org that other readers use, and its form says so in a note.

Two things in Google's current documentation shaped the guided fields. Its WebSite guidance covers the site name only, so `SearchAction` is not a guided field. Its event result covers physical events only, so `VirtualLocation` is not one either. Both remain available through "Add another property".

Where a definition departs from its source on purpose (identifiers on Organization are optional, for example), `RULES.md` lists the departure and the reason.

## 6. The checks

`check(draft)` is a pure function returning a list of findings. A finding names the item's key, the path to the value, and a kind:

| Kind | Meaning |
|---|---|
| missing-required | A required field of a guided definition has no value |
| missing-recommended | A recommended field of a guided definition has no value |
| bad-url | Not an absolute `http` or `https` URL |
| bad-date | Not an ISO 8601 date, date-time or time, as the field expects |
| bad-number | Does not parse as a number |
| bad-currency | Not three letters, in a field that takes an ISO 4217 code |
| out-of-range | A rating value outside the best and worst given beside it, or outside 1 to 5 when none are given |
| dangling-reference | Refers to an item that no longer exists |
| unknown-property | A property the vocabulary does not list for this type (only once the vocabulary is loaded) |

Findings carry kinds, not sentences. The page turns a kind into words. A `missing-required` finding for an at-least-one group also lists the group's properties, and is reported once for the group, not once for each member.

Rules:

- Required and recommended apply to guided definitions only, including the nested ones. A free-form item gets the remaining checks, and the page says in plain words that no required or recommended rules exist for that type, so an absence of findings is not read as approval.
- A required field inside a nested item counts only if that nested item has any value at all. An empty optional `Offer` does not complain that it has no price.
- Checks never block. Copy and Download are always available.

## 7. The vocabulary

### Source and licence

The official Schema.org release file `schemaorg-current-https.jsonld`, from one named release: 30.1 at the time of writing. Schema.org is published under the Creative Commons Attribution-ShareAlike 3.0 licence.

The release file is not committed. Its compacted form is, at `apps/web/static/schema/vocabulary.json`, as an adaptation under the same licence.

`apps/web/static/schema/LICENSES.md` records the release version, the address the file was fetched from, the date, the licence and attribution, the SHA-256 of the release file and the SHA-256 of the compacted file. The builder page carries a visible attribution line linking to schema.org and the licence.

Nothing is fetched from schema.org when the app runs or when it is built.

### Compaction

`packages/schema-builder/scripts/compact-vocabulary.ts` is run by hand when moving to a new release. It takes the path of a downloaded release file and writes the compacted file. It keeps:

- each type: its name and its parent types;
- each property: its name, the types it belongs to and the value types it expects;
- each enumeration's members;
- which types are data types (Text, Number, Date and so on).

It drops terms in the pending and attic sections, and everything else. Its output is deterministic: sorted, with no timestamps, so the same input always gives the same checksum.

A test recomputes the SHA-256 of the committed file and compares it with `LICENSES.md`.

### Descriptions

Schema.org's descriptions make the escape hatch usable without a second tab, and are most of the file's weight. The rule:

- If the compacted file with descriptions, cut to their first sentence and stripped of markup, is under 150 kB compressed with gzip, they are included in `vocabulary.json`.
- Otherwise they go in a second file, `apps/web/static/schema/descriptions.json`, fetched only when someone first expands a property's help, and recorded in `LICENSES.md` the same way.

Measured on 2026-10-13 against release 30.1: about 62 kB compressed with descriptions, about 28 kB without. Descriptions are included in `vocabulary.json`, and there is no second file.

### Loading

The page fetches the vocabulary from its own origin the first time someone opens the type picker or "Add another property", and not before. The ten guided forms work without it. A draft restored from local storage that contains a free-form item fetches it at once, because that item's fields come from it.

The fetched file is parsed through a Zod schema before use. If the fetch or the parse fails, the guided forms keep working, free-form items show the properties they already hold as plain rows, and the escape hatch shows a message with a retry.

### Reading it

The package exports functions over a parsed vocabulary:

- every type, for the picker, searchable by name;
- a type's properties, its own first and then each ancestor's, nearest first, without repeats;
- a property's expected kinds. `Text` gives text, `URL` gives URL, `Number`, `Integer` and `Float` give number, `Date`, `DateTime` and `Time` give theirs, `Boolean` gives boolean, an enumeration gives a choice of its members, and any other type gives an item or a reference. A property that expects several gives the person a choice of kind, with the simplest first.

## 8. The page

This section fixes behaviour. The visual direction goes through Impeccable before any interface is built, and is recorded in its own document beside this one, as planning poker's was.

### Layout

Two regions: the editor, and the output with its findings. Side by side on a wide screen. Stacked on a narrow one, editor first, with a link that jumps to the output.

### The editor

- An empty draft shows the ten guided types as choices, and "Another type", which opens the picker over the whole vocabulary.
- Each item is a section that opens and closes, headed by its type and its `name` value if it has one. Items can be added, removed and moved up and down by buttons; there is no drag and drop.
- Inside an item: required fields, then recommended, then optional guided fields behind "More fields", then properties added from the vocabulary, then "Add another property", which searches the vocabulary's properties for that type.
- A repeating field has "Add another" and a remove button on each value.
- A field that takes an item shows it in place, indented under the property, with its own fields. The person can choose "Refer to an existing item" instead and pick a top-level item.
- Every input has a visible label. The hint and any finding for a field are tied to it for screen readers.

### The output

- The live JSON-LD, updated as the person types.
- A switch between script tag and raw JSON. The choice is remembered with the draft.
- Copy, using the existing `CopyButton`. It is the page's one primary action.
- Download: `schema.html` for the script tag form, `schema.jsonld` for raw JSON, made in the browser from a Blob.
- Findings, grouped by item, each a button that opens the item and moves focus to its field. Counts of required and recommended findings are stated in words.
- The date the rules were last checked, the statement that they are no guarantee, and two plain outbound links: Google's Rich Results Test and the Schema.org validator. The page sends nothing to either; the person pastes their own markup there. Like the footer links they receive no referrer, and nothing is loaded from those sites.
- The Schema.org attribution line.

### Design rules that constrain it

- Yellow marks Copy and nothing else on this page.
- Red is only for removing an item and for Clear, always with the word. Findings are never red: required and recommended are told apart by wording and a badge, not by colour alone.
- No inline styles. The JSON preview is coloured by class. Indentation of nested items uses classes or the `cssVar` action.
- Light and dark are built to the same standard.
- Tokens come from `apps/web/src/app.css`. No raw colours in components.

### Without JavaScript

The builder needs JavaScript. The server-rendered page still carries its heading, its explanation, the list of supported types and the privacy statement, and a `noscript` line saying the builder itself needs JavaScript.

## 9. Local storage

One key, `pj-schema-draft`, holding a version number, the draft and the chosen output form. It is written a short moment after each change and never sent anywhere.

Local storage is untrusted input: another script on the origin could not exist under the Content Security Policy, but a person, an extension or an older version of the app can have written anything. On load the stored value is parsed through a Zod schema that enforces every limit in section 3. Anything that fails, or carries an unknown version, is discarded and the page starts empty.

If local storage is unavailable or full, the builder works without it and says once that the draft will not survive a reload.

"Clear" asks first, then removes the key and empties the editor.

A tab writes to storage only after it has changed the draft itself, so a tab left open and untouched cannot overwrite or remove a draft made in another tab.

## 10. Privacy and data

| Data | Where | For how long | Who can read it |
|---|---|---|---|
| The draft and output form | The person's browser, local storage | Until they clear it or their browser does | Anyone with that browser profile |
| Anything typed into the builder | Nowhere on the server | Not stored | Nobody else |

- The server stores nothing for this tool and receives nothing typed into it. There is no form, endpoint, cookie or WebSocket for it.
- Requests the page makes: the page itself, its scripts, styles and fonts, and the vocabulary file. None carries anything typed.
- No metric is added. The service-wide request counts already cover the page being served; nothing about its use reaches the server to be counted.
- The builder's fields turn the browser's spell-check off, because some browsers can be set to send text being checked to their maker.
- No third-party script, font, image or request. The two validator links and the attribution links are plain links.
- The Content Security Policy is unchanged. The vocabulary fetch is same-origin, allowed by `connect-src 'self'`.
- The privacy page gains a section saying the above in plain words.
- No new runtime dependency. Zod is already shipped.

### Trust boundaries

- What the person types is trusted as theirs, and ends up in markup they paste into their own site. The script-tag escaping in section 4 keeps a value from breaking out of the block.
- Stored drafts are untrusted (section 9).
- The vocabulary file is ours, but is still parsed through a schema before use.
- Typed values are rendered as text only, never as HTML.

## 11. Changes to the rest of the site

- **Home page.** A second row in the tool list: "Schema markup builder", a two-sentence description and a "Build markup" button to `/schema`. The hero, which now describes only planning poker, is widened to the suite. Proposed, for the owner to edit:
  - Heading: "Planning poker and schema markup, without the sign-up." It keeps the words "planning poker", which the existing test of the home page's heading requires and which people search for.
  - Text: "Free small tools for teams. No accounts, no trackers: open one, use it, get on with the work."
  - The page's title and description follow the same change. The planning poker demo stays in the hero.
- **Top bar.** A "Schema markup" link beside "Planning poker" and "Privacy". On screens up to 34rem the bar keeps the wordmark, Privacy and the theme toggle, and drops both tool links; the home page, which the wordmark opens, lists the tools.
- **Sitemap.** `/schema` is added to the list in `/sitemap.xml`.
- **Privacy page.** The new section from section 10.
- **Documents.** `PRODUCT.md`, `README.md`, `CLAUDE.md` and `DESIGN.md` are brought up to date for a suite of two tools.

## 12. Failure behaviour

| What fails | What the person sees |
|---|---|
| The vocabulary cannot be fetched or parsed | Guided forms work; the escape hatch shows a message and a retry |
| Local storage is unavailable or full | The builder works; one notice that the draft will not survive a reload |
| The stored draft does not parse | The page starts empty |
| The clipboard is refused | The output stays selectable, and the page says to copy it by hand |
| A limit is reached | The control that would pass it is disabled, with the limit stated |

## 13. Testing

### Package

- Serialising: no items, one item, several; nesting; references and generated `@id`s, including two of one type; empty values left out; scalar and array forms; numbers; stable order.
- Script-tag escaping, with `</script>`, `<!--` and `<` in values.
- Every draft-changing function, and every limit.
- Every finding kind, including required fields inside empty and non-empty nested items.
- Each of the ten guided types: a filled-in draft against a fixture of known-good markup, and an empty draft against its expected findings.
- The vocabulary reader against a small hand-made vocabulary: inheritance order, expected kinds, enumerations.
- Parsing of stored drafts: oversized, too deep, malformed and unknown-version data are all rejected.
- The compaction script against a small hand-made release file, and that running it twice gives identical output.
- The checksum of the committed vocabulary against `LICENSES.md`.

### Browser, against a build

Each context is created through `visitor()`.

- Build a guided item, copy it, and find valid JSON on the clipboard, in both output forms.
- Build two items with a reference and find one `@graph` with matching `@id`s.
- The vocabulary is not requested on page load, and is requested once the escape hatch is opened.
- Add a property and a nested item of a type outside the ten.
- With the vocabulary request blocked, the guided forms still work and the retry is shown.
- No request made after the page has loaded carries a string typed into the form.
- The draft survives a reload; Clear removes it; a corrupted stored value gives an empty page.
- Download produces a file with the expected name and contents.
- No Content Security Policy violation is reported during any of the above.
- `/schema` is in the sitemap, is not disallowed in `/robots.txt`, and carries no `noindex`.
- An accessibility scan of the page in each state.

### Screens

The capture scripts gain the builder's states, in light and dark.

### Review

When the build is complete: the Octopus code review, and the Octopus security audit. Nothing is stored on the server, but the tool emits markup that people paste into their own sites, and it reads untrusted data from local storage.
