---
phase: 26-eliminazione-account-e-consenso
fixed_at: 2026-11-25T03:05:16Z
review_path: .planning/phases/26-eliminazione-account-e-consenso/26-REVIEW.md
iteration: 1
findings_in_scope: 15
fixed: 10
not_needed: 0
deferred: 4
covered_by_other_fixes: 1
status: partial
---

# Phase 26: Code Review Fix Report

**Fixed at:** 2026-11-25T03:05:16Z
**Source review:** `.planning/phases/26-eliminazione-account-e-consenso/26-REVIEW.md` (1 critical, 5 warning, 8 info)
**Iteration:** 1
**Branch:** `feat/26-eliminazione-account-e-consenso`, base of the fixes `51f1584e`

Scope: all 14 findings plus the verifier's observation on `UserUpdatesPublisher` (15 items). Every finding was checked in the code first, each with a test that failed for the right reason before the fix (RED and GREEN committed separately). `src/characters/deletion/` was not touched.

**Summary:**
- Fixed: 10 (CR-01, WR-01, WR-02, WR-03, WR-04, WR-05, IN-02, IN-03, IN-05, IN-06) plus the publisher observation
- Covered by the other fixes: IN-07
- Deferred: IN-01, IN-04, IN-08, and the role-from-JWT half of IN-06
- Not needed: none (every finding held when checked)

| Finding | Outcome | RED | GREEN |
|---------|---------|-----|-------|
| CR-01 another player's portrait could be destroyed | fixed | `ac4c9531` | `9619e624` |
| WR-03 a login racing the deletion left a live session | fixed | `6fd3cc11` | `9bcb5b1c` |
| WR-01 the mutation waited on the whole outbox | fixed | `7b08d929` | `51577ec0` |
| WR-02 retries had no cap and no backoff | fixed | `60e4eba5` | `c1b96744` |
| WR-04 string ids on unstarted quests and open aids survived | fixed | `446f77f2` | `c201a582` |
| WR-05 a skipped companion was left stuck on a pending quest | fixed (choice to confirm, below) | `efcde605` | `8f3bdd6f` |
| Verifier: `userUpdated` ERROR on every account deletion | fixed | `c0d59ed2` | `50af37ba` |
| IN-02 dead `_now` parameter | fixed | `835419f7` | `fb1c745e` |
| IN-05 two clocks in one transaction | fixed | `e6b51908` | `bce4f248` |
| IN-03 Twitch login normalised twice | fixed | `9df7880c` | `768248f5` |
| IN-06 no rate limit on the two mutations | fixed (throttle); role from the JWT deferred | `22dd5855` | `9612d74c` |
| IN-07 blind spots in the inventory test | covered by the CR-01, WR-03, WR-04 cases | — | — |
| IN-01 archived characters with no owner from before the phase | deferred | — | — |
| IN-04 portrait sweep interval tied to `QUEST_CONFIG`; second `CloudinaryService` | deferred | — | — |
| IN-08 two accounts deleting the same shared portrait at once | deferred (accepted, documented) | — | — |

## Fixed Issues

### CR-01: Another player's portrait could be destroyed on Cloudinary

**Files modified:** `src/account/deletion/portrait/portrait-public-id.ts`, `portrait-store.ts`, `portrait-deletion.service.ts`, `src/account/deletion/account-eraser.ts`, `account-deletion.module.ts`, `src/rest/cloudinary/cloudinary.service.ts`, `test/account/fake-portrait-store.ts`
**Commits:** `ac4c9531` (RED), `9619e624` (GREEN)
**Applied fix:**
- `CloudinaryService.cloudName` reads `CLOUDINARY_CLOUD_NAME` through the `ConfigService` it already uses. It is never logged.
- The `PortraitStore` port now exposes `cloudName`, the cloud its `destroy` acts on. The module factory passes it through.
- `portraitPublicIdOf(imagePath, cloudName)` accepts a portrait only when its cloud name matches. A missing configuration accepts nothing.
- `PortraitDeletionService.publicIdOf` is the only entry point the eraser uses.
- The "still shown" guard now compares **public ids**. It reads, with the native driver and in the same transaction, every character not being erased (archived ones too) whose `imagePath` matches `portraitReferencePatternOf` (`/<publicId>` followed by `.`, `?`, `#` or the end). Any spelling counts: version, extension, transformation, another cloud, query. When in doubt, the portrait stays.

