---
phase: quick-261110-prp
plan: 01
subsystem: characters
tags: [prison, push, fcm, sweep, idempotency]
key-files:
  created:
    - src/characters/imprisonment/prison-release.service.ts
    - src/characters/imprisonment/prison-release.sweeper.ts
    - src/characters/imprisonment/prison-release.sweeper.spec.ts
    - src/characters/imprisonment/prison-release.int-spec.ts
  modified:
    - src/characters/imprisonment/imprisonment.ts
    - src/push/push-event-type.enum.ts
    - src/push/push-events.ts
    - src/push/push-events.spec.ts
    - src/push/push.exception.spec.ts
    - src/models/character/character.model.ts
    - src/models/sweep-indexes.schema.spec.ts
    - src/mongo/sweep-index.verifier.int-spec.ts
    - src/quests/outcomes/quest-outcomes.module.ts
    - src/schema.gql
    - test/app.int-spec.ts
    - test/quests/outcome-world.ts
commits:
  - { hash: 88b86ab2, message: "test(push): expect the prison release push and its sweep index" }
  - { hash: 9fa0c743, message: "feat(push): add the prison release push and its sweep index" }
  - { hash: de442b83, message: "test(characters): expect the prison release sweep and its single push" }
  - { hash: e50dba8c, message: "feat(characters): release prisoners on a sweep and push once per arrest" }
---

# Quick 261110-prp: push alla liberazione dalla prigione

## Parole dell'utente (2026-11-10)

- «Vorrei che venisse inviata una notifica quando esci di prigione.»

Seguito della quick 261110-cgd (arresto nelle crime, `CharacterStatus.imprisonedUntil`).

## Decisioni

