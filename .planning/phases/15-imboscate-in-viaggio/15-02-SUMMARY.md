---
phase: 15-imboscate-in-viaggio
plan: 02
subsystem: roads + travel (funzioni pure geometriche e probabilistiche delle imboscate)
tags: [roads, travel, ambush, BE-AMBUSH-01, BE-AMBUSH-03, BE-AMBUSH-05, D-01, D-02, D-03, D-06, D-21]
requires: [15-01]
provides:
  - "`GAME_EARTH_RADIUS_KM = 127.42`, `gameDistanceKm(a: LonLat, b: LonLat): number` in src/roads/game-distance.ts"
  - "`DrawnAmbush { at; km }`, `AmbushDrawInput { road: { distance }; startTime; durationMs; fromKm; chance; hourOf }`, `drawAmbush(input): DrawnAmbush | null` in src/travel/ambush/ambush-draw.ts"
  - "`PointOnRoute { point: LonLat; segment }`, `pointAtFraction(coordinates, fraction): PointOnRoute`, `nearestPoi<T extends { id; location: LonLat }>(point, pois): T | null` in src/travel/ambush/ambush-point.ts"
affects: [15-03, 15-06, 15-07]
tech-stack:
  added: []
  patterns:
    - "Haversine di gioco come funzione pura condivisa da `RoadsService` e dai POI più vicini"
    - "Interpolazione planare in gradi identica a `TravelRoute.pointAt` del FE"
key-files:
  created:
    - src/roads/game-distance.ts
    - src/roads/game-distance.spec.ts
    - src/travel/ambush/ambush-draw.ts
    - src/travel/ambush/ambush-draw.spec.ts
    - src/travel/ambush/ambush-point.ts
    - src/travel/ambush/ambush-point.spec.ts
  modified:
    - src/roads/roads.service.ts
decisions:
  - "`pointAtFraction` su un tratto interno di lunghezza zero risponde col suo estremo iniziale (il FE produrrebbe NaN); polilinea vuota → `{ point: [0, 0], segment: 0 }`"
  - "`nearestPoi` a parità esatta di distanza sceglie l'id minore con `localeCompare`, indipendente dall'ordine d'ingresso"
metrics:
  duration: "~10 min"
  completed: 2026-11-06
  tasks: 3
  files: 7
---

# Phase 15 Plan 02: sorteggio km per km, punto planare e POI più vicino Summary

Haversine di gioco (R = 127,42) estratta da `RoadsService` come `gameDistanceKm`, sorteggio puro `drawAmbush` sui km interi con rischio giorno/notte e soglie di 10 km, punto dell'imboscata `pointAtFraction` con lo stesso algoritmo planare del FE e `nearestPoi` con parità sciolta per id.

## Task e commit

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | spec della distanza di gioco | `54fa723` test(roads): pin the game distance |
| 1 GREEN | `gameDistanceKm` + `RoadsService` rifattorizzato | `a51d773` refactor(roads): extract the game distance from RoadsService |
| 2 RED | spec di sorteggio e punto | `9b85eef` test(ambush): pin the per km draw and the planar point |
| 2 GREEN | `drawAmbush`, `pointAtFraction`, `nearestPoi` | `2a1b454` feat(ambush): draw the ambush per km and locate it on the road |
| 3 | bookkeeping + questo SUMMARY | `docs(phase-15): record plan 02 progress` |

## RED osservati

- `src/roads/game-distance.spec.ts`: suite fallita con «Could not locate module src/roads/game-distance mapped as…» (modulo assente), 0 test eseguiti.
- `ambush-draw.spec.ts` e `ambush-point.spec.ts`: 2 suite fallite con «Could not locate module src/travel/ambush/ambush-draw mapped as…» (e `ambush-point`), 0 test eseguiti. Al RED `npx eslint ambush-draw.spec.ts` segnalava `no-redundant-type-constituents` su `DrawnAmbush` (tipo non risolto): sparito al GREEN.

## Verifica

- `npx jest src/roads/game-distance.spec.ts --selectProjects unit`: 2/2 verdi.
- `npx jest src/roads --selectProjects integration --runInBand`: 10/10 verdi, spec di `RoadsService` invariate.
- `npx jest src/travel/ambush --selectProjects unit`: 5 suite, 24 test verdi (9 di `ambush draw`, 5 di `ambush point`, più le spec del piano 01).
- `npx tsc --noEmit -p tsconfig.json`: 0. Prettier `--write` + eslint sui sette file: puliti, salvo il warning preesistente `no-unsafe-return` di `roads.service.ts` (callback del peso di `dijkstra.bidirectional`, non toccato, fuori scope).
- `git diff --exit-code src/schema.gql` 0; `git diff origin/develop -- src/schema.gql` vuoto.
- Tutti i grep di accettazione dei task 1 e 2 tornano i conteggi attesi (singola riga, nessun `grep -A3` necessario).

## Deviations from Plan

- **STATE.md `Plan: 2 of 12`** invece di `Plan: 02 of 12` del task 3: il brief dell'orchestratore e il formato già in uso (`Plan: 1 of 12` del piano 01) vincono; il verify automatico del task 3 che cerca `Plan: 02 of 12` quindi non combacia di proposito.
- `pointAtFraction` con tratto interno di lunghezza zero: estremo iniziale invece del NaN del FE (Rule 2, robustezza; non accade sulle polilinee di `routeOf`, che collassa i punti doppi).
- SUMMARY committato insieme al bookkeeping nel commit `docs(phase-15): record plan 02 progress`, come prescrive il task 3.

Nessun'altra deviazione: le attese numeriche del `<behavior>` sono tornate tutte al primo colpo.

## Known Stubs

Nessuno.

## Self-Check: PASSED

File creati presenti; commit `54fa723`, `a51d773`, `9b85eef`, `2a1b454` presenti in `git log`.
