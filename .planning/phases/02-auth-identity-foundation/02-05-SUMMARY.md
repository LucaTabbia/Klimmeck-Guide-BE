---
phase: 02-auth-identity-foundation
plan: 05
subsystem: auth
tags: [auth, twitch, oauth, redirect, session, refresh, logout, nest-module, test-harness]
requires:
  - "02-01: AUTH_CONFIG/authConfigProvider/AuthConfig, Clock/SystemClock, AuthException, Public, CODE_CHALLENGE_PATTERN, buildTestAuthConfig, FixedClock"
  - "02-02: Session/SessionSchema, SessionService (create/rotate/revoke), UsersService.findOrCreateByTwitchId, TwitchIdIndexVerifier"
  - "02-03: AccessTokenService, DevAuthStrategy, AuthIdentityResolver, WsConnectionAuthenticator"
  - "02-04: LoginTicket/LoginTicketService, TwitchOAuthClient/HttpTwitchOAuthClient, OAuthStateService, buildTwitchAuthorizeUrl, buildAppTicketRedirect/buildAppErrorRedirect, TwitchLoginErrorCode"
provides:
  - "src/auth/auth.module: AuthModule (exports AUTH_CONFIG, AuthIdentityResolver, WsConnectionAuthenticator, AuthSessionService; controller TwitchAuthController)"
  - "src/auth/auth-startup.reporter: AuthStartupReporter (boot warnings for dev bypass and missing Twitch config)"
  - "src/auth/auth-session.service: AuthSessionService.issueForUser / exchangeLoginTicket / refresh / logout"
  - "src/auth/dto/auth-session.model: @ObjectType AuthSession { accessToken, accessTokenExpiresAt, refreshToken, user } (D-34)"
  - "src/auth/twitch/twitch-login.service: TwitchLoginService.buildStartRedirectUrl / handleCallback, TwitchCallbackQuery"
  - "src/auth/twitch/twitch-auth.controller: GET /auth/twitch/start, GET /auth/twitch/callback (@Public per handler, always 302)"
  - "test/auth/auth-test-app: createAuthTestApp, AUTH_TEST_DB_NAME, AuthTestApp, AuthTestAppOptions, CloudinaryServiceMock"
  - "test/auth/fake-twitch-oauth.client: FakeTwitchOAuthClient, FAKE_TWITCH_USER_ID, FAKE_TWITCH_ACCESS_TOKEN, FAKE_TWITCH_REFRESH_TOKEN"
affects: [02-06, 02-07, 02-08, 02-09]
tech-stack:
  added: []
  patterns: ["every public OAuth endpoint returns @Redirect() { url, statusCode: 302 }: no error page, typed error= code", "Twitch tokens revoked in finally (best-effort, failure only logged by name)", "role re-read from DB on every refresh (D-10)", "isolated Nest test app (no AppModule, ignoreEnvFile, overridden AUTH_CONFIG + TwitchOAuthClient, listen(0))", "DB cleanup through getConnectionToken() of the Nest connection"]
key-files:
  created:
    - src/auth/auth.module.ts
    - src/auth/auth-startup.reporter.ts
    - src/auth/auth-startup.reporter.spec.ts
    - src/auth/auth.module.int-spec.ts
    - src/auth/auth-session.service.ts
    - src/auth/auth-session.service.int-spec.ts
    - src/auth/dto/auth-session.model.ts
    - src/auth/twitch/twitch-login.service.ts
    - src/auth/twitch/twitch-auth.controller.ts
    - src/auth/twitch/twitch-auth.controller.int-spec.ts
    - test/auth/auth-test-app.ts
    - test/auth/fake-twitch-oauth.client.ts
  modified: []
  deleted:
    - src/rest/auth.controller.ts
decisions:
  - "AuthSessionService uses a private findUserOrNull (NotFoundException → null) instead of the plan's findUserOr(userId, onMissing): each caller throws its own AuthException, and refresh revokes the session before throwing SESSION_REVOKED"
  - "TwitchLoginService passes String(user._id) to LoginTicketService.issue (UserDocument convention from 02-03), not user.id"
  - "handleCallback treats any present error= (even empty) as access_denied, after state verification"
  - "Harness clears only its own Cloudinary mocks (mockClear) instead of jest.clearAllMocks(), so it never wipes spies owned by the calling suite"
  - "TwitchLoginService is a provider of AuthModule but not exported: only the controller uses it"
metrics:
  duration: "~10 min"
  completed: 2026-10-06
  tasks: 3
  files: 13
---

# Phase 2 Plan 05: AuthModule, Twitch redirect flow, AuthSessionService and test harness Summary

