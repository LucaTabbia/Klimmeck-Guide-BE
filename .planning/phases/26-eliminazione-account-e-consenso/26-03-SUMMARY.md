---
phase: 26-eliminazione-account-e-consenso
plan: 03
subsystem: auth
tags: [account-deletion, session-revocation, ws-4409, auth-guard]
requires: ["26-02"]
provides:
  - "SessionRevokeReason.accountDeleted"
  - "DeletedAccountRegistry (src/auth/session/deleted-account.registry.ts): mark(userId), isDeleted(userId), finestra = accessTokenTtlSeconds dal Clock"
  - "SessionService.revokeAllForAccountDeletionWithin(userId, session: ClientSession): Promise<string[]>"
  - "SessionRevocationService.revokeForAccountDeletionWithin(userId, session) e closeDeletedAccountSessions(userId, sessionIds)"
  - "AuthModule esporta SessionRevocationService (WsSessionRegistry e DeletedAccountRegistry restano interni)"
affects: [26-06, 26-08, 26-13, 26-14]
tech-stack:
  added: []
  patterns:
    - "revoca in transazione del chiamante, fan-out (socket + registro) solo dopo il commit"
    - "scadenza accorciata con l'operatore $min su expiresAt: mai allungata"
key-files:
  created:
    - src/auth/session/deleted-account.registry.ts
    - src/auth/session/deleted-account.registry.spec.ts
  modified:
    - src/auth/session/session-revoke-reason.enum.ts
    - src/auth/session/session.service.ts
    - src/auth/session/session.service.int-spec.ts
    - src/graphql/format-domain-error.spec.ts
    - src/auth/session/session-revocation.service.ts
    - src/auth/session/session-revocation.service.int-spec.ts
    - src/auth/guards/auth.guard.ts
    - src/auth/guards/auth.guard.spec.ts
    - src/auth/auth.module.ts
    - test/auth/session-revocation.int-spec.ts
    - test/auth/http-guard.int-spec.ts
decisions:
  - "revokeAllForAccountDeletionWithin restituisce gli id letti in transazione senza rilettura: un conflitto di scrittura ritenta l'intera transazione, quindi gli id letti sono quelli revocati"
  - "Il registro pota le voci scadute a ogni mark e un mark ripetuto riapre la finestra"
metrics:
  duration: "25 min"
  completed: 2026-11-25
  tasks: 3
  files: 13
---

# Phase 26 Plan 03: revoca per cancellazione dell'account Summary

Motivo `accountDeleted` (solo `extensions.reason` di `SESSION_REVOKED` e reason del close 4409, mai nello SDL); revoca delle sessioni attive dentro la transazione del chiamante con ogni sessione dell'utente accorciata ad adesso + 900 s (mai allungata); facciata che dopo il commit chiude i socket vivi con 4409 `accountDeleted` e segna l'utente in un registro in memoria di 15 minuti, consultato dalla guard solo nel ramo HTTP (D-03, D-06, D-18).

## Task

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | registro, formatter, revoca in transazione | `80ed0448` |
| 1 GREEN | enum, `DeletedAccountRegistry`, `revokeAllForAccountDeletionWithin` | `1f523c30` |
| 2 RED | facciata, guard, filo WS/refresh/HTTP | `89427a5b` |
| 2 GREEN | facciata, guard, modulo | `2021fb8f` |
| 3 | bookkeeping | commit `docs(phase-26): record plan 03 progress` |

## RED attesi e osservati

