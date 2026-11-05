---
phase: 14-viaggio-e-cibo
group: A
reviewed: 2026-11-05T22:05:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/travel/food/food-selection.ts
  - src/travel/food/travel-food.ts
  - src/travel/food/travel-food.updates.ts
  - src/travel/food/travel-pantry.reader.ts
  - src/travel/travel-planner.service.ts
  - src/travel/travel-planning.module.ts
  - src/travel/travel.service.ts
  - src/travel/travel.updates.ts
findings:
  critical: 0
  warning: 1
  info: 1
  total: 2
status: issues_found
---

# Phase 14 — Code Review, gruppo A (viaggio e modulo del cibo)

## Summary

Rivisti gli 8 file del gruppo A a profondità standard, con le spec corrispondenti per la copertura. L'impianto regge: il knapsack limitato è corretto (tetto `needed + maxPower − 1`, splitting binario, tie-break scarto → unità → `sellCopper` → id per miglioramento stretto, ricostruzione all'indietro coerente, nessun `Math.random`); i km scoperti sono in metri interi senza epsilon; `hpAfter` non è clampato e `arrivesAlive` usa `MIN_LIFE_POINTS`; la transazione di `startTravel` è rieseguibile (nessun effetto collaterale prima del `findOneAndUpdate`), `TRAVEL_STARVING` esce prima di ogni scrittura e solo se `exists(startTravelFilter)` conferma che la partenza era possibile, `scheduler.schedule` gira dopo il commit, `teleport` è intatto; il reader legge in sequenza in sessione, mai `lean` sui `LootItem` del `food[].item`, nessun `process.env`, nessun log con documenti interi; il modulo non ha dipendenze circolari. Un solo problema reale, raggiungibile solo con inventari legacy con voci duplicate, e una nota di qualità.

## Critical

Nessuno.

## Warning

### A-WR-01: voce duplicata con la prima non valida: il knapsack mangia dalla seconda, l'inventario scala la prima

**File:** `src/travel/food/food-selection.ts:57-65` (con `src/economy/trade/trade-inventory.ts:55-62`, `mealSetOf` in `src/travel/food/travel-food.updates.ts:31-37`)
**Issue:** `edibleStacksOf` filtra la validità PRIMA di deduplicare per id: se `assets.ownedItems` contiene due voci dello stesso `LootItem` e la prima è non valida (quantità 0, non intera, `power` non positivo sul catalogo non cambia fra le due), la prima viene scartata e la seconda diventa «la prima occorrenza». Il commento dice invece «prima occorrenza di ogni id: `applyTradeToInventory` scala solo la prima voce». `mealSetOf` poi chiama `applyTradeToInventory`, che con `findIndex` trova la voce NON valida (quantità 0) e lancia `INSUFFICIENT_ITEM_QUANTITY` (`sell`), mentre la guardia `$elemMatch` del filtro invece combacerebbe con la seconda voce. Risultato: la partenza fallisce con un codice sbagliato pur avendo cibo valido, e il giocatore resta bloccato finché i dati non vengono corretti. Il caso richiede un inventario legacy sporco (le voci a zero normalmente spariscono), ma la spec D-06 copre solo il duplicato con la prima VALIDA.
**Why it matters:** la selezione e il consumo devono parlare della stessa voce (D-12/D-17); oggi divergono nell'unico caso in cui la prima occorrenza non è commestibile.
**Suggested fix:** deduplicare sull'inventario grezzo prima di filtrare: tenere la prima occorrenza di ogni id (valida o no) e poi applicare `isEdible`, così una prima voce non valida esclude l'id (fail-closed, nessuna divergenza). Spec RED prima in `food-selection.spec.ts`: `selectFood(20, [stack(A, 20, 0), stack(A, 20, 5)])` deve dare `{ consumed: [], covered: 0 }` (oggi dà `consumed: [{ itemId: A, quantity: 1 }]`).

## Info

### A-IN-01: `previewOf` può mostrare meno cibo di quello contato nel piano

**File:** `src/travel/food/travel-pantry.reader.ts:128-143`
**Issue:** `foodItemsOf` salta in silenzio un `LootItem` sparito dal catalogo fra la lettura della dispensa e l'idratazione, quindi `food[]` può risultare più corto di `plan.consumed` mentre `hpLost`/`arrivesAlive` sono calcolati sul cibo completo. La finestra è minima (stesso lookup di pochi ms) e la partenza ricalcola comunque sul cibo del momento (D-10), quindi nessun effetto sui dati.
**Why it matters:** solo coerenza dell'anteprima in un caso quasi impossibile.
**Suggested fix:** nessuna azione obbligatoria; se si vuole, loggare a WARN l'id mancante (solo id) come già fatto per il pet con `speedModifier` non valido.

---

_Reviewed: 2026-11-05T22:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
