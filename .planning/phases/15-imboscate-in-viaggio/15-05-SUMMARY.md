---
phase: 15-imboscate-in-viaggio
plan: 05
subsystem: roads + travel (città più vicina per strada e velocità del personaggio)
tags: [roads, travel, ambush, BE-AMBUSH-05, D-11, D-21]
requires: [15-02, 15-03, 15-04]
provides:
  - "`RouteTarget { id; location }`, `NearestRoute { id; route }` e `collapsePoints(points)` esportati da src/roads/road-route.ts"
  - "`RoadsService.nearestByTime(from, targets, fallbacks = [])`: `NearestRoute | null`, un solo `dijkstra.singleSource`"
  - "`TravelPlanner.speedOfCharacter(pet, injuries)`: `Promise<number>` pubblico (ex privato `speedFor`)"
affects: [15-07]
tech-stack:
  added: []
  patterns:
    - "Un solo Dijkstra a sorgente singola e scelta fra i marker per ore base, parità per id"
    - "Ripiego del nodo di partenza sui vertici della polilinea (C7)"
key-files:
  created: []
  modified:
    - src/roads/road-route.ts
    - src/roads/roads.service.ts
    - src/roads/roads.service.int-spec.ts
    - src/travel/travel-planner.service.ts
    - src/travel/travel-planning.int-spec.ts
key-decisions:
  - "Il `describe('RoadsService.nearestByTime (replSet)')` è annidato nel `describe` di `routeBetween` per riusare lo stesso harness (`withRoads`, dbName `roads-test`) senza duplicarlo"
  - "Nessuna ferita ha `speedFactor` 0.5: il caso di velocità usa `ONE_LEG` (`brokenLeftLeg`, fattore misurato 0.8) → 2 × 10 × 0.8 = 16"
  - "STATE.md scritto `Plan: 5 of 12` (formato del file e del brief dell'orchestratore), non `Plan: 05 of 12` del piano"
metrics:
  duration: "~10 min"
  completed: 2026-11-06
---

# Phase 15 Plan 05: città più vicina per strada e velocità del personaggio Summary

`RoadsService.nearestByTime` sceglie in un solo `dijkstra.singleSource` il marker col minor tempo di strada (ore base) dal punto dell'imboscata, con parità per id, ripiego sui vertici della polilinea e deviazione di lunghezza zero quando il punto aggancia il nodo della città; `TravelPlanner.speedOfCharacter` rende pubblica la velocità pet × ferite.

## Task

| Task | Commit | Descrizione |
| ---- | ------ | ----------- |
| 1 | a9b3d15, 7975077 | RED/GREEN `nearestByTime` + `RouteTarget`/`NearestRoute`/`collapsePoints` |
| 2 | a650957, 4d261c5 | RED/refactor `speedOfCharacter` pubblico |
| 3 | (questo commit) | bookkeeping |

## RED osservati

- Task 1: 6 casi nuovi rossi con `TypeError: roads.nearestByTime is not a function`; 10 casi esistenti verdi.
- Task 2: 1 caso nuovo rosso con `TypeError: planner.speedOfCharacter is not a function`; 33 esistenti verdi.

## Firme create

```typescript
// src/roads/road-route.ts
export interface RouteTarget { id: string; location: LonLat }
export interface NearestRoute { id: string; route: RoadRoute }
export function collapsePoints(points: readonly LonLat[]): LonLat[];

// RoadsService
nearestByTime(from: LonLat, targets: readonly RouteTarget[], fallbacks: readonly LonLat[] = []): NearestRoute | null;
private startNodeFor(from: LonLat, fallbacks: readonly LonLat[]): string | null;
private routeAlong(paths: Record<string, string[]>, start: string, from: LonLat, to: LonLat): RoadRoute | null;

// TravelPlanner
async speedOfCharacter(pet: unknown, injuries: readonly unknown[] | null | undefined): Promise<number>;
```

- Deviazione di lunghezza zero: `{ coordinates: collapsePoints([from, to]), distanceKm: 0, baseHours: 0 }` (il punto resta il primo vertice).
- Senza grafo, senza nodo di partenza (né diretto né dai `fallbacks`), con `targets` vuoto o nessun marker agganciabile/raggiungibile → `null`, mai eccezioni.

## Numeri misurati (mondo R1/R2/R3, `speedFactor` 1)

- `[0, 4.6]` → crocevia 4.434 km / 4.434 h; `[0, 7]` → borgo 5.004 km; `[0, 0.9]` aggancia il nodo di Alba → rotta zero; `[3, 2]` non aggancia nulla entro 5 km (≈ 5.99 km da `[2, 4.5]`) → null senza ripieghi, crocevia con `[[0, 4.5]]`.

## Gate

- `npx jest src/roads src/travel --selectProjects unit`: 19 suite / 165 test verdi.
- `npx jest src/travel/travel-planning.int-spec.ts src/roads --selectProjects integration --runInBand`: 2 suite / 50 test verdi.
- `npx tsc --noEmit -p tsconfig.json`: 0. Prettier pulito sui cinque file; eslint pulito salvo il warning pre-esistente `no-unsafe-return` di roads.service.ts (ora riga 141 per l'import su più righe), lasciato.
- `git diff --exit-code src/schema.gql`: 0; nessuna riga tolta rispetto a `origin/develop`.

## Deviations from Plan

**1. [Rule 1 - Bug di fixture] Ferita con `speedFactor` 0.5 inesistente**
- **Found during:** Task 2
- **Issue:** il piano chiedeva una ferita della tabella con `speedFactor` 0.5; i fattori reali sono 0.8 (`movementImpairment`) e 0.9 (`paralysis`), nessuna combinazione di una sola ferita dà 0.5.
- **Fix:** caso con `ONE_LEG` (`brokenLeftLeg`, 0.8 asserito con `travelSpeedFactorOf`) e pet `speedModifier: 2` → 16.
- **Files modified:** src/travel/travel-planning.int-spec.ts
- **Commit:** a650957

Altro: STATE.md con `Plan: 5 of 12` (formato del file) invece di `Plan: 05 of 12`; il `verify` del piano che grepa `Plan: 05 of 12` non corrisponde, come nel piano 04.

## Threat Flags

Nessuna superficie nuova: `nearestByTime` non è esposto al client (T-15-13, T-15-14 mitigati come da piano).

## Self-Check: PASSED

- File modificati presenti; commit a9b3d15, 7975077, a650957, 4d261c5 presenti in `git log`.
