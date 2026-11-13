---
phase: 20-cibo-e-vita-progressivi
plan: 09
subsystem: quests
tags: [quests, acceptance, departure, food, hunger, integration, cleanup]
requires:
  - 20-01 (foodPlanOf, ActiveTravelDraft.food, hpLostFor, uncoveredKmOf)
  - 20-08 (partenza libera col piano salvato, startTravelUpdate senza meal set)
provides:
  - laneClaimUpdate(lane, pendingQuestId, movement) senza meal set
  - claimLane col piano del cibo dentro il viaggio automatico, nessun consumo
  - travel-food.updates senza i builder del consumo alla partenza
affects: [20-10, 20-11]
tech-stack:
  added: []
  patterns:
    - il piano della partenza da quest viaggia nel movimento (`movementWithFoodPlan`), stesso schema della partenza libera
key-files:
  created:
    - .planning/phases/20-cibo-e-vita-progressivi/20-09-SUMMARY.md
  modified:
    - src/quests/acceptance/quest-acceptance.updates.ts
    - src/quests/acceptance/quest-acceptance.updates.spec.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/travel/food/travel-food.updates.ts
    - src/travel/food/travel-food.updates.spec.ts
decisions:
  - "Il claim della corsia standard non scrive più inventario né vita: il filtro tiene solo la guardia della prigione; `TRAVEL_STARVING` (pre-verifica e in transazione), codice della corsa e anteprima restano identici"
  - "Il movimento scritto si costruisce con una funzione pura di modulo `movementWithFoodPlan(movement, meal)` invece dell'espressione inline del piano: stesso risultato, `claimLane` resta corto"
  - "`mealGuardsOf` e `mealSetOf` rimossi con i loro sette casi: nessun chiamante di produzione; `mealLinesOf` resta per l'assestamento"
metrics:
  duration: ~20 min
  completed: 2026-11-12
---

# Phase 20 Plan 09: La partenza da quest salva il piano Summary

Il viaggio automatico della corsia standard salva il piano del cibo su `activeTravel.food` nello stesso update condizionale del claim (`foodPlanOf(meal.plan, movement.travel.road.distance)`) e non tocca più dispensa e vita; salto istantaneo, marker alla posizione, story e world mission restano senza piano e senza lettura della dispensa. Da questo piano nessun percorso della partenza scrive cibo o vita; i due builder del consumo alla partenza, rimasti senza chiamanti, sono stati rimossi.

## Task

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | spec del claim col piano salvato | `3bf205ab` test(quests): pin the saved food plan of the quest departure |
| 1 GREEN | claim: piano salvato, nessun consumo | `447067f3` feat(quests): save the food plan at the quest departure |
| 2 RED | via i casi dei builder della partenza | `fdf2fe91` test(travel): drop the departure meal builder cases |
| 2 GREEN | via i builder della partenza | `e415b18e` refactor(travel): drop the departure meal builders |
| 3 | bookkeeping | commit `docs(phase-20): record plan 09 progress` |

## Spec riscritte (titolo vecchio → nuovo)

`src/quests/acceptance/quest-acceptance.updates.spec.ts`:
- «laneClaimFilter appends the food and life guards of the automatic travel (D-12)» → «laneClaimFilter appends the extra guards of the claim (D-05)» (guardia della prigione presente, nessuna chiave `$and`)
- «laneClaimUpdate sets the food and life cost with the automatic travel (D-12)» → «laneClaimUpdate writes the saved food plan inside the automatic travel and nothing else (D-05)»

`src/quests/acceptance/quest-acceptance.service.int-spec.ts` (describe «food on the automatic travel (D-12)», helper nuovo locale `savedPlanOf(id)` = `activeTravel.food` raw):
- «eats the food of the automatic travel in the claim (D-06, D-12)» → «saves the food plan of the automatic travel in the claim without eating (D-05)»: dispensa `[foodStack(food1, needed), foodStack(food5, 1)]` intatta, vita 100, `food` = `{ needed, uncoveredKm: 0, coveredKm: route.distanceKm, hpLostTotal: 0, settledKm: 0, foodConsumedAt: null }`
- «eats all the food and lowers the life points of a partial cover in the claim (D-03, D-04)» → «saves the uncovered kilometres of a partial cover in the claim without charging (D-05, D-13)»: dispensa `[foodStack(food1, 1)]`, vita 100, `uncoveredKm` = `uncoveredKmOf(longNeeded, 1, longRoute.distanceKm)`, `hpLostTotal` = `hpLostFor` di quello
- «does not eat on an instant jump nor on a marker at the position (D-13)»: titolo invariato, aggiunta l'assenza del viaggio (e quindi del piano) per entrambi i personaggi
- «lets exactly one of two concurrent quest departures eat the same food (D-12)» → «lets exactly one of two concurrent quest departures save its food plan (D-05, D-14)»: dispensa invariata, un solo piano
- «keeps a concurrent non-food purchase made after the pantry read of the claim (D-20)» → «keeps a concurrent purchase made after the pantry read of the claim without eating (D-05, D-14)»: dispensa finale = iniziale + pozione
- «feeds the slower march of an injured character (D-01)» → «saves the food need of the slower march of an injured character (D-01, D-05)»: `food.needed` = `foodNeededFor(durationMsOf(route.baseHours, BASE_SPEED * 0.8))`, dispensa `LARDER` intatta
- Rifiuti 1726, 1759, corsa 1791 e story/world mission 1872 invariati e verdi.

