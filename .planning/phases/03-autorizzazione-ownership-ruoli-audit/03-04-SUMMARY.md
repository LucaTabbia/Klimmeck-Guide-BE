---
phase: 03-autorizzazione-ownership-ruoli-audit
plan: 04
subsystem: authz
tags: [authorization, ownership, guard, decorator, idor, tdd]
requires:
  - 03-02 (readRequestIdentity, AuthorizationException, ResourceNotFoundException, isObjectIdHex)
provides:
  - "OwnedResource / ResourceAccess / OnBehalfTarget (src/authz/ownership/owned-resource.ts)"
  - "CharacterAccessPolicy.authorize / authorizeCharacter / mayReceiveCharacterEvent"
  - "AuthorizationDecisions.recordOnBehalf / onBehalfTargetOf (WeakMap keyed by GraphQLResolveInfo)"
  - "OWNERSHIP_KEY, OwnershipRule, OwnsCharacter(selector) (src/authz/ownership/ownership.decorators.ts)"
  - "OwnershipGuard (method guard, runs after the global AuthGuard)"
  - "AuthzModule (forFeature User + Character; exports CharacterAccessPolicy, AuthorizationDecisions)"
affects: [03-05, 03-07, 03-08, 03-09]
tech-stack:
  added: []
  patterns:
    - "Composed decorator: SetMetadata + UseGuards(method guard) — no ownership logic in resolvers"
    - "Single users read per operation; existence check only on the rejection branch (403 vs 404 distinct)"
    - "Fail-closed event filter: read error -> false + warn, never throws"
    - "Typed lean projection (lean<{ currentCharacter: Types.ObjectId | null } | null>()) compared via String(value)"
key-files:
  created:
    - src/authz/ownership/owned-resource.ts
    - src/authz/ownership/character-access.policy.ts
    - src/authz/ownership/character-access.policy.spec.ts
    - src/authz/ownership/authorization-decisions.ts
    - src/authz/ownership/authorization-decisions.spec.ts
    - src/authz/ownership/ownership.decorators.ts
    - src/authz/ownership/ownership.guard.ts
    - src/authz/ownership/ownership.guard.spec.ts
    - src/authz/authz.module.ts
  modified: []
decisions:
  - "OWNERSHIP_KEY and OwnershipRule stay in ownership.decorators.ts as planned: the decorators<->guard import cycle is safe because both sides only dereference the other at call time (verified by the guard spec, which loads decorators first)"
  - "readCurrentCharacterId types the lean projection as ObjectId | null instead of Character | null, which removes the no-base-to-string lint warning while keeping String(value) comparison (D-20 trap of 02.1)"
  - "Added a test for a deleted user document (findById -> null): treated as no character, so FORBIDDEN on an existing foreign character"
metrics:
  duration: ~15min
  completed: 2026-10-14
  tasks: 2
  files: 9
---

# Phase 3 Plan 04: Ownership core (policy, decisions, @OwnsCharacter guard) Summary

Centralized character ownership rule: `CharacterAccessPolicy` decides owner / onBehalf (innkeeper) / FORBIDDEN / NOT_FOUND with one `users` read per operation, `@OwnsCharacter(selector)` applies it declaratively to any GraphQL resolver via a method guard, and on-behalf decisions are recorded per `info` in a WeakMap for the audit interceptor of plan 03-09.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | CharacterAccessPolicy (one users read, NOT_FOUND vs FORBIDDEN, fail-closed event filter) | d17720a | owned-resource.ts, character-access.policy.ts, character-access.policy.spec.ts |
| 2 | AuthorizationDecisions, @OwnsCharacter, OwnershipGuard, AuthzModule | 908512c | authorization-decisions(.spec).ts, ownership.decorators.ts, ownership.guard(.spec).ts, authz.module.ts |

## TDD log

- **Task 1 RED:** `npx jest src/authz/ownership/character-access.policy.spec.ts --selectProjects unit` failed with "Cannot find module 'src/authz/ownership/character-access.policy'" (module not yet written). GREEN: 18/18 tests passing (12 behaviours of the plan + extra case for a deleted user document; malformed ids covered with `it.each` for adventurer and innkeeper).
- **Task 2 RED:** `npx jest src/authz/ownership --selectProjects unit` failed for `ownership.guard.spec.ts` and `authorization-decisions.spec.ts` (modules missing). GREEN: `npx jest src/authz src/auth --selectProjects unit` -> 19 suites, 164 tests passing.
- **REFACTOR:** lint warning `@typescript-eslint/no-base-to-string` on `String(user.currentCharacter)` (field typed `Character | null`) fixed by typing the lean projection; tests stayed green.

## Verification

- `npx jest src/authz src/auth --selectProjects unit`: 164/164 green
- `npx tsc --noEmit -p tsconfig.build.json`: exit 0
- `npx eslint` on all 9 touched files: clean
- `grep -rn "APP_GUARD" src/authz`: empty (no second global guard)
- `git log --format=%B -n 2 | grep -ci "co-authored-by"`: 0

## Deviations from Plan

### Formatting-induced acceptance grep mismatches (no behaviour change)

Prettier (printWidth 80, tabWidth 4 — mandatory project formatting) wraps three lines that the plan's acceptance criteria grep as single-line literals:
- `findById(userId, { currentCharacter: 1 }).lean()` is now a multi-line member chain (`.findById(userId, { currentCharacter: 1 })` / `.lean<CurrentCharacterProjection | null>()` / `.exec()`).
- `if (!isObjectIdHex(characterId)) throw ResourceNotFoundException.character();` is wrapped onto two lines.
- `this.policy.authorize(identity, rule.resource, targetId)` is wrapped onto multiple lines (`this.policy.authorize(` is still on one line, matching the key_link pattern).
- `new WeakMap<GraphQLResolveInfo, OnBehalfTarget>()` is wrapped across lines.

The semantics are exactly those in the plan; only line breaks differ.

### [Rule 1 - Lint/type correctness] Typed lean projection

- **Found during:** Task 1
- **Issue:** `User.currentCharacter` is typed `Character | null` but stored as an unpopulated ObjectId; `String(...)` on it triggered `no-base-to-string`.
- **Fix:** `lean<CurrentCharacterProjection | null>()` with `currentCharacter: Types.ObjectId | null`, still compared through `String(value)`.
- **Commit:** d17720a

## Notes for downstream plans

- `AuthzModule` is not yet imported by any feature module; 03-05/03-07/03-08 must import it in the module hosting the resolver so `OwnershipGuard` can resolve `CharacterAccessPolicy` and `AuthorizationDecisions`.
- `authorize()` uses an exhaustive `switch` with no `default`; when 03-08 adds `OwnedResource.pendingQuest`, TypeScript will flag the missing return until the new case is handled.

## Known Stubs

None.

## Threat Flags

None — all surface is covered by the plan's threat register (T-03-01, T-03-01b, T-03-06a, T-03-10, T-03-16).

## Self-Check: PASSED

- All 9 created files present on disk
- Commits d17720a and 908512c present in `git log`
