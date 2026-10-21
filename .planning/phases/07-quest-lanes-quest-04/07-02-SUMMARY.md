---
phase: 07-quest-lanes-quest-04
plan: 02
subsystem: quests
tags: [quests, game-rules, mongo-filters, pure-functions, tdd]

# Dependency graph
requires:
  - phase: 07-01
    provides: quest lanes on CharacterQuests, QuestPartySlot, internal Quest.registrations
  - phase: 04
    provides: GameRuleException / GameRuleErrorCode, activeCharacterById, idForms / sameId, active-spell.updates style
provides:
  - GameRuleErrorCode QUEST_FULL, QUEST_ALREADY_TAKEN, QUEST_TITLE_MISMATCH, QUEST_NOT_IN_CITY, QUEST_NOT_ACCEPTABLE with Italian factories
  - quest-lanes.ts (QuestLane, QUEST_LANES, laneOf, lanePathOf)
  - quest-eligibility.ts (TITLE_RANK, MAX_QUEST_POINTS, meetsTitle, isRepeatable, isShared, pointsCostOf, waitingTimeOf, capacityRuleOf, hasCapacity, classifyEligibility)
  - quest-acceptance.updates.ts (laneClaimFilter, laneClaimUpdate, takenCountExpr, registrationFilter, registrationUpdate, classifyUnclaimed, classifyUnregistered)
