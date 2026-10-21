---
phase: 07-quest-lanes-quest-04
plan: 03
subsystem: characters
tags: [characters, quests, mongoose-populate, graphql-wire, subscriptions, tdd, boy-scout]

# Dependency graph
requires:
  - phase: 07-01
    provides: lanes activeStoryQuest/activeWorldMissionQuest on CharacterQuests, PendingQuest.pointsSpent
  - phase: 07-02
    provides: QUEST_LANES and lanePathOf in src/quests/acceptance/quest-lanes.ts
provides:
  - CHARACTER_QUESTS_POPULATE (three lanes as PendingQuest with quest reduced to _id, completedQuests reduced to _id)
  - findOne (character(id), characterUpdated snapshot and change stream) and findAll (innkeeper characters) apply it
  - PendingQuest and Quest registered in CharactersModule and in createCharactersTestApp (C6)
  - shared primeCharactersChangeStream helper in test/characters/characters-change-stream.ts
affects: [07-06, 07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One populate constant for every character read path: lanes derived from QUEST_LANES, never listed by hand"
    - "Nested populate with select '_id' instead of @ResolveField: the FE resolves the quest from the board"

key-files:
  created:
    - src/characters/character-quests.populate.ts
    - src/characters/character-quest-lanes.int-spec.ts
    - test/characters/characters-change-stream.ts
  modified:
    - src/characters/characters.service.ts
    - src/characters/characters.service.spec.ts
    - src/characters/characters.module.ts
    - test/authz/characters-test-app.ts
    - src/characters/character-updated.subscription.int-spec.ts
    - src/characters/archived-character.realtime.int-spec.ts

key-decisions:
  - "D-13 discretion: nested populate with select '_id' (one constant covers character, characters, snapshot and change stream), not a @ResolveField"
  - "Dangling refs: a dangling lane resolves to null and a dangling completedQuests entry is dropped by the populate, no errors on the wire"

patterns-established:
  - "Character read paths share CHARACTER_QUESTS_POPULATE; a new lane in QUEST_LANES is populated automatically"

requirements-completed: []  # BE-QUEST-01 traceability is marked by plan 07-08

# Metrics
duration: 7min
completed: 2026-10-21
---

# Phase 7 Plan 03: Quest lanes populate Summary

**`CHARACTER_QUESTS_POPULATE` populates the three lanes as `PendingQuest` (with `quest` reduced to `_id`) and `completedQuests` reduced to `_id` on `findOne` and `findAll`, so `character(id)`, `characters` and `characterUpdated` (snapshot and change events) resolve `quest { id }` on the wire. The change-stream priming helper is now shared.**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-10-21T11:33:30Z
- **Completed:** 2026-10-21T11:40:00Z
- **Tasks:** 2 (Task 1 refactor; Task 2 RED + GREEN)
- **Files modified:** 9

## Accomplishments

- Boy Scout: the two identical copies of `primeCharactersChangeStream` were replaced by one exported helper in `test/characters/characters-change-stream.ts`. The constants `PRIMING_ATTEMPTS = 25` / `PRIMING_WAIT_MS = 200` and the Pitfall 9 comment moved with it. The imports left unused in `character-updated.subscription.int-spec.ts` (`PubSub`, `PUB_SUB`/`PubSubEvents`, `withTimeout`) were removed.
- `src/characters/character-quests.populate.ts`: `QUEST_LANES.map(lanePathOf)` with `model: PendingQuest.name` and a nested `populate: { path: 'quest', model: 'Quest', select: '_id' }`, plus `{ path: 'quests.completedQuests', model: 'Quest', select: '_id' }`.
- `CharactersService.findAll()` and `findOne()` apply `.populate(CHARACTER_QUESTS_POPULATE)`. The `characterUpdated` snapshot and the change stream already go through `findOne`, so they needed no change.
- `CharactersModule` and `createCharactersTestApp` register `PendingQuest` and `Quest` (C6).
- Wire int-spec with 5 cases covering:
  - full lanes for the owner
  - a dangling lane becoming `null` and a dangling completed quest being dropped
  - a legacy `PendingQuest` without `pointsSpent` reading as 0
  - the innkeeper `characters` list
  - the `characterUpdated` snapshot and the change event after a `$set` on `quests.activeStoryQuest`

## Task Commits

| Task | Phase | Commit | Subject |
|------|-------|--------|---------|
| 1 | REFACTOR | `4a01b0a` | refactor(test): share the characters change stream priming helper |
| 2 | RED | `73909bd` | test(characters): prove the quest lanes on character reads and events |
| 2 | GREEN | `e998451` | feat(characters): populate the quest lanes with the quest id only |

## TDD Evidence

- **Task 1 (refactor):** the two realtime suites passed before (2 suites, 14 tests) and after (2 suites, 14 tests), with the same counts.
- **Task 2 RED, unit:** `Cannot find module './character-quests.populate'`, so the suite failed to run.
- **Task 2 RED, integration, as committed:** all 5 tests failed with `MissingSchemaError: Schema hasn't been registered for model "Quest"`. The harness did not register the model yet, which is C6.
- **Task 2 RED, integration probe:** to capture the wire failure the plan expects, I registered the two models in the harness temporarily, without committing, and then restored it. All 5 tests failed with `ID cannot represent value: { type: "Buffer", data: [Array] }` on these paths:
  - `character.quests.pendingQuest.id`
  - `character.quests.completedQuests.0.id`
  - `characters.0.quests.completedQuests.0.id`
  - `characterUpdated.quests.pendingQuest.id`
- **Task 2 GREEN:**
  - unit `characters.service.spec.ts`: 22/22 passed
  - integration `character-quest-lanes`, `characters-ownership`, `character-updated.subscription`, `archived-character.realtime`: 66/66 passed
  - `npm run build` succeeded
  - `git diff --exit-code src/schema.gql` exited 0
- **Extra C6 safety net:** I also ran the other 9 int-specs that use the characters harness or service (do-transaction, push.resolver, admin-audit, archived-character-visibility, spell-recovery.processor, character-deletion.resolver, use-spell, equip-item, equip-spell). All 112 tests passed and none threw `MissingSchemaError`.

## Deviations from Plan

None that change behaviour. Notes:

- **RED failure reason:** the committed RED fails with `MissingSchemaError` rather than the wire `ID cannot represent value` error, because the spec reads the models through `harness.connection.model(...)`, as the plan prescribes, and the harness only registers them in GREEN. I captured the wire-level failure with an uncommitted probe, described under TDD Evidence.
- **Unit spec shape:** the new unit `it` asserts both that `findOne` is called with `.populate(CHARACTER_QUESTS_POPULATE)` and the exact `toEqual` of the constant. I put the shared nested object in a local `questIdOnly` variable instead of writing it out three times.

## Issues Encountered

- `npx eslint src/characters/characters.service.ts` reports 11 warnings (0 errors). They are all in the `onModuleInit`/`onModuleDestroy` change-stream block (lines 81–111), which this plan did not touch, so they predate it. They are out of scope and I did not fix them.

## Threat Surface

- T-07-10 is mitigated: the quest inside the lanes and the `completedQuests` entries carry only `_id`. The unit `toEqual` on the constant asserts this.
- T-07-12 is mitigated: int-spec case 2 covers dangling refs.
- T-07-11 was accepted and needs no action: I did not touch the resolver, and `character-updated.subscription.int-spec.ts` passes.
- No new surface.

## Next Phase Readiness

- 07-07 can reuse `primeCharactersChangeStream` and rely on `characterUpdated` carrying the populated lane after `acceptQuest`.
- `src/schema.gql` is unchanged.

## Self-Check: PASSED

- FOUND: src/characters/character-quests.populate.ts
- FOUND: src/characters/character-quest-lanes.int-spec.ts
- FOUND: test/characters/characters-change-stream.ts
- FOUND: 4a01b0a, 73909bd, e998451