**Tests:**
- `account-eraser.int-spec.ts` (a RED failure was seen for each):
  - four spellings of one public id shown by another player's character: no extension change and no version, another version and extension, a transformation, another cloud;
  - an archived character of another player;
  - a foreign cloud on the erased character's own portrait;
  - the account's exclusive portrait is still queued next to a shown one.
- `portrait-public-id.spec.ts`: foreign cloud, no configured cloud, recognition and non-confusion by the reference pattern.
- `cloudinary.service.spec.ts`: the configured cloud name is exposed.

**Residual risk (not fixed here, written in `BACKEND-NOTES.md` §7):** an uploaded image that no character references, and whose public id an attacker knows, can still be destroyed. Proposed follow-up: record the uploader at upload time and queue only images the erased account uploaded.

### WR-03: A login racing the deletion left a live session

**Files modified:** `src/auth/session/session.service.ts`, `session-revocation.service.ts`, `src/auth/auth-session.service.ts`, `src/account/deletion/account-deletion.service.ts` (test callers awaited in `test/auth/http-guard.int-spec.ts` and `test/auth/session-revocation.int-spec.ts`)
**Commits:** `6fd3cc11` (RED), `9bcb5b1c` (GREEN)
**Applied fix:**
- `closeDeletedAccountSessions` is now async and runs in this order:
  1. marks the registry;
  2. runs a second revocation pass, `SessionService.revokeRemainingForAccountDeletion`: every session of that user id that is still not revoked gets `accountDeleted`, `revokedAt`, and the `$min` expiry cut to 15 minutes;
  3. closes the sockets of the transaction's sessions and the late ones in a single 4409 `accountDeleted` call. The sockets close even if the late pass fails (`finally`).
- `AuthSessionService.issueForUser` refuses to create a session for an id the registry holds (`LOGIN_TICKET_INVALID`).
- If the deletion lands between that check and the insert, the new session is revoked by the same pass and the login is refused. The mark comes before the late pass, so with a single BE process no interleaving leaves a live session.
- The transactional revocation and the late pass now share one private helper.

**Tests:**
- Deterministic race on the wire: a spy on `connection.transaction` inserts the rival session right after the commit. The test then checks it is revoked with `accountDeleted`, has the cut expiry, and is among the sockets closed.
- Facade level: a late session is revoked and closed together with the others, and the registry is marked before the late pass.
- `exchangeLoginTicket`: refused after the mark. A spy on `create` that marks the registry right after the insert ends in a revoked session and a refused login.

**Residual:** a login ticket issued after the snapshot lives at most 60 s (TTL) and cannot be redeemed. Documented in §2c.

### WR-01: The mutation waited on the whole outbox

**Files modified:** `src/account/deletion/portrait/portrait-deletion.sweeper.ts`, `src/account/deletion/account-deletion.service.ts`, `test/account/fake-portrait-store.ts`
**Commits:** `7b08d929` (RED), `51577ec0` (GREEN)
**Applied fix:**
- The after-commit step ends with `PortraitDeletionSweeper.kick()`, which is not awaited. It starts `sweepSafely()`, which catches and logs every error, so there is never an unhandled rejection.
- If a sweep is already running (it may have read the outbox before the commit), `kick` asks for one more run when it ends. That run is skipped after `onModuleDestroy`.
- The mutation answers once the database work, the socket closing, the pushes and the topic unsubscription are done.

**Tests:**
- Wire: a held `destroy` (gate in the fake store) proves the answer `true` arrives while Cloudinary is still pending. The portrait is destroyed after release.
- The existing portrait cases now await the flushes the mutation started, tracked with a spy, instead of the response.
- Unit: `kick` returns nothing, logs a failure, and reruns once after a running sweep.

**Note:** the RED's guard is a 2 s timer that only matters when the mutation hangs (old code). On the fixed code the race is won right away.

### WR-02: Retries had no cap and no backoff

