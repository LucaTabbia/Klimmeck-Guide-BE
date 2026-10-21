---
phase: 07-quest-lanes-quest-04
plan: 07
subsystem: quests
tags: [quests, acceptance, graphql, mutation, owner-only, authz, real-boot, schema, tdd]

# Dependency graph
requires:
  - phase: 07-03
    provides: CHARACTER_QUESTS_POPULATE on the three lanes, primeCharactersChangeStream helper
  - phase: 07-04
    provides: "@OwnsCharacter(selectId, { ownerOnly: true }) with ownerOnly in the OWNERSHIP_KEY rule"
  - phase: 07-05
    provides: "serverTime: DateTime! and its real-boot assertions"
  - phase: 07-06
    provides: "QuestAcceptanceService.accept({ ownerId, characterId, questId }), AcceptQuestCommand, City in QuestAcceptanceModule"
provides:
  - "input AcceptQuestRequest { id: String!, questId: String! }"
  - "acceptQuest(request: AcceptQuestRequest!): CommonResponse! (owner-only, 'Missione accettata')"
  - "QuestAcceptanceResolver registered in QuestAcceptanceModule (imports AuthzModule)"
  - "real boot: EXPECTED_OWNER_ONLY_HANDLERS whitelist, ownership whitelist + acceptQuest, positive SDL assertions with the C5 bans kept"
