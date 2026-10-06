---
phase: 02-auth-identity-foundation
fixed_at: 2026-10-06T22:00:00Z
review_path: .planning/phases/02-auth-identity-foundation/02-REVIEW-3.md
iteration: 3
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report (iteration 3)

**Fixed at:** 2026-10-06T22:00:00Z
**Source review:** .planning/phases/02-auth-identity-foundation/02-REVIEW-3.md
**Iteration:** 3

**Summary:**
- Findings in scope: 1 (WR-01). The orchestrator also asked for IN-01, IN-02, IN-03 and IN-04.
- Fixed: 1 in scope, plus 4 extra Info items.
- Skipped: 0 in scope. IN-05, IN-06 and IN-07 were skipped on the orchestrator's instruction and are recorded below.

## Fixed Issues

### WR-01: a duplicate of T0 processed after the client rotated again revoked the session

**Files modified:** `src/auth/session/session.model.ts`, `src/auth/session/session.service.ts`, `src/auth/session/session.service.int-spec.ts`, `src/auth/auth-session.service.int-spec.ts`, `test/fixtures/session.fixture.ts`
**Commit:** 4d2a811
**Status:** fixed: requires human verification (this is a logic change)

**Applied fix:** the grace window now applies to every token retired less than 30 s before the request arrived, not only the immediately previous one.

- **Model.** Retired tokens are stored as `retiredRefreshTokens: { hash, retiredAt }[]`.
  - The sub-schema is `@Schema({ _id: false })`, so entries get no `_id`.
  - There is an index on `retiredRefreshTokens.hash`.
  - The list is still capped at the last 10, with an atomic `$push` + `$each` + `$slice`.
  - `previousRefreshTokenHash`, `retiredRefreshTokenHashes` and `rotatedAt` are removed, along with their indexes. Nothing else read `rotatedAt`, so there is now a single source of truth.
- **`rotateCurrent`.** Pushes `{ hash: presentedHash, retiredAt: now }`.
- **`reissueWithinGrace`.** Matches the active session with `$elemMatch: { hash, retiredAt > requestedAt − 30 s }`, rebuilds the current token, checks it against the stored hash and writes nothing. If the token cannot be rebuilt, the answer is `SESSION_EXPIRED` with no revocation.
- **`findRotatable`.** Uses the same filter (`retiredWithinGraceFilter`), so it accepts exactly the cases that `rotate` accepts. It is still read-only.
- **`rejectRefresh` and `isRevokedSessionToken`.** Now match on `retiredRefreshTokens.hash`. Their semantics are unchanged.

**RED before the fix:**
- 3 tests failed with `SESSION_REVOKED`:
  - the REVIEW-3 sequence at `SessionService` level;
  - the same sequence at `AuthSessionService.refresh()` level;
  - "a token older than the previous one, retired within 30 s, gets the current token back".
- The guard test "a token retired 31 s before the request → `SESSION_REVOKED`" passed before the fix and still passes.

**Existing tests:** adapted to the new field shape without weakening them. The entries are now compared with their exact `retiredAt`.

**New tests:**
- the exact REVIEW-3 sequence. R1(T0) is stalled at t0; R2 rotates T0→T1 at +10 s; the client rotates T1→T2 at +15 s; R1 resumes at +20 s. R1 receives T2, the document is unchanged, the session is not revoked, and `rotate(T2)` succeeds afterwards. Covered at both service levels;
- a token retired 31 s earlier, with a later token still inside the window → revoke;
- `findRotatable` accepts an older retired token inside the window;
- retired entries have no `_id`.

**Stop-condition check:** no remaining sequence locks out an honest client or leaves two valid tokens.
- There is only one current hash, protected by a unique index.
- A token that was current when a request arrived has `retiredAt ≥ requestedAt`. An in-server stall of any length therefore converges, as long as the token is still among the last 10 retired.
- Two cases remain. Both are documented and both are inherent:
  - **Network duplicate arriving more than 30 s after its token was retired.** The server cannot tell it apart from theft, so the session is revoked.
  - **More than 10 client rotations during a stall.** The answer is `SESSION_EXPIRED` for the stalled request only. There is no revocation, and the client keeps its newer token.

### IN-01: no test for an in-window retired token of a revoked session

