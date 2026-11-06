---
phase: 14-viaggio-e-cibo
reviewed: 2026-11-05T22:08:11Z
depth: standard (due reviewer paralleli per area: A viaggio e modulo del cibo, B accettazione, modelli e filo)
files_reviewed: 17
files_reviewed_list:
  - src/gameRules/game-rule-error-code.enum.ts
  - src/gameRules/game-rule.exception.ts
  - src/models/travel-food-item.model.ts
  - src/models/travel-preview.model.ts
  - src/quests/acceptance/quest-acceptance.resolver.ts
  - src/quests/acceptance/quest-acceptance.service.ts
  - src/quests/acceptance/quest-acceptance.updates.ts
  - src/schema.gql
  - src/travel/food/food-selection.ts
  - src/travel/food/travel-food.ts
  - src/travel/food/travel-food.updates.ts
  - src/travel/food/travel-pantry.reader.ts
  - src/travel/travel-planner.service.ts
  - src/travel/travel-planning.module.ts
  - src/travel/travel.service.ts
  - src/travel/travel.updates.ts
  - test/travel/travel-food.fixture.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---
# Code review — Phase 14 Generazione quest (fusione dei gruppi A, B)

I due report di gruppo (`14-REVIEW-A.md`, `14-REVIEW-B.md`) restano la fonte; questo file li fonde per severità.

## Summary

### Gruppo A
Rivisti gli 8 file del gruppo A a profondità standard, con le spec corrispondenti per la copertura. L'impianto regge: il knapsack limitato è corretto (tetto `needed + maxPower − 1`, splitting binario, tie-break scarto → unità → `sellCopper` → id per miglioramento stretto, ricostruzione all'indietro coerente, nessun `Math.random`); i km scoperti sono in metri interi senza epsilon; `hpAfter` non è clampato e `arrivesAlive` usa `MIN_LIFE_POINTS`; la transazione di `startTravel` è rieseguibile (nessun effetto collaterale prima del `findOneAndUpdate`), `TRAVEL_STARVING` esce prima di ogni scrittura e solo se `exists(startTravelFilter)` conferma che la partenza era possibile, `scheduler.schedule` gira dopo il commit, `teleport` è intatto; il reader legge in sequenza in sessione, mai `lean` sui `LootItem` del `food[].item`, nessun `process.env`, nessun log con documenti interi; il modulo non ha dipendenze circolari. Un solo problema reale, raggiungibile solo con inventari legacy con voci duplicate, e una nota di qualità.

### Gruppo B
Rivisti per intero i 9 file del gruppo B, più `travel-planner.service.ts` (`autoRoute`/`planAuto`) e `travel-pantry.reader.ts` (`previewOf`/`foodItemsOf`) come contesto di lettura, e le spec di copertura (`quest-acceptance.service.int-spec.ts`, `accept-quest.resolver.int-spec.ts`, `quest-acceptance.updates.spec.ts`, `test/app.int-spec.ts`).

Nessun problema di correttezza o sicurezza trovato. Verificato:

- Ordine dei rifiuti in `accept`: NOT_FOUND, costo/posti, eligibility, città, movimento, `fedOrReject` (solo `kind: 'travel'`, fuori sessione), poi transazione. Nel callback `planFor` in sessione è la prima operazione; `claimLane` rifiuta per fame PRIMA di qualunque scrittura (punti, `PendingQuest`, registrazione, job). `starvingOrRace` dà la fame solo se il claim è ancora possibile, altrimenti `classifyUnclaimed`. Il callback non ha side effect prima del claim e `registration.before` è azzerato a ogni riesecuzione.
- Consumo del cibo e HP nello stesso `findOneAndUpdate` del claim: le guardie (`mealGuardsOf`) sono spalmate per ultime nel filtro, il `$set` di `mealSetOf` per ultimo nell'update. Jump, marker uguale, story e worldMission passano `meal = null` e non leggono la dispensa (D-13). `movementTo` riusa `autoRequestOf`/`planAuto` e il WARN del salto resta solo lì.
- `previewTravel`: `null` solo per story, lane diversa da standard, marker nullo/uguale, nessuna strada. `QUEST_NOT_IN_CITY` e `NOT_FOUND` come l'accettazione. `QUEST_NOT_ACCEPTABLE` ereditato da `autoRoute` per marker senza POI. Nessun codice di fame (risponde `arrivesAlive: false`), nessuna scrittura, nessun log del salto (usa `autoRoute`, non `planAuto`). Il `null` non nasconde errori reali.
- Resolver: `@OwnsCharacter(..., { ownerOnly: true })`, `@Query(() => TravelPreview, { nullable: true })`, `AcceptQuestRequest` riusato. La riga della query nel diff di `schema.gql` coincide carattere per carattere con le REPO-RULES e con l'asserzione di `test/app.int-spec.ts:618`.
- Modelli: `TravelFoodItem { item: LootItem!, quantity: Int! }`, `TravelPreview.food/hpLost/arrivesAlive` non nullable, `hpAfter/needed/covered` assenti dallo schema. Il diff di `schema.gql` è puramente additivo e il blocco `TravelPreview` è ordinato. `foodItemsOf` idrata i documenti (niente `lean`), con populate a profondità 1.
- Codice `TRAVEL_STARVING` nell'enum e nella factory, con il messaggio esatto «Non hai cibo a sufficienza per il viaggio».
- Fixture: nessun id reale né segreto, helper deterministici.
- Copertura: la fame prima di ogni scrittura, la fame in transazione quando il cibo sparisce, la corsa che vince sulla fame, le esenzioni D-13, la concorrenza di due partenze sullo stesso cibo, tutti i rifiuti di `questTravelPreview` sul filo e i controlli owner-only sono coperti da int-spec.

