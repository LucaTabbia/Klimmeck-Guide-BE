---
phase: 03-autorizzazione-ownership-ruoli-audit
verified: 2026-10-14T00:00:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 3: Autorizzazione, ownership, ruoli, audit - Verification Report

**Phase Goal:** L'autorizzazione e basata sull'identita autenticata: ownership sulle mutation, role guard sulle operazioni admin, subscription filtrate per identita, audit log admin persistente.
**Status:** passed (initial verification)

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Mutation su character altrui -> 403, owner ok, innkeeper esente e auditato | VERIFIED | `@OwnsCharacter` on doTransaction/equipItem/equipSpell/unequipSpell/useSpell (characters.resolver.ts); CharacterAccessPolicy returns owner/onBehalf/else AuthorizationException.notOwner (FORBIDDEN); interceptor audits onBehalf mutations. characters-ownership.int-spec passes. |
| 2 | Operazione admin da non-innkeeper -> 403 | VERIFIED | `@Roles(innkeeper)` on users, user, characters, pendingQuests; users-authz and pending-quests-authz int-specs pass. |
| 3 | characterUpdated / user stream solo owner/innkeeper | VERIFIED | `@OwnsCharacter` on the subscription plus per-event `mayReceiveCharacterEvent` filter (fail-closed); userUpdated filters on identity.userId and takes no args. |
| 4 | Audit persistente (who/what/when/target/args/outcome, TTL 90gg) | VERIFIED | AdminAuditLog model (collection admin_audit_logs, TTL index on `at`, 90 days); global APP_INTERCEPTOR AdminAuditInterceptor records ok and error outcomes; rejected attempts produce no record; admin-audit.int-spec passes. |
| 5 | userUpdated: User! senza argomenti, da change stream su users | VERIFIED | users.resolver.ts; user-updates.publisher.ts uses `userModel.watch`; schema.gql line 491; publisher and subscription int-specs pass. |
| 6 | Snapshot su subscribe, FORBIDDEN su id altrui, schema.gql committato | VERIFIED | `subscribeWithSnapshot` on both subscriptions; guard runs before snapshot; character-updated.subscription.int-spec passes; schema.gql clean per orchestrator. AdminAuditLog and the admin probe are absent from schema.gql. |

**Score:** 6/6

## Key Links

| From | To | Status |
|------|----|--------|
| Global AuthGuard (auth.module) | ownership/role guards | WIRED (guards run per method after it) |
| AuthzModule | APP_INTERCEPTOR audit | WIRED |
| Users change stream | pubSub 'userUpdated' | WIRED |

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| BE-AUTHZ-01 | SATISFIED | truth 1 |
| BE-AUTHZ-02 | SATISFIED | truth 2 |
| BE-AUTHZ-03 | SATISFIED | truth 3 |
| BE-AUTHZ-04 | SATISFIED | truth 4 |
| BE-SYNC-01 | SATISFIED | truth 5 |
| BE-SYNC-02 | SATISFIED | truth 6 |

All six IDs appear in REQUIREMENTS.md and map to Phase 3; no orphaned requirements. REQUIREMENTS.md checkboxes and traceability table still read Pending/unchecked: bookkeeping to update.

## Behavioral Spot-Checks

`npx jest --selectProjects integration --runInBand src/authz src/characters src/users src/pendingQuests`: 13 suites, 161 tests passed. Orchestrator gates (unit, integration, regression, schema diff, build) green.

## Anti-Patterns

None blocking. The 03-07 "innkeeper malformed id" gap does not exist: `authorizeCharacter` and `authorizePendingQuest` check `isObjectIdHex` before the innkeeper bypass, so 03-10 is right.

## Observations (non-blocking)

- Roadmap SC1 and the requirements name quest/travel mutations and admin CRUD (quest/enemies/POI/roads, teleport, approve/reject). Those GraphQL mutations do not exist in the codebase yet; only the existing character mutations and innkeeper-only queries are guarded. The mechanism (`@Roles`, `@OwnsCharacter`, audit interceptor) applies automatically to future ones. Not a Phase 3 gap, but later phases adding such mutations must apply the decorators.
- `createCharacter` takes identity from the bearer only (no id argument), so ownership does not apply.
- BACKEND-NOTES.md matches the code (FORBIDDEN, snapshot, innkeeper-only list, audit collection without GraphQL type).

## Human Verification Required

None.

_Verified by Claude (gsd-verifier)_
