---
phase: 20-cibo-e-vita-progressivi
plan: 07
subsystem: travel
tags: [travel, teleport, food, hunger, integration]
requires:
  - 20-02 (foodLegOf, settlementOf, reachedKmOf, settlementSetOf, settlementGuardsOf, TravelPantryReader.read)
  - 20-03 (buildFoodTravelDoc)
provides:
  - teleportUpdate(poiId, geography, closingSet) e TELEPORT_FOOD_PROJECTION
  - teleport a viaggio iniziato assestato come una sconfitta (momento stop) in TravelService
affects: [20-08, 20-09, 20-10, 20-11]
tech-stack:
  added: []
  patterns:
    - lettura in sessione del viaggio e della dispensa prima del findOneAndUpdate del teleport, guardie dell'assestamento nel suo filtro
key-files:
  created:
    - .planning/phases/20-cibo-e-vita-progressivi/20-07-SUMMARY.md
  modified:
    - src/travel/travel.updates.ts
    - src/travel/travel.updates.spec.ts
    - src/travel/travel.service.ts
    - src/travel/teleport.resolver.int-spec.ts
decisions:
  - "Il teleport prende l'ora dalla porta `Clock` (ultimo parametro del costruttore di `TravelService`) fuori dal callback: un retry per WriteConflict rilegge viaggio e dispensa ma assesta allo stesso istante"
  - "Assestamento nullo (nessuna fame, nessun pasto) = filtro e update del teleport identici a prima"
  - "Il set di chiusura porta solo vita e dispensa: `status.activeTravel` diventa null nello stesso update, nessun path del piano"
metrics:
  duration: ~20 min
  completed: 2026-11-12
---

# Phase 20 Plan 07: Teleport a viaggio iniziato Summary

Il teleport dell'oste su un viaggio col piano del cibo chiude il viaggio come una sconfitta: dentro la stessa transazione `TravelService` rilegge il viaggio e la dispensa, calcola l'assestamento `stop` al km del momento (`min(travelKmAt(now), ambush.km)`) e lo fonde nel `findOneAndUpdate` del teleport, con le guardie su `settledKm`, pasto pendente, vita e quantità. Viaggio legacy, deviazione e personaggio fermo passano intatti.

## Task

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | casi del set di chiusura e della proiezione | `55b919f0` |
| 1 GREEN | `teleportUpdate` con `closingSet`, `TELEPORT_FOOD_PROJECTION` | `2f16a972` |
| 2 RED | casi del teleport a viaggio seminato al posto del caso Phase 14 D-13 | `e93e6ffb` |
| 2 GREEN | `Clock` nel costruttore, `closingFoodOf`, fusione di filtro e update | `88d99b30` |
| 3 | bookkeeping | (commit docs di fine piano) |

## Fallimenti RED attesi

- Task 1: 2 falliti su 26 (`teleportUpdate` ignorava il terzo argomento; `TELEPORT_FOOD_PROJECTION` non esisteva).
- Task 2: 4 falliti su 25 (vita 1000 invece di 994, dispensa intatta): il teleport non toccava né dispensa né vita. Il caso legacy/fermo `(D-04, D-11, D-17)` è verde al primo colpo, come previsto: oggi il teleport non tocca il cibo per nessuno.

## Casi provati (`teleport.resolver.int-spec.ts`, `describe('progressive food on teleport (Phase 20)')`)

Viaggio di 20 km in un'ora seminato con `buildFoodTravelDoc` da 15 minuti prima di `clock.now()` a 45 minuti dopo (km 5), cibo `F1` da 1 power:

- piano `{ needed: 20, uncoveredKm: 18, coveredKm: 2, hpLostTotal: 171 }`, `F1 × 2` → vita 994, dispensa vuota, viaggio null, posizione aggiornata
- piano coperto, `F1 × 20` → 5 unità mangiate, 15 restano, vita intatta
- **nota del checker:** dispensa abbondante oltre il confine, primo piano con `F1 × 10` → si tolgono solo le 5 unità del fabbisogno pro-rata, vita 994
- imboscata pendente al km 3 → fame 1, 2 unità mangiate
- viaggio senza piano e personaggio fermo con `F1 × 5` → dispensa e vita identiche, posizioni aggiornate

## Esiti

- `travel.updates.spec.ts` 26/26; unit `src/travel` 24 suite / 258 test.
- `teleport.resolver.int-spec.ts` + `travel.service.int-spec.ts` 49/49; boot reale `test/app.int-spec.ts` 91/91 (costruttore cambiato).
- `npx tsc --noEmit -p tsconfig.json` 0; SDL invariato; `travel-admin.resolver.ts` invariato (ruolo, mutation, audit).

## Deviations from Plan

- **Caso in più (nota del checker nelle REPO-RULES):** `eats only the pro-rata food past the covered kilometres with a plentiful pantry (D-17)`.
- Il viaggio seminato è relativo a `clock.now()` e non a 09:45 fisse: il `FixedClock` della spec è condiviso e un caso precedente lo fa avanzare.

Nessun'altra deviazione. File già Prettier-clean, nessun commit `style`.

## Self-Check: PASSED

- File modificati presenti; commit `55b919f0`, `2f16a972`, `e93e6ffb`, `88d99b30` nel log del ramo.
