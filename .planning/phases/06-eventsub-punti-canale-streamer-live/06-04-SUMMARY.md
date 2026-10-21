---
phase: 06-eventsub-punti-canale-streamer-live
plan: 04
subsystem: eventsub
tags: [eventsub, twitch, helix, client-credentials, app-access-token, fetch, fake]
requires:
  - "06-01: EVENTSUB_CONFIG, EventSubConfig / ManagedEventSubConfig / LocalEventSubConfig with clientId/clientSecret (src/config/eventsub-config.ts)"
  - "06-02: TEST_EVENTSUB_SECRET, TEST_BROADCASTER_ID (test/eventsub/eventsub-fixtures.ts)"
  - "Phase 2: TWITCH_TOKEN_URL (src/auth/twitch/http-twitch-oauth.client.ts), Clock, FixedClock"
provides:
  - "src/eventsub/helix/twitch-helix.client.ts: abstract TwitchHelixClient (DI token), EventSubSubscription, EventSubTransportInfo, CreateEventSubSubscriptionRequest, TwitchHelixError(message, status?), describeHelixError"
  - "src/eventsub/helix/twitch-http.ts: HELIX_REQUEST_TIMEOUT_MS, sendTwitchRequest, assertTwitchOk, readTwitchJson"
  - "src/eventsub/helix/twitch-app-token.cache.ts: TwitchAppTokenCache.getToken()/invalidate(), TOKEN_REFRESH_MARGIN_MS, NOT_MANAGED_MESSAGE"
  - "src/eventsub/helix/http-twitch-helix.client.ts: HttpTwitchHelixClient, HELIX_EVENTSUB_SUBSCRIPTIONS_URL, MAX_SUBSCRIPTION_PAGES"
  - "test/eventsub/fake-twitch-helix.client.ts: FakeTwitchHelixClient (seed, setStatus, failList/failCreate/failDelete, clearCalls, reset), HelixCall"
  - "test/eventsub/test-eventsub-config.ts: buildTestEventSubConfig, buildLocalEventSubConfig, TEST_CALLBACK_URL, TEST_LOCAL_CALLBACK_URL, TEST_HELIX_CLIENT_ID, TEST_HELIX_CLIENT_SECRET"
affects: [06-05, 06-07, 06-09]
tech-stack:
  added: []
  patterns:
    - "abstract class as DI port + Http adapter + in-memory fake with byte-identical error messages"
    - "single-flight promise cache with refresh margin; failed promise never cached"
    - "one retry after 401 with token invalidation, fresh AbortSignal per attempt"
    - "cursor pagination with a hard page cap"
key-files:
  created:
    - src/eventsub/helix/twitch-helix.client.ts
    - src/eventsub/helix/twitch-helix.client.spec.ts
    - src/eventsub/helix/twitch-http.ts
    - src/eventsub/helix/twitch-app-token.cache.ts
    - src/eventsub/helix/twitch-app-token.cache.spec.ts
    - src/eventsub/helix/http-twitch-helix.client.ts
    - src/eventsub/helix/http-twitch-helix.client.spec.ts
    - test/eventsub/fake-twitch-helix.client.ts
    - test/eventsub/test-eventsub-config.ts
  modified: []
decisions:
  - "The Helix client checks the managed mode itself (NOT_MANAGED_MESSAGE, no fetch) besides the token cache, so a misconfigured environment never sends a request"
  - "A 202 create response without a subscription in data rejects with 'Helix create subscription response is missing the subscription' instead of returning a fabricated object"
  - "Helix list items without a string id are dropped; missing status/type/version/created_at map to empty strings, missing callback to null, a non-JSON string condition to {}"
  - "test-eventsub-config exports the fictitious client id/secret as TEST_HELIX_CLIENT_ID / TEST_HELIX_CLIENT_SECRET so later specs reuse them"
metrics:
  duration: 8 min
  completed: 2026-10-19
  tasks: 3
  files: 9
---

# Phase 6 Plan 04: Helix client and app access token Summary

Abstract `TwitchHelixClient` port with secret-free `TwitchHelixError { status }`, an in-memory single-flight `TwitchAppTokenCache` (client credentials, 5-minute refresh margin, `invalidate()`), and `HttpTwitchHelixClient` on native `fetch` (Bearer + Client-Id, 5 s timeout per request, cursor pagination capped at 20 pages, one retry after a 401, idempotent DELETE 404), plus a `FakeTwitchHelixClient` whose error messages match the real client byte for byte.

## Tasks

| Task | Name | RED commit | GREEN commit |
| ---- | ---- | ---------- | ------------ |
| 1 | Helix port, error helpers, fake, test config | a95844b | 436dc69 (+ f2225f1 fix) |
| 2 | TwitchAppTokenCache | 31ec7d9 | 3a6f2cc |
| 3 | HttpTwitchHelixClient | 021d476 | 733cfdf |

