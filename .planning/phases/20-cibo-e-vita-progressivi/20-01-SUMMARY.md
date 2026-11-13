---
phase: 20-cibo-e-vita-progressivi
plan: 01
subsystem: travel
tags: [travel, food, hunger, mongoose, pure-functions]
requires: []
provides:
  - ActiveTravelFood / ActiveTravelFoodSchema (sotto-documento interno, solo Mongoose)
  - ActiveTravel.food opzionale
  - travelKmAt (km dal tempo)
  - ActiveTravelFoodDraft, TravelFoodCurve, coveredKmOf, travelHungerAt, hungerBetween, foodPlanOf
  - ActiveTravelDraft.food opzionale
affects: [20-02, 20-03, 20-04, 20-05, 20-06, 20-07, 20-08, 20-09]
tech-stack:
  added: []
  patterns:
    - classe Mongoose-only senza ObjectType (precedente AmbushPlanEntry)
    - curva cumulata in metri interi, incrementi come differenze (telescopica)
key-files:
  created:
    - src/models/character/active-travel-food.model.ts
  modified:
    - src/models/character/active-travel.model.ts
    - src/models/character/active-travel.schema.spec.ts
    - src/travel/travel-timing.ts
    - src/travel/travel-timing.spec.ts
    - src/travel/food/travel-food.ts
    - src/travel/food/travel-food.spec.ts
decisions:
  - "ActiveTravel.food senza default: un viaggio legacy idratato non riceve un piano parziale (D-11)"
  - "travelHungerAt arrotonda al metro il km del chiamante; km ≥ distanceKm vale esattamente hpLostTotal (D-13)"
metrics:
  duration: ~20 min
  completed: 2026-11-12
  tasks: 3
  files: 7
---

# Phase 20 Plan 01: Fondamenta della fase Summary

Piano del cibo salvato come sotto-documento interno `ActiveTravelFood` su `ActiveTravel.food` (SDL identico), km dal tempo `travelKmAt` e curva telescopica della fame (`travelHungerAt`/`hungerBetween`) provata su 350 partizioni contro i totali della Phase 14, più `foodPlanOf` dal piano della partenza.

## Task

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | spec del piano salvato | `52840360` test(models): pin the saved travel food plan |
| 1 GREEN | `ActiveTravelFood` + `ActiveTravel.food` | `db3f7727` feat(models): add the internal saved food plan to the travel |
| 2 RED | spec di `travelKmAt` e della fame progressiva | `539f734a` test(travel): pin the travel kilometre and the progressive hunger |
| 2 GREEN | `travelKmAt`, `coveredKmOf`, `travelHungerAt`, `hungerBetween`, `foodPlanOf` | `dcc87508` feat(travel): add the travel kilometre and the progressive hunger curve |
| 3 | bookkeeping | commit `docs(phase-20): record plan 01 progress` |

## Fallimenti RED attesi

- Task 1: la suite non si carica, `Cannot find module './active-travel-food.model'` (modulo e path `food` assenti).
- Task 2: 13 casi rossi su 60, `travelKmAt is not a function` (5) e `coveredKmOf` / `travelHungerAt` / `hungerBetween` / `foodPlanOf is not a function` (8).

## Esiti

- `active-travel.schema.spec.ts`: 16/16 verdi (4 nuovi).
- `src/travel/food` + `travel-timing.spec.ts`: 4 suite, 60/60 verdi (13 nuovi).
- Griglia di proprietà: 10 distanze × 7 coperture × 5 partizioni = **350 partizioni**, somma degli incrementi = `hpLostFor(U)` in ognuna, nessun incremento negativo, nessun incremento entro `coveredKmOf` (il conteggio è asserito nel caso stesso).
- Boot reale `test/app.int-spec.ts`: 91/91 verdi; `git diff --exit-code src/schema.gql` esce 0.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint puliti sui file toccati.

## Deviazioni dal piano

- Titolo del quarto caso del Task 1: `keeps only the food plan fields, never on the wire type (D-10)` invece di «the five travel fields» (nota del checker in REPO-RULES: i path sono sei).
- `STATE.md` riporta `Plan: 1 of 11` come indicato dall'orchestratore (il verify del Task 3 grepa `Plan: 01 of 11`: il formato dell'orchestratore vince).

Nessun'altra deviazione: piano eseguito come scritto.

## Known Stubs

Nessuno. Nessun viaggio riceve ancora `food` (la partenza cambia nei piani 08 e 09, come previsto).

## Self-Check: PASSED

- File creati presenti: `src/models/character/active-travel-food.model.ts`.
- Commit presenti: `52840360`, `db3f7727`, `539f734a`, `dcc87508`.
