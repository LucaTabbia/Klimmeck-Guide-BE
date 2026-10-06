---
phase: 02-auth-identity-foundation
plan: 07
subsystem: auth
tags: [auth, guard, app-guard, graphql, rest, dev-bypass, whitelist, me, logout]
requires:
  - "02-03: AuthIdentityResolver (single bearer → identity seam), @Public / @CurrentUser decorators"
  - "02-05: AuthModule, AuthSessionService.logout/issueForUser, createAuthTestApp harness, FakeTwitchOAuthClient"
  - "02-06: buildGraphQLContext (HTTP { req, res } / WS { req, extra }), formatAuthError, AuthResolver, real AppModule boot test"
provides:
  - "src/auth/guards/auth.guard: AuthGuard (transport-aware, registered as APP_GUARD in AuthModule)"
  - "src/auth/auth.resolver: me (Query → User) and logout (Mutation → Boolean), both from @CurrentUser()"
  - "AppController.getHello is @Public (health)"
  - "test/auth/auth-probe.resolver: AuthProbeResolver (whoAmI query + authProbe subscription, test-only)"
  - "test/auth/test-tokens: signTestAccessToken, createAuthenticatedUser"
  - "test/app.int-spec: enumerated @Public whitelist asserted on the real AppModule"
affects: [02-08, 02-09]
tech-stack:
  added: []
  patterns: ["deny-by-default APP_GUARD with handler-level @Public whitelist", "WS branch trusts extra.identity resolved at connect and re-checks expiresAt", "public whitelist enumerated through ModulesContainer + property descriptors"]
key-files:
  created:
    - src/auth/guards/auth.guard.ts
    - src/auth/guards/auth.guard.spec.ts
    - test/auth/auth-probe.resolver.ts
    - test/auth/test-tokens.ts
    - test/auth/http-guard.int-spec.ts
    - test/auth/login-flow.int-spec.ts
  modified:
    - src/auth/auth.module.ts
    - src/auth/auth.resolver.ts
    - src/auth/auth.resolver.int-spec.ts
    - src/app.controller.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Guard reads the WS identity only from extra.identity (never connectionParams/upgrade headers) and rejects it when expiresAt <= now; dev identities without expiresAt pass"
  - "GraphQL context without req → UNAUTHENTICATED (fail closed)"
  - "The pre-existing 'non-auth error' wire case in auth.resolver.int-spec now authenticates with the dev bearer so it still reaches the resolver"
  - "Dev-bypass HTTP assertions (whoAmI, me, REST, logout) live in one test because the dev identity is cached per app and clearDatabase() removes its user doc"
metrics:
  duration: "~7 min"
  completed: 2026-10-06
  tasks: 3
  files: 12
---

# Phase 2 Plan 07: Global auth guard, me and logout Summary

Security is now on. `AuthGuard` is registered as `APP_GUARD` and denies by default on REST, GraphQL over HTTP and graphql-ws subscriptions. Only five handlers are `@Public()`, and a test on the real `AppModule` checks that exact list. `me` and `logout` are the first real consumers of `@CurrentUser()`. Two new int-specs cover the full stack: guard, token confusion, expired tokens, Cloudinary REST (401 before multer and before the service), dev bypass on and off, logout, and an end-to-end Twitch login with the fake client.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Transport-aware `AuthGuard` as `APP_GUARD`, `GET /` public, `me` and `logout` | `4d757a4` test (RED), `a06903a` feat (GREEN) |
| 2 | HTTP/REST coverage: guard, dev bypass, Cloudinary, full login flow | `3d672dc` test |
| 3 | Guard + `@Public` whitelist on the real AppModule, schema with `me`/`logout` | `4edcc18` test, `97aeae5` chore |

