---
phase: 14-viaggio-e-cibo
fixed: 2026-11-05
source: 14-REVIEW.md
review_path: .planning/phases/14-viaggio-e-cibo/14-REVIEW.md
rulings_path: .planning/phases/14-viaggio-e-cibo/14-REVIEW-RULINGS.md
iteration: 1
fix_scope: all
findings_total: 4
findings_in_scope: 4
fixed_count: 2
skipped_count: 0
not_needed_count: 2
deferred_count: 0
status: all_fixed
---

# Phase 14: report dei fix della code review

**Data dei fix:** 2026-11-05
**Review di partenza:** `.planning/phases/14-viaggio-e-cibo/14-REVIEW.md` (gruppi A/B, dettagli in `14-REVIEW-A.md` e `14-REVIEW-B.md`)
**Ruling applicati:** `.planning/phases/14-viaggio-e-cibo/14-REVIEW-RULINGS.md`
**Base:** `fe3f1a5` su `feat/14-viaggio-e-cibo`
**Iterazione:** 1

**Esito:** 4 finding (0 critical, 1 warning, 3 info) → 2 corretti (A-WR-01, B-IN-01), 2 `not_needed` per ruling (A-IN-01, B-IN-02), 0 saltati, 0 rinviati. 3 commit di codice, più questo report.

## Tabella dei finding

| Finding | Esito | Commit | Note |
| --- | --- | --- | --- |
| A-WR-01 | fixed | `38f9713` (RED), `d8a51d3` (GREEN) | `edibleStacksOf` in `src/travel/food/food-selection.ts` ora prende la prima occorrenza di ogni id sulla lista grezza (`firstEntriesOf`, valida o no) e solo dopo applica `isEdible`: selezione e consumo parlano della stessa voce che `applyTradeToInventory` scala. RED `leaves out an item whose first entry is not edible: the inventory scales the first entry per id (D-06)`: `selectFood(20, [stack(A, 20, 0), stack(A, 20, 5)])` dava `consumed: [{ A, 1 }]`, `covered: 20`, ora `{ consumed: [], covered: 0 }`. La spec esistente sul duplicato (`ignores a duplicate stack of the same item after the first (D-06)`) ha la prima voce valida e resta invariata. Commento sopra `edibleStacksOf` aggiornato. `trade-inventory.ts` non toccato. |
| A-IN-01 | not_needed | — | `TravelPantryReader.read` costruisce gli stack solo dagli id del catalogo `hunger` letto nella stessa richiesta e `foodItemsOf` idrata gli stessi id subito dopo: un oggetto può sparire solo in una finestra di millisecondi, e la partenza ricalcola comunque sul cibo del momento (D-10). Nessun log aggiunto (il handoff dice già che l'anteprima è informativa). |
| B-IN-01 | fixed (refactor) | `6b62aa4` | Parametro `cost` rinominato `mealSet` in `laneClaimUpdate` (`quest-acceptance.updates.ts`) e `startTravelUpdate` (`travel.updates.ts`); commento «salto e nessun movimento non costano» → «non consumano». I chiamanti (`quest-acceptance.service.ts`, `travel.service.ts`) passano il valore in posizione e non hanno variabili chiamate `cost`: invariati. Nessun cambio di comportamento (`quest-acceptance.updates.spec.ts` + `travel.updates.spec.ts` 52/52). |
| B-IN-02 | not_needed | — | `persistLootItem` stessa dichiara `model: Model<any>` (`test/fixtures/catalog-item.fixture.ts:44`): la fixture del cibo segue la convenzione delle fixture del repo, e `Parameters<typeof persistLootItem>[0]` risolverebbe comunque a `Model<any>`. Una tipizzazione forte di tutte le fixture è fuori fase. |

Ogni commit ha `tsc` a 0 (la RED di A-WR-01 compila: fallisce solo l'asserzione). Prettier ed eslint puliti sui quattro file toccati, uno per uno.

## Gate finale

| Controllo | Esito |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx jest src/travel src/quests src/models src/gameRules --selectProjects unit` | 79 suite / 1052 test verdi |
| `npx jest src/travel/travel.service.int-spec.ts --selectProjects integration --runInBand` | 20/20 |
| `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand` | 98/98 |
| `git diff --exit-code src/schema.gql` | exit 0 |
| `git diff origin/develop -- src/schema.gql`, righe tolte | 0 |
| `Math.random` / `process.env.` aggiunti sotto `src/` | 0 |
| trailer vietati in `fe3f1a5..HEAD` | 0 (controllato dopo ogni commit) |
| `git status --short` / `pgrep -fl jest` a fine lavoro | vuoti |
| processo BE dell'utente (pid 90637) | vivo, `dist/` non toccato (nessuna build) |

Nessun test instabile osservato.

## Note per il handoff FE

- **Contratto FE:** nessun cambio di SDL né di nomi; `BACKEND-NOTES.md` non descrive la gestione delle voci duplicate, quindi il handoff non cambia.
- **Unico comportamento osservabile cambiato (A-WR-01), solo con inventari legacy sporchi:** se `assets.ownedItems` contiene due voci dello stesso oggetto `hunger` e la prima ha quantità 0 o non intera, quell'oggetto non entra più né nella `food` dell'anteprima né nel consumo della partenza o del claim. Prima l'anteprima lo contava e la partenza falliva con `INSUFFICIENT_ITEM_QUANTITY`; ora l'anteprima risponde coi numeri senza quell'oggetto e la partenza rifiuta con `TRAVEL_STARVING` solo se senza di esso il personaggio non arriverebbe vivo. Con inventari normali (una voce per oggetto) nulla cambia.
- B-IN-01 è un puro rinomino interno: nessun effetto sul filo.

---

_Fixed: 2026-11-05_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
