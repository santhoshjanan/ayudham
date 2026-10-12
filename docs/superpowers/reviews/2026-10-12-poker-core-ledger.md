# SDD ledger — plan: docs/superpowers/plans/2026-10-12-poker-core.md
Setup: Ruling: added `.superpowers/` to .gitignore — the workspace was not git-ignored — cost if wrong: one line to remove.
Pre-flight: T1→T2 cardSchema/Deck/TITLE_MAX: consistent. T1,T2→T3 Deck/RoundResult/cardValue: consistent. T2,T3→T4 protocol types, MAX_PARTICIPANTS, AWAY_DROP_MS: consistent. T4→T5 ok/deny/find/patch/freshRound, dropStale, helpers: consistent. T4,T5→T6 without, handleClient, Command union: consistent. No conflicts.
Task 1: Ruling: pinned vitest 5.0.3 and zod 4.6.5 instead of ^5.0.4/^4.6.7 — the newer versions were published today and pnpm had to add minimumReleaseAgeExclude entries to install them; removed those exclusions to keep the supply-chain age guard intact — cost if wrong: bump two versions later.
Task 1: complete (commits c02a0ce..0f7a347, tests: pnpm --filter @pokerji/protocol test →    Duration  185ms (import 50%, transform 41%, tests 6%, worker 3%))
Task 2: complete (commits 0f7a347..038afba, tests: pnpm --filter @pokerji/protocol test →    Duration  215ms (import 50%, transform 41%, tests 6%, worker 3%))
Task 3: complete (commits 038afba..2331757, tests: pnpm --filter @pokerji/poker-engine test →    Duration  169ms (import 50%, transform 41%, tests 5%, worker 3%))
Task 4: complete (commits 2331757..de3d253, tests: pnpm --filter @pokerji/poker-engine test →    Duration  223ms (import 45%, transform 38%, tests 13%, worker 4%))
Task 5: complete (commits de3d253..31ccb70, tests: pnpm --filter @pokerji/poker-engine test →    Duration  252ms (import 47%, transform 46%, tests 5%, worker 2%))
Task 6: complete (commits 31ccb70..2430260, tests: pnpm test →    Duration  242ms (import 50%, transform 43%, tests 5%, worker 2%))
Final review: Octopus code review (octo:skills:octopus-code-review), fresh context. No Critical. 4 Important, 6 Minor.
Final: fixed moderator locked out of a full room — "still lets a moderator in, so a full room cannot be left without one" RED→GREEN, suite 143/143
Final: fixed cards and titles accepting control/invisible/bidi/combining/surrogate characters — 3 tests in deck.test.ts and 2 in messages.test.ts RED→GREEN, suite 143/143
Final: fixed moderator deleting a locked vote during the count — "is refused during the count, so a locked vote cannot be deleted" RED→GREEN, suite 143/143
Final: fixed authorization matrix asserting nothing for allowed actions — allowed rows now assert the state changed; setRole row no longer a no-op; suite 143/143 (test-only change, no RED)
Final: Ruling: host-initiated `evict` still works during the count — it is used when a passcode is set or changed, where signing people out immediately matters more than preserving one round's result — cost if wrong: one round's saved result can omit an evicted voter.
Final: Ruling: card rule rejects emoji that carry a variation selector or joiner (e.g. some keyboard-entered emoji) — safest rule that keeps cards visible and storable; the UI should strip the selector on input — cost if wrong: some emoji cards are refused until the UI normalises them.
Final: Ruling: moderators exempt from the 50 cap, so a room can briefly exceed 50 by its number of moderators — cost if wrong: slightly larger rooms.
Final: Ruling (declined-to-judge items, carried to Plan 2 as host requirements): enforce 2 KB at the socket; add schemas for display name, timer seconds and music; send `disconnect` only on a participant's last connection; do not count benign `forbidden` races as abuse; keep the persistRound payload to retry failed saves; do not use roundSeq as a durable key; tick at least every 250 ms.
Final: fixed (at the user's request) a voter dropped for absence at the reveal being named in the result but missing from the participant list — "keeps an away voter on show while their revealed vote is, then drops them next round" RED→GREEN, suite 144/144
Final: minor (deferred): vote-secrecy test checks named fields, not the whole serialised snapshot.
Final: minor (deferred): no test deep-freezes input state; built-in deck arrays are shared by reference and unfrozen.
Final: minor (deferred): changing timer length while a timer runs keeps the old deadline.
Final: minor (deferred): a refused deck change also drops the timer and music changes, with no signal to the host.
Final: minor (deferred): a repeated disconnect for an already-away participant resets the ten-minute clock.
