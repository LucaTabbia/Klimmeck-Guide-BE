---
phase: 03-autorizzazione-ownership-ruoli-audit
plan: 02
subsystem: auth, authz, graphql, mongo
tags: [authorization, exceptions, subscriptions, snapshot, repeater, tdd]
requires: []
provides:
  - readRequestIdentity(context) shared by @CurrentUser(), guards and audit interceptor
  - AuthorizationErrorCode (FORBIDDEN, NOT_FOUND)
  - AuthorizationException (403) / ResourceNotFoundException (404) with extensions { code }
  - subscribeWithSnapshot(live, loadSnapshot)
  - documentIdOf(document), isObjectIdHex(value)
affects: [03-03, 03-04, 03-05, 03-06]
tech-stack:
  added: []
  patterns:
    - "Coded HttpException with this.extensions = { code } (works on WS where formatDomainError does not run)"
    - "Repeater-based snapshot + live stream; every live wait races the stop signal"
key-files:
  created:
    - src/auth/request-identity.ts
    - src/auth/request-identity.spec.ts
    - src/authz/authorization-error-code.enum.ts
    - src/authz/authorization.exception.ts
    - src/authz/authorization.exception.spec.ts
    - src/authz/resource-not-found.exception.ts
    - src/authz/resource-not-found.exception.spec.ts
    - src/graphql/subscribe-with-snapshot.ts
    - src/graphql/subscribe-with-snapshot.spec.ts
    - src/mongo/document-id.ts
    - src/mongo/document-id.spec.ts
  modified:
    - src/auth/decorators/current-user.decorator.ts
    - src/graphql/format-domain-error.spec.ts
decisions:
  - "subscribeWithSnapshot races each live wait (firstLive and iterator.next()) with the stop signal, so return() resolves even if the live iterator leaves a pending next() unresolved after return()"
  - "formatDomainError left unchanged: it already handles any HttpException carrying a string extensions.code"
metrics:
  duration: ~20min
  completed: 2026-10-14
  tasks: 3
  files: 13
---

# Phase 03 Plan 02: Authorization primitives Summary

Shared identity reader, typed 403 FORBIDDEN / 404 NOT_FOUND exceptions with Italian messages and WS-safe `extensions`, a Repeater-based `subscribeWithSnapshot` (snapshot → events during load → live, prompt teardown), and ObjectId helpers.

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | readRequestIdentity + @CurrentUser() refactor | cc75fc1 |
| 2 | AuthorizationErrorCode, AuthorizationException, ResourceNotFoundException (+ formatDomainError cases) | 336c2f2 |
| 3 | subscribeWithSnapshot + documentIdOf / isObjectIdHex | 58a97e6 |

## TDD evidence (RED reasons)

- Task 1: `request-identity.spec.ts` failed with "Cannot find module src/auth/request-identity". After GREEN, the GraphQL cases failed again because the fake ExecutionContext lacked `getClass`/`getHandler` (required by `GqlExecutionContext.create`); fixed in the test fixture, aligned with `auth.guard.spec.ts`.
- Task 2: 3 suites failed with missing modules `src/authz/authorization.exception` and `src/authz/resource-not-found.exception`. GREEN with no change to `format-domain-error.ts`.
- Task 3: 2 suites failed with missing modules. After GREEN with the research code verbatim, the "idle return()" case failed (timeout), see deviation 1.

## Verification

- `npx jest src/auth src/authz src/graphql src/mongo --selectProjects unit`: 22 suites, 192 tests green
- `npx jest test/auth/ws-auth.int-spec.ts test/auth/http-guard.int-spec.ts --selectProjects integration --runInBand`: 31 tests green
- `npx tsc --noEmit -p tsconfig.build.json`: exit 0
- eslint on every touched file: 0 errors, 0 warnings
- `git log --format=%B -n 3 | grep -ci co-authored-by` = 0 (per plan convention)
- `src/graphql/format-domain-error.ts` unchanged

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] subscribeWithSnapshot teardown hung on a live iterator with a pending next()**
- **Found during:** Task 3
- **Issue:** With the research code, `Repeater.return()` waits for the executor to settle, and the executor was blocked on `await firstLive`. A live iterator whose `return()` does not resolve the pending `next()` (the plan's case 3 fake) left `return()` hanging, which leaks a listener (T-03-11). The real yoga PubSub does resolve the pending `next()`, so the bug only appears with other iterables, but the plan's spec requires the general guarantee.
- **Fix:** derive `stopped = stop.then(() => ({ done: true }))` and race both `firstLive` and each `iterator.next()` against it; `iterator.return()` is still called on stop. Ordering semantics (`firstLive` taken before `loadSnapshot`) are unchanged; all 4 behavior cases pass.
- **Files modified:** src/graphql/subscribe-with-snapshot.ts
- **Commit:** 58a97e6

**2. [Rule 1 - Lint] `@typescript-eslint/no-base-to-string` on `String(id)` in documentIdOf**
- **Fix:** `(id as { toString(): string }).toString()`; same behavior (ObjectId → hex, string → as is).
- **Commit:** 58a97e6

### Environment notes

- The worktree branch started from `main` (911afa1) instead of 2553672; it was reset onto 2553672 before any work (clean tree, nothing lost).
- The worktree had no `node_modules`; a symlink to the main checkout's `node_modules` was created (ignored by `/node_modules` in `.gitignore`, not committed).

## Known Stubs

None.

## Threat Flags

None: no new endpoints or trust-boundary surface beyond the plan's threat model (T-03-13, T-03-11, T-03-02a, T-03-16a all mitigated and covered by specs).

## Self-Check: PASSED
