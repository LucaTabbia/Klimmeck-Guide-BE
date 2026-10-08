# Project Research Summary

**Project:** Klimmeck Guide — Backend
**Domain:** Game backend (NestJS + MongoDB + GraphQL) con integrazione Twitch — brownfield security/integrity retrofit
**Researched:** 2026-07-16
**Confidence:** HIGH

## Executive Summary

This is a brownfield security/integrity retrofit, not a greenfield build. Today the backend has zero auth, open subscriptions, no input validation, and three concurrency bugs in the economy path (`useSpell`, `doTransaction`, equip) using read-modify-write instead of atomic ops. Expert pattern: exchange Twitch token once for a first-party JWT, one global guard for HTTP+WS, atomic `$inc`/transactions for all balance writes, push as a non-authoritative side-channel behind subscriptions/queries.

Key risks are things that *look* fixed but aren't: WS auth checked once at connect but never re-verified for expiry; "authenticated" subscriptions still lacking an ownership filter; Mongoose `__v` not actually protecting scalar counters (it increments only on array ops during `save()`); EventSub HMAC computed on the wrong (re-parsed) bytes; Bull jobs treated as source of truth for timers when Redis can lose them (DB persists `endTime`, the job is only a trigger + boot reconciler).

## Key Findings

### Recommended Stack

Additive stack on top of the existing NestJS 11 / Mongoose 8 / Apollo 13 / Bull + ioredis base (do not replace anything).

**Core technologies:**
- `@nestjs/jwt@11` + `@nestjs/passport@11` + `passport-jwt@4`: session JWT issuance and HTTP guard — no Twitch Passport strategy; the FE owns the OAuth dance, the BE validates once via `GET id.twitch.tv/oauth2/validate` (native `fetch`) and mints its own JWT
- WS auth: manual JWT verification inside `subscriptions['graphql-ws'].onConnect`, user stashed on `ctx.extra` — Passport does not cover this path
- EventSub: raw `crypto` HMAC-SHA256 verification in a `@Public()` controller with `rawBody: true`; `@twurple/api`/`@twurple/auth` optional for subscription lifecycle only (the bare `twurple@1.0.0` package is a deprecated placeholder — avoid)
- `firebase-admin@^13.10.0` (Node ≥18): FCM HTTP v1 — v14 hard-requires Node ≥22; confirm prod runtime before bumping
- `mongodb-memory-server@11` in `MongoMemoryReplSet` mode: unlocks transactions + change streams in tests
- Bull testing: mock the queue at the `getQueueToken` DI boundary for unit tests + real ephemeral Redis for processor integration tests — **`ioredis-mock` is NOT viable for Bull** (blocking commands, `duplicate()`, Lua)
- `class-validator` + global `ValidationPipe`: input validation on GraphQL code-first inputs

### Expected Features

**Must have (table stakes):**
- Session JWT auth (gates all authorization) + fail-closed dev-mode stub compatible with FE `DEV_AUTH_ACCESS_TOKEN`
- Ownership + role authorization (`innkeeper`) with server-side enforcement + admin audit log (who/what/when)
- EventSub points sync shipped as one bundle: HMAC verification (over `message_id + timestamp + raw_body`) + challenge handshake + `message_id` dedup (delivery is at-least-once, 10-min replay window) + atomic `$inc` credit
- Atomic economy ops: conditional single-document updates (`$inc` guarded by `$gte`) for balance debits; Mongo transactions for genuinely multi-document ops; `versionKey` OCC for array mutations (equip/spell slots)
- Travel: lazy evaluation from persisted `endTime` for correct reads + Bull delayed job for the travel-end push + boot reconciler
- Combat result: persisted entity + subscription full payload + FCM `data` message with ID (only data messages allow background requery)

**Defer (v2+ / anti-features):**
- Multi-channel support, horizontal scaling / Redis PubSub adapter, per-request Twitch validation, long-term per-user Twitch token storage, generic RBAC matrix

