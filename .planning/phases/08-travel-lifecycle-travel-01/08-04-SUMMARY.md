---
phase: 08-travel-lifecycle-travel-01
plan: 04
subsystem: roads
tags: [travel, roads, graphology, dijkstra, pure]
requires: []
provides:
  - "src/roads/road-route.ts: LonLat, RouteEdge, RoadRoute, routeOf (puro)"
  - "RoadsService.routeBetween(from: LonLat, to: LonLat): RoadRoute | null (mai eccezioni, arco parallelo più leggero)"
  - "RoadsModule autosufficiente: forFeature Road + PointOfInterest (C3)"
  - "prima int-spec di RoadsService (grafo da fixture)"
affects: [08-08, 08-12]
tech-stack:
  added: []
  patterns:
    - "funzione pura con edgeOf/coordOf iniettati, il service fornisce solo il grafo"
    - "variante null-returning accanto alla versione che lancia (findNearestNode delega a nearestNodeWithinSnap)"
key-files:
  created:
    - src/roads/road-route.ts
    - src/roads/road-route.spec.ts
    - src/roads/roads.service.int-spec.ts
  modified:
    - src/roads/roads.service.ts
    - src/roads/roads.module.ts
    - src/roads/roads.resolver.ts
key-decisions:
  - "routeBetween: grafo non costruito, punto oltre 5 km, stesso nodo di partenza e arrivo, nessun cammino o arco mancante ⇒ null, mai eccezioni"
  - "Polilinea con estremi = coordinate originali dei POI; punto consecutivo uguale dopo arrotondamento a 7 decimali scartato (si tiene il primo, quindi il POI non arrotondato); distanceKm/baseHours contano solo gli archi, come getPath"
  - "lightestEdge sceglie il peso minimo fra gli archi paralleli: graphology li elenca dal più recente, quindi edgeKeys[0] di getShortestPath dipende dall'ordine di inserimento (lasciato invariato per D-11)"
metrics:
  duration: 8 min
  completed: 2026-10-21
  tasks: 2
  files: 6
---

# Phase 8 Plan 04: Polilinea del cammino e routeBetween Summary

`RoadsService.routeBetween(from, to)` restituisce la polilinea Dijkstra orientata dalla partenza alla meta, con km e ore base calcolati sull'arco parallelo più leggero, oppure `null` in ogni caso limite; la logica sta nel modulo puro `routeOf`, `getShortestPath`/`getPath` sono invariati e `RoadsModule` registra `PointOfInterest`, quindi si importa anche senza il `MongoModule` globale.

## Tasks

| # | Task | Commits |
|---|------|---------|
| — | Formattazione del modulo strade (executor_rules) | 33d9fd1 (style) |
| 1 | `routeOf` puro: polilinea orientata, estremi, dedup, somme | 40efb20 (RED), 3c2f7de (GREEN) |
| 2 | `RoadsService.routeBetween` + `RoadsModule` autosufficiente | 6a7d4f0 (RED), 98163e1 (GREEN) |

## TDD evidence

**Task 1 RED** (`40efb20`): `npx jest src/roads/road-route.spec.ts --selectProjects unit` → 7 failed / 7 (`Error: not implemented` dello stub tipizzato).

**Task 1 GREEN** (`3c2f7de`): 7/7, `npm run build` ok, eslint pulito, nessun import `graphology|mongoose|@nestjs` nel modulo puro.

**Task 2 RED** (`6a7d4f0`): `npx jest src/roads/roads.service.int-spec.ts --selectProjects integration --runInBand` → 10 failed / 10 con `Nest can't resolve dependencies of the PointOfInterestsService (?). Please make sure that the argument "PointOfInterestModel" at index [0] is available in the RoadsModule context.` (prova di C3). La compilazione fallita lascia aperta la connessione Mongo e il processo jest non esce: terminato a mano dopo aver letto il risultato (solo nel RED).

**Task 2 GREEN** (`98163e1`): int-spec 10/10, `npx jest src/roads --selectProjects unit` 7/7, `npm run build` ok, `git diff --exit-code src/schema.gql` 0, eslint senza errori sui 4 file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug nel test] Il caso 'prefers the lightest of parallel roads' non distingueva `lightestEdge` da `edgeKeys[0]`**
- **Found during:** Task 2 (GREEN)
- **Issue:** `graph.edges(a, b)` di graphology restituisce gli archi paralleli dal più recente (`[0.25, 1]` per inserimenti `1` poi `0.25`): con le strade inserite come speedFactor 1 poi 4, anche il primo arco sarebbe stato quello leggero e il test sarebbe passato senza `lightestEdge`.
- **Fix:** lo stesso test ripete il caso con entrambi gli ordini di inserimento (`[1, 4]` e `[4, 1]`), attendendo `km / 4` in tutti e due.
- **Files modified:** src/roads/roads.service.int-spec.ts
- **Commit:** 98163e1

### Notes

- Il commit `style` lascia due warning eslint di tipo (`no-unsafe-argument` su `attrs.coord` in `findNearestNode`, `no-unsafe-return` sulla callback del peso in `getShortestPath`): non sono correzioni meccaniche. Il primo è sparito perché il ciclo ora sta in `nearestNodeWithinSnap` con `attrs.coord as LonLat`; il secondo resta in `getShortestPath`, che non tocco per D-11.
- Nel caso dell'estremo che coincide con un nodo dopo l'arrotondamento, si tiene il primo punto, cioè il POI originale (`[0.00000001, 0]`) e non il nodo `[0, 0]`, come previsto da "i punti emessi sono quelli originali".
- `roads.resolver.ts` è cambiato solo per la formattazione.

## Threat model

- T-08-15: nessun throw in `routeBetween`; sei casi `answers null …` (5 nell'int-spec più quello degli archi mancanti nello unit).
- T-08-16: `lightestEdge` sceglie il peso minimo, provato con entrambi gli ordini di inserimento.
- T-08-18: `getShortestPath` non è stato toccato (`edgeKeys[0]` presente), con un test di regressione `keeps getShortestPath unchanged`; `findNearestNode` lancia ancora lo stesso `Error`.

## Known Stubs

None.

## Self-Check: PASSED
