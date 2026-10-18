---
phase: 05-infrastruttura-push-fcm
plan: 01
subsystem: config
tags: [firebase-admin, fcm, config, secrets, fail-closed]
requires: []
provides:
  - "PUSH_CONFIG / pushConfigProvider (PushConfig { serviceAccount: FirebaseServiceAccount | null })"
  - "parsePushConfig / readPushEnv / PUSH_ENV_KEYS"
  - "readEnvKeys shared helper (src/config/env-keys.ts)"
  - "validateEnv refuses production boot without FIREBASE_SERVICE_ACCOUNT"
affects: [05-02, 05-03, 05-04, 05-05, 05-06, 05-07, 05-08]
tech-stack:
  added: ["firebase-admin@14.5.0"]
  patterns: ["pure fail-closed env parser with fixed error messages", "test keys generated at runtime via generateKeyPairSync"]
key-files:
  created:
    - src/config/env-keys.ts
    - src/config/env-keys.spec.ts
    - src/config/push-config.ts
    - src/config/push-config.spec.ts
  modified:
    - package.json
    - package-lock.json
    - .gitignore
    - .env.example
    - src/config/auth-config.ts
    - src/config/env.validation.ts
    - src/config/env.validation.spec.ts
decisions:
  - "FIREBASE_SERVICE_ACCOUNT parser emits only fixed messages naming variable/field; JSON.parse and createPrivateKey errors are swallowed, never forwarded"
  - "readAuthEnv and readPushEnv share readEnvKeys (Boy Scout, separate refactor commit)"
  - "validateEnv runs auth first, then push, so existing auth-first error expectations stay intact"
metrics:
  duration: 6 min
  completed: 2026-10-18
  tasks: 3
  files: 11
---

# Phase 5 Plan 01: Push config foundations Summary

firebase-admin 14.5.0 installed (Node >= 22 required), and the base64 `FIREBASE_SERVICE_ACCOUNT` service account is now parsed fail-closed at boot. Production refuses to start without it, development and test start with push disabled (`serviceAccount: null`), and no error message ever echoes the value or the private key.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | firebase-admin 14, engines Node >= 22, .gitignore service account | e752d62 |
| 2 | readEnvKeys + parsePushConfig fail-closed | 36c0295 (RED), 31896bb (GREEN), fd73014 (REFACTOR auth-config), 689b6b0 (spec: inline fake PEM marker) |
| 3 | validateEnv + .env.example | 9171734 (RED), ff5e30f (GREEN) |

## TDD evidence

- **Task 2 RED:** `npx jest src/config --selectProjects unit` → `FAIL src/config/env-keys.spec.ts` and `FAIL src/config/push-config.spec.ts`, both with "Could not locate module src/config/env-keys / src/config/push-config". The 56 existing tests stayed green.
- **Task 2 GREEN:** 4 suites, 72 tests passed. The auth-config refactor left `auth-config.spec.ts` (including `readAuthEnv`) green.
- **Task 3 RED:** `env.validation.spec.ts` had 3 failed and 8 passed: production without the variable did not throw, malformed base64 was not rejected, and `.env.example` had no `FIREBASE_SERVICE_ACCOUNT`.
- **Task 3 GREEN:** `npx jest src/config --selectProjects unit` passed 76 of 76.

## Verification

- `npm ls firebase-admin` returned `firebase-admin@14.5.0`. `require('firebase-admin/app')` and `require('firebase-admin/messaging')` both loaded.
- `git check-ignore` matched the adminsdk, service-account and serviceAccount sample names. `git ls-files | grep -iE 'service-?account|adminsdk'` returned nothing.
- `npm run build` exited 0, and `git diff --exit-code src/schema.gql` reported no change.
- `git grep "BEGIN PRIVATE KEY" -- src test` matches a single line, the fake `SECRETKEYMATERIAL` PEM in the spec.
- No `Co-Authored-By` trailer in any plan commit.

## Deviations from Plan

1. **[Rule 1 - acceptance alignment] Fake PEM marker inlined** (689b6b0). The spec had built the invalid PEM from a `LEAK_MARKER` constant, so the acceptance grep (every `BEGIN PRIVATE KEY` line must contain `SECRETKEYMATERIAL`) could not match it. I put the literal inline in its own `test(config)` commit. Behaviour is unchanged.
2. **Minor structure:** `parsePushConfig` is split into small helpers (`disabledPushConfig`, `decodeServiceAccount`, `requireServiceAccountFields`, `assertPemPrivateKey`). The messages and rules are exactly the ones in RESEARCH §1, and the typed `ServiceAccountJson` return removes the `as string` casts.
3. The refactor was committed separately (`refactor(config)`) instead of being folded into `feat`, as the plan allowed.

Note: `npx tsc --noEmit -p tsconfig.json` reports existing "Cannot find name 'describe'" errors on spec files, a baseline issue with the jest types in the root tsconfig. ts-jest and `nest build` are clean. This is out of scope and was not touched.

## Known Stubs

None. `pushConfigProvider` is exported but not yet registered in any module; the later wave-2 plans wire it in (PushModule).

## Self-Check: PASSED
