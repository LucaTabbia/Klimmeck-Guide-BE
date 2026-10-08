---
phase: 02-auth-identity-foundation
plan: 09
subsystem: auth
tags: [auth, handoff, docs, backend-notes, dev-bypass, twitch, websocket]
requires:
  - phase: 02-auth-identity-foundation
    provides: "02-01..02-08: auth config, sessions, login ticket, Twitch controller, GraphQL session API, global guard, WS auth, CI schema gate"
provides:
  - ".planning/phases/02-auth-identity-foundation/BACKEND-NOTES.md: FE handoff (D-24, BE-AUTH-04) derived from the code"
  - "copy-paste .env blocks (BE + FE) to run in dev bypass without Twitch keys"
  - "checklist for when the Twitch keys arrive (console redirect URLs, TWITCH_* vars, bypass off, manual E2E incl. Assumption A1)"
affects: [FE Phase 11 auth-session-bootstrap, FE Phase 3 subscriptions, BE Phase 3 authz, BE Phase 10 hardening]
tech-stack:
  added: []
  patterns: ["handoff written from source (schema.gql, enums, config) and checked against it by grep"]
key-files:
  created:
    - .planning/phases/02-auth-identity-foundation/BACKEND-NOTES.md
  modified: []
key-decisions:
  - "A malformed or unknown refresh token answers SESSION_EXPIRED; on refresh only SESSION_EXPIRED / SESSION_REVOKED are terminal for the FE (read from session.service.ts)"
  - "logout needs a valid access token and takes no refresh-token variant: the FE refreshes first or skips the step"
  - "The FE WS client already conforms (WsReconnectPolicy reads the current token per connect); the plan's 'bootstrapToken captured once' note was outdated and is documented as resolved"
requirements-completed: []
duration: 7 min
completed: 2026-10-06
---

# Phase 2 Plan 09: BACKEND-NOTES handoff Summary

**Handoff BACKEND-NOTES.md (12 sections, Italian) covering the ticket + S256 login, AuthSession/refresh rotation with the terminal refresh codes, the bearer and 5-handler public whitelist, graphql-transport-ws `connection_init` with 4403/4401, the dev bypass `.env` blocks for running without Twitch keys, the Twitch-keys checklist, known limits and deploy notes. Every name was copied from `src/schema.gql`, the enums, `auth-config.ts` and `.env.example`, then checked against them.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-10-06T18:33:36Z
- **Completed:** 2026-10-06T18:40Z
- **Tasks:** 2
- **Files modified:** 1 (created)

## Accomplishments

