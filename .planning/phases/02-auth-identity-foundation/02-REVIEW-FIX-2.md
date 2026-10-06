---
phase: 02-auth-identity-foundation
fixed_at: 2026-10-06T00:00:00Z
review_path: .planning/phases/02-auth-identity-foundation/02-REVIEW-2.md
iteration: 2
findings_in_scope: 5
fixed: 4
skipped: 1
status: partial
---

# Phase 2: Code Review Fix Report (iteration 2)

**Fixed at:** 2026-10-06
**Source review:** .planning/phases/02-auth-identity-foundation/02-REVIEW-2.md
**Iteration:** 2

**Summary:**
- Findings in scope (by orchestrator decision): 5. These are WR-04, WR-05, IN-09, IN-11 and IN-12.
- Fixed: 4 (WR-04, IN-09, IN-11, IN-12)
- Skipped: 1 (WR-05). It is documented only, as decided by the orchestrator.
- Not fixed and recorded only: IN-10 (with a deploy note) and IN-13.

WR-04 and IN-09 followed TDD. The failing test came first and failed for the expected reason, then the fix made it pass. IN-11 adds characterization tests only.

**Final verification:**
- `npm test`: unit **202 passed** (baseline 199, +3), integration **141 passed** (baseline 135, +6). Everything is green.
- `npm run build`: exit 0
- `git diff --exit-code src/schema.gql`: no changes. The GraphQL contract and the error codes are unchanged.

## Fixed Issues

### WR-04: grace window evaluated at rotation time instead of request arrival

**Files modified:** `src/auth/auth-session.service.ts`, `src/auth/session/session.service.ts`, `src/auth/auth-session.service.int-spec.ts`
**Commit:** 06ccb2e

**Applied fix:**
- `AuthSessionService` now receives the `Clock` through injection.
- `refresh()` reads `requestedAt = clock.now()` once and passes it to `SessionService.findRotatable(token, requestedAt)` and to `SessionService.rotate(token, requestedAt)`.
- In both methods the grace filter (`rotatedAt > requestedAt − 30 s`) uses `requestedAt`. When the parameter is omitted it defaults to `clock.now()`, so direct callers behave as before.
- The expiry filter (`expiresAt > now`), `rotatedAt`, `expiresAt` and `revokedAt` written to the document still use the current time at write.

**Test (RED → GREEN):**
1. Rotate T0 to T1.
2. Advance the clock to +29 s.
3. Make `UsersService.findOne` advance the clock by 2 s before it resolves.
4. Refresh with T0.

Before the fix this was rejected with `SESSION_REVOKED` from `rejectRefresh`, through `rotate`. Now it succeeds on the same session, the session is not revoked, and the returned token is the current one.

**Status:** fixed, requires human verification (this changes timing logic)

### IN-09: APP_AUTH_REDIRECT_URL accepted Android intent schemes

**Files modified:** `src/config/auth-config.ts`, `src/config/auth-config.spec.ts`, `BACKEND-NOTES.md` (§7 scheme list)
**Commit:** 6121217

**Applied fix:**
- `intent:` and `android-app:` were added to `FORBIDDEN_APP_REDIRECT_PROTOCOLS`.
- The rest of the validation is unchanged. It is still a denylist; there was no redesign to an allowlist.

**Tests:** `intent://…;S.browser_fallback_url=https…;end`, `INTENT://…` and `android-app://…` are rejected with the "must be an app deep link" error. These tests failed before the fix.

### IN-11: missing tests for the WR-02 edge cases

**Files modified:** `src/auth/session/session.service.int-spec.ts`, `src/auth/auth-session.service.int-spec.ts`
**Commit:** ce489c5

**Applied fix:** characterization tests only, with no change to `src/`. All of them passed on the current code at the first run and in 3 consecutive runs. None of them revealed a defect.

What each test pins:
- **(a) 10-entry cap.** The test does 11 rotations, issuing T0…T11.
  - T0 is no longer in the list. It answers `SESSION_EXPIRED`, the session is not revoked, and T11 still rotates.
  - T1 is the 10th most recent retired token. It answers `SESSION_REVOKED` and the session is revoked.
- **(b) Retired token of an already revoked session.** The answer is `SESSION_REVOKED`, coming from the retired-hash branch of `isRevokedSessionToken`. The original `revokedAt` is not overwritten.
- **(c) Retired token of an expired session.** Today the answer is **`SESSION_EXPIRED`** and the session is **not** revoked:
  - `rejectRefresh` filters on `expiresAt > now`, so it does not match the expired session;
  - `isRevokedSessionToken` finds no revocation.

  The current token of that session also answers `SESSION_EXPIRED`. Both codes are terminal for the FE.
- **(d) Two concurrent `AuthSessionService.refresh()` calls with the same current token.** Today both calls **succeed**. Both return an access token bound to the same `sid`, and exactly one session remains, not revoked.
  - One of the two returned refresh tokens is the current one.
  - The other is already in `retiredRefreshTokenHashes`: one call won with `rotateCurrent`, the other went through `rotateWithinGrace` and orphaned it.

  A client that kept the orphaned token would get its session revoked at the next refresh. This is the documented single-flight requirement (BACKEND-NOTES §2), not a new defect.

### IN-12: BACKEND-NOTES understated the effect of parallel refreshes and missed the 10-rotation cap

**Files modified:** `.planning/phases/02-auth-identity-foundation/BACKEND-NOTES.md`
**Commit:** 48f0085 (shared with the WR-05 and IN-10 documentation)

**Applied fix:**
- §2, single-flight bullet: presenting the first token of a parallel pair now **revokes the whole session** (`SESSION_REVOKED`), including the good pair.
- §2, grace bullet: the window is evaluated when the request arrives (WR-04).
- §9 has a new limit **(k)**: reuse detection only covers the last 10 rotations. An older retired token answers `SESSION_EXPIRED` and the session survives.

## Skipped Issues

### WR-05: a client retry can be left holding a retired token when a stalled first request commits after the retry

**File:** `src/auth/auth-session.service.ts:44-51` (together with `src/auth/session/session.service.ts`)
**Reason:** documented only, by orchestrator decision. This is a consequence of the grace-window design (CONTEXT D-26), an auto-accepted decision that the user has not yet confirmed. The user will choose between three options:
- strict reuse detection without grace;
- grace with idempotent re-issue;
- grace with sibling tokens.

The rotation design was not changed. BACKEND-NOTES now states the known limit as instructed, in §2 next to the grace description and in §9 as limit **(j)**. Commit 48f0085.
**Original issue:**
1. A first request stalls between `findRotatable` and `rotate`.
2. The client retries, and the retry commits first.
3. The stalled request then rotates within grace and retires the token the client received.
4. At the next refresh the session is revoked with a false reuse alarm.

## Not Fixed (recorded only, by orchestrator decision)

- **IN-10:** sessions rotated before the deploy of `retiredRefreshTokenHashes` lose reuse detection on their previous token until their next rotation. Such a token answers `SESSION_EXPIRED` instead of revoking the session. It is recorded as a one-line deploy note in BACKEND-NOTES §10 (commit 48f0085). It does not matter today, because no production sessions exist yet.
- **IN-13:** `rotateWithinGrace` uses an update pipeline, and Mongoose 9 will need the explicit `updatePipeline: true` opt-in. Nothing was changed, because the project is on Mongoose 8.18.1. Re-check this when upgrading Mongoose; the existing grace test covers that branch.

---

_Fixed: 2026-10-06_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
