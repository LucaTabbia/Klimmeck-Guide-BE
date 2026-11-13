---
phase: 20-cibo-e-vita-progressivi
plan: 03
subsystem: travel
tags: [travel, food, hunger, arrival, completion, transaction]
requires:
  - 20-02 (foodLegOf, settlementOf, settlementSetOf, settlementGuardsOf)
  - Phase 14 (TravelPantryReader.read)
provides:
  - COMPLETION_PROJECTION con road.distance, duration e food; CompletedSnapshot esteso
  - TravelCompletionService.settleArrivalFood (privato) nella transazione di complete
  - fixture FOOD_TRAVEL_KM, buildActiveTravelFood, buildFoodTravelDoc
affects: [20-04, 20-05, 20-06, 20-07, 20-08, 20-09, 20-10, 20-11]
tech-stack:
  added: []
  patterns:
    - assestamento come seconda scrittura nello stesso callback del completamento (come la geografia)
    - guardia mancata = errore che abortisce la transazione (lo riprende lo sweep)
key-files:
  created:
    - .planning/phases/20-cibo-e-vita-progressivi/20-03-SUMMARY.md
  modified:
    - test/travel/active-travel.fixture.ts
    - src/travel/travel.updates.ts
    - src/travel/travel.updates.spec.ts
    - src/travel/travel-completion.service.ts
    - src/travel/travel-completion.int-spec.ts
decisions:
  - "L'arrivo assesta con targetKm = distanza e moment arrival, guardie senza piano (settlementGuardsOf(null, …)): il piano è già null nella pipeline"
  - "TravelPantryReader iniettato in coda al costruttore di TravelCompletionService; nessuna spec lo costruisce a mano, nessuno stub servito"
metrics:
  duration: ~10 min
  completed: 2026-11-12
---

# Phase 20 Plan 03: l'arrivo assesta fame e cibo — Summary

L'arrivo di un viaggio col piano scala la fame da `settledKm` a fine percorso (clamp a 1, nessun abbassamento al massimo) e, se il pasto non è avvenuto, consuma il cibo sul fabbisogno totale (b), dentro la stessa transazione di `TravelCompletionService.complete`; i viaggi legacy arrivano come prima.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | `88a40f48` | test(travel): pin the food plan in the completion projection |
| 1 GREEN | `23ef7d2b` | feat(travel): read the food plan with the completed travel |
| 2 RED | `7e138bfc` | test(travel): pin the progressive food on arrival |
| 2 GREEN | `df1ea364` | feat(travel): settle hunger and food on arrival |

## Fallimenti RED attesi

- Task 1: `toEqual` della proiezione senza le tre chiavi `status.activeTravel.road.distance`, `.duration`, `.food` (1 fallito, 23 verdi).
- Task 2: i cinque casi col piano falliscono sulla vita (`Expected 945 / Received 1000`, `951 / 1000` per i 49 HP, `1 / 10`, `1151 / 1200`, `945 / 1000` nel concorrente). Il caso legacy (D-11) è **verde al primo colpo**: oggi l'arrivo non tocca né vita né inventario, ed è proprio il comportamento che il caso pinna.

## Esiti

- `npx jest src/travel/travel.updates.spec.ts --selectProjects unit`: 24/24.
- `npx jest src/travel/travel-completion.int-spec.ts src/travel/travel-completion.processor.int-spec.ts --selectProjects integration --runInBand`: 2 suite, 53/53, ~12 s.
- Controllo extra: `test/app.int-spec.ts` + `src/travel/teleport.resolver.int-spec.ts`: 112/112 (DI del nuovo parametro e SDL invariato).
- `npx tsc --noEmit -p tsconfig.json` 0; `git diff --exit-code src/schema.gql` vuoto; prettier ed eslint puliti sui cinque file.
- Grep di accettazione: `settleArrivalFood` 2, `moment: 'arrival'` 1, path del piano nel servizio 0, `D-07)` 3, `D-11)` 1.

## Deviations from Plan

None - plan executed exactly as written. Nessuna spec costruisce `TravelCompletionService` a mano (`travel-sweeper.spec.ts` usa un doppio tipizzato con cast), quindi nessuno stub del lettore.

## Known Stubs

Nessuno. Finché la partenza non salva `food` (piano 08) nessun viaggio reale entra nel ramo nuovo: le prove seminano il piano con `buildFoodTravelDoc`.

## Threat Flags

Nessuna superficie nuova: T-20-11 (concorrente, un solo assestamento), T-20-12 (dispensa in sessione, guardie su quantità e vita), T-20-13 (`foodLegOf` ignora un piano malformato) coperti; nessun log nuovo.

## Self-Check: PASSED
