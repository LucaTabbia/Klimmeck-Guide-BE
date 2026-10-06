---
phase: 02-auth-identity-foundation
plan: 02
subsystem: auth
tags: [auth, session, refresh-token, rotation, reuse-detection, ttl-index, mongoose]
requires:
  - "02-01: Clock, AuthException, generateOpaqueToken/sha256Hex, AUTH_CONFIG/AuthConfig, FixedClock, buildTestAuthConfig, unique User.twitchId"
provides:
  - "src/auth/session/session.model: Session, SessionDocument, SessionSchema (collection sessions, TTL index on expiresAt, unique refreshTokenHash)"
  - "src/auth/session/session.service: SessionService (create / rotate / revoke), IssuedRefreshToken"
  - "test/fixtures: buildSession / persistSession"
  - "UsersService.findDuplicateTwitchIds"
  - "TwitchIdIndexVerifier (OnApplicationBootstrap) registered in UsersModule"
affects: [02-05, 02-06, 02-09]
tech-stack:
  added: []
  patterns: ["opaque refresh token stored only as SHA-256 hash", "atomic rotation via filtered findOneAndUpdate (current → grace fallback)", "reuse detection revokes the whole session", "every session query filters revokedAt null + expiresAt > now (TTL is not the only expiry)", "boot-time index verification that reports instead of crashing"]
key-files:
  created:
    - src/auth/session/session.model.ts
    - src/auth/session/session.service.ts
    - src/auth/session/session.service.int-spec.ts
    - src/users/twitch-id-index.verifier.ts
    - src/users/twitch-id-index.verifier.int-spec.ts
    - test/fixtures/session.fixture.ts
  modified:
    - test/fixtures/index.ts
    - src/users/users.service.ts
    - src/users/users.module.ts
decisions:
  - "Session.userId uses MongooseSchema.Types.ObjectId (not Types.ObjectId as in the plan interface): with Types.ObjectId the path resolves to Mixed in Mongoose 8 and string userId filters do not cast"
  - "rejectRefresh step (b) checks revoked sessions via exists({$or: [refreshTokenHash, previousRefreshTokenHash], revokedAt: {$ne: null}})"
  - "Ids returned as _id.toString() instead of doc.id (doc.id is typed any → no-unsafe-assignment)"
  - "Duplicate-twitchId aggregation pipeline extracted to a typed PipelineStage[] constant"
metrics:
  duration: "~6 min"
  completed: 2026-10-06
  tasks: 3
  files: 9
---

# Phase 2 Plan 02: Rotating BE sessions and twitchId index boot check Summary

`sessions` collection storing only the SHA-256 of a 256-bit opaque refresh token, atomic rotation with a 30 s grace window anchored to the first rotation, reuse detection that revokes the whole session (SESSION_REVOKED), SESSION_EXPIRED for unknown/expired tokens, 30-day sliding TTL, logout revoke; plus a bootstrap verifier that logs the duplicated `twitchId`s when the unique index on `users.twitchId` cannot be built.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Sessions model, fixture, SessionService.create / revoke | `10aea88` test (RED), `165487d` feat (GREEN) |
| 2 | SessionService.rotate with 30 s grace + reuse detection | `8dd716e` test (RED), `836026c` feat (GREEN) |
| 3 | Boot verification of users.twitchId unique index (D-32) | `6d8f49c` test (RED), `00305e8` feat (GREEN) |

TDD: each RED commit was run and failed for the right reason (missing `session.model` / `twitch-id-index.verifier` modules; 8 rotate specs failing on `not implemented`) before the GREEN commit.

## Verification

- `npx tsc --noEmit -p tsconfig.build.json` — clean
- `npx eslint` on every file in `files_modified` — 0 errors, 0 warnings
- `npx jest src/auth/session --selectProjects integration --runInBand` — 18/18 (run 5 times in a row, concurrent test stable)
- `npx jest src/users --selectProjects integration --runInBand` — 2 suites, 10/10
- `npm test`:
  - unit: **7 suites, 67 tests passed, 0 failed**
  - integration (runInBand, MongoMemoryReplSet): **7 suites, 36 tests passed, 0 failed**