- §0–§6: TL;DR, login flow with the full `TwitchLoginErrorCode` table, the exact `AuthSession` SDL, JWT claims/TTL, refresh semantics (30 s grace, reuse detection, "only the last issued pair is valid", single-flight), HTTP/REST headers and error bodies, WS contract and close codes, error code table with FE actions, and post-refresh/logout behaviour.
- §7 **"Avvio in modalità dev bypass (senza chiavi Twitch)"**: bypass rules (exact `true`, refused under `NODE_ENV=production`, minimum 16 chars, role restart, stub user upsert, `DEV_AUTH_USER_ID` FE-only), BE `.env` block, generation commands (`openssl rand -hex 32` / `-hex 16`), the matching FE `.env` block (incl. `DEV_AUTH_START_SIGNED_OUT`) and a `curl` smoke check on `me`.
- §8 **"Quando arrivano le chiavi Twitch"**: console redirect URLs (exact match, https or `http://localhost`, no custom scheme), `TWITCH_*`, bypass off on both sides, `adb reverse` / tunnel, and manual E2E including the `scope=` empty confirmation (A1).
- §9–§11: known limits (a–i) with the phase that closes each one, `twitchId` unique-index deploy note (`$group` aggregation, `twitchId_1`, `TwitchIdIndexVerifier` log), mandatory `JWT_SECRET`, CI schema gate, FE impact (Phase 11 PKCE replan, Open Questions #1/#2/#8 closed), and the list of proving tests.

## Task Commits

1. **Task 1: contract (login, session, HTTP, WS, errors)**: `566dc7f` (docs)
2. **Task 2: dev bypass, Twitch keys, limits, deploy notes, consistency check**: `c89fe38` (docs)

## Verification Output

- Plan verify Task 1: `OK`
- Plan verify Task 2: `OK` with system grep. With the shell's `grep` wrapper (ugrep `-G`), the `'$group'` key reports a false `MISSING $group`, because `$` is read as an anchor. The literal `$group` is present (`grep -F` count 1).
- Schema: `exchangeLoginTicket`, `refreshSession`, `logout`, `me`, `createUser`, `updateUser`, `deleteUser` and `characterUpdated` all exist in `src/schema.gql`.
- All 4 `AuthErrorCode` values, all 6 `TwitchLoginErrorCode` values, `4403`, `4401` and `Token expired` match the source.
- Every env var cited exists in `.env.example`, except the FE-only `DEV_AUTH_USER_ID`, `DEV_AUTH_START_SIGNED_OUT` and `BASE_URL`, which the document explicitly labels as FE-side.
- Secret scan: no token-like string of 32 or more characters; every secret line is a `<placeholder>` or empty.

## Deviations from Plan

### Adapted to the code / current FE state

1. **FE WS client already conforms.** The plan asked to state that `graphql_client_provider.dart` captures `bootstrapToken` once. The FE code (read-only) now uses `WsReconnectPolicy`, which reads the current token on every connect and refreshes on 4401/4403 with bounded backoff. §4 documents the requirement and records that the FE already meets it.
2. **Open Question numbering.** The plan maps OQ#1 to `connection_init` and OQ#2 to post-refresh/scope. The current FE `11-RESEARCH.md` has OQ#1 = "BACKEND-NOTES missing (exact names, malformed refresh code, logout with refresh token only)" and OQ#2 = `preferEphemeral`. §11 closes both as they are worded today, plus OQ#8 (lost WS events → Phase 3). The phrases "Open Question #1" and "#2" are kept.
3. **User-requested sections.** §7 and §8 are titled exactly "Avvio in modalità dev bypass (senza chiavi Twitch)" and "Quando arrivano le chiavi Twitch". They add `openssl rand` commands, the FE `.env` block and a `curl` smoke check. The BE block also lists the optional `CLOUDINARY_*` keys, which come from `.env.example`.
4. **Extra facts from the code:**
   - the bearer token must contain no spaces (`BEARER_PATTERN`);
   - the dev stub upsert overwrites the role of an existing user with the same `twitchId`;
   - a rotation inside the grace window invalidates the token from the previous rotation;
   - an unauthenticated `logout` response means the client must refresh first;
   - public operations ignore any `Authorization` header.

## Discrepancies between code and decisions

None that contradict a locked decision. Points worth the user's attention:

- **D-26 grace window, subtle consequence.** Rotations inside the grace window stay anchored to the first rotation. A retry with the old token therefore invalidates the token the client may already have received, and a later use of that token answers `SESSION_EXPIRED`, which is terminal for the FE. This is consistent with "only the last issued pair is valid" and is documented in §2. D-26 is still flagged as "to be confirmed with the user".
- **Stale planning text, not code.** STATE.md's accumulated decision "[Phase 2]: Auth = JWT di sessione proprio (scambio `twitchToken → JWT BE` al login)" predates D-01. The implemented flow is the ticket + S256 exchange; no Twitch token is ever sent by the app.
- **Plan verify regex.** `'$group'` in the plan's verify depends on the grep flavour. It fails under ugrep `-G` and passes under BSD/GNU grep.

## Known Stubs

None.

## Threat Flags

None. The document adds no runtime surface. T-2-secret-leak (placeholders only, `.env` never read), T-2-contract-drift (grep checks against schema, enums and `.env.example`) and T-2-bypass-prod (explicit "never in production" note plus the boot refusal) are mitigated as planned.

## Next Phase Readiness

- The FE can plan and run Phase 11 against §1–§6 and keep working on the dev stub using §7.
- When the Twitch keys arrive, follow §8, then close the manual-only items in `02-VALIDATION.md`.
- Before the first deploy on existing data, run the §10 aggregation.

## Self-Check: PASSED

- FOUND: .planning/phases/02-auth-identity-foundation/BACKEND-NOTES.md
- FOUND: commit 566dc7f
- FOUND: commit c89fe38
