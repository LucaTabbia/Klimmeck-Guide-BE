# Pitfalls Research

**Domain:** Retrofitting auth + Twitch EventSub + FCM + data atomicity onto an existing NestJS 11 / Apollo GraphQL (code-first, HTTP+WS) / Mongoose 8 / Bull v4 backend
**Researched:** 2026-07-16
**Confidence:** HIGH (Twitch, FCM, Mongoose facts verified against official docs; NestJS/graphql-ws behavior verified against training + framework docs)

> **Scope note:** `.planning/codebase/CONCERNS.md` already catalogs the 18 baseline issues (auth absent, subscriptions open, introspection on, non-atomic `useSpell`/`doTransaction`/equip, no validation, no tests, WIP spell recovery, etc.). This file does **not** repeat those. It documents the *implementation traps* that appear **while closing those gaps** — the subtle, capability-specific mistakes that turn a "done" feature into a production incident. Where a baseline concern exists, I extend it with the concrete failure mode of the fix.

---

## Critical Pitfalls

### Pitfall 1: `connection_init` token validated once, never re-checked on a long-lived WS connection

**What goes wrong:**
The JWT is validated only in the graphql-ws `onConnect` handshake. A WebSocket then stays open for hours. When the JWT expires (or the user is banned / role revoked), the socket keeps streaming `characterUpdated` and any other subscription indefinitely. Auth becomes "valid at connect time, forever after."

**Why it happens:**
graphql-ws authenticates the *connection*, not each *operation*. Developers naturally put the check in `onConnect` and assume HTTP-style per-request expiry semantics carry over. They don't — there is no per-message re-authentication unless you build it.

