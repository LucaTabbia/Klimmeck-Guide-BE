---
phase: 26-eliminazione-account-e-consenso
plan: 08
subsystem: users, account, auth
tags: [account-deletion, graphql, session-revocation, ws-4409]
requires: ["26-03", "26-06", "26-07"]
provides:
  - "src/account/deletion/account-deletion.service.ts: AccountDeletionService.deleteOwnAccount(userId) → true; erase(userId) privata (una transazione intorno a eraseWithin, report azzerato in testa al callback); afterCommit(report) privata con closeDeletedAccountSessions"
  - "src/account/deletion/account-deletion.resolver.ts: mutation deleteMyAccount: Boolean! (nessun argomento, identità dal bearer)"
  - "AccountDeletionModule in AppModule (resolver, servizio, Clock → SystemClock)"
affects: [26-10, 26-11, 26-12, 26-13, 26-14]
tech-stack:
  added: []
  patterns:
    - "via propria come deleteCharacter: transazione nel servizio, stato del callback azzerato in testa, effetti dopo il commit solo con un report"
key-files:
  created:
    - src/account/deletion/account-deletion.service.ts
    - src/account/deletion/account-deletion.resolver.ts
    - src/account/deletion/account-deletion.resolver.int-spec.ts
  modified:
    - src/account/deletion/account-deletion.module.ts
    - src/app.module.ts
    - src/schema.gql
    - test/app.int-spec.ts
decisions:
  - "Id del bearer convertito con objectIdFromHex: un id non esadecimale risponde UNAUTHENTICATED senza aprire la transazione"
  - "afterCommit è sincrono (void) finché contiene solo closeDeletedAccountSessions, che è sincrona: un async senza await fa scattare require-await di eslint; il piano 12 lo renderà async quando aggiunge push, topic e ritratti"
  - "Il report raccolto fuori dal callback è un solo campo (`state.report`) rimesso a null in testa: eraseWithin costruisce un report nuovo a ogni esecuzione, quindi released, cancelled, revokedSessionIds e pushTokens ripartono da zero insieme"
metrics:
  duration: "25 min"
  completed: 2026-11-25
  tasks: 3
  files: 7
---

# Phase 26 Plan 08: mutation deleteMyAccount e revoca sul filo — Summary

