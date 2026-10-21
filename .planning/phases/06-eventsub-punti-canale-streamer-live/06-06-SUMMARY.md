---
phase: 06-eventsub-punti-canale-streamer-live
plan: 06
subsystem: eventsub
tags: [eventsub, twitch, webhook, signature, push, reconcile, logging]
requires:
  - "06-01: EVENTSUB_CONFIG, EventSubConfig / EventSubWebhookConfig (src/config/eventsub-config.ts)"
  - "06-02: readEventSubHeaders, verifyEventSubSignature, parseNotification / parseChallenge / parseRevocation, EventSubMessageType, EventSubSubscriptionType, AUTHORIZATION_REVOKED_STATUS, STREAMER_SCOPE_REMEDY; signed fixtures"
  - "06-03: PointsCreditService (CreditOutcome), StreamOnlineRecorder (StreamOnlineOutcome)"
  - "06-05: EventSubSubscriptionManager.reconcileSafely()"
  - "Phase 5: PushService.broadcast (never throws), streamerLive()"
provides:
  - "src/eventsub/webhook-reply.ts: WebhookReply (challenge | noContent | forbidden | retryLater), NO_CONTENT, FORBIDDEN, RETRY_LATER, challengeReply"
  - "src/eventsub/eventsub-webhook.service.ts: EventSubWebhookService.handle(headers, rawBody, body): Promise<WebhookReply>"
  - "src/eventsub/eventsub-startup.reporter.ts: EventSubStartupReporter (OnApplicationBootstrap)"
affects: [06-07, 06-09]
tech-stack:
  added: []
  patterns:
    - "discriminated reply object: the controller maps kind to status, the service never touches HTTP"
    - "signature gate before every branch, outer try/catch so handle never throws"
    - "fire-and-forget broadcast with a bound arrow-field catch handler"
key-files:
  created:
    - src/eventsub/webhook-reply.ts
    - src/eventsub/eventsub-webhook.service.ts
    - src/eventsub/eventsub-webhook.service.spec.ts
    - src/eventsub/eventsub-startup.reporter.ts
    - src/eventsub/eventsub-startup.reporter.spec.ts
  modified: []
decisions:
  - "Routing uses messageTypeOf(header) as a type guard over EventSubMessageType values (unknown → null → default WARN branch), which avoids the unsafe enum comparison and keeps the switch exhaustive"
  - "The broadcaster check runs for both redemption and stream.online and logs the subscription type through a kind → EventSubSubscriptionType map"
  - "The streamer-live broadcast rejection handler is a private arrow field (logPushFailure), so `void this.push.broadcast(streamerLive()).catch(...)` stays on one line"
metrics:
  duration: 5 min
  completed: 2026-10-19
  tasks: 2
  files: 5
---

# Phase 6 Plan 06: EventSub webhook routing and boot report Summary

`EventSubWebhookService.handle` turns every webhook request into a discriminated `WebhookReply`. The signature is checked before any branch, the challenge is answered bare, redemptions are credited through the idempotent service, `stream.online` fires the streamer-live push without waiting for it, and revocations trigger a reconcile. Only database errors ask Twitch to redeliver. `EventSubStartupReporter` logs the EventSub mode at boot and never logs a secret.

## What was built

- **`WebhookReply`** (Task 1): four kinds plus constants and `challengeReply`. Plan 06-07's controller maps them to 200 text/plain, 204, 403 and 500.
- **`EventSubWebhookService.handle`** (Task 1), in this order:
  1. `disabled` → DEBUG, `forbidden`.
  2. Everything else runs inside a `try/catch`; an unexpected error → ERROR with `describeMongoError` only, then `retryLater`.
  3. Missing headers → WARN, `forbidden`. A bad signature, a timestamp outside the replay window or a missing raw body → WARN without the messageId, `forbidden`.
  4. Verification → `challenge` (missing challenge → `forbidden`).
  5. Revocation → ERROR with type, status and id, plus `STREAMER_SCOPE_REMEDY` only for `authorization_revoked` on the redemption. A malformed revocation → WARN. In both cases `void this.subscriptions.reconcileSafely()`, then `noContent`.
  6. Unknown message type → WARN, `noContent`.
  7. Notification: `unsupported` → WARN; `invalid` → ERROR; another broadcaster → WARN; all `noContent`.
  8. Redemption → `credit.credit(event, messageId, now)`: `credited` LOG (messageId, cost, twitch user id), `duplicate` and `unknownViewer` DEBUG only, a thrown error → ERROR and `retryLater`.
  9. `stream.online` (any `type`) → `record`: `recorded` → `void this.push.broadcast(streamerLive()).catch(this.logPushFailure)` + LOG; `duplicate` → DEBUG and no push; a thrown error → ERROR, `retryLater`, no push.
