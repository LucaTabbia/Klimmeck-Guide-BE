---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 09
subsystem: push, characters/pets
tags: [push, sweeper, claim-atomico, arrayFilters, compagni]
requires: [23-01 (isPetDefeated, companionDisplayName, voce con defeatedUntil), 23-05 (defeatedUntil scritto alla sconfitta)]
provides: [PushEventType.petRecovered, petRecovered(petId, nome), duePetRecoveriesFilter, petRecoveryClaim, duePetsOf, PetRecoveryService.release, PetRecoverySweeper, IDLE_PET_RECOVERY_SWEEPER, indice character_owned_pets_defeated_until]
affects: [QuestOutcomesModule, QUIET_OUTCOME_OVERRIDES, src/schema.gql]
tech-stack:
  added: []
  patterns: [sweeper single-flight con reconciler al boot (calco della prigione), claim per voce con arrayFilters e modifiedCount === 1]
key-files:
  created:
    - src/characters/pets/pet-recovery.ts
    - src/characters/pets/pet-recovery.spec.ts
    - src/characters/pets/pet-recovery.service.ts
    - src/characters/pets/pet-recovery.sweeper.ts
    - src/characters/pets/pet-recovery.sweeper.spec.ts
    - src/characters/pets/pet-recovery.int-spec.ts
  modified:
    - src/push/push-event-type.enum.ts
    - src/push/push-events.ts
    - src/push/push-events.spec.ts
    - src/push/push.exception.spec.ts
    - src/models/character/character.model.ts
    - src/models/sweep-indexes.schema.spec.ts
    - src/mongo/sweep-index.verifier.int-spec.ts
    - src/quests/outcomes/quest-outcomes.module.ts
    - test/quests/outcome-world.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "id della push petRecovered = id del pet a catalogo, mai il personaggio: due compagni dello stesso personaggio tornati in forze insieme danno due notifiche distinte (FE W-9, caso pinnato)"
  - "Nessuna transazione: ogni claim è un update condizionale indipendente; le push partono dopo tutti i claim del personaggio; il characterUpdated lo emette il change stream alla scrittura"
  - "Indice nominato character_owned_pets_defeated_until (costante CHARACTER_OWNED_PETS_DEFEATED_UNTIL_INDEX), aggiunto anche alla int-spec del SweepIndexVerifier"
metrics:
  duration: ~35 min
  completed: 2026-11-14
---

# Phase 23 Plan 09: push «in forze» del compagno sconfitto — Summary

Push `petRecovered` («Di nuovo in forze», «<nome mostrato> è di nuovo in forze», `id` = pet a catalogo, TTL 1 h) inviata da uno sweeper sull'intervallo della prigione che reclama ogni voce con `defeatedUntil` scaduta tramite un update condizionale con `arrayFilters`; push solo con `modifiedCount === 1`, dopo la scrittura.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 8ff46c89 | test(push): pin the companion recovery push and claim |
| 1 GREEN | df9997d5 | feat(push): add the companion recovery push and claim |
| 2 RED | 7f5e3713 | test(pets): pin the companion recovery sweeper |
| 2 GREEN | d316dcdd | feat(pets): push when a defeated companion is back |

## Fallimenti RED attesi

- Task 1: `pet-recovery.spec.ts` e `push-events.spec.ts` non compilavano (modulo `./pet-recovery` e builder `petRecovered` assenti); `sweep-indexes.schema.spec.ts` falliva sull'indice mancante.
- Task 2: `pet-recovery.sweeper.spec.ts` falliva con «Cannot find module './pet-recovery.sweeper'»; l'int-spec idem.
- Pin del blocco `enum PushEventType` in `test/app.int-spec.ts`: il valore dell'enum è arrivato nel GREEN del task 1 (come da piano), quindi il boot reale avrebbe rigenerato lo SDL già col valore. Il RED è stato provato confrontando l'asserzione con lo `src/schema.gql` committato prima della rigenerazione: il blocco non combaciava (manca `petRecovered`). Lo SDL rigenerato è stato committato nel GREEN del task 2.

## Ritardo massimo

Un intervallo di sweep (`QUEST_CONFIG.sweepIntervalMs`, 60 s di default), come la prigione; al boot un reconciler recupera le sconfitte finite a processo fermo. Nessuna variabile d'ambiente nuova.

## Casi verdi al primo colpo

Tutti i casi dell'int-spec (9) sono passati al primo GREEN: il claim ricalca la sonda P2 e il servizio ricalca la prigione. Coperti: push unica e seconda passata a vuoto; nessuna push prima della data; due `release` concorrenti → un solo id e una push; compagno venduto → nessuna push né scrittura; compagno riequipaggiato e ferito (vita 50) → push e vita invariata; nome della specie per la voce senza nome; ferito a riposo senza marcatore → nessuna push; voce già azzerata → `release` ritorna solo l'altra; **due compagni dello stesso personaggio → due push con id distinti, nessuno uguale all'id del personaggio** (caso chiesto dall'orchestratore per la deduplica FE per tipo e id).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `src/push/push.exception.spec.ts` pinna i valori di `PushEventType`**
- **Trovato durante:** Task 1 GREEN
- **Problema:** il test «declares the GraphQL enums with camelCase values» elenca i valori dell'enum: falliva col valore nuovo.
- **Fix:** `'petRecovered'` aggiunto in coda all'elenco.
- **Commit:** df9997d5

**2. [Rule 2 - Copertura] indice nella int-spec del `SweepIndexVerifier` e sweeper nel boot reale**
- `CHARACTER_OWNED_PETS_DEFEATED_UNTIL_INDEX` aggiunto a `EXPECTED_INDEXES` di `src/mongo/sweep-index.verifier.int-spec.ts` (il verificatore crea l'indice multikey su un DB vero); `test/app.int-spec.ts` controlla anche `app.get(PetRecoverySweeper)` accanto a quello della prigione.
- **Commit:** d316dcdd

**3. Nota sul test dell'indice:** il caso dell'indice in `sweep-indexes.schema.spec.ts` è una riga della tabella `it.each` (titolo generato dal nome dell'indice); il titolo del piano «indexes the companion defeat for the recovery sweep (D-24)» è il commento della riga.

**4. Bookkeeping:** `Plan: 9 of 18` senza zero (regola del brief): il grep del piano su `Plan: 09 of 18` non combacia, atteso.

## Verifiche

- Unit `src/characters/pets src/push src/models/sweep-indexes.schema.spec.ts`: 20 suite / 324 test verdi.
- Int `pet-recovery.int-spec` (9), `prison-release.int-spec`, `sweep-index.verifier.int-spec`, boot reale `test/app.int-spec.ts`: 4 suite / 123 test verdi.
- Non regressione degli harness quieti: companion-defeat, pending-requests.resolver, quest-resolution.processor, ambush-resolution, guided-completion.service: 5 suite / 73 test verdi.
- `tsc` 0; prettier + eslint sui file toccati (l'unico warning, `test/app.int-spec.ts` `no-base-to-string` su `url`, è preesistente).
- SDL: unica riga nuova `petRecovered` nel blocco `PushEventType`; gate delle righe tolte rispetto a `2c462cbe` verde (solo `useItem`).

## Threat model

T-23-25 (claim per voce, `modifiedCount === 1`, caso concorrente senza timer), T-23-26 (update sul solo marcatore, caso «leaves its life alone»), T-23-27 (log con soli id e conteggi, errori via `describeError`), T-23-28 (indice multikey dedicato, single-flight, intervallo esistente): mitigati.

## Self-Check: PASSED