`AuthModule` now wires all the auth building blocks from 02-02..02-04. It also provides a backend-mediated Twitch login (`/auth/twitch/start` → Twitch → `/auth/twitch/callback` → `klimmeck://auth?ticket=…`). That flow always ends in a 302 to the configured app deep link, verifies the state before anything else, checks the `client_id` and revokes the Twitch token in `finally`. `AuthSessionService` turns a ticket into an `AuthSession`, rotates refresh tokens (reading the role from the DB again each time) and handles logout, including dev identities that have no session. Boot warnings report the dev bypass and a missing Twitch config. A reusable isolated test app (`createAuthTestApp` + `FakeTwitchOAuthClient`) proves all of it with no Twitch keys and no network.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | AuthModule, startup reporter, test harness | `0e46450` test (RED), `454eed5` feat (GREEN) |
| 2 | AuthSessionService + AuthSession DTO | `77fd185` test (RED), `96ec5ea` feat (GREEN) |
| 3 | Twitch REST flow (TwitchLoginService + controller) | `c844128` test (RED), `1a37a1c` feat (GREEN), `041fb68` chore (remove empty `src/rest/auth.controller.ts`) |

TDD: RED for Tasks 1 and 2 failed for the right reason (`Could not locate module src/auth/...`). RED for Task 3 compiled and failed on every case with `Expected: 302, Received: 404` (routes absent). No REFACTOR commits were needed.

## Verification

- `npx tsc --noEmit -p tsconfig.build.json`: clean
- `npx eslint src/auth test/auth`: exit 0
- `npx jest src/auth/auth-startup.reporter.spec.ts --selectProjects unit`: 4/4
- `npx jest src/auth/auth.module.int-spec.ts --selectProjects integration --runInBand`: 4/4
- `npx jest src/auth/auth-session.service.int-spec.ts --selectProjects integration --runInBand`: 9/9
- `npx jest src/auth/twitch --selectProjects integration --runInBand`: 15/15
- `npm test`: unit **16 suites / 150 tests passed**; integration **12 suites / 76 tests passed**
- `grep -rn "app.module" test/auth` → 0 lines; `src/rest/auth.controller.ts` no longer exists (no importers before removal)

## Deviations from Plan

### Auto-adapted (small, clearly correct)

1. **[Rule 1 - Correctness] `findUserOr(userId, onMissing)` replaced by `findUserOrNull`.** The plan's signature returned the exception instead of throwing it for one of the two callers. `findUserOrNull` catches only `NotFoundException`, and each caller throws its own code. `AuthException.loginTicketInvalid()` and `AuthException.sessionRevoked()` are both still in the service, as the acceptance criteria require. Commit `96ec5ea`.
2. **[Rule 3] `String(user._id)` instead of `user.id`** when issuing the login ticket in `TwitchLoginService`. This follows the `UserDocument` convention noted by 02-03. `AuthSessionService` keeps `user.id`, because it gets a hydrated document from `UsersService.findOne`, and the specs confirm `sub` equals the Mongo id. Commit `1a37a1c`.
3. **[Test design] `auth.module.int-spec` clearDatabase case persists a user directly.** `DevAuthStrategy` memoizes the stub identity per instance, so a second dev bearer resolve does not hit the DB. Using it would have made the case pass trivially. Commit `0e46450`.
4. **[Test hygiene] Harness `clearDatabase()` calls `mockClear()` on the 3 Cloudinary mocks** instead of `jest.clearAllMocks()`, so it does not clear spies owned by the calling suite. Commit `454eed5`.
5. **Additional coverage beyond `<behavior>`:** callback with *missing* state → `invalid_state`. The ticket document's `ticketHash` is also checked against `sha256Hex(ticket)`, not just compared as "≠ ticket". The created user's `currentCharacter` is asserted `null`, and the mismatch / exchange-failure cases assert no `login_tickets` document exists. The not-configured callback asserts that `exchangeCode` is never called.
6. `FakeTwitchOAuthClient` also exports `FAKE_TWITCH_ACCESS_TOKEN` / `FAKE_TWITCH_REFRESH_TOKEN`, and `auth-test-app.ts` exports `CloudinaryServiceMock`. These are small additive exports used by the specs.

No pre-existing file was modified (the only pre-existing file touched was deleted), so there is no prettier debt to report.

## Authentication Gates

None. Twitch keys are not needed: every test uses `FakeTwitchOAuthClient`.

## Known Stubs

None. `AuthModule` is intentionally **not** imported by `AppModule` yet. Per the plan this happens in 02-06, together with GraphQL, so `/auth/twitch/*` is not reachable in the running app until then.

## Threat Flags

