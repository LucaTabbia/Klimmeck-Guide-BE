---
phase: 02-auth-identity-foundation
plan: 01
subsystem: auth
tags: [auth, config, fail-closed, jwt, pkce, mongoose, upsert]
requires: []
provides:
  - "src/auth primitives: AuthErrorCode, AuthException, AuthIdentity, Clock/SystemClock, @Public, @CurrentUser"
  - "src/auth/crypto/token-crypto: generateOpaqueToken, sha256Hex, s256Challenge, safeEqual, CODE_CHALLENGE_PATTERN, CODE_VERIFIER_PATTERN"
  - "src/auth/token/token-audiences: TOKEN_ISSUER, ACCESS_TOKEN_AUDIENCE, OAUTH_STATE_AUDIENCE"
  - "src/config/auth-config: AuthConfig, AUTH_CONFIG, parseAuthConfig, readAuthEnv, authConfigProvider, TTL constants"
  - "src/config/env.validation: validateEnv wired into ConfigModule.forRoot"
  - "UsersService.findOrCreateByTwitchId / upsertWithRole + unique index on User.twitchId"
  - "test helpers: test/auth/test-auth-config.ts (buildTestAuthConfig), test/auth/fixed-clock.ts (FixedClock)"
  - ".env.example"
affects: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07, 02-08, 02-09]
tech-stack:
  added: ["@nestjs/jwt@11.0.2", "graphql-ws@6.0.6 (exact)", "@apollo/server@^4.12.2 (now declared)", "ws@^8.18.3 (dev)", "@types/ws@^8.18.2 (dev)"]
  patterns: ["fail-closed config parsed once at boot (pure parseAuthConfig)", "Clock abstraction as DI token", "atomic findOneAndUpdate upsert + single retry on E11000", "constant-time compare on SHA-256 digests"]
key-files:
  created:
    - src/auth/auth-error-code.enum.ts
    - src/auth/auth.exception.ts
    - src/auth/auth.exception.spec.ts
    - src/auth/auth-identity.ts
    - src/auth/clock.ts
    - src/auth/decorators/public.decorator.ts
    - src/auth/decorators/current-user.decorator.ts
    - src/auth/crypto/token-crypto.ts
    - src/auth/crypto/token-crypto.spec.ts
    - src/auth/token/token-audiences.ts
    - src/config/auth-config.ts
    - src/config/auth-config.spec.ts
    - src/config/env.validation.ts
    - src/config/env.validation.spec.ts
    - src/users/users.service.int-spec.ts
    - test/auth/test-auth-config.ts
    - test/auth/fixed-clock.ts
    - .env.example
  modified:
    - package.json
    - package-lock.json
    - .prettierrc
    - src/main.ts
    - src/app.module.ts
    - src/models/user.model.ts
    - src/users/users.service.ts
decisions:
  - "readAuthEnv keeps only scalar values (string/number/boolean) before String(): avoids [object Object] coercion (eslint no-base-to-string) and is a strict superset of the planned undefined/null filter"
  - "parseAuthConfig validates JWT_SECRET first, then APP_AUTH_REDIRECT_URL, Twitch, dev bypass; the dev-bypass production check sits inside parseDevAuthConfig and only fires when DEV_AUTH_ENABLED === 'true'"
  - "BE does not read DEV_AUTH_USER_ID (present in the FE stub .env.example): the BE derives userId from upsertWithRole(DEV_AUTH_TWITCH_ID, DEV_AUTH_ROLE)"
metrics:
  duration: "~7 min"
  completed: 2026-10-06
  tasks: 3
  files: 25
---

# Phase 2 Plan 01: Auth foundation primitives, fail-closed config and User identity store Summary

Shared auth contracts (AuthException with GraphQL `extensions.code`, `@Public`/`@CurrentUser`, `Clock`, RFC 7636 S256 + constant-time crypto helpers), boot-time fail-closed `validateEnv`/`parseAuthConfig` (JWT_SECRET >= 32, dev bypass refused in production, Twitch optional, deep-link-only redirect), `.env.example`, and an atomic `twitchId`-unique user upsert proven under concurrency on the replSet.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Dependencies, prettier tabWidth 4, auth primitives + crypto helpers | `6480d25` chore deps, `c1d4a37` chore prettier, `8aacb4e` test (RED), `240916d` feat (GREEN) |
| 2 | Fail-closed config (parseAuthConfig + validateEnv), boot wiring, .env.example | `423988e` test (RED), `15c856b` feat (GREEN) |
| 3 | User identity store: unique twitchId + atomic upserts | `4a4e0b6` test (RED), `ea94a00` feat (GREEN) |

