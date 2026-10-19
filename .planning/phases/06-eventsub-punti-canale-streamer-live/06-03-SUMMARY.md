---
phase: 06-eventsub-punti-canale-streamer-live
plan: 03
subsystem: eventsub
tags: [eventsub, idempotency, transactions, mongodb, unique-index, ttl, replica-set]
requires:
  - "06-02: RedemptionEvent, StreamOnlineEvent (src/eventsub/eventsub-payload.ts), EventSubSubscriptionType (src/eventsub/eventsub-types.ts), TEST_BROADCASTER_ID / TEST_VIEWER_TWITCH_ID (test/eventsub/eventsub-fixtures.ts)"
  - "Phase 4: WalletService.creditUserPoints (single writer of twitchPoints)"
  - "Phase 5: isDuplicateKeyOn / describeMongoError (src/mongo/mongo-errors.ts), PushDeviceIndexVerifier pattern"
provides:
  - "src/eventsub/eventsub-message.model.ts: EventSubMessage (eventsub_messages), EventSubMessageDocument, EventSubMessageSchema, EventSubMessageOutcome, EVENTSUB_MESSAGE_TTL_SECONDS"
  - "src/eventsub/duplicate-delivery.ts: isDuplicateDelivery(error)"
  - "src/eventsub/eventsub-message-index.verifier.ts: EventSubMessageIndexVerifier (OnApplicationBootstrap, non-blocking)"
  - "src/eventsub/points-credit.service.ts: PointsCreditService.credit(redemption, messageId, receivedAt) -> CreditOutcome { credited, duplicate, unknownViewer }"
  - "src/eventsub/stream-online.recorder.ts: StreamOnlineRecorder.record(event, messageId, receivedAt) -> StreamOnlineOutcome { recorded, duplicate }"
affects: [06-06, 06-07, 06-09]
tech-stack:
  added: []
  patterns:
    - "dedup by unique index + E11000 inside the same transaction as the balance write"
    - "viewer lookup outside the transaction; transaction callback contains only the two writes"
    - "partial unique index on { type, eventId } for duplicate subscriptions (C7)"
    - "boot index verifier that logs name + code only and never throws"
key-files:
  created:
    - src/eventsub/eventsub-message.model.ts
    - src/eventsub/duplicate-delivery.ts
    - src/eventsub/duplicate-delivery.spec.ts
    - src/eventsub/eventsub-message-index.verifier.ts
    - src/eventsub/eventsub-message-index.verifier.spec.ts
    - src/eventsub/points-credit.service.ts
    - src/eventsub/stream-online.recorder.ts
    - src/eventsub/eventsub-ledger.int-spec.ts
  modified: []
decisions:
  - "Index names are explicit (eventsub_message_id_unique, eventsub_event_unique, eventsub_message_ttl) so the int-spec and operators can address them"
  - "A ResourceNotFoundException from creditUserPoints inside the transaction maps to unknownViewer (user deleted between lookup and credit, Pitfall 7); any other error is rethrown untouched for the webhook to classify"
  - "PointsCreditService and StreamOnlineRecorder have no Logger: logging belongs to the webhook, outside the retried transaction callback"
metrics:
  duration: 6 min
  completed: 2026-10-19
  tasks: 2
  files: 8
---

# Phase 6 Plan 03: Idempotent EventSub ledger and points credit Summary

eventsub_messages ledger (unique messageId, partial unique { type, eventId }, 7-day TTL) built by a non-blocking boot verifier; PointsCreditService credits reward.cost exactly once through WalletService.creditUserPoints in the same transaction as the dedup insert, proven on the replica set with redelivery, 5 concurrent deliveries, same event under another message id, and unknown/deleted viewers.

## Tasks

| Task | Name | RED commit | GREEN commit |
| ---- | ---- | ---------- | ------------ |
| 1 | Ledger model, duplicate classifier, index verifier | 46a6709 | 5d68aa4 |
| 2 | PointsCreditService + StreamOnlineRecorder on replica set | 2e6bbdf | 047c1db |

### RED evidence

- Task 1: `npx jest src/eventsub/duplicate-delivery.spec.ts src/eventsub/eventsub-message-index.verifier.spec.ts --selectProjects unit` -> 2 suites failed, `Could not locate module src/eventsub/eventsub-message-index.verifier` (modules absent).
- Task 2: `npx jest src/eventsub/eventsub-ledger.int-spec.ts --selectProjects integration --runInBand` -> 1 suite failed, `Could not locate module src/eventsub/points-credit.service`.

### Int-spec outcomes (eventsub-ledger.int-spec.ts, 11 tests, green on 3 consecutive runs)

- Indexes present at boot: `eventsub_message_id_unique` (unique, `{ messageId: 1 }`), `eventsub_event_unique` (unique, `{ type: 1, eventId: 1 }`, `partialFilterExpression: { eventId: { $type: 'string' } }`), `eventsub_message_ttl` (`expireAfterSeconds: 604800`).
- First credit -> `credited`, balance 100 -> 350, one ledger document with the full shape.
- Redelivery of the same message id -> `duplicate`, balance 350, 1 document.
- 5 concurrent deliveries (`Promise.all`) -> exactly 1 `credited` + 4 `duplicate`, balance 350, 1 document.
- Same event id with message id `msg-2` -> `duplicate`, balance 350 (C7).
- Unknown viewer `99999` -> `unknownViewer`, 0 documents, other user's balance unchanged.
- creditUserPoints rejects ResourceNotFoundException -> `unknownViewer`, 0 documents (transaction aborted).
- creditUserPoints rejects a MongoServerError code 91 -> promise rejects with that same error, 0 documents, balance unchanged.
- StreamOnlineRecorder: `recorded` with null twitchUserId/rewardId/amount and outcome `broadcast`; same message id -> `duplicate`; same event with another message id -> `duplicate`.

## Verification

- Unit: 72 suites / 990 tests passed (baseline 70 / 980; +2 suites, +10 tests)
- Integration (`--runInBand`): 44 suites / 526 tests passed (baseline 43 / 515; +1 suite, +11 tests)
- `npm run build`: exit 0
- Filtered lint (`npx eslint "{src,apps,libs,test}/**/*.ts" --quiet | grep ... | grep -vE "prettier/prettier|prefer-const"`): 0 lines
- Gate greps under src/eventsub: no balance-increment operator, no `findOrCreateByTwitchId`, no `@Public()`, no Logger in the two services, no `transaction` in the recorder; one `this.connection.transaction(` and one `creditUserPoints(` in PointsCreditService.

## Deviations from Plan

**1. [Commit subject length] Task 1 RED subject shortened**
- The planned subject `test(eventsub): specify the delivery dedup classifier and the ledger index verifier` is 83 characters, above the 72-character limit; committed as `test(eventsub): specify the delivery dedup classifier and index verifier`.
- Task 2 GREEN subject `feat(eventsub): credit channel points once per delivery and record stream online` (81 chars) shortened the same way to `feat(eventsub): credit channel points once per delivery`; the body mentions stream online.

No code deviations: plan executed as written.

## Known Stubs

None. The services are intentionally not registered in a module yet (06-07 does it, per plan).

## Self-Check: PASSED

- All 8 created files exist; commits 46a6709, 5d68aa4, 2e6bbdf, 047c1db present on the branch; no Co-Authored-By trailer.
