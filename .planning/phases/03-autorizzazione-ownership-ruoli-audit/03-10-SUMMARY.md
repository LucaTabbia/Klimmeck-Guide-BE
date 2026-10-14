---
phase: 03-autorizzazione-ownership-ruoli-audit
plan: 10
subsystem: authz-phase-closure
tags: [authz, whitelist, schema-contract, handoff, tdd]
requires:
  - "03-05: characterUpdated contract, schema.gql assertions in test/app.int-spec.ts"
  - "03-06: ROLES_KEY / @Roles, users perimeter, user CRUD removed"
  - "03-07: @OwnsCharacter on 7 character handlers, characters innkeeper-only"
  - "03-08: @OwnsPendingQuest on pendingQuest, pendingQuests innkeeper-only"
  - "03-09: admin audit interceptor, probe resolver kept out of AppModule"
provides:
  - "collectHandlersWithMetadata(app, key, matcher?) scanner on the real AppModule"
  - "EXPECTED_INNKEEPER_HANDLERS (4) and EXPECTED_OWNERSHIP_HANDLERS (9) locked by real-boot tests"
  - "schema assertion: userUpdated, characterUpdated(id), no user CRUD, no AdminAuditLog, no adminProbe"
  - "final BACKEND-NOTES.md handoff to the FE (wire shapes, no-retry rule, answers 1-5, convention for BE Phases 7-9)"
affects: [BE Phases 7-9 (new admin/character operations must extend the whitelists), FE Phase 3]
tech-stack:
  added: []
  patterns:
    - "Enumerated whitelist per authorization metadata key, read from descriptors of every controller/provider in ModulesContainer"
key-files:
  created:
    - .planning/phases/03-autorizzazione-ownership-ruoli-audit/03-10-SUMMARY.md
  modified:
    - test/app.int-spec.ts
    - .planning/phases/03-autorizzazione-ownership-ruoli-audit/BACKEND-NOTES.md
decisions:
  - "The two existing schema tests (real-time contract, user CRUD removal) are merged into one 'keeps the real-time and authorization contract' test that also asserts no AdminAuditLog / adminProbe"
  - "Sensitivity proof done at runtime (Reflect.deleteMetadata in a throwaway copy of the spec) instead of editing src: the source-edit variant was blocked by the environment's permission classifier"
  - "The 03-07 'innkeeper malformed id' gap is documented as not present: isObjectIdHex runs before the innkeeper bypass in authorizeCharacter/authorizePendingQuest (covered by the policy unit spec), so a malformed id is NOT_FOUND for every role"
metrics:
  duration: ~20min
  completed: 2026-10-14
  tasks: 2
  files: 2
---

# Phase 3 Plan 10: Phase closure — enumerated protected handlers and FE handoff Summary

The real AppModule boot now pins down the authorization surface. `@Roles(innkeeper)` must sit on exactly 4 handlers and `@OwnsCharacter`/`@OwnsPendingQuest` on exactly 9; adding or removing a protection without updating the list fails the test. `src/schema.gql` shows no drift. `BACKEND-NOTES.md` is now the final FE handoff.

## Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Enumerated whitelists, final schema check, full gate | 55d49df | test/app.int-spec.ts |
| 2 | Final BACKEND-NOTES handoff | 86a0553 | BACKEND-NOTES.md |

## TDD / sensitivity proof (Task 1)

This is a lock test: the protections already exist (plans 03-05 to 03-08), so the new tests were green on the first run (14/14). As the RED equivalent, the plan asked for a sensitivity proof.
- **Planned method (blocked):** temporarily delete `@Roles(RoleType.innkeeper)` from `PendingQuestsResolver.pendingQuests` and `@OwnsCharacter` from `CharactersResolver.equipment`. The environment's permission classifier refused this edit ("Security Weaken").
- **Method used:** a throwaway copy of the spec (`test/zz-sensitivity-probe.int-spec.ts`, never committed, deleted right after) that, after `app.init()`, calls `Reflect.deleteMetadata(ROLES_KEY, PendingQuestsResolver.prototype.pendingQuests)` and `Reflect.deleteMetadata(OWNERSHIP_KEY, CharactersResolver.prototype.equipment)`. The scanner sees the same thing it would see if the decorators were missing.
- **Result:** 2 failed / 12 passed. `exposes exactly the enumerated innkeeper-only handlers` failed with diff `- "PendingQuestsResolver.pendingQuests"`, and `exposes exactly the enumerated ownership-protected handlers` failed with diff `- "CharactersResolver.equipment"`. Every other test stayed green. After the probe was deleted, `git status` showed only the intended change and `src/` was untouched.

