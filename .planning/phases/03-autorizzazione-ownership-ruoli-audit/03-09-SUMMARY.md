---
phase: 03-autorizzazione-ownership-ruoli-audit
plan: 09
subsystem: authz-audit
tags: [authz, audit, interceptor, ttl, mongoose, tdd]
requires:
  - "03-02: readRequestIdentity, ResourceNotFoundException (extensions.code)"
  - "03-04: AuthorizationDecisions.onBehalfTargetOf(info), AuthzModule"
  - "03-06: ROLES_KEY / @Roles"
  - "03-07: on-behalf path live on character mutations"
  - "03-08: AuthzModule registers PendingQuest"
provides:
  - "AdminAuditLog model (collection admin_audit_logs, AuditActor/AuditTarget sub-schemas, TTL 90 days on at), no GraphQL type"
  - "AdminAuditLogService.record(entry): best-effort, never throws, never logs args"
  - "AdminAuditInterceptor (APP_INTERCEPTOR in AuthzModule): records only Mutation with @Roles(innkeeper) or an on-behalf decision; outcome 'ok' or error code"
  - "outcomeCodeOf(error): extensions.code -> HttpStatus name -> INTERNAL_SERVER_ERROR"
  - "AppModule imports AuthzModule explicitly"
  - "test/authz/admin-probe.resolver.ts: test-only @Roles mutations/query"
affects: [03-10]
tech-stack:
  added: []
  patterns:
    - "Global interceptor that self-filters to GraphQL mutations; guards run first so rejected attempts are never audited"
    - "Audit write awaited inside the rxjs pipeline (concatMap) before returning the unchanged result / rethrowing the same error instance"
    - "Dedicated Mongoose sub-schema for objects with a `type` key (Pitfall 10)"
key-files:
  created:
    - src/authz/audit/admin-audit-log.model.ts
    - src/authz/audit/admin-audit-log.service.ts
    - src/authz/audit/admin-audit-log.service.spec.ts
    - src/authz/audit/admin-audit.interceptor.ts
    - src/authz/audit/admin-audit.interceptor.spec.ts
    - src/authz/audit/admin-audit.int-spec.ts
    - test/authz/admin-probe.resolver.ts
  modified:
    - src/authz/authz.module.ts
    - src/app.module.ts
decisions:
  - "AdminAuditLogDocument typed as HydratedDocument<AdminAuditLog> (same style as Session) instead of `AdminAuditLog & Document`"
  - "Mutations without an authenticated identity are never audited (pendingEntryOf returns null): the global AuthGuard already rejects them, this keeps the interceptor fail-safe"
  - "The int-spec resolves the audit model with a fallback registration (connection.models[name] ?? connection.model(name, schema)) so RED fails on missing records rather than on MissingSchemaError"
metrics:
  duration: ~20min
  completed: 2026-10-14
  tasks: 3
  files: 9
---

# Phase 3 Plan 09: Admin audit log Summary

Every GraphQL mutation decorated with `@Roles(innkeeper)`, and every player mutation the innkeeper runs on another player's character, now writes one record to `admin_audit_logs`. The record holds actor `{ userId, twitchId, role }`, action, target `{ type, id }`, the full args and the outcome (`ok` or the error code). The collection has a 90-day TTL index. The write is best-effort: if it fails, the error is logged and the operation's result does not change. The audit has no GraphQL type, so `src/schema.gql` is unchanged.

## Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | AdminAuditLog model (TTL 90 days) + best-effort AdminAuditLogService | 992eba0 | admin-audit-log.model.ts, admin-audit-log.service.ts, admin-audit-log.service.spec.ts |
| 2 | AdminAuditInterceptor + outcomeCodeOf | ff7916e | admin-audit.interceptor.ts, admin-audit.interceptor.spec.ts |
| 3 | Wiring (APP_INTERCEPTOR, AppModule) + wire int-spec with probe resolver | 06c37fb | authz.module.ts, app.module.ts, admin-audit.int-spec.ts, test/authz/admin-probe.resolver.ts |

## TDD

- **Task 1 RED:** `npx jest src/authz/audit --selectProjects unit` failed with "Cannot find module 'src/authz/audit/admin-audit-log.model'". GREEN: 5/5.
- **Task 2 RED:** `npx jest src/authz/audit/admin-audit.interceptor.spec.ts --selectProjects unit` failed with "Cannot find module 'src/authz/audit/admin-audit.interceptor'". On the first GREEN run one test failed because of a bug in the test itself. The `graphqlContext` helper had a default parameter, so passing `undefined` for "no identity" still sent `OSTE`. I changed the sentinel to `null`, and all 73 tests in `src/authz` unit passed. The interceptor spec has 13 `it`/`it.each` blocks.
- **Task 3 RED:** `npx jest src/authz/audit/admin-audit.int-spec.ts --selectProjects integration --runInBand` gave 5 failures and 6 passes out of 11. The cases that should create a record had none: on-behalf equipItem, on-behalf unequipSpell NOT_FOUND, adminProbeSucceed and adminProbeFail. The write-failure case also failed because the logger was never called. The 6 "no record" cases and the TTL index check already passed, which is expected because no interceptor was registered yet. GREEN: 11/11.
- **REFACTOR:** no separate refactor step. The only extra edit was lint cleanup of the probe resolver: the `id` args are now used, so the unused-var warnings are gone.

## Verification

- `npx jest src test --selectProjects integration --runInBand`: 28 suites, 320/320 (includes `test/app.int-spec.ts` real boot)
- `npx jest src --selectProjects unit`: 40 suites, 438/438
- `git diff --exit-code src/schema.gql`: exit 0; no `AdminAuditLog`/`adminAuditLogs` in schema.gql
- `npx tsc --noEmit -p tsconfig.build.json`: exit 0
- eslint + prettier clean on all 9 touched files
- `grep -rn "admin-probe\|AdminProbeResolver" src`: only `src/authz/audit/admin-audit.int-spec.ts`
- `git log --format=%B -n 3 | grep -ci co-authored-by`: 0

## Deviations from Plan

### Formatting-induced acceptance grep mismatch (no behaviour change)

- Prettier wraps `AdminAuditLogSchema.index({ at: 1 }, { expireAfterSeconds: ADMIN_AUDIT_LOG_TTL_SECONDS });` onto 4 lines, so the plan's single-line grep finds nothing. `expireAfterSeconds: ADMIN_AUDIT_LOG_TTL_SECONDS` is still on one line, so the artifact `contains` check passes. I kept Prettier's formatting, as in the earlier plans.

### Minor additions

- Interceptor spec: two extra cases beyond the plan. A mutation with no identity is not recorded, and `outcomeCodeOf` falls back to INTERNAL_SERVER_ERROR for `null` and for string errors.
- Probe resolver: `adminProbeSucceed` returns `id.length > 0` and `adminProbeFail` throws `` `boom ${id}` ``. This clears the eslint no-unused-vars warnings on `_id`, and the wire behaviour is the same (`true` / INTERNAL_SERVER_ERROR).
- The innkeeper fixture in the int-spec has its own character (`withCharacter` defaults to true). Case 2 needs this: the innkeeper acting on their own character → 0 records.

## Known Stubs

None.

## Threat Flags

None. The new surface (`admin_audit_logs` collection, global interceptor) is covered by T-03-06, T-03-07, T-03-07b, T-03-15, T-03-13e and T-03-14 in the plan's threat register.

## Self-Check: PASSED

- FOUND: all 7 created files and 2 modified files
- FOUND: commits 992eba0, ff7916e, 06c37fb
