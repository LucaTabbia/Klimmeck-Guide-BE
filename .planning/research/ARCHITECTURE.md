# Architecture Research

**Domain:** Auth + real-time + webhook + push integration into an existing NestJS 11 / Apollo GraphQL (code-first) / Mongoose 8 modular monolith
**Researched:** 2026-07-16
**Confidence:** HIGH (NestJS/Mongoose patterns verified against existing code + current docs; MEDIUM on the exact graphql-ws context-propagation nuance, which is a known pin-point)

> **Framing.** This is a brownfield milestone. The existing architecture (feature modules of module/resolver/service, unified `@ObjectType`+`@Schema` models, Character change stream → `graphql-subscriptions` PubSub → filtered subscription, Bull delayed jobs, graphology road graph) is **kept and extended, not replaced**. Every recommendation below slots into that structure. Note: the current PubSub injected as `'PUB_SUB'` is `graphql-subscriptions` `PubSub` (not `@graphql-yoga/subscription`, despite the codebase doc), and `subscriptions: { "graphql-ws": true }` currently has **no `onConnect` hook** — that is the seam where auth enters the WS path.

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         TRANSPORT / EDGE                               │
│  ┌───────────────┐   ┌───────────────┐   ┌──────────────────────┐     │
│  │ GraphQL HTTP  │   │ GraphQL WS     │   │ REST controllers     │     │
│  │ (queries/     │   │ (subscriptions,│   │ /eventsub (Twitch)   │     │
│  │  mutations)   │   │  connection_   │   │ /cloudinary (exists) │     │
│  └──────┬────────┘   │  init auth)    │   └─────────┬────────────┘     │
│         │            └──────┬─────────┘             │ rawBody+HMAC     │
├─────────┼───────────────────┼───────────────────────┼─────────────────┤
│                         GUARD / AUTH LAYER                             │
│  ┌─────────────────────────────────────────────────────────────┐      │
│  │ Global GqlAuthGuard (APP_GUARD) + @Public + @Roles/RolesGuard│      │
│  │ HTTP: req.user   WS: onConnect → ctx.extra.user   Dev: stub  │      │
│  └─────────────────────────────────────────────────────────────┘      │
├───────────────────────────────────────────────────────────────────────┤
│                         DOMAIN / SERVICE LAYER                         │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐  │
│  │ auth   │ │characters│ │ travel │ │ combat │ │ points │ │notificat.│  │
│  │(new)   │ │(exists) │ │ (new)  │ │ (new)  │ │ (new)  │ │ (new)    │  │
│  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └────┬─────┘  │
│      │          │          │          │          │           │        │
│      │   atomic ops (session/withTransaction, $inc, optimistic)       │
├──────┼──────────┼──────────┼──────────┼──────────┼───────────┼────────┤
│                    PERSISTENCE + EVENT FABRIC                          │
│  ┌──────────────┐   ┌──────────────────┐   ┌───────────────────────┐  │
│  │ MongoDB (RS) │──▶│ Change Streams   │──▶│ PubSub (in-mem)       │  │
│  │ Users/Chars/ │   │ (post-commit,    │   │ → filtered @Subscription│ │
│  │ CombatResult │   │  fullDocument)   │   │   authorized by identity│ │
│  └──────────────┘   └──────────────────┘   └───────────────────────┘  │
│  ┌──────────────┐   ┌──────────────────┐                              │
│  │ Redis / Bull │──▶│ Processors       │  (spell recovery, travel     │
│  │ delayed jobs │   │ (delayed apply)  │   completion)                │
│  └──────────────┘   └──────────────────┘                              │
└───────────────────────────────────────────────────────────────────────┘
                              │
                     ┌────────┴─────────┐
              ┌──────▼──────┐    ┌───────▼────────┐
              │ Twitch API  │    │ FCM (firebase- │
              │ (login+     │    │  admin, HTTP v1)│
              │  EventSub)  │    └────────────────┘
              └─────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `auth` module (new) | Exchange `twitchToken → BE JWT` at login; validate JWT on every request; expose `@CurrentUser`, `@Public`, `@Roles` | `AuthService` (Twitch validate-once + sign JWT), `AuthResolver.login`, `JwtStrategy`, global `GqlAuthGuard`, `RolesGuard` |
