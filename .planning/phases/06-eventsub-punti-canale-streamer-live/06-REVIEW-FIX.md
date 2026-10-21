---
phase: 06-eventsub-punti-canale-streamer-live
fixed_at: 2026-10-20T00:00:00Z
review_path: .planning/phases/06-eventsub-punti-canale-streamer-live/06-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
not_needed: 0
status: complete
outcomes:
  WR-01: fixed
  IN-01: fixed
  IN-02: fixed
  IN-03: fixed
  IN-04: fixed
  IN-05: fixed
---

# Phase 06: Code Review Fix Report

**Fixed at:** 2026-10-20
**Source review:** .planning/phases/06-eventsub-punti-canale-streamer-live/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (WR-01, IN-01..IN-05)
- Fixed: 6. IN-01 took two commits: the length cap, then the WARN throttle.
- Skipped: 0
- Not needed: 0

Every behaviour change went TDD. The new or updated spec was run red first, then the fix made it green. The spec and the fix share one commit per finding. IN-02 is a rename with no behaviour change, so the existing specs were renamed and stayed green.

| Finding | Outcome | Commit(s) | Note |
| ------- | ------- | --------- | ---- |
| WR-01 | fixed | `9f8c8e8` | A rerun requested during a failed run still runs. Only the last failure is rethrown, and the loop is bounded. |
| IN-04 | fixed | `29518b4` | The summary lists `removed [...]` (successful deletions only) and adds `removeFailed [...]` when some fail. |
| IN-03 | fixed | `ee2a7cf` | The 401 body is cancelled before the retry. `invalidate(rejectedToken)` clears the cache only if it still holds that token. |
| IN-05 | fixed | `989fb64` | `request failed (TimeoutError / AbortError / TypeError / UnknownError)`: the name only, never the message. |
| IN-02 | fixed | `a488e4e` | `describeMongoError` was renamed to `describeError` at every call site (8 files), with no behaviour change. |
| IN-01 | fixed | `9844e1c`, `d1aa879` | Type, id and status are capped at 100 characters plus `…`. Rejected-request WARNs are throttled to one per minute per reason, with a count of the suppressed ones. |

## Fixed Issues

### WR-01: a reconcile requested during a run that then fails is lost until the hourly timer

**Files modified:** `src/eventsub/subscriptions/eventsub-subscription.manager.ts`, `src/eventsub/subscriptions/eventsub-subscription.manager.spec.ts`
**Commit:** `9f8c8e8` fix(eventsub): run the requested reconcile even after a failed run
**Applied fix:** `runUntilSettled` no longer lets the error out of the `do/while`. `runCapturingFailure` runs `runOnce` and returns `{ error }` or `null`. The loop repeats while `rerunRequested` is true, and only at the end does it rethrow the last failure. If the rerun succeeds, `reconcile()` resolves, so a revocation that arrived during a failing reconcile gets repaired right away (D-14). The loop stays bounded by the number of requests: if the rerun fails too, the promise rejects once. `reconcileSafely` keeps logging the error as before.
**Tests:** "still runs the requested rerun when the current run fails": the first `list` rejects, a second `reconcile()` arrives during the run, and the result is 2 `list` calls, the promise resolves, and both subscriptions get created. "rejects once when the requested rerun fails as well": a persistent `failList(503)` gives exactly 2 `list` calls and one rejection.

### IN-04: the summary reported failed deletions as "removed"

**Files modified:** `src/eventsub/subscriptions/eventsub-subscription.manager.ts`, `src/eventsub/subscriptions/eventsub-subscription.manager.spec.ts`
**Commit:** `29518b4` fix(eventsub): report failed deletions apart in the reconcile summary
**Applied fix:** `removeSubscription` returns `boolean`. `runOnce` fills `removed` with only the successful deletions and `removeFailed` with the failed ones. The summary appends `, removeFailed [...]` only when that list is not empty, so the format of a clean run does not change. The per-deletion ERROR stays.
**Tests:** "lists only the successful deletions as removed in the summary": of two stale subscriptions, one has a failing delete. The summary contains `removed [stream.online sub-2 …` and `removeFailed [<redemption> sub-1 user_removed]`.

### IN-03: unconsumed 401 response and an `invalidate()` that could drop a renewed token

**Files modified:** `src/eventsub/helix/http-twitch-helix.client.ts`, `src/eventsub/helix/twitch-app-token.cache.ts`, and their specs
**Commit:** `ee2a7cf` fix(eventsub): release the 401 body and invalidate only the stale token
**Applied fix:** `sendAuthorized` now returns `{ response, accessToken }`. On a 401, `authorizedRequest` calls `await response.body?.cancel().catch(() => undefined)`, because a failed cancel must not block the retry. It then calls `tokens.invalidate(accessToken)` and retries once, as before. `TwitchAppTokenCache.invalidate(rejectedToken)` clears `cached` only when `cached.accessToken === rejectedToken`, so a token renewed concurrently survives. Single-flight, the single retry on 401, and D-13 are unchanged.
**Tests:** client: "releases the body of the rejected 401 before retrying" checks `bodyUsed === true` on the 401 `Response` with a body. Cache: "keeps a renewed token when an older one is invalidated" gets token-1, invalidates it, gets token-2, invalidates token-1 again, and expects token-2 still in cache with 2 requests in total. The existing `invalidate` test now passes the token.

### IN-05: `sendTwitchRequest` lost the cause of the network error