### Architecture Approach

Auth enters through one seam, two shapes: a single global `GqlAuthGuard` (`APP_GUARD`) reading identity from `req.user` (HTTP) or `ctx.extra.user` (WS); the current `subscriptions: { "graphql-ws": true }` with no `onConnect` is the exact insertion point. Transactions layer cleanly **under** the existing change stream (streams emit only after majority-commit, so the watcher fires post-commit exactly as today; never `pubSub.publish` inside a transaction). Subscription authorization flips from client-supplied arg to authenticated identity. EventSub is the only new REST surface. FCM lives in a domain-agnostic shared module (`sendToUser(userId, payload)`) consumed by travel/combat/points/streamer-live.

**Major components:**
1. Auth module (login mutation, JWT service, HTTP guard + WS onConnect, dev-mode bypass, `@Public()`/`@Roles()` decorators)
2. Atomic-ops primitive in the service layer (fixes `doTransaction`/`useSpell`/equip once)
3. EventSub webhook controller → points credit service → change stream → subscription
4. Notifications module (FCM token registry + send service)
5. Travel lifecycle (mutation → `activeTravel` → Bull trigger → completion/teleport atomics)
6. CombatResult entity + delivery (subscription payload, push ID, requery query)

### Critical Pitfalls

1. **WS `connection_init` auth ≠ subscription authorization** — authenticate at connect AND filter `characterUpdated` by owner identity, not client arg
2. **Mongoose `__v` gives false confidence** — it does not protect scalar counters (coins, usages); use `$inc`/`findOneAndUpdate` guards or transactions
3. **EventSub HMAC on re-parsed bytes** — requires `rawBody: true` and signing `messageId + timestamp + rawBody`; dedup must ship with the credit path or players get double-credited
4. **Bull as source of truth for timers** — Redis eviction/flush loses jobs; persist `endTime` in Mongo, job is trigger-only, reconcile at boot
5. **Retrofit gaps** — the REST Cloudinary controller stays uncovered by a GraphQL-only guard; dev bypass must be fail-closed so it cannot leak to production

## Implications for Roadmap

Based on research, suggested phase structure (9 phases):

### Phase 1: Test Foundation (TDD infra)
**Rationale:** nothing downstream is TDD-able without it; de-risk memory-server replica-set CI flakiness early
**Delivers:** replica-set `mongodb-memory-server`, Bull DI-mock + ephemeral Redis harness, fixtures/factories

### Phase 2: Auth Foundation
**Rationale:** everything else reads its claims; unblocks FE Phase 3 (connection_init contract) and Phase 11
**Delivers:** login `twitchToken → JWT`, global guard (HTTP + WS `onConnect`), fail-closed dev stub, `@Public()` whitelist migration ramp

### Phase 3: Atomic Economy Operations
**Rationale:** fixes `useSpell`/`doTransaction`/equip once so later features (EventSub credit, travel) don't re-introduce the bug
**Delivers:** `$inc`/transaction primitives, refactored economy paths, RED-first concurrency tests

### Phase 4: Subscription & Mutation Authorization
**Rationale:** ownership filter + role guard build on auth claims; REST coverage audit closes retrofit gaps
**Delivers:** identity-based subscription filtering, ownership checks on mutations, `@Roles(innkeeper)` guard

### Phase 5: Notifications (FCM) Infrastructure
**Rationale:** shared push service pulled forward before its three consumers (travel, quest/combat, streamer-live); unblocks FE Phase 5
**Delivers:** firebase-admin wiring, per-device token registry, `sendToUser`, stale-token pruning

### Phase 6: Twitch EventSub Points Sync
**Rationale:** HMAC + challenge + idempotency + atomic credit shipped as one bundle
**Delivers:** webhook endpoint (`rawBody: true`), dedup store, `twitchPoints` credit path