**Files modified:** `src/account/deletion/portrait/portrait-deletion.model.ts`, `portrait-deletion.service.ts`
**Commits:** `60e4eba5` (RED), `c1b96744` (GREEN)
**Applied fix:**
- The only new field on the outbox row is `nextAttemptAt`, set to the queue instant on insert. Nothing in it refers to a user.
- `flush` reads the `Clock` and tries only rows with `attempts < MAX_PORTRAIT_ATTEMPTS` (10) and `nextAttemptAt` not in the future.
- A failure increments `attempts` and moves `nextAttemptAt` by 1, 2, 4… minutes, capped at 6 h.
- On the attempt that reaches the cap, a single ERROR carries only the row id, never the public id. The row then stays for manual cleanup and is never selected again.

**Tests:** `portrait-deletion.service.int-spec.ts`:
- the growing delay (no retry before it, retry after it, then the doubled delay);
- the cap with exactly one ERROR without the public id;
- the outbox key-set assertion now includes `nextAttemptAt`.

The row-shape assertions in the eraser and resolver specs were updated in the RED.

### WR-04: String ids on unstarted quests and open aids survived

**Files modified:** `src/account/deletion/account-erasure.plan.ts`, `src/account/deletion/account-eraser.ts`
**Commits:** `446f77f2` (RED), `c201a582` (GREEN)
**Checked first:** the finding holds. All five new cases failed on the old code: the seat remained, the wounded remained, the inventory found leftovers, and the aids were not concluded.
**Applied fix:** the eraser runs `cleanOpenQuestsOf` after the archive (the archiver is unchanged). It uses the native driver inside the session, with `openQuestCleanupOf` from the pure plan:
- it pulls every id form of the erased characters from the registrations of quests that are neither started nor concluded, and from `rescue.characters` of open aids;
- an aid left with no wounded is concluded at the erasure instant, as the archive does;
- if that aid had not started, its rescuers are released with the existing `releaseRegisteredWithin`, and they go into `report.released` for today's `questCancelled` push;
- an unstarted quest only loses the seat.

**Tests:** a new `describe('open quests with string ids (WR-04)')` in `account-eraser.int-spec.ts`:
- a string seat on an unstarted quest;
- a string wounded on an open aid;
- the **inventory** run with both string forms seeded;
- a started aid whose only wounded is a string (concluded as today, companions untouched);
- an unstarted aid whose only wounded is a string (rescuers released and reported).

`BACKEND-NOTES.md` §7 point 4 is corrected.

### WR-05: A skipped companion was left stuck on a started pending quest

**Files modified:** `src/quests/party/started-quest-canceller.ts`
**Commits:** `efcde605` (RED), `8f3bdd6f` (GREEN)
**Choice (for the orchestrator to confirm):** a companion whose `PendingQuest` belongs to this quest but who is **travelling** (broken data) is not sent back, but he **loses the lane anyway**:
- in the same guarded update as everyone else: `quests.pendingQuest` set to null, his `PendingQuest` deleted, food and hunger life refunded;
- his points are refunded through the `WalletService`;
- his position and his `activeTravel` are left as they are;
- he gets **no push**, because the text says he is back in town;
- there is a WARN, and he is not in `characterIds`.

When his travel later completes, it finds no pending quest and ends like the travel of a dissolved party (`arriveOnMarker` returns null).

What stays as before:
- a companion whose lane points to **another** quest is untouched, because that lane is not this quest's;
- if the guarded update does not match (lane changed inside the transaction), the companion no longer points at this quest's pending quest, so nothing is stranded.

Either way, no character is left pointing at a pending quest of a quest he is no longer registered to.
**Tests:** `started-quest-canceller.int-spec.ts`. "Leaves a travelling companion intact" is replaced by "frees the lane of a travelling companion without moving him (D-26, WR-05)". It checks the lane is null, the request is gone, the position and travel are unchanged, life goes 50 to 54, one ration and the points are refunded, he is not in the reported companions, and no character has a lane on a pending quest of that quest.

### Verifier's observation: `userUpdated` ERROR on every account deletion

