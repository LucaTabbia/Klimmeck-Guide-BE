---
phase: 06-eventsub-punti-canale-streamer-live
plan: 05
subsystem: eventsub
tags: [eventsub, twitch, helix, reconciliation, timer, single-flight]
requires:
  - "06-01: EVENTSUB_CONFIG, EventSubConfig / ManagedEventSubConfig (reconcileIntervalMs) (src/config/eventsub-config.ts)"
  - "06-02: EventSubSubscriptionType, EVENTSUB_SUBSCRIPTION_VERSION, STREAMER_SCOPE_REMEDY (src/eventsub/eventsub-types.ts); TEST_EVENTSUB_SECRET, TEST_BROADCASTER_ID"
  - "06-04: TwitchHelixClient port, TwitchHelixError(status), describeHelixError, FakeTwitchHelixClient, buildTestEventSubConfig / buildLocalEventSubConfig / TEST_CALLBACK_URL"
provides:
  - "src/eventsub/subscriptions/plan-reconciliation.ts: desiredSubscriptions(broadcasterId), planReconciliation(existing, desired, callbackUrl) -> { keep, remove, create, ignored }, DesiredSubscription, ReconciliationPlan, ENABLED_STATUS, PENDING_STATUS"
  - "src/eventsub/subscriptions/eventsub-subscription.manager.ts: EventSubSubscriptionManager (onApplicationBootstrap, onModuleDestroy, reconcile, reconcileSafely)"
affects: [06-06, 06-07, 06-09]
tech-stack:
  added: []
  patterns:
    - "pure table-driven reconciliation plan, side effects only in the manager"
    - "single-flight promise with one coalesced rerun"
    - "fire-and-forget bootstrap run plus setInterval(...).unref() cleared in onModuleDestroy"
    - "per-step try/catch: deletes before creates, status-specific log levels"
key-files:
  created:
    - src/eventsub/subscriptions/plan-reconciliation.ts
    - src/eventsub/subscriptions/plan-reconciliation.spec.ts
    - src/eventsub/subscriptions/eventsub-subscription.manager.ts
    - src/eventsub/subscriptions/eventsub-subscription.manager.spec.ts
  modified: []
decisions:
  - "planReconciliation removes every owned subscription except the single keeper (oldest enabled, else oldest pending, among exact matches on the normalized callback): rows 3-6 collapse into one rule, and removals come out ordered by desired type, then createdAt, then id"
  - "Ownership = webhook transport + desired type + same broadcaster_user_id; anything else is ignored (row 7) and only counted in a DEBUG log"
  - "The manager summary logs created subscriptions as returned by Helix (type id status); failed creates are absent from it and logged on their own (409 WARN, 403 on the redemption ERROR with STREAMER_SCOPE_REMEDY, others ERROR)"
metrics:
  duration: 9 min
  completed: 2026-10-19
  tasks: 2
  files: 4
---

# Phase 6 Plan 05: EventSub subscription reconciliation Summary

A pure `planReconciliation` function, tested as a table over the eight research rows, plus an `EventSubSubscriptionManager`. The manager runs the plan once at boot without blocking startup, again on an hourly `unref()` timer, and on demand through a single-flight `reconcile()`. It never calls Helix in `local` or `disabled` mode.

## What was built

- **`planReconciliation`** (Task 1): for each desired subscription it collects the *owned* items (webhook, same type, same broadcaster) and sorts them by `createdAt` and then `id`. It keeps a single one: the oldest exact match (only the `broadcaster_user_id` key, same version) on the same normalized callback, taking an `enabled` item over a `pending` one. Every other owned item is removed. If nothing is kept, it creates the subscription. Items not owned by any desired subscription are `ignored`. The callback is compared after `new URL(x).href`, with the raw value as fallback.
- **`EventSubSubscriptionManager`** (Task 2):
  - `onApplicationBootstrap` is synchronous: in managed mode it starts `setInterval(...).unref()` if `reconcileIntervalMs > 0`, then calls `void this.reconcileSafely()`. `onModuleDestroy` calls `clearInterval`.
  - `reconcile()` is single-flight with one coalesced rerun.
  - `runOnce` lists the subscriptions, applies the plan, runs the deletes before the creates, and isolates each step in its own try/catch. It then writes the summary log `EventSub subscriptions reconciled: kept [...], removed [...], created [...]`, which contains only type, id and status.

## TDD evidence

- Task 1 RED (76deaed): `Cannot find module './plan-reconciliation'`, so the suite failed. GREEN (5bc72e9): 21/21.
- Task 2 RED (1c98bc1): `Cannot find module './eventsub-subscription.manager'`, so the suite failed. GREEN (cfc5350): 16/16; `src/eventsub` unit 10 suites / 193 tests.

## Verification

- Unit: 77 suites / 1065 tests (1028 + 21 + 16)
- Integration (`--runInBand`): 44 / 526, unchanged
- `npm run build`: exit 0
- Filtered lint: 0 lines; eslint is clean on all 4 files
- Acceptance greps: single-line `export function planReconciliation(` and `desiredSubscriptions(` found; `webhook_callback_verification_pending` appears once; `reward_id` does not appear in the implementation; spec has 14 `it(`/`it.each(`; `.unref()` and `clearInterval` appear once each; no `await` inside `onApplicationBootstrap`; `STREAMER_SCOPE_REMEDY` used; `config.secret` appears only in the transport; no `@nestjs/schedule`; no forbidden literals under `src/eventsub/subscriptions`.

## Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 76deaed | test(eventsub): specify the subscription reconciliation plan |
| 1 GREEN | 5bc72e9 | feat(eventsub): plan the EventSub subscription reconciliation |
| 2 RED | 1c98bc1 | test(eventsub): specify the subscription manager lifecycle |
| 2 GREEN | cfc5350 | feat(eventsub): reconcile EventSub subscriptions at boot and hourly |

## Deviations from Plan

1. **[Rule 3 - Blocking] Commit subject shortened.** The planned subject `feat(eventsub): reconcile EventSub subscriptions at boot, hourly and on demand` is 78 characters, over the 72-character limit. I used `... at boot and hourly`; the commit body describes the on-demand single flight.
2. **[Rule 1 - Lint] Enum comparison warning.** Comparing `type: string` with `EventSubSubscriptionType.redemptionAdd` triggered `@typescript-eslint/no-unsafe-enum-comparison`. I fixed it with a module constant `REDEMPTION_TYPE: string` before committing, so the behavior is unchanged.

## Known Stubs

None. The manager is not registered in a module yet; plan 06-07 does that.

## Self-Check: PASSED

- FOUND: src/eventsub/subscriptions/plan-reconciliation.ts, plan-reconciliation.spec.ts, eventsub-subscription.manager.ts, eventsub-subscription.manager.spec.ts
- FOUND commits: 76deaed, 5bc72e9, 1c98bc1, cfc5350
