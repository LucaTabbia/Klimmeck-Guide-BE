---
phase: 07-quest-lanes-quest-04
plan: 04
subsystem: authz
tags: [authz, ownership, guard, owner-only, pending-quests, quest-lanes, tdd]

# Dependency graph
requires:
  - phase: 07-01
    provides: lanes activeStoryQuest/activeWorldMissionQuest on CharacterQuests
  - phase: 07-02
    provides: QUEST_LANES, QuestLane and lanePathOf in src/quests/acceptance/quest-lanes.ts
provides:
  - "@OwnsCharacter(selectId, { ownerOnly: true }): no innkeeper bypass, no on-behalf decision, no audit (07 D-11)"
  - OwnershipRule.ownerOnly in the OWNERSHIP_KEY metadata (the real boot can enumerate owner-only handlers)
  - CharacterAccessPolicy.authorize/authorizeCharacter accept CharacterAccessOptions { ownerOnly }
  - pendingQuest(id) owner check covers pendingQuest, activeStoryQuest and activeWorldMissionQuest (C4)
affects: [07-06, 07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One ownership API with an options bag: strictness lives in the rule metadata, not in a second decorator or guard"
    - "Ownership projection derived from QUEST_LANES: a new lane is recognised automatically"

key-files:
  created: []
  modified:
    - src/authz/ownership/ownership.decorators.ts
    - src/authz/ownership/ownership.guard.ts
    - src/authz/ownership/ownership.guard.spec.ts
    - src/authz/ownership/character-access.policy.ts
    - src/authz/ownership/character-access.policy.spec.ts
    - src/pendingQuests/pending-quests-authz.int-spec.ts

key-decisions:
  - "Q5 discretion: ownerOnly is an option of @OwnsCharacter under the same OWNERSHIP_KEY (default false), so every existing handler keeps the Phase 3 D-09 innkeeper bypass"
  - "With ownerOnly the innkeeper on a foreign character goes through the normal rejection branch (assertCharacterExists): FORBIDDEN or NOT_FOUND, never onBehalf, so recordOnBehalf never fires"
  - "@OwnsPendingQuest keeps ownerOnly false; the innkeeper bypass for pendingQuest(id) is unchanged"

patterns-established:
  - "Owner-only handlers declare { ownerOnly: true } on @OwnsCharacter; the matcher on rule.ownerOnly enumerates them"

requirements-completed: []  # BE-QUEST-02/03 traceability is marked by plan 07-08

# Metrics
duration: 6min
completed: 2026-10-21
---

# Phase 7 Plan 04: Owner-only guard and lane-aware pending quest ownership Summary

**`@OwnsCharacter(selectId, { ownerOnly: true })` now denies the innkeeper a foreign character with FORBIDDEN or NOT_FOUND, with no on-behalf decision and no audit. The option travels in the `OWNERSHIP_KEY` metadata and defaults to false. `pendingQuest(id)` treats as owner whoever holds the id in any of the three lanes of their own character.**

## Performance

- **Duration:** about 6 min
- **Started:** 2026-10-21T11:40:30Z
- **Completed:** 2026-10-21T11:46:00Z
- **Tasks:** 2 (each RED + GREEN)
- **Files modified:** 6

## Accomplishments

- `ownership.decorators.ts`: `OwnershipRule.ownerOnly: boolean`, `OwnershipOptions`, `OwnsCharacter(selectId, options = {})` writes `options.ownerOnly ?? false`; `OwnsPendingQuest` writes `false`.
- `ownership.guard.ts`: calls `policy.authorize(identity, rule.resource, targetId, { ownerOnly: rule.ownerOnly })`. Nothing else changed: with `ownerOnly` the policy never returns `onBehalf`, so `recordOnBehalf` never fires.
- `character-access.policy.ts`:
  - `CharacterAccessOptions`; `authorize` passes the options only to the character branch.
  - `authorizeCharacter` bypass is now `identity.role === RoleType.innkeeper && !options.ownerOnly`.
  - `readOwnPendingQuestId` became `readOwnPendingQuestIds`, which reads the three lanes with the module constant `OWN_PENDING_QUESTS_PROJECTION` (derived from `QUEST_LANES`/`lanePathOf`). `authorizePendingQuest` checks `.includes(pendingQuestId)`.
- Tests: the guard spec has a `strict` probe handler (policy forwarding, metadata `true`/`false`). The policy spec has three ownerOnly cases on `authorizeCharacter`, one on `authorize`, the three-lane projection and `it.each` on the two new lanes. The int-spec proves C4 on the wire: the owner can read the story and world lanes, and a foreign story lane stays FORBIDDEN.

## Task Commits

| Task | Phase | Commit | Subject |
|------|-------|--------|---------|
| 1 | RED | `fcb0a5c` | test(authz): specify the owner-only character guard |
| 1 | GREEN | `317c1a2` | feat(authz): add the owner-only option to the character guard |
| 2 | RED | `3487cb8` | test(authz): let owners read pending quests of every lane |
| 2 | GREEN | `483832f` | feat(authz): recognise pending quests in the story and world lanes |

## TDD Evidence

- **Task 1 RED:** `npx jest src/authz --selectProjects unit` gave 6 failed and 76 passed:
  - the innkeeper ownerOnly cases and `forwards ownerOnly to authorizeCharacter` resolved to `"onBehalf"` instead of rejecting
  - the guard expected the 4th argument `{ ownerOnly: false }` / `{ ownerOnly: true }`, which was missing
  - the metadata test got `ownerOnly` as `undefined`
- **Task 1 GREEN:** `src/authz` unit 82/82; `npm run build` succeeded; `git diff --exit-code src/schema.gql` exited 0; eslint clean on the 5 files.
- **Task 2 RED, unit:** `character-access.policy.spec.ts` gave 3 failed and 33 passed. These were the three-lane projection and the two `it.each` lanes, which were FORBIDDEN.
- **Task 2 RED, integration:** `pending-quests-authz.int-spec.ts` gave 2 failed and 13 passed. Both lanes returned `{"code":"FORBIDDEN"}`, `"Questa missione non ti appartiene"` (Pitfall 9 / C4).
- **Task 2 GREEN:** `src/authz` unit 84/84; integration 15/15; build succeeded; schema unchanged; eslint clean on the 3 files.

## Deviations from Plan

None. Notes:

- Prettier kept `ownsResource(OwnedResource.character, selectId, options.ownerOnly ?? false);` on one line. The acceptance grep `options.ownerOnly ?? false` matches it, which I verified with `grep -F`.
- The policy spec's `characterDoc` type widened to `{ quests: Record<string, Types.ObjectId | null> }` so the `it.each` lanes can be expressed. This is test typing only.

## Issues Encountered

None.

## Threat Surface

- T-07-13 is mitigated: ownerOnly skips the innkeeper branch, which gives FORBIDDEN/NOT_FOUND and no `onBehalf`, so there is no audit. The option is in the metadata so 07-07 can enumerate it on the real boot.
- T-07-14 is mitigated: the default is `false`, and the existing guard and policy tests are unchanged in behaviour. The innkeeper still gets `onBehalf` on a foreign character without the option.
- T-07-15 is mitigated: the innkeeper ownerOnly path reuses `assertCharacterExists` (an archived character counts as missing, so NOT_FOUND).
- T-07-16 is mitigated: ownership extends only to the three lanes of the bearer's own character, and a foreign lane stays FORBIDDEN.
- No new surface; `src/schema.gql` is unchanged.

## Next Phase Readiness

- 07-07 can declare `@OwnsCharacter<…>(…, { ownerOnly: true })` on `acceptQuest` and enumerate it on the real boot through `rule.ownerOnly`.

## Self-Check: PASSED

- FOUND: src/authz/ownership/ownership.decorators.ts, ownership.guard.ts, character-access.policy.ts (modified)
- FOUND: fcb0a5c, 317c1a2, 3487cb8, 483832f
