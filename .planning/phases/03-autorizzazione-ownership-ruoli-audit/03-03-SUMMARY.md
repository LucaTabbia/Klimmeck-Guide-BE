---
phase: 03-autorizzazione-ownership-ruoli-audit
plan: 03
subsystem: realtime-user-stream
tags: [graphql-subscription, change-stream, pubsub, authz]
requires:
  - 03-01 (PUB_SUB, PubSubEvents, openSubscription, createPlayer)
  - 03-02 (subscribeWithSnapshot, documentIdOf, @CurrentUser via readRequestIdentity)
provides:
  - UserUpdatesPublisher (change stream on users -> PUB_SUB 'userUpdated', populated User)
  - "Subscription userUpdated: User! (no args, snapshot + identity-filtered live events)"
affects: [03-05 (schema.gql regeneration), 03-06 (UsersResolver CRUD @Roles), FE Phase 3]
tech-stack:
  added: []
  patterns:
    - "dedicated publisher provider per collection change stream (SoC: UsersService stays CRUD)"
    - "subscribeWithSnapshot(pipe(subscribe, filter(id === identity.userId)), snapshot)"
    - "change-stream test priming with a sentinel user + barrier marker to flush late events"
key-files:
  created:
    - src/users/user-updates.publisher.ts
    - src/users/user-updates.publisher.int-spec.ts
    - src/users/user-updated.subscription.int-spec.ts
  modified:
    - src/users/users.module.ts
    - src/users/users.resolver.ts
decisions:
  - "publishChange loads the user into a const and publishes { userUpdated }: prettier would split the one-line form of the plan's grep; semantics identical"
  - "Change-stream 'error' log carries only error.message (never the raw error/document), same as the load-failure log"
  - "Publisher spec case 6 closes only local.app (not harness close): dropDatabase would invalidate the shared harness stream"
metrics:
  duration: ~20min
  completed: 2026-10-14
  tasks: 2
  files: 5
---

# Phase 3 Plan 03: userUpdated subscription Summary

The `users` collection now has a change stream in `UserUpdatesPublisher`. Every committed update or replace publishes the full User, with `currentCharacter` populated (same shape as `me`), on `PUB_SUB 'userUpdated'`. `UsersResolver.userUpdated` takes no arguments. It sends the caller's current User as a snapshot on every subscribe, then only the live events whose document id matches the JWT identity.

## Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | UserUpdatesPublisher: change stream on users to PUB_SUB | 3cccb55 | src/users/user-updates.publisher.ts, src/users/user-updates.publisher.int-spec.ts, src/users/users.module.ts |
| 2 | userUpdated subscription with snapshot and identity filter (real WS tests) | 3597673 | src/users/users.resolver.ts, src/users/user-updated.subscription.int-spec.ts |

## TDD evidence (RED reasons)

- **Task 1 RED:** the suite could not run: `Cannot find module 'src/users/user-updates.publisher'`. GREEN: 6/6 pass (populated user event, no event for login no-op upserts, manual role change, write inside a transaction, logged load failure with the stream still alive, `close()` on shutdown).
- **Task 2 RED:** 8/8 failed with `Schema is not configured to execute subscription operation.` because the harness schema had no Subscription type. GREEN: 8/8 pass (snapshot, live, isolation with a sentinel, resubscribe after disconnect, createCharacter, manual role change, no arguments in the schema, two devices).
- **REFACTOR:** prettier/eslint only. No behaviour change.

## Verification

- `npx jest src/users test/auth src/auth src/characters/creation test/harness --selectProjects integration --runInBand`: 20 suites, 212/212 green, no new open handles
- `npx jest src/users src/auth src/graphql --selectProjects unit`: 20 suites, 163/163 green
- `npx tsc --noEmit -p tsconfig.build.json`: exit 0
- eslint and prettier on all 5 touched files: clean
- `git log --format=%B -n 2 | grep -ci co-authored-by` = 0
- Acceptance greps: `fullDocument: 'updateLookup'`, the operationType `$in` pipeline, `await this.changeStream?.close()`, `UserUpdatesPublisher` in the module (import + providers), `@Subscription(() => User, { name: 'userUpdated' })`, `documentIdOf(userUpdated) === identity.userId`, `subscribeWithSnapshot(live` all match. There is no `filter: (` option and no `@Args` on userUpdated. The subscription spec has at least 8 `it(` and does not use `TEST_DEV_ACCESS_TOKEN`. `publish('userUpdated'` appears only in user-updates.publisher.ts.

## Deviations from Plan

1. **[Formatting] Publish line split.** The plan's acceptance grep expects `publish('userUpdated', { userUpdated: await this.usersService.findOne(userId) })` on one line, but prettier breaks that line. I wrote it as `const userUpdated = await this.usersService.findOne(userId); this.pubSub.publish('userUpdated', { userUpdated });`. Behaviour is the same, and it is still the only place that publishes `userUpdated`.
2. **[Rule 2 - Security] Change-stream `error` log.** The handler logs `error.message` instead of the raw error object, so no driver context (which can include document data) reaches the logs (T-03-13b).
3. **[Rule 1 - Test robustness] Publisher spec priming.** `nextEvent` keeps a single pending `next()`, so a timed-out wait does not lose an event. After the first sentinel event, priming writes a barrier marker (`twitchPoints: -1`) and throws away every event up to it. This way late priming events cannot leak into a test, and case 2 (no-op upserts) can assert that the first event is the sentinel with `twitchPoints: 1000`.
4. **Publisher spec case 6** calls `local.app.close()` instead of `local.close()`. `close()` drops the shared `auth-test` database, which would invalidate the main harness change stream.
5. **Subscription spec** primes the users change stream once in `beforeAll` (Pitfall 9). It writes only after each snapshot is received.

### Environment notes

- The worktree started at `911afa1` (main). With a clean tree, I reset it to the expected base `a98ec3c` before starting. `node_modules` is symlinked from the main checkout and is not committed.
- I followed the plan's convention: no `Co-Authored-By` trailer.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the `userUpdated` subscription, which is covered by T-03-03, T-03-03b, T-03-10a and T-03-13b. Each has a mitigation and a test (isolation, no args, JWT-only identity, a filter predicate that cannot throw, logs without user data).

## Self-Check: PASSED
