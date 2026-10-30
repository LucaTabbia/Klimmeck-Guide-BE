---
phase: 10-hardening-trasversale
plan: 18
subsystem: realtime-queues
tags: [change-stream, single-flight, bull, removeOnFail, D-17a, WR-01, BE-HARD-06]
requires:
  - "10-04: ChangeStreamPublisher con riapertura e backoff (src/mongo/change-stream-publisher.ts)"
  - "10-17: harness createAuthTestApp/createCharactersTestApp e boot reale a 61 casi"
provides:
  - "src/characters/character-updates.publisher.ts: CharacterUpdatesPublisher (extends ChangeStreamPublisher<CharacterDocument>, KeyedSingleFlight per personaggio, requestPublish(characterId): void)"
  - "src/users/user-updates.publisher.ts: UserUpdatesPublisher con KeyedSingleFlight per utente"
  - "src/queues/enqueue-trigger.ts: FAILED_JOBS_KEPT = { age: 7 * 24 * 3600, count: 1000 } come removeOnFail di ogni trigger"
affects: [10-22, 10-23, 10-30]
tech-stack:
  added: []
  patterns:
    - "publisher su change stream = sottoclasse della base + KeyedSingleFlight per id del documento"
    - "ripubblicazione esplicita di un personaggio via requestPublish, nello stesso single-flight degli eventi dello stream"
key-files:
  created:
    - src/characters/character-updates.publisher.ts
    - src/characters/character-updates.publisher.spec.ts
    - src/users/user-updates.publisher.spec.ts
    - src/queues/enqueue-trigger.spec.ts
  modified:
    - src/characters/characters.service.ts
    - src/characters/characters.service.spec.ts
    - src/characters/characters.module.ts
    - test/authz/characters-test-app.ts
    - test/app.int-spec.ts
    - src/users/user-updates.publisher.ts
    - src/queues/enqueue-trigger.ts
    - src/quests/outcomes/outcome-writer.spec.ts
    - src/quests/outcomes/scheduling/quest-resolution.scheduler.spec.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/characters/spells/use-spell.int-spec.ts
    - src/travel/travel-planning.int-spec.ts
    - src/travel/travel-completion.int-spec.ts
decisions:
  - "CharactersService non inietta più PUB_SUB (usato solo dallo stream rimosso): Boy Scout, costruttore più corto"
  - "CharacterUpdatesPublisher è esportato da CharactersModule per i publisher che devono ripubblicare un personaggio (piano 10-22)"
  - "Le spec che verificavano le opzioni di accodamento usano la costante FAILED_JOBS_KEPT; il valore letterale è provato una volta sola in enqueue-trigger.spec.ts"
metrics:
  duration: "~40 min"
  completed: 2026-10-29
---

# Phase 10 Plan 18: publisher dei personaggi, single-flight degli utenti e tetto dei job falliti Summary

