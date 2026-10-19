---
phase: 06-eventsub-punti-canale-streamer-live
plan: 08
subsystem: eventsub
tags: [eventsub, twitch, webhook, app-module, rawbody, real-boot, whitelist]
requires:
  - "06-01: EVENTSUB_CONFIG, EventSubConfig, the four EventSub variables cleared in the real boot"
  - "06-06: EventSubStartupReporter (WARN `EventSub disabled` at boot)"
  - "06-07: EventSubModule, EventSubController.receive (public handler only), harness with rawBody"
provides:
  - "src/app.module.ts: EventSubModule mounted right after PushModule"
  - "src/main.ts: NestFactory.create(AppModule, { rawBody: true })"
  - "test/app.int-spec.ts: 6-entry @Public whitelist with EventSubController.receive, real boot with rawBody, disabled-mode proofs (no twitch.tv fetch, boot WARN, 403, no GraphQL surface)"
affects: [06-09]
tech-stack:
  added: []
  patterns:
    - "passthrough spies on global fetch and Logger.prototype.warn installed before the AppModule boot, restored in afterAll"
key-files:
  created: []
  modified:
    - test/app.int-spec.ts
    - src/app.module.ts
    - src/main.ts
decisions:
  - "The real boot mirrors main.ts with createNestApplication({ rawBody: true }), so the HMAC path in tests runs on the same body parsing as production"
  - "The fetch spy is a passthrough, not a mock: the test proves that no call reaches twitch.tv, it does not hide one"
metrics:
  duration: 5 min
  completed: 2026-10-19
---

# Phase 6 Plan 08: Mount EventSub in the real AppModule Summary

The real `AppModule` now imports `EventSubModule`, and `main.ts` creates the app with `rawBody: true`. The real-boot test checks a 6-entry `@Public` whitelist that includes `EventSubController.receive`. With the EventSub variables empty, it also checks that EventSub resolves to `disabled` with the boot WARN, that no `fetch` goes to twitch.tv, that the webhook answers 403 with an empty body, and that `src/schema.gql` does not change.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Real-boot whitelist and EventSub disabled-mode assertions | 05bd393 | test/app.int-spec.ts |
| 1 (GREEN) | Mount EventSubModule, rawBody in main.ts and the real boot | 1f4855f | src/app.module.ts, src/main.ts, test/app.int-spec.ts |
| 2 | Full regression after mounting | none (all green, no change needed) | - |

## RED output (Task 1)

`npx jest test/app.int-spec.ts --selectProjects integration --runInBand`, before mounting the module: 3 failed, 20 passed, 23 total.

- `boots EventSub disabled without calling Twitch`: `Nest could not find EVENTSUB_CONFIG element (this provider does not exist in the current context)`
- `rejects EventSub webhook calls while EventSub is disabled`: `Expected: 403, Received: 404`
- `exposes exactly the enumerated @Public handlers and no public class`: `- Expected - 1 / + Received + 0` (`EventSubController.receive` missing)

`adds no GraphQL surface for EventSub` already passed before the module was mounted, as expected. It guards against regressions (D-16) and does not drive the RED.

## GREEN and gates

- Real boot: 23/23 passed. `git diff --exit-code src/schema.gql` exit 0 (D-16: no GraphQL surface added).
- `npm run test:unit`: 79 suites, 1098 tests passed (unchanged), about 3 s.
- `npm run test:int`: 46 suites, 550 tests passed (547 + 3 new real-boot tests), about 73 s.
- `npm run build`: exit 0. `git diff --exit-code src/schema.gql` is still 0 after the full suite.
- Filtered lint `npx eslint "{src,apps,libs,test}/**/*.ts" --quiet | grep -E "^\s+[0-9]+:[0-9]+" | grep -vE "prettier/prettier|prefer-const"`: 0 lines.
- Phase gates on `src/eventsub`: `^\s*@Public\(\)` = 1, literal `@Public()` = 1, `await this.push` = 0.
- Acceptance greps: `'EventSubController.receive',` 1, `NestFactory.create(AppModule, { rawBody: true })` 1, `createNestApplication({ rawBody: true })` 1, `EventSubModule,` 1, `fetchSpy.mock.calls` 1, `EventSub disabled` 1.

## Deviations from Plan

1. **Commit scope.** The plan suggested `test(test): ...`. I followed the orchestrator's convention and used `test(app): require the EventSub webhook in the public whitelist`. The GREEN commit uses the planned `feat(eventsub): ...` subject.

Otherwise, the plan was executed as written. Task 2 found no regressions, so it has no commit.

## Notes for 06-09 handoff

- From 06-07: on a 413, Nest's `ExceptionsHandler` logs `PayloadTooLargeError` with its stack. This is how the framework handles body-parser errors on every JSON route, and the log contains no secret. It is worth a mention under Pitfall 16, but nothing needs fixing.
- The webhook route is now live in the real process. Without configuration it answers 403 and makes no Helix calls.

## Threat Flags

None. The only new surface is `POST /webhooks/twitch/eventsub` in production, which is already covered by T-06-39..T-06-42 and checked by the real-boot test.

## Self-Check: PASSED

- FOUND: src/app.module.ts, src/main.ts, test/app.int-spec.ts
- FOUND: 05bd393, 1f4855f
