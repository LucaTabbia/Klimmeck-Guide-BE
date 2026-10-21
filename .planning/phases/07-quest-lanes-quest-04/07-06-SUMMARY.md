---
phase: 07-quest-lanes-quest-04
plan: 06
subsystem: quests
tags: [quests, acceptance, lanes, transaction, replica-set, concurrency, channel-points, tdd]

# Dependency graph
requires:
  - phase: 07-01
    provides: lanes on CharacterQuests, PendingQuest.pointsSpent, QuestPartySlot, internal Quest.registrations
  - phase: 07-02
    provides: quest-lanes.ts, quest-eligibility.ts, quest-acceptance.updates.ts (claim/registration filters, classifyUnclaimed/classifyUnregistered), five GameRuleErrorCode values
provides:
  - "QuestAcceptanceService.accept({ ownerId, characterId, questId }): Promise<Types.ObjectId>, lane-aware, debiting the owner's twitchPoints in the same transaction (D-08, D-18)"
  - "AcceptQuestCommand interface (exported) for the 07-07 resolver"
  - "QuestAcceptanceModule registers City in forFeature (quest city check, D-10)"
  - "D-19 matrix on the replica set: 34 cases incl. 3 concurrency scenarios"
affects: [07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "lean pre-reads → pure rules → one transaction with guards restated in the filters: claim → registration ($expr) → PendingQuest insert → debitUserPoints(session)"
    - "catalog cost validated before the transaction (QUEST_NOT_ACCEPTABLE + WARN with quest id and lane only)"
    - "single cities.exists query: city holding the quest marker, character on its marker or on one of its POIs"

key-files:
  created: []
  modified:
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.module.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts

key-decisions:
  - "Rejection order fixed as planned: NOT_FOUND quest → QUEST_NOT_ACCEPTABLE → NOT_FOUND character → ALREADY_TAKEN → TITLE_MISMATCH → SLOT_BUSY → FULL → NOT_IN_CITY → in-transaction SLOT_BUSY/NOT_FOUND (claim), ALREADY_TAKEN/FULL (registration), INSUFFICIENT_POINTS (debit)"
  - "No boot-time catalog verifier (YAGNI): the WARN at acceptance is enough"

patterns-established:
  - "refIdOf(value: unknown) reads Mixed refs stored as ObjectId or legacy hex string"

requirements-completed: []  # BE-QUEST-02/03/04 traceability is marked by plan 07-08

# Metrics
duration: 5min
completed: 2026-10-21
---

# Phase 7 Plan 06: Lane-aware quest acceptance Summary

**`QuestAcceptanceService.accept({ ownerId, characterId, questId })` derives the lane from the catalog type, validates the points cost before the transaction, checks eligibility and the quest city on lean pre-reads, then in one replica-set transaction claims the lane, registers shared quests by rank with `$expr`, inserts the `PendingQuest` (`pointsSpent`) and debits the owner's `twitchPoints` through `WalletService.debitUserPoints(ownerId, cost, session)`. `Character.coins` is never touched; every rejection leaves zero writes.**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-10-21T11:51:17Z
- **Completed:** 2026-10-21T11:56:00Z
- **Tasks:** 2 (each RED + GREEN)
- **Files modified:** 3

## Accomplishments

- `accept(command: AcceptQuestCommand)` with private `readQuest`, `costOrReject` (WARN `Missione <id> non accettabile: requiredPoints non valido per la corsia <lane>`, no owner id, no catalog value), `readCharacter` (`activeCharacterById`), `locationInQuestCity` (one `cities.exists` query, fail-closed), `claimLane` (`laneClaimFilter`/`laneClaimUpdate`, re-read in session + `classifyUnclaimed`), `register` (`capacityRuleOf` → `registrationFilter`/`registrationUpdate`, re-read + `classifyUnregistered`).
- Removed the Phase 4 `costCopper` parameter, `assertValidCost`, the local `waitingTimeOf`, `rejectUnclaimed`, `QuestTiming` and the `applyCharacterCoinsDelta` call (D-08, Pitfall 7).
- `QuestAcceptanceModule` registers `City`; its comment now points to 07-07 for the resolver.
- The int-spec is rewritten (Pitfall 7): isolated app on `quest-acceptance-test`, five collections pre-created with `init()` (Pitfall 5), a fresh city per test, distinct names and `twitchId`s. It covers story/worldMission/standard lanes, parallel story + standard, SLOT_BUSY, INSUFFICIENT_POINTS, QUEST_NOT_ACCEPTABLE × 5 with the exact WARN, NOT_FOUND × 4, 3 concurrent story accepts (1 win, 2 SLOT_BUSY, 1 debit), ALREADY_TAKEN (ObjectId and legacy hex), repeatable hunt, joined world mission, TITLE_MISMATCH × 2, POI of the city, other city, marker in no city, rank registration, 2 concurrent heroes on 1 slot (1 + QUEST_FULL, 1 debit), paladin on a hero-only party, legacy requiredAdventurers 2 × 3 concurrent, no registration on INSUFFICIENT_POINTS, boss in the standard lane for free, story never registers.

## Task Commits

| Task | Phase | Commit | Subject |
|------|-------|--------|---------|
| 1 | RED | `632caef` | test(quests): prove lane-aware quest acceptance on the replica set |
| 1 | GREEN | `febe067` | feat(quests): generalise quest acceptance to lanes and channel points |
| 2 | RED | `375e207` | test(quests): prove quest eligibility, city and party capacity |
| 2 | GREEN | `62c69ee` | feat(quests): enforce the quest city and the party capacity |

## TDD Evidence

- **Task 1 RED:** 17/17 failed. The `beforeAll` threw `Nest could not find CityModel element` (the module did not register `City` yet) and `accept` was a stub that throws `accept: not implemented`.
- **Task 1 GREEN:** integration 17/17, unit `src/quests/acceptance` 120/120, `npm run build` ok, eslint clean, `src/schema.gql` unchanged.
- **Task 2 RED:** 2 failed, 32 passed. `rejects from another city with QUEST_NOT_IN_CITY` and `rejects a quest whose marker belongs to no city` failed ("Received promise resolved instead of rejected"), because Task 1 had no city query. The other 15 new cases were already green: eligibility through the 07-02 pure rules (`classifyEligibility`), and the shared-quest/concurrency cases through the `register` that the plan asked Task 1 to write with `registrationFilter`/`classifyUnregistered`.
- **Task 2 GREEN:** integration 34/34 (run 3 times, stable), unit 120/120, build ok, eslint clean, schema unchanged.

## Deviations from Plan

1. **[Rule 3 - acceptance grep] Reworded a comment.** The Task 1 grep bans `RangeError` in the service file, and my first comment on `costOrReject` contained the word. I rewrote it as "l'importo non valido del wallet resta irraggiungibile (Pitfall 6)" before the GREEN commit. No code changed.
2. **Archived character fixture.** The plan describes the archived character through the fixture overrides. The `characterAt` helper has no override slot, so the spec sets `deletedAt`/`deletionReason` with `characters.collection.updateOne` after persisting. The document state and the assertion are the same.
3. **Task 1 `locationInQuestCity`.** The minimal version is a non-async method that returns `Promise.resolve(location)`, so `require-await` stays clean. Task 2 replaced it with the planned async query.

## Issues Encountered

None.

## Threat Surface

- T-07-20, T-07-21, T-07-22, T-07-23, T-07-24 and T-07-25 are mitigated and each has a test (see the matrix above). T-07-26 is transferred to 07-07 as planned.
- No new surface: there is no GraphQL change and `src/schema.gql` is unchanged.

## Next Phase Readiness

- 07-07 can call `acceptance.accept({ ownerId: new Types.ObjectId(identity.userId), characterId, questId })` from a resolver with no logic of its own. `test/app.int-spec.ts` was not touched.

## Self-Check: PASSED

- FOUND: src/quests/acceptance/quest-acceptance.service.ts, quest-acceptance.module.ts, quest-acceptance.service.int-spec.ts
- FOUND: 632caef, febe067, 375e207, 62c69ee