Lo stream dei personaggi esce da `CharactersService` e vive in `CharacterUpdatesPublisher`, sottoclasse di `ChangeStreamPublisher`: si riapre con il backoff del piano 10-04 e legge ogni personaggio con `KeyedSingleFlight` (al più due letture per raffica, l'ultimo evento riflette lo stato più recente); `requestPublish(characterId)` permette ai publisher successivi di ripubblicare un personaggio. `UserUpdatesPublisher` chiude la gara WR-01 nello stesso modo. Ogni trigger Bull accodato da `enqueueTrigger` conserva i job falliti per al più 7 giorni e 1000 voci (`FAILED_JOBS_KEPT`).

## Task e commit

| Task | Nome | Commit | Tipo |
|------|------|--------|------|
| 1 RED | spec del publisher dei personaggi e caso del boot reale | `0027694` | test |
| 1 GREEN | `CharacterUpdatesPublisher`, servizio senza stream, modulo e harness | `e4c3c50` | refactor |
| 2 RED | spec del single-flight degli utenti e delle opzioni di accodamento | `5d0531f` | test |
| 2 GREEN | `FAILED_JOBS_KEPT` e `KeyedSingleFlight` negli utenti | `f28fc84` | fix |

## Rossi attesi visti

- Task 1: `character-updates.publisher.spec.ts` fallisce tutti e 4 i casi (lo scheletro non ha costruttore, `onModuleInit`, `requestPublish`); boot reale `mounts the character updates publisher`: «Nest could not find CharacterUpdatesPublisher element».
- Task 2: `coalesces a burst on the same user into at most two reads (D-17a, WR-01)` (3 letture invece di 2); `publishes the latest user state after a burst` (ultimo publish con lo stato vecchio); `keeps at most 1000 failed jobs for seven days (D-17a)` (`removeOnFail` era `false`).
- Verdi al primo colpo: `keeps users independent` (le letture di utenti diversi erano già indipendenti) e `warns and gives up when the queue does not answer in time` (comportamento esistente, copertura richiesta dal piano).

## Verdi finali

- Unit `npx jest src/characters --selectProjects unit`: 23 suite / 277 test.
- Integration `npx jest src/characters test/app.int-spec.ts test/harness --selectProjects integration --runInBand`: 22 suite / 357 test (boot reale 62 casi).
- Consumatori di `createCharactersTestApp`: `accept-quest.resolver`, `travel.resolver`, `teleport.resolver` 3 suite / 54 test.
- Unit `npx jest src/users src/queues src/quests src/characters src/travel --selectProjects unit`: 61 suite / 919 test.
- Integration `npx jest src/users src/travel src/quests/outcomes src/characters/spells src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand`: 27 suite / 391 test.
- `npm run build` esce 0; `git diff --exit-code src/schema.gql` esce 0; righe rimosse dallo schema contro `origin/develop`: 0. `EXPECTED_THROTTLED_HANDLERS` invariato a 8 voci.

## Deviazioni dal piano

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Asserzioni sulle opzioni di accodamento aggiornate**
- **Found during:** Task 2 (verde)
- **Issue:** sei spec fuori da `files_modified` verificavano ancora `removeOnFail` a `false` (3 rossi nell'integrazione di `src/travel` e `src/characters/spells`, più `outcome-writer.spec.ts`, `quest-resolution.scheduler.spec.ts`, `quest-acceptance.service.int-spec.ts`).
- **Fix:** importano `FAILED_JOBS_KEPT` da `src/queues/enqueue-trigger` e lo usano nell'oggetto atteso.
- **Commit:** `f28fc84`

**2. [Boy Scout] `CharactersService` senza `PUB_SUB`**
- Tolta l'iniezione del PubSub (usata solo dallo stream rimosso) e, in `characters.service.spec.ts`, il provider finto e i commenti sullo stream ormai falsi. Commit `e4c3c50`.

**3. Subject del commit GREEN del task 1 accorciato**
- Il piano imponeva `refactor(characters): publish character updates from a dedicated publisher` (74 caratteri): usato `refactor(characters): publish updates from a dedicated publisher` (64).

**4. Spec del single-flight dei personaggi**
- Il caso di raffica verifica «al più 2 letture» con `toBeLessThanOrEqual(2)` più l'ultimo publish, come scritto nel behavior; la spec degli utenti verifica esattamente 2 letture.

## Threat model

- T-10-69: mitigata da `KeyedSingleFlight` per id in entrambi i publisher (casi di raffica e di stato più recente).
- T-10-70: mitigata da `FAILED_JOBS_KEPT` su ogni trigger delle code `spell-recovery`, `travel`, `quest-resolution`.
- T-10-71: mitigata dalla sottoclasse della base comune (riapertura del piano 10-04); `CharactersService` non apre più stream.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: `src/characters/character-updates.publisher.ts`, `src/characters/character-updates.publisher.spec.ts`, `src/users/user-updates.publisher.spec.ts`, `src/queues/enqueue-trigger.spec.ts`.
- Commit presenti: `0027694`, `e4c3c50`, `5d0531f`, `f28fc84`.
