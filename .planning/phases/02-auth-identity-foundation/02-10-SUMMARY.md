---
phase: 02-auth-identity-foundation
plan: 10
subsystem: auth
tags: [auth, session, refresh-token, grace-window, hkdf, hmac, gap-closure, D-35]
requires:
  - phase: 02-auth-identity-foundation
    provides: "02-02 sessions + rotation, 02-REVIEW-FIX-2 (grace evaluated at requestedAt, retired-hash cap 10, findRotatable read-only)"
provides:
  - "src/auth/crypto/refresh-token-derivation.ts: deriveRefreshTokenKey (HKDF-SHA256, info klimmeck/refresh-token/v1) + deriveRefreshToken (HMAC-SHA256 over JSON [sessionId, rotationCount, tokenSeed])"
  - "Session.tokenSeed / Session.rotationCount"
  - "SessionService.rotate: idempotent re-issue of the current refresh token inside the 30 s grace window, no write"
affects: [FE Phase 11 auth-session-bootstrap (no change required), BE Phase 10 hardening]
tech-stack:
  added: []
  patterns:
    - "Deterministic server-side token derivation (env key + per-session DB seed), only the SHA-256 hash persisted"
    - "Read + compare-and-set rotation (presented hash in the update filter); the loser falls through to an idempotent read-only re-issue"
key-files:
  created:
    - src/auth/crypto/refresh-token-derivation.ts
    - src/auth/crypto/refresh-token-derivation.spec.ts
  modified:
    - src/auth/session/session.model.ts
    - src/auth/session/session.service.ts
    - src/auth/session/session.service.int-spec.ts
    - src/auth/auth-session.service.int-spec.ts
    - test/fixtures/session.fixture.ts
    - .planning/phases/02-auth-identity-foundation/BACKEND-NOTES.md
key-decisions:
  - "D-35 implemented: inside the grace window the previous refresh token gets the CURRENT refresh token back, rebuilt from the session as it is now and verified against refreshTokenHash; no write (no sliding expiry, no counter, no retired-list change)"
  - "An unrebuildable current token on re-issue (legacy session, changed JWT_SECRET) fails closed with SESSION_EXPIRED, never revokes, and logs only the session id"
  - "A legacy session without tokenSeed initializes tokenSeed and rotationCount on its next forward rotation"
requirements-completed: [BE-AUTH-01]
duration: 9 min
completed: 2026-10-06
---

# Phase 2 Plan 10: Idempotent refresh re-issue inside the grace window (D-35) Summary

**Refresh tokens are now derived server-side as `HMAC-SHA256(HKDF(JWT_SECRET, 'klimmeck/refresh-token/v1'), [sessionId, rotationCount, tokenSeed])`. That lets `SessionService.rotate` give the previous token, inside the 30 s grace window, the exact current refresh token without writing anything. Retries, concurrent refreshes and a stalled request delivered after its retry now converge on one token in any order. `rotateWithinGrace` and its orphan-retiring pipeline are gone, which closes WR-05.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-10-06T20:54:38Z
- **Completed:** 2026-10-06T21:03Z
- **Tasks:** 3
- **Files modified:** 8 (2 created)

## Accomplishments

- **Derivation primitives** (`refresh-token-derivation.ts`): a dedicated 32-byte key from `JWT_SECRET` via HKDF-SHA256 with its own info label, so the JWT secret is never the HMAC key. The token is a 43-char base64url HMAC over a JSON array, which keeps the input unambiguous.
- **Session model:** `tokenSeed?: string` (random per session, never returned) and `rotationCount: number` (default 0).
- **`SessionService`:**
  - The key is computed once, in the constructor.
  - `create()` pre-generates the `_id` and the seed, then derives the token for rotation 0.
  - `rotate()` = `rotateCurrent` (read by presented hash, derive token n+1, atomic `findOneAndUpdate` filtered on `_id` + presented hash + active) `??` `reissueWithinGrace` (read by `previousRefreshTokenHash` + `rotatedAt > requestedAt − 30 s` + active, rebuild the current token, verify the hash, return it with no write) `??` `rejectRefresh` (unchanged).
  - The new `activeFilter` / `withinGraceFilter` helpers are shared by `findRotatable`, `rotate` and `rejectRefresh`.
- **Behaviour kept:**
  - The previous token outside the window, or any of the last 10 retired tokens → revoke + `SESSION_REVOKED`.
  - A never-issued token → `SESSION_EXPIRED`.
  - Revoked and expired sessions behave as before.
  - `findRotatable` is read-only.
  - The grace window is evaluated at `requestedAt`.
  - `AuthSessionService.refresh()` order is unchanged.
- **BACKEND-NOTES** §0, §2, §9, §10 and §11 are aligned. They say explicitly that nothing changes for the FE.

## Task Commits

