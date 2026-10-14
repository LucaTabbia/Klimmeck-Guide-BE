---
phase: 03-autorizzazione-ownership-ruoli-audit
plan: 06
subsystem: authz-roles
tags: [authz, roles, guard, graphql-schema, users]
requires:
  - 03-01 (createPlayer, createAuthTestApp)
  - 03-02 (readRequestIdentity, AuthorizationException.innkeeperOnly, ResourceNotFoundException.user)
  - 03-03 (userUpdated subscription in users.resolver.ts, kept unchanged)
  - 03-05 (schema.gql assertions in test/app.int-spec.ts)
provides:
  - "ROLES_KEY = 'authz:roles' and Roles(...roles) = applyDecorators(SetMetadata, UseGuards(RolesGuard))"
  - "RolesGuard: role read from the JWT identity, FORBIDDEN on mismatch, UNAUTHENTICATED when no identity"
  - "users and user(id) innkeeper-only; user(id) on an unknown id -> NOT_FOUND"
  - "createUser/updateUser/deleteUser, UserInput and UsersService.create/update/delete removed; schema.gql regenerated"
affects: [03-07 (characters @Roles), 03-08 (pendingQuests @Roles), 03-09/03-10 (audit on @Roles operations), Phase 7-9 admin mutations]
tech-stack:
  added: []
  patterns:
    - "Method-level role guard composed via applyDecorators, runs after the global AuthGuard by construction"
key-files:
  created:
    - src/authz/roles/roles.decorator.ts
    - src/authz/roles/roles.guard.ts
    - src/authz/roles/roles.guard.spec.ts
    - src/users/users-authz.int-spec.ts
  modified:
    - src/users/users.resolver.ts
    - src/users/users.service.ts
    - src/models/user.model.ts
    - test/auth/http-guard.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "ROLES_KEY lives in roles.decorator.ts: the decorator <-> guard import cycle is harmless because RolesGuard is referenced only when Roles() runs and ROLES_KEY only inside canActivate; no roles.metadata.ts needed"
  - "RolesGuard fails closed with AuthException.unauthenticated() when no identity reached the handler (defence in depth behind the global AuthGuard)"
  - "Test players in users-authz.int-spec.ts are created withCharacter: false (the users perimeter does not need characters)"
metrics:
  duration: ~20min
  completed: 2026-10-14
  tasks: 2
---

# Phase 3 Plan 06: Roles decorator and users perimeter Summary

This plan adds a composed `@Roles(RoleType.innkeeper)` decorator. It applies `RolesGuard`, which reads the role from the JWT identity (no DB reload) and answers `FORBIDDEN`. The decorator now restricts `users` and `user(id)` to the innkeeper. The legacy user CRUD (`createUser`/`updateUser`/`deleteUser`, `UserInput`) is gone from the schema, so no client can write `role` or `twitchPoints`.

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | `@Roles` and `RolesGuard` (TDD) | 4fb8eb7 |
| 2 | Users perimeter, removal of the legacy CRUD, existing tests rewritten, schema regenerated (TDD) | 298ed4b |
| - | Refactor: decorator comment no longer names `APP_GUARD` | 6540729 |
| - | Test refactor: one-line FORBIDDEN assertions | 3aef24f |

## TDD evidence

- **Task 1 RED:** `npx jest src/authz/roles --selectProjects unit` failed because `src/authz/roles/roles.decorator.ts` did not exist yet (`Cannot find module`). GREEN: 7/7, and src/authz is 41/41.
- **Task 2 RED:** `npx jest src/users/users-authz.int-spec.ts test/auth/http-guard.int-spec.ts --selectProjects integration --runInBand` gave 7 failed and 21 passed. The adventurer and guard still got the users list, `user(id)` had no FORBIDDEN, the unknown id was not a typed NOT_FOUND, `createUser` was still in the schema (so there was no `GRAPHQL_VALIDATION_FAILED`), and http-guard still expected the adventurer to get the list. GREEN: all passing.

## Verification

- `npx jest src/users src/auth test/auth src/characters test/app.int-spec.ts --selectProjects integration --runInBand`: 22 suites, 241 tests passed
- `npx jest src --selectProjects unit`: 38 suites, 406 tests passed
- `npx tsc --noEmit -p tsconfig.build.json`: exit 0
- `git diff --exit-code src/schema.gql`: exit 0. The regenerated diff only removed `createUser`, `deleteUser`, `updateUser` and `input UserInput`
- No `Co-Authored-By` trailer on any commit of this plan
- Acceptance greps all pass: 2 occurrences of `@Roles(RoleType.innkeeper)`, no `UserInput` in `src/**/*.ts`, no `CREATE_INTRUDER`, no `APP_GUARD` in `src/authz`, 3 occurrences of `toEqual({ code: 'FORBIDDEN' })`, `ResourceNotFoundException.user()` present, no `InjectModel`/`findById` in the guard

## Deviations from Plan

1. **[Rule 1 - Acceptance mismatch] Plan comment text tripped its own `APP_GUARD` grep.** The comment the plan prescribed for `roles.decorator.ts` contained the word `APP_GUARD`, which broke the criterion "`grep -rn APP_GUARD src/authz` returns nothing". I reworded it to "senza dipendere dall'ordine dei guard globali" (commit 6540729).
2. **[Formatting] FORBIDDEN assertions.** At first a shared helper hid the literal `toEqual({ code: 'FORBIDDEN' })`, and when inlined prettier wrapped it. I added an `extensionsOf(response)` helper so the assertion fits on one line in each of the 3 tests (commit 3aef24f).
3. **[Lint] `@typescript-eslint/unbound-method`** in roles.guard.spec.ts on `ProbeHandlers.prototype.adminOnly`. I used the existing `handlerOf('adminOnly')` helper instead.
4. **"Writes nothing" check in http-guard.** As the plan specified, the test now counts `sessions` documents before and after an unauthenticated `logout`. It first creates an authenticated user so the count is non-zero.

## Notes for the verifier

- `src/auth/auth.resolver.int-spec.ts` "leaves non-auth errors without an auth code" queries `user(id)` with the dev bypass (adventurer). It now gets `FORBIDDEN` instead of the old NotFound. The test still passes and its intent still holds (FORBIDDEN is not an `AuthErrorCode`). I did not change it because it is out of scope.
- The worktree started at 911afa1 (main). I reset it to 2a46cf0 before starting, with nothing lost.

## Known Stubs

None.

## Threat Flags

None. The plan only reduces attack surface: it removes three mutations and one input and puts two queries behind a role check.

## Self-Check: PASSED

- FOUND: src/authz/roles/roles.decorator.ts, src/authz/roles/roles.guard.ts, src/authz/roles/roles.guard.spec.ts, src/users/users-authz.int-spec.ts
- FOUND commits: 4fb8eb7, 298ed4b, 6540729, 3aef24f
