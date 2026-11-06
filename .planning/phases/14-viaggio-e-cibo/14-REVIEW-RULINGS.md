---
phase: 14-viaggio-e-cibo
ruled: 2026-11-05T22:10:00Z
source: 14-REVIEW-A.md (0 critical, 1 warning, 1 info) + 14-REVIEW-B.md (0 critical, 0 warning, 2 info), fusi in 14-REVIEW.md
rulings:
  fix: 2
  not_needed: 2
  deferred: 0
---

# Ruling della review — Phase 14 Viaggio e cibo (orchestratore, 2026-11-05)

Fatti verificati sul codice prima dei ruling: `edibleStacksOf` (`src/travel/food/food-selection.ts`) applica `isEdible` PRIMA della deduplicazione per id, mentre `applyLines` (`src/economy/trade/trade-inventory.ts:69-76`) scala sempre la PRIMA voce con quello stesso id (`findIndex`): con un inventario legacy che porta due voci dello stesso `LootItem` di cui la prima non valida, la selezione mangia dalla seconda e `mealSetOf` lancia `INSUFFICIENT_ITEM_QUANTITY` (A-WR-01 reale, scenario raro). `persistLootItem` in `test/fixtures/catalog-item.fixture.ts:43-46` ha a sua volta `model: Model<any>` (B-IN-02 è la convenzione delle fixture).

| ID | Severità | Ruling | Direzione per il fixer |
|----|----------|--------|------------------------|
| A-WR-01 | warning | **FIX** | In `food-selection.ts` deduplicare per id sulla lista GREZZA prima del filtro di validità (prima occorrenza per id, come fa `applyLines`): una voce doppia la cui prima occorrenza non è commestibile resta FUORI dalla selezione (nessuna partenza col codice sbagliato; il server rifiuta solo se affamato). Spec RED prima in `food-selection.spec.ts`: `selectFood(20, [stack(A, 20, 0), stack(A, 20, 5)])` → `{ consumed: [], covered: 0 }` con titolo che nomina `(D-06)` e il motivo («la prima voce per id è quella che l'inventario scala»); la spec esistente «prima occorrenza valida tenuta» va riletta: se asseriva che si salta la prima voce NON valida, si aggiorna coerentemente (è il comportamento che cambia). Commit `test(food)` + `fix(food)`; `npx jest src/travel/food --selectProjects unit` verde; nessuna modifica a `trade-inventory.ts`. Aggiornare il commento sopra `edibleStacksOf`. |
| A-IN-01 | info | **NOT_NEEDED** | `TravelPantryReader.read` costruisce gli stack SOLO dagli id presenti nel catalogo `hunger` letto nella stessa richiesta e `foodItemsOf` idrata quegli stessi id subito dopo: un oggetto può sparire solo nella finestra di millisecondi fra le due letture, e la partenza ricalcola comunque sul cibo del momento (D-10). Nessun log aggiunto (il handoff già dice che l'anteprima è informativa). |
| B-IN-01 | info | **FIX** | Rinominare il parametro `cost` in `mealSet` sia in `laneClaimUpdate` (`quest-acceptance.updates.ts`) sia in `startTravelUpdate` (`travel.updates.ts`, stesso parametro con lo stesso significato) e nei chiamanti (`quest-acceptance.service.ts`, `travel.service.ts`); solo refactor, nessun cambio di comportamento (le spec passano i valori in posizione); aggiornare i commenti che dicono «cost». Commit `refactor(travel): name the meal set of the departure builders`; `npx tsc` + spec unit dei due builder verdi. |
| B-IN-02 | info | **NOT_NEEDED** | `persistLootItem` stessa dichiara `model: Model<any>` (`test/fixtures/catalog-item.fixture.ts:44`): la fixture del cibo segue la convenzione delle fixture del repo; `Parameters<typeof persistLootItem>[0]` risolverebbe comunque a `Model<any>`. Un'eventuale tipizzazione forte di tutte le fixture è fuori fase. |

Il verifier parte sul codice fermo dopo il piano 14-08; il fixer parte DOPO il verifier (stesso albero, jest in sequenza); l'audit di sicurezza per ultimo sull'HEAD dopo i fix.