## Verification

- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 14/14 passed. The public whitelist (`EXPECTED_PUBLIC_HANDLERS`, 5 handlers, no public class) is unchanged and still passes.
- `git diff --exit-code src/schema.gql`: exit 0, no drift. The last commit that touched the schema is still `298ed4b` (plan 03-06).
- `npm test` passed: unit 41 suites / 450 tests, integration 28 suites / 321 tests. No subscription timeout in this run (the 5000 ms WS helper flakiness seen in 03-05 did not show up).
- `npm run build`: exit 0
- `npx prettier --write` + `npx eslint test/app.int-spec.ts`: clean (prettier made no changes)
- Acceptance greps for Task 1: `const EXPECTED_INNKEEPER_HANDLERS` 1, `const EXPECTED_OWNERSHIP_HANDLERS` 1, `function collectHandlersWithMetadata` 1, handler literals 13, `not.toContain('createUser(')` 1
- Acceptance greps for Task 2: the verify command passes. The combined keyword count is 37 (needed ≥ 15). `userUpdated: User!` 3, `characterUpdated(id: String!): Character!` 3, `complete` present, `D-15` 1, numbered answers 13 (needed ≥ 5), `bozza` 0.
- No `Co-Authored-By` trailer on either commit (plan convention).

## Deviations from Plan

1. **[Rule 3 - Blocking] Sensitivity proof method.** See the TDD section. The plan said to edit the source decorators temporarily. That edit was denied by the permission classifier, so I used the runtime metadata deletion in a throwaway spec instead. It exercises the same detection path (the scanner reads `Reflect.getMetadata` on the handler), and the failures and diffs it produced are the ones the plan expected.
2. **[Boy Scout] Schema tests merged.** The existing `writes the real-time contract…` and `removes the user CRUD mutations…` tests were replaced by the single test the plan names, `keeps the real-time and authorization contract in the generated schema`. That test is a superset: it adds `AdminAuditLog` and `adminProbe`.
3. **[Refactor] Scanner shape.** `collectHandlersWithMetadata(app, key, matcher = isDefined)` takes an optional matcher, so the public scan keeps `=== true` semantics. Provider enumeration lives in `providerInstancesOf(app)`, which is shared with the public-class check.
4. **FE repo status check not run.** `git -C <FE repo> status` was refused by the worktree isolation guard. I only read FE files (with Read/grep) and wrote none.

## Notes for the verifier / open points

- **The 03-07 "innkeeper malformed id" gap does not hold.** In `CharacterAccessPolicy.authorizeCharacter` and `authorizePendingQuest`, `isObjectIdHex` is checked before the innkeeper bypass. `character-access.policy.spec.ts` checks that a malformed id is NOT_FOUND for the innkeeper as well, without reading the DB. So an innkeeper sending `'abc'` to a guarded character id gets `NOT_FOUND`, and BACKEND-NOTES says NOT_FOUND for every role. Secondary ids inside requests (for example `spellId`) are not checked by the guard. They go through the existing domain checks (`BadRequestException`), which are outside the authz contract.
- `src/auth/auth.resolver.int-spec.ts` "leaves non-auth errors without an auth code" now exercises FORBIDDEN instead of a not-found (noted in 03-06). It still passes and its intent holds. This is internal and not mentioned in the FE handoff.
- FE D-02 was already aligned with BE D-04 on 2026-10-14 (terminal rejection). BACKEND-NOTES still records the divergence from the original FE expectation, as the plan asked.

## Known Stubs

None.

## Threat Flags

None. The plan adds no runtime surface: it adds a test and documentation. T-03-18, T-03-14b, T-03-19, T-03-13f and T-03-SCHEMA are mitigated as planned.

## Self-Check: PASSED

- FOUND: test/app.int-spec.ts, BACKEND-NOTES.md, 03-10-SUMMARY.md
- FOUND: commits 55d49df, 86a0553
