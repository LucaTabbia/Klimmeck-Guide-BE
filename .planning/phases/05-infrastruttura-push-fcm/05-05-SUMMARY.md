---
phase: 05-infrastruttura-push-fcm
plan: 05
subsystem: push
tags: [push, fcm, pruning, best-effort, batching, topic, domain-service]
requires: ["05-02", "05-03", "05-04"]
provides:
  - "push-delivery.ts (pure): PushDeliveryCounts, DeliveryFailureKind, classifyDeliveryFailure, prunableTokens (per-batch witness rule), chunk, deliveryCountsOf, topicDeliveryCounts, emptyDelivery, failureCodeSummary, describePushError"
  - "PushService: sendToUser(userId: Types.ObjectId, message) and broadcast(message) -> PushDeliveryCounts, both best-effort (they never throw)"
  - "PushService: registerDevice(userId: string, input) -> true, unregisterDevice(userId: string, deviceId) -> true, sendTest(callerId: string, input) -> PushDeliveryCounts"
  - "SendTestPushInput @InputType { type: PushEventType; targetUserId?: ID; id?: String }"
affects: [05-06, 05-07, 05-08]
tech-stack:
  added: []
  patterns: ["service -> PushTransport port (D-07); chunk(tokens, FCM_MULTICAST_LIMIT) with a per-batch witness rule for messaging/invalid-argument", "best-effort topic management with two separate methods (no behaviour flag); logs carry only counts, codes and a 6-char token suffix"]
key-files:
  created:
    - src/push/push-delivery.ts
    - src/push/push-delivery.spec.ts
    - src/push/dto/send-test-push.input.ts
    - src/push/push.service.ts
    - src/push/push.service.spec.ts
  modified: []
decisions:
  - "removeTokens is called only when at least one token is prunable, so a batch with no witness never touches the registry"
  - "One ERROR line covers unpruned payload/suspect rejections and one WARN line covers transient failures, each with a failureCodeSummary of codes and counts and never the tokens"
  - "The user existence check is shared by authenticatedOwner (UNAUTHENTICATED) and existingUser (NOT_FOUND) through a private userExists"
  - "Topic logs use a token suffix of LOGGED_TOKEN_SUFFIX_LENGTH = 6 characters, prefixed with …"
metrics:
  duration: 4 min
  completed: 2026-10-18
  tasks: 3
  files: 5
---

# Phase 5 Plan 05: PushService domain service Summary

`PushService` is the shared push service, and it depends only on the `PushTransport` port. `sendToUser` reads the user's tokens from the registry and sends them in batches of 500 with `chunk(tokens, FCM_MULTICAST_LIMIT)`. After sending, it prunes tokens using `prunableTokens`: tokens with `messaging/registration-token-not-registered` or `messaging/invalid-registration-token` are always pruned. A token with `messaging/invalid-argument` is pruned only when another token in the same batch was delivered (the "witness" rule). The method returns `{ targeted, sent, pruned, failed }`. `broadcast` sends to the `streamer-live` topic. Neither method ever throws: a disabled transport returns an empty report, and any failure is logged at WARN and turned into an empty or failed report.

`registerDevice` validates the input before any I/O. It then rejects a malformed or deleted user with `UNAUTHENTICATED`, claims the device in the registry, and subscribes the token to the topic best-effort. When the device replaces its token, the old token is unsubscribed. `unregisterDevice` is idempotent and unsubscribes the token it removed. `sendTest` behaves as D-13 requires:
- `PUSH_DISABLED` when the transport is the no-op one.
- `streamerLive` is broadcast and `targetUserId` is ignored.
- Otherwise the target is `targetUserId` or, if absent, the caller. A malformed or nonexistent target gets the same `NOT_FOUND`, and a malformed one is rejected without querying the database.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | Pure push-delivery: FCM code classification, witness rule, chunk, report | 1509360 (RED), 41061b8 (GREEN) |
| 2 | PushService.sendToUser and broadcast, best-effort with pruning | 2bb306a (RED), a654532 (GREEN) |
| 3 | registerDevice, unregisterDevice, sendTest and SendTestPushInput | 4991a15 (RED), 3e632e6 (GREEN) |

