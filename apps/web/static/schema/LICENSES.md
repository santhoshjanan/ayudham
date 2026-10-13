# Bundled vocabulary

`vocabulary.json` is an adaptation of the [Schema.org](https://schema.org/) vocabulary, which
its sponsors publish under the
[Creative Commons Attribution-ShareAlike 3.0 Unported licence](https://creativecommons.org/licenses/by-sa/3.0/).
This adaptation is offered under the same licence.

It is made by `packages/schema-builder/scripts/compact-vocabulary.ts` from the release file
below. It keeps each type's name and parents, each property's name, the types it belongs to,
the types it expects and the first sentence of its description, and each enumeration's
members. It leaves out the pending and attic sections and everything else. Nothing is fetched
from schema.org when the app is built or run.

To move to a new release: download its `schemaorg-current-https.jsonld`, run the script, and
replace this row. A test compares the last checksum with the file.

| File | Schema.org release | Source | Fetched | SHA-256 of the source | SHA-256 of this file |
|---|---|---|---|---|---|
| `vocabulary.json` | 30.1 (2026-09-16) | https://schema.org/version/30.1/schemaorg-current-https.jsonld | 2026-10-13 | `0a4b8c4c910fc831ec8695196510973390906a5ee34dc6b862dfec4d21a12f74` | `71720224b66693c36f98abb9b8eafbdb80004e7d1ce46e8fce2840f7ea080b65` |