affects: [07-06, 07-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lane enum whose values are the CharacterQuests field names: the lane path is derived, never passed by the client"
    - "Capacity rule as a discriminated union (perRank / total / unlimited) shared by the in-memory check and the $expr guard"

key-files:
  created:
    - src/quests/acceptance/quest-lanes.ts
    - src/quests/acceptance/quest-lanes.spec.ts
    - src/quests/acceptance/quest-eligibility.ts
    - src/quests/acceptance/quest-eligibility.spec.ts
    - src/quests/acceptance/quest-acceptance.updates.ts
    - src/quests/acceptance/quest-acceptance.updates.spec.ts
  modified:
    - src/gameRules/game-rule-error-code.enum.ts
    - src/gameRules/game-rule.exception.ts
    - src/gameRules/game-rule.exception.spec.ts

key-decisions:
  - "Pre-check order ALREADY_TAKEN -> TITLE_MISMATCH -> SLOT_BUSY -> FULL; after a failed claim SLOT_BUSY comes first (concurrent claim of the same character); city is checked by the service"
  - "MAX_QUEST_POINTS = 2147483647 (pointsSpent is a 32-bit GraphQL Int): a cost above the cap is 'invalid' (fail-closed, QUEST_NOT_ACCEPTABLE)"
  - "Catalog-level rejection code QUEST_NOT_ACCEPTABLE ('Missione non disponibile')"

patterns-established:
  - "Pure acceptance rules in src/quests/acceptance: the service only reads, runs the transaction and picks the code"

requirements-completed: []  # BE-QUEST-02/03/04 rules only; traceability is marked by plan 07-08

# Metrics
duration: 6min
completed: 2026-10-21
---

# Phase 7 Plan 02: Pure quest acceptance rules Summary

**Five new quest rejection codes, lane-from-type, title/repeatability/shared/cost/waiting/capacity rules with a fixed classification order, and the Mongo claim and registration builders with reasserted guards and a `$expr` capacity guard, all as pure table-tested functions**

## Performance

- **Duration:** about 6 min
- **Started:** 2026-10-21T11:24:37Z
- **Completed:** 2026-10-21T11:30:21Z
- **Tasks:** 3 (each RED + GREEN)
- **Files modified:** 9

## Accomplishments

- `GameRuleErrorCode` + factories: `questFull` ('Non ci sono più posti per il tuo rango'), `questAlreadyTaken` ('Hai già affrontato questa missione'), `questTitleMismatch` ('Il tuo titolo non permette questa missione'), `questNotInCity` ('Devi trovarti nella città della missione'), `questNotAcceptable` ('Missione non disponibile'); `QUEST_SLOT_BUSY` unchanged
- `laneOf`: story → `activeStoryQuest`, worldMission → `activeWorldMissionQuest`, everything else (boss included) → `pendingQuest`; the spec table must cover every `QuestType`
- `meetsTitle` exact for story, `>=` otherwise, missing `minTitle` = no constraint, unknown title fail-closed; `pointsCostOf` rejects null/0/negative/fractional/unsafe/over-cap/NaN for story and worldMission; `waitingTimeOf` 0 outside the standard lane; exact per-rank slots (absent rank = 0 seats)
- `classifyEligibility` in the fixed order repeatability → title → lane → capacity (capacity only for shared types: worldMission, boss)
- `laneClaimFilter` (active character, free lane, `status.title`, `status.location $in idForms`, `completedQuests $nin idForms` unless repeatable), `registrationFilter` (`$ne` on both registration forms + `$expr $lt` on `takenCountExpr`), `registrationUpdate` (`$push` + `$addToSet`), `classifyUnclaimed` / `classifyUnregistered`

## Task Commits

| Task | Phase | Commit | Subject |
|------|-------|--------|---------|
| 1 | RED | `f1cf60b` | test(gameRules): specify the quest acceptance rejection codes |
| 1 | GREEN | `3a49fbb` | feat(gameRules): add the quest acceptance rejection codes |
| 2 | RED | `02110ad` | test(quests): specify quest lanes and eligibility rules |
| 2 | GREEN | `b3775c7` | feat(quests): add pure quest lane and eligibility rules |
| 3 | RED | `c317a76` | test(quests): specify the lane claim and registration filters |
| 3 | GREEN | `d39bdf6` | feat(quests): add lane claim and registration write builders |

## RED evidence

- **Task 1:** 6 failed / 15 passed — `TypeError: GameRuleException.questFull is not a function` (and the four sibling factories) plus 'covers every GameRuleErrorCode exactly once'. ts-jest does not type-check here, so the failure is a runtime TypeError rather than a compile error.
- **Task 2:** both suites failed to run — `Cannot find module './quest-lanes'`, `Cannot find module './quest-eligibility'`.
- **Task 3:** suite failed to run — `Cannot find module './quest-acceptance.updates'`.

## GREEN verification

- `npx jest src/gameRules --selectProjects unit`: 21/21
- `npx jest src/quests/acceptance/quest-lanes.spec.ts src/quests/acceptance/quest-eligibility.spec.ts --selectProjects unit`: 102/102
- `npx jest src/quests/acceptance src/gameRules --selectProjects unit`: 4 suites, 141 tests green
- `npm run build`: exit 0; `npx eslint` on all 9 files: clean; Prettier applied per file
- The new specs were also type-checked with `tsc` on a scratch tsconfig listing only the 4 spec files (exit 0), because ts-jest does not type-check
- All acceptance greps pass (5/5/1/1, 10 exports, 7 exports, `activeCharacterById(`, `idForms(`, `'$$registration.title'`, `$addToSet`); no `async`/`await`/`InjectModel`/`.exec(` in the pure modules; `src/schema.gql` untouched (`grep -c registrations` = 0)

## Decisions Made

- Followed the plan's discretion choices (codes, order, cap). `classifyUnclaimed` carries the requested ordering comment (SLOT_BUSY before ALREADY_TAKEN after a failed claim).

## Deviations from Plan

None - plan executed exactly as written. Notes:
- The acceptance greps for `'$$registration.title'` and `$addToSet` return nothing with BSD grep in basic regex mode (`$` is read as an anchor); verified with `grep -F`, both found on 1 line.
- GREEN commits contain only the implementation files (specs were committed in the RED commits and not changed by GREEN).

## Issues Encountered

None.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 07-06 / 07-07 (acceptance service and `acceptQuest`) can compose `classifyEligibility`, `pointsCostOf`, `waitingTimeOf`, `laneClaimFilter` / `laneClaimUpdate`, `registrationFilter` / `registrationUpdate` and the two `classifyUn…` re-read classifiers; the city check (`QUEST_NOT_IN_CITY` pre-transaction) is the service's read.

## Self-Check: PASSED

- FOUND: the 6 created files under src/quests/acceptance
- FOUND commits: f1cf60b, 3a49fbb, 02110ad, b3775c7, c317a76, d39bdf6 (no `Co-Authored-By` trailer in any of them)

---
*Phase: 07-quest-lanes-quest-04*
*Completed: 2026-10-21*
