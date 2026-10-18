---
phase: 05-infrastruttura-push-fcm
reviewed: 2026-10-18T00:00:00Z
depth: standard
files_reviewed: 52
files_reviewed_list:
  - src/app.module.ts
  - src/characters/spell-recovery.processor.int-spec.ts
  - src/config/auth-config.ts
  - src/config/env-keys.ts
  - src/config/env-keys.spec.ts
  - src/config/env.validation.ts
  - src/config/env.validation.spec.ts
  - src/config/push-config.ts
  - src/config/push-config.spec.ts
  - src/push/dto/push-delivery-report.model.ts
  - src/push/dto/register-push-device.input.ts
  - src/push/dto/send-test-push.input.ts
  - src/push/push-delivery.ts
  - src/push/push-delivery.spec.ts
  - src/push/push-device-index.verifier.ts
  - src/push/push-device-index.verifier.spec.ts
  - src/push/push-device-input.validator.ts
  - src/push/push-device-input.validator.spec.ts
  - src/push/push-device.model.ts
  - src/push/push-device.registry.ts
  - src/push/push-device.registry.int-spec.ts
  - src/push/push-error-code.enum.ts
  - src/push/push-event-type.enum.ts
  - src/push/push-events.ts
  - src/push/push-events.spec.ts
  - src/push/push-message.ts
  - src/push/push-platform.enum.ts
  - src/push/push-startup.reporter.ts
  - src/push/push-startup.reporter.spec.ts
  - src/push/push.exception.ts
  - src/push/push.exception.spec.ts
  - src/push/push.module.ts
  - src/push/push.resolver.ts
  - src/push/push.resolver.int-spec.ts
  - src/push/push.service.ts
  - src/push/push.service.spec.ts
  - src/push/transport/fcm-message.ts
  - src/push/transport/fcm-message.spec.ts
  - src/push/transport/fcm-push-transport.ts
  - src/push/transport/fcm-push-transport.spec.ts
  - src/push/transport/noop-push-transport.ts
  - src/push/transport/noop-push-transport.spec.ts
  - src/push/transport/push-transport.provider.ts
  - src/push/transport/push-transport.ts
  - src/schema.gql
  - test/app.int-spec.ts
  - test/push/fake-push-transport.ts
  - .env.example
  - .gitignore
  - package.json
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-10-18
**Depth:** standard
**Files Reviewed:** 52 (the prompt list has 49 distinct entries plus 3 counted specs; list above is authoritative)
**Status:** issues_found

## Summary

The phase is well built. The claim sequence (delete-others by token with `$nor`, then upsert with `returnDocument: 'before'`, one retry on E11000) keeps both unique-index invariants under concurrency: the loser of a race hits the duplicate key, retries, and its `deleteMany` removes the winner. Identity comes only from the bearer, `sendTestPush` has `@Roles(innkeeper)` and is covered by the automatic admin audit interceptor (it audits `Mutation` fields with the innkeeper role, target `PushDeliveryReport`), and the app boot test pins both the public/innkeeper handler whitelists and the schema. `sendToUser`/`broadcast` cannot throw: the only code outside the `try` is the `transport.enabled` read, and the transport adapter itself catches everything. The data-only FCM shape is correct (all `data` values are strings, Android `ttl` in ms, `apns-expiration` as absolute epoch seconds, `apns-priority: 5` with push type `background`). `parsePushConfig` uses fixed messages that name only the variable or field, and the reporter logs only `project_id`. BACKEND-NOTES matches the code in every point I checked (SDL, payload keys, TTLs, error codes, pruning table, audit target, signatures).

One real concern: the `invalid-argument` witness rule can still mass-prune a whole platform. The rest are minor.

## Warnings

### WR-01: witness rule can mass-prune every token of one platform

