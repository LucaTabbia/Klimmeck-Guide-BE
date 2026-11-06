---
phase: 14-viaggio-e-cibo
plan: 04
subsystem: travel (partenza libera che mangia)
tags: [travel, food, transaction, BE-FOOD-03, BE-FOOD-05, BE-FOOD-06, D-01, D-02, D-03, D-04, D-06, D-10, D-11, D-12, D-13, D-18, D-20]
requires: [14-01, 14-02, 14-03]
provides:
  - "`TravelService.startTravel` transazionale: dispensa letta in sessione, cibo e HP consumati nello stesso `findOneAndUpdate` condizionale della partenza, `TRAVEL_STARVING` senza scritture"
  - "metodi privati `departWithMeal`, `starvingOrRace`, `unstartedError` (la rilettura del codice avviene in sessione)"
  - "integration della partenza col cibo (coperto, parziale, senza cibo, rifiuto, corsa, pet, ferita, strada lenta, concorrenza, acquisto concorrente) e teleport esente"
affects: [14-05, 14-06, 14-07]
tech-stack:
  added: []
  patterns:
    - "`connection.transaction` con callback senza side effect: il job si accoda dopo il commit"
    - "codice della corsa prima della fame: `exists(startTravelFilter(...))` in sessione decide fra `TRAVEL_STARVING` e `classifyUnstarted`"
key-files:
  created: []
  modified:
    - src/travel/travel.service.ts
    - src/travel/travel.service.int-spec.ts
    - src/travel/teleport.resolver.int-spec.ts
decisions:
  - "Le attese sono calcolate con le funzioni pure sui numeri reali della fixture (A→B ≈ 0,4448 km, 320 241 ms, fabbisogno 2), mai con letterali"
  - "Il rifiuto per fame nelle spec usa `lifePoints: 1`; il caso della corsa usa anch'esso `lifePoints: 1` così che senza corsa sarebbe un rifiuto per fame"
  - "La spia del caso D-20 scrive alla prima lettura della dispensa, a prescindere dalla sessione: così la prova di mutazione misura davvero il lost update"
metrics:
  duration: "~20 min"
  completed: 2026-11-05
  tasks: 3
  files: 3
---

# Phase 14 Plan 04: partenza libera transazionale col cibo — Summary

`startTravel` apre una transazione Mongo dopo le regole di Phase 8: legge in sessione la dispensa (`TravelPantryReader.planFor(characterId, plan.travel, session)`), rifiuta con `TRAVEL_STARVING` (o col codice della corsa) prima di qualunque scrittura, e scrive viaggio, inventario e HP nello stesso `findOneAndUpdate` con `mealGuardsOf`/`mealSetOf`; il teleport non cambia.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | baa65ea | test(travel): expect the departure to eat and to refuse the starving |
| 1 GREEN | 76a0102 | feat(travel): eat the food and charge the life at departure (D-12) |
| 2 | c25dd1b | test(travel): pin the food modifiers, the race and the exempt teleport |
| 3 | (questo commit) | docs(phase-14): record plan 04 progress |

## Firme create (`src/travel/travel.service.ts`)

- costruttore: `@InjectConnection() private readonly connection: Connection` in prima posizione, poi `characterModel`, `poiModel`, `planner`, `scheduler`, `pantry`
- `startTravel(characterId, poiId): Promise<void>` = `planFree` → `this.connection.transaction((session) => this.departWithMeal(characterId, plan, session))` → `scheduler.schedule`
- `private departWithMeal(characterId, plan: FreeTravelPlan, session: ClientSession): Promise<void>`
- `private starvingOrRace(characterId, location, session): Promise<Error>`
- `private unstartedError(characterId, session): Promise<Error>` (la rilettura `UNSTARTED_PROJECTION` ora è in sessione)

## RED osservati

- Task 1: 4 casi rossi su 5 — coperto (`ownedItems` invariato, +5 righe), parziale (+7 righe), senza cibo (`Expected: 999, Received: 1000`), rifiuto (`Received promise resolved instead of rejected`).
- Verde al primo colpo: `answers the race code before the hunger when another movement wins (D-11)` — prima della modifica la partenza non conosceva la fame, quindi rispondeva già `TRAVEL_IN_PROGRESS`; dopo la modifica resta verde grazie a `starvingOrRace`.
- Task 2: tutti verdi al primo colpo (atteso dal piano): la durata comprende già pet, ferite e strada (pianificatore di Phase 8), la transazione del Task 1 fa consumare il cibo una sola volta, il teleport non è stato toccato.