## TDD evidence

- **Task 1 RED:** `npx jest src/push/push-delivery.spec.ts --selectProjects unit` failed with a module-not-found error for `src/push/push-delivery`. **GREEN:** 30 of 30 passed. Every real FCM code is covered, plus `transport-error`, `push-disabled` and `undefined`.
- **Task 2 RED:** the suite failed to run because the module `src/push/push.service` was missing. **GREEN:** 13 of 13 service tests passed (43 including the delivery spec). They cover SC3 pruning, invalid-argument with and without a witness, the 1 001-token split into 500/500/1, a registry that rejects, a transport that rejects, and a disabled transport.
- **Task 3 RED:** 17 failed with `service.registerDevice/unregisterDevice/sendTest is not a function`, and 13 passed. **GREEN:** 30 of 30 service tests passed, and `npx jest src/push --selectProjects unit` passed 140 of 140.

## Verification

- `npx jest src/push src/config --selectProjects unit`: 13 suites, 216 of 216 passed
- `npx jest src/push --selectProjects integration --runInBand`: 13 of 13 passed (the registry from 05-04 is unchanged)
- `npm run build`: exit 0. `git diff --exit-code src/schema.gql`: exit 0 (no resolver exists yet, so the schema is unchanged)
- ESLint is clean on all 5 files. Prettier was run only on the touched files.
- `grep "'messaging/unavailable'" src/push`: no match. `grep "\.message" src/push/push-delivery.ts`: no match. `hasWitness` appears 4 times.
- `firebase-admin` appears in no non-spec file under `src/push/` outside `src/push/transport/`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Relative imports for test helpers in the unit spec**
- **Found during:** Task 2 GREEN
- **Issue:** The RED spec imported `test/auth/fixed-clock` and `test/push/fake-push-transport` as non-relative paths, which the unit project's jest moduleNameMapper does not resolve. The RED failure was still genuine, because `src/push/push.service` did not exist either.
- **Fix:** Switched to `../../test/...`, the convention the other unit specs use. I also removed an unused `_now` parameter from the in-memory registry fake (an ESLint warning). `jest.fn` still records the `NOW` argument, so the Task 3 assertion that `claim` was called with `NOW` still holds.
- **Commit:** a654532

**2. [Rule 1 - Test bug] Token-leak assertion in the best-effort subscription test**
- **Found during:** Task 3 GREEN
- **Issue:** The token `'tok-a'` is 5 characters, so the permitted 6-character suffix contains the whole token and the "log never contains the token" assertion could not pass.
- **Fix:** The test now uses a long token, `secret-prefix-abcdef`. It asserts that the single WARN contains `…abcdef` and does not contain `secret-prefix`.
- **Commit:** 3e632e6

### Acceptance-grep note (formatting only)

Prettier (printWidth 80, 4-space indent) wraps the signatures of `registerDevice`, `sendTest` and `sendToUser` across several lines, so the one-line `grep -n "async registerDevice(userId: string, input: RegisterPushDeviceInput): Promise<boolean>"`-style checks return 0 for those three. The signatures are exactly the ones the plan specifies. `unregisterDevice` and `broadcast` fit on one line and match. Plan 05-08 should use a multiline-aware check, for example `grep -A3 "async registerDevice("`.

## Known Stubs

None.

## Threat Flags

None. All new surface is covered by T-05-21 to T-05-27.

## Self-Check: PASSED

- All 5 created files exist.
- Commits 1509360, 41061b8, 2bb306a, a654532, 4991a15 and 3e632e6 are present on `feat/05-infrastruttura-push-fcm`.