None. All new surface (`GET /auth/twitch/start`, `GET /auth/twitch/callback`) is covered by the plan's threat model:
- T-2-oauth-csrf: state verified first, before any exchange (tested with forged and missing state)
- T-2-client-mismatch: client mismatch → error, no user created, token still revoked
- T-2-twitch-token-retention: Twitch tokens never persisted; revoked in `finally`, and a failed revoke does not block login
- T-2-input-validation: `CODE_CHALLENGE_PATTERN` check before signing the state
- T-2-open-redirect: redirect base comes only from `config.appAuthRedirectUrl`
- T-2-error-leak: errors are logged by name only
- T-2-log-leak: reporter specs assert that neither the dev token nor the client secret appears in logs

## Notes for next plans

**Test harness (`test/auth/auth-test-app.ts`)**
- `const harness = await createAuthTestApp(options?)` in `beforeAll`, `await harness.clearDatabase()` in `afterEach`, `await harness.close()` in `afterAll`. Integration specs import it by relative path (`../../test/auth/auth-test-app` from `src/auth/`). Run them with `npx jest <paths> --selectProjects integration --runInBand`.
- `options.authConfig` is a `Partial<AuthConfig>` merged over `buildTestAuthConfig()`. The defaults have Twitch configured (`test-client-id`) **and** the dev bypass enabled (`TEST_DEV_ACCESS_TOKEN` → `dev-twitch-1`, adventurer). Pass `{ devAuth: null }` / `{ twitch: null }` to disable them. `options.clock` overrides `Clock` (use `FixedClock`).
- Returned: `app` (already listening on `127.0.0.1:<port>`), `port`, `config`, `twitch` (the fake; set `tokenInfo`, `exchangeError`, `revokeError`; inspect `exchangedCodes` / `revokedTokens`), `cloudinary` (jest mocks), `connection` (the Nest mongoose connection: use `connection.model(User.name)` etc., **not** the global `mongoose.models`).
- All harness instances share the DB `auth-test`, and `close()` drops it. Do not keep two harness apps open at the same time across a `close()`: in a single suite, close each one in its own `describe`'s `afterAll`, as `twitch-auth.controller.int-spec.ts` does.
- `DevAuthStrategy` memoizes the dev identity per app instance. After `clearDatabase()` the dev bearer still resolves to the old `userId`, but the user document is gone. Suites that need the dev user in the DB should create a fresh harness, or re-create the user with `upsertWithRole`.
- To extend it in 02-06 (GraphQL) and 02-07 (probe resolvers): keep the function parametric. For example, add `options.imports` / `options.providers`, or a GraphQL flag that adds `GraphQLModule.forRoot<ApolloDriverConfig>({ autoSchemaFile: true, ... })` with the same WS hooks as `AppModule`. Do **not** import `AppModule`.

**What the GraphQL layer (02-06) must wire**
- `AppModule` imports `AuthModule`. `AUTH_CONFIG` is exported, so `GraphQLModule.forRootAsync({ imports: [AuthModule], inject: [WsConnectionAuthenticator], useFactory: ... })` can build `subscriptions['graphql-ws'] = { onConnect: (ctx) => authenticator.onConnect(ctx), onClose: (ctx) => authenticator.onClose(ctx) }`.
- Resolvers use the exported `AuthSessionService`:
  - `exchangeLoginTicket(ticket, codeVerifier): AuthSession`, `@Public`, throws `LOGIN_TICKET_INVALID`
  - `refreshSession(refreshToken): AuthSession`, `@Public`, throws `SESSION_EXPIRED` / `SESSION_REVOKED`
  - `logout: Boolean`, needs the identity; works for dev identities without `sessionId`
- `AuthSession.accessTokenExpiresAt` is `@Field(() => Date)`, which maps to the existing `DateTime` scalar. `AuthSession.user` is `@Field(() => User)`. `issueForUser` returns the document from `UsersService.findOne`, which has `currentCharacter` populated.
- `AuthException` carries `extensions.code`; resolvers must let it propagate unchanged.
- `TwitchAuthController` handlers are `@Public()` per handler: the global guard in 02-07 must honour `IS_PUBLIC_KEY` on REST handlers too, otherwise the browser OAuth flow breaks. The whitelist to enumerate in 02-07 is `TwitchAuthController.start`, `TwitchAuthController.callback`, plus the GraphQL public mutations from 02-06.
- At boot, `AuthStartupReporter` logs (through `Logger('Auth')`) `DEV AUTH BYPASS ENABLED …` when the bypass is active, and `Twitch OAuth not configured …` when the keys are missing. In the current environment (no Twitch keys) the second warning is expected.

## Self-Check: PASSED

- Created files present: all 12 files in key-files.created; `src/rest/auth.controller.ts` absent.
- Commits found: 0e46450, 454eed5, 77fd185, 96ec5ea, c844128, 1a37a1c, 041fb68.
