---
phase: 06-eventsub-punti-canale-streamer-live
plan: 02
subsystem: eventsub
tags: [eventsub, twitch, webhook, hmac, timing-safe, replay-window, parsing]
requires:
  - "06-01: TWITCH_USER_ID_PATTERN from src/config/eventsub-config.ts"
provides:
  - "src/eventsub/eventsub-types.ts: EventSubMessageType, EventSubSubscriptionType, EVENTSUB_SUBSCRIPTION_VERSION, AUTHORIZATION_REVOKED_STATUS, STREAMER_SCOPE_REMEDY"
  - "src/eventsub/eventsub-headers.ts: EVENTSUB_HEADER, MAX_EVENTSUB_HEADER_LENGTH, EventSubHeaders, readEventSubHeaders"
  - "src/eventsub/eventsub-signature.ts: verifyEventSubSignature, REPLAY_WINDOW_MS, MAX_FUTURE_SKEW_MS, SignedHeaders"
  - "src/eventsub/eventsub-payload.ts: RedemptionEvent, StreamOnlineEvent, RevocationNotice, NotificationPayload, parseNotification, parseChallenge, parseRevocation, UNKNOWN_SUBSCRIPTION_TYPE, MAX_CHALLENGE_LENGTH"
  - "test/eventsub/eventsub-fixtures.ts: TEST_EVENTSUB_SECRET, TEST_BROADCASTER_ID, TEST_VIEWER_TWITCH_ID, TEST_CHALLENGE, signEventSub, signedEventSubRequest, redemptionNotification, streamOnlineNotification, verificationChallenge, revocationMessage"
affects: [06-03, 06-07, 06-09]
tech-stack:
  added: []
  patterns:
    - "pure webhook functions tested by table, no HTTP and no DB"
    - "HMAC over raw bytes, length check before timingSafeEqual"
    - "discriminated parse result (redemption / streamOnline / unsupported / invalid) carrying only validated primitives"
    - "fixture overrides keyed by Object.hasOwn: null stays null, undefined removes the field, omitEvent drops event"
key-files:
  created:
    - src/eventsub/eventsub-types.ts
    - src/eventsub/eventsub-headers.ts
    - src/eventsub/eventsub-headers.spec.ts
    - src/eventsub/eventsub-signature.ts
    - src/eventsub/eventsub-signature.spec.ts
    - src/eventsub/eventsub-payload.ts
    - src/eventsub/eventsub-payload.spec.ts
    - test/eventsub/eventsub-fixtures.ts
  modified: []
decisions:
  - "Notification routing reads subscription.type from the signed body; the twitch-eventsub-subscription-type header is never read"
  - "parseNotification dispatches through a Map keyed by EventSubSubscriptionType: no enum/string comparison lint warnings, and a type such as 'constructor' cannot resolve to an Object.prototype member"
  - "parseRevocation requires non-empty id, type and status; anything else returns null"
metrics:
  duration: 6 min
  completed: 2026-10-19
  tasks: 3
  files: 8
---

# Phase 6 Plan 02: EventSub pure webhook functions Summary

The webhook now has its trust and parsing layer as pure functions. Headers are read strictly, the signature is an HMAC-SHA256 over the raw bytes compared in constant time within a 10 min / +60 s replay window, and every Twitch body reduces to a discriminated result holding only validated strings and positive safe integers. Signed fixtures shared by unit and integration specs reproduce the bodies captured from the Twitch CLI.

## What was built

- **Task 1:** `eventsub-types.ts` holds the domain constants exactly as the plan lists them. `readEventSubHeaders` requires each of the four `twitch-eventsub-message-*` headers to be one non-empty string of at most 200 characters. Missing, empty, array or oversized values give `null`, extra headers are ignored, and the subscription-type header is not read. `test/eventsub/eventsub-fixtures.ts` serializes the body once and signs that exact string. Its builders follow the override semantics: a key present in `overrides` wins via `Object.hasOwn`, `null` stays in the body, `undefined` removes the field, and `omitEvent: true` leaves only `subscription`.
- **Task 2:** `verifyEventSubSignature` follows RESEARCH Code Example §1. It returns false on a missing body or empty secret, then builds the HMAC from id, timestamp and raw body. A different buffer length returns false, then `timingSafeEqual` runs, then the replay window is checked. The file does no re-serialization.
- **Task 3:** `parseNotification` returns `redemption` (event id, numeric broadcaster and user ids, reward id, positive safe-integer cost), `streamOnline` (any non-empty `type`, per D-15), `unsupported` for types it has no parser for, and `invalid` with the subscription type, or `unknown` when the type itself is unreadable. `parseChallenge` caps the challenge at 1000 characters. `parseRevocation` returns `{ subscriptionId, type, status }`.

