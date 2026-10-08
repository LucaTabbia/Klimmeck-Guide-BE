---
phase: 02-auth-identity-foundation
plan: 08
subsystem: auth
tags: [auth, graphql-ws, websocket, subscriptions, close-codes, dev-bypass, ci, schema]
requires:
  - "02-03: WsConnectionAuthenticator (onConnect → false = 4403, expiry timer 4401, onClose clears it), WS close code constants"
  - "02-05: createAuthTestApp harness (ephemeral port, same GraphQL options factory as AppModule)"
  - "02-06: createGraphQLOptions wiring onConnect/onClose, buildGraphQLContext WS shape { req, extra }"
  - "02-07: AuthGuard WS branch (extra.identity + expiresAt), AuthProbeResolver.authProbe, signTestAccessToken, createAuthenticatedUser"
provides:
  - "test/auth/ws-test-client: graphqlWsUrl, connectAndAwaitClose, openAcknowledgedSocket, subscribeOnce (raw ws + graphql-ws client)"
  - "test/auth/ws-auth.int-spec: end-to-end proof of the graphql-ws auth contract on real sockets"
  - "CI: Build step and 'Schema up to date' step (git diff --exit-code src/schema.gql)"
affects: [02-09]
tech-stack:
  added: []
  patterns: ["contract values (close codes, reasons) asserted as literals in the int-spec, not via the production constants", "raw ws helper whose lifetime timeout terminates the socket so no handle can outlive a test"]
key-files:
  created:
    - test/auth/ws-test-client.ts
    - test/auth/ws-auth.int-spec.ts
  modified:
    - .github/workflows/ci.yml
decisions:
  - "WsCloseEvent carries an extra `acknowledged` flag so every negative case also proves connection_ack never arrived"
  - "Legacy subprotocol case split in two: legacy 'graphql-ws' client → never acknowledged (observed close 1006 on the client); client without graphql-transport-ws → server closes 4406 'Subprotocol not acceptable'"
  - "4403/4401/'Forbidden'/'Token expired' asserted as literals: a silent change of the shared constants must break the FE contract test"
metrics:
  duration: "~6 min"
  completed: 2026-10-06
  tasks: 2
  files: 3
---

# Phase 2 Plan 08: graphql-ws authentication on real sockets + CI build/schema gate Summary

The subscription auth contract now has end-to-end tests on real `graphql-transport-ws` sockets against a real Nest app on an ephemeral port. Nothing in the GraphQL context is mocked. Covered: `connection_init` rejection with 4403 `Forbidden` (never 4500), `connection_ack` with the identity reaching `@CurrentUser()` in a real subscription, a live socket closed with 4401 `Token expired` when the JWT expires, the dev bypass over WS (enabled and disabled), and no second channel for the legacy subprotocol. CI now builds the project and fails when the committed `src/schema.gql` is stale.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Real-socket WS auth int-spec + raw ws / graphql-ws helpers | `33ed9db` test |
| 2 | CI: `Build` step and `Schema up to date` step; local phase gate | `ebc0392` ci |

## Observed WS close codes (real sockets)

| Case | Close code | Reason | connection_ack |
|------|-----------|--------|----------------|
| `connection_init` payload `{}` | 4403 | `Forbidden` | no |
| `connection_init` without a payload | 4403 | `Forbidden` | no |
| `Bearer not-a-jwt` | 4403 | `Forbidden` | no |
| JWT signed with another secret | 4403 | `Forbidden` | no |
| Expired access JWT | 4403 | `Forbidden` | no |
| Signed OAuth `state` used as bearer | 4403 | `Forbidden` | no |
| Dev token, `devAuth: null` | 4403 | `Forbidden` | no |
| Valid access JWT (`Authorization` / lowercase `authorization`) | open | - | yes, `authProbe` = user twitchId |
| Dev token, bypass enabled | open | - | yes, `authProbe` = `dev-twitch-1` |
| Valid JWT, TTL 4 s, socket left open | 4401 | `Token expired` | yes (closed about 3–4 s after issue) |
| Legacy subprotocol `graphql-ws` only | **1006** (client side) | `` | no |
| No subprotocol | 4406 | `Subprotocol not acceptable` | no |

No negative case ever closed with 4500.

**Legacy subprotocol: 1006 instead of the expected 4406.** graphql-ws `handleProtocols` returns `false` for anything other than `graphql-transport-ws`, so the server completes the upgrade without selecting a subprotocol. The `ws` client requested `graphql-ws`, gets none back, and aborts the handshake on its own side ("Server sent no subprotocol"). It therefore sees 1006 before the server's 4406 frame can arrive. Server side, `makeServer().opened()` still closes any socket whose protocol is not `graphql-transport-ws` with 4406. The second case shows this with a client that does not enforce a subprotocol. The binding requirement holds either way: the connection is never acknowledged and no second channel exists.

## Proof the tests can fail

