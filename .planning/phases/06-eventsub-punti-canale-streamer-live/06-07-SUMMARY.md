---
phase: 06-eventsub-punti-canale-streamer-live
plan: 07
subsystem: eventsub
tags: [eventsub, twitch, webhook, controller, module, integration, rawbody]
requires:
  - "06-01: EVENTSUB_CONFIG, eventSubConfigProvider, EventSubConfig"
  - "06-02: signed fixtures (signedEventSubRequest, redemptionNotification, streamOnlineNotification, verificationChallenge, revocationMessage)"
  - "06-03: EventSubMessage + schema, EventSubMessageIndexVerifier, PointsCreditService, StreamOnlineRecorder"
  - "06-04: TwitchHelixClient, HttpTwitchHelixClient, TwitchAppTokenCache, FakeTwitchHelixClient, buildTestEventSubConfig / buildLocalEventSubConfig"
  - "06-05: EventSubSubscriptionManager"
  - "06-06: EventSubWebhookService.handle -> WebhookReply, EventSubStartupReporter"
  - "Phase 5: PushModule, PushTransport, PUSH_CONFIG, FakePushTransport.topicSends"
provides:
  - "src/eventsub/eventsub.controller.ts: EventSubController, POST /webhooks/twitch/eventsub (public handler only)"
  - "src/eventsub/eventsub.module.ts: EventSubModule (leaf module, not global, not yet in AppModule)"
  - "test/eventsub/eventsub-test-app.ts: createEventSubTestApp(config), postEventSub(app, signed, contentType), EVENTSUB_WEBHOOK_PATH, EventSubTestApp"
  - "test/auth/auth-test-app.ts: harness boots with createNestApplication({ rawBody: true })"
affects: [06-08, 06-09]
tech-stack:
  added: []
  patterns:
    - "thin controller with @Res(): the service reply kind maps to 200 text/plain / 204 / 403 / 500, no JSON and no interceptor wrapping"
    - "integration helper on top of createAuthTestApp with overrides for config, Helix and FCM transport; the boot reconcile is drained before tests"
key-files:
  created:
    - src/eventsub/eventsub.controller.ts
    - src/eventsub/eventsub.module.ts
    - test/eventsub/eventsub-test-app.ts
    - src/eventsub/eventsub.controller.int-spec.ts
    - src/eventsub/eventsub-points.int-spec.ts
  modified:
    - test/auth/auth-test-app.ts
decisions:
  - "The rawBody option in the harness is unconditional, not a parameter: it only adds req.rawBody next to the parsed JSON body, so every existing suite keeps passing (46 integration suites green)"
  - "createEventSubTestApp awaits manager.reconcile() after boot: it joins the boot reconcile already in flight, so tests start from a settled fake Helix (exactly 2 create requests)"
  - "The fire-and-forget streamer-live push is observed by polling topicSends (1 s max, 10 ms steps) instead of fixed sleeps on the positive path"
metrics:
  duration: 5 min
  completed: 2026-10-19
  tasks: 2
  files: 6
---

# Phase 6 Plan 07: EventSub webhook controller, module and wire proof Summary

`EventSubController` exposes `POST /webhooks/twitch/eventsub` with the decorator that makes it public on the `receive` handler only. It turns the `WebhookReply` from the service into the Twitch contract: 200 `text/plain` with only the challenge, or an empty 204, 403 or 500. `EventSubModule` registers every provider of the phase. Two integration specs drive the real Nest stack on the replica set (global guard, JSON body parser with raw body) and prove ROADMAP success criteria 1-4. Twitch Helix and FCM are faked.

## What was built

- **Harness** (`test/auth/auth-test-app.ts`): `moduleRef.createNestApplication({ rawBody: true })`, with a comment pointing to D-02. Every other integration suite still passes.
- **`EventSubController`**: `@Controller('webhooks/twitch')`, `@Post('eventsub')`, `@Req() req: RawBodyRequest<Request>` and `@Res() res: Response`, with type-only imports (`import type { RawBodyRequest } from '@nestjs/common'`, `import type { Request, Response } from 'express'`). It calls `this.webhook.handle(req.headers, req.rawBody, req.body)`. The required comment sits above the decorator and does not contain the decorator literal.
- **`EventSubModule`**: imports `EconomyModule`, `PushModule` and `MongooseModule.forFeature` (EventSubMessage, User). It registers `eventSubConfigProvider`, a local `Clock` (SystemClock), `TwitchAppTokenCache`, `TwitchHelixClient` → `HttpTwitchHelixClient`, the index verifier, `PointsCreditService`, `StreamOnlineRecorder`, `EventSubSubscriptionManager`, `EventSubWebhookService` and `EventSubStartupReporter`. It has no `@Global` and no `UsersModule`.
- **`createEventSubTestApp` / `postEventSub`**: `createAuthTestApp({ imports: [EventSubModule], overrides: [EVENTSUB_CONFIG, TwitchHelixClient → FakeTwitchHelixClient, PushTransport → FakePushTransport, PUSH_CONFIG → { serviceAccount: null }] })`. After boot it runs `await manager.reconcile()`.

## Wire results

