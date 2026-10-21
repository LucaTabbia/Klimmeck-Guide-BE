---
phase: 07-quest-lanes-quest-04
plan: 05
subsystem: time
tags: [graphql, query, server-time, clock, countdown, auth, tdd]

# Dependency graph
requires:
  - phase: 07-01
    provides: regenerated src/schema.gql baseline and the real boot SDL tests
provides:
  - "serverTime: DateTime! query (authenticated by the global AuthGuard, no @Public), anchor of the FE countdown offset (07 D-15)"
  - ServerTimeModule with a local Clock (SystemClock), mounted in AppModule right after QuestAcceptanceModule
affects: [07-08, FE QUEST-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Leaf module with a local Clock provider (same pattern as PushModule/EventSubModule)"

key-files:
  created:
    - src/time/server-time.resolver.ts
    - src/time/server-time.resolver.spec.ts
    - src/time/server-time.module.ts
    - src/time/server-time.int-spec.ts
  modified:
    - src/app.module.ts
    - test/app.int-spec.ts
    - src/schema.gql

key-decisions:
  - "Q6 discretion: serverTime lives in its own ServerTimeModule with a local SystemClock; synchronous resolver, no description, no decorator, so it stays out of every whitelist"

patterns-established:
  - "Server time is a standalone authenticated query; entity payloads carry no server timestamp"

requirements-completed: []  # BE-QUEST-04 traceability is marked by plan 07-08

# Metrics
duration: 5min
completed: 2026-10-21
---

# Phase 7 Plan 05: Authenticated serverTime query Summary

**`serverTime: DateTime!` returns `Clock.now()` (ISO 8601) to an authenticated user and `UNAUTHENTICATED` without a bearer. It lives in a minimal `ServerTimeModule` with a local `SystemClock`, mounted in `AppModule`; `src/schema.gql` gains exactly one line.**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-10-21T11:44:30Z
- **Completed:** 2026-10-21T11:49:30Z
- **Tasks:** 2 (each RED + GREEN)
- **Files modified:** 7

## Accomplishments

- `ServerTimeResolver.serverTime(): Date` is synchronous and returns `this.clock.now()`; `@Query(() => Date)` without description, `@Public`, `@Roles` or ownership decorators.
- `ServerTimeModule { providers: [ServerTimeResolver, { provide: Clock, useClass: SystemClock }] }`.
- `AppModule` imports `ServerTimeModule` after `QuestAcceptanceModule`; the real boot validates the DI and writes `  serverTime: DateTime!` into `type Query`.
- Tests: unit spec with `FixedClock` (current value, +5 s, a `Date` and not a Promise); harness int-spec (ISO 8601 within 5 s for an authenticated user, `{ code: 'UNAUTHENTICATED' }` and `data: null` without a bearer); real boot SDL line and `rejects serverTime without a bearer`. The `EXPECTED_PUBLIC_HANDLERS` / innkeeper / ownership whitelists are unchanged and still pass.

## Task Commits

| Task | Phase | Commit | Subject |
|------|-------|--------|---------|
| 1 | RED | `9ca0715` | test(time): specify the server time query |
| 1 | GREEN | `90ea2ec` | feat(time): add the authenticated server time query |
| 2 | RED | `fafdea8` | test(app): expect the server time query on the real boot |
| 2 | GREEN | `953157c` | feat(app): mount the server time module |

## TDD Evidence

- **Task 1 RED:** both `npx jest src/time --selectProjects unit` and `npx jest src/time/server-time.int-spec.ts --selectProjects integration --runInBand` failed with "Cannot find module 'src/time/server-time.resolver'" / "'src/time/server-time.module'" (0 tests run).
- **Task 1 GREEN:** unit 2/2, integration 2/2, `npm run build` succeeded, eslint clean on the 4 files.
- **Task 2 RED:** `test/app.int-spec.ts` gave 2 failed and 25 passed (`writes the server time query into the generated schema`, `rejects serverTime without a bearer`, the unknown query giving a validation error instead of UNAUTHENTICATED). `src/schema.gql` was not modified by the RED run.
- **Task 2 GREEN:** real boot 27/27; `git diff src/schema.gql` showed only `+  serverTime: DateTime!`; the diff versus `origin/develop` has no `-` lines; build and eslint clean.
- **Plan verification:** `src/time` unit 2/2; `server-time.int-spec.ts` + `app.int-spec.ts` integration 29/29.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Threat Surface

- T-07-17 is mitigated: no `@Public()`; UNAUTHENTICATED without a bearer is proved on the harness and on the real boot; the public whitelist is unchanged.
- T-07-18 and T-07-19 are accepted as planned (display-only countdown, non-sensitive value).
- No new surface beyond the planned query.

## Next Phase Readiness

- The FE (QUEST-07) can query `serverTime` at bootstrap and on resume to compute the device-server offset for `startDate + waitingTime`.

## Self-Check: PASSED

- FOUND: src/time/server-time.resolver.ts, server-time.resolver.spec.ts, server-time.module.ts, server-time.int-spec.ts
- FOUND: 9ca0715, 90ea2ec, fafdea8, 953157c
