---
phase: 03-autorizzazione-ownership-ruoli-audit
fixed_at: 2026-10-14T20:40:00Z
review_path: .planning/phases/03-autorizzazione-ownership-ruoli-audit/03-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Source review:** .planning/phases/03-autorizzazione-ownership-ruoli-audit/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

Each fix was written test-first (red observed, then green). Gates after the last commit: unit 41 suites / 453 tests, integration 28 suites / 322 tests, `nest build` OK.

## Fixed Issues

### WR-01: Fail-open latente: `authorize` senza `default` e guard che non verifica l'esito

**Files modified:** `src/authz/ownership/character-access.policy.ts`, `src/authz/ownership/ownership.guard.ts`, and their specs
**Commit:** 67af7f0
**Tests added:** `character-access.policy.spec.ts` (resource not covered throws "Risorsa non supportata dalla policy"); `ownership.guard.spec.ts` (policy resolving `undefined` is rejected, no on-behalf recorded)
**Applied fix:** `never`-typed `default` in `CharacterAccessPolicy.authorize`; `OwnershipGuard.canActivate` throws on any outcome that is neither owner nor onBehalf. Logic fix: requires human verification.

### WR-02: ObjectId hex accettati in maiuscolo ma confrontati case-sensitive

**Files modified:** `src/mongo/document-id.ts`, `src/mongo/document-id.spec.ts`
**Commit:** 3a0673b
**Tests added:** `document-id.spec.ts`: the uppercase sample `64B000000000000000000001` now expects `false`
**Applied fix:** fail-closed option, regex is `/^[0-9a-f]{24}$/` (canonical lowercase only). No normalisation layer, since the server emits lowercase ids and the client echoes them. Logic fix: requires human verification.

### WR-03: `user(id)` con id malformato risponde INTERNAL_SERVER_ERROR

**Files modified:** `src/users/users.service.ts`, `src/users/users-authz.int-spec.ts`
**Commit:** d13f33a
**Tests added:** `users-authz.int-spec.ts`: malformed id `'abc'` answers a typed NOT_FOUND (was a Mongoose CastError)
**Applied fix:** `UsersService.findOne` validates with `isObjectIdHex` and throws `ResourceNotFoundException.user()`.

### WR-04: `firstLive` resta senza handler nel ramo di fallimento dello snapshot

**Files modified:** `src/graphql/subscribe-with-snapshot.ts`, `src/graphql/subscribe-with-snapshot.spec.ts`
**Commit:** 7feaef2
**Tests added:** `subscribe-with-snapshot.spec.ts`: fake iterator whose first `next()` (and `return()`) rejects while the snapshot fails; asserts the snapshot error is rethrown and no `unhandledRejection` fires. Before the fix the test crashed the Node process.
**Applied fix:** no-op catch on `firstLive` in the failure path, `return()` rejection swallowed there, and the `stopped` chain ends with `.catch(() => undefined)`.

---

_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
