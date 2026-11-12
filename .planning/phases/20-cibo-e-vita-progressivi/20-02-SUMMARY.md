---
phase: 20-cibo-e-vita-progressivi
plan: 02
subsystem: travel
tags: [travel, food, hunger, settlement, pure-functions]
requires:
  - 20-01 (ActiveTravelFoodDraft, coveredKmOf, hungerBetween, travelKmAt)
provides:
  - FoodMoment, FoodLeg, FoodSettlementInput, FoodSettlement, FoodCurveRewrite, ReachableTravel
  - settlementOf, settlementIsDue, reachedKmOf, foodLegOf
  - settlementSetOf, foodProgressSetOf, settlementGuardsOf
  - TravelPantryReader.foodCatalogFor pubblico, stacksOf e FoodCatalogEntry esportati
affects: [20-03, 20-04, 20-05, 20-06, 20-07, 20-08, 20-09]
tech-stack:
  added: []
  patterns:
    - assestamento puro unico per sweep, imboscata, arrivo e teleport
    - guardie composte in una sola lista tramite soldQuantityGuards (Pitfall 9)
key-files:
  created:
    - src/travel/food/travel-food-settlement.ts
    - src/travel/food/travel-food-settlement.spec.ts
  modified:
    - src/travel/food/travel-pantry.reader.ts
    - src/travel/food/travel-pantry.reader.int-spec.ts
decisions:
  - "Il fail-safe D-19 gira solo per il momento progress col pasto dovuto; arrival e stop tengono la curva salvata"
  - "foodLegOf rifiuta anche una durata negativa, un viaggio senza road e un foodConsumedAt che non è una Date (D-11)"
metrics:
  duration: ~25 min
  completed: 2026-11-12
  tasks: 3
  files: 4
---

# Phase 20 Plan 02: Assestamento puro della fase Summary

Modulo puro `travel-food-settlement.ts`: `settlementOf` decide fame incrementale (clampata a 1 HP, mai `lifePointsWithin`) e pasto unico nei tre momenti `progress`/`arrival`/`stop` con selezione pro-rata alla sosta e fail-safe della curva al confine; builder di set (`settlementSetOf`, `foodProgressSetOf`) e di filtro (`settlementGuardsOf`) pronti per i cinque chiamanti; catalogo del cibo leggibile da fuori con `TravelPantryReader.foodCatalogFor` e `stacksOf` esportato.

## Task

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | spec dell'assestamento puro | `064dcc89` test(travel): pin the pure food settlement |
| 1 GREEN | `settlementOf`, `settlementIsDue`, `reachedKmOf`, `foodLegOf` | `4cd292a9` feat(travel): add the pure food settlement |
| 2 RED | spec dei builder e del catalogo | `fb853c66` test(travel): pin the food settlement writes and the food catalogue |
| 2 GREEN | builder di set e guardie, catalogo pubblico | `51c36fd5` feat(travel): add the settlement writes and share the food catalogue |
| 3 | bookkeeping | commit `docs(phase-20): record plan 02 progress` |

## Fallimenti RED attesi

- Task 1: la suite non si carica, `Cannot find module './travel-food-settlement'`.
- Task 2: unit 8 rossi su 28 (`settlementSetOf` / `foodProgressSetOf` / `settlementGuardsOf is not a function`), integration 1 rosso su 9 (`reader.foodCatalogFor is not a function`, `stacksOf` non esportato).

Nessun caso verde al primo colpo nei commit RED.

## Esiti

- `travel-food-settlement.spec.ts`: 28/28 verdi (20 dell'assestamento, 8 dei builder).
- Unit `src/travel/food`: 4 suite, 67 test verdi.
- `travel-pantry.reader.int-spec.ts` (integration, `--runInBand`): 9/9 verdi.
- `npx tsc --noEmit -p tsconfig.json`: 0. `git diff --exit-code src/schema.gql`: 0. Prettier ed ESLint puliti sui quattro file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Copertura] Rami di `foodLegOf` provati in più**
- **Found during:** Task 1
- **Issue:** la `<behavior>` non provava durata negativa, viaggio senza `road`, `foodConsumedAt` non `Date` né un `foodConsumedAt` valorizzato letto correttamente; `./src/travel/` è a rischio di coverage (REPO-RULES).
- **Fix:** tre candidati malformati in più e un'asserzione sul `foodConsumedAt` valorizzato nel caso `D-11)`.
- **Files modified:** `src/travel/food/travel-food-settlement.spec.ts`
- **Commit:** `4cd292a9`

**2. [Rule 1 - Lint] Destrutturazioni inutilizzate nella spec**
- **Found during:** Task 1 (ESLint: due `no-unused-vars` warning)
- **Fix:** piano salvato e viaggio senza `food` costruiti come letterali invece che per destrutturazione.
- **Commit:** `4cd292a9`

Altre note:
- Esportati in più `FoodCurveRewrite` (tipo del campo `curve`) e `ReachableTravel` (parametro di `reachedKmOf`): stesse forme dell'`<interfaces>`, solo con un nome.
- Il caso «stop oltre il confine» confronta `consumed` e `ownedItems` delle due chiamate (non l'intero esito) e fissa anche il valore atteso `F20 × 28`.
- Nella VALIDATION spuntata anche la voce Wave 0 di `travel-food-settlement.spec.ts`.

## Threat model

T-20-05 (`settlementGuardsOf` riafferma `settledKm` e `foodConsumedAt` nullo), T-20-06 (clamp a `MIN_LIFE_POINTS`), T-20-07 (`ownedItems` da `applyTradeToInventory` sullo snapshot del chiamante + `soldQuantityGuards`), T-20-08 (nessun path del piano con `food` nullo, caso `D-11)`), T-20-09 (`foodLegOf`), T-20-10 (una sola lista di guardie, caso dedicato): tutti mitigati e provati.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: `src/travel/food/travel-food-settlement.ts`, `src/travel/food/travel-food-settlement.spec.ts`.
- Commit presenti: `064dcc89`, `4cd292a9`, `fb853c66`, `51c36fd5`.
