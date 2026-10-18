---
phase: 05-infrastruttura-push-fcm
fixed_at: 2026-10-18T00:00:00Z
review_path: .planning/phases/05-infrastruttura-push-fcm/05-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 3
accepted: 2
skipped: 0
status: all_fixed
outcomes:
  WR-01: fixed
  IN-01: fixed
  IN-02: accepted
  IN-03: accepted
  IN-04a: fixed
  IN-04b: accepted
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-10-18
**Source review:** .planning/phases/05-infrastruttura-push-fcm/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (WR-01, IN-01..IN-04; IN-04 split into IN-04a duplication and IN-04b topic race)
- Fixed: WR-01, IN-01, IN-04a
- Accepted with rationale (no code change): IN-02, IN-03, IN-04b
- Skipped: 0

Every fix went TDD: a RED test commit first (failure shown before the fix), then the GREEN `fix`/`refactor` commit. Order: WR-01, IN-01, IN-04a, then the docs.

## Fixed Issues

### WR-01: witness rule can mass-prune every token of one platform

**Files modified:** `src/push/push-delivery.ts`, `src/push/push.service.ts`, `src/push/push-delivery.spec.ts`, `src/push/push.service.spec.ts`
**Commits:**
- `1fae79e` test(push): require invalid-argument failures to keep the token (WR-01) (RED: 3 failing tests)
- `4c0abc5` fix(push): never prune tokens on invalid-argument (WR-01) (GREEN)

**Applied fix:** The witness rule is gone. `messaging/invalid-argument` now belongs to `PAYLOAD_ERROR_CODES` and is classified as `payload`, so it is logged at ERROR (counts and codes, no tokens), the token stays, and the report counts it in `failed`. `DeliveryFailureKind.suspectToken`, `SUSPECT_TOKEN_CODE`, `isPrunable` and the `hasWitness` logic were deleted; `prunableTokens` keeps only `staleToken` (`registration-token-not-registered`, `invalid-registration-token`). `PAYLOAD_REJECTION_KINDS` in the service was removed because it no longer had a reason to exist.
**Why:** a multicast batch mixes Android and iOS tokens. If FCM rejects the payload for one platform only, the other platform's deliveries would act as witnesses and every token of the rejected platform would be deleted. The real stale-token signal is `not-registered`. The registration validator already rejects malformed tokens, and a bad token that survives only costs one failed send until TTL or `not-registered` removes it.
**Tests:** the witness tests were replaced. Added: `classifyDeliveryFailure` treats `invalid-argument` as a payload error; `prunableTokens` prunes only the stale codes and never prunes `invalid-argument` even when sibling tokens were delivered; `PushService` "keeps an invalid-argument token even when another token of the batch was delivered" checks report `{2,1,0,1}`, no `removeTokens` call, both tokens still present, one ERROR line with `messaging/invalid-argument×1` and no token in it. The "no delivered token" case was kept.

### IN-01: a failed prune hides the delivery result and logs a misleading message

**Files modified:** `src/push/push.service.ts`, `src/push/push.service.spec.ts`
**Commits:**
- `987a481` test(push): require the delivery report to survive a failed prune (IN-01) (RED)
- `2c64fff` fix(push): keep the delivery report when pruning fails (IN-01) (GREEN)

**Applied fix:** the pruning step now runs in its own private `pruneBestEffort(type, tokens)`. It returns 0 for an empty list and does no I/O. If `registry.removeTokens` throws, it logs WARN `Push <type>: pruning failed for N stale token(s): <ErrorName, code>` (no tokens and no error message) and returns 0. `sendToUser` then still returns the delivery's `targeted/sent/failed` with `pruned: 0`. The outer catch, which logs "not sent" and returns an empty report, now fires only for failures before or during the send.
**Tests:** "keeps the delivery report when pruning fails" uses a registry whose `removeTokens` rejects with an error whose message contains a token. It checks the report is `{2,1,0,1}`, exactly one WARN containing `pruning failed`, no `not sent` line, and no token in the logs.

### IN-04a: double classification in `reportFailures`

**Files modified:** `src/push/push-delivery.ts`, `src/push/push.service.ts`, `src/push/push-delivery.spec.ts`
**Commits:**
- `7f5567d` test(push): require a single failure classification per outcome (IN-04) (RED)
- `6628572` refactor(push): classify each delivery failure once (IN-04) (GREEN)

**Applied fix:** this was a trivial Boy Scout refactor, so it was done. After WR-01, a failed outcome that is not pruned is exactly `payload` or `transient`. The new pure helper `failuresByKind(outcomes)` in `push-delivery.ts` classifies each failed outcome once into a `Record<DeliveryFailureKind, TokenDeliveryOutcome[]>`. `reportFailures` reads the `payload` and `transient` groups and no longer needs the `prunable` parameter or the `pruneSet` filter. `classifyDeliveryFailure` is no longer imported by the service, so the classification knowledge lives only in `push-delivery.ts`. The existing service tests stayed green without changes.
**Tests:** `failuresByKind` puts each kind (stale, payload, transient, including a missing code) in its group and skips delivered outcomes. When every token was delivered, all groups are empty.

### Docs

- `59f9d5b` docs(phase-5): record the review fixes in the backend notes. In the BACKEND-NOTES §7 FCM codes table, `invalid-argument` moved into the "ERROR, nothing pruned, counted in `failed`" row, the witness-rule wording was removed, and a paragraph on best-effort pruning (IN-01) was added. `05-CONTEXT.md` D-08 got the note: "WR-01 (review 2026-10-18): la regola del testimone è stata rimossa — `invalid-argument` non fa mai pruning".

## Accepted Issues

### IN-02: claim retries only once

**File:** `src/push/push-device.registry.ts:27-36`
**Decision:** accepted, no code change. The unique-index invariants always hold, as the review itself confirms. A raw duplicate-key error needs three or more claims of the **same token** on different rows at the same instant. A token identifies one physical device, so concurrent claims from three different rows cannot happen by construction. The existing single retry covers the realistic case (re-registration racing a stale row).

### IN-03: `sendTestPush` `id` unvalidated; 6-character token suffix in logs

**Files:** `src/push/dto/send-test-push.input.ts`, `src/push/push.service.ts`
**Decision:** accepted, no code change.
- (a) `sendTestPush` is innkeeper-only and audited automatically. An oversized `id` makes FCM reject the message (`invalid-argument` or `payload-size-limit-exceeded`). After WR-01 that is an ERROR-logged failure with no pruning. General input validation (`class-validator`) is scheduled for Phase 10.
- (b) A 6-character suffix cannot identify or rebuild an FCM token of about 160 characters. It is kept so topic-management failures can be correlated in the logs, and it is documented in BACKEND-NOTES §7.

### IN-04b: topic subscribe/unsubscribe race

**File:** `src/push/push.service.ts` (`registerDevice` / `unregisterDevice`)
**Decision:** accepted, no code change. Topic management is best-effort by design (D-09). `streamer-live` is a public broadcast, and the next registration of the device re-subscribes it idempotently, which repairs any drift.

## Verification

- `npx jest src/push src/config --selectProjects unit`: **14 suites, 221 tests passed**
- `npx jest src/push test/app.int-spec.ts --selectProjects integration --runInBand`: **3 suites, 53 tests passed**
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 20 passed; `git diff --exit-code src/schema.gql`: unchanged
- `npx tsc --noEmit -p tsconfig.build.json`: clean. `npx prettier --write` and `npx eslint` were run on touched files only and are clean.
- firebase-admin is never contacted: `FakePushTransport` and the in-memory registry are used, with no `jest.mock`.

---

_Fixed: 2026-10-18_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
