---
phase: 14-viaggio-e-cibo
plan: 01
subsystem: travel (modulo puro del cibo di viaggio)
tags: [travel, food, knapsack, BE-FOOD-01, BE-FOOD-02, BE-FOOD-03, D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-17]
requires: []
provides:
  - "`FOOD_RULES = { minutesPerPower: 3, minLifePoints: MIN_LIFE_POINTS } as const` in src/travel/food/travel-food.ts"
  - "`foodNeededFor(durationMs)`, `uncoveredKmOf(needed, covered, distanceKm)`, `hpLostFor(uncoveredKm)`, `planTravelFood(input: TravelFoodInput): TravelFoodPlan`"
  - "`FoodStack`, `ConsumedFood`, `FoodSelection`, `selectFood(needed, stacks)` in src/travel/food/food-selection.ts"
affects: [14-02, 14-03, 14-04, 14-05, 14-06]
tech-stack:
  added: []
  patterns:
    - "Bounded knapsack lessicografico (unità, rame) con splitting binario e tetto `needed + maxPower − 1`: il costo non dipende dalle quantità"
    - "Km scoperti in metri interi (`Math.round(distanceKm * 1000)`), nessun epsilon"
key-files:
  created:
    - src/travel/food/travel-food.ts
    - src/travel/food/travel-food.spec.ts
    - src/travel/food/food-selection.ts
    - src/travel/food/food-selection.spec.ts
  modified: []
decisions:
  - "`consumed` segue l'ordine degli stack in input (dopo filtro e deduplica), la DP lavora su una copia ordinata per id esadecimale (D-17, D-06)"
  - "Stack duplicati dello stesso id: conta solo la prima occorrenza (`sameId`), come `applyTradeToInventory` che scala solo la prima voce"
  - "`sellCopper` non finito o negativo vale 0 nella DP"
metrics:
  duration: "~15 min"
  completed: 2026-11-05
  tasks: 3
  files: 4
---

# Phase 14 Plan 01: modulo puro del cibo di viaggio Summary

Regola del cibo di viaggio come modulo puro in `src/travel/food/`: fabbisogno ⌈durata / 180 000 ms⌉, selezione a scarto minimo → meno unità → minor vendita in rame → id più basso con un bounded knapsack limitato, km scoperti per eccesso in metri interi, vita persa n(n+1)/2 e piano completo con la soglia di 1 HP all'arrivo. Nessun I/O, nessuna variabile d'ambiente, nessun `Math.random`.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | f9035f8 | test(food): pin the food need, the uncovered km and the life cost |
| 1 GREEN | 9ff60da | feat(food): add the food need, uncovered km and life cost rules |
| 2 RED | 5ae664f | test(food): pin the minimum waste selection and the travel plan |
| 2 GREEN | c49614c | feat(food): select the food with minimum waste and plan the travel |
| 3 | (questo commit) | docs(phase-14): record plan 01 progress |

## Fallimenti RED osservati

- Task 1: `travel-food.spec.ts` falliva all'import, «Cannot find module './travel-food'» (0 test eseguiti). Il caso dei metri interi è rosso anche contro la formula in km float: `Math.ceil((55 - 5) * 1.1 / 55)` dà 2 (verificato con node), l'attesa è 1.
- Task 2: `food-selection.spec.ts` falliva all'import, «Cannot find module './food-selection'»; in `travel-food.spec.ts` i 5 casi del piano fallivano con «planTravelFood is not a function» (l'import di `FoodStack` è di solo tipo e viene eliso), i 5 casi del Task 1 restavano verdi.

## Misure

- Caso di bound (33 stack con power `5 + 6i` e quantità 2·10^9, fabbisogno 16 460): 12 ms nel test (`performance.now()`, soglia 1000 ms), coerente con i 12,3 ms della ricerca.
- Tutti i numeri del `<behavior>` sono tornati al primo colpo: nessuna attesa ri-derivata.

## Effetto collaterale dichiarato

I km scoperti si calcolano sulla distanza **arrotondata al metro** (`Math.round(distanceKm * 1000)`), poi aritmetica intera con divisione finale per eccesso (D-07 emendato): 55/5/1,1 → 1 km (in km float sarebbe 2), 55/40/16,01 → 5, 89/0/22,24 → 23.

## Nomi e firme creati

- `src/travel/food/food-selection.ts`: `interface FoodStack { itemId: Types.ObjectId; power: number; sellCopper: number; quantity: number }`, `interface ConsumedFood { itemId; quantity }`, `interface FoodSelection { consumed: ConsumedFood[]; covered: number }`, `selectFood(needed: number, stacks: readonly FoodStack[]): FoodSelection`; private `edibleStacksOf`, `isEdible`, `sellCopperOf`, `eatEverything`, `byHexId`, `packetsOf`, `knapsack`, `rebuild`.
- `src/travel/food/travel-food.ts`: `FOOD_RULES`, `TravelFoodInput { durationMs; distanceKm; hpBefore; stacks }`, `TravelFoodPlan { consumed; needed; covered; uncoveredKm; hpLost; hpAfter; arrivesAlive }`, `foodNeededFor`, `uncoveredKmOf`, `hpLostFor`, `planTravelFood`.

## Deviations from Plan

1. **[Rule 1 - formato] `Plan: 1 of 8` invece di `Plan: 01 of 8` in STATE.md.** Il brief dell'orchestratore impone `Plan: 1 of 8`, coerente con la riga esistente `Plan: 0 of 8`; il grep di verifica del Task 3 (`Plan: 01 of 8`) quindi non matcha: vince il brief.
2. **SUMMARY nel commit di bookkeeping.** Il piano non prescrive un commit separato per il SUMMARY: SUMMARY, ROADMAP, STATE e VALIDATION stanno in `docs(phase-14): record plan 01 progress`.
3. Dettagli d'implementazione a parità di comportamento: `selectFood` esce subito con `{ consumed: [], covered: 0 }` anche quando non resta nessuno stack valido (stesso esito del ramo «consuma tutto» con totale 0); il miglioramento stretto della DP è scritto come guardia inversa (`continue` se `u > units[s]` oppure `u === units[s] && v >= sell[s]`). Nella spec dei non validi il sesto stack (quantity 1,5) usa l'id `…a7`.

Nessun caso verde al primo colpo nei RED; nessun file fuori da `src/travel/food/` toccato dal codice; `src/schema.gql` invariato.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: travel-food.ts, travel-food.spec.ts, food-selection.ts, food-selection.spec.ts.
- Commit presenti: f9035f8, 9ff60da, 5ae664f, c49614c.