- **`EventSubStartupReporter`** (Task 2): WARN for disabled (names the three variables and 403), WARN for local mode (callback, Twitch CLI, Helix not managed), LOG for managed (broadcaster and callback).

## TDD evidence

- Task 1 RED (259acad): `Could not locate module src/eventsub/eventsub-webhook.service`, so the suite failed. GREEN (19b271a): 30/30, including the never-resolving broadcast and reconcile cases and the rejected broadcast.
- Task 2 RED (fc6f9c9): `Could not locate module src/eventsub/eventsub-startup.reporter`, so the suite failed. GREEN (826a531): 3/3; `src/eventsub` unit 12 suites / 226 tests.

## Verification

- Unit: 79 suites / 1098 tests (1065 + 30 + 3)
- Integration (`--runInBand`): 44 / 526, unchanged
- `npm run build`: exit 0
- Filtered lint: 0 lines; eslint is clean on all 5 files
- Acceptance greps: `void this.push.broadcast(streamerLive())` found on 1 line; `grep -rn "await this.push" src/eventsub` → 0; `void this.subscriptions.reconcileSafely()` found; `verifyEventSubSignature(` (line 120) comes before `parseChallenge(` (line 143); no `signature/rawBody/body/secret` interpolation, no `JSON.`, no `connection.transaction`/`startSession` in the service; no `@Public()` under `src/eventsub`; the reporter has both exact messages and no `${...secret}` interpolation.

## Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 259acad | test(eventsub): specify the webhook routing |
| 1 GREEN | 19b271a | feat(eventsub): route verified webhook messages to credit and push |
| 2 RED | fc6f9c9 | test(eventsub): specify the boot report |
| 2 GREEN | 826a531 | feat(eventsub): report the EventSub mode at boot |

## Deviations from Plan

1. **[Rule 3 - Blocking] Commit subject shortened.** The planned subject `feat(eventsub): route verified webhook messages to credit, push and reconcile` is 76 characters, over the 72-character limit. I used `... to credit and push`; the commit body covers the reconcile.
2. **[Rule 1 - Lint] Enum comparison warnings.** Switching on the header string against `EventSubMessageType` and comparing `notice.type` with `EventSubSubscriptionType.redemptionAdd` triggered `@typescript-eslint/no-unsafe-enum-comparison`. I fixed both before the commit with a `messageTypeOf` type guard and a module constant `REDEMPTION_TYPE: string`, the same approach as 06-05. Behavior is unchanged.
3. **[Formatting] Broadcast kept on one line.** With an inline `.catch` arrow, Prettier split `void this.push.broadcast(...)` over three lines and the acceptance grep failed. Moving the handler into a private arrow field (`logPushFailure`) keeps the exact line without fighting the formatter.
4. **[Spec scope] Extra cases.** Beyond the listed behaviors, the spec also covers: a reconcile that never resolves (the revocation answers immediately), `stream.online` with `type: 'rerun'` (the push is still sent), and `stream.online` from another broadcaster (no record, no push).

## Known Stubs

None. The service and reporter are not registered in a module yet; plan 06-07 does that.

## Self-Check: PASSED

- FOUND: src/eventsub/webhook-reply.ts, eventsub-webhook.service.ts, eventsub-webhook.service.spec.ts, eventsub-startup.reporter.ts, eventsub-startup.reporter.spec.ts
- FOUND commits: 259acad, 19b271a, fc6f9c9, 826a531
