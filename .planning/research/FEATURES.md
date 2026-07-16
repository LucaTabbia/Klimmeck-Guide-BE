# Feature Research

**Domain:** Game backend for a single-channel Twitch channel-points RPG (NestJS + MongoDB + GraphQL HTTP/WS), server-authoritative, mobile Flutter client. Milestone = v1.0 Core Loop hardening (auth/authz, Twitch EventSub sync, FCM push, FE contracts, data integrity, test foundation).
**Researched:** 2026-07-16
**Confidence:** HIGH

> Scope note: this is a **brownfield milestone** research, not a greenfield product survey. The gameplay domain (characters, quests, roads, spells, shops, POI) already exists. "Table stakes / differentiators / anti-features" are scoped to **this milestone's feature set** — i.e. what a game backend of this kind must have to be secure and its economy trustworthy, versus what is a nice-to-have now, versus what should be deliberately deferred.

---

## Feature Landscape

### Table Stakes (Must Have — Absence = Broken Economy or Security Hole)

Without these, the game state is untrusted (any client mutates any character), the economy drifts, or the FE phases stay blocked. These map 1:1 to the Active requirements and the CRITICAL/HIGH concerns.

| Feature | Why Expected (table stakes rationale) | Complexity | Notes |
|---------|---------------------------------------|------------|-------|
| **Session JWT auth** (`twitchToken → BE JWT` at login, one-time Twitch validation) | Zero auth today = complete data-integrity compromise (Concern #1). Standard for mobile game backends: exchange the identity-provider token once for a short-lived first-party session token; never validate the IdP token per request (Twitch rate limit is a hard constraint). | MEDIUM | JWT claims: `userId`, `twitchId`, `role`. Short access-token TTL (15–60 min). Passport JWT strategy + global `APP_GUARD`. Access token in `Authorization: Bearer`. |
| **Dev-mode auth compatible with FE stub** | FE phases 2–10 develop against static `DEV_AUTH_ACCESS_TOKEN`. If BE auth lands without a dev bypass, it breaks in-progress FE work. | LOW | Guard branch: when `NODE_ENV!=production` and token == `DEV_AUTH_ACCESS_TOKEN`, inject a configured stub identity. Must never activate in prod (fail closed). |
| **`connection_init` WS auth contract** | Subscriptions are wide open today (Concern #2) — any client subscribes to any character's `coins`. `graphql-ws` auth happens at connection handshake, not per-operation. Table stakes for a real-time app with private per-user streams. | MEDIUM | Validate JWT in `graphql-ws` `onConnect(ctx.connectionParams.authToken)`; reject handshake on failure; stash identity in subscription context for the ownership filter. Closes FE Phase 11 Open Question #1. |
| **Ownership authorization** (owner-only mutation, owner-only subscription) | A player must not mutate or subscribe to another player's character. Core Value = "no client can alter state it doesn't own." | MEDIUM | Compare JWT `userId`/`characterId` against the target resource in a guard/interceptor. Applies to both mutations and the `characterUpdated` subscription filter. |
| **Role guard `@Roles(innkeeper)`** | `RoleType` enum exists but is never enforced (Concern #4). Admin/game-master operations (create quest, spawn combat, grant rewards) must be gated. Single-channel = exactly one innkeeper. | LOW | `@Roles()` decorator + `RolesGuard` reading JWT claim. Only two effective roles (player/innkeeper) — keep it simple, do NOT build a permission matrix. |
| **Atomic economy operations** | Two CRITICAL concurrency bugs today (`useSpell` #5, `doTransaction` #6, equip #7). A game economy where coins/points can drift, duplicate, or go negative under concurrency is fundamentally broken. Verified industry pattern: single-document conditional updates or Mongo transactions. | HIGH | Prefer **conditional single-document updates** (`updateOne({_id, 'coins.gold': {$gte: cost}}, {$inc: {...}})`) for balance debits — atomic at the server, no read-modify-write window, no retry loop. Use **Mongo transactions (sessions)** only for genuinely multi-document/multi-field operations (coins + items + quest state together). Optimistic concurrency (`optimisticConcurrency: true` + `versionKey`) as the fallback for complex in-place array mutations (equip/spell slots). |
| **Fix `useSpell` order-of-operations bug** | Decrements `usages` and saves *before* validating the spell exists (Concern #5). Validate-then-mutate is non-negotiable. | LOW | Reorder + wrap in the atomic pattern above. This is a bug-fix that TDD should catch (Red test first). |
| **Input validation** (`class-validator` + global `ValidationPipe`) | Request models have zero validation (Concern #8): negative quantities, arbitrary coin amounts, unvalidated Mongo IDs all accepted. Table stakes for any economy-bearing API. | LOW | Add `class-validator`/`class-transformer`; decorate all `@InputType` request models (`@Min(0)`, `@IsMongoId()`, `@IsNotEmpty()`); register global `ValidationPipe({whitelist:true, forbidNonWhitelisted:true})`. |
| **GraphQL hardening** (introspection off in prod, error sanitization, explicit CORS) | Introspection + verbose errors let an unauthenticated attacker map the whole API and enumerate valid IDs (Concerns #3, #13, #15). | LOW | `introspection: NODE_ENV!=='production'`; global exception filter that logs detail server-side and returns generic messages (403 on authz fail, not 404); explicit `app.enableCors({origin: FRONTEND_URL, credentials:true})`. |
| **Twitch EventSub points sync** (webhook for `channel.channel_points_custom_reward_redemption.add`) | Twitch API does not expose viewer point balances; custom-reward redemptions are the only signal. EventSub is real-time and rate-limit-free. Table stakes for the channel-points economy. | HIGH | Public HTTPS endpoint. **Mandatory**: HMAC-SHA256 signature verification over `message_id + message_timestamp + raw_body`, time-safe compare, 4XX on mismatch. Handle `webhook_callback_verification` challenge. Credit `twitchPoints` 1:1 inside the atomic economy path. |
| **EventSub idempotency + replay protection** | Twitch delivers **at-least-once** — the same `message_id` can arrive twice. Without dedup, players get double credit. This is inseparable from the sync feature itself, not optional. | MEDIUM | Persist processed `message_id`s (unique index / dedup collection with TTL); skip already-seen IDs. Reject `message_timestamp` older than 10 minutes (replay window). |
| **QUEST-04 fields** (`activeStoryQuest` / `activeWorldMissionQuest` on Character, in schema + subscription) | Hard blocker for FE Phase 6. Contract addition. | LOW | Additive schema change; must land on staging before FE Phase 6. |
| **TRAVEL-01 server-authoritative travel lifecycle** (`status.activeTravel { road, startTime, endTime, duration }`) | Hard blocker for FE Phase 7. BE is source of truth for ETA/completion. | MEDIUM | **Lazy evaluation on read** (compute completion from `endTime` at query time) is the table-stakes correctness guarantee — travel resolves correctly even if a timer fails or the server restarts. Atomic clear of `activeTravel` on teleport. (Precise timed push at `endTime` is the differentiator below.) |
| **FCM device-token registration + send** | Blocks FE Phase 5. Table stakes for a mobile game (travel-end, streamer-live, quest-end, combat notifications). | MEDIUM | Per-device token registration (a user has N devices), token storage on user, `firebase-admin` send. Handle stale/unregistered tokens (prune on `messaging/registration-token-not-registered`). |
| **Combat result hybrid delivery** (persisted `CombatResult` entity + full payload on subscription + ID on FCM push + `combatResult(id)` query) | COMBAT-01..07 FE contract. Foreground gets the full event; background gets an ID via push and requeries. Persistence enables the requery and offline queueing. | MEDIUM | Persist first, then emit. Owner-scoped query + subscription. |
| **Test foundation** (`mongodb-memory-server` replica set + `ioredis-mock`, fixtures/factories) | Concurrency bugs #5–7 are exactly the class of bug only tests catch; TDD is a hard project constraint (Red→Green→Refactor). Replica set is required for change streams + transactions used above. | MEDIUM | No Docker locally/CI. Factories for Character/User/Spell. Coverage focused on economy atomicity, auth guards, EventSub idempotency, travel lifecycle. |

### Differentiators (Valuable This Milestone, Not Strictly Required to Ship)

Robustness and operational-safety features common in mature game backends. Each hardens a table-stakes feature; none blocks an FE phase.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Immutable admin audit log** (who / what / when, append-only) | Game-master actions (grant coins, spawn combat, edit quests) are high-trust. An append-only who/what/when trail is the table-stakes *shape* of audit, but immutability + rich diffs is the differentiator. FE Phase 10 wants this in lockstep. | MEDIUM | Append-only collection, no update/delete path exposed; store actor, action, target, before/after, timestamp. Start minimal (who/what/when); diffs are a stretch. |
| **JWT refresh + revocation on Twitch grant revoke** | Short access tokens need a refresh path for good mobile UX; and when a user revokes the Twitch grant (EventSub `user.authorization.revoke` / `drop`), the BE session should be invalidated. | MEDIUM | Refresh-token rotation (store hashed refresh token / jti; deny-list on revoke). Subscribe to `user.authorization.revoke`. Without this, a revoked Twitch grant still yields a valid BE session until access-token expiry — acceptable short-term given short TTL, hence differentiator not table stakes. |
| **EventSub reconciliation sweep** | At-least-once delivery can still *miss* events during downtime. A periodic `Get Custom Reward Redemption` API sweep reconciles the ledger against Twitch. | MEDIUM | Scheduled job; compare processed `message_id`/redemption IDs against Twitch's list; backfill gaps idempotently. Requires storing app access token. |
| **Redemption refund/reject flow** | When a redemption can't be honored (invalid state), updating the redemption status to `CANCELED` via the API auto-refunds the viewer's points and keeps Twitch's ledger and the game consistent. | MEDIUM | `Update Redemption Status` API on the failure branch of the credit path. |
| **Scheduled travel-completion job (Bull) driving push + subscription** | Lazy eval gives correct *reads*, but the travel-end **FCM push** needs a trigger at `endTime`. A Bull delayed job fires the push + emits the subscription at the right moment; lazy eval remains the correctness backstop if the job fails. | MEDIUM | Reuses the Bull+Redis infra already in the tree for spell recovery. Hybrid (scheduled push + lazy read) is the robust pattern. |
| **Client-supplied idempotency keys on economy mutations** | Mobile networks retry. An idempotency key on `doTransaction`-style mutations makes retries safe (no double-spend / double-grant). | MEDIUM | Store key→result; return cached result on replay. Elevates from differentiator toward table-stakes if the FE retries mutations aggressively. |
| **Dead-letter queue + monitoring for Bull jobs** (spell recovery, travel, FCM) | Concern #18: failed recovery jobs silently lose usages; failed pushes vanish. A DLQ + logging gives operational visibility. | LOW–MEDIUM | Idempotent job IDs, retry policy, DLQ, structured logging on job lifecycle. |
| **Combat event queueing for offline players** (COMBAT-07) | Persisted `CombatResult` lets a player who was offline during combat replay/requery the outcome on reconnect. | LOW | Falls out of the persisted-entity design almost for free; flagging the queue-on-reconnect UX as the differentiator. |

### Anti-Features (Do NOT Build This Milestone)

Things that look reasonable but add cost/complexity out of proportion to v1.0 value, or contradict explicit project scope.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Multi-channel Twitch support** | "What if more streamers join?" | Product is single-channel *by design* (PROJECT.md). Multi-tenancy touches auth, EventSub subscription management, economy isolation — a different product. | One channel, one `innkeeper`. Revisit as a v2 product decision, not a code accommodation now. |
| **Horizontal scaling / Redis PubSub adapter** | "What if we need multiple instances?" | Change streams + in-memory PubSub are single-instance; a Redis pub/sub adapter adds infra and delivery-semantics complexity. One instance is sufficient for a single channel (Concern #16, PROJECT out-of-scope). | Single instance for v1.0. Re-evaluate only if deployment goes multi-instance. Keep PubSub abstraction clean so the swap stays cheap. |
| **Per-request Twitch token validation** | "Always know the token is still valid." | Twitch rate limit is a declared constraint; validating per request is fragile and slow. This is *why* the session-JWT decision exists. | Validate Twitch once at login; trust the first-party JWT thereafter; handle revocation via the EventSub revoke event (differentiator above). |
| **Full OAuth authorization-code server flow with long-term Twitch token storage** | "Proper OAuth." | For user *identity* you only need one validation at login. Storing/refreshing user access tokens long-term is only needed for calling Twitch *on the user's behalf* — which this milestone doesn't do (redemptions come via EventSub webhook, not user API calls). | Session JWT for identity. Store only an **app** access token for the EventSub subscription mgmt + reconciliation/refund APIs — not per-user tokens. |
| **Generic RBAC / permission matrix** | "Flexible roles." | Only two effective roles (player, innkeeper) on a single channel. A permission engine is over-engineering. | Simple `@Roles(innkeeper)` guard + ownership check. |
| **Polling Twitch for point balances** | "Just poll the API." | Twitch exposes no viewer balance endpoint, and polling burns rate limit. | EventSub redemption webhook (the only real signal). |
| **Event sourcing / full game-state audit** | "Perfect auditability." | Full event-sourcing the economy is a large architectural bet; unjustified for v1.0 and slows every feature. | Atomic writes + append-only *admin* audit log + EventSub ledger dedup covers the real integrity needs. |
| **"Real-time everything" via subscriptions** | "Push all the things." | Every field on a live subscription multiplies change-stream traffic and coupling. | Subscriptions only for what the FE must react to live (character updates, combat result); everything else stays query/mutation. |
| **GraphQL federation / schema stitching** | "Future microservices." | Modular monolith is the chosen architecture; federation is premature. | Keep the code-first modular monolith. |
| **Storing/rendering Twitch chat, bits, subs** | "It's a Twitch app." | Out of milestone scope; only channel points drive the economy. | Channel-points redemptions only. |

---

## Feature Dependencies

```
Session JWT auth
    ├──requires──> (nothing new; Passport JWT + config)
    ├──enables──> connection_init WS auth ──enables──> Ownership subscription filter
    ├──enables──> Ownership authorization (mutations)
    └──enables──> Role guard @Roles(innkeeper) ──enables──> Admin audit log

Test foundation (mongodb-memory-server REPLICA SET + ioredis-mock)
    └──enables──> Atomic economy ops (transactions need replica set to TEST)
    └──enables──> TDD Red→Green for every feature below (project constraint)

Atomic economy operations
    ├──requires──> Mongo replica set (transactions) OR conditional single-doc updates
    ├──fixes──> useSpell bug, doTransaction, equip race
    └──underlies──> Twitch points credit, redemption refund, idempotency keys

Twitch EventSub points sync
    ├──requires──> HMAC verification + idempotency (inseparable)
    ├──requires──> Atomic economy ops (credit path)
    ├──enhanced-by──> Reconciliation sweep, Refund/reject flow (need stored APP token)
    └──enhanced-by──> Idempotency keys

TRAVEL-01 lifecycle (lazy eval)
    └──enhanced-by──> Scheduled Bull completion job ──enables──> travel-end FCM push

Combat result entity (persisted)
    ├──requires──> FCM push (background ID delivery)
    ├──requires──> Ownership authz (owner-only query/subscription)
    └──enables──> Combat event queueing (offline replay)

FCM device-token registration
    └──enables──> travel-end / streamer-live / quest-end / combat pushes
```

### Dependency Notes

- **Everything authz depends on Session JWT.** JWT must land first (or alongside the dev stub) because ownership, role guard, and `connection_init` all read its claims. This is the natural first phase.
- **Test foundation gates atomicity.** Mongo transactions and change streams only work against a **replica set** — so `mongodb-memory-server` must be configured as a replica set before the atomicity fixes can be test-driven. Given the TDD constraint, the test foundation is effectively a prerequisite for the data-integrity phase.
- **EventSub sync is a bundle, not a feature.** HMAC verification + `message_id` dedup + timestamp replay window + atomic credit all ship together — shipping the webhook without dedup means double-credited players.
- **Travel push needs a timer even though reads are lazy.** Lazy evaluation resolves state correctly on read, but there is no read at `endTime` when the app is backgrounded — hence a scheduled job is required *for the notification*, not for correctness.
- **Combat persistence is the linchpin** of the hybrid delivery: subscription payload, push-ID requery, and offline queueing all derive from one persisted entity.
- **Refund/reconciliation need an app access token**, not user tokens — a small but real dependency that distinguishes them from the identity-only login flow.

---

## MVP Definition (This Milestone)

### Launch With (v1.0 Core Loop BE) — the Table Stakes

Ship order roughly follows dependencies. All are required to unblock FE and make the economy trustworthy.

- [ ] Test foundation (replica-set memory server + ioredis-mock + factories) — prerequisite for TDD + atomicity
- [ ] Session JWT auth + dev-mode stub — gates all authz; unblocks nothing breaks in FE
- [ ] `connection_init` WS auth — unblocks FE Phase 3
- [ ] Ownership authorization (mutations + subscription filter)
- [ ] Role guard `@Roles(innkeeper)`
- [ ] Atomic economy operations + `useSpell`/`doTransaction`/equip fixes
- [ ] Input validation + GraphQL hardening (introspection/errors/CORS)
- [ ] Twitch EventSub sync **with** HMAC + idempotency + replay window
- [ ] QUEST-04 fields — unblocks FE Phase 6
- [ ] TRAVEL-01 lazy-eval lifecycle — unblocks FE Phase 7
- [ ] FCM device-token registration + send — unblocks FE Phase 5
- [ ] Combat result hybrid delivery (persist + subscription + push ID + query)

### Add After Core Lands (still this milestone if time allows)

- [ ] Immutable admin audit log — trigger: FE Phase 10 lockstep
- [ ] Scheduled travel-completion job driving travel-end push — trigger: precise notifications wanted
- [ ] Dead-letter queue + job monitoring — trigger: first silent job failure observed
- [ ] Redemption refund/reject flow — trigger: first un-honorable redemption case

### Future Consideration (v2+ / explicitly deferred)

- [ ] JWT refresh rotation + Twitch-revoke handling — defer: short access-token TTL bounds the risk
- [ ] EventSub reconciliation sweep — defer: dedup + at-least-once covers the common case; add if drift observed
- [ ] Client idempotency keys on mutations — defer: add if FE retry behavior causes double-writes
- [ ] Guilds, arena, alignment, LLM quests — defer: PROJECT out-of-scope (v2)
- [ ] Multi-channel, horizontal scaling — anti-features by design

---

## Feature Prioritization Matrix

| Feature | User/Business Value | Implementation Cost | Priority |
|---------|---------------------|---------------------|----------|
| Session JWT auth + dev stub | HIGH | MEDIUM | P1 |
| `connection_init` WS auth | HIGH | MEDIUM | P1 |
| Ownership authorization | HIGH | MEDIUM | P1 |
| Role guard `@Roles(innkeeper)` | HIGH | LOW | P1 |
| Atomic economy ops + concurrency fixes | HIGH | HIGH | P1 |
| Input validation + GraphQL hardening | HIGH | LOW | P1 |
| EventSub sync + HMAC + idempotency | HIGH | HIGH | P1 |
| QUEST-04 fields | HIGH (unblocks FE) | LOW | P1 |
| TRAVEL-01 lazy lifecycle | HIGH (unblocks FE) | MEDIUM | P1 |
| FCM registration + send | HIGH (unblocks FE) | MEDIUM | P1 |
| Combat result hybrid delivery | HIGH | MEDIUM | P1 |
| Test foundation | HIGH (enables all) | MEDIUM | P1 |
| Immutable admin audit log | MEDIUM | MEDIUM | P2 |
| Scheduled travel-completion push job | MEDIUM | MEDIUM | P2 |
| DLQ + job monitoring | MEDIUM | LOW–MEDIUM | P2 |
| Redemption refund/reject flow | MEDIUM | MEDIUM | P2 |
| JWT refresh + revoke handling | MEDIUM | MEDIUM | P3 |
| EventSub reconciliation sweep | MEDIUM | MEDIUM | P3 |
| Client idempotency keys | LOW–MEDIUM | MEDIUM | P3 |

**Priority key:** P1 = must have for milestone / unblocks FE. P2 = should have, add when core lands. P3 = defer unless a trigger fires.

---

## Comparable-System Feature Analysis

How comparable systems handle the milestone's harder questions, and the recommended approach here.

| Concern | Common Pattern A | Common Pattern B | Recommended Here |
|---------|------------------|------------------|------------------|
| Mobile session auth vs IdP token | Per-request IdP token as Bearer | One-time IdP exchange → first-party short-lived JWT (+ refresh) | **Pattern B** — mandated by Twitch rate-limit constraint; refresh/revoke deferred to P3 given short TTL |
| Webhook economy sync | At-least-once + consumer dedup by event ID | Exactly-once broker | **Pattern A** — Twitch is at-least-once; dedup `message_id` + 10-min replay window (verified in Twitch docs) |
| Atomic balance mutation | Read-modify-write in a transaction | Conditional single-doc update (`$inc` with `$gte` guard) | **Pattern B for single-doc balances** (no retry loop, atomic); transactions only for multi-doc; OCC `versionKey` for array-slot mutations |
| Timed world state (travel) | Scheduled job flips state at `endTime` | Lazy computation from `endTime` on read | **Both** — lazy read for correctness, scheduled job for the push notification |
| Combat delivery to mobile | Subscription only | Persist + subscription + push-ID + requery | **Persist + hybrid** — survives backgrounding/offline, enables queueing (COMBAT-07) |
| Admin accountability | Mutable log table | Append-only immutable audit trail | **Append-only** who/what/when; immutability is the point of an audit log |

---

## Sources

**Twitch EventSub (channel points, idempotency, HMAC, replay)** — HIGH confidence (official docs + corroborating community):
- [Handling Webhook Events | Twitch Developers](https://dev.twitch.tv/docs/eventsub/handling-webhook-events) — at-least-once delivery, `message_id` dedup, HMAC-SHA256 over id+timestamp+body, 10-minute replay window, time-safe compare
- [EventSub Subscription Types | Twitch Developers](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/) — `channel.channel_points_custom_reward_redemption.add`
- [EventSub | Twitch Developers](https://dev.twitch.tv/docs/eventsub/)
- [Webhooks: how long to retain event ids to prevent duplicates — Twitch Dev Forums](https://discuss.dev.twitch.com/t/webhooks-how-long-should-we-retain-events-ids-to-prevent-duplicates/39698)
- [Webhook Idempotency and Deduplication — Hooklistener](https://www.hooklistener.com/learn/webhook-idempotency-and-deduplication) (general corroboration, MEDIUM)

**MongoDB / Mongoose atomicity & optimistic concurrency** — HIGH confidence:
- [What's New in Mongoose 5.10: Optimistic Concurrency — thecodebarbarian](https://thecodebarbarian.com/whats-new-in-mongoose-5-10-optimistic-concurrency.html) — `optimisticConcurrency` + `versionKey`
- [How to Implement Optimistic Concurrency Control in MongoDB — OneUptime](https://oneuptime.com/blog/post/2026-03-31-mongodb-how-to-implement-optimistic-concurrency-control-in-mongodb/view) — OCC vs transactions decision guidance
- [Document-Level Optimistic Concurrency in MongoDB — Jimmy Bogard](https://www.jimmybogard.com/document-level-optimistic-concurrency-in-mongodb/)

**Codebase context** — HIGH confidence (direct inspection):
- `.planning/PROJECT.md` (Active requirements, Key Decisions, constraints)
- `.planning/codebase/ARCHITECTURE.md` (existing GraphQL/change-stream/Bull architecture)
- `.planning/codebase/CONCERNS.md` (18 verified issues driving the table-stakes list)

---
*Feature research for: single-channel Twitch channel-points RPG backend — v1.0 Core Loop milestone*
*Researched: 2026-07-16*