**How to avoid:**
- In `onConnect`, verify the JWT and stash `{ userId, twitchId, role, exp }` on the connection context (the `extra`/`context` object).
- Enforce expiry on **every** `subscribe`: a subscription-scoped guard (or the `context`/`onSubscribe` hook) must re-check `exp` against `Date.now()` and reject if expired.
- Cap connection lifetime: set a server-side max socket age or a periodic sweep that closes sockets whose token `exp` has passed (graphql-ws `onConnect` can return a timeout, or run an interval that calls `ctx.extra.socket.close(4401)`).
- Define the `connection_init` contract explicitly (this also closes FE Phase 11 Open Question #1): `{ Authorization: "Bearer <jwt>" }` in `connectionParams`, close code `4401` on auth failure.

**Warning signs:**
Subscription still delivers data after a token TTL has elapsed in a manual test; no code path reads `exp` after `onConnect`; a banned user still receives updates.

**Phase to address:** Auth foundation (WS auth / connection_init contract)

---

### Pitfall 2: NestJS guards silently don't run (or crash) on GraphQL subscriptions

**What goes wrong:**
`@UseGuards(GqlAuthGuard)` on a `@Subscription()` resolver either does nothing useful or throws, because the guard's `getRequest()` was written for HTTP/GraphQL-query context. For WS subscriptions the "request" is the graphql-ws context (`ctx.connectionParams` / `extra`), **not** an Express `req`. A guard doing `ctx.getContext().req.headers` gets `undefined` and either no-ops or NPEs.

**Why it happens:**
`GqlExecutionContext.create(context).getContext()` returns different shapes for HTTP operations vs WS subscriptions. Tutorials show the HTTP shape. NestJS also runs guards at **subscribe** time, not per emitted event — another mismatch with mental models.

**How to avoid:**
- Write one guard that branches on transport: try `gqlCtx.getContext().req` (HTTP); fall back to the WS context (`gqlCtx.getContext().connectionParams` or the value you set in `onConnect`).
- Put the authenticated identity in a single place in `onConnect` so the guard reads it uniformly regardless of transport.
- Add an integration test that actually opens a `graphql-ws` client and asserts an unauthenticated `subscribe` is rejected — unit-mocking the context hides this bug.

**Warning signs:**
Guard passes in HTTP tests but an unauthenticated `graphql-ws` client can still subscribe; `Cannot read properties of undefined (reading 'headers')` in subscription path.

**Phase to address:** Auth foundation (WS auth), with a real `graphql-ws` integration test in the Test foundation phase.

---

### Pitfall 3: Subscription ownership filter is missing — auth ≠ authorization on `characterUpdated`

**What goes wrong:**
You add auth to the WS connection (attacker must now log in), but the `characterUpdated(id)` subscription still emits *any* character by id. An authenticated attacker subscribes to the streamer's / another player's character id and watches their coins/HP in real time. Authenticating the connection did nothing for authorization.

**Why it happens:**
The existing subscription filters by the requested `id` (from the change stream → PubSub), not by the authenticated owner. Adding a connection guard feels like "subscriptions are now secure," masking that per-payload ownership is still unchecked. CONCERNS #2 flags "subscriptions without auth" but the *ownership* dimension is the subtle half.

**How to avoid:**
- In the subscription `filter`, compare the payload's character `userId` against the authenticated `userId` from context — not just the requested id.
- Innkeeper role may subscribe to any character (game-master); enforce that via role claim, not by trusting the client-supplied id.

**Warning signs:**
An authenticated user can subscribe with someone else's character id and receive events; the `filter` function references only `variables.id`.

**Phase to address:** Authorization / ownership (in lockstep with WS auth).

---

### Pitfall 4: Dev-auth bypass (`DEV_AUTH_ACCESS_TOKEN`) leaks to production

**What goes wrong:**
The dev-mode guard that accepts the static stub identity (needed so FE phases 2–10 keep working) is gated on a flag that is wrong-by-default: `NODE_ENV !== 'production'`, or `if (process.env.DEV_AUTH_ACCESS_TOKEN)`. In prod, `NODE_ENV` is unset (evaluates truthy for "not production") or the env var is present on the server, and the static god-token authenticates anyone as the stub user.

**Why it happens:**
The bypass is a deliberate backdoor for FE velocity. Fail-open defaults (`NODE_ENV` undefined ⇒ "dev") and "present means enabled" checks are the classic ways it escapes. It's a `bushido` violation hiding as convenience.

**How to avoid:**
- Fail-closed: require an explicit `AUTH_MODE=dev` **and** assert `NODE_ENV !== 'production'` together; if `NODE_ENV === 'production'`, ignore `DEV_AUTH_ACCESS_TOKEN` entirely and log a loud warning if it's set.
- Never let "env var exists" mean "enabled." Require an explicit boolean.
- Add a startup assertion + a test: production config with the dev token set must still reject the stub token.
- Put the bypass behind a single injectable strategy so it's greppable and removable before GA.

**Warning signs:**
Stub token authenticates against staging/prod; no explicit `AUTH_MODE`; auth logic branches on `NODE_ENV` with no `=== 'production'` guard.

**Phase to address:** Auth foundation (dev-mode strategy), verified in hardening.

---

### Pitfall 5: Retrofit breaks live FE clients — auth turned on before contracts land on staging

**What goes wrong:**
The global guard is enabled and every existing FE call (phases already shipped) starts returning 401/Forbidden simultaneously. Because the API was previously fully open, there is no gradual rollout; the "big bang" flips the whole surface at once and breaks in-flight FE development.

**Why it happens:**
Adding a `APP_GUARD` global guard is one line and applies everywhere instantly. There's no per-resolver migration, so the change is all-or-nothing. Compounded by the JWT decision changing the FE's assumption (FE Phase 11 expected raw Twitch token as Bearer; now it's an exchanged BE JWT).

**How to avoid:**
- Land the dev-mode bypass **first** so the FE stub keeps working, then enable the global guard — the bypass is the migration ramp.
- Ship schema/contract additions (login mutation returning JWT, `connection_init` contract) to **staging before** the FE phase that consumes them (per PROJECT constraint), and record the JWT decision in the FE `BACKEND-NOTES.md` handoff.
- Use `@Public()` decorator + `Reflector` so a global guard can whitelist truly-public operations (login, EventSub webhook, health) explicitly rather than leaving them open by omission.

**Warning signs:**
FE integration on staging breaks the moment the guard PR merges; no `@Public()` mechanism; FE handoff note for the JWT-vs-Twitch-token change doesn't exist.

**Phase to address:** Auth foundation (rollout sequencing) + FE handoff.

---

### Pitfall 6: Auth applied to GraphQL only — REST Cloudinary controller stays wide open

**What goes wrong:**
The global guard is registered via `APP_GUARD` and everyone assumes "the API is protected." But the Cloudinary upload controller is a REST endpoint (`src/rest/cloudinary`), and if the guard is a GraphQL-context guard (or scoped to the GraphQL module), REST routes bypass it. Unauthenticated image uploads → storage abuse / cost / content-injection.

**Why it happens:**
Mixed transport (GraphQL + REST) in one Nest app. A `GqlAuthGuard` that calls `GqlExecutionContext` returns a null request for HTTP-REST contexts and can accidentally allow. The empty `auth.controller.ts` (CONCERNS #11) reinforces the false belief that auth is "somewhere."

**How to avoid:**
- Make the auth guard transport-aware (HTTP REST, GraphQL HTTP, GraphQL WS) or register separate guards; explicitly cover the Cloudinary route.
- Enumerate every entrypoint (GraphQL queries/mutations/subscriptions, Cloudinary REST, future EventSub webhook, health) and assert each is either guarded or explicitly `@Public()`.
- Add a test hitting the Cloudinary endpoint without a token and asserting 401.

**Warning signs:**
`curl -F file=@x.png` to the upload route succeeds without a token; guard only ever tested through GraphQL.

**Phase to address:** Auth foundation (coverage audit) + hardening.

---

### Pitfall 7: EventSub signature verification fails or is bypassable (raw body + concat order + timing-safe compare)

**What goes wrong:**
HMAC verification of the Twitch webhook is wrong in one of three classic ways: (a) the JSON body-parser already consumed/re-serialized the body, so you HMAC a re-stringified object that differs byte-for-byte from what Twitch signed; (b) the concatenation order is wrong — it must be `messageId + timestamp + rawBody`; (c) comparison uses `===` instead of a constant-time compare, or verification is skipped entirely, letting anyone POST fake redemptions to credit `twitchPoints`.

**Why it happens:**
NestJS/Express globally parse JSON, destroying the raw bytes needed for HMAC. Twitch's signature is over the exact raw payload. Developers reconstruct the body from the parsed object and get a different hash.

**How to avoid:**
- Capture the **raw body** for the EventSub route only (e.g. `express.raw({ type: 'application/json' })` on that path, or `rawBody: true` in Nest bootstrap) and HMAC over those exact bytes.
- Signature = `HMAC_SHA256(secret, messageId + timestamp + rawBody)`, hex, compared to the `sha256=` value in `Twitch-Eventsub-Message-Signature` using `crypto.timingSafeEqual`.
- Reject if the header is missing, the secret is unset, or comparison fails — fail closed.
- Secret is 10–100 ASCII chars, cryptographically random, stored in `.env` (never in repo).

**Warning signs:**
Signature always mismatches in local testing (usually the raw-body issue); verification wrapped in try/catch that swallows and proceeds; a hand-crafted POST credits points.

**Phase to address:** Twitch EventSub (webhook receiver).

---

### Pitfall 8: EventSub challenge handshake mishandled — subscription never activates

**What goes wrong:**
On subscription creation Twitch sends a `webhook_callback_verification` request; you must echo the `challenge` value back as **raw text/plain with HTTP 200 and correct Content-Length**. If you return JSON, wrap it, add quotes, redirect, respond slowly (>10s), or your endpoint isn't reachable over public HTTPS, Twitch marks the subscription `webhook_callback_verification_failed` and no events ever arrive.

**Why it happens:**
The verification request looks like a normal notification but has a different `Twitch-Eventsub-Message-Type` header and must be answered differently. Global response interceptors / serializers wrap the body and break the raw echo.

**How to avoid:**
- Branch on `Twitch-Eventsub-Message-Type`: `webhook_callback_verification` → `res.status(200).send(body.challenge)` as plain text; `notification` → process; `revocation` → handle (see next).
- Verify the signature **before** answering the challenge too.
- Keep the handler fast (respond 200 immediately, process async) — Twitch expects a quick 2xx.

**Warning signs:**
Subscription status stuck at `webhook_callback_verification_pending`/`_failed` in the Twitch dashboard; challenge response has JSON content-type.

**Phase to address:** Twitch EventSub (webhook receiver).

---

### Pitfall 9: EventSub duplicate/replayed notifications double-credit points (no idempotency)

**What goes wrong:**
Twitch guarantees **at-least-once** delivery — the same redemption notification can arrive more than once. Without dedup, each retry credits `twitchPoints` again, inflating balances. Old captured payloads can also be replayed if you don't enforce the timestamp window.

**Why it happens:**
Devs assume webhooks fire exactly once. The `.planning` note "duplicate/replayed notifications (idempotency)" is exactly this. Idempotency is the **receiver's** responsibility — Twitch does not dedupe for you.

**How to avoid:**
- Persist processed `Twitch-Eventsub-Message-Id`s (unique index) and no-op on repeats; or make the credit itself idempotent keyed by the redemption id.
- Reject notifications whose `Twitch-Eventsub-Message-Timestamp` is older than 10 minutes (replay protection).
- Do the credit inside a Mongo transaction together with the dedup-record insert so "recorded as processed" and "points credited" are atomic (ties into Pitfall 12).

**Warning signs:**
Balances drift upward after Twitch retries; no unique index on message id; no timestamp-age check.

**Phase to address:** Twitch EventSub (idempotency) — depends on the Atomicity phase for transactional credit.

---

### Pitfall 10: EventSub subscription expiry / revocation not handled — sync silently dies

**What goes wrong:**
Webhook subscriptions get **revoked** by Twitch (user deauthorized the app, repeated 4xx/5xx from your endpoint, or app-secret change) or expire. If you don't handle the `revocation` message and re-subscribe, channel-point sync just stops — silently — and nobody notices until players report missing points.

**Why it happens:**
"It worked when I set it up once" — subscriptions are treated as permanent. Revocation arrives as a distinct message type that's easy to ignore; there's no runtime error, just absence of events.

**How to avoid:**
- Handle `Twitch-Eventsub-Message-Type: revocation`: log the `status` reason, alert, and re-create the subscription.
- On startup, reconcile: list existing subscriptions via the API and (re)create the channel-points-redemption subscription if missing/`disabled`.
- Remember webhooks require an **app access token** (client-credentials), not a user token — a user-token subscribe request fails outright.
- Track subscription health (last-event timestamp) and alarm on silence.

**Warning signs:**
Points stop syncing with no errors; Twitch dashboard shows subscription `revoked`/`authorization_revoked`; no reconcile-on-boot.

**Phase to address:** Twitch EventSub (lifecycle management).

---

### Pitfall 11: Mongoose "atomic" fix that still isn't — `findById` + mutate + `save()` and the `__v` gotcha

**What goes wrong:**
The fix for the non-atomic `useSpell`/`doTransaction`/equip (CONCERNS #5–7) is done by reordering validation but still uses `findById()` → mutate in memory → `save()`. That read-modify-write is **not** atomic across concurrent requests. Worse, developers reach for `versionKey`/optimistic concurrency and discover `__v` **only auto-increments when you modify an array** and only on `save()` — scalar changes (coins, usages) don't bump `__v`, and `findOneAndUpdate` never bumps it. So optimistic locking appears "on" but silently doesn't protect coin/point/usage fields.

**Why it happens:**
Mongoose's default versioning exists to protect array positional updates, not to provide general optimistic concurrency. This is counter-intuitive and widely misunderstood (verified: `__v` bumps only on array ops during `save()`).

**How to avoid:**
- Prefer **atomic operators** for counters/balances: `findOneAndUpdate({ _id, 'status.coins.gold': { $gte: cost } }, { $inc: { 'status.coins.gold': -cost } })` — the guard condition + `$inc` is a single atomic op; a `null` result means "insufficient / lost race," reject cleanly.
- For multi-field/multi-doc invariants (coins + item + points), use a **Mongo transaction** (session) — see Pitfall 12.
- If you want optimistic concurrency on `save()`, set `optimisticConcurrency: true` on the schema so Mongoose reloads and version-checks on save; do **not** rely on default `__v` behavior for scalar fields.
- Spell-usage recovery (Bull processor) must also `$inc` atomically, not `find`+`save` (current `spell-recovery.processor.ts` does `find`+`save`).

**Warning signs:**
Concurrency test with parallel `useSpell`/`doTransaction` produces wrong totals despite the fix; code sets `versionKey` but tests show no `VersionError`; balances can go negative.

**Phase to address:** Data integrity / atomicity (this is the core of the milestone).

---

### Pitfall 12: Mongo transactions require a replica set — code works in tests, throws in prod

**What goes wrong:**
You adopt `session.startTransaction()` for atomic multi-step operations. It passes CI (mongodb-memory-server in replica-set mode) but throws `Transaction numbers are only allowed on a replica set member or mongos` in any environment running a standalone `mongod`. The atomicity layer — the whole point of the milestone — is inert or crashing in that environment.

**Why it happens:**
MongoDB multi-document transactions and change streams both **require** a replica set. Local Docker/managed Atlas are usually RS, but a bare standalone `mongod` (some staging/self-hosted setups) is not. The change stream already in use (`characterModel.watch`) actually confirms the current deployment is RS — but a new transaction path must be verified against the *actual* prod topology.

**How to avoid:**
- Confirm every environment (dev/staging/prod) runs a replica set — the existing change stream requires it, so verify it's genuinely RS, not a fluke.
- Document the RS requirement in `.env.example`/README and add a boot-time check that transactions are supported.
- In tests, use mongodb-memory-server's replica-set mode (already the PROJECT decision) — but see Pitfall 17 for its CI gotchas.

**Warning signs:**
`Transaction numbers are only allowed on a replica set member or mongos`; transactions untested against prod-like topology; standalone `mongod` in any compose file.

**Phase to address:** Data integrity / atomicity + Test foundation.

---

### Pitfall 13: Bull delayed jobs as the source of truth for game timers (travel/spell) — lost on Redis flush, drift, and clock skew

**What goes wrong:**
Travel completion / spell recovery rely on a Bull **delayed** job firing at `endTime`. If Redis is flushed, evicted (maxmemory policy), or restarted without persistence, the delayed job vanishes and the travel/recovery **never completes** — the character is stuck traveling forever. Even without loss, using the job's fire-time as the truth introduces clock drift between Redis and app servers.

**Why it happens:**
Bull stores jobs in Redis; delayed jobs live only there. Redis configured with `maxmemory-policy allkeys-lru` (common default on managed Redis) can evict Bull keys. Treating "the job will fire" as a guarantee ignores infra reality.

**How to avoid:**
- **DB is the source of truth**, not the queue. Persist `status.activeTravel.endTime` (PROJECT already specifies `{ road, startTime, endTime, duration }`) and `spell recovery-at` timestamps in Mongo. The Bull job is only a *trigger* that reconciles state; if the job is lost, a boot-time sweep / periodic reconciler completes any travel whose `endTime < now`.
- Configure Redis with `maxmemory-policy noeviction` (or a dedicated Redis) so Bull keys aren't evicted; enable Redis persistence (AOF/RDB).
- Compute completion from stored `endTime` compared to server time, not from job latency.
- On boot, scan for overdue travels/recoveries and finalize them — self-healing.

**Warning signs:**
A character stuck "traveling" after a deploy/Redis restart; spell usages never recover after infra blip; completion logic reads job timing instead of stored `endTime`.

**Phase to address:** TRAVEL-01 lifecycle + Bull consolidation (spell recovery), with reconciler in the same phase.

---

### Pitfall 14: Zombie jobs — teleport/cancel leaves a pending completion job that fires on stale state

**What goes wrong:**
A travel is in progress with a pending Bull completion job. The player teleports (or the travel is cancelled, or the character is deleted). The old job later fires and "completes" a travel that no longer exists — moving the character back, granting arrival effects twice, or resurrecting cleared state. The PROJECT explicitly calls out "clear atomic su teleport."

**Why it happens:**
The state-changing action (teleport) forgets to cancel/invalidate the outstanding job. Bull jobs don't know the entity's current state; they act on the data captured at schedule time.

**How to avoid:**
- Make the completion job **idempotent and state-validating**: on fire, re-read the character and only complete if `activeTravel` still exists, matches the job's road, and `endTime` matches — otherwise no-op.
- On teleport/cancel/delete, remove the specific Bull job (`job.remove()` by deterministic job id) **and** clear `activeTravel` atomically in the same DB op.
- Use deterministic job ids (e.g. `travel:<characterId>:<travelId>`) so you can find/remove/dedupe; reject duplicate scheduling.

**Warning signs:**
Player teleports then gets yanked back seconds later; double arrival rewards; completion job logs "completed" for a character with no active travel.

**Phase to address:** TRAVEL-01 lifecycle (atomic clear on teleport) + Bull consolidation (idempotent processors).

---

### Pitfall 15: FCM stale tokens never cleaned up — delivery rots and sends waste quota

**What goes wrong:**
Device tokens are stored on register but never removed when they go invalid. Uninstalled/expired tokens (FCM garbage-collects after 270 days inactive) keep failing with `messaging/registration-token-not-registered` / `UNREGISTERED`. Over time most sends fail silently, notifications don't arrive, and multi-device users accumulate dead tokens.

**Why it happens:**
Registration is the happy path everyone builds; the un-registration/cleanup path is invisible until delivery degrades. There's no error unless you read per-token send responses.

**How to avoid:**
- Store tokens per-device (array per user) — a user has multiple devices; never overwrite a single token field.
- Send with `sendEachForMulticast`/`sendEach` (firebase-admin, HTTP v1) and inspect per-token responses; on `messaging/registration-token-not-registered` (and `INVALID_ARGUMENT` when payload is known-valid), **delete that token**.
- Refresh tokens on app foreground (FE responsibility) and upsert server-side; dedupe.

**Warning signs:**
Notification "sent" count high but device receipt low; token collection only grows; no handling of per-token error codes.

**Phase to address:** FCM infrastructure (token registry + cleanup).

---

### Pitfall 16: FCM `notification` vs `data` messages — background/killed apps don't get travel-end/quest-end pushes

**What goes wrong:**
Travel-end / streamer-live / quest-end pushes are sent as `notification` messages. When the Flutter app is backgrounded, the OS shows them in the tray but the app's message handler (`onMessageReceived` / `onBackgroundMessage`) never runs — so the app can't re-query the combat result / update state. Conversely, a pure `data` message won't display anything if the app is killed and, on Android, a **force-stopped** app is in the STOP state and receives nothing at all.

**Why it happens:**
FCM routes `notification`-payload messages through the system tray (handler skipped when backgrounded); `data`-only messages go to the app handler but require the app to build the UI notification itself and require the process to be alive. The "combat result ibrido" design (payload on subscription, **ID on push, requery on background**) depends on the background handler actually running — which only `data` messages trigger.

**How to avoid:**
- For the combat-result-requery flow, send **`data` messages** (or `notification` + `data` with the id in `data`) so the background handler receives the combat-result id and can requery. Document this in the FE handoff (FE Phase 5 depends on it).
- Set Android `priority: high` for time-sensitive pushes; for iOS background data, include `content-available: 1` (APNS) — otherwise iOS won't wake the app.
- Accept that force-stopped Android apps won't receive pushes — don't rely on push as the *only* delivery; the subscription + on-open requery is the fallback.
- Decide payload shape (data-only vs mixed) explicitly per push type and write it into the contract.

**Warning signs:**
Pushes appear in tray but combat requery never fires when app backgrounded; iOS gets nothing in background; FE can't read the combat id from the push.

**Phase to address:** FCM infrastructure + combat-result contract (payload/id split).

---

### Pitfall 17: mongodb-memory-server replica-set mode flakes in CI (and ioredis-mock can't do Bull delays)

**What goes wrong:**
The TDD foundation uses mongodb-memory-server in replica-set mode (for change streams + transactions) and ioredis-mock for Bull. In CI this flakes: the single-node RS needs time to elect a primary (transactions fail if you connect before initiation completes), the mongod binary download times out / is blocked on locked-down runners, and **ioredis-mock does not faithfully support Bull's delayed-job / blocking semantics**, so timer-based tests (travel/spell recovery) pass locally but hang or behave wrong in CI.

**Why it happens:**
A single-node replica set still needs `replSetInitiate` + primary election before transactions work; tests race the election. mongodb-memory-server caches binaries per-arch and re-downloads on cache miss. ioredis-mock is an in-memory approximation, not a real Redis — Bull relies on Lua scripts / blocking commands it doesn't fully emulate.

**How to avoid:**
- Await RS readiness (wait for primary) in global test setup before opening connections/transactions; give a generous jest timeout for the first spin-up.
- Pin and pre-cache the mongod binary in CI (cache `~/.cache/mongodb-binaries`); pin the mongodb-memory-server version.
- For Bull timer logic, don't unit-test through ioredis-mock delays — test the **reconciler/processor logic directly** (call the processor with crafted job data; test the "overdue sweep" against Mongo). Reserve a real Redis (service container) for any end-to-end queue test, or skip queue-timing e2e in unit CI.
- Keep transaction-dependent tests isolated so RS flakiness doesn't blanket-fail the suite.

**Warning signs:**
Intermittent `Transaction numbers are only allowed on a replica set` or `not primary` in CI only; CI hangs on Bull delayed-job tests; binary-download timeouts.

**Phase to address:** Test foundation (TDD infra) — de-risk before atomicity/Bull phases depend on it.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Validate JWT only at `onConnect`, skip per-`subscribe` expiry | Faster to ship WS auth | Expired/revoked tokens stream forever; hard to retrofit | Never for a money/state-of-truth game |
| `find`+`save` with reordered validation instead of atomic `$inc`/transaction | Minimal diff to fix CONCERNS #5–7 | Race conditions persist under load; balances drift | Only for truly single-writer, non-economic fields |
| Bull job fire-time as travel/recovery source of truth (no DB `endTime`) | Less code, no reconciler | Stuck travels on Redis loss; clock drift | Never — persist `endTime`, job is a trigger |
| Skip EventSub idempotency (assume once-delivery) | Simpler handler | Double-credited points, replay abuse | Never for point crediting |
| Single token field per user | Simple registry | Multi-device users lose pushes; stale tokens rot | Never — array + cleanup from day one |
| Dev-auth bypass on `NODE_ENV !== 'production'` | Unblocks FE stub fast | Fail-open backdoor in prod | Only with explicit `AUTH_MODE` + `=== 'production'` assertion |
| Test Bull delays through ioredis-mock | No Redis in CI | Flaky/false-green timer tests | Only if you also test processor logic directly |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Twitch EventSub | HMAC over re-parsed JSON body | HMAC over captured **raw** body (`messageId+timestamp+rawBody`), timing-safe compare |
| Twitch EventSub | Ignoring `revocation` + no reconcile-on-boot | Handle revocation, re-subscribe, verify subscriptions at startup |
| Twitch EventSub | Using user token to create webhook sub | Webhooks require **app access token** (client-credentials) |
| Twitch EventSub (local dev) | Pointing Twitch at localhost | Use `twitch event trigger`/`twitch event verify-subscription` (Twitch CLI) + a public HTTPS tunnel (ngrok/cloudflared) or the CLI's mock EventSub server |
| Twitch OAuth | Never re-validating the Twitch token | Policy requires validate at start + hourly via `/oauth2/validate` (relevant for the app token retained for EventSub mgmt) |
| FCM | Legacy HTTP/server-key API | Legacy decommissioned (June 2024) — use HTTP v1 via `firebase-admin` + service-account creds |
| FCM | Ignoring per-token send responses | `sendEach*`, inspect responses, delete `UNREGISTERED` tokens |
| Mongo transactions | Assuming standalone `mongod` works | Requires replica set (as does the existing change stream) |
| Bull v4 (not BullMQ) | Copy-pasting BullMQ APIs | This repo uses classic `bull`@4 + `@nestjs/bull`@11 — use Bull v4 job/queue API |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-validating Twitch token per request | Latency spikes, hit Twitch rate limits | Exchange once → own BE JWT (already the decision); validate app token hourly, not per-request | Any real traffic (why JWT was chosen) |
| Fan-out FCM sends one-by-one | Slow notify, quota burn | Batch `sendEach`/multicast, prune dead tokens | Player base grows past a handful |
| EventSub dedup table without TTL/index | Slow lookups, unbounded growth | Unique index on message id + TTL (>10 min retention) | Sustained redemption volume |
| Boot reconciler scanning all characters each tick | CPU on large collections | Index `status.activeTravel.endTime`; query only overdue | Many concurrent travelers |
| In-memory PubSub + change stream (single instance) | Subscriptions lost on multi-instance | Documented single-instance for v1 (PROJECT out-of-scope); revisit with Redis adapter if scaled | Horizontal scaling |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Unauthenticated EventSub endpoint credits points | Anyone POSTs fake redemptions → infinite currency | Mandatory HMAC verify + fail-closed + idempotency |
| WS connection authed but subscription not ownership-filtered | Read any player's live state | Ownership filter in subscription resolver (Pitfall 3) |
| Dev-auth god token in prod | Full impersonation | Fail-closed `AUTH_MODE` + `NODE_ENV==='production'` guard |
| REST Cloudinary route unguarded | Anon uploads → cost/content abuse | Transport-aware guard covers REST; test anon upload = 401 |
| EventSub/Twitch/FCM secrets in repo or `.env` committed | Full compromise of integrations | `.env` gitignored (done), `.env.example` only, secret rotation plan |
| Error messages enumerate valid ids (CONCERNS #13) | Attacker maps characters/spells | 403 (not 404) on unauthorized; generic messages; global exception filter |
| Introspection on in prod (CONCERNS #3) | API surface mapping | `introspection: NODE_ENV!=='production'` |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Push-only combat/travel notice | Force-stopped/iOS-background users miss events | Push as hint + subscription/on-open requery as source of truth |
| Silent EventSub sub death | Players stop getting channel points, no signal | Health-monitor subscription; alert on event silence |
| Hard 401 on token expiry mid-session | App appears "logged out" randomly | Clear expiry contract + FE refresh flow (document in handoff) |
| Notification with no `data` id | Tapping push can't deep-link to combat result | Always include the combat-result id in `data` payload |

## "Looks Done But Isn't" Checklist

- [ ] **WS auth:** connection authenticates — but is `exp` re-checked on every `subscribe` and are stale sockets closed? Verify with an expired-token subscription test.
- [ ] **WS auth:** guard passes HTTP tests — but does a real `graphql-ws` client get rejected unauthenticated? Verify with an integration test, not a mocked context.
- [ ] **Authorization:** connection is authed — but can an authed user subscribe to *another* character's id? Verify ownership filter.
- [ ] **Global guard:** GraphQL protected — but is the Cloudinary REST route also 401 without a token? Verify with `curl`.
- [ ] **Dev bypass:** works in dev — but does prod config with the token set still reject it? Verify with a prod-env test.
- [ ] **EventSub:** happy-path credit works — but is the signature verified over raw body, and does a duplicate message id no-op? Verify with a replayed payload.
- [ ] **EventSub:** subscription created — but does the handler answer the challenge as plain text, handle `revocation`, and reconcile on boot?
- [ ] **Atomicity:** validation reordered — but does a parallel-request concurrency test produce correct balances? Verify `__v`/`$inc` actually guards scalar fields.
- [ ] **Transactions:** pass in CI — but do they run against the actual prod topology (replica set confirmed)?
- [ ] **Travel/spell timers:** job fires on time — but does travel still complete after a Redis flush (boot reconciler)? And is a stale job a no-op after teleport?
- [ ] **FCM:** notification arrives in foreground — but does the background handler run (data message) and are `UNREGISTERED` tokens deleted?
- [ ] **Combat result:** payload on subscription — but can a backgrounded client read the id from the push `data` and requery?

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Double-credited points (no idempotency) | MEDIUM | Add dedup index, reconcile balances from redemption audit log, backfill correction |
| Stuck travels (lost Bull jobs) | LOW | Boot reconciler finalizes overdue `endTime` travels; add reconciler permanently |
| Dev token leaked to prod | HIGH | Rotate secret, invalidate sessions, add fail-closed guard + test, audit access logs |
| EventSub subscription silently revoked | LOW | Reconcile-on-boot re-creates it; add health alarm to detect sooner |
| Stale FCM tokens flooding failures | LOW | Add per-token cleanup; one-time prune of tokens failing `UNREGISTERED` |
| Balances drifted (non-atomic writes) | HIGH | Migrate to `$inc`/transactions, then reconcile from transaction history if one exists (may be unrecoverable without audit trail — argues for an audit log early) |

## Pitfall-to-Phase Mapping

> Phase names are topical (roadmap not yet authored). Ordering reflects dependencies: Test foundation and Auth land early; Atomicity underpins EventSub crediting and travel lifecycle.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 WS token not re-checked | Auth foundation (connection_init) | Expired-token subscription rejected |
| 2 Guards don't run on subscriptions | Auth foundation + Test foundation | Real `graphql-ws` client rejected unauth'd |
| 3 Subscription ownership missing | Authorization / ownership | Cross-owner subscribe blocked |
| 4 Dev bypass leaks to prod | Auth foundation (dev strategy) | Prod-env test rejects stub token |
| 5 Retrofit breaks FE | Auth foundation (rollout + handoff) | Staging FE unbroken; `@Public()` whitelist exists |
| 6 REST route unguarded | Auth foundation (coverage audit) | Anon Cloudinary upload = 401 |
| 7 EventSub signature | Twitch EventSub | Forged POST rejected; raw-body HMAC test |
| 8 Challenge handshake | Twitch EventSub | Subscription reaches `enabled` |
| 9 EventSub idempotency | Twitch EventSub (+ Atomicity) | Replayed message id no-ops |
| 10 Subscription lifecycle | Twitch EventSub (lifecycle) | Revocation handled; reconcile-on-boot |
| 11 Non-atomic scalar writes / `__v` | Data integrity / atomicity | Concurrency test correct totals |
| 12 Transactions need replica set | Atomicity + Test foundation | Runs on prod-like RS topology |
| 13 Bull timers lost / drift | TRAVEL-01 + Bull consolidation | Travel completes after Redis restart |
| 14 Zombie jobs on teleport | TRAVEL-01 (atomic clear) + Bull | Stale job no-ops after teleport |
| 15 FCM stale tokens | FCM infrastructure | `UNREGISTERED` tokens pruned |
| 16 FCM data vs notification | FCM + combat-result contract | Background handler requeries by id |
| 17 memory-server RS / ioredis-mock | Test foundation | Stable CI; processor logic tested directly |

## Sources

- Twitch EventSub — Handling Webhook Events (signature, headers, challenge, revocation, at-least-once dedup, 10-min replay window): https://dev.twitch.tv/docs/eventsub/handling-webhook-events — HIGH
- Twitch EventSub — Managing Subscriptions (app access token requirement, limits): https://dev.twitch.tv/docs/eventsub/manage-subscriptions/ — HIGH
- Twitch — Validating Tokens (validate at start + hourly policy): https://dev.twitch.tv/docs/authentication/validate-tokens — HIGH
- Twitch — Authentication (app vs user tokens): https://dev.twitch.tv/docs/authentication/ — HIGH
- Twitch EventSub Node sample (raw-body + HMAC pattern): https://github.com/twitchdev/eventsub-webhooks-node-sample — HIGH
- FCM — Best practices for registration management (270-day expiry, stale cleanup): https://firebase.google.com/docs/cloud-messaging/manage-tokens — HIGH
- FCM — Error codes (`registration-token-not-registered`, `INVALID_ARGUMENT`): https://firebase.google.com/docs/cloud-messaging/error-codes — HIGH
- Firebase blog — Managing Cloud Messaging Tokens: https://firebase.blog/posts/2023/04/managing-cloud-messaging-tokens/ — HIGH
- Mongoose versionKey / optimistic concurrency (`__v` only on array ops during `save()`): https://thecodebarbarian.com/whats-new-in-mongoose-5-10-optimistic-concurrency.html and https://github.com/Automattic/mongoose/issues/6994 — HIGH
- Codebase: `.planning/codebase/CONCERNS.md`, `src/characters/spell-recovery.processor.ts`, `src/app.module.ts`, `package.json` — HIGH (direct inspection)
- NestJS GraphQL subscriptions guard/context behavior — training data + NestJS docs — MEDIUM (verify guard branching with an integration test during build)

---
*Pitfalls research for: brownfield NestJS/GraphQL/Mongoose game backend adding auth, Twitch EventSub, FCM, atomicity*
*Researched: 2026-07-16*