**Files modified:** `src/auth/session/session.service.int-spec.ts`
**Commit:** ca381dc
**Applied fix:** new test. T0 is rotated, the session is revoked, and T0 is presented again 10 s later. The result is `SESSION_REVOKED` and the document is unchanged.

The test passes against the current code. A mutation check confirmed it is not vacuous: with `activeFilter` removed from the re-issue query, the test fails ("resolved instead of rejected"). The WR-01 sequence is covered under WR-01.

### IN-02: no test for a legacy document without `rotationCount`

**Files modified:** `src/auth/session/session.service.ts`, `src/auth/session/session.service.int-spec.ts`
**Commit:** a3a0590
**Applied fix:**
- **Code.** `(session.rotationCount ?? 0) + 1`.
- **Test.** A raw document is inserted with `collection.insertOne`, without `rotationCount`, `tokenSeed` or `retiredRefreshTokens`. Rotating its current token gives `rotationCount === 1`, a seed is initialised, the token equals `derive(id, 1, seed)`, and the retired list contains the presented hash.

The test pins Mongoose's hydration default and was green before the `?? 0` guard, which is defensive.

### IN-03: accepted risk not stated in BACKEND-NOTES (plus the WR-01 doc corrections)

**Files modified:** `.planning/phases/02-auth-identity-foundation/BACKEND-NOTES.md`, `.planning/phases/02-auth-identity-foundation/02-10-SUMMARY.md`
**Commit:** 21ca8c2
**Applied fix:**
- **BACKEND-NOTES §0 and §2.** The grace window applies to every token retired less than 30 s before the request arrived. There is one current token, and re-issue is idempotent. Convergence holds even after the client has rotated again. The only remaining honest-client lockout is stated: a network duplicate that arrives more than 30 s after its token was retired. The reuse-detection text and the error table are updated to match.
- **§9 (f).** States T-2-refresh-replay in plain words.
- **§9 (j).** Rewritten for the generalised window.
- **§9 (k).** Notes that the cap of 10 also bounds how far back the window can look.
- **§10.** Notes that the old fields and indexes are no longer read and that their indexes can be dropped.
- **§11.** No FE change, and the test list is updated.
- **`02-10-SUMMARY.md`.** A new "Addendum (REVIEW-3)" corrects the "≥ 15 min" claim. The rest of the summary is not rewritten.

### IN-04: imprecise fixture comment

**Files modified:** `test/fixtures/session.fixture.ts`
**Commit:** e139905
**Applied fix:** the comment now says that a fixture session created with `retiredRefreshTokens` cannot re-issue its non-derived current token, and that once rotated, its new token is derived and can be re-issued.

## Skipped Issues

### IN-05: a DB leak gives an offline verifier for `JWT_SECRET`

**File:** `src/auth/crypto/refresh-token-derivation.ts:8-30`
**Reason:** skipped on the orchestrator's instruction. It adds no new risk, because any HS256 access JWT is already an offline verifier.
**Original issue:** with `refreshTokenHash`, `tokenSeed`, `rotationCount` and `_id`, a guess of `JWT_SECRET` can be checked offline.

### IN-06: `tokenSeed` is selected by default

**File:** `src/auth/session/session.model.ts`
**Reason:** skipped on the orchestrator's instruction. This is hardening and is deferred to Phase 10.
**Original issue:** a future feature that serialises sessions could expose the seed.

### IN-07: `findRotatable` accepts a token that cannot be re-issued

**File:** `src/auth/session/session.service.ts`, `src/auth/auth-session.service.ts`
**Reason:** skipped on the orchestrator's instruction. The wasted user lookup and signature are negligible, and the case is rare.
**Original issue:** for a legacy session or after a secret change, `refresh()` looks up the user and signs a JWT before `rotate` throws `SESSION_EXPIRED`.

## Verification

- `npm test`: **unit 212/212** (baseline 212) and **integration 158/158** (baseline 151, +7 new tests).
- `npm run build`: OK. `npx tsc --noEmit -p tsconfig.build.json` was clean before every commit that touched `src/`.
- `git diff --exit-code src/schema.gql`: clean. There is no GraphQL contract change, so **the frontend needs no change**.
- The session specs (`src/auth/session` + `src/auth/auth-session.service.int-spec.ts`, 58 tests) ran 5 times in a row with `--runInBand`: all green.
- Prettier and ESLint were run on the touched files only, with no errors.

---

_Fixed: 2026-10-06T22:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