TDD notes:
- Task 1 RED failed for the right reason: `Could not locate module src/auth/guards/auth.guard`. GREEN: 9/9.
- Task 2: all 19 cases passed on the first run, because Task 1 had already turned the guard on. As the plan prescribes, RED was shown by temporarily commenting out `{ provide: APP_GUARD, useClass: AuthGuard }`. With that change **15 of 19 failed**. The 4 that still passed were the 3 public-path cases (`refreshSession`, `exchangeLoginTicket`, `GET /` without a bearer) and "serves getUrls with a valid bearer", which passes whether or not a guard is present. The registration was then restored byte-for-byte (`git diff` empty), and nothing about that experiment was committed.
- Task 3: `src/schema.gql` was reset to HEAD before the run. All 9 cases passed on the first run, because the real boot regenerates the schema during `init()`, before the assertion reads the file, and the guard was already on. The whitelist assertion is not vacuous: it collects exactly 5 handlers.
- No REFACTOR commits were needed. No `fix(phase-2)` commits were needed, because no production defect showed up in Task 2.

## The `@Public` whitelist (asserted on the real AppModule)

```
AppController.getHello
AuthResolver.exchangeLoginTicket
AuthResolver.refreshSession
TwitchAuthController.callback
TwitchAuthController.start
```

No class has `IS_PUBLIC_KEY` at class level. Everything else (REST, every GraphQL query/mutation/subscription) requires an identity.

## GraphQL SDL added to `src/schema.gql`

```graphql
# in type Mutation
logout: Boolean!

# in type Query
me: User!
```

The regenerated diff contains only these two lines. No existing operation changed name or shape.

## Verification

- `npx tsc --noEmit -p tsconfig.build.json`: clean
- `npm run build`: OK
- `npx eslint src/auth src/app.controller.ts test/auth test/app.int-spec.ts`: exit 0
- `npx jest src/auth/guards src/app.controller.spec.ts --selectProjects unit`: 2 suites / 10 tests passed
- `npx jest test/auth/http-guard test/auth/login-flow --selectProjects integration --runInBand`: 19/19
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 9/9
- `npm test`: unit **20 suites / 172 tests passed**; integration **16 suites / 112 tests passed**
- `grep -rn AuthProbeResolver src` → 0 lines
- `git status --porcelain src/schema.gql` is empty after the full run

## Deviations from Plan

### Auto-adapted (small, clearly correct)

1. **[Rule 1 - Existing test behind the guard] `src/auth/auth.resolver.int-spec.ts` › "leaves non-auth errors without an auth code"** (02-06). This case queries `user(id)` with no bearer to show that a `NotFoundException` gets no auth code. With the global guard on, it now got `UNAUTHENTICATED`. It now sends `Bearer ${TEST_DEV_ACCESS_TOKEN}` (the default harness has the dev bypass enabled), so it reaches the resolver again and still checks the same thing. Committed with Task 1 (`a06903a`) because the guard is what broke it. No other existing test (Phase 1 or Phase 2) needed changes: the Phase 1 integration tests do not go through guarded entrypoints.
2. **[Test design] The dev-bypass HTTP assertions (`whoAmI`, `me`, `POST /cloudinary/getUrls`, `logout`) are in one test.** The dev identity is cached per app, and `clearDatabase()` in `afterEach` deletes the dev user doc. A `me` in a later test would then get `NotFound` for the stale id. The dev-disabled harness is a separate top-level `describe` that uses `authConfig: { devAuth: null }`.
3. **[Extra coverage]** Several cases go beyond the plan:
   - `logout` with the dev bearer returns `true` (no-op, because dev identities have no `sessionId`).
   - `me` with a real token is checked to equal `{ id: String(user._id), twitchId, role }`.
   - The `uploadImage` 401 body is checked to carry `code: 'UNAUTHENTICATED'`.
   - The guard unit spec has one more case: a GraphQL context with no `req` is rejected as `UNAUTHENTICATED`, so the guard fails closed.