| Global auth guard | Enforce identity on HTTP + WS; bypass `@Public`; dev-mode stub identity | `APP_GUARD` guard using `GqlExecutionContext.create(ctx).getContext()`; reads `req.user` (HTTP) or `ctx.extra.user` (WS) |
| `notifications` module (new) | Domain-agnostic push send + device-token registry | `NotificationsService` wrapping `firebase-admin`; `registerDeviceToken` mutation storing tokens on `User` |
| `points` module (new) | Credit `twitchPoints` from EventSub redemptions | `EventSubController` (REST, `@Public`, HMAC) + `PointsService.credit()` with atomic `$inc` |
| `travel` (new, likely on characters) | Start/complete/teleport lifecycle for `status.activeTravel` | Mutation computes ETA via `RoadsService`, persists activeTravel, enqueues Bull delayed job; processor applies completion atomically |
| `combat` module (new) | Persist `CombatResult`, emit full payload + push ID | `CombatService.resolve()` in transaction → new subscription + FCM push carrying `resultId`; `combatResult(id)` query |
| Atomic-ops primitive | Wrap multi-doc read-modify-write; single-doc counters | `connection.startSession()` + `session.withTransaction()`; `$inc`/conditional `findOneAndUpdate` for counters |
| Change-stream emitters (exists) | Fire subscriptions on committed state | Unchanged: watches collection, re-fetches populated doc, publishes to PubSub |

## Recommended Project Structure

```
src/
├── auth/                       # NEW — identity is the foundation everything depends on
│   ├── auth.module.ts
│   ├── auth.service.ts         # twitch validate-once → sign JWT; verify JWT
│   ├── auth.resolver.ts        # login(twitchToken): mutation (@Public)
│   ├── strategies/
│   │   └── jwt.strategy.ts     # passport-jwt (or manual verify) — claims: userId, twitchId, role
│   ├── guards/
│   │   ├── gql-auth.guard.ts   # global; HTTP + WS aware; honors @Public + dev stub
│   │   └── roles.guard.ts      # @Roles(innkeeper) admin gate
│   └── decorators/
│       ├── current-user.decorator.ts   # @CurrentUser() from Gql context
│       ├── public.decorator.ts         # @Public() SetMetadata
│       └── roles.decorator.ts          # @Roles(...) SetMetadata
├── notifications/              # NEW — shared, domain-agnostic push
│   ├── notifications.module.ts # @Global or explicitly exported
│   ├── notifications.service.ts# firebase-admin wrapper; sendToUser(userId, payload)
│   └── device-token.resolver.ts# registerDeviceToken / unregister mutations
├── points/                     # NEW — Twitch channel-points sync
│   ├── points.module.ts
│   ├── eventsub.controller.ts  # REST, @Public, rawBody, HMAC verify, challenge, dedupe
│   └── points.service.ts       # atomic $inc twitchPoints by twitchId
├── combat/                     # NEW
│   ├── combat.module.ts
│   ├── combat.resolver.ts      # combatResult(id) query + combatResultReceived subscription
│   └── combat.service.ts       # resolve() in txn → persist + emit + push
├── characters/                 # EXISTS — extend
│   ├── travel.service.ts       # NEW co-located: startTravel / completeTravel / teleport
│   ├── travel-completion.processor.ts  # NEW Bull processor
│   └── ... (existing)
├── common/                     # NEW — cross-cutting
│   ├── transaction.util.ts     # withTransaction helper over the mongoose connection
│   └── audit/                  # admin audit log (who/what/when)
├── models/
│   ├── user.model.ts           # EXTEND: role, deviceTokens[], twitchPoints
│   ├── combat-result.model.ts  # NEW @ObjectType+@Schema
│   ├── character/character-status.model.ts  # EXTEND: activeTravel, activeStoryQuest...
│   └── request/                # NEW inputs: login, register-device-token, start-travel...
└── app.module.ts               # EXTEND: rawBody, APP_GUARD, subscriptions.onConnect, JwtModule
```

### Structure Rationale

