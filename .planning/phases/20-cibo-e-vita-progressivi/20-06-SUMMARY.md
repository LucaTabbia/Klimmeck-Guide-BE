---
phase: 20-cibo-e-vita-progressivi
plan: 06
subsystem: travel
tags: [travel, ambush, food, hunger, integration]
requires:
  - 20-02 (TravelPantryReader.foodCatalogFor, FoodCatalogEntry)
  - 20-05 (ambushFoodOf, withFoodSettlement, AmbushPlanInput.food)
provides:
  - TravellerOptions.distanceKm / durationMs / food in test/travel/ambush-world.ts
  - passo «cibo» prima del combattimento in AmbushResolutionService
affects: [20-07, 20-10, 20-11]
tech-stack:
  added: []
  patterns:
    - catalogo del cibo letto fuori dalla transazione, passo «cibo» ricalcolato dallo snapshot in sessione a ogni esecuzione del callback
key-files:
  created:
    - .planning/phases/20-cibo-e-vita-progressivi/20-06-SUMMARY.md
  modified:
    - test/travel/ambush-world.ts
    - src/travel/ambush/ambush-resolution.service.ts
    - src/travel/ambush/ambush-resolution.int-spec.ts
decisions:
  - "Il catalogo del cibo si legge in `resolve` con `foodCatalogFor(snapshot.assets?.ownedItems ?? [])` senza sessione, accanto al catalogo del combattimento (Phase 16 D-05)"
  - "Il motore di combattimento e `planAmbushOutcome` ricevono lo snapshot assestato (`fighter`); `abandonLane` resta sullo snapshot in sessione"
  - "`skip` invariato: senza combattimento la fame resta allo sweep"
metrics:
  duration: ~15 min
  completed: 2026-11-12
---

# Phase 20 Plan 06: Imboscata, cablaggio nel servizio Summary

`AmbushResolutionService` legge il catalogo del cibo fuori dalla transazione e, dentro, assesta fame e pasto al km salvato dell'imboscata prima del combattimento: il motore vede la vita vera del punto (945 al km 290 di 400), la vittoria lascia il piano con `settledKm` e `foodConsumedAt`, la sconfitta paga solo il cibo dei km percorsi e la deviazione nasce senza piano.

## Task

| Task | Nome | Commit |
|------|------|--------|
| 1 | opzioni del mondo delle imboscate (Wave 0) | `c3f8bc48` |
| 2 RED | casi Phase 20 sul replica set | `5490dd5c` |
| 2 GREEN | passo «cibo» nel servizio | `fa293c1b` |
| 3 | bookkeeping | commit `docs(phase-20): record plan 06 progress` |

## Fallimenti RED attesi

- `fights with the exact life of the ambush kilometre and keeps the plan on a victory (D-07, D-16, D-18)`: vita d'ingresso del motore 1000 invece di 945.
- `eats only the food of the travelled kilometres on a defeat and detours without a plan (D-03, D-04)`: dispensa intatta (28 invece di 25).
- `fights a legacy travel without a plan with the life it has (D-11)`: **verde al primo colpo**, atteso: senza piano il servizio di prima combatteva già con la vita salvata e non scriveva path del piano.

## Esiti

- Unit `src/travel/ambush`: 14 suite, 92 test verdi.
- Integration `src/travel/ambush` (`--runInBand`): 4 suite, 56 test verdi (`ambush-resolution`, `ambush-lifecycle`, `ambush-sweeper`, `ambush.processor`). Il caso `keeps the food eaten and charges nothing on the detour (D-11)` resta verde senza modifiche.
- Task 1: `ambush-resolution` + `ambush-sweeper` 33/33 con i default (documento seminato invariato).
- Boot reale `test/app.int-spec.ts`: 91/91 (costruttore cambiato, provider già esportato da `TravelPlanningModule`).
- `npx tsc --noEmit -p tsconfig.json` 0; `src/schema.gql` invariato.

## Deviations from Plan

- **Spostamento di `defeatOf`** (Boy Scout, nessun cambio di comportamento): l'helper era locale a `describe('defeat')`; il nuovo `describe('progressive food (Phase 20)')` lo usa, quindi è salito al describe esterno con la stessa firma.
- La vita 1000 delle prove viene dal livello 1 (`maxLifePoints` 1000 della tabella): nessuna opzione `hp` necessaria per i casi lunghi.

Nessuna spec unitaria costruisce `AmbushResolutionService` a mano: nessuno stub.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File modificati presenti; commit `c3f8bc48`, `5490dd5c`, `fa293c1b` nel log del ramo.
