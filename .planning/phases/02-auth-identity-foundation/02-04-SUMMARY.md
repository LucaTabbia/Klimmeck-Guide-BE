---
phase: 02-auth-identity-foundation
plan: 04
subsystem: auth
tags: [auth, twitch, oauth, pkce, s256, login-ticket, csrf-state, deep-link]
requires:
  - "02-01: token-crypto (generateOpaqueToken, sha256Hex, s256Challenge, safeEqual, CODE_VERIFIER_PATTERN), Clock, AuthException.loginTicketInvalid, token audiences, AUTH_CONFIG/AuthConfig/TwitchOAuthConfig, buildTestAuthConfig, FixedClock"
provides:
  - "src/auth/login-ticket/login-ticket.model: LoginTicket, LoginTicketSchema (collection login_tickets, TTL index), LoginTicketDocument"
  - "src/auth/login-ticket/login-ticket.service: LoginTicketService.issue / redeem (single-use, S256-bound)"
  - "src/auth/twitch/twitch-oauth.client: TwitchOAuthClient (abstract DI token), TwitchOAuthError, TwitchTokens, TwitchTokenInfo"
  - "src/auth/twitch/http-twitch-oauth.client: HttpTwitchOAuthClient (fetch) + TWITCH_TOKEN_URL/VALIDATE_URL/REVOKE_URL, timeouts"
  - "src/auth/twitch/oauth-state.service: OAuthStateService.sign / verifyChallenge"
  - "src/auth/twitch/twitch-authorize-url: TWITCH_AUTHORIZE_URL, buildTwitchAuthorizeUrl"
  - "src/auth/twitch/app-redirect-url: buildAppTicketRedirect, buildAppErrorRedirect"
  - "src/auth/twitch/twitch-login-error-code.enum: TwitchLoginErrorCode"
affects: [02-05]
tech-stack:
  added: []
  patterns: ["atomic findOneAndDelete with explicit expiresAt > now filter (single-use, TTL monitor only as janitor)", "ticket consumed before verifier check (no verifier brute force)", "abstract class as DI token for external HTTP clients", "fetch errors normalized to one error type carrying only operation + status", "stateless CSRF state JWT with its own audience"]
key-files:
  created:
    - src/auth/login-ticket/login-ticket.model.ts
    - src/auth/login-ticket/login-ticket.service.ts
    - src/auth/login-ticket/login-ticket.service.int-spec.ts
    - src/auth/twitch/twitch-oauth.client.ts
    - src/auth/twitch/http-twitch-oauth.client.ts
    - src/auth/twitch/http-twitch-oauth.client.spec.ts
    - src/auth/twitch/oauth-state.service.ts
    - src/auth/twitch/oauth-state.service.spec.ts
    - src/auth/twitch/twitch-authorize-url.ts
    - src/auth/twitch/app-redirect-url.ts
    - src/auth/twitch/twitch-login-error-code.enum.ts
    - src/auth/twitch/twitch-urls.spec.ts
  modified: []
decisions:
  - "LoginTicket.userId uses MongooseSchema.Types.ObjectId (not Types.ObjectId as in the plan interface) so filters on string ids are cast (Mongoose 8)"
  - "HttpTwitchOAuthClient wraps fetch rejections (network/timeout) and non-JSON bodies into TwitchOAuthError, so callers handle a single error type"
  - "fetch spy in the client spec defaults to a rejecting implementation: a missing mock can never reach id.twitch.tv"
metrics:
  duration: "~9 min"
  completed: 2026-10-06
  tasks: 3
  files: 12
---

# Phase 2 Plan 04: Login ticket, Twitch OAuth client, OAuth state and redirect URL builders Summary

Single-use 60 s login tickets stored only as SHA-256 hashes and redeemable only with the PKCE verifier matching the registered S256 challenge (atomic `findOneAndDelete`, burned even on a wrong verifier), an injectable `TwitchOAuthClient` with a `fetch` implementation (form-urlencoded, timeouts, secret-free errors) tested only against a stubbed `fetch`, a stateless HS256 OAuth state JWT confined to the `twitch-oauth-state` audience, and pure builders for the Twitch authorize URL (`scope=` empty, `force_verify=true`) and the app deep-link redirect.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Single-use login ticket bound to S256 | `2df5d3a` test (RED), `8b542b3` feat (GREEN) |
| 2 | TwitchOAuthClient contract + fetch implementation | `ba7f7a2` test (RED), `fe51640` feat (GREEN) |
| 3 | OAuthStateService, authorize URL, app redirect, error codes | `505d3b7` test (RED), `38dd4a8` feat (GREEN) |

TDD: every RED commit was run and failed for the right reason (`Could not locate module src/auth/...`). The two extra Task 2 cases (network failure, non-JSON body) were also seen failing before the implementation handled them.

## Verification