TDD: every RED commit was run and failed for the right reason (missing modules / `findOrCreateByTwitchId is not a function` / duplicate insert resolved instead of rejecting) before the GREEN commit.

## Verification

- `npx tsc --noEmit -p tsconfig.build.json` — clean
- `npx eslint` on every touched file — 0 errors, 0 warnings
- `npm test`:
  - unit: **7 suites, 67 tests passed, 0 failed**
  - integration (runInBand, MongoMemoryReplSet): **5 suites, 14 tests passed, 0 failed**
- Plan-specific: `src/auth` 17 tests, `src/config` 32 tests, `src/users/users.service.int-spec.ts` 6 tests — all green
- `npm ls graphql-ws` → single copy `graphql-ws@6.0.6` (deduped with `@nestjs/graphql`); `@nestjs/jwt@11.0.2`
- `git check-ignore .env.example` → exit 1 (tracked); no `APP_DEEP_LINK_SCHEME` anywhere
- Boot smoke test: `JWT_SECRET=short ts-node src/main.ts` → logs `JWT_SECRET is required and must be at least 32 characters` and exits with code 1 (no secret value in the message)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `readAuthEnv` stringification of non-scalar values**
- **Found during:** Task 2
- **Issue:** `String(value)` on an `unknown` triggered `@typescript-eslint/no-base-to-string` (objects would become `[object Object]`).
- **Fix:** private `isEnvScalar` guard (string/number/boolean) instead of the `!== undefined && !== null` check. Planned behavior (drop undefined/null, stringify booleans) unchanged and tested.
- **Files modified:** src/config/auth-config.ts
- **Commit:** 15c856b

**2. [Rule 3 - Blocking] Import path for fixtures in `src/users/users.service.int-spec.ts`**
- **Issue:** Jest only maps `^src/`; `test/fixtures` is not resolvable as an absolute import.
- **Fix:** relative `../../test/fixtures`, same as existing `src/characters/*.spec.ts`.
- **Commit:** 4a4e0b6

### Notes (not deviations)

- The plan's verify commands `npx jest --selectProjects unit <paths>` do not filter: `--selectProjects` is variadic and swallows the paths as project names, so the whole project runs. Use `npx jest <paths> --selectProjects unit` instead.
- On boot failure, Nest's own `ExceptionHandler` logs the error and exits with code 1 before the `bootstrap().catch` handler runs; the catch in `main.ts` remains as a safety net for failures after `NestFactory.create` (e.g. `listen`).
- `app.module.ts` keeps relative imports (file convention); `validateEnv` imported as `./config/env.validation`. The file was reformatted to 4 spaces / single quotes by prettier (Boy Scout, as planned).
- `.prettierrc` now has `tabWidth: 4`: many pre-existing 2-space files will show `prettier/prettier` errors when touched; out of scope here, reformat only files a plan touches.

## Known Stubs

None. `@CurrentUser` returns `req.user`, which is populated by the guard in 02-07 (planned).

## Threat Flags

None — all surface is in the plan's threat model (T-2-bypass-prod, T-2-weak-secret, T-2-open-redirect, T-2-secret-leak, T-2-timing, T-2-dup-identity mitigated and tested; T-2-role-escalation accepted, out of scope).

## Notes for next plans

- Import contracts exactly as in the plan's `<interfaces>` block; `AuthIdentity`/`AuthConfig` are interfaces → use `import type` when used in decorated signatures (TS1272).
- `authConfigProvider` is exported but not yet registered in any module: the AuthModule (later plan) must add it to `providers` and `{ provide: Clock, useClass: SystemClock }`.
- Any test that boots `AppModule` (e.g. `test/app.e2e-spec.ts`, future e2e) now needs `JWT_SECRET` (>= 32 chars) in `process.env`, otherwise `ConfigModule.forRoot` rejects.
- `FixedClock` default start = real now (keeps Mongo TTL indexes from reaping documents mid-test).
- `UsersService.create/update` still accept `role`/`twitchId` from clients (T-2-role-escalation, Phase 3).

## Self-Check: PASSED

- All 18 created files and 7 modified files present on disk.
- Commits found: 6480d25, c1d4a37, 8aacb4e, 240916d, 423988e, 15c856b, 4a4e0b6, ea94a00.