**File:** `src/push/push-delivery.ts:44-58` (rule), `src/push/push.service.ts:70-76` (batch = all tokens of one user)
**Issue:** `prunableTokens` treats any delivered token in the same batch as proof that `messaging/invalid-argument` means "dead token". A batch is not homogeneous: it mixes Android and iOS tokens (a user with one phone of each, or the first 500 of a mixed list). FCM returns `INVALID_ARGUMENT` also for platform-specific payload problems (malformed `apns` headers or payload, which is exactly the area this phase hand-builds). If the APNs part is ever rejected (header regression, Apple rule change, bad `apns-expiration`), every Android token delivers, becomes the witness, and every iOS token of the batch is deleted from `push_devices`. The registered devices silently disappear until the FE re-registers (next app start), which is the "never mass-prune" failure mode the witness was meant to prevent. The witness only rules out failures that hit the whole message, not failures that hit one platform's slice of it.
**Fix:** Either stop pruning on `invalid-argument` at all (only the two explicit stale codes; a truly dead token is reported with `registration-token-not-registered` in practice, and TTL plus re-registration clean the rest), or make the witness platform-scoped by carrying `platform` through the port:
```ts
// TokenDeliveryOutcome gains platform; tokensOf returns {token, platform}
const witnesses = new Set(batch.filter(o => o.delivered).map(o => o.platform));
// prunable only if witnesses.has(outcome.platform)
```
The simplest, safest change is the first one (drop `suspectToken` from `isPrunable`, keep the ERROR log branch for it), and update the BACKEND-NOTES table and `push-delivery.spec.ts` accordingly.

## Info

### IN-01: a failed prune hides the delivery result and logs a misleading message

**File:** `src/push/push.service.ts:77-90`
**Issue:** `registry.removeTokens` runs inside the same `try` as the sends. If the delete throws after FCM already accepted the messages, the catch logs `Push X not sent: ...` and returns `emptyDelivery()`: the log says "not sent" for messages that were sent, and `sendTestPush` reports `targeted: 0, sent: 0`, which the game master would read as "user has no devices". Never throws into callers, so correctness of the contract holds; only diagnostics suffer.
**Fix:** Wrap only the prune step, e.g. `const pruned = await this.pruneBestEffort(prunable)` (logs `prune failed: ...`, returns 0), so `deliveryCountsOf(outcomes, pruned)` is still returned.

### IN-02: claim retries only once; a third contender surfaces a raw duplicate-key error

**File:** `src/push/push-device.registry.ts:27-36`
**Issue:** The second `claimOnce` is not guarded. With three or more concurrent claims of the same token on different rows, the retry can itself hit E11000 and the raw `MongoServerError` reaches the client as a generic internal error (the `registerPushDevice` is not retried by the FE as a bug, but the device ends up unregistered until the next start). Very unlikely, and the invariants are never violated.
**Fix:** Loop with a small bound (for example 3 attempts) before rethrowing:
```ts
for (let attempt = 1; ; attempt += 1) {
    try { return await this.claimOnce(registration, now); }
    catch (error) {
        if (!isDuplicateKeyError(error) || attempt === MAX_CLAIM_ATTEMPTS) throw error;
    }
}
```

### IN-03: `sendTestPush` `id` is unvalidated and tokens leave a 6-character suffix in logs

**File:** `src/push/dto/send-test-push.input.ts:14-15`, `src/push/push-events.ts:55-56`, `src/push/push.service.ts:49-52, 160-174`
**Issue:** (a) The game master supplies `id` verbatim into `data.id`; a very long value makes every token fail with `payload-size-limit-exceeded` (logged as ERROR, nothing pruned, so safe) and there is no length/charset check, unlike `deviceId`/`token`. Innkeeper-only, so low risk. (b) `tokenSuffix` writes the last 6 characters of an FCM token to the log on topic-management failures. It is documented in BACKEND-NOTES and low entropy, but the stated policy is "no token value in logs"; the transport adapter already logs codes only.
**Fix:** Reuse a small validator for `id` (for example `/^[A-Za-z0-9._-]{1,128}$/` or ObjectId hex) and drop the suffix, or keep it and keep the note.

### IN-04: minor duplication and a topic subscribe/unsubscribe race

**File:** `src/push/push.service.ts:20-27, 195-235`; `src/push/push.service.ts:121-138`
**Issue:** `reportFailures` classifies each failed outcome twice (`rejected`, `transient`) and the `PAYLOAD_REJECTION_KINDS` set restates knowledge that lives in `push-delivery.ts`; a `groupByFailureKind` helper there would remove the duplication. Separately, `registerDevice` (subscribe) and `unregisterPushDevice` (unsubscribe) for the same token are not ordered, so a concurrent pair can leave a token subscribed to `streamer-live` without a row. The topic is a public broadcast and the next registration repairs it (D-09), so this is accepted best-effort behaviour, noted only for completeness.
**Fix:** Optional refactor of `reportFailures`; no code change needed for the race.

---

_Reviewed: 2026-10-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
