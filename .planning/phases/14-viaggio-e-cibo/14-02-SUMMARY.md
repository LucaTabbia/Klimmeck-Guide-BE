---
phase: 14-viaggio-e-cibo
plan: 02
subsystem: travel (codice della fame e builder puri della scrittura del pasto)
tags: [travel, food, gameRules, acceptance, BE-FOOD-03, BE-FOOD-05, D-04, D-06, D-11, D-12, D-16]
requires: [14-01]
provides:
  - "`GameRuleErrorCode.TRAVEL_STARVING` e `GameRuleException.travelStarving()` (400, `extensions` `{ code: 'TRAVEL_STARVING' }`, «Non hai cibo a sufficienza per il viaggio»)"
  - "`mealLinesOf(consumed)`, `mealGuardsOf(plan, hpRaw)`, `mealSetOf(plan, assets)` in src/travel/food/travel-food.updates.ts"
  - "parametro opzionale finale `guards`/`cost` su `startTravelFilter`, `startTravelUpdate`, `laneClaimFilter`, `laneClaimUpdate`"
affects: [14-03, 14-04, 14-06]
tech-stack:
  added: []
  patterns:
    - "Il cibo mangiato come righe di vendita `LootItem` senza incasso: riuso di `soldQuantityGuards` e `applyTradeToInventory` del negozio"
    - "Guardie e costo come ultimo argomento opzionale con spread in coda: le attese esistenti restano identiche"
key-files:
  created:
    - src/travel/food/travel-food.updates.ts
    - src/travel/food/travel-food.updates.spec.ts
  modified:
    - src/gameRules/game-rule-error-code.enum.ts
    - src/gameRules/game-rule.exception.ts
    - src/gameRules/game-rule.exception.spec.ts
    - src/travel/travel.updates.ts
    - src/travel/travel.updates.spec.ts
    - src/quests/acceptance/quest-acceptance.updates.ts
    - src/quests/acceptance/quest-acceptance.updates.spec.ts
decisions:
  - "La guardia sugli HP compare solo se `hpLost > 0`; un HP letto assente diventa `null` (matcha anche il campo mancante, Pitfall 5)"
  - "Senza cibo consumato il set non tocca `assets.ownedItems`; senza vita persa non tocca `status.currentLifePoints` (D-12)"
metrics:
  duration: "~12 min"
  completed: 2026-11-05
  tasks: 4
  files: 9
---

# Phase 14 Plan 02: codice della fame e builder del pasto Summary

Codice unico `TRAVEL_STARVING` con factory e messaggio italiano (D-11, D-16), costruttori puri di guardie e set del consumo in `src/travel/food/travel-food.updates.ts` che riusano il negozio (D-12), e un parametro opzionale finale sui quattro builder della partenza e del claim. Nessuno schema toccato (l'enum dei codici non è a SDL).

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 4e7432b | test(gameRules): expect the TRAVEL_STARVING code |
| 1 GREEN | 95fe794 | feat(gameRules): add the TRAVEL_STARVING code (D-11) |
| 2 RED | 55b064a | test(food): pin the guards and the cost of the meal |
| 2 GREEN | 998d567 | feat(food): build the guards and the cost of the meal (D-12) |
| 3 RED | 4b33343 | test(travel): expect the meal guards and cost on the departure builders |
| 3 GREEN | a4d9cff | feat(travel): accept the meal guards and cost on departure and claim |
| 4 | (questo commit) | docs(phase-14): record plan 02 progress |

## Fallimenti RED osservati

- Task 1: 3 test rossi su 37 — il caso parametrico `travelStarving`, «covers every GameRuleErrorCode exactly once» e il caso dedicato (D-11), tutti con `TypeError: GameRuleException.travelStarving is not a function` (ts-jest non fa type check: niente errore di compilazione).
- Task 2: la suite nuova fallisce con `Cannot find module './travel-food.updates'`.
- Task 3: 4 test rossi su 52 per asserzione (`$and` e `status.currentLifePoints` mancanti nell'output), NON per compilazione come previsto dal piano: ts-jest non controlla l'arità; `npx tsc` invece segnalava `TS2554` sulle quattro chiamate (annotato come atteso dal piano).

## Firme create

- `mealLinesOf(consumed: readonly ConsumedFood[]): TradeLine[]` → righe `{ direction: 'sell', kind: 'LootItem', itemId, quantity }`.
- `mealGuardsOf(plan: TravelFoodPlan, hpRaw: number | null | undefined): Record<string, unknown>` → `{}` senza costo, altrimenti `{ $and: [guardia per stack…, { 'status.currentLifePoints': hpRaw ?? null }] }` (HP solo se `hpLost > 0`).
- `mealSetOf(plan: TravelFoodPlan, assets: InventorySnapshot): Record<string, unknown>` → `'assets.ownedItems'` ricalcolato (stack a zero rimossi) se `consumed` non è vuoto, `'status.currentLifePoints': hpAfter` se `hpLost > 0`.
- `startTravelFilter(characterId, location, guards = {})`, `startTravelUpdate(travel, cost = {})`, `laneClaimFilter(characterId, lane, snapshot, questId, repeatable, guards = {})`, `laneClaimUpdate(lane, pendingQuestId, movement = null, cost = {})`: spread in coda al letterale (filtro) e al `$set` (update).

## Deviations from Plan

Nessuna deviazione di codice. Nota di processo: il RED del task 3 è arrivato come fallimento di asserzione e non di compilazione (vedi sopra). STATE.md usa il formato `Plan: 2 of 8` come prescritto dal brief dell'orchestratore (il grep del task 4 cerca `Plan: 02 of 8`: il brief prevale).

## Verifiche

- `npx jest src/gameRules --selectProjects unit`: 37/37; `npx jest src/travel/food --selectProjects unit`: 30/30; `npx jest src/travel src/quests/acceptance --selectProjects unit`: 300/300 (13 suite).
- `npx tsc --noEmit -p tsconfig.json`: 0 dopo ogni GREEN.
- prettier `--write` + eslint sui 9 file: puliti.
- `src/schema.gql` invariato; diff contro origin/develop senza righe tolte.
- Diff delle due spec dei builder da `HEAD~2`: zero righe tolte.

## Known Stubs

Nessuno.

## Self-Check: PASSED