1. **Task 1: derivation primitives**
   - `c9ee8d4` test(phase-2): add deterministic refresh token derivation specs (RED: module missing)
   - `24611c5` feat(phase-2): derive refresh tokens deterministically from a dedicated key (GREEN, 10/10)
2. **Task 2: idempotent re-issue**
   - `c7d733a` test(phase-2): pin idempotent re-issue of the refresh token inside the grace window (RED: 15 failing against the old mechanics)
   - `3f388e0` feat(phase-2): re-issue the current refresh token instead of rotating twice inside the grace window (D-35) (GREEN, 51/51)
3. **Task 3: handoff**
   - `69e289c` docs(phase-2): align backend notes with idempotent refresh re-issue (D-35)

## Tests rewritten (old mechanics → new behaviour)

| Before | After |
|---|---|
| `grace: reusing the previous token within 30s issues a fresh token` (different token) | `grace: the previous token within 30s gets the current token back and leaves the session untouched` (`toEqual(t1)`, lean doc unchanged) |
| `reuse: the token orphaned by a grace rotation revokes the whole session` | `grace: after an in-grace re-issue the current token rotates normally and nothing is orphaned` (orphans can no longer exist) |
| `concurrent: two rotations … one current token` (one orphan) | `concurrent: two rotations of the same token both get the same new token and rotate the session once` |
| `AuthSessionService` `concurrent: … current token is one of them`, asserting the orphan is retired | `concurrent: two refreshes … both succeed with the same refresh token, rotating the session once` |

**New tests:**
- Create derives the token from the seed and rotation 0; every session gets a distinct seed.
- The forward rotation token equals derive(n+1) and pushes the presented hash.
- Repeated in-grace retries return the same token and never write.
- In-grace re-issue uses `requestedAt` (WR-04).
- Reverse order (WR-05), at both the `SessionService` and the `AuthSessionService.refresh()` level: the stalled request gets the token the client holds, and that token rotates 15 min later.
- After a secret change, the re-issue answers `SESSION_EXPIRED` with no write, while the current token still rotates.
- Legacy sessions (no seed / token not derived): the re-issue answers `SESSION_EXPIRED` with no write.
- A legacy session's forward rotation initializes the seed and enables the re-issue.

**Kept untouched:** the cap tests, the revoked-session and expired-session characterization tests, WR-01 `it.each`, the WR-04 `AuthSessionService` test, and the previous token after 30 s revoking the session.

## Verification

- `npm test`: **unit 212/212** (baseline 202, +10 derivation specs), **integration 151/151** (baseline 141, +10)
- `npm run build` OK; `npx tsc --noEmit -p tsconfig.build.json` clean
- `git diff --exit-code src/schema.gql` clean (no GraphQL contract change)
- `grep -rn "rotateWithinGrace" src` returns no lines
- Session specs (`src/auth/session` + `auth-session.service.int-spec.ts`, 51 tests) ran 5 times in a row with `--runInBand`, all green, plus 3 runs during Task 2

## Deviations from Plan

### Auto-fixed Issues

**1. [Boy Scout] `rejectRefresh` and `findRotatable` use the shared `activeFilter` / `withinGraceFilter` helpers**
- **Found during:** Task 2
- **Issue:** the `revokedAt: null, expiresAt: { $gt: now }` filter and the grace filter would otherwise have been duplicated in 4 places.
- **Fix:** two small private filter builders. Behaviour is unchanged.
- **Commit:** 3f388e0

**2. [Rule 2] A warning log when the re-issue cannot rebuild the current token**
- **Found during:** Task 2
- **Fix:** `logger.warn` with the session id only (no token, seed or key), so an operator can see a `JWT_SECRET` change or a legacy session hitting the fail-closed path.
- **Commit:** 3f388e0

The model typing of the optional `tokenSeed` and creating the document with a pre-generated `_id` both worked as written. No adaptation was needed.

## Known Stubs

None.

## Design notes for the reviewer

- **Residual edge (not introduced here, same as before D-35):** suppose a request stays stuck on the server between `findRotatable` and `rotate` for longer than a full rotation cycle of the client. That means at least the next real refresh, about 15 min later. By then its token is two rotations behind and in the retired list, so it revokes the session. This needs a single in-server stall of 15 min or more, which the Mongo/HTTP timeouts make unrealistic. It is not a token orphan, and no design hole was found in D-35 itself.
- **The re-issue gives the current token to anyone who holds the previous one within 30 s.** This is the accepted T-2-refresh-replay. Once the legitimate holder rotates, the attacker's copy goes into the retired list and reuse detection applies.
- **Forward rotation now takes two round trips** (read, then CAS) because the HMAC cannot run inside Mongo. Atomicity still comes from the presented hash in the update filter.

## Self-Check: PASSED

- FOUND: src/auth/crypto/refresh-token-derivation.ts
- FOUND: src/auth/crypto/refresh-token-derivation.spec.ts
- FOUND commits: c9ee8d4, 24611c5, c7d733a, 3f388e0, 69e289c