## Critical

### Gruppo A

Nessuno.

### Gruppo B

Nessuno.

## Warning

### Gruppo A

### A-WR-01: voce duplicata con la prima non valida: il knapsack mangia dalla seconda, l'inventario scala la prima

**File:** `src/travel/food/food-selection.ts:57-65` (con `src/economy/trade/trade-inventory.ts:55-62`, `mealSetOf` in `src/travel/food/travel-food.updates.ts:31-37`)
**Issue:** `edibleStacksOf` filtra la validità PRIMA di deduplicare per id: se `assets.ownedItems` contiene due voci dello stesso `LootItem` e la prima è non valida (quantità 0, non intera, `power` non positivo sul catalogo non cambia fra le due), la prima viene scartata e la seconda diventa «la prima occorrenza». Il commento dice invece «prima occorrenza di ogni id: `applyTradeToInventory` scala solo la prima voce». `mealSetOf` poi chiama `applyTradeToInventory`, che con `findIndex` trova la voce NON valida (quantità 0) e lancia `INSUFFICIENT_ITEM_QUANTITY` (`sell`), mentre la guardia `$elemMatch` del filtro invece combacerebbe con la seconda voce. Risultato: la partenza fallisce con un codice sbagliato pur avendo cibo valido, e il giocatore resta bloccato finché i dati non vengono corretti. Il caso richiede un inventario legacy sporco (le voci a zero normalmente spariscono), ma la spec D-06 copre solo il duplicato con la prima VALIDA.
**Why it matters:** la selezione e il consumo devono parlare della stessa voce (D-12/D-17); oggi divergono nell'unico caso in cui la prima occorrenza non è commestibile.
**Suggested fix:** deduplicare sull'inventario grezzo prima di filtrare: tenere la prima occorrenza di ogni id (valida o no) e poi applicare `isEdible`, così una prima voce non valida esclude l'id (fail-closed, nessuna divergenza). Spec RED prima in `food-selection.spec.ts`: `selectFood(20, [stack(A, 20, 0), stack(A, 20, 5)])` deve dare `{ consumed: [], covered: 0 }` (oggi dà `consumed: [{ itemId: A, quantity: 1 }]`).

### Gruppo B

Nessuno.

## Info

### Gruppo A

### A-IN-01: `previewOf` può mostrare meno cibo di quello contato nel piano

**File:** `src/travel/food/travel-pantry.reader.ts:128-143`
**Issue:** `foodItemsOf` salta in silenzio un `LootItem` sparito dal catalogo fra la lettura della dispensa e l'idratazione, quindi `food[]` può risultare più corto di `plan.consumed` mentre `hpLost`/`arrivesAlive` sono calcolati sul cibo completo. La finestra è minima (stesso lookup di pochi ms) e la partenza ricalcola comunque sul cibo del momento (D-10), quindi nessun effetto sui dati.
**Why it matters:** solo coerenza dell'anteprima in un caso quasi impossibile.
**Suggested fix:** nessuna azione obbligatoria; se si vuole, loggare a WARN l'id mancante (solo id) come già fatto per il pet con `speedModifier` non valido.

---

_Reviewed: 2026-11-05T22:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

### Gruppo B

### B-IN-01: il parametro `cost` di `laneClaimUpdate` collide con il «costo in punti» del dominio

**File:** `src/quests/acceptance/quest-acceptance.updates.ts:80`
**Issue:** il quarto parametro, che porta le chiavi `$set` di cibo e HP (`mealSetOf`), si chiama `cost`. Nello stesso modulo di accettazione (`accept`, `costOrReject`, `pointsSpent: cost`) `cost` indica il costo in punti canale.
**Why it matters:** solo leggibilità: chi legge `laneClaimUpdate(..., cost)` può scambiare il cibo per un addebito di punti, proprio dove la regola è che nulla di economico viene scritto prima del rifiuto. Nessun effetto sul comportamento.
**Suggested fix:** rinominare in `mealSet` (o `foodEffects`), con `Record<string, unknown> = {}`; la spec `quest-acceptance.updates.spec.ts:166` passa i valori in posizione, quindi non cambia.

### B-IN-02: `Model<any>` nella fixture del cibo

**File:** `test/travel/travel-food.fixture.ts:10`
**Issue:** `persistFood(model: Model<any>, ...)` usa `any` esplicito.
**Why it matters:** solo stile: nasconde il tipo del documento, ed è l'unica deroga al tipo forte in questa fixture. Nessun rischio funzionale.
**Suggested fix:** allinearsi alla firma di `persistLootItem` in `test/fixtures` (riusarne il tipo di `model` con `Parameters<typeof persistLootItem>[0]`) invece di `Model<any>`.

---

_Reviewed: 2026-11-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
