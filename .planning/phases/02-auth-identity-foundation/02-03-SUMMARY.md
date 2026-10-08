---
phase: 02-auth-identity-foundation
plan: 03
subsystem: auth
tags: [auth, jwt, dev-bypass, fail-closed, graphql-ws, identity-seam]
requires:
  - "02-01: AuthIdentity, AuthException, token audiences, safeEqual, AUTH_CONFIG/AuthConfig, UsersService.upsertWithRole, buildTestAuthConfig"
provides:
  - "src/auth/token/access-token.service: AccessTokenService (sign / verify), AccessTokenSubject, SignedAccessToken"
  - "src/auth/bearer-token: extractBearerToken"
  - "src/auth/dev/dev-auth.strategy: DevAuthStrategy.tryResolve"
  - "src/auth/auth-identity.resolver: AuthIdentityResolver.resolveBearer (single bearer → AuthIdentity seam)"
  - "src/auth/ws/ws-close-codes: WS_FORBIDDEN_CLOSE_CODE, WS_TOKEN_EXPIRED_CLOSE_CODE, WS_TOKEN_EXPIRED_REASON"
  - "src/auth/ws/ws-connection-authenticator: WsConnectionAuthenticator (onConnect / onClose), AuthenticatedWsExtra, WsConnectionContext"
affects: [02-05, 02-06, 02-07, 02-08]
tech-stack:
  added: []
  patterns: ["secret/audience/issuer passed per JWT call (AUTH_CONFIG single source)", "claims shape validated after signature check", "dev bypass fail-closed twice (config null + runtime NODE_ENV)", "memoized stub-user promise reset on failure", "graphql-ws onConnect never throws (false → 4403)", "per-socket unref'd expiry timer closing 4401"]
key-files:
  created:
    - src/auth/token/access-token.service.ts
    - src/auth/token/access-token.service.spec.ts
    - src/auth/bearer-token.ts
    - src/auth/bearer-token.spec.ts
    - src/auth/dev/dev-auth.strategy.ts
    - src/auth/dev/dev-auth.strategy.spec.ts
    - src/auth/dev/dev-auth.strategy.int-spec.ts
    - src/auth/auth-identity.resolver.ts
    - src/auth/auth-identity.resolver.spec.ts
    - src/auth/ws/ws-close-codes.ts
    - src/auth/ws/ws-connection-authenticator.ts
    - src/auth/ws/ws-connection-authenticator.spec.ts
  modified: []
decisions:
  - "DevAuthStrategy maps userId with String(user._id): UserDocument is `User & Document` so _id is unknown (no .toString() typing) and user.id is any (no-unsafe-assignment); src/models/user.model.ts is out of this plan's scope"
  - "scheduleExpiryClose / readAuthorization are module-level pure functions instead of private methods (no instance state needed)"
  - "WS comment avoids the literal word 'throw' so the acceptance grep (no throw in the file) is meaningful"
metrics:
  duration: "~10 min"
  completed: 2026-10-06
  tasks: 3
  files: 12
---

# Phase 2 Plan 03: Identity seam, fail-closed dev bypass and WS connection auth Summary

HS256 session JWT (`sub`/`twitchId`/`role`/`sid`, aud `klimmeck-api`, iss `klimmeck-guide-be`, 900 s) with strict verification, strict `Bearer` extraction, a dev bypass that resolves a constant-time-compared static token to a real DB user only when configured and `NODE_ENV !== 'production'` at runtime, a single `AuthIdentityResolver` (dev first, then JWT) for every transport, and a graphql-ws authenticator that never throws and closes live sockets with 4401 `Token expired` at JWT expiry.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | AccessTokenService + extractBearerToken | `aff1a75` test (RED), `755fdad` feat (GREEN) |
| 2 | DevAuthStrategy + AuthIdentityResolver | `b2a263c` test (RED), `10764c0` feat (GREEN) |
| 3 | WsConnectionAuthenticator + close codes | `30a787c` test (RED), `61e017c` feat (GREEN) |