**Files modified:** `src/eventsub/helix/twitch-http.ts`, `src/eventsub/helix/twitch-helix.client.spec.ts`, `src/eventsub/helix/http-twitch-helix.client.spec.ts`
**Commit:** `989fb64` fix(eventsub): name the cause of a failed Twitch request
**Applied fix:** the `catch` builds `"<operation> request failed (<name>)"`. `errorNameOf` reads `name` by shape (an object with a non-empty string `name`, otherwise `UnknownError`) and never reads `message`, so URLs, tokens and network details are never included (D-13). It reads by shape rather than with `instanceof Error` because the `DOMException` raised by `AbortSignal.timeout` can come from another realm. That happens under Jest, where `instanceof Error` returned false.
**Tests:** `it.each` over `DOMException('…token=abc', 'TimeoutError')` and `TypeError('fetch failed token=abc')` gives distinct messages `Op request failed (TimeoutError)` and `(TypeError)`, with no `token=abc`. A non-error rejection gives `(UnknownError)`. The existing expectations were updated to `(Error)`.

### IN-02: `describeMongoError` used for errors that are not Mongo errors

**Files modified:** `src/mongo/mongo-errors.ts`, `src/mongo/mongo-errors.spec.ts`, `src/eventsub/eventsub-webhook.service.ts`, `src/eventsub/eventsub-message-index.verifier.ts`, `src/push/push-device-index.verifier.ts`, `src/users/twitch-id-index.verifier.ts`, `src/characters/creation/character-name-index.verifier.ts`, `src/characters/creation/starting-cities.reporter.ts`
**Commit:** `a488e4e` refactor(eventsub): rename describeMongoError to describeError
**Applied fix:** a pure rename at every call site, without an alias, so there is no duplication. The behaviour is identical: `name` plus the optional `code`, never the message. Prettier collapsed one import in `twitch-id-index.verifier.ts` onto a single line.
**Tests:** the existing `mongo-errors.spec.ts` specs were renamed and are green, and so are all the specs of the touched modules (600 unit tests across mongo, eventsub, users, push and characters).

### IN-01: body strings and unauthenticated requests reached the logs without a cap

**Files modified:** `src/eventsub/eventsub-payload.ts`, `src/eventsub/eventsub-payload.spec.ts` (cap); `src/eventsub/log-throttle.ts` (new), `src/eventsub/log-throttle.spec.ts` (new), `src/eventsub/eventsub-webhook.service.ts`, `src/eventsub/eventsub-webhook.service.spec.ts` (throttle)
**Commits:**
- `9844e1c` fix(eventsub): cap the body fields that reach the webhook logs
- `d1aa879` fix(eventsub): throttle the warnings for rejected webhook requests

**Applied fix (cap):** `MAX_LOGGED_FIELD_LENGTH = 100` and `loggableString` truncate with `…` the `subscription.type` in `parseNotification`, and `id`/`type`/`status` in `parseRevocation`. Values are truncated rather than rejected, so routing does not change. No real type reaches 100 characters, so an oversized type still falls into `unsupported` (204 + WARN), and a revocation with oversized fields still reconciles. The fields validated for Mongo (`event.id`, `user_id`, `reward.id`) are not touched, so dedupe and credit semantics are unchanged.
**Applied fix (throttle):** the new pure `LogThrottle(intervalMs)` with `admit(now)` returns `null` when the message must be suppressed, or else the number of messages suppressed since the last admitted one. The service has two instances, one for missing headers and one for invalid signature or replay window, each with a 60 s interval on the injected `Clock`. The new private `reject()` always replies `FORBIDDEN` and logs the WARN only when admitted, adding ` (N similar rejections suppressed)` when N > 0. `clock.now()` moved before the header read, and the signature still comes before every branch (D-02). No dependency was added. Full rate limiting of the route stays with Phase 10.
**Tests:** payload: oversized type → `unsupported` with a 100-character value plus `…`; oversized revocation → three truncated fields; a field of exactly 100 characters stays intact. `LogThrottle`: the first message is admitted with 0, messages inside the interval are suppressed, and after the interval it admits with the suppressed count. Service: 3 forged requests plus one more after 60 s give exactly 2 WARNs, the second ending in `(2 similar rejections suppressed)`. The two reasons are throttled independently.

## Gates (after all fixes)

- `npm run test:unit`: 80 suites, **1114 passed** (baseline 1098, +16)
- `npm run test:int` (`--runInBand`): **550/550 tests passed** (baseline 550) on the final run (`Tests: 550 passed, 550 total`, 1389 s). Jest still flagged 2 of 46 suites (`shop-transaction.service.int-spec.ts`, `ws-auth.int-spec.ts`) for a 5 s `beforeAll`/`afterAll` hook timeout, under machine load (load average 5 to 15, with the in-memory replica set reporting `MongoNetworkTimeoutError`/`PoolClearedOnNetworkError` in the earlier runs). Across three full runs the flagged suites were different every time (equipment and archived characters, then character creation and auth-test-app, then shop and ws-auth), none of them is an EventSub suite, and every one passes on its own (35/35, 28/28 and 32/32 tests, 6 to 9 s). The changes outside `src/eventsub` are only the `describeError` rename in log strings. All EventSub integration suites (ledger, points, controller) passed in every run.
- `npm run build`: exit 0
- Filtered lint (`npx eslint "{src,apps,libs,test}/**/*.ts" --quiet | grep -E "^\s+[0-9]+:[0-9]+" | grep -vE "prettier/prettier|prefer-const"`): 0 rows
- `git diff --exit-code src/schema.gql`: exit 0
- Phase invariants: `@Public()` in `src/eventsub` = 1 (regex and literal); `await this.push` = 0; `jest.mock(` = 0; no forbidden terms in the added lines
- Formatting: `npx prettier --write` and `npx eslint` run only on the touched files

---

_Fixed: 2026-10-20_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