**Files modified:** `src/users/user-updates.publisher.ts`
**Commits:** `c0d59ed2` (RED), `50af37ba` (GREEN)
**Applied fix:** a `NotFoundException` (which `ResourceNotFoundException` extends) from re-reading the user is now handled quietly: nothing is published and only a debug line is written. Every other failure still goes to ERROR.
**Tests:** `user-updates.publisher.spec.ts`:
- a deleted user gives no publication and no ERROR (RED seen);
- any other failure is still reported at ERROR (regression guard; passed in the RED as expected).

### IN-02: Dead `_now` parameter

**Files modified:** `src/quests/party/started-quest-canceller.ts`, `src/account/deletion/account-eraser.ts`
**Commits:** `835419f7` (RED), `fb1c745e` (GREEN, committed as `refactor(quests)`)
**Applied fix:**
- The parameter and its `eslint-disable` are removed from `cancelStartedQuestWithin`.
- The eraser's private `cancelStartedQuestsOf` no longer takes `now`, which was only passed through.

**Test:** the canceller spec calls the method with three arguments. RED shows only at type check (`npx tsc --noEmit`: TS2554 "Expected 4 arguments"), because ts-jest here does not stop on type errors and a dead argument has no runtime effect.

### IN-05: Two clocks in one transaction