- `deleted-account.registry.spec.ts`: suite rossa, modulo inesistente (atteso).
- `format-domain-error.spec.ts`: rosso il caso `accountDeleted` (valore dell'enum `undefined`, nessuna reason).
- `session.service.int-spec.ts`: rossi i cinque casi nuovi, `service.revokeAllForAccountDeletionWithin is not a function`.
- `auth.guard.spec.ts`: rosso solo `rejects the HTTP identity of a deleted account (D-18)`. **Verdi al primo colpo** `does not consult the registry for a WS identity already resolved (D-18)` e il caso aggiunto `keeps serving the other users while an account is marked deleted (D-18)`: sono guardie di non-regressione (la guard di oggi non consulta alcun registro).
- `session-revocation.service.int-spec.ts`: rossi i due casi (metodi della facciata inesistenti). `test/auth/session-revocation.int-spec.ts`: rossi i tre casi del filo. `test/auth/http-guard.int-spec.ts`: rossi i tre casi (il terzo cade già sulla chiamata a `closeDeletedAccountSessions`).

## Come è stato simulato il TTL

Nel caso `falls back to SESSION_EXPIRED once the TTL removed the session (D-18)` la sessione revocata è cancellata col driver (`SessionModel.collection.deleteOne`), effetto equivalente al passaggio del monitor TTL di MongoDB; il refresh risponde `{ code: 'SESSION_EXPIRED' }` senza reason.

## WS e resolver invariati

`git diff 9a084248 -- src/auth/ws/ws-connection-authenticator.ts src/auth/auth-identity.resolver.ts | wc -l` stampa `0`: la riconnessione è chiusa con 4409 `accountDeleted` dal controllo esistente della sessione revocata a DB, non dal registro (con il registro in `resolveBearer` si sarebbe avuto 4403).

## Verifiche

- `npx jest src/auth/session/deleted-account.registry.spec.ts src/graphql/format-domain-error.spec.ts --selectProjects unit`: 41/41.
- `npx jest src/auth/session/session.service.int-spec.ts --selectProjects integration --runInBand`: 76/76.
- `npx jest src/auth/guards/auth.guard.spec.ts --selectProjects unit`: 12/12; `src/auth/session/user-role-changes.publisher.spec.ts`: 8/8.
- `npx jest src/auth/session/session-revocation.service.int-spec.ts test/auth/session-revocation.int-spec.ts test/auth/http-guard.int-spec.ts test/auth/ws-auth.int-spec.ts src/auth/auth.module.int-spec.ts --selectProjects integration --runInBand`: 62/62 (5 suite).
- Extra: `src/auth/auth-session.service.int-spec.ts test/app.int-spec.ts` (integration): 131/131.
- `npx tsc --noEmit -p tsconfig.json` esce 0; prettier ed eslint puliti sui file toccati; `pgrep -fl 'bin/jest'` vuoto.
- Grep di accettazione: tutti al valore atteso (enum 1, `Date.now` 0 nel registro, `ClientSession` 1 con `-A3`, `D-18)` 5 nella spec di sessione e 3 in `http-guard`, export `SessionRevocationService` 1 e `WsSessionRegistry` 0, `isDeleted(` 1 nella guard).

## Deviations from Plan

- **Casi aggiunti oltre il piano:** `restarts the window when the same account is marked again (D-18)` nel registro e `keeps serving the other users while an account is marked deleted (D-18)` nella spec unitaria della guard (rinforzi, verdi dopo il GREEN).
- **Facciata costruita a mano nella int-spec della facciata:** il modulo di quella spec fornisce un `WsSessionRegistry` finto (registra solo gli id); il caso dei socket 4409 costruisce `new SessionRevocationService(sessions, new WsSessionRegistry(), deletedAccounts)` con due socket finti registrati, così prova il codice e la reason reali del close. È l'unico `new SessionRevocationService(` del repo.
- **Refresh sul filo:** il caso `refuses the refresh of a deleted account…` usa l'helper esistente `refresh(session)`, che manda anche il bearer dell'account cancellato: `refreshSession` è `@Public()`, quindi il registro non lo intercetta e la risposta resta `SESSION_REVOKED` + `accountDeleted`.
- **Segno nel test HTTP:** `http-guard.int-spec.ts` segna l'utente con la facciata pubblica (`closeDeletedAccountSessions(userId, [])`) su un harness proprio con `FixedClock`; il JWT è verificato col tempo reale, quindi spostare il `FixedClock` di 900 s fa scadere solo la voce del registro.

## Note per i piani successivi

- La cancellazione (piani 06/08) chiama `SessionRevocationService.revokeForAccountDeletionWithin(userId, session)` dentro la sua transazione e, solo dopo il commit, `closeDeletedAccountSessions(userId, revokedIds)`; `SessionRevocationService` è ora esportato da `AuthModule`.
- `revokeAllForAccountDeletionWithin` ignora un `userId` che non è un ObjectId esadecimale (restituisce `[]` senza scrivere).
- Un riavvio del BE dentro la finestra svuota il registro (T-26-13 accettato): da dichiarare nel handoff.
- `AuthGuard` ha un terzo argomento nel costruttore (`DeletedAccountRegistry`).

## Known Stubs

Nessuno.

## Self-Check: PASSED