affects: [07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "logic-free resolver: ownership in the method guard, id validation with objectIdFromHex/requireCharacterObjectId, writes in the service"
    - "owner-only whitelist asserted through the existing metadata matcher on rule.ownerOnly"

key-files:
  created:
    - src/models/request/accept-quest-request.model.ts
    - src/quests/acceptance/quest-acceptance.resolver.ts
    - src/quests/acceptance/accept-quest.resolver.int-spec.ts
  modified:
    - src/quests/acceptance/quest-acceptance.module.ts
    - test/app.int-spec.ts
    - src/schema.gql

key-decisions:
  - "acceptQuest returns only CommonResponse; the lane arrives on characterUpdated and the balance on userUpdated (D-12)"
  - "New QuestAcceptanceResolver inside QuestAcceptanceModule (RESEARCH Q5); QuestsModule and CharactersResolver untouched"

patterns-established:
  - "EXPECTED_OWNER_ONLY_HANDLERS: every future owner-only handler must be enumerated in the real boot"

requirements-completed: []  # BE-QUEST-01..04 traceability is marked by plan 07-08

# Metrics
duration: 6min
completed: 2026-10-21
---

# Phase 7 Plan 07: acceptQuest GraphQL surface Summary

**Owner-only `acceptQuest(request: AcceptQuestRequest!): CommonResponse!` in a logic-free `QuestAcceptanceResolver`. It is proven on the wire with every rejection code, with FORBIDDEN and no audit for the innkeeper on a foreign character, and with the populated lane on `characterUpdated`. The real boot checks the ownership and owner-only whitelists and an additive `src/schema.gql`.**

## Performance

- **Duration:** about 6 min
- **Started:** 2026-10-21T11:57:00Z
- **Completed:** 2026-10-21T12:03:00Z
- **Tasks:** 2 (each RED + GREEN)
- **Files modified:** 6

## Accomplishments

- `AcceptQuestRequest { id, questId }` has no description. The input carries no lane, cost or time (T-07-29).
- `QuestAcceptanceResolver.acceptQuest` uses `@OwnsCharacter<{ request }>(({ request }) => request.id, { ownerOnly: true })`. It validates `questId` with `objectIdFromHex` (NOT_FOUND quest), the owner with `objectIdFromHex(identity.userId)` (NOT_FOUND user) and the character with `requireCharacterObjectId`. Then it calls `this.acceptance.accept({ ownerId, characterId, questId })` and answers `{ response: 'Missione accettata', successful: true }`.
- `QuestAcceptanceModule` imports `AuthzModule` and provides the resolver. `AppModule` is unchanged because the module was already mounted.
- Wire int-spec (16 cases) on `createCharactersTestApp({ imports: [QuestAcceptanceModule] })`:
  - the owner accepts a story: lane set and balance 6000 → 1000
  - 10 rejections with the exact `{ code }` and the Italian message: SLOT_BUSY, TITLE_MISMATCH, NOT_IN_CITY, NOT_ACCEPTABLE, INSUFFICIENT_POINTS, ALREADY_TAKEN, FULL, missing quest, malformed `questId`, malformed `id`
  - the innkeeper on a foreign character gets FORBIDDEN: lane null, 0 PendingQuest, both balances unchanged, `admin_audit_logs` empty
  - the innkeeper on its own character succeeds; an adventurer on a foreign character gets FORBIDDEN; a call with no bearer gets UNAUTHENTICATED
  - `characterUpdated` emits `activeStoryQuest { id startDate waitingTime: 0 pointsSpent: 5000 quest { id } }` with an ISO `startDate` inside the window, and `pendingQuest: null`
- Real boot:
  - `'QuestAcceptanceResolver.acceptQuest'` is added to the ownership whitelist.
  - New `EXPECTED_OWNER_ONLY_HANDLERS` list and test `exposes exactly the enumerated owner-only handlers`.
  - The negative Phase 4 test is replaced by `writes the quest acceptance API into the generated schema`. It checks the exact `acceptQuest` line, the exact `input AcceptQuestRequest` block and `serverTime: DateTime!`, and keeps `not.toMatch(/QuestAcceptance|twitchPointsDebit|INSUFFICIENT_FUNDS|registrations/)`.
  - New test `rejects acceptQuest without a bearer`. The public and innkeeper whitelists are unchanged.
- `src/schema.gql` gains 6 lines (the input block, a blank line and the mutation). The diff against `origin/develop` has no removed lines.

## Task Commits

| Task | Phase | Commit | Subject |
|------|-------|--------|---------|
| 1 | RED | `58137d4` | test(quests): prove the acceptQuest mutation on the wire |
| 1 | GREEN | `a286907` | feat(quests): expose the owner-only acceptQuest mutation |
| 2 | RED | `b4638d1` | test(app): expect the acceptQuest surface on the real boot |
| 2 | GREEN | `0d37f0b` | feat(app): publish the acceptQuest contract in the schema |

## TDD Evidence

- **Task 1 RED:** 16/16 failed with `GRAPHQL_VALIDATION_FAILED` (`Unknown type "AcceptQuestRequest"`, `Cannot query field "acceptQuest" on type "Mutation"`).
- **Task 1 GREEN:** `accept-quest.resolver.int-spec.ts` + `quest-acceptance.service.int-spec.ts` + `character-quest-lanes.int-spec.ts` 55/55 passed. `npm run build` ok, eslint clean on the 4 files.
- **Task 2 RED (partial, as planned):** first run with the positive SDL assertions, the bearer test and the old whitelist: 1 failed, 27 passed. `exposes exactly the enumerated ownership-protected handlers` received the extra `"QuestAcceptanceResolver.acceptQuest"`. The SDL assertions were already green, because the real boot had regenerated the schema with the Task 1 mutation.
- **Task 2 GREEN:** after the whitelists were completed, 29/29 passed. No production code was needed. The regenerated `src/schema.gql` was committed alone in `0d37f0b`.
- **Plan verification:** integration (`src/quests/acceptance`, `character-quest-lanes`, `src/pendingQuests`, `src/time`, `test/app.int-spec.ts`) 6 suites / 101 tests green. Unit (`src/quests src/authz src/time src/characters src/gameRules src/models`) 31 suites / 440 tests green. `npm run build` ok. The schema greps pass and `git diff --exit-code src/schema.gql` exits 0.

## Deviations from Plan

1. **Expected intermediate RED (from the plan's Task 1 note).** Between `a286907` and `b4638d1`, the old real-boot test `boots the quest acceptance primitive without a GraphQL surface` was red by construction, because the real boot now exposes `acceptQuest`. As instructed, it was neither run nor fixed in Task 1. Task 2 rewrote it in positive form.
2. **Task 2 RED commit content.** The test commit `b4638d1` holds the complete test changes: whitelists, owner-only test, positive SDL and the bearer test. The partial RED was observed before the whitelists were completed. The GREEN commit therefore holds only `src/schema.gql`, as the plan allows ("con `test/app.int-spec.ts` (se ancora modificato)").

## Issues Encountered

None.

## Threat Surface

- T-07-27, T-07-28, T-07-29, T-07-30, T-07-31 and T-07-33 are mitigated, with tests as mapped in the plan. T-07-32 is accepted: the audit collection stays empty.
- The only new surface is the planned `acceptQuest` mutation. It has no `@Public`, it is guarded by the owner-only rule and it is enumerated in the real boot.

## Next Phase Readiness

- 07-08 can run the full integration project, mark BE-QUEST-01..04 traceability and write the backend handoff for the FE. The contract is `acceptQuest(request: { id, questId })` → `CommonResponse`. The lane arrives on `characterUpdated` and the balance on `userUpdated`.

## Self-Check: PASSED

- FOUND: src/models/request/accept-quest-request.model.ts, src/quests/acceptance/quest-acceptance.resolver.ts, src/quests/acceptance/accept-quest.resolver.int-spec.ts
- FOUND: 58137d4, a286907, b4638d1, 0d37f0b