### RED evidence

- Task 1: `npx jest src/eventsub/helix/twitch-helix.client.spec.ts --selectProjects unit` -> 1 suite failed, `Could not locate module src/eventsub/helix/twitch-helix.client`.
- Task 2: `npx jest src/eventsub/helix/twitch-app-token.cache.spec.ts --selectProjects unit` -> 1 suite failed, module `src/eventsub/helix/twitch-app-token.cache` not found.
- Task 3: `npx jest src/eventsub/helix/http-twitch-helix.client.spec.ts --selectProjects unit` -> 1 suite failed, `Could not locate module src/eventsub/helix/http-twitch-helix.client`.

### Behaviour covered (38 unit tests across 3 suites)

- Errors: name/status/message, `describeHelixError` (TwitchHelixError -> message, foreign Error -> name only, other -> `UnknownError`), network failure -> `Op request failed` without `cause` or details, non-2xx resolved by `sendTwitchRequest` and rejected by `assertTwitchOk` with status, invalid JSON.
- Token cache: form-urlencoded client credentials POST to `TWITCH_TOKEN_URL`, reuse, refresh at exactly `expires_in - 300 s` and not at `- 301 s`, 3 concurrent callers -> 1 fetch, `invalidate()`, `expires_in` missing or 0 -> no reuse, 400 -> `Twitch app token failed with status 400` without the client secret and retried next call, missing `access_token`, local/disabled mode -> `EventSub subscriptions are not managed in this environment` without fetch.
- Helix client: GET with `Authorization: Bearer` + `Client-Id`, mapping to `createdAt`, `after=c1` on page 2, string/invalid conditions, items without id dropped, missing callback -> null, 21 cursor pages -> `Helix list subscriptions exceeded 20 pages` after 20 calls, network down, non-managed mode, POST JSON body, 403/409 with status and no Twitch body, 202 without data, DELETE `?id=` 204/404/500, 401 -> invalidate + new token + retry with a fresh signal, double 401 -> status 401 after exactly 2 Helix calls. Every rejection is checked not to contain `app-token`, `test-client-secret` or the EventSub secret.

## Verification

- Unit: 75 suites / 1028 tests passed (baseline 72 / 990; +3 suites, +38 tests)
- Integration (`--runInBand`): 44 suites / 526 tests passed (unchanged)
- `npm run build`: exit 0
- Filtered lint (`npx eslint "{src,apps,libs,test}/**/*.ts" --quiet | grep ... | grep -vE "prettier/prettier|prefer-const"`): 0 lines
- Gate greps: no `@Public()` under src/eventsub, no `@twurple` in package.json/src, no `cause` in twitch-http.ts, no `https://id.twitch.tv` / `AUTH_CONFIG` / `TwitchOAuthConfig` in the token cache; `package.json` untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate `mode` key in buildTestEventSubConfig**
- **Found during:** Task 1 (typecheck after GREEN)
- **Issue:** the builder set `mode: 'managed'` both before and after the overrides spread; ts-jest did not flag it (the file is not yet imported by a spec) but `tsc` reports TS1117.
- **Fix:** kept a single `mode` before the spread; overrides are typed as `Partial<ManagedEventSubConfig>`, so the mode cannot change.
- **Files modified:** test/eventsub/test-eventsub-config.ts
- **Commit:** f2225f1

**2. [Rule 1 - Bug] Spec helper hid a missing `expires_in`**
- **Found during:** Task 2 GREEN
- **Issue:** `tokenResponse(token, expiresIn = EXPIRES_IN_SECONDS)` turned `undefined` into the default, so the "missing expires_in" case never sent a body without the field.
- **Fix:** the case now builds the body explicitly (`{}` / `{ expires_in: 0 }`); fixed in the GREEN commit 3a6f2cc.

**3. [Rule 2 - Correctness] Extra spec case for a 202 without a subscription**
- The create path rejects an empty `data` array instead of returning `undefined`; covered by one added test in the Task 3 spec.

**4. [Acceptance grep vs Prettier] `HELIX_EVENTSUB_SUBSCRIPTIONS_URL` on two lines**
- Prettier wraps the 100-character declaration, so the single-line grep `export const HELIX_EVENTSUB_SUBSCRIPTIONS_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions'` finds 0 lines; the export and the literal URL are both present (lines 23-24). Formatting rules take precedence.

**5. [Lint] `no-base-to-string` warning in the Task 3 spec**
- The fetch router used `String(input)` on `string | URL | Request`; replaced with `input instanceof Request ? input.url : input.toString()` before the GREEN commit.

## Known Stubs

None. The providers are intentionally not registered in any module yet (06-07 does it, per plan).

## Self-Check: PASSED

- All 9 created files exist; commits a95844b, 436dc69, f2225f1, 31ec7d9, 3a6f2cc, 021d476, 733cfdf present on the branch; no Co-Authored-By trailer.
