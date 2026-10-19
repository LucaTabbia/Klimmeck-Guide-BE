---
phase: 06-eventsub-punti-canale-streamer-live
plan: 01
subsystem: config
tags: [eventsub, twitch, config, fail-closed, oauth-scopes]
requires: []
provides:
  - "EVENTSUB_CONFIG / eventSubConfigProvider (EventSubConfig = disabled | local | managed)"
  - "parseEventSubConfig / readEventSubEnv / EVENTSUB_ENV_KEYS / TWITCH_USER_ID_PATTERN / RECONCILE_INTERVAL_MS"
  - "src/config/url-rules.ts: LOOPBACK_HOSTNAMES, hasWhitespaceOrControlCharacter, parseUrl (shared by auth and eventsub)"
  - "TwitchOAuthConfig.scopes from TWITCH_LOGIN_SCOPES, sent as the authorize url scope"
  - "validateEnv refuses production boot without EventSub (auth -> push -> eventsub)"
affects: [06-02, 06-03, 06-04, 06-05, 06-06, 06-07, 06-08, 06-09]
tech-stack:
  added: []
  patterns: ["pure fail-closed env parser with fixed error messages (same shape as push-config)", "discriminated config union by mode", "real-boot test blanks new env keys because process.env wins over .env"]
key-files:
  created:
    - src/config/url-rules.ts
    - src/config/eventsub-config.ts
    - src/config/eventsub-config.spec.ts
  modified:
    - src/config/auth-config.ts
    - src/config/auth-config.spec.ts
    - src/config/env.validation.ts
    - src/config/env.validation.spec.ts
    - src/auth/twitch/twitch-authorize-url.ts
    - src/auth/twitch/twitch-urls.spec.ts
    - test/auth/test-auth-config.ts
    - test/app.int-spec.ts
    - .env.example
decisions:
  - "EventSub config has three modes: disabled (all three vars blank, dev/test only), local (http localhost/127.0.0.1 callback outside production, never calls Helix), managed (https:443 callback, requires TWITCH_CLIENT_ID/SECRET read directly, no AUTH_CONFIG dependency)"
  - "Partial EventSub configuration is rejected in every environment, naming only the missing variables"
  - "TWITCH_LOGIN_SCOPES is validated before the Twitch keys check, so a malformed list rejects the boot even without Twitch credentials"
  - "validateEnv order auth -> push -> eventsub keeps the existing FIREBASE_SERVICE_ACCOUNT error expectations"
metrics:
  duration: 6 min
  completed: 2026-10-19
  tasks: 3
  files: 12
---

# Phase 6 Plan 01: EventSub configuration foundations Summary

`parseEventSubConfig` is a fail-closed parser with three modes (disabled / local / managed) and fixed messages that never echo a value. `TWITCH_LOGIN_SCOPES` now reaches the Twitch authorize url. `validateEnv` refuses a production boot without EventSub, and the real-boot test is unaffected by the partial local `.env`.

## What was built

- **Task 1:** `src/config/url-rules.ts`, a Boy Scout extraction of the URL rules that were private to `auth-config.ts`. No behaviour changed: `auth-config.spec.ts` is still green, 49/49. It also adds `src/config/eventsub-config.ts` with the exact signatures from the plan. The rules run in order:
  1. all three webhook vars blank gives disabled, or throws in production;
  2. a partial set throws "incomplete: missing …";
  3. the secret must match `/^[\x21-\x7E]{10,100}$/`;
  4. the callback is rejected if it has whitespace or control characters, a `#`, a parse failure or userinfo. Otherwise `https:` with an empty port gives managed, `http:` on loopback outside production gives local, and anything else throws. The value is normalized via `url.href`;
  5. the broadcaster id must match `TWITCH_USER_ID_PATTERN`;
  6. managed mode requires the client id and secret.
