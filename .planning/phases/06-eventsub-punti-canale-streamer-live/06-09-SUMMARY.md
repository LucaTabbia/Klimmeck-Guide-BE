---
phase: 06-eventsub-punti-canale-streamer-live
plan: 09
subsystem: eventsub
tags: [eventsub, twitch, gate, handoff, backend-notes, human-uat, traceability]
requires: ["06-01", "06-02", "06-03", "06-04", "06-05", "06-06", "06-07", "06-08"]
provides:
  - "Phase gate green: unit 79/1098, integration 46/550, build, filtered lint 0, eslint + prettier on 53 touched .ts, schema.gql unchanged, phase invariants"
  - "BACKEND-NOTES.md Phase 6 (§0..§11): webhook, modes, ops checklist (incl. FCM topic IAM role), ledger, logs, Twitch CLI recipe, C4 fallback, limits, deploy, deviations, UAT outcome"
  - "06-HUMAN-UAT.md: test 1 (Twitch CLI local) passed, tests 2-3 (E2E managed, C4) skipped and deferred to pre-production"
  - "BE-POINTS-01..03 Complete in REQUIREMENTS.md"
  - "Phase 5 05-HUMAN-UAT.md: Android item passed (FE Phase 5 UAT 2026-10-20), iOS still pending"
affects: [FE Phase 6+, BE Phase 10, ops pre-production]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/06-eventsub-punti-canale-streamer-live/BACKEND-NOTES.md
    - .planning/phases/06-eventsub-punti-canale-streamer-live/06-HUMAN-UAT.md
  modified:
    - .planning/phases/06-eventsub-punti-canale-streamer-live/06-VALIDATION.md
    - .planning/phases/05-infrastruttura-push-fcm/05-HUMAN-UAT.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "06-HUMAN-UAT.md stays status: partial: the GSD UAT template uses partial while unresolved skipped tests remain, and tests 2-3 are mandatory before production"
  - "E2E managed (test 2) and C4 (test 3) deferred to pre-production for lack of an HTTPS tunnel; no gap opened (deferred by environment, not failed)"
  - "Phase 5 UAT test split into Android (passed via FE Phase 5 UAT 2026-10-20) and iOS (pending)"
  - "Every environment needs the Firebase service account role roles/firebasecloudmessaging.admin for FCM topic subscriptions (roles/firebasenotifications.admin is not enough)"
metrics:
  duration: 25 min (Tasks 1-2 on 2026-10-19, Task 3 on 2026-10-20 after the checkpoint)
  completed: 2026-10-20
  tasks: 3
  files: 8
---

# Phase 6 Plan 09: Phase gate, EventSub handoff and human UAT Summary

The whole of Phase 6 is green end to end, the FE/ops handoff is in `BACKEND-NOTES.md`, and the local Twitch CLI UAT passed on 2026-10-20 with HTTP + DB evidence and a real `streamerLive` push received on the user's Android device. The E2E test against real Twitch (managed mode) and the C4 check are deferred to pre-production because no HTTPS tunnel was available. BE-POINTS-01..03 are Complete.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Regression gate, lint, schema and invariants | none (everything green, nothing to change) |
| 2 | BACKEND-NOTES (§0..§10), 06-HUMAN-UAT (3 pending tests), 06-VALIDATION, STATE | 33c14a2 |
| 3 | Human UAT verdict, traceability and bookkeeping | recorded in the `docs(phase-6): record the EventSub human UAT outcome` commit |

## Gate results (Task 1)

| Check | Result |
| ----- | ------ |
| `npm run test:unit` | 79 suites / 1098 tests |
| `npm run test:int` | 46 suites / 550 tests (74 s) |
| `npm run build` | exit 0 |
| `git diff --exit-code src/schema.gql` | exit 0 (D-16) |
| filtered lint | 0 lines |
| `eslint` + `prettier --check` on the 53 touched `.ts` | clean |
| `^\s*@Public\(\)` in `src/eventsub` | 1 (controller:12), literal count 1 |
| `timingSafeEqual(` | 1 |
| `JSON.` in signature/controller/service | none |
| `void this.push.broadcast(streamerLive())` / `await this.push` | 1 / none |
| `$inc`, `findOrCreateByTwitchId`, `admin_audit`, `jest.mock(` in eventsub | none |
| `channel:manage:redemptions`, `TWITCH_REWARD_ID` in src and `.env.example` | none |
| `package.json` / lockfile | unchanged |
| `.env.example` | no values |
| whitelist `'EventSubController.receive',` | 1 |
| `NestFactory.create(AppModule, { rawBody: true })` | 1 |
| Co-Authored trailers on the branch | 0 |

Baseline at phase start: unit 66 / 810, integration 43 / 515.

## Human UAT (Task 3, 2026-10-20)

