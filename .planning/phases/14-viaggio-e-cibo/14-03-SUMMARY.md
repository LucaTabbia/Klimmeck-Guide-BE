---
phase: 14-viaggio-e-cibo
plan: 03
subsystem: travel (dispensa del viaggiatore e anteprima col cibo)
tags: [travel, food, graphql, schema, BE-FOOD-04, BE-FOOD-06, D-06, D-08, D-09, D-12, D-14, D-16, D-17, D-18]
requires: [14-01, 14-02]
provides:
  - "`TravelPantryReader` (provider ed export di `TravelPlanningModule`): `read`, `planFor`, `previewOf`, `foodItemsOf`; tipi `Pantry`, `PlannedMeal`, `TravelLeg`"
  - "`@ObjectType TravelFoodItem { item: LootItem!, quantity: Int! }` e i campi `food`, `hpLost`, `arrivesAlive` su `TravelPreview`"
  - "`travelPreview` col cibo (mai `TRAVEL_STARVING`), SDL additivo rigenerato dal boot reale"
  - "fixture `test/travel/travel-food.fixture.ts`: `HARDY_LIFE_POINTS`, `persistFood`, `foodStack`"
affects: [14-04, 14-05, 14-06]
tech-stack:
  added: []
  patterns:
    - "Lettura opzionalmente in sessione (`session = null`), letture in sequenza: stessa dispensa per anteprima e transazione della partenza"
    - "Documenti `LootItem` idratati per il filo (`id` non nullo), lean solo per catalogo e personaggio"
key-files:
  created:
    - src/travel/food/travel-pantry.reader.ts
    - src/travel/food/travel-pantry.reader.int-spec.ts
    - src/models/travel-food-item.model.ts
    - test/travel/travel-food.fixture.ts
  modified:
    - src/travel/travel-planning.module.ts
    - src/models/travel-preview.model.ts
    - src/travel/travel.service.ts
    - src/travel/travel.resolver.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "`planFor`/`previewOf` ricevono un `TravelLeg = Pick<ActiveTravelDraft, 'duration' | 'road'>` (compatibile con `ActiveTravelDraft`): i test passano solo durata e strada"
  - "Il catalogo del cibo si legge solo per gli id `LootItem` presenti, filtrando `effect: hunger`: un id senza documento non diventa uno stack"
  - "Le attese della resolver int-spec sono derivate dai numeri reali della mappa di prova (A→B ~0,44 km), non da quelli del piano"
metrics:
  duration: "~15 min"
  completed: 2026-11-05
  tasks: 3
  files: 10
---

# Phase 14 Plan 03: dispensa del viaggiatore e anteprima col cibo Summary

`TravelPantryReader` legge in o fuori sessione gli stack `hunger` nell'ordine dell'inventario (power, valore di vendita in rame, HP grezzi e «prima» con la semantica di `statusFactsOf`), pianifica il pasto con `planTravelFood` e restituisce documenti `LootItem` idratati; `travelPreview` risponde in modo additivo `food`, `hpLost`, `arrivesAlive` senza scrivere e senza mai il codice di fame; lo SDL guadagna solo il tipo `TravelFoodItem` e tre righe di `TravelPreview`.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | c23ea6f | test(food): pin the pantry reader of the traveller |
| 1 GREEN | aa9788a | feat(travel): read the traveller pantry in or out of a session |
| 2 RED | 030af14 | test(travel): expect the food fields of the travel preview |
| 2 GREEN | 2bd0cd8 | feat(travel): preview the food and the life of the travel (D-09) |
| 3 | (questo commit) | docs(phase-14): record plan 03 progress |

## Fallimenti RED osservati

- Task 1: la suite nuova fallisce con `Cannot find module './travel-pantry.reader'`. Al GREEN i cinque casi sono passati al primo colpo (lettura fuori sessione che non vede la scrittura non committata compresa).
- Task 2: 19 rossi su 99. Boot reale: `type TravelPreview` diverso dalla stringa attesa e `type TravelFoodItem` assente (`Received: undefined`). Resolver int-spec: `GRAPHQL_VALIDATION_FAILED` («Cannot query field "food" on type "TravelPreview"», idem `hpLost`, `arrivesAlive`) su tutti i casi che passano dal documento `PREVIEW` (i nove rifiuti, l'anteprima esistente, l'oste, il caso senza bearer e i due nuovi). Reader int-spec: `reader.foodItemsOf is not a function` / `reader.previewOf is not a function` sui tre casi nuovi (anche `skips…` e `reads a legacy…` rossi perché chiamano `foodItemsOf`/`previewOf`).

## Firme create

