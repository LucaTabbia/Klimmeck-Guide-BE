---
phase: 03-autorizzazione-ownership-ruoli-audit
plan: 05
subsystem: realtime-character-stream
tags: [graphql-subscription, authz, ownership, snapshot, schema-contract]
requires:
  - 03-01 (PUB_SUB, openSubscription, expectSilence, createPlayer)
  - 03-02 (subscribeWithSnapshot, documentIdOf, AuthorizationException, ResourceNotFoundException)
  - 03-03 (userUpdated subscription, wire-test patterns)
  - 03-04 (CharacterAccessPolicy, @OwnsCharacter, OwnershipGuard, AuthzModule)
provides:
  - "characterUpdated(id: String!): Character! protected by @OwnsCharacter (FORBIDDEN / NOT_FOUND at subscribe, innkeeper allowed)"
  - "snapshot on every (re)subscribe, loaded only after the guard"
  - "fail-closed per-event filter (documentIdOf === id && mayReceiveCharacterEvent)"
  - "createCharactersTestApp harness (CharactersService/Resolver with a fake Bull queue, no Redis)"
  - "src/schema.gql committed with userUpdated: User! and characterUpdated(id: String!): Character!"
  - "BACKEND-NOTES wave 1 handoff with the verified wire shape"
affects: [03-07 (ownership on character queries/mutations reuses AuthzModule import + harness), FE Phase 3]
tech-stack:
  added: []
  patterns:
    - "@OwnsCharacter + subscribeWithSnapshot(pipe(subscribe, filter(mayDeliver)), findOne)"
    - "change-stream priming on characters with a sentinel player (Pitfall 9)"
key-files:
  created:
    - test/authz/characters-test-app.ts
    - src/characters/character-updated.subscription.int-spec.ts
  modified:
    - src/characters/characters.resolver.ts
    - src/characters/characters.module.ts
    - test/app.int-spec.ts
    - src/schema.gql
    - .planning/phases/03-autorizzazione-ownership-ruoli-audit/BACKEND-NOTES.md
decisions:
  - "The per-event predicate is a private mayDeliver(identity, id, character) method: it keeps the filter readable and leaves mayReceiveCharacterEvent(identity, id) on one line after prettier"
  - "The handoff states that an innkeeper subscribing to a well-formed but missing id still gets the untyped findOne error from the snapshot (the policy does not check existence for the innkeeper); to align in the query-ownership plan"
metrics:
  duration: ~25min
  completed: 2026-10-14
  tasks: 3
  files: 7
---

# Phase 3 Plan 05: Protected characterUpdated and the real-time contract Summary

`characterUpdated(id)` keeps its GraphQL signature, but it is now guarded by `@OwnsCharacter`. A non-innkeeper subscribing to someone else's character gets `next` with `errors[0].extensions = { code: 'FORBIDDEN' }` and then `complete`, and receives no snapshot. A missing or malformed id gets `NOT_FOUND`. Owners and the innkeeper get a snapshot and then live events. Every live event is checked again with `mayReceiveCharacterEvent`, which fails closed. `src/schema.gql` was regenerated and committed, and the BACKEND-NOTES handoff now documents the shape verified on the wire.

## Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | RED: characters harness and WS int-spec | f5e3fec | test/authz/characters-test-app.ts, src/characters/character-updated.subscription.int-spec.ts |
| 2 | GREEN: @OwnsCharacter, snapshot after the guard, per-event filter | 3ad66d2 | src/characters/characters.resolver.ts, src/characters/characters.module.ts |
| 3a | Schema regenerated + real-boot contract assertion | d8fd03e | test/app.int-spec.ts, src/schema.gql |
| 3b | Wave 1 handoff in BACKEND-NOTES | 9fc73bb | BACKEND-NOTES.md |

## TDD evidence

