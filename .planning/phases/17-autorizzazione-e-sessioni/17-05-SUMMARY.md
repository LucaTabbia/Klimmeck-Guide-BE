---
phase: 17-autorizzazione-e-sessioni
plan: 05
subsystem: auth (revoca delle altre sessioni al login, prova di filo WS + HTTP)
tags: [auth, session, ws, BE-SESSION-02, BE-SESSION-03, D-02, D-03, D-04, D-05, D-07, D-12]
requires: ["17-04"]
provides:
  - "`AuthSessionService` con `constructor(sessionService, accessTokenService, loginTicketService, usersService, clock, revocation: SessionRevocationService)` (ultimo parametro nuovo, DI da `AuthModule`)"
  - "`issueForUser(user)`: `sessionService.create(user.id)` → `await revocation.revokeOthersOnLogin(user.id, sessionId)` → `buildSession`; errore della revoca propagato (D-12)"
  - "Spec di filo `test/auth/session-revocation.int-spec.ts` (describe `last login wins (wire)`, 7 casi) sull'harness `createAuthTestApp`"
affects: [17-06, 17-07, 17-08, 17-09, 17-10]
tech-stack:
  added: []
  patterns:
    - "Revoca dopo la creazione: la sessione nuova ha l'`_id` maggiore ed è esclusa dal filtro `_id` minore di `revokeOthersOf`"
    - "Prova negativa a finestra (`stateAfter(closed, 300)`) con timer sempre ripulito"
key-files:
  created:
    - test/auth/session-revocation.int-spec.ts
  modified:
    - src/auth/auth-session.service.ts
    - src/auth/auth-session.service.int-spec.ts
decisions:
  - "Nessun try/catch attorno a `revokeOthersOnLogin`: il login fallisce e la sessione orfana (nessun token consegnato) scade col TTL (D-12)"
  - "Il dev bypass non passa da `issueForUser` (nessuna revoca): provato sul filo con `{ me { id } }` col token dev"
metrics:
  duration: "~15 min"
  completed: 2026-11-09
  tasks: 3
  files: 3
---

# Phase 17 Plan 05: l'ultimo login caccia l'altro Summary

`AuthSessionService.issueForUser` crea la sessione nuova e poi chiama `SessionRevocationService.revokeOthersOnLogin(user.id, sessionId)`: le altre sessioni attive dell'utente sono revocate con `newLogin` e i loro socket vivi chiusi con `4409 newLogin`; la sessione nuova non è mai toccata; se la revoca fallisce il login fallisce. Una spec di filo prova il percorso completo su WS e HTTP. SDL invariato.

## Task

| Task | Nome | Commit | File |
|------|------|--------|------|
| 1 RED | cinque casi `login revokes the other sessions` | 38bf01f | src/auth/auth-session.service.int-spec.ts |
| 1 GREEN | revoca delle altre sessioni in `issueForUser` | 455fdf3 | src/auth/auth-session.service.ts |
| 2 | spec di filo «last login wins» (7 casi) | b46a8ff | test/auth/session-revocation.int-spec.ts |
| 3 | bookkeeping | (commit docs) | ROADMAP, STATE, VALIDATION, questo SUMMARY |

## RED osservato (Task 1)

jest integration: 3 falliti / 21 verdi su 24. Rossi: `a new login revokes the other active sessions of the user with newLogin (D-02)` e `never touches the session it has just created (D-02)` (la prima sessione restava attiva, `revokeReason` null), `fails the login when the revocation fails (D-12)` (la spia non veniva chiamata, il login riusciva). Verdi già al RED (comportamento negativo coincidente col codice vecchio, che non revocava nulla): `leaves the sessions of another user untouched (D-02)` e `keeps the reason of a session already revoked by a logout (D-02)`. tsc pulito anche al RED (la spec non tocca firme nuove).

## Task 2 verde al primo colpo

I sette casi sono passati al primo lancio: il comportamento è implementato dai piani 02–05 (servizio di sessione, registro, autenticatore WS, cablaggio del login) e qui è solo provato sul filo. Misurato: secondo login → socket della prima `{ code: 4409, reason: 'newLogin', acknowledged: true }`; `connection_init` col JWT della prima → `{ 4409, 'newLogin', false }`; refresh della prima → `data` null e `extensions` esattamente `{ code: 'SESSION_REVOKED', reason: 'newLogin' }`; `{ me { id } }` col JWT residuo → nessun errore e id dell'utente (D-04); sessione nuova con socket aperto e refresh riuscito; logout → socket vivo ancora aperto dopo 300 ms, poi `connection_init` → `{ 4409, 'userLogout', false }`; dev bypass → sessione reale con `revokedAt` e `revokeReason` null.

## Deviations from Plan

- **STATE.md:** scritto `Plan: 5 of 10` (formato reale del file, istruzione dell'orchestratore); il verify del Task 3 che cerca `Plan: 05 of 10` non trova riscontro.
- Nessun'altra deviazione; nessuna Rule 1–4 applicata. Nessun file toccato falliva `prettier --check`.

## Gate

- `npx tsc --noEmit -p tsconfig.json` 0 dopo ogni task di codice.
- Unit `src/auth test/auth test/authz src/graphql`: 32 suite / 330 test verdi.
- Integration stesse cartelle: 16 suite / 228 test verdi (216 + 5 + 7). `src/users` integration: 5 suite / 38 test verdi.
- Prettier/eslint puliti sui tre file `.ts` toccati. `git diff origin/develop -- src/schema.gql` vuoto.

## Threat

T-17-18 (revoca `newLogin`, socket chiuso, `connection_init` e refresh rifiutati) e T-17-20 (sessione nuova mai toccata) provati dalla spec di filo e dai casi di servizio; T-17-19 accettato e provato dal caso D-04; T-17-21 errore propagato (caso D-12); T-17-22 nessun log nuovo.

## Self-Check: PASSED

- File: `src/auth/auth-session.service.ts`, `src/auth/auth-session.service.int-spec.ts`, `test/auth/session-revocation.int-spec.ts` presenti.
- Commit: 38bf01f, 455fdf3, b46a8ff presenti in `git log`.