## Prova di mutazione D-20

Tolto temporaneamente `session` da `this.pantry.planFor(...)` (non committato): `keeps a concurrent non-food purchase made after the pantry read (D-20)` diventa **rosso** (la pozione sparisce dall'inventario: `Expected - 5`, lost update). Ripristinato il file: **verde**, con la spia di `read` chiamata almeno due volte (il driver riesegue il callback dopo il WriteConflict). L'assunzione A1 è confermata.

## Numeri reali usati (fixture `persistTravelWorld`, A→B)

- distanza ≈ 0,4448 km, durata 320 241 ms → fabbisogno 2 power
- senza cibo: 1 km scoperto → 1 HP (`HARDY_LIFE_POINTS` 1000 → 999)
- pet `speedModifier: 2` → fabbisogno 1 (≤ ⌈2/2⌉)
- ferita `brokenLeftLeg` (fattore 0,8) → fabbisogno 3
- strade a `speedFactor` 3 invece di 5 → fabbisogno 3
- coperto: `foodStack(Cibo 1, needed)` + `foodStack(Cibo 5, 1)` → mangia i due da 1 (scarto 0), resta `[foodStack(Cibo 5, 1)]`
- parziale: `foodStack(Cibo 1, 1)` → coperto 1 su 2 → `HARDY_LIFE_POINTS - hpLostFor(uncoveredKmOf(needed, 1, distanceKm))`
- rifiuto: `lifePoints: 1` + `foodStack(Cibo 1, 1)` → 1 km scoperto, hpAfter 0 < 1

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Numeri della fixture sbagliati nel piano (sanzionata dall'orchestratore, CONTEXT D-18 emendato)**
- **Trovato durante:** Task 1
- **Problema:** il piano assumeva A→B ≈ 22,24 km / 89 power / 276 HP; i numeri reali sono 0,4448 km / 2 power / 1 HP, e con 100 HP la partenza senza cibo non è un rifiuto.
- **Fix:** casi ridisegnati con gli stessi titoli e invarianti; `expect(needed).toBe(89)` sostituito da `toBeGreaterThan(0)` (+ `toBeLessThan(5)` come precondizione della selezione a scarto zero); HP sempre via `hpLostFor(uncoveredKmOf(...))`; rifiuto con `lifePoints: 1`; concorrenza e coperto con `Cibo 1`/`Cibo 5` invece di `Cibo 50`/`Cibo 20`; D-20 con `foodStack(Cibo 1, needed + 3)` → restano 3 unità + la pozione; modificatori asseriti come rapporti (pet < a piedi, ferita > a piedi, strada lenta > pianura) calcolati con `foodNeededFor(durationMsOf(...))`.
- **File:** src/travel/travel.service.int-spec.ts — **Commit:** baa65ea, c25dd1b

**2. [Rule 1 - Test] Spia del caso D-20 attiva alla prima lettura, non solo con sessione non nulla**
- **Problema:** con la condizione «solo con sessione» la mutazione (lettura fuori sessione) non avrebbe scritto la pozione e il caso sarebbe stato rosso per una ragione banale.
- **Fix:** la spia scrive l'acquisto alla prima chiamata di `read`; l'acquisto passa da `characters.updateOne` (Mongoose) perché `collection.updateOne` con l'operatore push non passa tsc.
- **Commit:** c25dd1b

**3. Spec del resolver non toccata**
- `src/travel/travel.resolver.int-spec.ts` non richiedeva modifiche: con i numeri reali tutte le partenze A→B riescono con 100 HP. `characterAt` di travel.service.int-spec.ts ha comunque `HARDY_LIFE_POINTS` di default (innocuo, come chiesto); `playerAt` di teleport.resolver.int-spec.ts guadagna le opzioni `lifePoints`/`ownedItems` (default invariati: nessuna attesa esistente cambiata).

## Gates

- `npx jest src/travel --selectProjects integration --runInBand`: 7 suite, 128 test verdi
- `npx jest src/travel --selectProjects unit`: 9 suite, 115 test verdi
- `npx tsc --noEmit -p tsconfig.json`: 0
- prettier/eslint sui tre file toccati: puliti
- `src/schema.gql` invariato; vs origin/develop solo righe aggiunte (quelle del 14-03)

## Self-Check: PASSED
