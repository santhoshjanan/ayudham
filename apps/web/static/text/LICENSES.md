# Bundled word list

`eff_large_wordlist.txt` is the
[EFF long word list for passphrases](https://www.eff.org/deeplinks/2016/07/new-wordlists-random-passphrases),
made by the Electronic Frontier Foundation and published under the
[Creative Commons Attribution 3.0 United States licence](https://creativecommons.org/licenses/by/3.0/us/).

The file is exactly as published: 7,776 lines, each a dice number, a tab and a word. Nothing is
fetched from eff.org when the app is built or run. The passphrase tool fetches the file from this
site, checks its SHA-256 against the value in `packages/text-tools/src/wordlist.ts`, and then
checks its shape, before using a word.

To replace the file: download it again, put its checksum in the row below and in
`WORD_LIST_SHA256`. A test compares the three.

| File | Source | Fetched | SHA-256 |
|---|---|---|---|
| `eff_large_wordlist.txt` | https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt | 2026-10-14 | `addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e` |