- Acceptance greps: `expireAfterSeconds: 0`, `collection: 'sessions'`, 0 `@ObjectType`, `sha256Hex(`/`generateOpaqueToken(`, `rotateCurrent`/`rotateWithinGrace`/`rejectRefresh`/`refreshTokenGraceSeconds`, `findDuplicateTwitchIds`, `$group` + `count: { $gt: 1 }`, `TwitchIdIndexVerifier` in providers — all present. The only logger call in SessionService logs the session id only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `userId` schema type resolved to Mixed**
- **Found during:** Task 1 (GREEN)
- **Issue:** `@Prop({ type: Types.ObjectId, ... })` (as written in the plan interface) makes the path `Mixed` in Mongoose 8; queries filtering `userId` by string did not cast and matched nothing (multi-device test: 0 instead of 2).
- **Fix:** `type: MongooseSchema.Types.ObjectId` (`import { Schema as MongooseSchema } from 'mongoose'`). TS field type stays `Types.ObjectId`.
- **Files modified:** src/auth/session/session.model.ts
- **Commit:** 165487d

**2. [Rule 1 - Lint] `doc.id` is `any`**
- **Issue:** `session.id` triggered `@typescript-eslint/no-unsafe-assignment`.
- **Fix:** `_id.toString()` for `sessionId` in create and rotate.
- **Commit:** 165487d, 836026c

**3. [Rule 3 - Blocking] prettier vs eslint-prettier disagreement on the inline aggregate pipeline**
- **Fix:** pipeline extracted to `DUPLICATE_TWITCH_IDS_PIPELINE: PipelineStage[]` + `TwitchIdGroup` interface; behavior identical.
- **Commit:** 00305e8

### Notes (not deviations)

- Pre-existing: `User.currentCharacter` uses the same `type: Types.ObjectId` pattern and is therefore also `Mixed` (no casting on string filters). Out of scope for this plan — worth a look when User is next touched.
- The verifier spec drops the users indexes to insert duplicates; its `afterEach` deletes users and calls `UserModel.createIndexes()` to restore the unique index, because the replSet DB is shared across integration suites.
- `src/users/users.module.ts` was reformatted by prettier (4 spaces, `{}` class body) as part of the touch.

## Known Stubs

None. `SessionService` and `TwitchIdIndexVerifier` are not yet exposed: SessionService is wired by the AuthModule (02-05) and resolvers (02-06).

## Threat Flags

None — all surface is covered by the plan's threat model (T-2-refresh-reuse, T-2-refresh-at-rest, T-2-refresh-race, T-2-stale-ttl, T-2-log-leak, T-2-dup-identity mitigated and tested; T-2-grace-window accepted).

## Notes for next plans

- AuthModule (02-05) must register `MongooseModule.forFeature([{ name: Session.name, schema: SessionSchema }])`, `SessionService`, `authConfigProvider` and `{ provide: Clock, useClass: SystemClock }`.
- `rotate` throws `AuthException` with `code` SESSION_EXPIRED or SESSION_REVOKED; `revoke` is idempotent and silent on unknown/malformed ids.
- Reusing an old token on an expired-but-not-reaped session still marks it revoked (plan step (a) does not filter `expiresAt`): harmless, the session is unusable either way.
- `TwitchIdIndexVerifier` runs on every boot through `UsersModule`; it never throws.

## Self-Check: PASSED

- Created files present: session.model.ts, session.service.ts, session.service.int-spec.ts, twitch-id-index.verifier.ts, twitch-id-index.verifier.int-spec.ts, session.fixture.ts.
- Commits found: 10aea88, 165487d, 8dd716e, 836026c, 6d8f49c, 00305e8.
