---
phase: 03-autorizzazione-ownership-ruoli-audit
plan: 01
subsystem: realtime-test-foundation
tags: [pubsub, graphql-ws, test-harness, fixtures]
requires: []
provides:
  - PUB_SUB token constant and PubSubEvents typed on real payloads ({ characterUpdated }, { userUpdated })
  - createAuthTestApp with PubSubModule in base imports
  - openSubscription / withTimeout / expectSilence WS helpers
  - createPlayer(harness, options) JWT-authenticated player fixture
affects: [03-03, 03-05, all auth integration tests]
tech-stack:
  added: []
  patterns:
    - "@Inject(PUB_SUB) PubSub<PubSubEvents> from @graphql-yoga/subscription"
    - "multi-event WS stream reading with per-next() cleared timeout"
key-files:
  created:
    - test/authz/player-fixture.ts
  modified:
    - src/pubsub.module.ts
    - src/characters/characters.service.ts
    - test/harness/character-changestream.int-spec.ts
    - test/auth/auth-test-app.ts
    - test/auth/auth-test-app.int-spec.ts
    - test/auth/ws-test-client.ts
decisions:
  - "OpenSubscription types results as graphql-ws FormattedExecutionResult<T, unknown> (what client.iterate actually yields) instead of ExecutionResult"
  - "characters.service.ts not reformatted with prettier: whole-file churn (~235 diff lines) would conflict with parallel plans; touched lines are lint-clean"
metrics:
  duration: ~15min
  completed: 2026-10-14
---

# Phase 3 Plan 01: Real-time test foundation Summary

Typed yoga PubSub (`PUB_SUB` + `PubSubEvents` on the real `{ characterUpdated }` / `{ userUpdated }` payloads), `CharactersService` injecting `PubSub<PubSubEvents>` without the dead `getPubSub()`, the auth test harness resolving `PUB_SUB`, plus `openSubscription`/`expectSilence` WS helpers and the `createPlayer` JWT fixture.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | PubSubEvents payloads reali, PUB_SUB, CharactersService tipizzato | 8b46bf4 | src/pubsub.module.ts, src/characters/characters.service.ts, test/harness/character-changestream.int-spec.ts |
| 2 | Harness con PubSubModule, openSubscription/expectSilence, createPlayer | 101c212 | test/auth/auth-test-app.ts, test/auth/ws-test-client.ts, test/authz/player-fixture.ts, test/auth/auth-test-app.int-spec.ts |

## TDD evidence

- **Task 1 RED:** the jest run stayed green, because ts-jest runs transpile-only (`isolatedModules: true` in tsconfig.json) and the payload change is runtime-compatible. RED was shown with `npx tsc --noEmit -p tsconfig.json --types node,multer,jest` instead: `test/harness/character-changestream.int-spec.ts(38,54): error TS2353: Object literal may only specify known properties, and 'characterUpdated' does not exist in type 'Character'.` GREEN: the error went away with the new `PubSubEvents` and the jest test passes.
- **Task 2 RED:** `Cannot find module '../authz/player-fixture' from 'test/auth/auth-test-app.int-spec.ts'` (the suite failed to run). GREEN: 8/8 tests pass.

## Verification

- `npx jest test/harness/character-changestream.int-spec.ts --selectProjects integration --runInBand`: passed
- `npx jest src/characters --selectProjects unit`: 124/124 passed
- `npx jest test/auth test/harness src/auth --selectProjects integration --runInBand`: 13 suites, 141/141 passed
- `npx tsc --noEmit -p tsconfig.build.json`: exit 0
- Every acceptance grep in the plan matches.

## Deviations from Plan

1. **[Rule 3 - Blocking] Task 1 RED via tsc, not jest.** ts-jest does not type-check here (`isolatedModules`). The RED proof is the tsc error quoted above.
2. **[Rule 1 - Bug] `OpenSubscription.next` result type.** The plan used `ExecutionResult<T>`. `client.iterate<T>` returns `FormattedExecutionResult<T, unknown>`, and the plan's type gave TS2322 under the full tsc check. I used the correct graphql-ws type.
3. **Change-stream test payload is held in a `const payload`** before `publish`. That keeps `{ characterUpdated: change.fullDocument }` on one line, so it matches the acceptance grep and prettier at the same time.
4. **No prettier --write on `src/characters/characters.service.ts`.** The file has 45 prettier/eslint errors from before this plan (44 now). Reformatting the whole file would make about 235 lines of unrelated diff and would likely conflict with parallel plans. The lines I touched are lint-clean.
5. **Worktree setup:** I fast-forwarded the branch to base `2553672` (HEAD was its ancestor) and symlinked `node_modules` from the main checkout. The symlink is gitignored and not committed.

## Deferred Issues (out of scope, pre-existing)

- Full `tsc -p tsconfig.json` with jest types has 5 errors in files this plan did not touch: `src/auth/auth-session.service.int-spec.ts` (2), `src/auth/dev/dev-auth.strategy.int-spec.ts` (1), `test/fixtures/fixtures.int-spec.ts` (2).
- `src/characters/characters.service.ts` does not follow prettier formatting (44 eslint errors).

## Known Stubs

None.

## Self-Check: PASSED