**Files modified:** `src/auth/session/session.service.ts`, `session-revocation.service.ts`, `src/account/deletion/account-eraser.ts` (test callers in `session.service.int-spec.ts`, `session-revocation.service.int-spec.ts`, `test/auth/session-revocation.int-spec.ts`)
**Commits:** `e6b51908` (RED), `bce4f248` (GREEN)
**Applied fix:** `revokeForAccountDeletionWithin` and `revokeAllForAccountDeletionWithin` take the eraser's `now`. The late pass of WR-03 uses the clock of its own moment.
**Test:** `account-eraser.int-spec.ts` erases with an instant one minute before the clock. It expects `revokedAt` to equal that instant and `expiresAt` to equal that instant + 900 s (RED: received the clock's time).

### IN-03: Twitch login normalised twice

**Files modified:** `src/auth/twitch/twitch-login-name.ts`, `twitch-user-directory.ts`, `http-twitch-user-directory.ts`, `src/account/deletion/account-deletion.service.ts`, `test/auth/fake-twitch-user-directory.ts`
**Commits:** `9df7880c` (RED), `768248f5` (GREEN)
**Applied fix:**
- `normalizedTwitchLoginOf` returns a branded `TwitchLogin`.
- `TwitchUserDirectory.userIdOfLogin` accepts only `TwitchLogin`, so the HTTP adapter and the fake no longer normalise.
- The service is the only owner of the rule. An impossible name is still answered `TWITCH_USER_NOT_FOUND` without calling Twitch (the resolver case is unchanged).

**Tests:**
- `http-twitch-user-directory.spec.ts`: the directory asks Twitch for the login as received and never calls the normaliser (spy; RED seen).
- The two directory cases that pinned normalisation in the adapter were removed: the rule is pinned in `twitch-login-name.spec.ts` and on the wire.

### IN-06: No rate limit on the two mutations

**Files modified:** `src/account/deletion/account-deletion.resolver.ts`
**Commits:** `22dd5855` (RED), `9612d74c` (GREEN)
**Applied fix:** the repo's `@Throttled()` is on `deleteMyAccount` and on `deleteAccountByTwitchLogin`. They use the same default bucket as `exchangeLoginTicket` and `refreshSession`: 20 calls per minute per address and handler with today's config, which is the conservative limit the repo already uses for login. A tighter limit per handler would need a new decorator argument and would bypass the harness throttle config, so it was not added.
**Test:** `EXPECTED_THROTTLED_HANDLERS` in `test/app.int-spec.ts` lists the two handlers (RED: the enumeration failed).
**Deferred half:** re-reading the caller's role from the database (a demoted innkeeper keeps the role for at most 15 minutes) is how every innkeeper mutation works today. Left for a shared review of innkeeper mutations (§7).

## Covered by other fixes

### IN-07: Blind spots in the inventory test and missing cases

The cases the review listed are now in the specs:
- the same public id under other URLs and a foreign cloud bound to the configured one (CR-01);
- a session created during the deletion (WR-03);
- a string registration on an unstarted quest and a string wounded on an open aid, inventory included (WR-04).

The fourth item (an archived character with no `user`) depends on data from before the phase and stays with IN-01.

## Deferred Issues

### IN-01: Archived characters from before the phase are not deleted with the account

**File:** `src/account/deletion/account-eraser.ts:197-208`
**Reason:** dev data from before the phase (D-11, D-24). No code change: this is the orchestrator's task 4 at the real boot, before UAT (`BACKEND-NOTES.md` §7).

### IN-04: Portrait sweep tied to `QUEST_CONFIG`; second `CloudinaryService` instance

**File:** `src/account/deletion/portrait/portrait-deletion.sweeper.ts:23`, `account-deletion.module.ts`
**Reason:** the integration specs turn the periodic portrait sweep off through `QUEST_CONFIG`. An interval constant of its own would leave a live timer in every suite, and a dedicated config token is a new provider and contract. The second instance is harmless (same config). Documented in §7.

### IN-08: Two accounts deleting the same shared portrait at the same time

**File:** `src/account/deletion/account-eraser.ts`, `portrait-deletion.service.ts`
**Reason:** after CR-01 only the orphan case remains: each transaction sees the other's character as a survivor, and with the public-id guard, different URLs no longer both queue. It is rare. It is accepted and declared in §7, and it would be closed by the uploader-registry follow-up.

## Final verification

All in the foreground. Integration runs used `--runInBand` and a 600000 ms timeout. Results are from the HEAD after `9612d74c`:

| Run | Suites | Tests |
|-----|--------|-------|
| integration `src/account` + `test/account` | 4 | 81 |
| integration `src/quests/party` | 4 | 44 |
| integration `src/auth` + `test/auth` | 19 | 424 |
| integration `src/users` + `src/push` | 7 | 78 |
| integration `test/authz` | 2 | 151 |
| integration `test/app.int-spec.ts` | 1 | 109 |
| unit `src/account src/auth src/users src/push src/quests src/authz src/rest` | 143 | 2 413 |

- `npx tsc --noEmit`: exit 0.
- `git diff 9a084248 -- src/schema.gql`: only the five added lines plus the blank separator.
- `git diff --stat 9a084248 -- src/characters/deletion`: empty (hard rule 3).
- Targeted `npx eslint` on every source file touched: no errors. The only warnings are old ones in `cloudinary.service.ts` `listResources`, which this work did not touch.
- `pgrep -fl 'bin/jest'`: empty.

## Changes to `BACKEND-NOTES.md`

- **Header:** a line saying the notes were updated after the code review.
- **§2a:**
  - `@Throttled()` on `deleteMyAccount`;
  - wire order: the response no longer waits for Cloudinary (the sweeper is kicked), and the late sessions are closed with the others.
- **§2b:** `@Throttled()` on the innkeeper mutation; the normalisation has one owner (`TwitchLogin`).
- **§2c:**
  - revocation at the erasure instant;
  - the second pass after the commit;
  - refusal of a login racing the deletion, and the 60 s ticket residual.
- **§2e:** "Dati rotti" now describes the WR-05 choice (a travelling companion loses the lane with refunds, no move, no push).
- **§2f:** the "quests non avviate e aid aperti" row gains the native string-form cleanup and the aid conclusion and release (WR-04).
- **§2g:**
  - step 1 now covers registry, late pass and sockets;
  - step 5 is the non-awaited kick;
  - "Ritratti" covers the app-cloud binding, the public-id guard over every surviving character, the `nextAttemptAt` field, the backoff, the 10-attempt cap and the single ERROR.
- **§6:** entries for the new cases (CR-01, WR-01..05, publisher).
- **§7:**
  - task 4: the string-form sentence is corrected (true now for started, unstarted, open-aid and concluded quests; it was false for unstarted quests and open aids before WR-04);
  - "Punti aperti": the "no retry cap" and "no rate limit" points are replaced by their resolution;
  - new open points: the CR-01 residual risk with the proposed uploader-registry follow-up, IN-08, IN-04, and the role-from-JWT half of IN-06.

---

_Fixed: 2026-11-25T03:05:16Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