## TDD evidence

- **Task 1 RED** (`cb771cd`): `Cannot find module 'src/eventsub/eventsub-headers'`, 1 suite failed, 0 tests ran. **GREEN** (`0d4572d`): 1 suite / 19 tests passed.
- **Task 2 RED** (`8f3856b`): `Could not locate module src/eventsub/eventsub-signature`, 1 suite failed, 0 tests ran. **GREEN** (`a22555a`): 1 suite / 15 tests passed.
- **Task 3 RED** (`81dd211`): `Could not locate module src/eventsub/eventsub-payload`, 1 suite failed, 0 tests ran. **GREEN** (`eff606d`): `npx jest src/eventsub --selectProjects unit` gives 3 suites / 108 tests passed.

## Final gate

- Unit: **70 suites / 980 tests** passed (baseline 67 / 872, plus 3 suites and 108 tests).
- Integration (`--runInBand`): **43 suites / 515 tests** passed, unchanged.
- `npm run build`: exit 0.
- Filtered lint gate: **0 lines**. `npx eslint` on every touched file shows no warnings.
- Phase grep gates: no `@Public()` literal under `src/eventsub`. None of the reserved names (`$inc`, `await this.push`, `channel:manage:redemptions`, `TWITCH_REWARD_ID`, `admin_audit`, `jest.mock(`) appears in `src/eventsub` or `test/eventsub`. `JSON.` does not appear in `eventsub-signature.ts`, and neither `reward_id` nor `TWITCH_REWARD_ID` appears in `eventsub-payload.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing-body case in the signature spec passed vacuously**
- **Found during:** Task 2 GREEN
- **Issue:** the `verify()` test helper had a defaulted `rawBody` parameter. Passing `undefined` fell back to the valid body, so the "rejects a missing raw body" case got `true`.
- **Fix:** that case now calls `verifyEventSubSignature(headers, undefined, secret, NOW)` directly. The implementation was not changed.
- **Files modified:** `src/eventsub/eventsub-signature.spec.ts`
- **Commit:** `a22555a`

**2. [Rule 1 - Lint] Enum/string comparison warnings in parseNotification**
- **Found during:** Task 3 GREEN
- **Issue:** comparing the body's `string` with `EventSubSubscriptionType` members raised two `@typescript-eslint/no-unsafe-enum-comparison` warnings.
- **Fix:** dispatch goes through `Map<string, parser>` keyed by the enum values. This also stops a type such as `constructor` from resolving to an inherited member. Behavior matches the spec.
- **Files modified:** `src/eventsub/eventsub-payload.ts`
- **Commit:** `eff606d`

### Process notes

- Two commit subjects were shortened to fit 72 characters. The Task 2 GREEN subject is `feat(eventsub): verify webhook signatures timing-safe in replay window`. The Task 3 GREEN subject is `feat(eventsub): parse notification, challenge and revocation bodies`.
- The specs go slightly beyond `<behavior>`:
  - a JSON round-trip of the redemption body;
  - checks of the `null` and `undefined` override semantics;
  - a non-object `reward`;
  - invalid `stream.online` broadcaster ids, event id and empty type;
  - a 1000-character challenge accepted;
  - revocations missing status or type.
- `.planning/REQUIREMENTS.md` was left untouched on purpose, because plan 06-09 marks the requirements.

## Known Stubs

None. The module has no Nest provider yet, by design; the controller and service are wired in later plans (06-03, 06-07).

## Self-Check: PASSED
