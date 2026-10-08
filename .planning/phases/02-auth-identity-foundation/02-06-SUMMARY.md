---
phase: 02-auth-identity-foundation
plan: 06
subsystem: auth
tags: [auth, graphql, graphql-ws, apollo, session, error-format, app-boot]
requires:
  - "02-03: WsConnectionAuthenticator (onConnect/onClose), AuthenticatedWsExtra, WsConnectionContext"
  - "02-05: AuthModule (exports WsConnectionAuthenticator, AuthSessionService), AuthSession DTO, createAuthTestApp harness"
provides:
  - "src/graphql/graphql-context: GRAPHQL_PATH, buildGraphQLContext (single context for HTTP and WS), GraphQLContextInput, GraphQLRequestContext"
  - "src/graphql/graphql-options.factory: createGraphQLOptions(wsConnectionAuthenticator, autoSchemaFile)"
  - "src/auth/format-auth-error: formatAuthError (restores AuthErrorCode on the wire, strips originalError/stacktrace)"
  - "src/auth/auth.resolver: AuthResolver with @Public exchangeLoginTicket / refreshSession"
  - "test/auth/auth-test-app: GraphQL mounted via the shared factory, options.providers, graphqlRequest helper"
  - "test/app.int-spec: real AppModule boot without Twitch credentials"
affects: [02-07, 02-08, 02-09]
tech-stack:
  added: []
  patterns: ["GraphQLModule.forRootAsync with imports [AuthModule] + inject [WsConnectionAuthenticator]", "one options factory shared by AppModule and the test harness", "formatError restores domain auth codes after Nest's UNAUTHENTICATED rewrite", "real AppModule boot in CI with env set inside the test and AppModule required after env assignment"]
key-files:
  created:
    - src/graphql/graphql-context.ts
    - src/graphql/graphql-context.spec.ts
    - src/graphql/graphql-options.factory.ts
    - src/graphql/graphql-options.factory.spec.ts
    - src/auth/format-auth-error.ts
    - src/auth/format-auth-error.spec.ts
    - src/auth/auth.resolver.ts
    - src/auth/auth.resolver.int-spec.ts
    - test/app.int-spec.ts
  modified:
    - src/app.module.ts
    - src/auth/auth.module.ts
    - test/auth/auth-test-app.ts
    - package.json
    - src/schema.gql
  deleted:
    - test/app.e2e-spec.ts
    - test/jest-e2e.json
decisions:
  - "AppModule is loaded with jest.requireActual (typed via typeof import) instead of await import(): with module nodenext, ts-jest keeps native import(), which Jest CJS rejects without --experimental-vm-modules"
  - "The boot test also pins APP_AUTH_REDIRECT_URL='klimmeck://auth' so a local .env cannot change the expected redirect"
  - "The boot test also asserts GET / -> 200 'Hello World!' so the removed e2e scaffold's only assertion stays covered"
  - "The factory spec asserts the exact option key set rather than naming the removed legacy key, so `grep installSubscriptionHandlers src` is truly 0 lines"
metrics:
  duration: "~8 min"
  completed: 2026-10-06
  tasks: 3
  files: 16
---

# Phase 2 Plan 06: GraphQL session API and graphql-ws authentication Summary

`AppModule` now builds GraphQL through `GraphQLModule.forRootAsync`, using one options factory (`createGraphQLOptions`) that the auth test harness also uses. That factory sets a single context function for HTTP and WS, `formatAuthError`, and the `graphql-ws` `onConnect`/`onClose` hooks of `WsConnectionAuthenticator`. `installSubscriptionHandlers` is gone. The public mutations `exchangeLoginTicket` and `refreshSession` are tested end to end over HTTP, with stable `extensions.code` values and no `originalError`/`stacktrace`. The real `AppModule` now boots in CI with only a fake `JWT_SECRET` (no Twitch keys), and `src/schema.gql` is regenerated.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Shared GraphQL options factory, single context, formatAuthError, forRootAsync in AppModule | `3901e34` test (RED), `b63c3af` feat (GREEN) |
| 2 | AuthResolver (`exchangeLoginTicket`, `refreshSession`) proven on the HTTP wire | `f4b3f4a` test (RED, includes harness extension), `7145f95` feat (GREEN) |
| 3 | Real AppModule boot, removal of the e2e scaffold, schema regeneration | `005de3f` test, `b69d5e9` chore |