`deleteMyAccount: Boolean!` cancella l'account di chi chiama (identità solo dal bearer): `AccountDeletionService` apre una transazione intorno ad `AccountEraser.eraseWithin`, rifiuta l'oste con `INNKEEPER_ACCOUNT_PROTECTED` (dall'eraser, nulla scritto), risponde `UNAUTHENTICATED` a un utente già sparito e, dopo il commit, chiude i socket con 4409 `accountDeleted` e segna l'utente nel registro in memoria (D-04, D-16, D-17, D-18, D-20).

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 06fd1cc1 | test(users): expect the deleteMyAccount mutation |
| 1 GREEN | 9c56127e | feat(users): delete the caller's account |
| 2 | 075f82db | test(users): cover the revocation seen after deleteMyAccount |
| 3 | (questo commit) | docs(phase-26): record plan 08 progress |

## Fallimenti RED (Task 1)

6 rossi su 114 (2 suite):
- `account-deletion.resolver.int-spec.ts`: successo e senza personaggio con `Cannot query field "deleteMyAccount" on type "Mutation".`; oste e utente sparito con `data` assente invece di `null` (stesso errore di validazione).
- `test/app.int-spec.ts`: pin `deleteMyAccount: Boolean!` non trovato nello SDL generato; `rejects deleteMyAccount without a bearer (D-20)` riceveva `GRAPHQL_VALIDATION_FAILED` invece di `UNAUTHENTICATED`.
- **Verde già nel RED:** `takes no argument (D-20)`: senza la mutation la validazione GraphQL fallisce comunque con `GRAPHQL_VALIDATION_FAILED`; il caso diventa significativo dopo il GREEN (la mutation esiste e l'argomento è rifiutato). Guardia di non-regressione.

## SDL

Unica riga aggiunta (`git diff 9a084248 -- src/schema.gql`: 1 riga `+`, 0 righe `-`), dentro `type Mutation` dopo `deleteCharacter: User!`:

```
  deleteMyAccount: Boolean!
```

Rigenerato col boot reale di `test/app.int-spec.ts` e committato nel GREEN. `test/authz/expected-handlers.ts` senza diff da `9a084248`; nessun `@Throttled` né `@Roles` sulla mutation; `EXPECTED_THROTTLED_HANDLERS` e `EXPECTED_PUBLIC_HANDLERS` invariati.

## Casi verdi al primo colpo (Task 2)

Tutti e cinque i casi di `revocation after deleteMyAccount (D-18)` verdi al primo giro, come previsto dal piano: la revoca in transazione la fa l'eraser (piano 06 con la facciata del piano 03) e il `afterCommit` del Task 1 chiama `closeDeletedAccountSessions`. Nessun `fix(users)` necessario.
- socket del chiamante chiuso con `(4409, 'accountDeleted', acknowledged: true)`; il caso attende risposta HTTP e chiusura con `Promise.all` (la chiusura può arrivare prima);
- refresh → `{ code: 'SESSION_REVOKED', reason: 'accountDeleted' }` (inviato col bearer dell'account cancellato: `refreshSession` è `@Public()`);
- `me` col vecchio access token → `UNAUTHENTICATED` (registro in memoria consultato dalla guard HTTP);
- riconnessione → close 4409 `accountDeleted` non riconosciuta;
- l'altro utente: sessione identica a DB dopo la cancellazione, socket ancora aperto dopo 300 ms, `me` e refresh riusciti.

## Harness

`createAuthTestApp({ imports: [AccountDeletionModule], clock: new FixedClock(NOW) })` con `NOW` all'ora reale al secondo (come la spec dell'eraser: le sessioni revocate scadono a NOW + 900 s e il monitor TTL non deve toglierle); `init()` su ogni modello registrato prima delle transazioni; utenti con `createPlayer` (ruolo oste scritto all'inserimento) o `createAuthenticatedUser` quando serve la sessione col refresh token; `ws-test-client` per i socket.

## Verifiche

- Task 1: `npx jest src/account/deletion/account-deletion.resolver.int-spec.ts test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand` → 255/255 (3 suite); `npx tsc --noEmit -p tsconfig.json` 0; controlli SDL del piano tutti veri; `grep -c AccountDeletionModule src/app.module.ts` = 2; grep `Throttled|Roles` sopra `deleteMyAccount(` = 0.
- Task 2: `account-deletion.resolver.int-spec.ts` 10/10 (rieseguita per intero dopo il ritocco del caso «other users»); `tsc` 0; `grep -c "D-18)"` = 6.
- Prettier ed eslint puliti sui file toccati (in `test/app.int-spec.ts` resta un warning preesistente `no-base-to-string` alla riga 1293, non toccata); `pgrep -fl 'bin/jest'` vuoto.

## Deviations from Plan

- **`afterCommit` sincrono** invece di `Promise<void>` come nell'`<interfaces>` (vedi decisioni): solo il tipo di ritorno, nessun effetto sul comportamento.
- **Caso «other users» rinforzato:** oltre a socket aperto e `me`, confronta le sessioni dell'altro utente a DB prima e dopo la cancellazione (`toEqual`) prima di provarne il refresh.
- Il caso dell'oste confronta utente, personaggio e sessioni grezzi a DB prima e dopo (`toEqual`).

## Known Stubs

Nessuno. Stato intermedio dichiarato dal piano: push ai compagni e ai soccorritori (`report.cancelled`, `report.released`), disiscrizione dal topic FCM (`report.pushTokens`) e ritratto arrivano coi piani 11–12, dentro `afterCommit`.

## Threat Flags

Nessuna superficie nuova oltre al registro del piano (T-26-29..T-26-32 coperti dai casi).

## Note per i piani successivi

- Piano 10 (via dell'oste): `erase(userId)` è privata e restituisce il report o `null`; riusarla (renderla accessibile o aggiungere un metodo pubblico accanto) e tradurre `null` in `ACCOUNT_NOT_FOUND`; `afterCommit` vale per entrambe le vie.
- Piano 12: aggancio in `afterCommit(report)`; quando diventa async, `erase` deve attenderlo (`await this.afterCommit(...)`) e un fallimento non deve risalire alla mutation (la cancellazione è già committata, regola dura 5).

## Self-Check: PASSED

File creati presenti; commit 06fd1cc1, 9c56127e, 075f82db presenti nella storia.
