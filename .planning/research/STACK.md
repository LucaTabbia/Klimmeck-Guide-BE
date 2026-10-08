# Stack Research

**Domain:** Additive stack for an existing NestJS 11 + Apollo GraphQL (code-first, HTTP+WS) + Mongoose 8 backend — Twitch channel-points RPG. Adding auth (Twitch OAuth → own JWT), Twitch EventSub webhooks, FCM push, input validation, Mongo atomicity, and TDD test infrastructure.
**Researched:** 2026-07-16
**Confidence:** HIGH (versions verified against npm registry 2026-07-16; NestJS-11 peer-dep compatibility confirmed; best-practice patterns cross-checked against official docs + community sources)

> Scope note: the existing stack (NestJS 11.0.1, @nestjs/graphql 13.2 + @nestjs/apollo 13.1, Mongoose 8.18, Bull 4.16 + ioredis 5.7, graphql-ws, Cloudinary, graphology) is already in place and **not re-researched**. Everything below is what to ADD.

---

## Recommended Stack

### Core Technologies (new dependencies)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@nestjs/jwt` | `^11.0.2` | Sign & verify the BE session JWT (HTTP + WS) | First-party Nest wrapper over `jsonwebtoken`; DI-friendly `JwtService`. Peer dep `@nestjs/common ^8..^11` → compatible with Nest 11. This is the token issuer for the `twitchToken → JWT` exchange. |
| `@nestjs/passport` | `^11.0.5` | Guard/strategy plumbing for HTTP resolvers | Peer deps declare `^11.0.0` Nest + `passport ^0.7.0`. Gives the canonical `AuthGuard('jwt')` you subclass into a `GqlAuthGuard`. |
| `passport` | `^0.7.0` | Passport core (runtime for the strategy) | Required by `@nestjs/passport`; 0.7.0 is the current line. |
| `passport-jwt` | `^4.0.1` | JWT bearer extraction/verification strategy | Standard strategy to validate `Authorization: Bearer <jwt>` on HTTP GraphQL requests. Pairs with `@nestjs/jwt` for signing. |
| `@types/passport-jwt` | `^4.0.1` (dev) | Types for the strategy | Matches `passport-jwt` major. |
| `firebase-admin` | `^13.10.0` | FCM push (device tokens + topics) | The **only** first-party, actively maintained (last publish 2026-06) server SDK for FCM. Handles token send, multicast, and topic messaging. **Pin to 13.x** unless prod Node is guaranteed ≥22 — see Version Compatibility. |
| `class-validator` | `^0.15.1` | Declarative validation of GraphQL `@InputType` DTOs | De-facto standard, integrates with Nest's `ValidationPipe`. Works with code-first InputTypes out of the box. |
| `class-transformer` | `^0.5.1` | Plain→class instantiation for `ValidationPipe({ transform: true })` | Required companion to class-validator; 0.5.1 is current latest despite the low version number. |