TDD notes:
- Task 1 RED failed for the right reason: `Could not locate module src/graphql/graphql-context` / `src/auth/format-auth-error`.
- Task 2 RED: 7 of 8 cases failed with HTTP 400 (the mutations were not in the schema yet). The non-auth regression case (`user(id)` → no auth code) passed already, as expected, because it guards behaviour that already existed.
- Task 3: the boot test passed on its first successful run, because Tasks 1-2 had already done the work. The plan allows this, and the test was still committed separately from the code (`005de3f`) before the chore commit. The first run did fail, but for a harness reason (native `import()` under Jest, see Deviations).
- No REFACTOR commits were needed.

## GraphQL SDL added to `src/schema.gql`

```graphql
type AuthSession {
  accessToken: String!
  accessTokenExpiresAt: DateTime!
  refreshToken: String!
  user: User!
}

# in type Mutation
exchangeLoginTicket(codeVerifier: String!, ticket: String!): AuthSession!
refreshSession(refreshToken: String!): AuthSession!
```

**Schema drift: none.** The regenerated diff contains only these additions, so no separate `chore(phase-2): sync schema.gql…` commit was needed. No existing field or operation changed.

## Verification

- `npx tsc --noEmit -p tsconfig.build.json`: clean
- `npm run build`: OK
- `npx eslint` on every touched file (`src/graphql`, `src/auth`, `test/auth`, `test/app.int-spec.ts`, `src/app.module.ts`): exit 0
- `npx jest src/graphql src/auth/format-auth-error.spec.ts --selectProjects unit`: 3 suites / 13 tests passed
- `npx jest src/auth --selectProjects integration --runInBand`: 7 suites / 66 tests passed (02-02..02-05 int-specs did not regress)
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand --detectOpenHandles`: 4/4, no open handles reported
- `npm test`: unit **19 suites / 163 tests passed**; integration **14 suites / 88 tests passed**
- `grep -rn installSubscriptionHandlers src` → 0 lines; `grep -c test:e2e package.json` → 0; `test/app.e2e-spec.ts` and `test/jest-e2e.json` are gone
- `git status --porcelain src/schema.gql` is empty after the commit

## Deviations from Plan

### Auto-adapted (small, clearly correct)

1. **[Rule 3 - Blocking] `await import('src/app.module')` replaced by `jest.requireActual<typeof import('src/app.module')>('src/app.module')`** in `test/app.int-spec.ts`. With `module: nodenext` in a CJS package, ts-jest leaves `import()` as a native dynamic import, and Jest fails with `A dynamic import callback was invoked without --experimental-vm-modules`. The intent is unchanged: `AppModule` (and so `ConfigModule.forRoot`) is evaluated only *after* `process.env` is assigned. The type stays exact through `typeof import(...)`. This differs from the literal acceptance criterion "contains `await import('src/app.module')`". All other criteria (`JWT_SECRET`, `TWITCH_CLIENT_ID: ''`, `DEV_AUTH_ENABLED: 'false'`, `startRedis()`, `process.env = envSnapshot`) are met. Commit `005de3f`.
2. **[Test fixture] `format-auth-error.spec.ts` resolver errors carry a `path`.** Apollo's `unwrapResolverError` only unwraps `GraphQLError`s that have both `path` and `originalError`, which is what real resolver errors look like. The RED fixture had no `path`, so I fixed it in the GREEN commit `b63c3af`. The implementation matches the plan exactly.
3. **[Acceptance consistency] The factory spec checks the exact set of option keys** instead of `not.toHaveProperty('installSubscriptionHandlers')`. The plan asks both for that check and for `grep -rn installSubscriptionHandlers src` to return 0 lines. An exact key list proves the absence without naming the key. Commit `b63c3af`.
4. **[Robustness] The boot test pins `APP_AUTH_REDIRECT_URL: 'klimmeck://auth'`.** Without it, a local `.env` that sets a different app redirect would change the expected `Location`. Commit `005de3f`.
5. **[Coverage] The boot test also asserts `GET /` → 200 `'Hello World!'`.** This is the only assertion of the removed e2e scaffold, and it is now covered right away rather than "in 02-07". 02-07 must keep `AppController.getHello` reachable (or update this case) when it enables the global guard.
6. A small comment in `graphql-context.ts` explains the WS `req` mapping. `GraphQLRequestContext.req` is `any`, as the plan's contract says. The repo's ESLint config does not flag `any`, so no disable directive was needed.

**Prettier:** `src/app.module.ts` (a pre-existing file) was run through prettier. It was already prettier-clean, so the diff only contains the planned changes. `package.json` was edited by hand, and its formatting was left alone.

## Authentication Gates

None. No Twitch keys are needed. The real boot runs with Twitch unconfigured and only a fake `JWT_SECRET` set inside the test.

## Known Stubs

None.

## Threat Flags

None. The new surface (`exchangeLoginTicket`, `refreshSession`, the authenticated `graphql-ws` upgrade) is covered by the plan's threat model:
- T-2-ws-unauth: `onConnect` is wired through the shared factory, and the legacy channel is removed
- T-2-error-leak: auth errors are reduced to `{ message, locations, path, extensions: { code } }` (asserted on the wire)
- T-2-config-drift: one factory is used by both AppModule and the harness
- T-2-ticket-replay / T-2-refresh-reuse: replay → `LOGIN_TICKET_INVALID`, and reuse after grace → `SESSION_REVOKED`, both asserted on the wire

## Notes for next plans

**02-07 (global guard)**
- Context shape: HTTP `{ req, res }`, WS `{ req: extra.request, extra }`. On WS, `extra.identity` already holds the `AuthIdentity` resolved in `onConnect`. The guard should read it from there (and may write `req.user` on the per-socket upgrade `IncomingMessage`). Nest's `wrapContextResolver` keeps our `req`, because it is an object.
- Public whitelist: `AuthResolver.exchangeLoginTicket`, `AuthResolver.refreshSession` (`@Public()` on the method), `TwitchAuthController.start`, `TwitchAuthController.callback`. `test/app.int-spec.ts` also calls `GET /` (`AppController`) and expects 200. Decide whether it stays public or update that case.
- Harness: `createAuthTestApp({ providers: [ProbeResolver] })` adds test-only resolvers to the GraphQL schema (in-memory, `autoSchemaFile: true`). `graphqlRequest(app, query, variables?, bearer?)` sends `POST /api/graphql`, and `bearer` is the full `Authorization` header value (for example `` `Bearer ${token}` ``).
- `formatAuthError` handles any `AuthException` the guard throws: `UNAUTHENTICATED` comes out with only `{ code }`, and non-auth errors pass through as the same object.
- `test/app.int-spec.ts` is the only `AppModule` boot. Extend it there (env is set inside the test, then `jest.requireActual('src/app.module')`). Do not use `await import()`.
- `logout` is not yet exposed in GraphQL. It needs the identity, so it belongs with or after the guard.

**02-08 / 02-09**
- WS clients must send `connectionParams: { Authorization: 'Bearer <token>' }` (`authorization` is accepted too). A rejected `connection_init` closes with 4403. The schema only changed by adding things, so the FE contract is backward compatible.
- `CLAUDE.md` (the GSD-generated "Technology Stack" section) still lists `yarn test:e2e`, which this plan removed. It was not edited here (out of scope); refresh it on the next codebase-map regeneration.

## Self-Check: PASSED

- Created files present: all 9 in key-files.created; `test/app.e2e-spec.ts` and `test/jest-e2e.json` absent.
- Commits found: 3901e34, b63c3af, f4b3f4a, 7145f95, 005de3f, b69d5e9.
