---
phase: 05-infrastruttura-push-fcm
plan: 08
subsystem: push
tags: [push, fcm, gate, handoff, backend-notes, traceability]
requires: ["05-01", "05-02", "05-03", "05-04", "05-05", "05-06", "05-07"]
provides:
  - "BACKEND-NOTES.md Phase 5: SDL verbatim, data example per PushEventType, iOS/Android caveats, Firebase checklist, FE flow, sendTestPush E2E recipe, codes, BE 6/8/9 notes, deploy/runtime"
  - "BE-NOTIF-01..03 marked Complete in REQUIREMENTS.md"
  - "spell-recovery.processor.int-spec.ts no longer leaks characters/spells into later suites"
affects: [FE Phase 5, BE Phase 6, BE Phase 8, BE Phase 9]
tech-stack:
  added: []
  patterns: ["suites that write through their own Nest connection clean up in afterEach (the global after-env cleanup only sees the global mongoose connection)"]
key-files:
  created:
    - .planning/phases/05-infrastruttura-push-fcm/BACKEND-NOTES.md
  modified:
    - .planning/REQUIREMENTS.md
    - src/characters/spell-recovery.processor.int-spec.ts
decisions:
  - "The order-dependent failure found by the gate is fixed in the suite that leaks data, not in the suite that fails"
  - "BACKEND-NOTES §8 quotes the multi-line Prettier-wrapped signatures of sendToUser/broadcast verbatim"
metrics:
  duration: 7 min
  completed: 2026-10-18
  tasks: 2
  files: 3
---

# Phase 5 Plan 08: Phase gate and push backend notes Summary

The whole phase is green end to end (66 unit suites / 807 tests, 43 integration suites / 515 tests, build, eslint and prettier on the 45 touched `.ts` files, no schema drift, no service account in git), and the FE Phase 5 and BE Phases 6/8/9 now have a complete handoff in `BACKEND-NOTES.md` with the SDL copied verbatim from `src/schema.gql` (commit `e12053b`). BE-NOTIF-01..03 are Complete in REQUIREMENTS.md.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | Regression, security and phase invariants gate | bebc3a2 (test isolation fix found by the gate) |
| 2 | BACKEND-NOTES.md + BE-NOTIF-01..03 traceability | cb28311 |

## Gate results (Task 1)

| Command | Result |
| ------- | ------ |
| `npm test` first run | unit 66/66 suites, 807/807 tests (2.7 s); integration **1 failed** / 42 passed suites, 514/515 tests (`spell-recovery.processor.cap.int-spec.ts › increments up to maxUsages`, E11000 on `character_name_active_ci_unique`) |
| `npm test` after fix | unit 66 suites / 807 tests (2.5 s); integration 43 suites / 515 tests (68.8 s); total 1 min 14 s; exit 0 |
| `npm run build` | exit 0 (5.2 s) |
| `npx eslint` on 45 `.ts` from `git diff --name-only --diff-filter=d develop...HEAD -- '*.ts'` | exit 0 |
| `npx prettier --check` on the same files | exit 0 |
| `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` then `git diff --exit-code src/schema.gql` | 20/20, exit 0; vs develop 33 lines added, 0 removed |
| `git ls-files \| grep -iE 'service-?account\|adminsdk'` | empty |
| `grep -rn "from 'firebase-admin'" src test` | empty |
| non-spec files mentioning `firebase-admin` | `src/push/transport/fcm-message.ts`, `src/push/transport/fcm-push-transport.ts`, plus `src/push/push.resolver.int-spec.ts` (a comment in a test file, not matched by the `\.spec\.ts` filter because of the `int-spec` name; no import) |
| `grep -rn "jest.mock" src/push test/push` | empty |
| `MessagingClientErrorCode\|MessagingErrorCode\|'messaging/unavailable'` in src | empty |
| `token\|deviceId` in `src/models/user.model.ts` | empty |
| `@Global` in src/push | only the comment "modulo foglia, non @Global" in `push.module.ts`; no decorator |
| `await ... pubSub.publish` | empty |
| `"node": ">=22"` / `"firebase-admin": "^14` in package.json | 1 line each |
| `Co-Authored-By` in `develop..HEAD` | 0 |

Phase footprint: 72 files changed vs develop (`git diff --name-only develop...HEAD`, before this plan's docs commit), of which 45 `.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, test isolation] Order-dependent integration failure**
- **Found during:** Task 1 (first `npm test`)
- **Issue:** `src/characters/spell-recovery.processor.int-spec.ts` (Phase 4, untouched by Phase 5) writes a `Test Hero` character through its own Nest-managed connection. The global `test/setup/after-env.ts` cleanup only empties collections of the global mongoose connection, so the character survived. When jest scheduled `spell-recovery.processor.cap.int-spec.ts` right after it, the first insert hit the unique `character_name_active_ci_unique` index.
- **RED:** reproduced deterministically with a scratch test sequencer that forces that order: 1 failed / 9 passed. Without forcing the order the cap suite passes alone (3/3 runs), which is why earlier plans did not see it.
- **Fix:** `afterEach` in the leaking suite deletes characters and spells through its own models. **GREEN:** forced order 10/10, then full `npm test` exit 0.
- **Files modified:** `src/characters/spell-recovery.processor.int-spec.ts`
- **Commit:** bebc3a2 (`test(characters)`: test-only change, so `test` instead of the plan's `fix` type)

### Notes

- The `registerDevice`/`sendTest`/`sendToUser` one-line signature greps return 0 because Prettier wraps them, as anticipated by 05-05; BACKEND-NOTES §8 quotes `sendToUser` and `broadcast` verbatim in multi-line form.
- BACKEND-NOTES has a 12th section (`## 11. Verifica`) with the gate numbers and the deviations of plans 05-01..05-08, as requested by the orchestrator.
- The FE repo was only read (§4 of its Phase 4 BACKEND-NOTES); `git status --porcelain` there is unchanged.

## Known Stubs

None.

## Threat Flags

None. T-05-39 (no service account in git), T-05-40 (schema drift 0), T-05-41 (§8 "after the commit, never inside `connection.transaction`", catalog builders only), T-05-42 (§9 production requires `FIREBASE_SERVICE_ACCOUNT` before deploy) and T-05-43 (`BEGIN PRIVATE KEY` count 0 in the notes) are mitigated as planned.

## Self-Check: PASSED

- FOUND: .planning/phases/05-infrastruttura-push-fcm/BACKEND-NOTES.md
- FOUND: src/characters/spell-recovery.processor.int-spec.ts
- FOUND: bebc3a2, cb28311
