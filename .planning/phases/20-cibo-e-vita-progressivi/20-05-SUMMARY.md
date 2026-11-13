---
phase: 20-cibo-e-vita-progressivi
plan: 05
subsystem: travel
tags: [travel, ambush, food, hunger, pure]
requires:
  - 20-02 (foodLegOf, settlementOf, foodProgressSetOf, settlementGuardsOf, stacksOf, FoodCatalogEntry, mealLinesOf)
provides:
  - AmbushFood, AmbushFoodInput, ambushFoodOf, withFoodSettlement, defeatSettlementOf in src/travel/ambush/ambush-food.ts
  - AmbushTravelSnapshot.food?, AmbushPlanInput.food? e fame/pasto in planAmbushOutcome
affects: [20-06, 20-10, 20-11]
tech-stack:
  added: []
  patterns:
    - passo «cibo» puro preparato dallo snapshot in sessione, applicato dal piano puro
    - una sola lista di guardie, quella di settlementGuardsOf (il filtro dell'imboscata non ne ha)
key-files:
  created:
    - src/travel/ambush/ambush-food.ts
    - src/travel/ambush/ambush-food.spec.ts
    - .planning/phases/20-cibo-e-vita-progressivi/20-05-SUMMARY.md
  modified:
    - src/travel/ambush/ambush-plan.ts
    - src/travel/ambush/ambush-plan.spec.ts
decisions:
  - "La fame dell'imboscata si assesta al km salvato `ambush.km`, mai dall'ora del chiamante (D-16)"
  - "`hpBefore` non cambia codice: nasce dallo snapshot già passato da `withFoodSettlement` (D-18)"
  - "In sconfitta il filtro guarda `defeatSettlementOf(food)` (pasto del confine o dei km percorsi, uno solo dei due); in vittoria guarda `food.progress`"
  - "`defeatSettlementOf` con entrambi i consumi presenti (caso teorico) prende `ownedItems` dalla sconfitta, calcolata sulla dispensa dopo il confine"
metrics:
  duration: ~20 min
  completed: 2026-11-12
---

# Phase 20 Plan 05: Imboscata, parte pura Summary

Passo «cibo» dell'imboscata puro (`ambushFoodOf`: fame e pasto al km salvato, pasto dei km percorsi per la sconfitta) e `planAmbushOutcome` che lo applica: vittoria con `settledKm` e pasto del confine, sconfitta col cibo dei km percorsi nella scrittura dei consumabili, deviazione senza piano, guardie del piano solo se il viaggio lo ha.

## Task

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | spec del passo «cibo» | `51e80a80` |
| 1 GREEN | `ambush-food.ts` | `98b547e9` |
| 2 RED | casi Phase 20 nel piano puro | `3ac5a518` |
| 2 GREEN | fame e pasto in `planAmbushOutcome` | `6f6f4d9a` |
| 3 | bookkeeping | commit `docs(phase-20): record plan 05 progress` |

## Fallimenti RED attesi

- Task 1: suite intera in errore per il modulo `./ambush-food` assente.
- Task 2: 3 casi su 7 rossi (`writes the settled kilometre…`, `eats the meal of the travelled kilometres…`, `guards the settled kilometre…`) perché il piano ignorava `food`.

## Casi verdi al primo colpo (Task 2)

- `reports the life at the ambush kilometre, hunger included (D-18)`: lo snapshot arriva già assestato da `withFoodSettlement`; è proprio la decisione «nessun codice per `hpBefore`».
- `keeps the saved plan untouched on a victory inside the covered stretch (D-07)`: prima del GREEN il piano non scriveva path del cibo; il caso protegge dal futuro.
- `eats nothing more on a defeat past the boundary meal (D-03)`: la dispensa è già vuota nello snapshot assestato e `defeat` è `null`.
- `writes and guards no food path for a legacy travel (D-11)`: verde come previsto dal piano.

## Esiti

- `npx jest src/travel/ambush/ambush-food.spec.ts --selectProjects unit`: 6/6.
- `npx jest src/travel/ambush --selectProjects unit`: 14 suite, 92 test, verdi (i casi esistenti senza `food` invariati).
- `npx tsc --noEmit -p tsconfig.json`: 0. eslint e prettier puliti sui quattro file. `src/schema.gql` invariato.
- `ambush-food.ts` importa da `./ambush-plan` solo `import type` (nota del checker): nessun ciclo a runtime.

## Deviazioni dal piano

1. **[Rule 1 - Bug del test] sentinella del viaggio legacy nella spec del task 1.** Il primo GREEN ha mostrato che `foodAt(290, undefined)` faceva scattare il default `plan()` del parametro: la spec usa ora `NO_PLAN = null` (nessuna chiave `food`). Correzione inclusa nel commit GREEN `98b547e9`.
2. Tipo d'ingresso nominato `AmbushFoodInput` (esportato) invece di un letterale inline nella firma di `ambushFoodOf`: stessa forma del contratto.

## Known Stubs

Nessuno. Il servizio dell'imboscata non passa ancora `food` (lo cabla il piano 06, come da obiettivo).

## Self-Check: PASSED

- File: `src/travel/ambush/ambush-food.ts`, `src/travel/ambush/ambush-food.spec.ts` presenti.
- Commit: `51e80a80`, `98b547e9`, `3ac5a518`, `6f6f4d9a` presenti in `git log`.
