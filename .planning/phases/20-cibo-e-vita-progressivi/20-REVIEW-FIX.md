---
phase: 20-cibo-e-vita-progressivi
fixed_at: 2026-11-12
review_path: .planning/phases/20-cibo-e-vita-progressivi/20-REVIEW.md
iteration: 1
findings_in_scope: 15
fixed: 13
not_needed: 2
skipped: 0
status: all_fixed
---

# Phase 20: report dei fix della code review

**Data:** 2026-11-12
**Review di partenza:** `.planning/phases/20-cibo-e-vita-progressivi/20-REVIEW.md` (ruling dell'orchestratore in fondo al file)
**Ramo:** `feat/20-cibo-e-vita-progressivi`, da `e832565a` a HEAD (23 commit di fix, più questo report)

**Sintesi**
- Finding in scope: 15 (2 warning, 13 info; A-IN-04 ha quattro punti e A-IN-06 tre)
- Corretti: 13 (B-IN-02 solo in parte: vedi la riga)
- `not_needed`: 2 (A-IN-02, decisione del ruling; A-IN-04.4 e la vita a zero di A-IN-06 sono punti dentro finding corretti)
- `skipped`: 0
- Codice di produzione toccato: `travel-food-settlement.ts`, `travel-food.sweep.ts`, `travel-food.updates.ts`, `food-curve-change.ts` (nuovo), `travel-sweeper.ts`, `travel.updates.ts`, `travel.service.ts`, `travel-pantry.reader.ts`, `ambush-food.ts`, `ambush-resolution.service.ts`, `quest-acceptance.service.ts`. SDL invariato, nessuna variabile d'ambiente nuova.

## Esito per finding

| Id | Esito | Commit | Prova |
|----|-------|--------|-------|
| A-WR-01 | fixed | `f9420cf0` RED, `42afa8fe` GREEN | `foodLegOf` rifiuta uno `startTime` che non è una `Date` valida, e ogni lettura del documento in `settleSafely` sta dentro il `try`. `COMPLETION_PROJECTION` legge anche `startTime`: senza, l'arrivo avrebbe perso il piano. Caso int `skips a travel whose start is not a date and still settles the others (D-11, D-15)`: `startTime` stringa scritto con `collection.updateOne` accanto a un viaggiatore sano, che viene assestato lo stesso; un solo warn con il solo id. In RED dava `TypeError: travel.startTime.getTime is not a function`. Caso unit `rejects a plan whose travel start is not a valid date (D-11, D-15)`. |
| A-IN-01 | fixed (solo documento) | `cfe52082` | D-19 in `20-CONTEXT.md` ora dice: il totale è quello della copertura reale, e i km scoperti della curva nuova già percorsi si pagano al pasto del confine. Nota «Chiarito dopo la review (A-IN-01), 2026-11-12». Codice invariato. |
| A-IN-02 | not_needed | — | Ruling: nessun cambio al codice. Va dichiarato nell'handoff §2 (vedi sotto). |
| A-IN-03 | fixed | `4632ca90` RED, `b71adb7b` GREEN | `TravelFoodSweep` segnala un viaggio una volta sola: tiene un `Set` in memoria con chiave id + `startTime`, al massimo `MALFORMED_PLAN_WARNINGS_KEPT = 1 000` chiavi, e lo svuota quando è pieno. Nulla a DB. Nel repo non c'era un precedente «warn-once» limitato, solo i flag `redisWarned` degli scheduler. Casi int: `warns about a malformed food plan once per travel (D-11, D-15)` (due tick, un warn) e `forgets the warned travels past the memory bound (D-15)`. |
| A-IN-04.1 | fixed (test) | `d8b2d088`, `283e61a6` (tipo della sessione: `tsc` falliva sul commit precedente) | Ramo `matchedCount !== 1` esercitato in modo deterministico. Uno spy su `TravelPantryReader.read` sposta `food.settledKm` nella stessa sessione dopo la lettura in sessione; la guardia manca, nessun doppio addebito. Sonda: togliendo la guardia su `settledKm` il caso diventa rosso. |
| A-IN-04.2 | fixed (test) | `d8b2d088` | Uno spy su `find` restituisce uno `startTime` vecchio (viaggio sostituito): nessuna scrittura, documento identico. Prima del fix, togliendo `startTime` dal filtro la suite restava verde. Ora il caso nuovo diventa rosso. |
| A-IN-04.3 | fixed (test) | `e6431ff1` | Titolo → `keeps only the food plan fields (D-10)`. |
| A-IN-04.4 | not_needed | — | Ruling: coerenza indice/filtro verificata dal revisore, niente `explain` nelle spec. |
| A-IN-05 | fixed | `1b521167` RED, `0919ce2d` GREEN | `FOOD_LEG_PROJECTION` accanto a `foodLegOf` sostituisce `FOOD_TRAVELLER_PROJECTION` e `TELEPORT_FOOD_PROJECTION`, entrambe rimosse. `TravelSweeper` toglie `codeOf` e usa `describeError` per tutte e tre le righe di errore (cambio dei log, vedi sotto). |
| A-IN-06 | fixed (vita ≤ 0: not_needed) | `6a7d7e51` | Tolti il ramo `distanceKm <= 0` di `mealNeedOf` e il suo caso di spec (`foodLegOf` scarta le distanze ≤ 0), e l'azzeramento ridondante di `outcome` in `settleOne`. `tsc` 0, coverage di cartella sopra soglia (gate). Vita ≤ 0: `not_needed` per ruling. |
| B-WR-01 | fixed (test) | `0d53c228` | (1) `walkToTheEnd` registra a ogni scatto vita, dispensa e piano. Il caso ora asserisce: un calo della vita a viaggio aperto, più di due vite distinte, la dispensa piena prima del confine, poi dispensa vuota con `foodConsumedAt` valorizzato dopo il confine, sempre a viaggio aperto. Sonda: togliendo il passo «fame» da `runOnce` il caso diventa rosso. (2) Rinominato in `eats on arrival the same food the Phase 14 ate at departure (D-03, D-13)`. Una dispensa mista che cambia la selezione copre tutto il fabbisogno, quindi il confine coincide con la fine della strada. Con copertura parziale `selectFood` mangia tutto, quindi lì la selezione non si distingue. |
| B-IN-01 | fixed | `b91de163` RED, `c08a5f8a` GREEN | Il catalogo del cibo dell'imboscata si legge dentro il callback con `foodCatalogFor(inSession.assets.ownedItems, session)`, anche nei retry; `Fight.foodCatalog` rimosso. Caso int `builds the boundary meal from the food catalog read in session (D-14)`: il cibo entra in dispensa durante `readCombatCatalog` (spy). In RED la vita finiva a 1, ora a 945. |
| B-IN-02 | fixed per l'imboscata; arrivo e teleport non applicabili | `68e40c25` RED, `f15a1871` GREEN | Il testo della riga D-19 ha una sola sorgente, `curveChangeOf` + `curveChangeMessageOf` in `src/travel/food/food-curve-change.ts`, usata da sweep e imboscata. L'imboscata la scrive dopo il commit quando `food.progress.curve` è presente. Caso int `logs the rewritten curve of a short pantry after the commit (D-19)` (14 F20, `km scoperti 120 → 260`). Arrivo e teleport: `settlementOf` esegue il fail-safe solo con il momento `progress`, quindi nei momenti `arrival`/`stop` la curva è sempre `null`. Non c'è una curva riscritta da segnalare e il documento chiude il viaggio. Il «pasto corto» all'arrivo o al teleport resta senza log: aggiungerlo vorrebbe dire un dato nuovo nell'assestamento, che il ruling non chiede. |
| B-IN-03 | fixed (commenti) | `024cba1b` | Riallineati i due commenti del teleport in `travel.service.ts` e i due di `travel-pantry.reader.ts`, dopo B-IN-01. |
| B-IN-04 | fixed | `b7fae533` RED, `b373b63b` GREEN | `planFor` restituisce il `TravelFoodPlan`; `PlannedMeal` rimosso. Il cambio resta nel lettore e nei due chiamanti (partenza libera, claim e pre-verifica dell'accettazione); int-spec del lettore aggiornata. |
| B-IN-05 | fixed | `a793b21b` RED, `3c32a2d7` GREEN | `ambushFoodOf` → `null` con `km` non finito (`NaN`, `Infinity`, assente). Caso unit `has no food step for an ambush without a finite kilometre (D-11, D-16)`. |
| B-IN-06 | fixed (test, dopo verifica) | `ff3874af` | Verifica: nessuna spec citava il ramo. Uno spy su `TravelPantryReader.read` restituisce una volta una vita grezza incoerente: l'arrivo rigetta con `arrival food settlement lost its guards`, documento intatto, poi il `TravelSweeper` lo completa con i 55 HP del piano. Il ruling chiedeva un override del provider: lo spy fa la stessa cosa senza un secondo harness. |
| B-IN-07 | fixed (test) | `45dc80e4` | Il caso «plentiful pantry» ora usa il piano che una partenza reale salva per 10 unità su 20 km: al km 5 toglie solo le 5 unità pro-rata, senza fame. Nuovo caso `charges only the hunger left past the boundary and never eats a second meal (D-03, D-17)`: dopo il pasto dello sweep si paga solo la fame dal km 13 al 15 (9 HP) e il cibo ricevuto dopo il pasto non si mangia; sonda su `foodConsumedAt` rossa. D-04 tolto dal titolo del caso legacy. Codice di produzione invariato. |

## Fatti per l'handoff (piano 11)

- **A-IN-02 (§2):** lo sweep emette `characterUpdated` senza cambi sul filo in due casi. Una volta per viaggio, al confine con la dispensa vuota (scrive solo `foodConsumedAt`/`settledKm`). E a ogni km scoperto quando la vita è già a `MIN_LIFE_POINTS` (riscrive 1 e `settledKm`). «Niente `characterUpdated` a vuoto» vale come «non ogni minuto», non come «mai».
- **Cambi di log:**
  - `TravelSweeper` usa `describeError`: `Completamento del viaggio del personaggio <id> fallito: Error, code 112` (prima `112`), `… UnknownError` (prima `unknown`), `Sweep dei viaggi fallito: Error, code ECONNRESET` (prima `ECONNRESET`), `Sweep della fame fallito: <nome>[, code <n>]`.
  - Il warn `Viaggio del personaggio <id>: piano del cibo non valido, ignorato` parte una volta per viaggio (memoria di 1 000 viaggi). Copre anche un `startTime` che non è una data: prima lanciava un errore e fermava lo sweep di tutti gli altri.
  - Nuova riga nell'imboscata, identica a quella dello sweep: `Viaggio del personaggio <id>: cibo cambiato al confine, km scoperti X → Y`, dopo il commit.
- **D-19 (A-IN-01):** testo corretto in CONTEXT; l'handoff deve usare la stessa frase (i km scoperti della curva nuova già percorsi si pagano al confine).
- **Interni cambiati (nessun effetto sul filo):** `COMPLETION_PROJECTION` + `startTime`; `FOOD_LEG_PROJECTION` unica; `planFor` restituisce il piano; il catalogo del cibo dell'imboscata si legge in sessione.

## Gate dopo i fix

Tutto in foreground salvo il blocco «resto di `src/`», che lo strumento ha spostato in background a 180 s: l'esito è stato letto dal log a fine processo, exit 0.

| Passo | Esito |
|-------|-------|
| `tsc --noEmit` (`tsconfig.json`, `tsconfig.build.json`) | 0 / 0 |
| Unit completo | 274 suite / 3 591 test (gate 20-10: 3 590) |
| Integration `src/travel` | 12 / 244 (prima 235), 75 s |
| Integration `src/quests` | 35 / 529, 175 s |
| Integration resto di `src/` (77 file di `int-list-srcrest.txt`) | 77 / 992, 199 s |
| Integration `test/` (17 file di `int-list-test.txt`) | 17 / 272, 52 s |
| Totale integration | 141 suite / 2 037 test; `--listTests` = 141 file, nessuna int-spec nuova fuori da `src/travel` |
| Coverage `./src/travel/` (unit + integration) | 98,75 / 86,99 / 99,37 contro 97 / 84 / 98 (36 suite / 496 test) |
| Coverage `./src/quests/acceptance/` | 99,06 / 92,79 / 99,73 contro 97 / 91 / 98 (6 suite / 393 test) |
| `git diff --exit-code src/schema.gql` | 0; `package.json` senza diff |
| Lint mirato (prettier `--check` + eslint) sui 22 `.ts` toccati | nessun errore |
| Trailer nei commit / subject > 72 / `jest.mock(`, `Date.now`, `process.env`, `Math.random`, `$inc` aggiunti / operatori nei titoli | 0 / 0 / 0 / 0 |
| `pgrep -fl 'bin/jest'` | vuoto |

---

_Fixed: 2026-11-12_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