1. **Push nuovo `prisonRelease`** (`PushEventType.prisonRelease`, `src/push/push-events.ts`): stesso catalogo, trasporto FCM data-only, registro device e TTL personale (1 h) di `travelEnd`/`questEnd`. Builder `prisonRelease(characterId)`: `id` = personaggio, come `travelEnd`. Titolo «Di nuovo libero», corpo «La prigionia è finita: torna all'avventura.». Nessun dato sensibile. Tipo personale anche per `sendTestPush` (porta l'`id`).
2. **Meccanismo: sweep, stato a DB.** `PrisonReleaseSweeper` (`src/characters/imprisonment/prison-release.sweeper.ts`) ricalca gli sweep esistenti (`SpellRecoverySweeper`, `QuestResolutionSweeper`): reconciler al boot mai atteso (copre le liberazioni scadute a processo fermo), sweep periodico con l'intervallo di `QUEST_CONFIG` (`QUEST_SWEEP_INTERVAL_MS`, default 60 s; 0 spegne solo il periodico), single-flight, arresto pulito che attende lo sweep in corso. Nessuna variabile d'ambiente nuova, nessun job Bull: il push arriva entro circa un intervallo dalla data.
3. **Idempotenza: un push per arresto.** `PrisonReleaseService.release(characterId)` fa un solo `updateOne` condizionale (personaggio attivo, `imprisonedUntil` non più futura → `null`); invia il push solo se `modifiedCount` è 1. Il marcatore è la data svuotata: due sweep o due istanze non notificano due volte. Confine: alla data esatta si è liberi, come in `imprisonedUntilOf` e `notImprisonedAt`.
4. **Destino di `imprisonedUntil`:** alla liberazione torna `null`. Il contratto FE resta valido (`null` o passata = libero). Lo stato arriva su `characterUpdated` dal change stream come ogni update del personaggio.
5. **Data spostata a mano:** lo sweep legge la data corrente a ogni giro; spostata nel futuro, aspetta la nuova data (provato).
6. **Personaggio cancellato/archiviato prima della scadenza:** escluso dal filtro dei personaggi attivi, nessun push, nessun errore, data lasciata com'è. Inesistente: `stale`. Non più giocato da nessun utente: data svuotata, nessun push (ricerca del proprietario per `currentCharacter`, come `travelEnd`).
7. **Indice** `character_imprisoned_until` `{ deletedAt: 1, 'status.imprisonedUntil': 1 }` come gli altri sweep (D-17b), costruito al boot da `SweepIndexVerifier` (che chiama `createIndexes` sullo schema).
8. **Sede:** codice in `src/characters/imprisonment/`, registrato in `QuestOutcomesModule` (la prigione nasce dall'arresto e il modulo ha già push, utenti, personaggi e `QUEST_CONFIG`). `QUIET_OUTCOME_OVERRIDES` (`test/quests/outcome-world.ts`) guadagna lo sweeper inerte `IDLE_PRISON_RELEASE_SWEEPER`, come quello delle missioni.
9. SDL: solo il valore additivo `prisonRelease` di `enum PushEventType`, schema rigenerato dal boot reale nel commit `9fa0c743`. Nessuna migrazione, nessuna scrittura sul DB reale.

## Contratto (additivo)

```graphql
enum PushEventType {
  prisonRelease
}
```

Payload data FCM: `{ type: "prisonRelease", id: "<id personaggio>", title: "Di nuovo libero", body: "La prigionia è finita: torna all'avventura.", sentAt: "<ISO>" }`. Dettaglio in `.planning/phases/18-quest-heal-per-taglia/BACKEND-NOTES.md` §1.6, «Push di liberazione».

## RED osservati

- Push e indice (`88b86ab2`): unit `Test Suites: 3 failed · Tests: 2 failed, 14 passed` (builder assente: suite di `push-events.spec.ts` non compilata; valore dell'enum; riga dell'indice); integration `Tests: 2 failed, 84 passed` (riga `prisonRelease` dello SDL al boot reale, indice non costruito dal verifier).
- Liberazione (`de442b83`): `Cannot find module './prison-release.sweeper'` / `'./prison-release.service'` (unit 1 suite rossa; integration 2 suite rosse, compreso `test/app.int-spec.ts` per l'import dello sweeper).

## Gate

- `npx tsc --noEmit -p tsconfig.json`: 0.
- `npx jest --selectProjects unit`: 259 suite / 3308 test verdi (prima 258 / 3295: +1 suite, +13 test).
- `npx jest src/quests --selectProjects integration --runInBand`: 35 suite / 498 test verdi (invariato: nessuna spec nuova in `src/quests`).
- Boot reale `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 84/84 (asserzioni aggiunte a test esistenti); `git diff --exit-code src/schema.gql` pulito.
- Altre cartelle toccate: `src/characters` 23 suite / 376 test; `src/push src/mongo src/models` 3 suite / 37 test; `src/travel` (monta `QuestOutcomesModule` tramite `AmbushModule`) 11 suite / 202 test: tutte verdi.
- `npx prettier --write` e `npx eslint` sui file toccati: puliti (l'unico warning, `test/app.int-spec.ts:965` `no-base-to-string`, esisteva già). Subject fra 59 e 71 byte, nessun trailer. `pgrep -fl 'bin/jest'` vuoto.

## Deviazioni

- **Sweep invece di job Bull + sweep:** la liberazione non accoda un job ritardato all'arresto (come i viaggi), usa solo lo sweep periodico con l'intervallo delle missioni. Sopravvive al riavvio (reconciler al boot) e non tocca la transazione dell'arresto; prezzo: il push arriva fino a un intervallo (default 60 s) dopo la data.
- **`imprisonedUntil` svuotata alla liberazione:** la quick 261110-cgd diceva «nessuno sweep la azzera»; ora lo sweep la porta a `null`. Commento di `imprisonment.ts` e §1.6 del handoff aggiornati.
- **Tipo dell'id nella int-spec:** il commit GREEN `e50dba8c` aggiunge un cast `as Types.ObjectId` nella int-spec scritta in RED (`tsc` lo segnalava; ts-jest no).
- **Sweep della int-spec nell'harness:** la int-spec monta lo sweeper vero con `QUIET_SWEEP_CONFIG` e sposta l'orologio fisso avanti e indietro di 120 s per la data spostata a mano.
- **`characterUpdated` alla liberazione:** dichiarato dalla pipeline del change stream (ogni update di un personaggio attivo), senza una spec dedicata.
