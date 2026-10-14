---
phase: 03-autorizzazione-ownership-ruoli-audit
plan: 08
subsystem: authz-ownership
tags: [authz, ownership, roles, pending-quests, graphql]
requires:
  - 03-01 (createPlayer, createAuthTestApp)
  - 03-02 (ResourceNotFoundException.pendingQuest, AuthorizationException.pendingQuestNotOwned, isObjectIdHex)
  - 03-04 (CharacterAccessPolicy, OwnedResource, OwnershipGuard, OwnsCharacter)
  - 03-06 (Roles decorator, RolesGuard)
provides:
  - "OwnedResource.pendingQuest = 'PendingQuest'"
  - "CharacterAccessPolicy.authorizePendingQuest(identity, id): malformed -> NOT_FOUND; innkeeper -> onBehalf with no read; owner when it equals quests.pendingQuest of the bearer's character; otherwise exists -> FORBIDDEN / NOT_FOUND"
  - "@OwnsPendingQuest(selector) on the same OwnershipGuard; OwnsCharacter and OwnsPendingQuest share a private ownsResource helper"
  - "pendingQuest(id) owner-or-innkeeper; pendingQuests innkeeper-only; PendingQuestsService.findOne throws typed NOT_FOUND"
  - "AuthzModule registers PendingQuest; PendingQuestsModule imports AuthzModule"
affects: [03-09/03-10 (audit of onBehalf pending quest reads via OwnershipGuard target { type: 'PendingQuest', id })]
tech-stack:
  added: []
  patterns:
    - "Ownership of a resource that does not reference its owner is resolved through the bearer's character (users -> characters projection)"
key-files:
  created:
    - src/pendingQuests/pending-quests-authz.int-spec.ts
  modified:
    - src/authz/ownership/owned-resource.ts
    - src/authz/ownership/character-access.policy.ts
    - src/authz/ownership/character-access.policy.spec.ts
    - src/authz/ownership/ownership.decorators.ts
    - src/authz/authz.module.ts
    - src/pendingQuests/pending-quests.resolver.ts
    - src/pendingQuests/pending-quests.module.ts
    - src/pendingQuests/pending-quests.service.ts
decisions:
  - "The innkeeper short-circuit in authorizePendingQuest runs before any read (unlike authorizeCharacter, there is no 'own' pending quest for the innkeeper worth distinguishing), so innkeeper pending quest reads are always onBehalf"
  - "Characters projection typed as PendingQuestProjection with optional quests/pendingQuest, so a character without a pending quest falls through to the existence check (FORBIDDEN if the quest exists)"
metrics:
  duration: ~15min
  completed: 2026-10-14
  tasks: 2
---

# Phase 3 Plan 08: Pending quest ownership and admin list Summary

`pendingQuest(id)` now answers an adventurer only when the id is the `quests.pendingQuest` of the bearer's own character. Otherwise it returns `FORBIDDEN` ('Questa missione non ti appartiene') if the pending quest exists, and `NOT_FOUND` if it does not or the id is malformed. The innkeeper can read any pending quest, and the `pendingQuests` list is innkeeper-only. Both rules reuse the existing policy, `OwnershipGuard` and `RolesGuard`, so the error codes match the other protected operations.

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | Policy `authorizePendingQuest` and `@OwnsPendingQuest` decorator | 8526933 |
| 2 | Protect `pendingQuest(id)`, make `pendingQuests` innkeeper-only, typed NOT_FOUND (wire tests) | a28c9ec |

## TDD

- **Task 1 RED:** 10 new policy spec cases failed (`policy.authorizePendingQuest is not a function`; `OwnedResource.pendingQuest` undefined, so `authorize` returned `undefined`). GREEN: `src/authz` unit suite passed, 51/51.
- **Task 2 RED:** 8 of 12 wire tests failed. With no guards, foreign, guard and no-character reads returned data instead of `FORBIDDEN`, `pendingQuests` was open to adventurers and guards, and unknown or malformed ids produced the raw `NotFoundException` or a CastError instead of `{ code: 'NOT_FOUND' }`. The 4 tests that passed were own read, innkeeper read, innkeeper list and unauthenticated. GREEN: 12/12 passed.
- **REFACTOR:** `ownsResource` helper extracted in Task 1, so `UseGuards(OwnershipGuard)` appears exactly once.

## Verification

- `npx jest src/pendingQuests src/authz src/users src/auth test/auth test/app.int-spec.ts --selectProjects integration --runInBand`: 18 suites, 198 tests passed
- `npx jest src --selectProjects unit`: 38 suites, 416 tests passed
- `git diff --exit-code src/schema.gql`: no change (GraphQL signatures unchanged)
- `npx tsc --noEmit -p tsconfig.build.json`: exit 0; eslint clean on all 9 touched files
- Commits contain no `Co-Authored-By` trailer, as the plan requires

## Deviations from Plan

### Auto-fixed Issues

None. Two small additions to the plan:
- The policy spec has one extra case: an adventurer whose character has `pendingQuest: null` gets `FORBIDDEN`. The wire spec also checks the typed NOT_FOUND message ('Missione in attesa non trovata') for the innkeeper.
- `PendingQuestsModule`, `PendingQuestsService` and the resolver were reformatted by prettier because the legacy code used `{ }` and long single-line imports. This counts as Boy Scout cleanup, and the unused `Mutation` and `NotFoundException` imports were removed as the plan asked.

## Known Stubs

None.

## Self-Check: PASSED