4. **[Lint] `collectPublicHandlers`** follows the plan's sketch, with two changes. It skips null-prototype instances. It types `instance` as `unknown` without assertions, because `@typescript-eslint/no-unnecessary-type-assertion` flagged the casts.
5. **`test/auth/auth-test-app.ts`** is listed in `files_modified`, but it did not need any change. The existing `providers` option was enough to mount `AuthProbeResolver`.

**Prettier:** `src/app.controller.ts` had 2-space indentation (pre-existing prettier debt). The whole file was reformatted to 4 spaces, as the project rules require, so its diff includes that reindent along with the `@Public()` line. Every other file I touched was already prettier-clean.

## Authentication Gates

None. Everything runs with Twitch unconfigured (fake client in the harness, and the real boot uses no Twitch keys).

## Known Stubs

None. `AuthProbeResolver` is a deliberate test-only probe and is never registered in `src`.

## Threat Flags

None. The new surface (`me`, `logout`) is covered by the plan's threat model. T-2-identity-from-args holds: neither method takes an `@Args`, and both read the identity from `@CurrentUser()`.

## Notes for next plans

**02-08 (WS subscription proof)**
- The guard's WS branch reads only `GqlExecutionContext.getContext().extra.identity`. It never reads `connectionParams` or upgrade headers. It rejects `UNAUTHENTICATED` when `extra` exists but has no `identity`, or when `identity.expiresAt <= Date.now()`. Dev identities (no `expiresAt`) pass. On success it sets `req.user` on the per-socket upgrade `IncomingMessage`, which is how `@CurrentUser()` resolves on WS.
- `AuthProbeResolver.authProbe` (`@Subscription(() => String)`) yields one `{ authProbe: identity.twitchId }`. Mount it with `createAuthTestApp({ providers: [AuthProbeResolver] })`.
- `test/auth/test-tokens.ts`: `signTestAccessToken(config, claims?, { expired?, expiresInSeconds?, audience? })` builds short-lived, expired, or wrong-audience tokens (useful for the 4401 expiry timer). `createAuthenticatedUser(harness, overrides?)` returns `{ user, session, bearer }`, where `bearer` is the full `Authorization` value.
- Dev-identity caching: after `clearDatabase()` the dev user doc is gone, but the dev token still resolves to the old id. `whoAmI`/`authProbe` still work because they only read `twitchId`. `me` does not.

**02-09 (docs / BACKEND-NOTES)**
- Document for the FE/BE handoff:
  - every operation now needs `Authorization: Bearer <access JWT>`, except the 5 whitelisted handlers;
  - unauthenticated GraphQL calls return HTTP 200 with `errors[0].extensions.code = 'UNAUTHENTICATED'` and `data: null`;
  - unauthenticated REST calls return 401 `{ statusCode: 401, error: 'Unauthorized', message, code: 'UNAUTHENTICATED' }`;
  - new operations: `me: User!` and `logout: Boolean!`.
- Accepted limits to record (from the threat model):
  - T-2-logout-window (D-27): after `logout`, the issued access JWT keeps working until `exp` (≤ 15 min). This is proven in `http-guard.int-spec`: `whoAmI` still succeeds after logout.
  - T-2-introspection (D-30): introspection and the landing page stay public until Phase 10. This is asserted in `test/app.int-spec.ts`.
  - T-2-role-escalation: any authenticated user can still call `createUser`/`updateUser`. Ownership and roles come in Phase 3.
- Any new `@Public()` must be added to `EXPECTED_PUBLIC_HANDLERS` in `test/app.int-spec.ts`, or that test fails.

## Self-Check: PASSED

- Created files present: src/auth/guards/auth.guard.ts, src/auth/guards/auth.guard.spec.ts, test/auth/auth-probe.resolver.ts, test/auth/test-tokens.ts, test/auth/http-guard.int-spec.ts, test/auth/login-flow.int-spec.ts.
- Commits found: 4d757a4, a06903a, 3d672dc, 4edcc18, 97aeae5.
