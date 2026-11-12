---
phase: 20-cibo-e-vita-progressivi
plan: 08
subsystem: travel
tags: [travel, departure, food, hunger, integration, end-to-end]
requires:
  - 20-01 (foodPlanOf, ActiveTravelDraft.food, hpLostFor, uncoveredKmOf)
  - 20-03 (assestamento all'arrivo)
  - 20-04 (TravelSweeper con il passo «fame»)
  - 20-07 (teleport a viaggio iniziato)
provides:
  - startTravelUpdate(travel) col piano del cibo dentro il viaggio, nessun meal set
  - TravelService.departWithFoodPlan: piano salvato nella transazione della partenza, nessun consumo
  - prova fine a fine dei totali identici alla Phase 14
affects: [20-09, 20-10, 20-11]
tech-stack:
  added: []
  patterns:
    - il piano della partenza viaggia nel draft (`{ ...plan.travel, food: foodPlanOf(meal, distance) }`), un solo path scritto
key-files:
  created:
    - .planning/phases/20-cibo-e-vita-progressivi/20-08-SUMMARY.md
  modified:
    - src/travel/travel.updates.ts
    - src/travel/travel.updates.spec.ts
    - src/travel/travel.service.ts
    - src/travel/travel.service.int-spec.ts
decisions:
  - "La partenza libera non scrive più inventario né vita: il filtro tiene solo la guardia della prigione, il rifiuto `TRAVEL_STARVING` e il codice della corsa restano identici"
  - "`mealGuardsOf`/`mealSetOf` non sono più importati da `travel.service.ts`; restano esportati per il claim fino al piano 09"
metrics:
  duration: ~25 min
  completed: 2026-11-12
---

# Phase 20 Plan 08: La partenza libera salva il piano Summary

La partenza libera calcola il piano con `planTravelFood` nella stessa transazione e lo salva su `activeTravel.food` (`foodPlanOf(meal, plan.travel.road.distance)`), senza toccare dispensa e vita; rifiuto per fame, codice della corsa e anteprima restano quelli di prima. Una partenza vera seguita da sweep a scatti con `FixedClock` e dall'arrivo dà gli stessi totali della Phase 14.

## Task

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | spec della partenza col piano salvato | `6dc78937` test(travel): pin the saved food plan of the free departure |
| 1 GREEN | partenza libera: piano salvato, nessun consumo | `f674973d` feat(travel): save the food plan at the free departure |
| 2 | prova fine a fine | `a6727974` test(travel): prove the Phase 14 totals end to end |
| 3 | bookkeeping | commit `docs(phase-20): record plan 08 progress` |

## Spec riscritte (titolo vecchio → nuovo)

`src/travel/travel.updates.spec.ts`:
- «startTravelFilter appends the food and life guards (D-12)» → «startTravelFilter appends the extra guards of the departure (D-05)»
- «startTravelUpdate sets the food and life cost with the travel (D-12)» → «startTravelUpdate writes the saved food plan inside the travel and nothing else (D-05)»

`src/travel/travel.service.int-spec.ts` (describe «food at departure (D-12)» → «food plan at departure (D-05)»):
- «eats the selected food at departure and keeps the life points when covered (D-06, D-12)» → «saves the food plan at departure and leaves food and life untouched when covered (D-05)»
- «eats all the food and lowers the life points on a partial cover (D-03, D-04)» → «saves the uncovered kilometres of a partial cover without eating nor charging (D-05, D-13)»
- «charges the life of the whole road without food (D-02)» → «saves the whole road as uncovered without food and keeps the life (D-05)»
- helper `eatenAtDeparture` → `neededAtDeparture` (legge `food.needed`, asserisce la dispensa `foodStack(food1, LARDER)` intera); i tre D-01 asseriscono gli stessi numeri: «halves the food need with a mount of speed two (D-01)», «raises the food need of an injured traveller with the slower march (D-01)», «needs more food on a slow road than on the plain (D-01)»
- «lets exactly one of two concurrent departures eat the same food (D-12)» → «lets exactly one of two concurrent departures save its food plan (D-05, D-14)»
- «keeps a concurrent non-food purchase made after the pantry read (D-20)» → «keeps a concurrent purchase made after the pantry read without eating at departure (D-05, D-14)»
- 372 (rifiuto) e 388 (corsa) invariati e verdi.

## Esito RED

- Unit: i due casi riscritti dei builder sono verdi al primo colpo: `startTravelFilter` spargeva già le guardie extra e `startTravelUpdate` scriveva il draft così com'era (il piano dentro il draft passa senza codice nuovo); il GREEN ha tolto il parametro `mealSet`.
- Integration: 9 casi rossi come atteso (consumo e vita ancora alla partenza, `food` assente), compreso il caso Phase 15 sotto (deviazione).

## Prova fine a fine (task 2)

Nuovo `describe('TravelService progressive food end to end (Phase 20)')` con harness proprio (`createCharactersTestApp`, `SequenceChance` vuota = nessuna imboscata, `FixedClock` riportato a `STARTED_AT` in `beforeEach`), personaggio ad Alba con 1000 HP, R1 Alba → Borgo.

Numeri misurati (copertura parziale): `needed` = 401 power, coperti 200, distanza 20,015 km, durata 72 054 312 ms, km scoperti `uncoveredKmOf(401, 200, 20,015)` = 11, HP persi = `hpLostFor(11)` = 66. Vita dopo ciascuno degli otto sweep: 1000, 1000, 1000, 997, 985, 964, 934, 934 (mai in salita; l'ultimo sweep completa il viaggio). Dispensa finale `[]`, posizione = Borgo, `activeTravel` null.

Copertura piena con avanzo (`F1 × needed`, `F5 × 2`): dispensa finale = `applyTradeToInventory(iniziale, mealLinesOf(selectFood(needed, stacks).consumed))`, vita intatta.

Entrambi i casi sono verdi al primo colpo: la catena dei piani 01–08 (piano salvato, sweep con passo «fame», pasto al confine, arrivo) era già completa dopo il task 1; i casi sono committati come prova d'integrazione, nessun `fix` servito.

## Deviazioni dal piano

### Auto-fixed Issues

**1. [Rule 1 - Bug di test] Chiavi del viaggio pinnate nel caso Phase 15**
- **Trovato durante:** task 1 (RED)
- **Problema:** «draws nothing under ten km and writes no ambush field (D-03)» pinna `Object.keys(activeTravel)`: da questo piano il viaggio porta anche `food`. Il piano diceva «casi del Phase 15 verdi senza modifiche».
- **Fix:** aggiunta la chiave `'food'` alla lista attesa (il caso continua a provare l'assenza dei campi d'imboscata).
- **File:** `src/travel/travel.service.int-spec.ts`
- **Commit:** `6dc78937`

Nessun'altra spec fuori piano da correggere: `teleport.resolver.int-spec.ts` (i casi con `travellingToB` ora assestano un viaggio col piano, km ~0) e `ambush-lifecycle.int-spec.ts` sono verdi senza modifiche.

## Verifiche

- `npx jest src/travel/travel.updates.spec.ts --selectProjects unit`: 26/26.
- `npx jest src/travel/travel.service.int-spec.ts src/travel/travel.resolver.int-spec.ts src/travel/food/travel-pantry.reader.int-spec.ts src/travel/teleport.resolver.int-spec.ts src/travel/ambush/ambush-lifecycle.int-spec.ts --selectProjects integration --runInBand`: 5 suite, 93/93 (prima del task 2).
- Nota del checker: `src/travel/ambush/ambush-lifecycle.int-spec.ts` verde (nella corsa sopra e in quella completa).
- `src/quests/acceptance/quest-acceptance.service.int-spec.ts` + `test/app.int-spec.ts`: 213/213.
- A fine piano: unit `src/travel` 24 suite / 258 test; integration `src/travel` + `test/app.int-spec.ts` 13 suite / 326 test (235 viaggio + 91 boot reale).
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint puliti sui quattro file; `git diff --exit-code src/schema.gql` vuoto.
- Accettazione: `foodPlanOf(` = 1, `mealGuardsOf|mealSetOf` = 0, `departWithFoodPlan` = 2 in `travel.service.ts`; `eatenAtDeparture` = 0, `D-05` = 8, `D-13)` = 3, `TravelSweeper` = 2, «progressive food end to end» = 1 nella int-spec.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File: `src/travel/travel.service.ts`, `src/travel/travel.updates.ts`, `src/travel/travel.updates.spec.ts`, `src/travel/travel.service.int-spec.ts` presenti.
- Commit: `6dc78937`, `f674973d`, `a6727974` presenti nel ramo.