`src/travel/food/travel-food.updates.spec.ts`: resta solo «turns the consumed food into LootItem sell lines (D-12)»; spariti i sette casi di `mealGuardsOf`/`mealSetOf` (il file non conteneva casi dello sweep: quelli del piano 04 vivono in altre spec).

## Esito RED

- Unit: i due casi riscritti di `quest-acceptance.updates.spec.ts` sono verdi al primo colpo: `laneClaimFilter` spargeva già le guardie extra e `laneClaimUpdate` scriveva il viaggio così com'era (il piano dentro il draft passa senza codice nuovo); il GREEN ha tolto il quarto parametro.
- Integration: 5 casi rossi come atteso (1654, 1693, 1921, 1961, 2007: il claim consumava ancora e non scriveva `food`); 1827 verde anche in RED (salto e marker non leggevano già la dispensa: l'asserzione nuova prova l'assenza del viaggio).

## Codice rimosso

- `src/travel/food/travel-food.updates.ts`: `mealGuardsOf`, `mealSetOf` e gli import rimasti senza uso (`applyTradeToInventory`, `InventorySnapshot`, `soldQuantityGuards`, `TravelFoodPlan`). Grep `mealGuardsOf|mealSetOf` su `src` e `test`: 0.
- `src/quests/acceptance/quest-acceptance.updates.ts`: parametro `mealSet` di `laneClaimUpdate`.
- `src/quests/acceptance/quest-acceptance.service.ts`: import da `src/travel/food/travel-food.updates`.

## Deviazioni dal piano

- **Forma del movimento scritto:** invece dell'espressione inline dell'`<interfaces>`, funzione pura di modulo `movementWithFoodPlan(movement, meal)` in `quest-acceptance.service.ts` (stesso risultato, `foodPlanOf(` = 1).
- **Boy Scout sui commenti:** aggiornati anche il commento della lettura della dispensa nel callback dell'accettazione e quello di `fedOrReject` («solo il viaggio ha un piano del cibo»), che parlavano ancora di consumo.
- Nessuna spec fuori piano da correggere: nessuna aspettativa stantia sulle chiavi del viaggio da quest (diversamente dal piano 08).

## Verifiche

- `npx jest src/quests/acceptance/quest-acceptance.updates.spec.ts --selectProjects unit`: 30/30.
- `npx jest src/quests/acceptance --selectProjects integration --runInBand`: 2 suite, 167/167 (comprende `accept-quest.resolver.int-spec.ts`: anteprima invariata).
- `npx jest src/travel/food --selectProjects unit`: 4 suite, 60/60.
- Nota del checker: `npx jest src/travel/ambush/ambush-lifecycle.int-spec.ts src/quests/pending-requests/standard-lane-liveness.int-spec.ts --selectProjects integration --runInBand`: 2 suite, 23/23 verdi.
- Corsa dell'orchestratore: `src/quests/acceptance` + `test/app.int-spec.ts` 3 suite, 258/258 (~28 s); `src/travel` integration 12 suite, 235/235 (~66 s).
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint puliti sui sei file; `git diff --exit-code src/schema.gql` vuoto; `pgrep -fl 'bin/jest'` vuoto.
- Accettazione: `foodPlanOf(` = 1 in `quest-acceptance.service.ts`; `mealGuardsOf|mealSetOf` = 0 nei due file dell'accettazione e in tutto `src`/`test`; `D-05` = 9 nella int-spec; `export function mealLinesOf` = 1.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File: i sei file modificati presenti.
- Commit: `3bf205ab`, `447067f3`, `fdf2fe91`, `e415b18e` presenti nel ramo.
