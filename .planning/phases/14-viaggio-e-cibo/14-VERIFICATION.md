---
phase: 14-viaggio-e-cibo
verified: 2026-11-05T22:11:00Z
status: passed
score: 4/4 success criteria verified (6/6 requisiti BE-FOOD-01..06, contratto FE rispettato, nessun gap)
overrides_applied: 0
re_verification: false
gaps: []
human_verification:
  - test: "UAT su device della FE Phase 15 (differita, piano 15-09; dati e casi di `14-viaggio-e-cibo/BACKEND-NOTES.md` §7)"
    expected: "Dopo la merge, build e riavvio del BE a BE fermo (nessuna variabile, migrazione o seeder nuovi, §8); il cibo e gli HP del personaggio di prova li scrive l'orchestratore a DB fuori dal repo (voci `{ itemType: 'LootItem', item: <ObjectId di un LootItem hunger>, quantity }` mantenendo le esistenti; `status.currentLifePoints` fra 1 e `maxLifePoints`; «Razione da viaggio» power 100, «Pane di Elfo» 200, cibi piccoli power 5–20). Casi: (a) coperto, una razione verso la città più vicina (~55 power / 16 km): anteprima `food` = 1 razione, `hpLost` 0, `arrivesAlive` true, razione sparita alla partenza; (b) parziale, due cibi da 20 e HP pieni: `hpLost` ~15, cibo sparito e HP scalati; (c) rifiutato, niente cibo e HP bassi (es. 100 con `hpLost` 136) o meta lontana: `arrivesAlive` false, `startTravel` con `TRAVEL_STARVING` e nessuna scrittura; (d) quest standard con marker su strada, con cibo e senza: riga «Viaggio» da `questTravelPreview`, cibo mangiato al claim o `TRAVEL_STARVING` senza punti scalati; (e) esenzioni: salto, story/worldMission, teleport dell'oste, `questTravelPreview` `null`, nessun consumo né rimborso"
    why_human: "Esperienza di gioco sul device e dati sul DB reale; fuori dal perimetro della fase BE (nessun checkpoint umano nella fase), non bloccante"
---

# Phase 14: Viaggio e cibo — Verification Report

**Phase Goal:** viaggiare consuma cibo: fabbisogno = 1 power ogni 3 minuti della durata del pianificatore (terreno, pet e ferite inclusi), selezione a scarto minimo fra gli oggetti `hunger`, consumo alla partenza; i km scoperti costano vita (il km n-esimo n HP); partenza libera o automatica da quest rifiutata se non si arriva con almeno 1 HP; teleport e salto esenti.
**Verified:** 2026-11-05T22:12:00Z (branch `feat/14-viaggio-e-cibo`, HEAD `eec5eb1`, base `develop` `698ae82`)
**Status:** passed (nessun gap; UAT su device differita alla FE Phase 15 in `human_verification`)
**Re-verification:** No — verifica iniziale

## Metodo

Lettura di codice, spec e handoff contro ROADMAP §Phase 14 (4 criteri), REQUIREMENTS BE-FOOD-01..06, `14-CONTEXT.md`/`14-REPO-RULES.md` (contratto FE) e `BACKEND-NOTES.md`. Eseguiti (nessuna scrittura, nessun accesso a `.env` né al DB reale, nessun `npm run build`):

- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- Unit `src/travel/food`, `src/travel/travel.updates.spec.ts`, `src/quests/acceptance/quest-acceptance.updates.spec.ts`, `src/gameRules --selectProjects unit` → 6 suite / 119 test verdi.
- Integration, una suite alla volta con `--runInBand`: `src/travel/travel.service.int-spec.ts` 20/20 (incluse «lets exactly one of two concurrent departures eat the same food (D-12)» e «keeps a concurrent non-food purchase made after the pantry read (D-20)»); `src/quests/acceptance/quest-acceptance.service.int-spec.ts` 98/98.
- Gate SDL: `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` → vuoto (solo righe aggiunte: `questTravelPreview`, `TravelFoodItem`, `TravelPreview.arrivesAlive/food/hpLost`).
- `pgrep -fl jest` vuoto; `git status --short` pulito prima della scrittura di questo file.
- Suite completa e coverage non rilanciate: sono il gate 14-07 (341 suite / 4333 test, soglie rispettate).