- **`auth/` as a first-class module, not scattered guards:** it owns the JWT contract (login → claims) and the guard/decorator surface every other module consumes. Keeping strategies/guards/decorators in subfolders matches NestJS convention and keeps the global guard discoverable.
- **`notifications/` is domain-agnostic on purpose:** travel, combat, quests, and streamer-live all need push. If FCM logic lived inside any one domain, the others would import it sideways. A shared service (Global module) with a `sendToUser(userId, {title, body, data})` signature keeps callers ignorant of tokens/FCM.
- **`points/` owns the only REST surface besides Cloudinary:** EventSub is a webhook, not GraphQL. Isolating the controller keeps `rawBody`/HMAC concerns out of the GraphQL path.
- **Travel co-located in `characters/`:** `activeTravel` lives on `Character.status`; the lifecycle mutates the same aggregate and reuses the existing change stream. A separate module would fight the aggregate boundary. Combat, by contrast, gets its **own** module because `CombatResult` is a new persisted entity with its own subscription/query.
- **`common/transaction.util.ts`:** one helper so every service opens sessions the same way; avoids each service re-implementing `withTransaction` and drifting.

## Architectural Patterns

### Pattern 1: One global guard, two context shapes (HTTP + WS)

**What:** A single `APP_GUARD` extracts the request from `GqlExecutionContext` and resolves the user from `req.user` (HTTP, set by JWT verify) or `ctx.extra.user` (WS, set in `onConnect`). `@Public()` (checked via `Reflector`) bypasses it for `login` and the EventSub controller.
**When to use:** Always — it is the enforcement point that closes CONCERNS "auth assente" and "subscription aperte" in one place.
**Trade-offs:** Global default-deny is safest but you must remember `@Public` on every truly-open route; the WS/HTTP branching adds a little guard complexity. Worth it vs. per-resolver guards that are easy to forget.

**Example:**
```typescript
@Injectable()
export class GqlAuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private auth: AuthService) {}
  canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride('isPublic', [context.getHandler(), context.getClass()])) return true;
    const gqlCtx = GqlExecutionContext.create(context).getContext();
    // WS: user was validated in onConnect and lives on the connection's `extra`
    if (gqlCtx?.extra?.user) return true;               // subscription op
    const req = gqlCtx.req;                              // HTTP op
    req.user = this.auth.verify(extractBearer(req));     // throws → 401
    return true;
  }
}
```

### Pattern 2: `connection_init` auth via graphql-ws `onConnect` (the connection_init contract)