- **Task 2:** `TWITCH_LOGIN_SCOPES` is added to `AUTH_ENV_KEYS`. `TwitchOAuthConfig.scopes: readonly string[]` is parsed with split, filter, dedup and `TWITCH_SCOPE_PATTERN`. The authorize url uses `scope: twitch.scopes.join(' ')` and its comment was rewritten. `test-auth-config.ts` sets `scopes: []`, and `.env.example` gets the documented `TWITCH_LOGIN_SCOPES=`.
- **Task 3:** `validateEnv` calls `parseEventSubConfig(readEventSubEnv(env))` after push. `.env.example` gains the EventSub section, with empty values, the secret and broadcaster-id commands, the Twitch CLI recipe and the C2 note. In `test/app.int-spec.ts` the four new keys are blanked.

## TDD evidence

- **Task 1 RED** (`37b206d`): `Cannot find module 'src/config/eventsub-config'`, 1 suite failed, 0 tests ran. **GREEN** (`be80a15` refactor + `9e60e44` feat): `npx jest src/config --selectProjects unit` gives 5 suites / 124 tests passed.
- **Task 2 RED** (`6f7bff4`): 11 failed / 160 passed. They were the 9 auth-config cases (`scopes: []` equality plus the TWITCH_LOGIN_SCOPES describe) and the 2 new authorize-url scope cases. **GREEN** (`e57198f`): `npx jest src/config src/auth/twitch --selectProjects unit` gives 8 suites / 171 passed, and `npm run build` exits 0.
- **Task 3 RED** (`2c9e124`): 3 failed / 12 passed. These were production without EventSub, the partial local config, and `.env.example` keys. **GREEN** (`dd9594c`): unit config and twitch give 8 / 175 passed. `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` gives 1 suite / 20 passed. `git diff --exit-code src/schema.gql` exits 0 and `npm run build` exits 0.

## Final gate

- Unit: **67 suites / 872 tests** passed. The baseline was 66 / 810; the new suite is `eventsub-config.spec.ts`, plus new cases in the auth, twitch-urls and env.validation specs.
- Integration (`--runInBand`): **43 suites / 515 tests** passed, unchanged from the baseline.
- `npm run build`: exit 0.
- Filtered lint gate: **0 lines**.
- `src/schema.gql`: no drift, because this plan adds no GraphQL surface.

## Deviations from Plan

None in behaviour. Process notes:
- The Task 2 GREEN commit contains 4 files, not the "6 files" the plan mentions. The two spec files (`auth-config.spec.ts`, `twitch-urls.spec.ts`) were already committed in the RED commit, as the TDD flow requires.
- Task 1 is split into one `refactor(config)` commit and one `feat(config)` commit, exactly as the plan prescribes.
- The spec also covers `readEventSubEnv` ("keeps only the eventsub keys") and asserts `AUTH_ENV_KEYS` contains `'TWITCH_LOGIN_SCOPES'`, as `<behavior>` lists.

## Operational note (C2, intended)

The user's local `.env` has `TWITCH_EVENTSUB_SECRET` and `TWITCH_BROADCASTER_ID` but not `TWITCH_EVENTSUB_CALLBACK_URL`. From this plan onwards, `npm run start` in local is refused with "EventSub configuration is incomplete: missing TWITCH_EVENTSUB_CALLBACK_URL …". This is intended (D-12). `.env` was not touched. The fix is to add `TWITCH_EVENTSUB_CALLBACK_URL=http://localhost:3000/webhooks/twitch/eventsub` (local mode) or to blank the other two. It is documented in `.env.example` and goes into BACKEND-NOTES in 06-09.

## Threat model coverage

- T-06-01: the "error messages" `it.each` table proves no message contains the EventSub secret, the client secret or the rejected value.
- T-06-02: covered by `env.validation.spec.ts` 'throws in production without the EventSub variables'.
- T-06-03: a non-https callback gives local mode, and http is rejected in production.
- T-06-05: the four `.env.example` keys are empty, and the `=.+` grep returns nothing.

## Known Stubs

None. `EVENTSUB_CONFIG` / `eventSubConfigProvider` are deliberately not mounted in any module yet; the later wave plans consume them.

## Self-Check: PASSED

- FOUND: src/config/url-rules.ts, src/config/eventsub-config.ts, src/config/eventsub-config.spec.ts
- FOUND commits: 37b206d, be80a15, 9e60e44, 6f7bff4, e57198f, 2c9e124, dd9594c
- No `Co-Authored-By` trailer in any commit of this plan
