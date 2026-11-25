---
phase: 26-eliminazione-account-e-consenso
plan: 10
subsystem: users, account, authz
tags: [account-deletion, innkeeper, audit-log, privacy, graphql]
requires: ["26-08", "26-09"]
provides:
  - "src/authz/audit/audit-target.decorator.ts: AuditTargetRule con ganci opzionali argsOf e idOfResult; AuditTarget(type, idOf, hooks = {})"
  - "src/authz/audit/admin-audit.interceptor.ts: args = argsOf(ricevuti) se dichiarato; target.id = idOfResult(risultato) alla riuscita, null all'errore se idOfResult è dichiarato"
  - "src/account/deletion/deleted-account.model.ts: DeletedAccount { twitchId: String! }"
  - "AccountDeletionService.deleteByTwitchLogin(rawLogin) → DeletedAccount (stessa erase della via propria)"
  - "mutation deleteAccountByTwitchLogin(twitchLogin: String!): DeletedAccount!, @Roles(innkeeper), registro oscurato"
  - "twitchUserDirectoryProvider registrato in AccountDeletionModule"
affects: [26-11, 26-12, 26-13, 26-14]
tech-stack:
  added: []
  patterns:
    - "ganci di redazione del registro dell'oste dichiarati sull'handler con @AuditTarget"
key-files:
  created:
    - src/account/deletion/deleted-account.model.ts
  modified:
    - src/authz/audit/audit-target.decorator.ts
    - src/authz/audit/audit-target.decorator.spec.ts
    - src/authz/audit/admin-audit.interceptor.ts
    - src/authz/audit/admin-audit.interceptor.spec.ts
    - src/account/deletion/account-deletion.service.ts
    - src/account/deletion/account-deletion.resolver.ts
    - src/account/deletion/account-deletion.module.ts
    - src/account/deletion/account-deletion.resolver.int-spec.ts
    - test/authz/expected-handlers.ts
    - test/authz/handler-fixtures.ts
    - test/authz/authorization-matrix.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Il servizio normalizza il nome PRIMA della directory e le passa la forma normalizzata (il fake registra `player_one` per `' @Player_One '`); un nome impossibile non arriva mai a Twitch"
  - "L'utente si cerca per twitchId fuori dalla transazione solo per avere l'_id; il rifiuto dell'oste resta dell'eraser, che rilegge il ruolo in transazione (D-16)"
  - "Un errore della directory diverso da TwitchUserLookupError risale invariato (INTERNAL_SERVER_ERROR), non diventa TWITCH_UNAVAILABLE"
  - "erase resta privata: deleteByTwitchLogin vive nello stesso servizio, quindi erase e afterCommit sono condivisi senza cambiarne la visibilità"
metrics:
  duration: "35 min"
  completed: 2026-11-25
  tasks: 3
  files: 14
---

# Phase 26 Plan 10: cancellazione dell'oste per nome utente Twitch — Summary

`deleteAccountByTwitchLogin(twitchLogin: String!): DeletedAccount!` (solo oste) normalizza il nome, lo risolve con `TwitchUserDirectory` ed esegue la STESSA cancellazione di `deleteMyAccount` (`AccountDeletionService.erase`, poi `afterCommit` con i socket chiusi a 4409 `accountDeleted`); quattro codici distinti; il registro dell'oste salva argomenti oscurati e il Twitch ID risolto come bersaglio, e il nome utente non resta in nessuna collection né nei log (D-15, D-16, D-20, D-25).

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | f06a9e1c | test(authz): expect redacted audit entries |
| 1 GREEN | 36d77316 | feat(authz): redact the arguments and target of an audited mutation |
| 2 RED | 0198bee2 | test(users): expect the innkeeper deletion by Twitch username |
| 2 GREEN | 49dadbc7 | feat(users): let the innkeeper delete an account by Twitch username |
| 3 | (questo commit) | docs(phase-26): record plan 10 progress |

## Fallimenti RED

- Task 1: 4 rossi su 28 (`src/authz/audit` unit): i tre casi D-25 dell'interceptor (voce con gli argomenti ricevuti e il bersaglio di ripiego) e `stores the optional redaction hooks of a target (D-25)` (`argsOf` assente: `undefined` invece di `{}`): il terzo argomento del decoratore era ignorato. `keeps today's metadata when no hook is given (D-25)` verde già nel RED (guardia di non-regressione: le chiavi di oggi sono `idOf` e `type`).
- Task 2:
  - `test/authz/handler-fixtures.spec.ts`: 1 rosso su 7, `validates every document against the schema (D-01)` (campo assente dallo SDL);
  - `account-deletion.resolver.int-spec.ts`: 10 rossi su 20, tutti i casi nuovi con `Cannot query field "deleteAccountByTwitchLogin" on type "Mutation".` (quello del socket scade dopo 5 s in attesa della chiusura); i 10 casi del piano 08 restano verdi con l'harness che ora include `AuthzModule` e il fake della directory;
  - `test/app.int-spec.ts` + matrice: 7 rossi su 255 (pin dello SDL, superficie degli handler dell'oste, cinque righe della matrice per il nuovo handler).

## SDL

`git diff 9a084248 -- src/schema.gql`: 5 righe `+`, 0 righe `-` (questa e quella del piano 08). Righe di questo piano:

```
type DeletedAccount {
  twitchId: String!
}
```

e in `type Mutation`, prima di `deleteCharacter`:

```
  deleteAccountByTwitchLogin(twitchLogin: String!): DeletedAccount!
