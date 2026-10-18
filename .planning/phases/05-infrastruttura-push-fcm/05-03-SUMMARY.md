---
phase: 05-infrastruttura-push-fcm
plan: 03
subsystem: push
tags: [push, fcm, firebase-admin, transport, port-adapter, apns, android]
requires: ["05-01", "05-02"]
provides:
  - "PushTransport abstract class (DI token) with TokenDeliveryOutcome, TopicDeliveryOutcome, FCM_MULTICAST_LIMIT=500, PUSH_DISABLED_CODE, TRANSPORT_ERROR_CODE"
  - "NoopPushTransport (enabled=false, every outcome push-disabled)"
  - "FakePushTransport in test/push (records sent/topicSends/subscriptions/unsubscriptions; failToken/failTopicSend/failTopicManagement/reset)"
  - "toFcmBase(message, now): pure data-only FCM serializer (Android high + ttl ms, APNs background priority 5 + absolute expiration)"
  - "FcmPushTransport(messaging, clock) + static connect(account, clock) on named app FCM_APP_NAME='klimmeck-push'"
  - "pushTransportProvider (inject PUSH_CONFIG + Clock → FCM or no-op)"
affects: [05-04, 05-05, 05-06, 05-07, 05-08]
tech-stack:
  added: []
  patterns: ["port as abstract class DI token (Clock/TwitchOAuthClient shape)", "Messaging injected through the constructor so unit tests pass a plain stub", "offline connect() test with a runtime RSA key and deleteApp in afterAll"]
key-files:
  created:
    - src/push/transport/push-transport.ts
    - src/push/transport/noop-push-transport.ts
    - src/push/transport/noop-push-transport.spec.ts
    - test/push/fake-push-transport.ts
    - src/push/transport/fcm-message.ts
    - src/push/transport/fcm-message.spec.ts
    - src/push/transport/fcm-push-transport.ts
    - src/push/transport/fcm-push-transport.spec.ts
    - src/push/transport/push-transport.provider.ts
  modified: []
decisions:
  - "FcmPushTransport never throws on sends: a rejected or synchronously thrown call becomes one failed outcome per token with the string error.code, or transport-error when no string code is present"
  - "Per-token topic-management failures are logged as WARN with operation, topic, count and codes only; a whole-call rejection propagates (PushService handles it best-effort in 05-05)"
  - "Fake outcomes for delivered tokens omit the errorCode key; the FCM adapter sets errorCode: undefined. toEqual treats both the same"
metrics:
  duration: 4 min
  completed: 2026-10-18
  tasks: 3
  files: 9
---

# Phase 5 Plan 03: Push transport port and FCM adapter Summary

The push domain now reaches FCM only through the `PushTransport` port. `pushTransportProvider` picks `FcmPushTransport` when a service account is configured and `NoopPushTransport` otherwise. `toFcmBase` builds a data-only message for both platforms: string-only `data` with `type,title,body,sentAt[,id]`, Android `priority: 'high'` with the TTL in milliseconds, and APNs `background` with priority `5`, an absolute epoch-second `apns-expiration` and an `aps` that only sets `content-available`. The adapter returns a per-token outcome by index and never throws on a send. No test contacts firebase-admin.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | PushTransport port, NoopPushTransport, FakePushTransport | a1fe3f3 (RED), 6632fc9 (GREEN) |
| 2 | toFcmBase data-only serializer | e6892c3 (RED), ffd2d7b (GREEN) |
| 3 | FcmPushTransport + pushTransportProvider | 3c981c2 (RED), f41fbfc (GREEN) |

## TDD evidence

- **Task 1 RED:** `npx jest src/push/transport/noop-push-transport.spec.ts --selectProjects unit` failed with "Could not locate module src/push/transport/noop-push-transport" (0 tests ran). **GREEN:** 10 of 10 passed.
- **Task 2 RED:** `fcm-message.spec.ts` failed with "Could not locate module src/push/transport/fcm-message". **GREEN:** 9 of 9 passed.
- **Task 3 RED:** `fcm-push-transport.spec.ts` failed with "Could not locate module src/push/transport/fcm-push-transport". **GREEN:** 17 of 17 passed. `npx jest src/push --selectProjects unit` passed 6 suites and 77 tests.

## Verification

- `npx jest src/push src/config --selectProjects unit` passed 10 suites and 153 tests.
- `npm run build` exited 0. `npx tsc --noEmit -p tsconfig.build.json` exited 0. `git diff --exit-code src/schema.gql` exited 0.
- `--detectOpenHandles` on the FCM spec reported no open handles. The `connect()` tests use a 2048-bit RSA key generated at runtime and call `deleteApp` in `afterAll`. Calling `connect()` twice leaves exactly one app named `klimmeck-push`.
- `grep -rn "from 'firebase-admin'\|MessagingClientErrorCode\|MessagingErrorCode\|DataMessagePayload\|jest.mock" src/push test/push` returned nothing. Only the modular imports `firebase-admin/app` and `firebase-admin/messaging` are used, and `fcm-message.ts` imports types only.
- A dedicated spec checks that the topic-management WARN contains the FCM codes and none of the tokens (T-05-10).
- ESLint is clean on all 9 files, and Prettier is applied to each of them.
- No `Co-Authored-By` trailer in any commit.

## Deviations from Plan

None. The plan was executed as written. Minor notes:
- `NoopPushTransport` methods leave out the unused parameters. TypeScript accepts the narrower signatures, and dropping them avoids no-unused-vars warnings.
- The subscribe and unsubscribe specs share one `describe.each`, so both operations are covered by the same three cases.

## Known Stubs

None. `pushTransportProvider` is not registered in a module yet. PushModule wires it in a later plan (05-05/05-06).

## Threat Flags

None. T-05-10..13 are mitigated as planned: WARN logs carry codes only, sends catch both rejections and synchronous throws, the payload is data-only with no `notification`, and FCM is chosen only when a service account is present and is tested offline.

## Self-Check: PASSED