### Phase 7: Travel Lifecycle (TRAVEL-01)
**Rationale:** depends on atomics (3), notifications (5); unblocks FE Phase 7
**Delivers:** `status.activeTravel`, start/complete/teleport-clear atomics, Bull trigger + boot reconciler, travel-end push

### Phase 8: Combat Result Hybrid Delivery
**Rationale:** depends on notifications (5) and auth; unblocks FE Phase 9
**Delivers:** persisted CombatResult, subscription payload, push-ID data message, `combatResult(id)` query

### Phase 9: Cross-Cutting Hardening & Contracts
**Rationale:** validation, introspection/CORS, audit log; QUEST-04 schema fields can land as early as Phase 2's window for staging
**Delivers:** class-validator + ValidationPipe, prod introspection off, error sanitization, CORS, admin audit log

### Phase Ordering Rationale

- Test foundation and auth are the true prerequisites; everything else reads their output
- Atomicity is the transversal foundation: idempotent EventSub credit and travel lifecycle depend on it; transactions require replica set (verify prod topology)
- QUEST-04/TRAVEL-01 schema *fields* can land early for staging even if lifecycle logic arrives later — FE phases 6/7 are unblocked by the schema on staging
- Migration ramp for auth: dev-bypass fail-closed → `@Public()` whitelist → global guard; contracts on staging before the FE phases that consume them

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Auth):** graphql-ws/@nestjs/apollo context-propagation nuance (nestjs/graphql#1756) — MEDIUM confidence, pin with integration test
- **Phase 1 (Test Foundation):** mongodb-memory-server replica-set CI flakiness / binary caching
- **Phase 6 (EventSub):** Twitch Helix subscription-lifecycle specifics (app access token, expiry/revocation)

Phases with standard patterns (skip research-phase):
- **Phase 3 (Atomics):** Mongo atomic ops — HIGH confidence, fully worked in ARCHITECTURE.md
- **Phase 5 (FCM):** firebase-admin — HIGH confidence
- **Phases 7/8:** fully worked in ARCHITECTURE.md

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against live npm registry (2026-07-16), engines/peerDependencies inspected |
| Features | HIGH | Maps 1:1 to Active requirements + 18 verified CONCERNS; EventSub semantics confirmed on official Twitch docs |
| Architecture | HIGH | NestJS/MongoDB official docs; MEDIUM only on graphql-ws context propagation |
| Pitfalls | HIGH | Load-bearing facts verified on official sources (EventSub app token, `__v` semantics, FCM HTTP v1) |

**Overall confidence:** HIGH

### Gaps to Address

- graphql-ws context-propagation exact behavior in @nestjs/apollo@13 → integration test in the auth phase, not mocked context
- Prod MongoDB topology genuinely replica set? (change stream implies it; verify before the transaction layer)
- Prod Node runtime (18/20 vs 22) → gates firebase-admin 13 vs 14
- Prod Redis policy (`maxmemory-policy`, AOF/RDB) → Bull delayed jobs can be evicted under `allkeys-lru`
- Exact dev-auth-stub env-var contract with FE — confirm token value exchange convention in the auth phase handoff
- JWT refresh/revocation deliberately deferred: short TTL (15–60 min) now, refresh strategy revisited with FE Phase 11 handoff

## Sources

### Primary (HIGH confidence)
- Twitch Developers — Handling Webhook Events, EventSub Subscription Types, OAuth validate/revoke
- NestJS docs — GraphQL Subscriptions, Raw Body, Guards
- MongoDB docs — Change Streams, Transactions
- npm registry (live, 2026-07-16) — package versions and engines

### Secondary (MEDIUM confidence)
- nestjs/graphql#1756 — subscription context propagation nuance
- Mongoose OCC articles (thecodebarbarian, OneUptime) — `__v`/optimisticConcurrency semantics

---
*Research completed: 2026-07-16*
*Ready for roadmap: yes*