**What:** The WS handshake carries credentials in `connection_init` payload → `connectionParams`. `onConnect` validates the JWT once, rejects on failure, and stores the user on `ctx.extra` so it survives for the whole socket. The GraphQL `context` factory surfaces `extra` to resolvers/filters. Verified against current @nestjs/apollo + graphql-ws behavior (see Sources; nestjs/graphql#1756 documents the propagation nuance).
**When to use:** This *is* the `connection_init` contract the FE Phase 3/11 needs. In dev, accept the `DEV_AUTH_ACCESS_TOKEN` identity here so FE phases 2–10 keep working.
**Trade-offs:** Auth happens at connect time, not per-message — fine for a session JWT; if the token expires mid-socket you don't re-check unless you add it. Known nuance: what `onConnect` returns vs. what lands in resolver context differs between transports — pin it with an integration test.

**Example:**
```typescript
// app.module.ts GraphQLModule config
subscriptions: {
  'graphql-ws': {
    onConnect: (ctx) => {
      const token = (ctx.connectionParams as any)?.Authorization ?? (ctx.connectionParams as any)?.authToken;
      const user = authService.verifyOrDevStub(token);   // throw → connection rejected
      (ctx.extra as any).user = user;                      // available to context + resolvers
    },
  },
},
context: (ctx) => ({ req: ctx.req, extra: ctx.extra }),   // WS path carries `extra`
```

### Pattern 3: Subscription authorization by identity, not by client-supplied arg

**What:** Today `characterUpdated(id)` filters `payload.id === variables.id` — any client can watch any character. Change the filter to compare the payload's owner against the **authenticated** user from context. The resolver stops taking a spoofable `id` arg (or ignores it).
**When to use:** For every user-scoped subscription (`characterUpdated`, `userUpdated`, `combatResultReceived`).
**Trade-offs:** Requires the payload to carry an owner reference (e.g., `character.userId`) so the filter can compare. Minor schema/model touch; big security win.

**Example:**
```typescript
@Subscription(() => Character, {
  name: 'characterUpdated',
  filter: (payload, _vars, ctx) =>
    payload.characterUpdated.userId?.toString() === ctx.extra.user.id,
})
characterUpdated() { return this.pubSub.asyncIterableIterator('characterUpdated'); }
```

### Pattern 4: Transactions layered UNDER the existing change-stream emission

**What:** Wrap multi-document read-modify-write in `session.withTransaction()`, passing `session` to every model op. On **commit**, MongoDB emits the change (majority-committed, `fullDocument`) and the existing watcher re-fetches + publishes — untouched. For single-counter fields (`coins`, `twitchPoints`, spell `usages`) prefer atomic `$inc`/conditional `findOneAndUpdate` over read-modify-write to eliminate lost updates.
**When to use:** Combat resolution, teleport (clear travel + set location + job removal), quest accept, EventSub credit. Requires MongoDB **replica set** (prod: Atlas/RS; tests: mongodb-memory-server RS — already decided).
**Trade-offs:** Change streams fire only after commit, so mid-transaction states never leak to subscribers (a feature). Do NOT publish to PubSub *inside* the transaction — let the post-commit change stream do it, or you risk emitting a state that later rolls back. The existing re-fetch (`findOne` outside the session) is correct because it runs after commit.

**Example:**
```typescript
await this.connection.transaction(async (session) => {
  await this.characterModel.updateOne(
    { _id, 'status.activeTravel.jobId': jobId },     // guard: still the same travel
    { $set: { 'status.location': dest }, $unset: { 'status.activeTravel': 1 } },
    { session },
  );
}); // commit → change stream → characterUpdated emit (no manual publish here)
```

## Data Flow

### EventSub → points credit → subscription

```
Twitch redemption
   ↓  POST /eventsub (rawBody)
EventSubController: verify HMAC(messageId+timestamp+rawBody) → handle challenge / dedupe messageId
   ↓ 2xx fast, then
PointsService.credit(twitchUserId, amount)
   ↓ atomic $inc on User.twitchPoints (by twitchId)  [transaction if multi-doc]
User doc commits → change stream → PubSub → userUpdated (filtered by identity)
   ↓ (optional)
NotificationsService.sendToUser(userId, "points added")
```

### Travel lifecycle (start → complete, with teleport override)

```
startTravel mutation (@CurrentUser)
   ↓ RoadsService.getShortestPath → duration/ETA
   ↓ persist status.activeTravel { road, startTime, endTime, duration, jobId }
   ↓ enqueue Bull delayed job (delay = duration, jobId = char-scoped)
   … time passes …
TravelCompletionProcessor
   ↓ txn: IF activeTravel.jobId still matches → set location, clear activeTravel
   ↓ commit → change stream → characterUpdated
   ↓ NotificationsService.sendToUser(userId, "travel complete")

teleport mutation (admin/innkeeper)
   ↓ txn: remove Bull job by jobId  +  set location + clear activeTravel  (atomic)
   ↓ completion processor is now a no-op (guard clause fails) → idempotent
```

### Combat result (hybrid payload + push ID)

```
CombatService.resolve()
   ↓ txn: persist CombatResult + apply HP/loot deltas to Character
   ↓ commit
   ├─ publish full CombatResult on combatResultReceived (filtered by user)   [foreground gets everything]
   └─ NotificationsService.sendToUser(userId, { data: { combatResultId } })  [background requeries]
combatResult(id) query                                                        [background fetch by ID]
```

### State Management

```
MongoDB (source of truth)
    ↓ change stream (post-commit, majority-durable)
Existing watcher re-fetches populated aggregate
    ↓ PubSub.publish
Filtered @Subscription (authorized by ctx.extra.user)
    ↓ WebSocket
Flutter client (purely reactive)
```

### Key Data Flows

1. **Auth once, trust thereafter:** login validates the Twitch token a single time, mints a BE JWT with `{ userId, twitchId, role }`; all subsequent HTTP requests and the WS `connection_init` verify the JWT locally — zero per-request Twitch calls (respects the rate-limit constraint).
2. **Write → commit → stream → emit:** all state-changing flows converge on the same tail: transactional/atomic write → change stream → filtered subscription. New features reuse this instead of publishing manually.
3. **Push is a side-channel, never the source of truth:** FCM carries at most an ID; the authoritative payload always arrives via subscription or a query.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–1k users (single channel, v1.0) | Current single-instance monolith is correct. In-memory PubSub, one change stream per watched collection, one Bull worker — all fine. |
| 1k–100k | Watch for change-stream fan-out cost (re-fetch-per-event). Batch/debounce emissions; ensure subscription filters are cheap. FCM: use multicast/batch send. |
| 100k+ / multi-instance | In-memory PubSub breaks across instances → swap to a Redis PubSub adapter (explicitly deferred in PROJECT scope). Change streams must run on one leader or be deduped to avoid N-instance double-emit. |

### Scaling Priorities

1. **First bottleneck — change-stream re-fetch:** every Character update triggers a fully-populated `findOne`. Under load this is the hot path; project a lighter payload or cache populations before adding instances.
2. **Second bottleneck — in-memory PubSub is single-instance:** the moment you run two pods, subscriptions and change-stream emits diverge. That is the trigger to adopt the Redis adapter, not before.

## Anti-Patterns

### Anti-Pattern 1: Publishing to PubSub inside a transaction

**What people do:** Call `pubSub.publish(...)` in the middle of `withTransaction`.
**Why it's wrong:** The transaction can still roll back → clients see a state that never persisted. It also duplicates the change-stream emit.
**Do this instead:** Let the post-commit change stream drive emission. Only push non-authoritative signals (FCM ID) after `await session commit`.

### Anti-Pattern 2: Trusting a client-supplied `id` in subscriptions/mutations

**What people do:** `characterUpdated(id)` / `useSpell(characterId)` filtered or scoped by the arg the client sent.
**Why it's wrong:** Any authenticated (or currently, any anonymous) client can read/mutate another player's character — the exact ownership hole in CONCERNS.
**Do this instead:** Derive ownership from `@CurrentUser()` / `ctx.extra.user`; treat client IDs as untrusted and authorize against the token identity.

### Anti-Pattern 3: Read-modify-write on counters (`coins`, `twitchPoints`, `usages`)

**What people do:** `doc.coins += x; await doc.save()` (as in current `doTransaction`/`useSpell`).
**Why it's wrong:** Concurrent redemptions/uses race → lost updates; the existing `useSpell` even decrements before validating.
**Do this instead:** Atomic `$inc` with a conditional filter (`{ 'usages': { $gt: 0 } }`) or a transaction; validate in the query, not in JS.

### Anti-Pattern 4: Verifying webhooks on the parsed body

**What people do:** Compute the EventSub HMAC over the JSON-parsed body.
**Why it's wrong:** Re-serialization changes bytes → signature never matches. Also skipping the `webhook_callback_verification` challenge or message-ID dedupe causes dropped/duplicate credits.
**Do this instead:** Enable `rawBody: true`, HMAC over `messageId + timestamp + rawBody`, `crypto.timingSafeEqual`, answer the challenge, dedupe by `Twitch-Eventsub-Message-Id`, reject stale timestamps.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Twitch OAuth (login) | REST call at login only to validate token, then mint BE JWT | Validate-once respects rate limit; store `twitchId` + `role` in claims |
| Twitch EventSub | Inbound webhook (REST controller, HMAC-SHA256) | Needs public HTTPS endpoint; challenge + dedupe + timing-safe compare; `rawBody: true` |
| FCM (firebase-admin) | Outbound HTTP v1 via `firebase-admin` SDK; per-device tokens on `User` | Handle token invalidation (prune on `messaging/registration-token-not-registered`); prefer multicast |
| Cloudinary (exists) | REST controller (unchanged) | Already `@Public`-equivalent; ensure the new global guard doesn't accidentally lock it |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| auth ↔ every module | Guards/decorators (DI), context injection | auth exports guard + decorators; modules never re-implement identity |
| notifications ↔ travel/combat/points/quests | Direct service call `sendToUser(userId, payload)` | Global/exported module; callers pass domain-agnostic payload |
| points(EventSub) ↔ users/characters | Service call → atomic `$inc` → change stream | No direct PubSub publish; emission via change stream |
| travel ↔ roads | Direct service call (`getShortestPath`) at startTravel | Reuses existing graphology graph for ETA |
| travel/combat ↔ Bull | Queue producer (service) / consumer (processor) | Jobs must be idempotent + guarded (teleport removes/overrides job) |
| services ↔ change stream | Indirect via committed writes | The one emission path; new code does NOT add parallel PubSub publishes for user-scoped state |

## Suggested Build Order (dependency-driven)

1. **Auth foundation** — JWT login, global `GqlAuthGuard`, `@CurrentUser/@Public/@Roles`, `onConnect` (connection_init contract), dev-mode stub. *Everything else assumes an identity; this also closes the two most critical CONCERNS and unblocks FE Phase 3/11.*
2. **Atomic-ops primitive + refactor unsafe writes** — `withTransaction` helper, convert `doTransaction`/`useSpell` to `$inc`/conditional updates. *Combat, travel, and points all build on this; doing it first prevents re-touching them later.*
3. **Subscription authorization** — re-filter `characterUpdated`/`userUpdated` by identity, add owner ref to payloads. *Depends on #1; small but security-critical.*
4. **Notifications (FCM) module + device-token registration** — shared dependency pulled forward so travel/combat/streamer can consume it. *Depends on #1 (token owned by authenticated user).*
5. **EventSub points sync** — REST controller (`@Public`) + `PointsService.credit` atomic. *Depends on #1 (public route) and #2 (atomic credit).*
6. **Travel lifecycle** — startTravel/complete/teleport + processor. *Depends on #2 (atomic teleport) + #4 (completion push) + existing roads.*
7. **Combat result** — `CombatResult` entity, subscription + push-ID + query. *Depends on #2, #3 (auth'd subscription), #4 (push).*
8. **Validation + hardening (cross-cutting)** — `ValidationPipe` global, introspection off in prod, error sanitization, CORS, admin audit log. *Can interleave; audit log pairs with #1 role guard (FE Phase 10 lockstep).*

> **Contract note for the roadmap:** the schema-only additions QUEST-04 (`activeStoryQuest`/`activeWorldMissionQuest`) and TRAVEL-01 (`status.activeTravel` shape) are FE-blocking contracts. Their *fields* can land on the model early (steps 1–2 window) to get onto staging, even if the *lifecycle logic* (travel completion) arrives at step 6.

## Sources

- [NestJS GraphQL Subscriptions (onConnect / graphql-ws)](https://docs.nestjs.com/graphql/subscriptions) — HIGH
- [nestjs/graphql #1756 — authenticating over WebSocket with graphql-ws](https://github.com/nestjs/graphql/issues/1756) — MEDIUM (documents the context-propagation nuance to pin with a test)
- [Apollo Server — Subscriptions & auth](https://www.apollographql.com/docs/apollo-server/data/subscriptions) — HIGH
- [MongoDB Change Streams (majority-committed emission)](https://www.mongodb.com/docs/manual/changestreams/) — HIGH
- [MongoDB Transactions](https://www.mongodb.com/docs/manual/core/transactions/) — HIGH
- [Mongoose Change Streams](https://mongoosejs.com/docs/change-streams.html) — HIGH
- [Twitch — Handling Webhook Events (HMAC verification, challenge)](https://dev.twitch.tv/docs/eventsub/handling-webhook-events) — HIGH
- [NestJS — Raw Body (webhook signature verification)](https://docs.nestjs.com/faq/raw-body) — HIGH
- Existing codebase: `src/app.module.ts`, `src/characters/characters.service.ts`, `.planning/codebase/ARCHITECTURE.md` — HIGH

---
*Architecture research for: NestJS GraphQL brownfield — auth, EventSub, FCM, travel/combat lifecycle, data integrity*
*Researched: 2026-07-16*
