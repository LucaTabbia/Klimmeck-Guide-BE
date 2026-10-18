---
phase: 05-infrastruttura-push-fcm
plan: 06
subsystem: push
tags: [push, fcm, graphql, resolver, module, audit, roles, startup-report]
requires: ["05-01", "05-03", "05-04", "05-05"]
provides:
  - "PushStartupReporter (OnApplicationBootstrap): WARN when push is disabled (mentions FIREBASE_SERVICE_ACCOUNT and PUSH_DISABLED), LOG with only the Firebase projectId when enabled"
  - "PushModule (leaf, not @Global): providers pushConfigProvider, Clock->SystemClock, pushTransportProvider, PushDeviceRegistry, PushDeviceIndexVerifier, PushService, PushResolver, PushStartupReporter; exports [PushService]"
  - "PushResolver: registerPushDevice(input: RegisterPushDeviceInput!): Boolean!, unregisterPushDevice(deviceId: String!): Boolean!, sendTestPush(input: SendTestPushInput!): PushDeliveryReport! (@Roles(innkeeper))"
  - "PushDeliveryReport @ObjectType { targeted, sent, pruned, failed: Int! }"
affects: [05-07, 05-08]
tech-stack:
  added: []
  patterns: ["bearer-only identity via @CurrentUser (no userId argument)", "@Roles(innkeeper) + global AdminAuditInterceptor for the GM tool", "wire int-spec on createCharactersTestApp with PushTransport/PUSH_CONFIG overrides"]
key-files:
  created:
    - src/push/push-startup.reporter.ts
    - src/push/push-startup.reporter.spec.ts
    - src/push/push.resolver.ts
    - src/push/push.module.ts
    - src/push/push.resolver.int-spec.ts
    - src/push/dto/push-delivery-report.model.ts
  modified: []
decisions:
  - "PushModule registers User locally through MongooseModule.forFeature, so consumers do not pull UsersModule and its change stream"
  - "The int-spec shares one module-level createPushTestApp(transport), callOn and errorCodeOf between the two describes instead of duplicating the harness setup"
metrics:
  duration: 9 min
  completed: 2026-10-18
  tasks: 3
  files: 6
---

# Phase 5 Plan 06: Push GraphQL surface and PushModule Summary

`PushModule` is a leaf module that exports `PushService`. `PushResolver` exposes three mutations. `registerPushDevice` and `unregisterPushDevice` take the identity from the bearer only. `sendTestPush` is restricted to the innkeeper role and is audited in `admin_audit_logs` with target `{ type: 'PushDeliveryReport', id: null }`. At boot, `PushStartupReporter` logs a WARN when push is disabled, or a LOG with only the Firebase `project_id` when it is enabled. The module is not mounted in `AppModule` yet, and `src/schema.gql` is unchanged; both are plan 05-07.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | PushStartupReporter (WARN when disabled, LOG with project_id, no secrets) | 34f6ef6 (RED), faaf763 (GREEN) |
| 2 | PushModule + registerPushDevice / unregisterPushDevice on the wire | 8601618 (RED), f2ed138 (GREEN) |
| 3 | sendTestPush innkeeper-only, PushDeliveryReport and audit on the wire | 5f6a4c9 (RED), debccd7 (GREEN) |

## TDD evidence

- **Task 1 RED:** the suite failed to run because `src/push/push-startup.reporter` did not exist. **GREEN:** 2 of 2 passed. The enabled case asserts that the logged output contains no client email, no `SECRETKEYMATERIAL` and no `PRIVATE KEY`.
- **Task 2 RED:** the suite failed to run because `src/push/push.module` did not exist. **GREEN:** 13 of 13 passed on the replica set. The tests cover SC1 (re-registration refreshes `lastSeenAt` and keeps one row), token replacement with unsubscribe of the old token, a token moving to a new owner, concurrent registration of the same device, `PUSH_INVALID_DEVICE_ID` / `PUSH_INVALID_TOKEN`, `UNAUTHENTICATED` without a bearer and for a deleted user, best-effort topic management, idempotent unregister scoped to the caller, and introspection showing no token/device field on `User` and no `PushDevice` type.
- **Task 3 RED:** 7 failed with `GRAPHQL_VALIDATION_FAILED` (`Unknown type "SendTestPushInput"`, `Cannot query field "sendTestPush"`) and the 13 Task 2 tests still passed. **GREEN:** 20 of 20 passed. The tests cover `FORBIDDEN` for an adventurer with no audit record and nothing sent, the default target with an `outcome: 'ok'` audit record, SC3 end to end (`{ targeted: 2, sent: 1, pruned: 1, failed: 1 }` and the dead token removed from Mongo), a target with no devices, `NOT_FOUND` for both a missing and a malformed target (audited), the `streamerLive` topic broadcast that ignores the target, and `PUSH_DISABLED` (audited).

## Verification

- `npx jest src/push --selectProjects integration --runInBand`: 2 suites, 33 of 33 passed
- `npx jest src/push src/config --selectProjects unit`: 14 suites, 218 of 218 passed
- `npm run build`: exit 0. `git diff --exit-code src/schema.gql`: exit 0
- ESLint is clean on all 6 files. Prettier was run only on the touched files.
- `@Roles(RoleType.innkeeper)` sits directly above `@Mutation(() => PushDeliveryReport)`. `@Field(() => Int)` appears 4 times. `clientEmail|privateKey` does not appear in the reporter. There is no `jest.mock` in the int-spec.

## Deviations from Plan

### Boy Scout (test-only, no behaviour change)

**1. Shared int-spec helpers**
- **Found during:** Task 3 RED
- **Issue:** The second describe would have repeated the harness setup, `call` and `errorCodeOf` from the first one.
- **Fix:** I hoisted `createPushTestApp(transport)` (which holds the `PushTransport` / `PUSH_CONFIG` overrides), `callOn` and `errorCodeOf` to module level. The overrides grep (`{ token: PushTransport, useValue: transport }`) still matches exactly one line.
- **Commit:** 5f6a4c9

Otherwise the plan was executed as written.

## Known Stubs

None.

## Threat Flags

None. All new surface is covered by T-05-28 to T-05-33.

## Self-Check: PASSED

- All 6 created files exist.
- Commits 34f6ef6, faaf763, 8601618, f2ed138, 5f6a4c9 and debccd7 are present on `feat/05-infrastruttura-push-fcm`.