**`eventsub.controller.int-spec.ts` (12 tests)**
- managed: the boot reconcile sends exactly 2 create requests (redemption + stream.online).
- A signed challenge returns 200 with `content-type` `text/plain…`, `content-length` equal to the challenge length, and the bare challenge as the body.
- A challenge signed with a different secret returns 403 with an empty body.
- A tampered signature returns 403 with an empty body, writes nothing to `eventsub_messages` and leaves the balance at 100.
- A correctly signed timestamp from 11 minutes ago returns 403.
- Missing headers return 403; a `text/plain` body returns 403.
- `reaches the public handler without a bearer` returns 200, never 401.
- `unknown_type` returns 204 with an empty body.
- A 120 KB JSON body returns 413.
- disabled: a signed challenge returns 403 and Helix is never called.
- local: the challenge returns 200 and `helix.calls` is empty.

**`eventsub-points.int-spec.ts` (9 tests)**
- A redemption with cost 250 returns 204, the balance goes from 100 to 350, and one document is written (`credited`, amount 250, twitchUserId 22222, eventId redemption-1).
- Redelivering the same message gives 350 and 1 document.
- **5 concurrent deliveries** (`Promise.all`) all return 204, with 350 and 1 document. Stable over 2 consecutive runs, plus the full suite run.
- The same `event.id` under two message ids (C7) gives 350 and 1 document.
- An unknown viewer returns 204, writes no document and creates no user.
- A different broadcaster returns 204 with no credit.
- `cost: 0` returns 204 with the balance unchanged.
- **stream.online** returns 204. `topicSends` equals `[{ topic: 'streamer-live', message: objectContaining({ type: streamerLive }) }]` and one `broadcast` document is written. Redelivery returns 204 and `topicSends` stays at length 1.
- **revocation** (`authorization_revoked` on the boot-created redemption subscription) returns 204. After `manager.reconcile()`, `helix.calls` contains `{ delete, id }` and `{ create, redemption type }`.

## TDD evidence

- Task 1 RED (51510e0): `Could not locate module src/eventsub/eventsub.module` (imported from `test/eventsub/eventsub-test-app.ts`), so the suite failed. GREEN (c27c1b2 harness + 3343bfe src): 12/12.
- Task 2 (7959139) **passed on the first run**: it integrates behavior that was already RED at unit level in the earlier plans (06-03 ledger/credit, 06-05 manager, 06-06 routing). No artificial red was forced, and no real bug turned up.

## Verification

- Unit: 79 suites / 1098 tests (unchanged)
- Integration (`--runInBand`, full): 46 suites / 547 tests (44/526 + 2 suites / 21 tests)
- `test/auth` + `src/push` + `src/economy` integration: 10 / 126 green after the harness change
- `npm run build`: exit 0
- Filtered lint: 0 lines; eslint is clean on all 6 files
- Gates: `grep -rnE '^\s*@Public\(\)' src/eventsub | wc -l` = 1; `grep -rn '@Public()' src/eventsub | wc -l` = 1; the decorator is not on the class; `grep -rn "await this.push" src/eventsub` = 0; `grep -rn "jest.mock(" src/eventsub test/eventsub` = 0; `createNestApplication({ rawBody: true })` on 1 line; `type('text/plain')` and `req.rawBody` on 1 line each; both `import type` lines found; no `@Global`/`UsersModule` in the module
- `src/app.module.ts`, `src/main.ts` and `test/app.int-spec.ts` are untouched (they belong to 06-08)

## Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 51510e0 | test(eventsub): specify the webhook HTTP contract |
| 1 GREEN (harness) | c27c1b2 | test(test): expose the raw body in the integration harness |
| 1 GREEN (src) | 3343bfe | feat(eventsub): expose the EventSub webhook controller and module |
| 2 | 7959139 | test(eventsub): prove points credit, dedup, push and revocation on wire |

## Deviations from Plan

1. **[Rule 3 - Blocking] Task 2 commit subject shortened.** `... revocation on the wire` is 75 characters, over the 72-character limit. I used `... on wire`.
2. **[Formatting] Prettier split the challenge chain.** `res.status(HttpStatus.OK).type('text/plain').send(reply.challenge)` now spans several lines. The `type('text/plain')` grep still matches exactly 1 line, so I kept the formatter's output.
3. **[Spec scope] Extra assertions.** The disabled spec also checks that Helix is never called. The managed spec also checks that the tampered and stale requests write no documents.

## Notes for 06-08 / 06-09

- On a 413, Nest's `ExceptionsHandler` logs `PayloadTooLargeError` with its stack, because body-parser errors are not `HttpException`. This is framework behavior shared by every JSON route, GraphQL included; the log carries no secret or body content. It is out of scope here, but 06-09 can mention it under Pitfall 16 if needed.
- `main.ts` still has to pass `{ rawBody: true }` to `NestFactory.create` (06-08), together with mounting `EventSubModule` in `AppModule` and updating the real-boot public-handler whitelist.

## Known Stubs

None. The module is complete but not mounted in `AppModule` yet; plan 06-08 does that.

## Self-Check: PASSED

- FOUND: src/eventsub/eventsub.controller.ts, src/eventsub/eventsub.module.ts, test/eventsub/eventsub-test-app.ts, src/eventsub/eventsub.controller.int-spec.ts, src/eventsub/eventsub-points.int-spec.ts, test/auth/auth-test-app.ts
- FOUND commits: 51510e0, c27c1b2, 3343bfe, 7959139