## Goal Achievement — Success Criteria

| # | Criterio | Stato | Evidenza |
|---|----------|-------|----------|
| 1 | Modulo puro: costanti (3 min/power), fabbisogno ⌈durata/3 min⌉, scarto minimo con tie-break, oggetto parziale consumato intero, km scoperti per eccesso, triangolare, HP risultante ≥ 1 altrimenti rifiuto | VERIFIED | `travel-food.ts`: `FOOD_RULES = { minutesPerPower: 3, minLifePoints }`, `foodNeededFor` = `Math.ceil(ms / 180 000)`, `uncoveredKmOf` in metri interi (`ceil((needed − covered) × metri / (needed × 1000))`, coperto ⇒ 0; 55/40/16 km → 5, 55/5/1,1 → 1), `hpLostFor` = n(n+1)/2 (5 km → 15 HP), `planTravelFood` con `arrivesAlive = hpAfter ≥ 1`. `food-selection.ts`: bounded knapsack con ordine lessicografico scarto minimo → meno unità → minor `sellCopper` → id esadecimale più basso; cibo insufficiente ⇒ `eatEverything`; stack non validi scartati. Spec unit in `food-selection.spec.ts` / `travel-food.spec.ts` verdi (esempi 50+20×3 → i tre 20, 50/10/20×3 → 50+10, il solo 200 per 10) |
| 2 | `travelPreview` additivo con cibo (item idratato e quantità), `hpLost`, `arrivesAlive`; `questTravelPreview` owner-only, stessa forma, nullable senza viaggio; mai il codice di fame | VERIFIED | `src/schema.gql` e modelli: `TravelFoodItem { item: LootItem!, quantity: Int! }`, `TravelPreview.food: [TravelFoodItem!]!`, `hpLost: Int!`, `arrivesAlive: Boolean!`, `questTravelPreview(request: AcceptQuestRequest!): TravelPreview` nullable. `TravelPantryReader.previewOf` costruisce la stessa forma per entrambe; `foodItemsOf` carica i documenti `LootItem` (non lean) per l'idratazione. Resolver con `@OwnsCharacter(..., { ownerOnly: true })` (int-spec con `FORBIDDEN` «Questo personaggio non ti appartiene»). `QuestAcceptanceService.previewTravel`: `null` per story, worldMission, marker = posizione e salto senza strada (`autoRoute` senza WARN); nessuna scrittura. L'anteprima non lancia mai `TRAVEL_STARVING` |
| 3 | `startTravel` e `acceptQuest` consumano cibo e scalano HP nello stesso update condizionale (quantità e HP riaffermati nel filtro), rifiuto `TRAVEL_STARVING` senza scritture; teleport e salto esenti | VERIFIED | `travel.service.ts`: `departWithMeal` dentro `connection.transaction`, dispensa letta in sessione (`planFor(..., session)`), `startTravelFilter(..., mealGuardsOf(...))` e `startTravelUpdate(..., mealSetOf(...))` nello stesso `findOneAndUpdate` con `session`; rifiuto prima di scrivere con `starvingOrRace` (il codice di corsa precede la fame). `quest-acceptance.service.ts`: pre-verifica `fedOrReject` dopo eligibility, città e movimento, poi `meal` letto in transazione solo se `movement.kind === 'travel'` e guardie/set nel claim della corsia standard; salto, nessun movimento, story e worldMission non mangiano. `mealGuardsOf` riafferma le quantità vendute (`soldQuantityGuards`) e gli HP solo se scendono; `mealSetOf` scrive `assets.ownedItems` (via `applyTradeToInventory`) e `status.currentLifePoints` solo se servono. Codice: `GameRuleErrorCode.TRAVEL_STARVING` con messaggio «Non hai cibo a sufficienza per il viaggio» (spec `game-rule.exception.spec.ts`). Il teleport (`travel.resolver.ts` e il suo servizio) non referenzia la dispensa; `teleport.resolver.int-spec.ts` asserisce nessun consumo |
| 4 | Integration: coperto, parziale, rifiutato; pet ×2 dimezza, ferita raddoppia, strada lenta costa di più; concorrenza fra due partenze → una sola; handoff per la FE Phase 15 | VERIFIED | `travel.service.int-spec.ts` 20/20 e `quest-acceptance.service.int-spec.ts` 98/98 (coperto, parziale, rifiutato senza scritture, modificatori asseriti come rapporti di fabbisogni, due partenze con lo stesso cibo → una sola, acquisto concorrente non-cibo che sopravvive, D-20), più `travel-planning.int-spec.ts`, `travel.resolver.int-spec.ts`, `accept-quest.resolver.int-spec.ts`, `teleport.resolver.int-spec.ts`, `travel-pantry.reader.int-spec.ts` coperti dal gate 14-07. Handoff `BACKEND-NOTES.md` con §0 TL;DR, §1 contratto, §2 codici, §3 semantica, §4 anteprime, §5 concorrenza, §6 esenzioni, §7 dati per la UAT, §8 deploy, §9 deviazioni |