**No Twitch strategy package is needed.** The FE performs the Twitch OAuth flow and sends us the Twitch access token. The BE validates it exactly once at login by calling Twitch's token-validate endpoint over plain HTTPS (`fetch`/`undici`, built into Node 22) — no library. Then it mints its own JWT. Adding a Passport Twitch strategy would pull in an OAuth *redirect* flow we don't use. See "What NOT to Use".

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@twurple/api` + `@twurple/auth` | `^8.1.4` | Typed Helix client for EventSub **subscription lifecycle** (create/list/delete the channel-points-redemption subscription; refresh app access token) | OPTIONAL. Use only if you want typed helpers for managing the subscription. For a single subscription you can equally do 2–3 raw `fetch` calls to Helix. Do NOT pull `@twurple/eventsub-http` for the webhook receiver (see below). |
| `@nestjs/throttler` | `^6.5.0` | Rate limiting (login mutation, EventSub endpoint hardening) | Recommended for the CONCERNS "hardening" item. Nest-11 compatible. |
| `mongodb-memory-server` | `^11.2.0` (dev) | Ephemeral MongoDB for tests, **replica-set mode** (`MongoMemoryReplSet`) | Required — replica set is what unlocks transactions + change streams in tests. No Docker needed. |
| `supertest` | `^7.0.0` (already present) | GraphQL HTTP e2e (POST to `/api/graphql`) | Already in devDeps; reuse for query/mutation e2e. |
| `graphql-ws` (client) | `^6.1.0` (dev, for tests) | Drive `connection_init`-authenticated subscription e2e tests | Use the `graphql-ws` client (same protocol the server speaks) or bare `ws` to assert the auth handshake and subscription payloads. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Twitch CLI (`twitch event trigger` / `twitch event verify-subscription`) | Locally simulate EventSub redemptions + signature | Fastest way to TDD the webhook without a live redemption. Install outside npm. |
| ngrok / cloudflared (dev) | Public HTTPS tunnel for real EventSub callback | EventSub requires a public HTTPS endpoint with a valid cert; needed only for live end-to-end verification, not unit tests. |
| Jest (already present, v30) + `@nestjs/testing` (v11) | Test runner + DI test harness | Already in place; no change. |

## Installation

```bash
# Auth
npm install @nestjs/jwt @nestjs/passport passport passport-jwt
npm install -D @types/passport-jwt

# Push notifications (pin to 13.x for Node 18/20 portability)
npm install firebase-admin@^13.10.0

# Input validation
npm install class-validator class-transformer

# Hardening (recommended)
npm install @nestjs/throttler

# Twitch EventSub subscription management (OPTIONAL — skip if using raw fetch)
npm install @twurple/api @twurple/auth