TDD: each RED commit was run and failed for the right reason (`Could not locate module src/auth/...`) before GREEN.

## Verification

- `npx tsc --noEmit -p tsconfig.build.json` — clean
- `npx eslint src/auth` — 0 errors, 0 warnings
- Plan specs: token + bearer 25/25, dev unit + resolver 12/12, dev integration 2/2, ws 10/10
- `npm test`:
  - unit: **12 suites, 114 tests passed, 0 failed**
  - integration (runInBand, MongoMemoryReplSet): **8 suites, 38 tests passed, 0 failed**
- Acceptance greps: `algorithms: ['HS256']`, `audience: ACCESS_TOKEN_AUDIENCE`, `issuer: TOKEN_ISSUER`, `expiresIn: this.config.accessTokenTtlSeconds`; spec has `OAUTH_STATE_AUDIENCE` and `alg: 'none'`; dev strategy has `process.env.NODE_ENV === 'production'`, `safeEqual(`, `upsertWithRole(`, no `===` token comparison; resolver calls `tryResolve(` before `verify(`; ws file has `return false`, `clearTimeout`, `unref()`, no `throw`; close codes 4401/4403/`'Token expired'`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `user.id` / `user._id.toString()` do not type-check on `UserDocument`**
- **Found during:** Task 2 (GREEN)
- **Issue:** `UserDocument = User & Document` leaves `_id` as `unknown` (TS18046) and `id` as `any` (eslint no-unsafe-assignment).
- **Fix:** `userId: String(user._id)` (same hex string). The unit mock returns a real `Types.ObjectId` as `_id` instead of `{ id: 'u1' }`.
- **Files modified:** src/auth/dev/dev-auth.strategy.ts, src/auth/dev/dev-auth.strategy.spec.ts
- **Commit:** 10764c0, b2a263c

**2. [Rule 1 - Lint] unused destructured `_sid` in access token spec**
- **Fix:** the "no sid" case signs `{ ...VALID_CLAIMS, sid: undefined }` (dropped by JSON serialization).
- **Commit:** 755fdad

### Notes (not deviations)

- Verify commands were run as `npx jest <paths> --selectProjects …` (the plan's order ignores the paths).
- The integration spec relies on the global `afterEach` in `test/setup/after-env.ts` that empties every collection; no extra cleanup needed.

## Known Stubs

None. The four providers are not yet registered in a module: AuthModule (02-05) wires them, GraphQL/WS (02-06) consumes them.

## Threat Flags

None — all surface is in the plan's threat model (T-2-token-confusion, T-2-bypass-prod, T-2-timing, T-2-ws-unauth, T-2-ws-error-leak, T-2-ws-expiry, T-2-log-leak mitigated and tested; T-2-dev-token-static accepted). No logging of bearer or dev token anywhere in the new files.

## Notes for next plans

- AuthModule (02-05) must provide `AccessTokenService` (needs `JwtModule.register({})` — the secret is passed per call), `DevAuthStrategy` (needs `UsersService` → import `UsersModule`), `AuthIdentityResolver`, `WsConnectionAuthenticator`, plus `authConfigProvider`.
- 02-06: wire `subscriptions['graphql-ws'] = { onConnect: (ctx) => authenticator.onConnect(ctx), onClose: (ctx) => authenticator.onClose(ctx) }`; the identity lives in `ctx.extra.identity`. graphql-ws reports a `false` from onConnect as close 4403 (`WS_FORBIDDEN_CLOSE_CODE`).
- Dev identities have no `sessionId` / `expiresAt` → no WS expiry timer; anything that requires a session (logout, refresh) must handle `sessionId === undefined`.
- `DevAuthStrategy` memoizes the stub identity per provider instance: if `DEV_AUTH_ROLE` changes, a restart is needed (already the case since config is parsed at boot).

## Self-Check: PASSED

- Created files present: all 12 files listed in key-files.created.
- Commits found: aff1a75, 755fdad, b2a263c, 10764c0, 30a787c, 61e017c.
