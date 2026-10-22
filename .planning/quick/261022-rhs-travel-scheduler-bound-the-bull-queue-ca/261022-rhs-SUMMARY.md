---
phase: quick-261022-rhs
plan: 01
subsystem: travel
tags: [travel, bull, redis, timeout, resilience, observability]
requires: [TravelScheduler, FakeTravelQueue, TravelPlanningModule]
provides: [withinTimeout, QUEUE_CALL_TIMED_OUT, QUEUE_CALL_TIMEOUT_MS, QUEUE_CALL_TIMEOUT]
affects: [acceptQuest, startTravel, teleportCharacter]
tech-stack:
  added: []
  patterns: ["Promise.race against an unref'd timer with a sentinel, late rejection swallowed", "DI token for the timeout so tests inject 50 ms"]
key-files:
  created:
    - src/travel/queue-call-timeout.ts
    - src/travel/queue-call-timeout.spec.ts
  modified:
    - src/travel/travel-scheduler.service.ts
    - src/travel/travel-planning.module.ts
    - test/travel/fake-travel-queue.ts
    - src/travel/travel-planning.int-spec.ts
    - src/travel/travel.resolver.int-spec.ts
    - src/travel/teleport.resolver.int-spec.ts
    - src/quests/acceptance/accept-quest.resolver.int-spec.ts
    - .planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md
decisions:
  - "Timeout is a constant QUEUE_CALL_TIMEOUT_MS = 2000 behind the DI token QUEUE_CALL_TIMEOUT (no env variable)"
  - "Redis connection error logged once per process with error.code ?? error.name only, never error.message"
commits:
  - { hash: c2abfcc, type: test, message: "test(travel): bound queue calls with a timeout helper" }
  - { hash: 60e35ac, type: feat, message: "feat(travel): add the queue call timeout helper" }
  - { hash: 03f10c2, type: test, message: "test(travel): require bounded queue calls in the scheduler" }
  - { hash: 412c3a5, type: fix, message: "fix(travel): bound the travel queue calls with a timeout" }
  - { hash: e4a7973, type: test, message: "test(travel): answer the travel mutations with the queue hanging" }
  - { hash: 2c77334, type: docs, message: "docs(08): note the travel queue timeout for Redis outages" }
metrics:
  completed: 2026-10-22
  tasks: 3
  files: 10
---

# Quick 261022-rhs: bound the Bull queue calls of TravelScheduler

One-liner: `TravelScheduler.schedule`/`cancel` race every Bull call against a 2000 ms timer (`withinTimeout`), so with Redis down `acceptQuest`/`startTravel`/`teleportCharacter` still answer `successful: true` (travel stays valid, sweep/reconciler complete it per D-21/D-12/D-16), and a Redis connection error is WARNed once with its code only.

## Commits

| # | Hash | Commit |
|---|------|--------|
| 1 RED | c2abfcc | test(travel): bound queue calls with a timeout helper |
| 1 GREEN | 60e35ac | feat(travel): add the queue call timeout helper (+ FakeTravelQueue hangAdd/hangRemove/emit) |
| 2 RED | 03f10c2 | test(travel): require bounded queue calls in the scheduler (3 cases failed: 2x 5 s jest timeout, 1x no listener) |
| 2 GREEN | 412c3a5 | fix(travel): bound the travel queue calls with a timeout |
| 3 | e4a7973 | test(travel): answer the travel mutations with the queue hanging |
| 3 docs | 2c77334 | docs(08): note the travel queue timeout for Redis outages |

## What changed

- `src/travel/queue-call-timeout.ts`: `withinTimeout(call, ms)` returns the call result, propagates an in-time rejection, or resolves to the `QUEUE_CALL_TIMED_OUT` sentinel; attaches `call.catch` first (no unhandled rejection from a late settlement), unrefs and clears its timer. Exports `QUEUE_CALL_TIMEOUT_MS = 2_000` and the DI token `QUEUE_CALL_TIMEOUT`.
- `TravelScheduler`: injects the timeout; `schedule` wraps `queue.add`, `cancel` wraps the new private `removeJob` (`getJob` + `remove`); on timeout WARN `Accodamento del viaggio <jobId> non confermato entro <ms> ms: lo completerà lo sweep` / `Rimozione del job <jobId> non confermata entro <ms> ms: il job si neutralizza da solo`. Existing catch paths and messages unchanged. `onModuleInit` registers `queue.on('error')` → one WARN per process `Redis non raggiungibile (<code>): i job di viaggio partiranno al riconnesso, lo sweep copre`.
- `TravelPlanningModule`: provider `{ provide: QUEUE_CALL_TIMEOUT, useValue: QUEUE_CALL_TIMEOUT_MS }`.
- `FakeTravelQueue`: `hangAdd`/`hangRemove` flags (reset by `reset()`), `on` keeps a listener registry (not cleared by reset), `emit(event, ...args)`.
- Specs: 6 unit cases for the helper; 3 integration cases in `travel-planning.int-spec.ts` (hang add, hang remove, Redis WARN once without host/port); 3 wire cases (startTravel, teleportCharacter, acceptQuest) with the queue hanging and `QUEUE_CALL_TIMEOUT` = 50 ms.
- BACKEND-NOTES §6 (Redis irraggiungibile), §13 (Redis giù, WARN da monitorare), §14 (incidente UAT 2026-10-22).

## Gate (final)

- `npx jest src/travel --selectProjects unit`: 6 suites, 67 tests passed
- `npx jest src/travel src/quests/acceptance --selectProjects integration --runInBand`: 8 suites, 169 tests passed (166 before the 3 wire cases)
- `npm run build`: OK
- `git diff --exit-code src/schema.gql`: 0
- eslint and prettier --check on the 9 touched .ts files: clean
- package.json unchanged; no env variable added

## Deviations from Plan

- Task 1 verify step `npx tsc --noEmit -p tsconfig.json` cannot pass on this repo: it has a large pre-existing baseline (jest globals untyped in tsconfig.json, plus unrelated typing errors in older specs); error count identical before/after my change (5872 lines). Used `npm run build` + ts-jest compilation as the compile gate instead. Out of scope, not fixed.
- `void call.catch(...)` used (plan allowed the `void` prefix).
- Accept wire case asserts the pending quest via `pendingQuests.collection.findOne({ _id: raw.quests.pendingQuest })` → `startDate` null, plus `activeTravel` not null.

## Known Stubs

None.

## Self-Check: PASSED

All 6 commits present in `git log`; created files exist; tree clean (`git status --porcelain --untracked-files=no` empty).
