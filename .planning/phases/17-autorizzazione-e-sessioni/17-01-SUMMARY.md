---
phase: 17-autorizzazione-e-sessioni
plan: 01
subsystem: auth (contratto del motivo di revoca) + graphql (formatter degli errori)
tags: [auth, session, graphql, BE-SESSION-03, D-05, D-08, D-11, D-13]
requires: []
provides:
  - "`SessionRevokeReason` { newLogin, roleChanged, reuseDetected, userLogout } in src/auth/session/session-revoke-reason.enum.ts (non registrato in GraphQL)"
  - "`Session.revokeReason: SessionRevokeReason | null` (default null, enum dello schema) in src/auth/session/session.model.ts"
  - "`AuthExceptionExtensions { code; reason? }`, `AuthException.sessionRevoked(reason: SessionRevokeReason | null = null)` in src/auth/auth.exception.ts"
  - "`extensionsOf` (privata) in src/graphql/format-domain-error.ts, `reasonOf` (privata) in src/graphql/production-errors.ts: allowlist della sola chiave `reason` stringa"
  - "`buildSession()` con `revokeReason: null` in test/fixtures/session.fixture.ts"
affects: [17-02, 17-03, 17-04, 17-05, 17-06, 17-07, 17-08, 17-09, 17-10]
tech-stack:
  added: []
  patterns:
    - "Allowlist di una chiave nelle extensions degli errori, mai lo spread delle extensions originali"
    - "Enum stringa nullable su un `@Prop` con `enum: Object.values(...)` e `default: null`"
key-files:
  created:
    - src/auth/session/session-revoke-reason.enum.ts
    - src/auth/session/session.model.spec.ts
  modified:
    - src/auth/session/session.model.ts
    - test/fixtures/session.fixture.ts
    - src/auth/auth.exception.ts
    - src/auth/auth.exception.spec.ts
    - src/graphql/format-domain-error.ts
    - src/graphql/format-domain-error.spec.ts
    - src/graphql/production-errors.ts
    - src/graphql/production-errors.spec.ts
decisions:
  - "`DomainExtensions` è un type alias e non un'interface: un'interface non è assegnabile a `GraphQLFormattedErrorExtensions` (index signature implicita mancante, errore tsc TS2322)"
  - "Il costruttore privato di `AuthException` riceve `reason` come terzo parametro opzionale; il body Nest passato a `super` non cambia"
metrics:
  duration: "~15 min"
  completed: 2026-11-09
  tasks: 3
  files: 10
---

# Phase 17 Plan 01: contratto del motivo di revoca Summary

Enum `SessionRevokeReason` a quattro valori fuori dallo schema GraphQL, campo additivo e nullable `Session.revokeReason`, `AuthException.sessionRevoked(reason)` con `extensions: { code, reason }` (body Nest invariato) e la sola chiave `reason` stringa conservata da `formatDomainError` e `sanitizeFormattedError` (sviluppo e produzione, HTTP e WS). SDL invariato.

## Commit

- `0900d9b` test(auth): pin the session revoke reason contract (RED)
- `4a9a2f4` feat(auth): add the session revoke reason to sessions and errors (GREEN)
- `3089ce4` test(auth): pin the revoke reason through the error formatters (RED)
- `66902f9` feat(auth): keep the revoke reason through the error formatters (GREEN)

## RED osservati

- Task 1: entrambe le suite (`session.model.spec.ts`, `auth.exception.spec.ts`) non partono: «Could not locate module src/auth/session/session-revoke-reason.enum» (modulo dell'enum assente), come atteso.
- Task 2: 4 casi rossi (`keeps the revoke reason of a wrapped AuthException`, `keeps only the reason among the extensions of a coded exception`, `keeps the revoke reason of a coded error`, `keeps the revoke reason over graphql-ws in production`): i formatter riscrivevano `extensions` come `{ code }`.
- Verdi al primo colpo (attesi, sono prove di assenza che il comportamento precedente già soddisfaceva): `drops a reason that is not a string (D-13)`, `drops the reason of an internal error (D-13)`, `drops a revoke reason that is not a string (D-13)`.

## Note

- Il cast `as unknown as SessionRevokeReason` nel caso «rejects a value outside the enum» non serve: `buildSession` accetta `Record<string, any>`.
- Il caso del motivo nell'eccezione è un `it.each` sui quattro valori dell'enum (titolo con `(D-05): %s`).
- Prettier spezza il `@Prop` di `revokeReason` su più righe; i grep di accettazione (`revokeReason: SessionRevokeReason | null`, `Object.values(SessionRevokeReason)`) restano a 1.
- Il caso esistente `it.each` di `sessionRevoked()` resta verde senza modifiche.

## Deviations from Plan

1. **[Rule 3 - Blocco] `DomainExtensions` come type alias** — Found during: Task 2. Issue: con `interface DomainExtensions` tsc fallisce (TS2322, index signature mancante verso `GraphQLFormattedErrorExtensions`). Fix: `type DomainExtensions = { code: string; reason?: string }` con commento del perché. Files: src/graphql/format-domain-error.ts. Commit: `66902f9`.
2. **Bookkeeping: `Plan: 1 of 10`** in STATE.md (formato del brief dell'orchestratore e della riga esistente `Plan: 0 of 10`) invece di `Plan: 01 of 10` scritto nel piano: il verify automatico del Task 3 che cerca `Plan: 01 of 10` non combacia per questo motivo.
3. VALIDATION: la riga `17-01-01` aveva la colonna file `❌ W0`, portata a `✅` (la spec ora esiste).

## Gates

- `npx tsc --noEmit -p tsconfig.json`: 0
- `npx jest src/auth/session/session.model.spec.ts src/auth/auth.exception.spec.ts test/fixtures/fixtures.spec.ts --selectProjects unit`: 3 suite, 36 test verdi
- `npx jest src/graphql --selectProjects unit`: 7 suite, 67 test verdi
- Controllo di wave `npx jest src/auth test/auth test/authz src/graphql --selectProjects unit`: 31 suite, 315 test verdi
- prettier `--write` + eslint puliti sui 10 file `.ts` toccati
- `git diff --exit-code src/schema.gql` 0; nessun diff rispetto a `origin/develop`

## Self-Check: PASSED
