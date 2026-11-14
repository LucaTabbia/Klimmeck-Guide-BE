---
phase: 22-completamento-guidato-missioni
reviewed_at: 2026-11-14
areas: [A, B]
status: issues_found
findings: { critical: 0, high: 0, medium: 4, low: 8 }
---

# Phase 22 — review per aree

Testo integrale dei due report della review (in sola lettura), area A poi area B. Ruling dell'orchestratore e correzioni in `22-REVIEW-FIX.md`.

# BE Phase 22 review, area A (mission-in-progress lock)

Summary: 0 CRITICAL, 0 HIGH, 1 MEDIUM, 4 LOW. No bypass of the lock found.

Verified OK (no finding):
- The mutations in the app are: completePendingRequest, the guided ones (area B), abandonQuest, acknowledgeQuestResult, acceptQuest, generateQuests, doTransaction (buy/sell), equipItem/equipPet/unequipPet/equipSpell/unequipSpell/useSpell, deleteCharacter, createCharacter, useItem, startTravel, teleportCharacter, and the auth/push ones. Every state-changing player path named by D-11/D-12/D-13/D-31 is guarded: equipItem (null itemId = unequip), equipPet, unequipPet, equipSpell, unequipSpell, useSpell, useItem (in session, after AWAITING_AID), doTransaction (in session, after prison), acceptQuest (all lanes, after classifyEligibility), questTravelPreview, startTravel and travelPreview (after planFree). teleportCharacter and deleteCharacter are not guarded (D-23 respected). abandonQuest cannot reach a started mission (abandonClaimFilter requires startDate null).
- Predicate: a single `missionInProgressOf` pure function, shared by reader and resolver. The standard lane locks on startDate != null, GM lanes only on the draft marker. A wounded character awaiting aid has the lane set to null by the outcome plan (outcome-plan.ts:502-516, unrewarded-plan.ts:80), so it is not locked. Archived characters read as free and then fall into NOT_FOUND. Populated lanes (findAll/findOne use CHARACTER_QUESTS_POPULATE) resolve with no extra reads, so `characters` has no N+1.
- Events: a normal mission start fires via PendingQuestStartPublisher (startDate updates) or via the character claim write (solo accept). The end fires via the lane `$set null` on the character. The draft marker fires via MissionDraftLockPublisher with `$set` to null (not `$unset`). Duplicates are collapsed by KeyedSingleFlight.
- Security: the marker is not a @Field on PendingQuest; it is exposed only on PendingRequest, which is reachable only through @Roles(innkeeper) handlers. `guidedMissionInProgress` is on the player CharacterStatus as D-16 asks. Logs carry only ids and error codes.
- D-20 companion: `companionOf` is fail-closed (no pet, no owned entry or no catalogue entry gives null), draws nothing, and the pet catalogue is read in the same query as the xp caps (no extra read).

## MEDIUM

### A-01 (MEDIUM) The stream publisher does not recover from a lost history, so the flags can stay stale
File: src/characters/mission-lock/mission-draft-lock.publisher.ts:30-90 (compare src/quests/pending-requests/mission-draft-queue.refresher.ts:548-551).
What: MissionDraftLockPublisher does not override `onHistoryLost()` (the base class default is a no-op with a WARN). The sibling MissionDraftQueueRefresher does recover. When the resume token falls out of the oplog (code 286), the start/discard marks that happened in the gap are never republished.
Why it matters: an innkeeper discards or completes a draft while the BE stream is down for longer than the oplog window. The player's `characterUpdated` never carries `missionInProgress=false`/`guidedMissionInProgress=false`. The FE keeps showing «Missione in corso» until some unrelated character write. The guards themselves read the DB, so this is a display-only stale state, but D-23 promises the emission.
Fix: override `onHistoryLost()` to republish every active character that holds a GM lane. Reuse the `republishHolders` query with `$or: GM_LANES.map(lane => ({ [lanePathOf(lane)]: { $ne: null } }))` and call `requestPublish` for each. Add a unit test for it in mission-draft-lock.publisher.spec.ts, which today has no history-lost case.

## LOW

