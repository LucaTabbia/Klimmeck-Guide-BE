---
phase: 07-quest-lanes-quest-04
plan: 01
subsystem: database
tags: [mongoose, graphql, schema, quests, tdd]

# Dependency graph
requires:
  - phase: 04
    provides: PendingQuest / CharacterQuests models and the quest acceptance primitive (single pendingQuest slot)
provides:
  - CharacterQuests.activeStoryQuest / activeWorldMissionQuest (cast ObjectId refs to PendingQuest, default null) on DB and in the SDL
  - PendingQuest.pointsSpent (Int!, default 0 on DB, so legacy documents read 0)
  - QuestRequirements.party: [QuestPartySlot!]! with QuestPartySlot { count: Int!, title: String! } (count >= 1, title from TitleType, default [])
  - internal Quest.registrations [{ character, title }] with no GraphQL surface
  - exact SDL blocks asserted by the real-boot test, src/schema.gql regenerated with an additive diff only
affects: [07-02, 07-03, 07-05, 07-07, FE Phase 6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Internal-only Mongoose subdocument (QuestRegistration): @Schema without any @nestjs/graphql import, mounted on Quest without @Field"
    - "Schema-level unit spec with probe models (model(...) instantiated, never connected) for paths, casts, defaults and validateSync"

key-files:
  created:
    - src/models/quest/quest-party-slot.model.ts
    - src/models/quest/quest-registration.model.ts
    - src/models/quest-lanes.schema.spec.ts
  modified:
    - src/models/character/character-quests.model.ts
    - src/models/pending-quest.model.ts
    - src/models/quest/quest-requirements.model.ts
    - src/models/quest/quest.model.ts
    - test/fixtures/quest.fixture.ts
    - test/app.int-spec.ts
    - src/schema.gql

key-decisions:
  - "Party contract named party / QuestPartySlot { title: String!, count: Int! } (title as String! like minTitle); requiredAdventurers stays hand-written, ignored when the party is not empty"
  - "Quest.registrations is internal state only (no @Field, no GraphQL import); the real boot asserts the word never reaches src/schema.gql"
  - "Existing refs (pendingQuest, completedQuests, PendingQuest.quest) left as Types.ObjectId (Mixed): retyping is Phase 10"

patterns-established:
  - "New ObjectId refs use MongooseSchema.Types.ObjectId and are asserted with path(...).instance === 'ObjectId'"

requirements-completed: [BE-QUEST-01, BE-QUEST-03]  # data part only; traceability is marked by plan 07-08

# Metrics
duration: 4min
completed: 2026-10-21
---

# Phase 7 Plan 01: Quest lanes data contract Summary

**Two parallel quest lanes (activeStoryQuest / activeWorldMissionQuest) and PendingQuest.pointsSpent on DB and SDL, plus a per-rank quest party (QuestPartySlot) and an internal-only Quest.registrations, with an additive-only src/schema.gql**

## Performance

- **Duration:** about 4 min
- **Started:** 2026-10-21T11:17:53Z
- **Completed:** 2026-10-21T11:21:30Z
- **Tasks:** 2 (each RED + GREEN)
- **Files modified:** 10

## Accomplishments

- `CharacterQuests` gains `activeStoryQuest` and `activeWorldMissionQuest` (nullable `PendingQuest`, cast `ObjectId` refs, default `null`), and `CharacterQuestsInput` gains the two matching `ID` fields
- `PendingQuest.pointsSpent: Int!` with default `0` at DB level (a hydrated legacy document reads `0`), optional on `PendingQuestInput`
- New `QuestPartySlot` (ObjectType + Schema + Input) with `title` limited to `TitleType`, `count` required with `min: 1`; `QuestRequirements.party` defaults to `[]`
- New internal `QuestRegistration` subdocument (`character` cast ObjectId ref to Character, `title` from `TitleType`) mounted as `Quest.registrations` (default `[]`) without `@Field`
- `buildQuest` fixture has `requirements.party: []` and `registrations: []`
- Real-boot test asserts the exact `CharacterQuests`, `PendingQuest`, `QuestRequirements` and `QuestPartySlot` blocks and that `registrations` never appears in the schema

## Task Commits

| Task | Phase | Commit | Subject |
|------|-------|--------|---------|
| 1 | RED | `6184c50` | test(models): specify the story and world mission quest lanes |
| 1 | GREEN | `7ed0e9d` | feat(models): add the story and world mission quest lanes |
| 2 | RED | `83bc97b` | test(models): specify the quest party and its registrations |
| 2 | GREEN | `d7ff343` | feat(models): add the quest party slots and internal registrations |

## RED evidence

- **Task 1 unit:** 3 failed / 1 passed — `CharacterQuestsSchema.path('activeStoryQuest')` undefined (`Cannot read properties of undefined (reading 'instance')`), `activeStoryQuest` read as `undefined` instead of `null`, `PendingQuestSchema.path('pointsSpent')` undefined. The legacy `pendingQuest` `'Mixed'` test already passed (guard against retyping).
- **Task 1 integration:** 1 failed / 23 passed — only `writes the quest lanes into the generated schema` (SDL blocks without the new fields). `src/schema.gql` was not changed by the RED run.
- **Task 2 unit:** suite failed to run — `Cannot find module './quest/quest-party-slot.model'`.
- **Task 2 integration:** 1 failed / 24 passed — only `writes the quest party into the generated schema`.

## GREEN verification

- `npx jest src/models/quest-lanes.schema.spec.ts test/fixtures/fixtures.spec.ts --selectProjects unit`: 24/24
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 25/25
- Wider unit check `npx jest src/quests src/characters src/models test/fixtures --selectProjects unit`: 19 suites, 227 tests green
- `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'`: empty (additive only); `grep -c registrations src/schema.gql`: 0
- `npm run build`: exit 0; `npx eslint` on all touched files: clean; `npx prettier --check`: clean

## Files Created/Modified

- `src/models/quest/quest-party-slot.model.ts` - QuestPartySlot ObjectType/Schema/Input
- `src/models/quest/quest-registration.model.ts` - internal QuestRegistration schema (no GraphQL)
- `src/models/quest-lanes.schema.spec.ts` - unit spec of lanes, pointsSpent, party, registrations, fixture
- `src/models/character/character-quests.model.ts` - two lanes + input fields
- `src/models/pending-quest.model.ts` - pointsSpent + input field
- `src/models/quest/quest-requirements.model.ts` - party field + input
- `src/models/quest/quest.model.ts` - registrations (no @Field)
- `test/fixtures/quest.fixture.ts` - party / registrations defaults
- `test/app.int-spec.ts` - two exact-SDL real-boot tests
- `src/schema.gql` - regenerated, additive diff

## Decisions Made

- Followed the plan for naming (`party` / `QuestPartySlot`, `title: String!`) and for leaving `requiredAdventurers` hand-written.
- No `description` on the new GraphQL decorators; no forbidden literal reaches the SDL.

## Deviations from Plan

### Auto-fixed Issues

**1. [Boy Scout] Removed the unused `Types` import in `src/models/quest/quest.model.ts`**
- **Found during:** Task 2 (eslint reported `'Types' is defined but never used`, pre-existing)
- **Fix:** import reduced to `Document`
- **Commit:** `d7ff343`

**2. [Formatting] Prettier reformatted the touched baseline files**
- `character-quests.model.ts`, `pending-quest.model.ts`, `quest-requirements.model.ts`, `quest.model.ts` were not Prettier-clean at baseline; `--write` reformatted them (expected by the plan). The new `@Prop({ type: MongooseSchema.Types.ObjectId, ... })` decorators are split over several lines; the acceptance grep `grep -c "MongooseSchema.Types.ObjectId"` still prints 2 and `grep -B2 "pointsSpent: number;" | grep -c "default: 0"` still prints 1.

**3. [Commit content] GREEN commits contain only the files that changed**
- The plan lists the spec files in the GREEN commits ("5 files" / "8 files"); they were committed in the RED commits and not changed by GREEN, so the GREEN commits hold 3 and 6 files respectively.

## Issues Encountered

None.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The SDL of lanes, `pointsSpent` and party is fixed for Wave 1; FE Phase 6 can build on it.
- 07-03 (populate of the lanes), 07-05 (`serverTime`) and 07-07 (`acceptQuest`) can rely on these models; `registrations` is ready for the atomic per-rank capacity update.

## Self-Check: PASSED

- FOUND: src/models/quest/quest-party-slot.model.ts, src/models/quest/quest-registration.model.ts, src/models/quest-lanes.schema.spec.ts
- FOUND commits: 6184c50, 7ed0e9d, 83bc97b, d7ff343 (no `Co-Authored-By` trailer in any of them)

---
*Phase: 07-quest-lanes-quest-04*
*Completed: 2026-10-21*