Run by the orchestrator at 19:59 local time with the user's authorization, Twitch CLI 1.1.24 against the local BE in `local` mode, the user's Twitch account as viewer (`twitchId 113928494`, `twitchPoints` 0 before). The DB was read with mongoose before and after. **The BE log lines stayed in the user's terminal and were not read by the orchestrator**, so the expected LOG/WARN/ERROR lines are not verified.

| Test | Result | Evidence |
| ---- | ------ | -------- |
| 1. Twitch CLI local | passed | a) challenge: three ✔ (200, `text/plain; charset=utf-8`, challenge echoed); b) redemption 250 `-I dup-1` → 204, `twitchPoints` 0 → 250, one `credited` document; c) same `-I dup-1` → 204, balance unchanged, no new document; d) old timestamp → 403; e) wrong secret → 403 (no document, balance unchanged in both); f) `stream.online` → 204, `broadcast` document, **`streamerLive` push received on the real Android device** via topic `streamer-live` 1 s after the event; g) `authorization_revoked` → 204 (ERROR line with the remedy not checked in the log). Final state: `twitchPoints=250`, 2 documents in `eventsub_messages` |
| 2. E2E real Twitch (managed) | skipped | no HTTPS tunnel in this session; mandatory before production (BACKEND-NOTES §3) |
| 3. C4 streamer token revoke | skipped | depends on test 2; conditional `revokeQuietly` fallback documented in BACKEND-NOTES §7 |

`06-HUMAN-UAT.md` frontmatter stays `status: partial`. The template's `complete` would apply only if no skipped test were left unresolved, and the BE Phase 5 UAT uses `partial` in the same situation. `## Gaps` lists no gap and has a "Deferred to pre-production" note for tests 2-3.

## Other bookkeeping

- `BACKEND-NOTES.md` §3: new ops item for the FCM topic IAM permission, resolved on 2026-10-20 with **Firebase Cloud Messaging API Admin** (`roles/firebasecloudmessaging.admin`). It warns that the similarly named "Firebase Cloud Messaging Admin" (`roles/firebasenotifications.admin`) is not enough, and mentions the `subscribeToTopicLegacy` fallback until 2027-09-29. A second new item covers the pre-production E2E/C4 tests. New §11 records the UAT outcome.
- `.planning/phases/05-infrastruttura-push-fcm/05-HUMAN-UAT.md`: the single test is split into Android (`passed`, citing the FE Phase 5 UAT of 2026-10-20, 10/10) and iOS (`pending`). Summary total 2 / passed 1 / pending 1, `status: partial` kept.
- `06-VALIDATION.md`: 06-09-T3 → ✅ green (manual, verdict recorded).
- `REQUIREMENTS.md`: BE-POINTS-01..03 `[x]` and `| Phase 6 | Complete |`.
- `ROADMAP.md`: progress row 6 → 9/9 In Progress (the orchestrator ticks the phase bullet on closure).

## Phase overview (06-01..06-08)

- 06-01: three-mode fail-closed EventSub config (disabled/local/managed), `TWITCH_LOGIN_SCOPES`, shared URL rules.
- 06-02: pure webhook functions (headers, HMAC over raw bytes + replay window, typed notification parsing), signed fixtures.
- 06-03: `eventsub_messages` ledger with dedup indexes and TTL, `PointsCreditService` in one transaction with `WalletService`.
- 06-04: Helix client port, app access token cache, HTTP client with timeouts, pagination cap and 401 retry.
- 06-05: pure reconciliation plan and `EventSubSubscriptionManager` (boot, hourly, on revocation).
- 06-06: `EventSubWebhookService` routing with a discriminated reply, fire-and-forget `streamerLive` broadcast, boot reporter.
- 06-07: thin controller, `EventSubModule`, wire proof (concurrent deliveries → one credit).
- 06-08: module mounted in `AppModule`, `rawBody: true`, 6-entry public whitelist, schema unchanged.

## Deviations from Plan

None in code: this plan changed no source file. Task 3 only recorded the human verdict. Tests 2-3 of the UAT are deferred to pre-production rather than passed or failed, so the C4 gap-closure is neither opened nor ruled out. Following the orchestrator's instructions, the Task 3 commit also includes the Phase 5 UAT closure for Android and the IAM ops note, which go beyond the plan's `<files>` list.

## Known Stubs

None.

## Threat Flags

None. T-06-43/44 are mitigated by the Task 1 gate, T-06-45/46/48 by BACKEND-NOTES §3 (no secret values in the documents). T-06-47 (C4) is still open until test 3 runs before production. Its fallback is documented.

## Self-Check: PASSED

- FOUND: .planning/phases/06-eventsub-punti-canale-streamer-live/BACKEND-NOTES.md
- FOUND: .planning/phases/06-eventsub-punti-canale-streamer-live/06-HUMAN-UAT.md
- FOUND: 33c14a2
- `grep -c 'result: \[pending\]' 06-HUMAN-UAT.md` = 0