- `interface Pantry { stacks: FoodStack[]; assets: InventorySnapshot; hpRaw: number | null | undefined; hpBefore: number }`
- `interface PlannedMeal { plan: TravelFoodPlan; pantry: Pantry }`
- `type TravelLeg = Pick<ActiveTravelDraft, 'duration' | 'road'>`
- `TravelPantryReader.read(characterId: Types.ObjectId, session: ClientSession | null = null): Promise<Pantry>` — `NOT_FOUND` (`ResourceNotFoundException.character()`) per personaggio assente o archiviato.
- `TravelPantryReader.planFor(characterId, travel: TravelLeg, session = null): Promise<PlannedMeal>`
- `TravelPantryReader.previewOf(characterId, travel: TravelLeg): Promise<TravelPreview>` (fuori sessione)
- `TravelPantryReader.foodItemsOf(consumed: readonly ConsumedFood[]): Promise<TravelFoodItem[]>` — ordine di `consumed`, documento mancante saltato.
- `TravelService.preview` → `this.pantry.previewOf(characterId, travel)`; costruttore con `private readonly pantry: TravelPantryReader` in coda.

## Diff dello SDL (contro origin/develop, solo righe aggiunte)

```
+type TravelFoodItem {
+  item: LootItem!
+  quantity: Int!
+}
+  arrivesAlive: Boolean!
+  food: [TravelFoodItem!]!
+  hpLost: Int!
```

## Numeri effettivi della fixture A→B

Il piano assumeva A→B ≈ 22,24 km, 89 power e 276 HP senza cibo. Nella mappa `persistTravelWorld` il `RoadsService` misura invece `distance` ≈ 0,4448 km e `duration` 320 241 ms: `needed` = 2, senza cibo 1 km scoperto = `hpLost` 1. Con gli HP di default (100) l'anteprima dice quindi `arrivesAlive: true`.

## Deviations from Plan

**1. [Rule 1 - Bug nel test] attese della resolver int-spec sui numeri reali della mappa di prova**
- Trovato durante: Task 2 (GREEN)
- Problema: con i numeri reali (vedi sopra) il caso coperto mangiava 1 unità del cibo 20, non 3, e il caso «starving» di bob con 100 HP arrivava vivo.
- Fix: il caso coperto asserisce `needed` fra 1 e 20, `food` = una unità del cibo 20, `hpLost` 0, `arrivesAlive` true; il caso affamato usa `lifePoints: 1` (vita persa > 0 → `arrivesAlive: false`), con `hpLost` ancora derivato da `hpLostFor(uncoveredKmOf(foodNeededFor(duration), 0, distance))`. Commento di `HARDY_LIFE_POINTS` nella fixture corretto (il valore 1_000 resta).
- File: src/travel/travel.resolver.int-spec.ts, test/travel/travel-food.fixture.ts — commit 2bd0cd8.

**2. [Nota] `TravelLeg` al posto di `ActiveTravelDraft`** come tipo del viaggio in `planFor`/`previewOf`: sottoinsieme compatibile, i chiamanti passano comunque l'`ActiveTravelDraft` del pianificatore.

STATE.md usa `Plan: 3 of 8` come prescritto dal brief (il verify del task 3 cerca `Plan: 03 of 8`: il brief prevale).

## Verifiche

- `npx jest src/travel/food/travel-pantry.reader.int-spec.ts src/travel/travel.resolver.int-spec.ts src/travel/travel.service.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand`: 109/109 (4 suite).
- `npx jest src/travel/food/travel-pantry.reader.int-spec.ts src/travel/travel-planning.int-spec.ts --selectProjects integration --runInBand`: 36/36 dopo il Task 1; `src/travel/teleport.resolver.int-spec.ts` + `travel-planning.int-spec.ts`: 46/46 dopo il Task 2.
- `npx tsc --noEmit -p tsconfig.json`: 0 dopo ogni GREEN.
- prettier `--write` + eslint sui file toccati: puliti (un warning preesistente `no-base-to-string` a `test/app.int-spec.ts:948`, fuori scope).
- `git diff --exit-code src/schema.gql` 0; nessuna riga tolta contro origin/develop.
- Gate del piano: `\.session(session)` 2, `Promise.all` 0, `\.lean` 2 e nessun `lean` nel corpo di `foodItemsOf`, `LootItem.name` 1 nel modulo, `TravelPantryReader` 3 nel modulo, `previewOf(` 1 nel service, nessun `TRAVEL_STARVING`/`travelStarving` in service e reader, `D-09)` 3 nella reader int-spec.

## Known Stubs

Nessuno.

## Self-Check: PASSED
