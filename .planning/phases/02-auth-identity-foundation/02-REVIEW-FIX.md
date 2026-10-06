---
phase: 02-auth-identity-foundation
fixed_at: 2026-10-06T00:00:00Z
review_path: .planning/phases/02-auth-identity-foundation/02-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-10-06
**Source review:** .planning/phases/02-auth-identity-foundation/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (WR-01, WR-02, WR-03, plus IN-01, IN-02, IN-03, IN-07 by orchestrator decision)
- Fixed: 7
- Skipped: 0
- Not fixed (out of scope, by orchestrator decision): IN-04, IN-05, IN-06, IN-08

Each fix followed TDD: failing test first (RED observed for the expected reason), then the fix (GREEN).

**Final verification:**
- `npm test`: unit **199 passed** (baseline 172), integration **135 passed** (baseline 125), all green
- `npm run build`: exit 0
- `git diff --exit-code src/schema.gql`: no changes (GraphQL contract and error codes unchanged)

## Fixed Issues

### WR-01: Refresh rotation committed before the user lookup

**Files modified:** `src/auth/auth-session.service.ts`, `src/auth/session/session.service.ts`, `src/auth/auth-session.service.int-spec.ts`, `src/auth/session/session.service.int-spec.ts`
**Commit:** 184b638
**Applied fix:** new read-only `SessionService.findRotatable()` (current token, or previous token within grace; otherwise it runs the usual rejection with reuse detection). `AuthSessionService.refresh()` now resolves the session, reads the user (deleted user → revoke + `SESSION_REVOKED`, unchanged), signs the access token, and only then persists the rotation, which is the last fallible step. Tests: a transient failure of `UsersService.findOne` or `AccessTokenService.sign` leaves the original token valid, and a retry after 31 s still succeeds. The role re-read from the DB (D-10) still works.
**Status:** fixed: requires human verification (logic/ordering change)

### WR-02: Reuse detection covered only the immediately previous token

**Files modified:** `src/auth/session/session.model.ts`, `src/auth/session/session.service.ts`, `src/auth/session/session.service.int-spec.ts`, `test/fixtures/session.fixture.ts`, `BACKEND-NOTES.md`
**Commit:** 848fdbd
**Applied fix:** new field `retiredRefreshTokenHashes: string[]` (SHA-256 hashes only, default `[]`, multikey index), capped at the last 10.
- `rotateCurrent` retires the presented hash with `$push` + `$each` + `$slice: -10`.
- `rotateWithinGrace` is now an atomic pipeline `findOneAndUpdate` that retires the orphaned current hash (`$concatArrays` + `$slice`) in the same write.
- `rejectRefresh` revokes the session when the presented hash is any retired hash. Its filter is `retiredRefreshTokenHashes` + `revokedAt: null` + `expiresAt > now`, so a retired token of an expired session answers `SESSION_EXPIRED`.
- `isRevokedSessionToken` checks current or retired hashes.
- Only the immediately previous token keeps its 30 s grace (D-26). Every other retired token is reuse, including the token orphaned by a grace rotation (even within 30 s) and older tokens. A token that was never issued still answers `SESSION_EXPIRED`.
- The existing grace test that asserted `SESSION_EXPIRED` for the orphaned token now lives in a dedicated test that asserts `SESSION_REVOKED` plus session revocation.
- BACKEND-NOTES §2 (grace/reuse bullets, error table) and §11 test list are updated. The notes say the FE needs no change because both codes are already terminal.
**Status:** fixed: requires human verification (security logic change)

### WR-03: APP_AUTH_REDIRECT_URL boot validation was bypassable

**Files modified:** `src/config/auth-config.ts`, `src/auth/twitch/app-redirect-url.ts` (comment only), `src/config/auth-config.spec.ts`, `src/auth/twitch/twitch-urls.spec.ts`, `BACKEND-NOTES.md`, `.env.example`
**Commit:** 867dc91
**Applied fix:** the value is now validated with `new URL()`, the same parser the redirect builder uses, with no trimming tolerance. Boot fails when:
- the value contains any whitespace or control character;
- `new URL()` cannot parse it (e.g. `klimmeck_app://auth`);
- it does not match `scheme://`;
- its protocol is `http:`/`https:` or a browser scheme (`javascript:`, `data:`, `file:`, `vbscript:`, `blob:`, `about:`).

The default is still `klimmeck://auth`. A builder test checks that every value accepted by `parseAuthConfig` builds without throwing.
**Deviation (stricter than the guidance):** `ws:`, `wss:` and `ftp:` (the other WHATWG special schemes) are rejected too, because they are not app deep links.

### IN-01: TWITCH_REDIRECT_URI validated only by prefix

**Files modified:** `src/config/auth-config.ts`, `src/config/auth-config.spec.ts`, `BACKEND-NOTES.md`
**Commit:** 705733f
**Applied fix:** the value is parsed with `new URL()`. Only `https:` is accepted, or `http:` with hostname exactly `localhost` or `127.0.0.1`. Whitespace or control characters are rejected. `http://localhost.evil.com` and `http://localhost@evil.com` now fail at boot. The error message became `TWITCH_REDIRECT_URI must be an https URL or http://localhost / http://127.0.0.1`, and BACKEND-NOTES §8 is updated to match.

### IN-02: WS expiry timer created after the socket closed

**Files modified:** `src/auth/ws/ws-connection-authenticator.ts`, `src/auth/ws/ws-connection-authenticator.spec.ts`
**Commit:** fbb3c73
**Applied fix:** `onClose` sets `extra.closed = true`. `onConnect` does not schedule the 4401 timer when the socket closed while the bearer was resolving.

### IN-03: TwitchIdIndexVerifier blamed every index error on duplicates

**Files modified:** `src/users/twitch-id-index.verifier.ts`, `src/users/twitch-id-index.verifier.int-spec.ts`, `BACKEND-NOTES.md`
**Commit:** 8a43737
**Applied fix:**
- Duplicates are listed only for Mongo duplicate-key errors (`code 11000`).
- Any other `createIndexes` failure logs `Indexes on users could not be built (<name>, code <code>)`.
- A failing `findDuplicateTwitchIds()` is caught and logged.
- The verifier never throws at boot. BACKEND-NOTES §10 is updated.

### IN-07: .env.example MONGO_URI without a replica set

**Files modified:** `.env.example`
**Commit:** 908f136
**Applied fix:** `MONGO_URI=mongodb://localhost:27017/?replicaSet=rs0`, with a comment explaining that change streams need a replica set and how to start one locally. This matches BACKEND-NOTES §7. The real `.env` was not read or touched.

## Not Fixed (out of scope by orchestrator decision)

- **IN-04:** cached dev identity survives the deletion of the stub User
- **IN-05:** CI lint runs with `--fix` (a Phase 1 decision)
- **IN-06:** duplicated constants / magic numbers in the auth module
- **IN-08:** config validation limited to auth keys; `GraphQLRequestContext.req` typed `any`

---

_Fixed: 2026-10-06_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