- **RED (Task 1):** 8 of 9 tests failed and 1 passed (the signature check). Each failing test hit the 5000 ms Jest timeout while waiting for the first subscription result. The old subscription sends no snapshot, so the owner, innkeeper, isolation, ownership-change and resubscribe cases never got a first result. It also had no guard, so the FORBIDDEN, guard-role and NOT_FOUND cases got no rejection and just stayed open.
- **GREEN (Task 2):** 9/9 pass. The rejection arrives as `next` + `complete`, as research predicted, not as a graphql-ws `error` message.
- **REFACTOR:** I moved the per-event predicate into `mayDeliver` and re-ran the tests: still green.

## Verification

- `npx jest src/characters src/users src/auth test/auth test/harness --selectProjects integration --runInBand`: 22 suites, 222/222. It was green on 5 of 6 runs. The first run had 1 failing test that I could not identify (the output was only grepped for totals), and the next 5 runs were all green. See Deferred Issues.
- `npx jest src --selectProjects unit`: 37 suites, 399/399
- `npx tsc --noEmit -p tsconfig.build.json`: exit 0
- eslint/prettier on all touched TS files: clean
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 12/12. The only schema diff is `+  userUpdated: User!` in `type Subscription`.
- `git diff --exit-code src/schema.gql`: exit 0 after the commit
- `npm test` (wave gate): exit 0. Unit 38 suites / 411 tests, integration 24 suites / 239 tests, about 37 s wall time.
- `git log --format=%B -n 4 | grep -ci co-authored-by` = 0
- Acceptance greps: all match. `@OwnsCharacter<{ id: string }>(({ id }) => id)`, `@Subscription(() => Character, { name: 'characterUpdated' })`, `mayReceiveCharacterEvent(identity, id)` and `subscribeWithSnapshot(live` each match. There is no `filter: (payload`. `AuthzModule` appears twice in the module. The spec contains FORBIDDEN×2, NOT_FOUND×2 and `expectSilence`, and has no `TEST_DEV_ACCESS_TOKEN`. In BACKEND-NOTES: FORBIDDEN×12, plus `non deve ritentare` and `Stato (wave 1`.

## Deviations from Plan

1. **[Formatting] Per-event filter extracted to `mayDeliver`.** Prettier wrapped the inline `await this.characterAccess.mayReceiveCharacterEvent(identity, id)` across lines. Instead of keeping a wrapped line, I moved the predicate into a private method. The method returns false on an id mismatch, otherwise it returns the policy's answer. The semantics are the same as the plan (`documentIdOf === id && mayReceiveCharacterEvent`), and the key-link grep matches on one line.
2. **[Rule 3 - Test robustness] Characters change-stream priming.** The spec primes the characters change stream in `beforeAll`, using a sentinel player and repeated writes until the PubSub delivers (the same technique as 03-03, Pitfall 9). It then clears the DB. Players are created in `beforeEach`.
3. **[Rule 2 - Accurate handoff] Innkeeper on a missing id.** `authorizeCharacter` returns `onBehalf` for the innkeeper without checking that the character exists. So an innkeeper subscribing to a well-formed id that does not exist gets the snapshot's `NotFoundException`, not a typed `NOT_FOUND`. I documented this in BACKEND-NOTES rather than claiming `NOT_FOUND` for everyone. No test covers it (it is not in the plan's cases). It should be aligned when 03-07 adds ownership to `character(id)`.

### Environment notes

- The worktree started at `911afa1` (main). With a clean tree, I reset it to `4be1664`. `node_modules` is symlinked from the main checkout and is not committed.
- I followed the plan's convention: no `Co-Authored-By` trailer.

## Deferred Issues

- One unidentified failing integration test on the first regression run; the next 5 runs and `npm test` were green. A likely factor is that `OpenSubscription.next` defaults to a 5000 ms timeout, which is the same as Jest's 5000 ms test timeout, so a slow change stream under load hits the test timeout first. Worth watching in CI.
- The innkeeper / missing-id typing gap (deviation 3).

## Known Stubs

None.

## Threat Flags

None. The surface is the existing `characterUpdated` subscription. It is now covered by T-03-02 (cases 2, 3, 6), T-03-17 (case 7), T-03-16b (case 4) and T-03-19 (handoff: no retry and excluded from the watchdog).

## Self-Check: PASSED
