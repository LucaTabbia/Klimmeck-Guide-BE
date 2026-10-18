---
phase: 05-infrastruttura-push-fcm
plan: 04
subsystem: push
tags: [push, mongodb, mongoose, registry, unique-index, ttl, concurrency]
requires: ["05-02"]
provides:
  - "PushDevice Mongoose-only model (collection push_devices) with unique (userId, deviceId), unique token and TTL 270 days on lastSeenAt; PUSH_DEVICE_TTL_SECONDS = 23328000"
  - "PushDeviceRegistry: claim(registration, now) -> previous token | null, unregister(userId, deviceId) -> removed token | null, tokensOf(userId), removeTokens(tokens) -> deleted count"
  - "DeviceRegistration interface { userId: Types.ObjectId; deviceId; token; platform }"
  - "PushDeviceIndexVerifier (OnApplicationBootstrap, createIndexes, ERROR log with describeMongoError only)"
affects: [05-05, 05-06, 05-07, 05-08]
tech-stack:
  added: []
  patterns: ["claim = deleteMany other holders ($nor) -> findOneAndUpdate upsert returnDocument before -> one retry on E11000", "boot index verifier that never blocks (TwitchIdIndexVerifier shape)"]
key-files:
  created:
    - src/push/push-device.model.ts
    - src/push/push-device.registry.ts
    - src/push/push-device.registry.int-spec.ts
    - src/push/push-device-index.verifier.ts
    - src/push/push-device-index.verifier.spec.ts
  modified: []
decisions:
  - "tokensOf narrows the distinct() result with a string type guard instead of a cast"
  - "PushDevice has no timestamps: lastSeenAt is the only instant (D-04)"
metrics:
  duration: 5 min
  completed: 2026-10-18
  tasks: 2
  files: 5
---

# Phase 5 Plan 04: Device token registry Summary

The `push_devices` collection now enforces D-01 in the database: a unique index on `(userId, deviceId)`, a unique index on `token`, and a TTL of 270 days (23 328 000 s) on `lastSeenAt`. `PushDeviceRegistry.claim` removes every other holder of the token (`$nor` on the caller's own `(userId, deviceId)`), upserts the caller's row with `returnDocument: 'before'` so it can return the replaced token, and retries once on E11000. `unregister` always filters on `{ userId, deviceId }`, so it is idempotent and can only remove the caller's own device. `userId` is declared as `MongooseSchema.Types.ObjectId`, which avoids Pitfall 8. The model has no `@ObjectType`/`@Field`, and `src/schema.gql` is unchanged. `PushDeviceIndexVerifier` rebuilds the indexes at boot, logs an ERROR if that fails and never blocks startup.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | PushDevice schema + PushDeviceRegistry (race-safe claim) | ad711e7 (RED), 52fe260 (GREEN) |
| 2 | PushDeviceIndexVerifier | dadbc35 (RED), 431d2ef (GREEN) |

## TDD evidence

- **Task 1 RED:** `npx jest src/push/push-device.registry.int-spec.ts --selectProjects integration --runInBand` failed with "Could not locate module src/push/push-device.model" (0 tests ran). **GREEN:** 13 of 13 passed on the MongoMemoryReplSet, including both concurrency cases: 5 parallel claims on one device, and 20 iterations of two users claiming the same token. Indexes are built by `devices.init()` in `beforeAll`. The suite was run 3 more times and passed 13 of 13 each time.
- **Task 2 RED:** `npx jest src/push/push-device-index.verifier.spec.ts --selectProjects unit` failed with "Could not locate module src/push/push-device-index.verifier". **GREEN:** 3 of 3 passed. The E11000 log contains `push_devices` and `MongoServerError, code 11000` but not `tok-secret`.

## Verification

- `npx jest src/push --selectProjects unit`: 7 suites, 80 tests passed.
- `npx tsc --noEmit -p tsconfig.build.json` exited 0. `git diff --exit-code src/schema.gql` exited 0.
- ESLint is clean and Prettier is applied on all 5 files. No `Co-Authored-By` trailer in any commit.

## Deviations from Plan

None. The plan was executed as written. Minor notes:
- `tokensOf` uses a `typeof === 'string'` type guard on the `distinct` result instead of a cast. The plan allowed a documented cast.
- `isDuplicateKeyError` appears on 2 lines of the registry (the import and the use), not 1 as the acceptance grep says. Behaviour is as specified.

## Known Stubs

None. The registry and the verifier are not registered in a module yet. PushModule wires them in 05-05/05-06.

## Threat Flags

None. T-05-15..20 are mitigated as planned and tested: the token moves to its new owner under concurrency, there is always exactly one row (never 0), `userId` is stored as an ObjectId, `unregister` is scoped to the owner, the verifier logs only the error name and code, and there is no GraphQL type.

## Self-Check: PASSED