- `npx tsc --noEmit -p tsconfig.build.json` — clean
- `npx eslint src/auth/twitch src/auth/login-ticket` — 0 errors, 0 warnings
- Plan specs: login ticket integration 10/10; `src/auth/twitch` unit 32/32 (client 13, state 12, urls 7)
- `npm test`:
  - unit: **15 suites, 146 tests passed, 0 failed**
  - integration (runInBand, MongoMemoryReplSet): **9 suites, 48 tests passed, 0 failed**
- Acceptance greps: service has `findOneAndDelete`, `expiresAt: { $gt:`, `s256Challenge(`, `safeEqual(`, `AuthException.loginTicketInvalid()`; model has `collection: 'login_tickets'`, `expireAfterSeconds: 0`; client has `grant_type: 'authorization_code'`, `redirect_uri: twitch.redirectUri`, `AbortSignal.timeout(`, `` `OAuth ${ ``, the 3 Twitch URLs; spec has `spyOn(global, 'fetch')`; state service has `audience: OAUTH_STATE_AUDIENCE` x2 and `algorithms: ['HS256']`; authorize URL has `scope: ''`, `force_verify: 'true'`, `response_type: 'code'`; enum has the 6 values.
- No test performs a real network call; no Twitch credentials needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `LoginTicket.userId` prop type**
- **Found during:** Task 1
- **Issue:** the plan interface used `@Prop({ type: Types.ObjectId })`, which in Mongoose 8 becomes a `Mixed` field (no casting) — known pitfall from 02-02.
- **Fix:** `@Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })`.
- **Files modified:** src/auth/login-ticket/login-ticket.model.ts
- **Commit:** 8b542b3

**2. [Rule 2 - Missing critical functionality] Uniform `TwitchOAuthError` for transport failures**
- **Found during:** Task 2
- **Issue:** the plan only mapped non-2xx statuses; a `fetch` rejection (DNS, `AbortSignal.timeout` → `TimeoutError`) or a non-JSON body would surface as a raw `TypeError`/`DOMException`/`SyntaxError`, breaking the "single error type" contract the 02-05 controller relies on to redirect with `twitch_exchange_failed`.
- **Fix:** private `request()` wraps fetch rejections in `TwitchOAuthError('<operation> request failed')`; `readJson()` wraps parse failures. Messages still carry only operation + status. Two spec cases added.
- **Files modified:** src/auth/twitch/http-twitch-oauth.client.ts, src/auth/twitch/http-twitch-oauth.client.spec.ts
- **Commit:** fe51640

**3. [Rule 2 - Safety] fetch spy defaults to rejection**
- **Fix:** `jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Unexpected network call'))` in `beforeEach`, so a test without an explicit mock can never hit `id.twitch.tv`.
- **Commit:** ba7f7a2

### Notes (not deviations)

- Verify commands run as `npx jest <paths> --selectProjects …` (the plan's argument order ignores the paths).
- `validate` also calls `requireTwitch()` even though it does not need credentials, so that all three methods fail fast and identically when Twitch is not configured (as the plan behavior requires).
- `expiresIn` falls back to `0` and `login` to `''` when Twitch omits them; `refreshToken` is optional.

## Known Stubs

None. No provider is registered in a module yet: AuthModule (02-05) wires them.

## Threat Flags

None — all surface is in the plan's threat model (T-2-ticket-replay, T-2-deeplink-hijack, T-2-oauth-csrf, T-2-token-confusion, T-2-secret-leak, T-2-twitch-dos, T-2-open-redirect, T-2-ticket-at-rest mitigated and tested). No logging anywhere in the new files.

## Notes for next plans

- AuthModule (02-05) must register `MongooseModule.forFeature([{ name: LoginTicket.name, schema: LoginTicketSchema }])`, `LoginTicketService`, `OAuthStateService` (needs `JwtModule.register({})`), `{ provide: TwitchOAuthClient, useClass: HttpTwitchOAuthClient }`, plus `authConfigProvider` and `{ provide: Clock, useClass: SystemClock }`. In e2e tests use `overrideProvider(TwitchOAuthClient)`.
- Every `HttpTwitchOAuthClient` failure (not configured, non-2xx, network/timeout, bad JSON, missing fields) is a `TwitchOAuthError`; config `twitch: null` → message `'Twitch OAuth is not configured'` (the controller should check `config.twitch` first and redirect with `TWITCH_NOT_CONFIGURED`).
- The controller must compare `TwitchTokenInfo.clientId` with `config.twitch.clientId` (→ `TWITCH_CLIENT_MISMATCH`).
- `LoginTicketService.redeem` throws `AuthException` `LOGIN_TICKET_INVALID` for every failure (unknown, expired, reused, wrong/malformed verifier); the challenge passed to `issue` should already be validated with `CODE_CHALLENGE_PATTERN` (the service stores it as given).
- `OAuthStateService.verifyChallenge` never throws: `null` → redirect with `INVALID_STATE`.
- Redirect builders take the base only from `config.appAuthRedirectUrl`.

## Self-Check: PASSED

- Created files present: all 12 files listed in key-files.created.
- Commits found: 2df5d3a, 8b542b3, ba7f7a2, fe51640, 505d3b7, 38dd4a8.