**Score:** 4/4.

## Requisiti

| Requisito | Stato | Evidenza |
|-----------|-------|----------|
| BE-FOOD-01 | SATISFIED | SC1 (`FOOD_RULES`, `foodNeededFor`) |
| BE-FOOD-02 | SATISFIED | SC1 (`selectFood`, tie-break, cibo insufficiente → tutto) |
| BE-FOOD-03 | SATISFIED | SC1/SC3 (`uncoveredKmOf`, `hpLostFor`, `arrivesAlive`, rifiuto senza scritture) |
| BE-FOOD-04 | SATISFIED | SC2 (`TravelPreview` additivo, `questTravelPreview` owner-only nullable) |
| BE-FOOD-05 | SATISFIED | SC3 (consumo e HP nello stesso update, teleport e salto esenti) |
| BE-FOOD-06 | SATISFIED | SC4 (int-spec e handoff) |

Nessun requisito orfano: REQUIREMENTS.md mappa sulla Phase 14 solo BE-FOOD-01..06.

## Contratto FE (14-REPO-RULES §Schema)

Rispettato alla lettera: `type TravelFoodItem { item: LootItem!  quantity: Int! }`, `TravelPreview.food/hpLost/arrivesAlive`, `questTravelPreview` nullable e owner-only, codice `TRAVEL_STARVING` con il messaggio previsto; diff SDL puramente additivo (nessuna riga rimossa).

## Note

- I numeri della fixture scritti nei piani (22,24 km / 89 power / 276 HP) erano sbagliati; D-18 è stato emendato (A→B 0,4448 km / 2 power / 1 HP, `questPoi` 0,22 km / 1 power) e le spec usano le funzioni pure: nessun gap.
- Review `14-REVIEW.md` (0 critical): i ruling di `14-REVIEW-RULINGS.md` dispongono due fix (A-WR-01, deduplicare per id sulla lista grezza prima del filtro di validità in `food-selection.ts`, caso raro di inventario legacy con voce doppia; B-IN-01, rinomina del parametro `cost` in `mealSet`) da eseguire DOPO questo verifier; sono già gestiti e non sono gap della fase. Al momento della verifica `edibleStacksOf` filtra ancora prima di deduplicare.
- La verifica non ha rilanciato `test:cov` né la suite completa (gate 14-07 già passato).

## Gaps Summary

Nessun gap. La UAT su device è differita alla FE Phase 15 (piano 15-09) e non blocca la fase BE.