All 13 cases passed on the first run, because the production code already existed (02-03/02-06/02-07). I ran three temporary breaks of `src/auth/ws/ws-connection-authenticator.ts`. After each one the file was restored from a byte copy, `git diff --exit-code` confirmed it, and nothing from the experiments was committed:

1. `onConnect` catch `return false` → `return true`: **7 failed** (all six 4403 cases + dev token with bypass disabled). Each socket was acknowledged and then terminated by the helper's 5 s timeout.
2. `scheduleExpiryClose` always returns `undefined` (no timer): **1 failed**. The 4401 case got 1006 after the 8 s lifetime timeout instead of 4401.
3. `readAuthorization` drops the `?? params?.authorization` fallback: **1 failed** (lowercase key case).

## Verification results

- `npx jest test/auth/ws-auth --selectProjects integration --runInBand --detectOpenHandles`: 5 consecutive runs, each **13/13 passed**, exit 0, **0 "open handle" mentions**. The expiry case took 3.2–4.0 s in every run.
- `npx tsc --noEmit -p tsconfig.build.json`: exit 0
- `npm run build`: exit 0
- `npm test`: unit **20 suites / 172 tests passed**; integration **17 suites / 125 tests passed**; exit 0
- `git diff --exit-code src/schema.gql` after `npm test`: exit 0 (committed schema is current)
- Phase-gate lint: `git diff --name-only --diff-filter=ACMR 4e84931 HEAD -- '*.ts' | (existing files only) | xargs npx eslint` checked 83 files, exit 0 (passed through xargs because zsh does not word-split an unquoted `$(...)` list held in a variable)
- `grep -nE "JWT_SECRET|TWITCH_|DEV_AUTH" .github/workflows/ci.yml`: 0 lines

## Deviations from Plan

### Auto-fixed / adapted

**1. [Rule 1 - Reality differs from research] Legacy subprotocol close code**
- **Found during:** Task 1
- **Issue:** The plan expected 4406 for a client using the legacy `graphql-ws` subprotocol. The real close code on the client is 1006, because the handshake is aborted client-side (see above).
- **Fix:** As the plan allows, the binding assertion is "never acknowledged". The legacy test asserts `acknowledged === false` and records the observed 1006. A second test (no subprotocol) asserts the server-side 4406 `Subprotocol not acceptable`.
- **Files:** test/auth/ws-auth.int-spec.ts, test/auth/ws-test-client.ts
- **Commit:** 33ed9db

**2. [Rule 2 - Stronger assertions] Small helper contract extensions**
- `WsCloseEvent` gained `acknowledged: boolean`, so negative cases also prove that no `connection_ack` was sent.
- `WsConnectOptions.subprotocol?: string` became `subprotocols?: string[]`, which allows the "no subprotocol" case (`[]`).
- `openAcknowledgedSocket(url, payload, timeoutMs)`: `timeoutMs` bounds the whole socket lifetime (ack plus the later close), not only the ack. That is how the 8 s expiry bound is enforced and how a socket left open is always terminated.
- One extra negative case: `connection_init` with no payload at all → 4403.
- The expiry case also asserts that the socket lived at least 2 s after the ack, so the close comes from the timer and not from an immediate rejection.
- **Commit:** 33ed9db

**3. Per-test timeout instead of `jest.setTimeout(15_000)`**: the 15 s timeout is set only on the expiry test (third argument of `it`), so the other cases keep the default.

No production defects were found, so there is no `fix(phase-2)` commit.

## Known Stubs

None.

## Notes for 02-09 (BACKEND-NOTES)

Every item below is now proven on real sockets and can be documented as the FE contract:
- Endpoint `ws(s)://<host>/api/graphql`, subprotocol **`graphql-transport-ws`** only (graphql-ws 6.0.6). Clients on the legacy `subscriptions-transport-ws` (`graphql-ws` subprotocol) are never acknowledged.
- `connection_init.payload = { Authorization: 'Bearer <access JWT>' }`. The lowercase `authorization` key is also accepted. Nothing is read from upgrade headers.
- Rejection at connect: close **4403 `Forbidden`**, never 4500, and the reason never carries exception text. This applies to a missing payload, a malformed token, a foreign signature, an expired token, OAuth state token confusion, and the dev token when the bypass is off.
- Live socket at JWT `exp`: close **4401 `Token expired`**. The FE must refresh before reconnecting and must read the current token inside its `initialPayload` closure (see RESEARCH §Q2 point 5).
- The dev token works over WS exactly as over HTTP when `DEV_AUTH_*` is configured, and is rejected with 4403 otherwise.
- CI now has `Build` and `Schema up to date` steps. Any schema-changing PR must commit the regenerated `src/schema.gql` (produced by `npm run test:int` via `test/app.int-spec.ts`).

## Self-Check: PASSED

- FOUND: test/auth/ws-test-client.ts
- FOUND: test/auth/ws-auth.int-spec.ts
- FOUND: .github/workflows/ci.yml (Build + Schema up to date steps)
- FOUND: commit 33ed9db
- FOUND: commit ebc0392
