---
phase: 05-infrastruttura-push-fcm
plan: 02
subsystem: push
tags: [push, fcm, graphql-enum, validation, error-codes, catalog]
requires: []
provides:
  - "PushPlatform { android, ios } and PushEventType { travelEnd, questEnd, streamerLive } (registerEnumType, not yet in schema)"
  - "PushErrorCode + PushException (invalidDeviceId 400, invalidToken 400, disabled 503) with extensions.code"
  - "RegisterPushDeviceInput (deviceId, token, platform; no userId)"
  - "validateRegisterPushDeviceInput / assertValidDeviceId / DEVICE_ID_MAX_LENGTH / PUSH_TOKEN_MAX_LENGTH"
  - "PushMessage, STREAMER_LIVE_TOPIC, travelEnd/questEnd/streamerLive builders, testPushMessage"
affects: [05-03, 05-04, 05-05, 05-06, 05-07, 05-08]
tech-stack:
  added: []
  patterns: ["typed HttpException with extensions.code (CharacterDeletionException shape)", "exhaustive Record<PushEventType, …> catalog as single source of copy and TTL"]
key-files:
  created:
    - src/push/push-platform.enum.ts
    - src/push/push-event-type.enum.ts
    - src/push/push-error-code.enum.ts
    - src/push/push.exception.ts
    - src/push/push.exception.spec.ts
    - src/push/dto/register-push-device.input.ts
    - src/push/push-device-input.validator.ts
    - src/push/push-device-input.validator.spec.ts
    - src/push/push-message.ts
    - src/push/push-events.ts
    - src/push/push-events.spec.ts
  modified: []
decisions:
  - "PushException extends HttpException directly (400 and 503 in one class); PushErrorCode has no registerEnumType because codes travel in extensions.code"
  - "Device validation order is fixed: deviceId first, then token; assertValidDeviceId exported for unregisterPushDevice (05-05)"
  - "testPushMessage attaches the id only for travelEnd/questEnd and only when non-empty; streamerLive never carries an id"
metrics:
  duration: 4 min
  completed: 2026-10-18
  tasks: 3
  files: 11
---

# Phase 5 Plan 02: Push domain contracts Summary

The push domain now has pure contracts, with no database and no firebase-admin: GraphQL enums `PushPlatform` and `PushEventType`, typed `PushException` errors with stable `extensions.code` values and Italian messages, a single authoritative validator for `deviceId` and `token`, and a typed event catalog that fixes the copy, the TTL (1 h for personal events, 15 min for broadcast) and the message shape (`type,title,body,ttlSeconds[,id]`, never game state).

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | Push enums + PushException | 2fe06c3 (RED), 9f58aae (GREEN) |
| 2 | RegisterPushDeviceInput + validator | 3a1420d (RED, spec + DTO), 9884b89 (GREEN) |
| 3 | PushMessage + event catalog | 4810797 (RED), a3617bf (GREEN) |

## TDD evidence

- **Task 1 RED:** `npx jest src/push/push.exception.spec.ts --selectProjects unit` failed with `Could not locate module src/push/push-error-code.enum` (1 suite failed, 0 tests). **GREEN:** 5 of 5 passed.
- **Task 2 RED:** `push-device-input.validator.spec.ts` failed with `Could not locate module src/push/push-device-input.validator`. **GREEN:** 22 of 22 passed, covering the 0/1/128/129 and 4096/4097 boundaries, `$where`, whitespace, emoji, `/`, and the deviceId-before-token order.
- **Task 3 RED:** `push-events.spec.ts` failed with `Could not locate module src/push/push-events`. **GREEN:** `npx jest src/push --selectProjects unit` passed 3 suites and 41 tests.

## Verification

- `npx tsc --noEmit -p tsconfig.build.json` exited 0.
- `git diff --exit-code src/schema.gql` exited 0, so the enums are not yet in the schema.
- Nothing under `src/push/` imports `firebase-admin` or `mongoose`.
- ESLint is clean on all 11 files, and Prettier left them unchanged.
- All acceptance greps match: 3 static factories, `this.extensions = { code }`, the 3 Italian messages, no `registerEnumType` in the error-code enum, no `userId` in the DTO, 3 `@Field`, the `Record<PushEventType, CatalogEntry>` catalog, and the 4 builder exports.
- No `Co-Authored-By` trailer in any commit.

## Deviations from Plan

1. **[Rule 1 - Bug] it.each title in push.exception.spec.ts.** The prescribed row `[factory, builder, status, …]` with the title `'%s is a %i with code %s …'` printed `NaN`, because `%i` received the builder function. I moved the builder to the end of each row and used the title `'%s is a %i %s with code %s and an italian message'`, which renders as "invalidDeviceId is a 400 Bad Request with code PUSH_INVALID_DEVICE_ID …". The assertions are unchanged. This went into the GREEN commit 9f58aae.
2. **[Rule 1 - Lint] push-events.spec.ts.** An unused destructured `_builderId` raised an ESLint warning. The spec now compares the catalog fields (`type/title/body/ttlSeconds`) explicitly. This went into the GREEN commit a3617bf.
3. Task 2 RED commit included the DTO as the plan prescribed ("serve per compilare").

## Known Stubs

None. The enums and DTO are not yet attached to a resolver; plans 05-06 and 05-07 wire them in.

## Threat Flags

None. T-05-06..09 are mitigated as planned by the validator spec, the catalog key-set spec, the fixed exception messages and the DTO without `userId`.

## Self-Check: PASSED