### A-02 (LOW) The lock check comes before the existing codes in the equip family, useSpell and the shop
Files: src/characters/characters.service.ts:178, 206, 228, 239, 274, 326; src/economy/trade/shop-transaction.service.ts:211-213.
What: REPO-RULES (section «Completato dopo la ricerca») and D-23 say MISSION_IN_PROGRESS goes AFTER the existing codes. In equipItem/equipPet/unequipPet/equipSpell/unequipSpell/useSpell, `assertFree` runs before id parsing, catalogue lookup and the write, so the existing codes (ITEM_NOT_OWNED, PET_NOT_OWNED, SPELL_NOT_KNOWN, NOT_FOUND spell, MAX_ACTIVE_SPELLS, SPELL_NOT_ACTIVE) are masked. In shopOrReject the lock comes before the city and travel/awaiting-aid checks.
Failing scenario: a locked character sends equipPet with a pet it does not own and gets MISSION_IN_PROGRESS instead of PET_NOT_OWNED. A character with a guided draft that is also travelling (a draft can be opened on one) gets MISSION_IN_PROGRESS on a shop call instead of the travel code.
Fix: move the lock into the failure classification. In the equip/spell methods call `assertFree` after the input validation and catalogue checks, and before the write. In the shop, move the call after the city/travel checks and before the pool/ownership/funds checks. Alternatively state in the SUMMARY that equip-style methods deliberately check first.

### A-03 (LOW) The two change-stream publishers duplicate each other
Files: src/characters/mission-lock/mission-draft-lock.publisher.ts:30-90, src/characters/pending-quest-start.publisher.ts.
What: `onChange`, `republishHolders` and the try/catch/log are identical. Only the pipeline, the lane filter and the log text differ.
Fix: extract an abstract `PendingQuestHoldersPublisher` that takes `{ spec, lanes, message }`.

### A-04 (LOW) `lockLanesOf` fails open on a parent without `quests`, and duplicates the lane list
File: src/characters/mission-lock/mission-lock.ts:36-41, 69-72.
What: `if (!quests) return null` makes a parent with no `quests` read as free (`false`) instead of 'unresolved', which would send the lookup to the reader. It is unreachable today (findAll and findOne load `quests`), but a future query with a projection would silently show «not in mission». `LANE_NAMES` also repeats QUEST_LANES/`lanePathOf`.
Fix: return 'unresolved' when `quests` is undefined and `character` is not null; derive the names from `QUEST_LANES`, which are already the field names (QuestLane values).