# Test infrastructure (dev)
npm install -D mongodb-memory-server graphql-ws
# supertest & @nestjs/testing already present
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt` | `@nestjs/jwt` **alone** with a fully custom `CanActivate` guard | Viable and lighter (drops 3 deps). Justified if you dislike Passport's ceremony. Trade-off: you hand-roll bearer extraction + error mapping. For WS auth you already bypass Passport (see Architecture), so a pure-`@nestjs/jwt` approach is a legitimate minimalist choice. Recommended default keeps Passport for the *HTTP* path because it's the documented Nest pattern reviewers expect. |
| Raw HMAC verification for EventSub webhook | `@twurple/eventsub-http` (`EventSubHttpListener`/middleware) | Use only if you plan many subscription types and want twurple to own verification + lifecycle. For ONE subscription it adds a heavy dep tree (`@d-fischer/*`, `httpanda`) and wants its own listener awkwardly grafted onto Nest's Express instance. Raw `crypto.createHmac` in a Nest controller is ~15 lines and fully testable. |
| `firebase-admin` | Raw FCM HTTP v1 API via `fetch` + Google auth library | Only if you want to avoid the SDK entirely; you'd re-implement OAuth2 service-account token minting. Not worth it. |
| `mongodb-memory-server` (replSet) | Testcontainers (real Mongo in Docker) | Use in CI if you need exact production Mongo version/behavior or hit an mms binary-download issue. Slower, needs Docker. |
| Atomic `$inc`/`$set` operators (Mongoose) | `optimisticConcurrency: true` (schema `__v` check) | Use optimistic concurrency when an update must preserve a *multi-field invariant* read earlier in the request (e.g. "spend N coins only if unlocked slot count == X"). For single-counter mutations (coins, twitchPoints), atomic operators are strictly better — no retry loop. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `passport-twitch`, `passport-twitch-new`, `passport-twitch-strategy` | `passport-twitch-new` is `0.0.3`, last touched 2024, and all are full OAuth2 **redirect** strategies. The FE already owns the Twitch OAuth dance; the BE only needs one-time token validation. These add an unused, unmaintained redirect flow. | Native `fetch` to `GET https://id.twitch.tv/oauth2/validate` with header `Authorization: OAuth <token>` at login, then issue your own JWT. |
| The bare `twurple` package (`1.0.0`) | It's a deprecated placeholder/meta shim, NOT the library. The real modules are the scoped `@twurple/*` at `8.1.4`. | `@twurple/api` + `@twurple/auth` (only if you adopt twurple at all). |
| `ioredis-mock` for **Bull** queue tests | Bull's `Worker`/`QueueEvents` need blocking Redis commands, `duplicate()`, and Lua `runCommand` dispatch that ioredis-mock does not faithfully implement. It silently misbehaves. **This contradicts the milestone's initial assumption — flag for the roadmap.** | Two-tier strategy: (1) **unit tests** — mock the queue at the DI boundary via `getQueueToken('spell-recovery')` and assert `queue.add(...)` was called; (2) **integration tests** of the *processor* — run against a real ephemeral Redis (Testcontainers or a CI Redis service). `ioredis-mock` is still fine for code that talks to ioredis *directly* (not through Bull). |
| `subscriptions-transport-ws` | Deprecated, unmaintained. | Already on `graphql-ws` — keep it. |
| `firebase-admin@14` on Node < 22 | v14 sets `engines.node ">=22"`; installing on Node 18/20 breaks. | `firebase-admin@^13.10.0` (engines `>=18`), or upgrade prod runtime to Node 22 LTS first. |
| Read-modify-write in JS for coins/twitchPoints/usages | Root cause of the CONCERNS race conditions (WIP spell-use decrements before validation). Two concurrent requests lose updates. | Single atomic `findOneAndUpdate` with `$inc` + a filter guard (e.g. `{ _id, coins: { $gte: cost } }`), inside a Mongo transaction when multiple documents change together. |

## Stack Patterns by Variant

**Auth — HTTP GraphQL resolvers:**
- `GqlAuthGuard extends AuthGuard('jwt')`, override `getRequest(ctx)` to return `GqlExecutionContext.create(ctx).getContext().req`.
- Register globally (`APP_GUARD`) + a `@Public()` metadata decorator to opt out (login mutation, EventSub controller, health).
- Because it's a global guard, the raw EventSub controller and login mutation must be explicitly public.

**Auth — WS subscriptions (`connection_init`):**
- Do NOT use Passport here. In `GraphQLModule` → `subscriptions['graphql-ws'].onConnect`, read `connectionParams.authorization` (or `Authorization`), verify the JWT with `JwtService.verifyAsync`, and stash the user on `extra.user`.
- Expose it via the module-level `context: ({ extra }) => ({ user: extra?.user })`.
- Reject unauthenticated sockets by throwing in `onConnect` (closes the socket before any subscription). This is the contract that closes FE Open Question #1.

**Dev-auth stub (must not block FE phases 2–10):**
- Guard checks `NODE_ENV !== 'production'` and a configured `DEV_AUTH_ACCESS_TOKEN`. If the incoming bearer equals that value, resolve to a fixed stub identity instead of verifying a real JWT. Same shortcut in `onConnect`. Gate strictly behind non-prod env.

**Twitch EventSub webhook receiver:**
- Dedicated `@Public()` Nest controller. Needs the **raw request body** — enable with `NestFactory.create(AppModule, { rawBody: true })` and read `req.rawBody`, or an `express.raw({ type: 'application/json' })`-scoped route. JSON-parsed body will fail HMAC.
- Verify: `HMAC_SHA256(secret, id + timestamp + rawBody)` compared (timing-safe) to `Twitch-Eventsub-Message-Signature`.
- Handle the three message types: `webhook_callback_verification` (echo the `challenge`), `notification` (credit `twitchPoints` 1:1, idempotent on `Twitch-Eventsub-Message-Id`), `revocation` (log/alert).
- Idempotency: dedupe on message-id (redemptions can be re-delivered) before applying the atomic `$inc`.

**FCM targeting:**
- Per-device token registry: store an array of `{ token, platform, lastSeen }` on the User (or a `Device` collection). Prune tokens that return `messaging/registration-token-not-registered`.
- Personal events (travel-end, quest-end, combat-result-id) → `messaging().sendEachForMulticast({ tokens, ... })` to that user's devices.
- Broadcast events (streamer-live) → **topic** (`condition`/topic `streamer-live`); subscribe device tokens to the topic on registration. Avoids fanning out to every token.
- Combat-result hybrid: push carries only the `CombatResult` id; app re-queries via GraphQL (matches COMBAT-01..07).

**Mongo atomicity / optimistic locking (Mongoose 8):**
- Transactions: `session = await connection.startSession(); await session.withTransaction(async () => { ... })`. Requires a replica set — already true in prod-style deploys and in tests via `MongoMemoryReplSet`.
- Prefer atomic operators over transactions where a single document suffices (cheaper, no retry).
- Enable `optimisticConcurrency: true` on schemas whose invariants span multiple fields read earlier in the request; be ready to catch `VersionError` and retry.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@nestjs/passport@11` | `@nestjs/common@11`, `passport@0.7` | Peer deps: `@nestjs/common ^10||^11`, `passport ^0.5||^0.6||^0.7`. ✓ |
| `@nestjs/jwt@11` | `@nestjs/common@11` | Peer `^8||^9||^10||^11`. ✓ |
| `passport-jwt@4` | `passport@0.7` | Standard pairing. ✓ |
| `firebase-admin@13.10` | Node ≥18 | Portable across current LTS lines. Recommended default. |
| `firebase-admin@14.1` | **Node ≥22 only** | `engines.node ">=22"`. Local dev is Node 22.12, so 14 *works here*, but pinning 13.x keeps CI/deploy flexible. Only adopt 14 if prod runtime is pinned to Node 22 LTS. |
| `@twurple/*@8.1.4` | Node ≥18, ESM/CJS interop | If adopted, keep all `@twurple/*` on the **same** version (they cross-pin exactly, e.g. `@twurple/eventsub-http` deps `@twurple/auth@8.1.4`). |
| `mongodb-memory-server@11` | Mongoose 8 / mongodb driver 6 | Use `MongoMemoryReplSet` (not the single `MongoMemoryServer`) for transaction + change-stream tests. |
| `class-transformer@0.5.1` | `class-validator@0.15.1` | Canonical pairing for Nest `ValidationPipe`. ✓ |
| `graphql-ws@6` (test client) | server `graphql-ws` (already configured) | Same protocol; safe for e2e. |

## Sources

- npm registry (`npm view`, 2026-07-16) — verified current versions + `engines`/`peerDependencies` for every package above (HIGH).
- NestJS official docs — GraphQL Subscriptions (`graphql-ws` `onConnect`/`extra`/`context` auth pattern): https://docs.nestjs.com/graphql/subscriptions (HIGH).
- nestjs/graphql issue #1341 & nestjs/nest #9737 — WS subscription auth via connection params (MEDIUM, corroborates docs).
- Twitch Developers — Handling Webhook Events (HMAC over id+timestamp+rawBody, `Twitch-Eventsub-Message-Signature`, challenge/notification/revocation): https://dev.twitch.tv/docs/eventsub/handling-webhook-events (HIGH).
- twitchdev/eventsub-webhooks-node-sample — `express.raw` raw-body requirement (HIGH, official sample).
- redis/redis discussion #12436 + community reports — ioredis-mock unfit for Bull (blocking cmds, `duplicate()`, Lua) → mock at Queue DI level or use real Redis (MEDIUM–HIGH, multiple corroborating sources).
- Twitch OAuth validate endpoint (`GET id.twitch.tv/oauth2/validate`, `Authorization: OAuth`) — from Twitch auth docs (HIGH, stable API from training + docs).
- Mongoose 8 transactions (`session.withTransaction`) & `optimisticConcurrency` schema option — Mongoose official docs (HIGH, stable).

---
*Stack research for: additive backend stack (auth / Twitch EventSub / FCM / TDD infra) on NestJS 11 + Apollo 13 + Mongoose 8*
*Researched: 2026-07-16*
