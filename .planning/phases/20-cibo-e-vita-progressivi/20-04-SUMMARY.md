---
phase: 20-cibo-e-vita-progressivi
plan: 04
subsystem: travel
tags: [travel, food, hunger, sweep, transaction, index]
requires:
  - 20-02 (foodLegOf, settlementOf, settlementIsDue, reachedKmOf, settlementSetOf, foodProgressSetOf, settlementGuardsOf)
  - 20-03 (buildFoodTravelDoc, arrivo che assesta)
  - Phase 14 (TravelPantryReader.read)
provides:
  - foodTravellersFilter, foodTravellerFilter, FOOD_TRAVELLER_PROJECTION in travel-food.updates.ts
  - TravelFoodSweep.settleDue(now) in TravelPlanningModule (providers + exports)
  - passo «fame» in TravelSweeper.runOnce dopo i completamenti, allo stesso istante
  - indice character_active_travel_food e costante CHARACTER_ACTIVE_TRAVEL_FOOD_INDEX
affects: [20-05, 20-06, 20-07, 20-08, 20-09, 20-10, 20-11]
tech-stack:
  added: []
  patterns:
    - selezione per presenza del piano, decisione in codice prima della transazione (nessuna transazione a vuoto)
    - una transazione per personaggio con rilettura in sessione e guardia su settledKm
    - errore del passo isolato dai completamenti dello sweep
key-files:
  created:
    - src/travel/food/travel-food.sweep.ts
    - src/travel/food/travel-food.sweep.int-spec.ts
    - .planning/phases/20-cibo-e-vita-progressivi/20-04-SUMMARY.md
  modified:
    - src/travel/food/travel-food.updates.ts
    - src/travel/travel-planning.module.ts
    - src/travel/travel-sweeper.ts
    - src/travel/travel-sweeper.spec.ts
    - src/models/character/character.model.ts
    - src/models/sweep-indexes.schema.spec.ts
    - src/mongo/sweep-index.verifier.int-spec.ts
decisions:
  - "Il filtro di scrittura del passo è foodTravellerFilter (id attivo + startTime) più settlementGuardsOf(leg.food, …): la guardia su settledKm richiede il piano, nessun path food.* nasce su un legacy"
  - "Il warn del piano malformato nasce dalla lettura fuori sessione (prima della transazione); dentro la transazione un piano diventato non valido vale semplicemente «nessuna scrittura»"
  - "settleInSession non ricontrolla settlementIsDue: settlementOf restituisce null quando non c'è nulla da scrivere"
metrics:
  duration: ~25 min
  completed: 2026-11-12
---

# Phase 20 Plan 04: il passo «fame» dello sweep — Summary

`TravelFoodSweep.settleDue(now)` seleziona i viaggiatori col piano (`food.settledKm` presente), decide in codice se c'è qualcosa da scrivere (`settlementIsDue` sul km raggiunto, limitato dall'imboscata pendente) e solo allora apre una transazione per personaggio: rilettura in sessione, dispensa in sessione, `settlementOf` con `moment: 'progress'`, scrittura guardata da `settledKm` e vita letta. `TravelSweeper.runOnce` lo chiama dopo i completamenti con lo stesso istante, isolandone gli errori.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | `8fa159f2` | test(travel): pin the hunger step of the travel sweep |
| 1 GREEN | `07c37e77` | feat(travel): settle the hunger of the travellers past the boundary |
| 2 RED | `f01c9917` | test(travel): pin the hunger step and its index |
| 2 GREEN | `a034c2a4` | feat(travel): run the hunger step after the travel completions |

## Fallimenti RED attesi

- Task 1: la suite non parte, `Cannot find module './travel-food.sweep'` (servizio assente).
- Task 2: unit 3 falliti su 25 (i due casi `D-15)` dello sweeper: `settleDue` mai chiamato / nessun log d'errore; la voce `character_active_travel_food` di `SWEEP_INDEXES`); integration 2 falliti su 15 (`settles the hunger from the travel sweep (D-15)`: inventario intatto; `builds the sweep indexes at boot (D-17b)`: indice mancante). ts-jest non segnala il quinto argomento in più al costruttore (diagnostica dei tipi spenta nei test): il RED arriva dalle asserzioni, non dalla compilazione.

## Esiti

- `npx jest src/travel/food/travel-food.sweep.int-spec.ts --selectProjects integration --runInBand`: 13/13, ~3 s di suite (5 s col boot di jest).
- `npx jest src/travel/travel-sweeper.spec.ts src/models/sweep-indexes.schema.spec.ts --selectProjects unit`: 25/25.
- `npx jest src/travel/food/travel-food.sweep.int-spec.ts src/mongo/sweep-index.verifier.int-spec.ts src/travel/travel-completion.int-spec.ts --selectProjects integration --runInBand`: 62/62, ~10 s.
- Controlli extra: `test/app.int-spec.ts` 91/91 (DI del provider nuovo, SDL identico); `npx jest src/travel --selectProjects unit` 243/243; `npx jest src/travel --selectProjects integration --runInBand` 12 suite, 226/226, ~57 s.
- `npx tsc --noEmit -p tsconfig.json` 0; `git diff --exit-code src/schema.gql` vuoto; prettier ed eslint puliti su tutti i file toccati; `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.
- Caso concorrente (D-14): osservate 3 letture della dispensa in tre esecuzioni su tre (due transazioni avviate in parallelo + un tentativo rieseguito dopo il WriteConflict, che rilegge `settledKm` 13 e non scrive); la terza chiamata in serie non apre transazioni. Sonda temporanea, rimossa prima del commit.
- Grep di accettazione: `export class TravelFoodSweep` 1, `moment: 'progress'` 1, `describeError` 2, `TravelFoodSweep` nel modulo 3, `D-(09|14|16|19))` 5, `D-11)` 2, `Date.now|Math.random|process.env.` 0; `foodSweep.settleDue(` 1, `character_active_travel_food` 1 + 1, `CHARACTER_ACTIVE_TRAVEL_FOOD_INDEX` 2, `D-15)` nello sweeper 2.

## Deviazioni dal piano

Nessuna sul contratto. Dettagli d'esecuzione:

- `FixedClock` non ha un setter: la spec usa un helper locale `moveClockTo(target)` costruito su `advanceSeconds`.
- I viaggiatori della spec nascono con `persistCharacter` (nome unico `Affamato N`), senza utente né device: il passo non invia push.
- `SweepIndexVerifier` costruisce gli indici con `createIndexes()` sul modello: nessuna lista di produzione da aggiornare, basta la dichiarazione sullo schema.
- Prettier ha spezzato su due righe la costante `CHARACTER_ACTIVE_TRAVEL_FOOD_INDEX` (oltre 80 colonne): il grep sul letterale resta 1.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: `src/travel/food/travel-food.sweep.ts`, `src/travel/food/travel-food.sweep.int-spec.ts`.
- Commit presenti: `8fa159f2`, `07c37e77`, `f01c9917`, `a034c2a4`.