```

Rigenerato col boot reale e committato nel GREEN; `git diff --exit-code src/schema.gql` pulito dopo il commit.

## Rifiuto dei guard

Un avventuriero riceve `FORBIDDEN` (RolesGuard), il fake non viene mai chiamato, il bersaglio resta e nessuna voce di registro viene scritta. Nella matrice: `forbids the adventurer/guard …` → `FORBIDDEN`, bearer assente o invalido → `UNAUTHENTICATED`.

## Forma della voce di registro

Riuscita e ogni rifiuto (sei tentativi nel caso D-25: riuscita, nome impossibile, nome sconosciuto, nessun account, bersaglio oste, Twitch irraggiungibile):

```
{ _id, at, actor: { userId, twitchId, role: 'innkeeper' }, action: 'deleteAccountByTwitchLogin',
  target: { type: 'User', id: '<twitchId>' | null }, outcome: 'ok' | '<codice>' }
```

Nessuna chiave `args`: l'oggetto vuoto prodotto da `argsOf` non arriva a DB (minimize di Mongoose; la lettura tramite il modello restituisce il default `{}`). Il caso lo prova con `Object.keys(entry).sort()` uguale a `['_id', 'action', 'actor', 'at', 'outcome', 'target']`, e per ogni voce il nome normalizzato del tentativo non compare nel JSON della voce.

## Nome utente mai conservato

`keeps the username out of every collection (D-25)`: dopo una riuscita (`' @Player_One '`) e un rifiuto (`Unknown_Viewer`) il dump di tutte le collection (minuscolo) non contiene `@player_one`, `player_one` né `unknown_viewer`, e contiene la voce `deleteAccountByTwitchLogin`; le chiamate a `Logger.prototype.log/warn/error/debug/verbose` registrate durante il caso non contengono nessuno dei due nomi.

## Verifiche

- Task 1: `npx jest src/authz/audit --selectProjects unit` 28/28; `npx jest src/authz/audit/admin-audit.int-spec.ts --selectProjects integration --runInBand` 11/11; `tsc` 0; `idOfResult` 4, `argsOf` 2 nell'interceptor; `D-25)` 3 nella spec.
- Task 2: `npx jest test/authz/handler-fixtures.spec.ts --selectProjects unit` 7/7; `npx jest src/account/deletion/account-deletion.resolver.int-spec.ts test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand` 275/275 (3 suite), rieseguita per intero dopo il ritocco del caso del registro; `tsc` 0; controlli SDL veri; acceptance: voce in `expected-handlers` 1, `AuditTarget(` sotto `@Roles` 1, log col nome 0, `D-(15|16|25)` 11.
- `src/characters/deletion/` senza diff da `9a084248` (regola dura 3); nessun `chance.next(`; prettier ed eslint puliti sui file toccati, uno per uno; `pgrep -fl 'bin/jest'` vuoto.

## Deviations from Plan

**1. [Rule 3 - Blocking] Conteggio della matrice aggiornato nel RED**
- `test/authz/authorization-matrix.int-spec.ts` (fuori da `files_modified`): `runs one row per listed handler (D-01)` pinna `httpRows(EXPECTED_INNKEEPER_HANDLERS)` a 20 → 21. Commit 0198bee2.

**2. [Rule 1 - Test] `args` assente invece di `{}` nella voce a DB**
- Il piano chiede `args: {}`; a DB la chiave non esiste (minimize di Mongoose, comportamento di oggi per ogni oggetto vuoto). Il caso asserisce l'insieme esatto delle chiavi (prova di assenza più forte). Nessun cambio al modello del registro.

**3. Harness della int-spec**
- L'intero file usa `createAuthTestApp({ imports: [AccountDeletionModule, AuthzModule], clock, overrides: [TwitchUserDirectory → FakeTwitchUserDirectory] })` invece di `createCharactersTestApp`: `AuthzModule` basta per l'interceptor globale; `directory.reset()` in `afterEach`.

**4. Casi in più dentro i casi del piano**
- Il caso del registro copre sei tentativi (riuscita e i cinque rifiuti, compreso il nome impossibile) e il caso della scansione controlla anche i log applicativi (regola dura 6).

## Known Stubs

Nessuno. `afterCommit` resta sincrono (solo socket e registro in memoria): push, topic FCM e ritratto arrivano coi piani 11–12, per entrambe le vie.

## Threat Flags

Nessuna superficie oltre al registro del piano (T-26-38..T-26-42 coperti dai casi).

## Note per i piani successivi

- La via dell'oste passa da `erase` e quindi da `afterCommit`: quando il piano 12 lo rende async, entrambe le vie lo ereditano; un suo fallimento non deve far fallire nemmeno `deleteAccountByTwitchLogin` (la voce di registro sarebbe `outcome` ≠ ok per una cancellazione già committata).
- Il gate (26-13) troverà nel registro, per questa mutation, voci senza chiave `args`.

## Self-Check: PASSED

File creati presenti; commit f06a9e1c, 36d77316, 0198bee2, 49dadbc7 presenti nella storia del branch.