### A-05 (LOW) Test gaps against rules written down in D-23
Files: src/characters/mission-in-progress.int-spec.ts, src/characters/mission-lock/*.spec.ts.
- No test that a wounded character awaiting aid is NOT locked at the predicate/wire level. `awaitingAid` appears only in the use-item, shop and acceptance specs, and not as a lock-free case in the mission-lock specs or the wire spec.
- No test that `deleteCharacter` stays allowed while locked. Only teleport has one (teleport.resolver.int-spec.ts).
- No test of the END of a normal mission on `characterUpdated` (lane back to null gives false/false). Only starts and the draft end are covered.
- The «solo quest starts» wire test (mission-in-progress.int-spec.ts:~175) writes the character itself, so it exercises the character stream and not the new publishers or PendingQuestStartPublisher.
Fix: add those cases (lane null plus `status.awaitingAid` gives FREE; deleteCharacter on a character with a started lane succeeds; `$set quests.pendingQuest null` emits FREE).

---

# BE Phase 22 - review area B (guided mission flow)

Summary: 0 CRITICAL, 0 HIGH, 3 MEDIUM, 4 LOW (7 findings). Read-only review; nothing was run.

Verified clean (no finding):
- Dry run (D-04): `MissionSimulationService.simulate` writes only through `MissionDraftService.write` (`$set` of `fights` + `updatedAt`, no upsert). The loader reads are plain finds. Every refusal path (range, caps, unknown enemy, enemy dropped by `readEnemies`) throws before that write. The resolver gets the dedicated `MissionSimulationChance` token, and the module binds it via `useClass: MathChanceSource`. `GmCompletionService` is the only holder of the shared `ChanceSource`, and `GuidedCompletionService` never draws.
- SDL: `src/schema.gql` is equal to §Q9 plus the D-17 additions. The extra fields are `CharacterStatus.guidedMissionInProgress`, and `MissionFightOutcome.consumablesAvailable`, `injuriesBefore` and `spellsAvailable`. There are no differences of name, type or nullability, and nothing is removed.
- Authorization: all 8 handlers have `@Roles(innkeeper)`. The 5 mutations have `@AuditTarget('PendingQuest', ...)` on `pendingQuestId`. `EXPECTED_INNKEEPER_HANDLERS` has all 8 entries, the fixtures are complete, and the count 10 -> 18 is correct.
- Marker writes use `$set` (never `$unset`). The unique multikey index on `participants.pendingQuest` covers concurrent starts, and `start` catches the duplicate-key error. Late registration is blocked by D-23, so the draft lookup by a single PendingQuest is not an issue.
- Completion: one `connection.transaction`. `outcomesOf` is pure and re-runnable after a WriteConflict. Two concurrent completions are resolved by `StaleResolution` -> `lostCompletionError` (NOT_FOUND). The draft delete is in `afterSeats`, and the PendingQuests (the lock) are deleted in the same transaction. The verdict is always `gmCompleted` with `aid: null`. The merged enemies feed `enemyFactsOf`/`victoryKnowledgeOf`. Zero fights give `battle: null`. An unsimulated draft is refused by `assertFightsComplete`. `completePendingRequest` still deletes the draft via `deleteMany`.
- XP is clamped by `MAX_XP` in `progressionAfter`. Coins and xp are `Int` + `@Min(0)` on the wire and `isSafeInteger` in `amountOf`. See B-03 for the coin overflow case.

## MEDIUM

### B-01 - `completeGuidedMission` pays out a draft read OUTSIDE the transaction; a save or simulation in flight is lost silently and the draft is then deleted
File: `src/quests/guided/guided-completion.service.ts:131-171` (draft read at `:134`, closure over `draft` at `:160-166`, delete at `:167-171`).

What is wrong:
- `complete()` reads `draft` with `requireFor` before the transaction.
- `outcomesOf` and `afterSeats` both close over that stale object.
- `afterSeats` does `deleteOne({ _id })` and ignores `deletedCount` and `updatedAt`.
- A WriteConflict retry of the transaction callback re-reads the snapshots but not the draft.

Failing scenario:
1. The FE autosaves `saveMissionDraft(prizes)`, or the oste re-simulates, on device B.
2. The oste taps "complete" on device A (or the same device) while that write is in flight.
3. The completion reads the old draft, commits the old prizes and fights, and deletes the draft.
4. The newer write either lands first and is lost with the delete, or lands after and gets NOT_FOUND from `write`.
5. The recap the oste last saw is not what was paid. Coins, items and spells are real game economy and are irreversible.

D-18 accepts last-write-wins between edits. It does not accept a completion that consumes an out-of-date draft and then destroys it.

Fix: add a revision to the draft and make completion conditional on it.
- Add `rev: number` (default 0) to `MissionDraft`.
- `MissionDraftService.write` does `$inc: { rev: 1 }` in the same update as the `$set`.
- In `afterSeats`, run `deleteOne({ _id: draft._id, rev: draft.rev }, { session })`.
- If `deletedCount === 0` and the draft still exists, throw a typed error. Either map it to a retry that re-reads, or abort with the existing `OUTCOME_OVERRIDE_INVALID` / NOT_FOUND. This aborts the transaction, so nothing is written on the stale payload.
- The same `rev` filter can be used by `save` and `simulate` for an optimistic write, which removes the lost update between them too.

### B-02 - Corrections of D-14 are tested at save time only; the completion check on corrected effects has no test
File: `src/quests/guided/guided-completion.service.int-spec.ts:586` (only the "simulated injury already owned passes" case) and `src/quests/guided/guided-outcome.spec.ts`.

What is wrong:
- The rule that pre-existing injuries are untouchable only on corrected effects is enforced at completion in `guided-completion.service.ts:assertSequenceAllowed` (`:84-87`, `assertAddsOnlyNewInjuries` on `corrected` fights).
- Nothing exercises the refusal branch, nor the `corrected` flag coming from `effectiveSequenceOf`.
- If someone drops `if (corrected)` or inverts it, the suite stays green.
- The same applies to the other completion-time revalidations of a stored correction: consumables and spell usages above what is available at that fight's start, and hp out of range after a character change.

Why it matters: save-time validation can be bypassed by a draft that was valid at save and invalid at completion. Examples are character state changed, or a corrected sequence where fight k-1 changes the start state of fight k.

Fix: add int-specs that persist a draft directly with these cases and expect `OUTCOME_OVERRIDE_INVALID` with no writes:
- a corrected effect that adds an already-owned injury;
- a corrected consumable usage over what the previous fight leaves;
- a corrected spell usage over what the previous fight leaves;
- a corrected `hpAfter` above max.

Also add a concurrent double `completeGuidedMission` test (`Promise.allSettled`, one success + one NOT_FOUND, one QuestResult per seat), because D-08/D-25 idempotence has no test.

### B-03 - Free coins (D-15) can push the wallet past the GraphQL `Int` range and break the character query
File: `src/quests/guided/mission-draft.inputs.ts:140-145` (`CoinsInput` is `Int` 0..2^31-1 per denomination, no cap), `src/quests/guided/chosen-rewards.ts:52-53`, `src/economy/coins.ts:fromCopper`.

What is wrong:
- A prize of `gold: 2000000000` is valid (copper 2e13 is a safe integer).
- The wallet is re-split with `fromCopper`, so `Coins.gold` becomes `existing + 2e9`.
- If that exceeds 2147483647 (a character that already has gold, or two such prizes over two missions), `CharacterStatus.coins.gold: Int!` and `QuestResult.coinsGained` can no longer be serialized.
- Apollo then raises "Int cannot represent non 32-bit signed integer value". `me` and the character queries fail for that user permanently, with no in-app way to repair it.
- XP does not have this issue because of `MAX_XP`.

D-15 says "free, no ceiling tied to the block". It does not forbid a purely technical ceiling, as D-31 already does for the other caps.

Fix: add a technical ceiling to the prize input (and to `amountOf` in `mission-draft-save.service.ts`), such as `@Max(1_000_000)` on each denomination of the prize coins. Use a dedicated `MissionPrizeCoinsInput`, so the shared `CoinsInput` (used by shops and other flows) is untouched. Alternatively clamp in `chosenRewardsOf`. Add a save test for the cap.

## LOW

### B-04 - `enemiesWithinCaps` lives in the simulation service and is imported by the save service
Files: `src/quests/guided/mission-simulation.service.ts:33-42`, `src/quests/guided/mission-draft-save.service.ts:70`.

What is wrong: a pure validation helper that is a property of the input caps (`MAX_FIGHT_ENEMIES`, `MAX_ENEMY_QUANTITY`) is exported from a service. The save service therefore depends on the whole simulation service file (and its engine imports) for a predicate.

Fix: move `enemiesWithinCaps` next to the caps in `mission-draft.inputs.ts` or into a small `mission-caps.ts`. Keep `assertSimulable` and `assertFightsWithinCaps` calling it.

### B-05 - Small duplication of helpers across the guided files
Files: `src/quests/guided/guided-completion.service.ts:55-63`, `src/quests/guided/fight-state.ts:104-105`, `src/quests/guided/mission-prizes.ts:90`, `src/quests/guided/mission-draft-save.service.ts:70` and `:101`, `src/quests/guided/mission-draft.service.ts:50`, `src/quests/guided/mission-draft.mapper.ts:34`.

What is wrong:
- `hexOf` is redefined in at least six files.
- `presentIds` is defined twice with different signatures (`guided-completion.service.ts` and `fight-state.ts`).
- `invalid = () => GameRuleException.outcomeOverrideInvalid()` exists only in the save service while the other files call the factory directly.
- This is the Boy Scout case from CLAUDE.md.

Fix: one `src/quests/guided/ids.ts` (`hexOf`, `presentIds`, `uniqueIds`), and use the factory uniformly.

### B-06 - `MissionSimulationService.simulate` is about 60 lines and mixes five steps
File: `src/quests/guided/mission-simulation.service.ts:90-153`.

What is wrong: it does request/draft load, overlay building, catalog read, context build and combat, and the fight record assembly, all in one method.

Fix: extract `overlaidParticipants(request, draft, k)` and `fightRecordOf(resolution, entries, overlaid)`. These two are pure, so the extraction is safe.

### B-07 - Dead or unnecessarily exported symbols
Files: `src/quests/guided/draft-invalidation.ts:35` (`sameEnemies`), `:45` (`unsimulated`), `src/quests/guided/mission-draft.model.ts:299-300` (`MISSION_DRAFT_CHARACTER_INDEX`, `MISSION_DRAFT_PENDING_QUEST_INDEX`).

What is wrong:
- `sameEnemies` and `unsimulated` are exported but used only inside `draft-invalidation.ts` (plus specs).
- The two index-name constants are used only inside the model (plus specs).

Fix: drop `export` from the first two, and keep the constants only if a spec needs them. This is cosmetic.
