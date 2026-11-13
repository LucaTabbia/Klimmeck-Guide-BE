---
phase: 20-cibo-e-vita-progressivi
verified: 2026-11-12T23:05:08Z
status: passed
score: 14/14 must-have verificati
overrides_applied: 0
human_verification_deferred:
  - test: "UAT su device con l'app com'è (handoff BACKEND-NOTES.md §4, passi 1-7), dopo il riavvio reale del BE dal ramo"
    expected: "Dispensa e vita invariate alla partenza; cibo tolto in blocco al confine; vita a scatti di un km oltre il confine con la pozione che resta nel conto; totali d'arrivo uguali all'anteprima; sconfitta seminata al km 30 col solo cibo pro-rata e deviazione senza piano; teleport a metà come una sconfitta; viaggio legacy intatto"
    why_deferred: "Device e database reali sono fuori dal verificatore; la pianifica l'orchestratore con l'utente subito dopo questa verifica. Nessuna osservazione è registrata qui."
---

# Phase 20: Cibo e vita progressivi in viaggio — Report di verifica

**Goal della fase (ROADMAP §Phase 20):** cibo e vita del viaggio si pagano mentre si cammina. La partenza calcola e salva il piano senza consumare né scalare nulla; lo sweep scrive la perdita incrementale dei km scoperti (mai sotto 1, esatta al km dell'imboscata e all'arrivo); il cibo si toglie in blocco alla fine dei km coperti, all'arrivo o alla sconfitta; la deviazione resta senza cibo e senza fame.

**Verificato:** 2026-11-12T23:05:08Z
**Ramo / HEAD:** `feat/20-cibo-e-vita-progressivi` @ `4232adc9`, base `466be7e7` (72 commit, albero pulito)
**Status:** passed
**Re-verifica:** no, verifica iniziale

## Metodo e limiti

- Verifica goal-backward **per lettura del codice** della HEAD, non dei SUMMARY. Sola lettura: nessun file di codice toccato.
- **Nessun test eseguito da questo verificatore** (vincolo dell'orchestratore: `npm run test:cov` gira in background sullo stesso albero). I numeri dei test sono quelli del **gate dopo i fix registrato in `20-REVIEW-FIX.md`**: `tsc --noEmit` 0 / 0; unit 274 suite / 3 591 test; integration 141 suite / 2 037 test; coverage `./src/travel/` 98,75 / 86,99 / 99,37 (soglie 97 / 84 / 98) e `./src/quests/acceptance/` 99,06 / 92,79 / 99,73 (soglie 97 / 91 / 98). L'esito di `npm run test:cov` completo non è noto a questo report.
- Dopo il gate (`3175329d`) il ramo ha solo commit di documentazione: `git diff --stat 3175329d..HEAD` tocca solo `.planning/`. Il gate descrive quindi il codice della HEAD.
- Eseguito qui: `git diff 466be7e7..HEAD -- src/schema.gql` → **vuoto**; `package.json` e `package-lock.json` senza diff; nessun trailer nei 72 commit (conteggio 0).

## Raggiungimento del goal

### Verità osservabili

Le prime cinque sono i Success Criteria della ROADMAP (contratto); le altre vengono dai `must_haves` dei piani 01..11 e dalle decisioni D-13..D-19.

| # | Verità | Stato | Evidenza (file:riga) |
|---|--------|-------|----------------------|
| 1 | SC1 — La partenza (libera e da quest) salva il piano su `activeTravel.food` e non scrive inventario né vita; anteprima e rifiuto identici; legacy ignorati | VERIFICATA | Libera: `src/travel/travel.service.ts:142-178` (piano letto in sessione, rifiuto `arrivesAlive` a :154, `foodPlanOf` nel draft a :170; il filtro ha solo `notImprisonedAt`); `src/travel/travel.updates.ts:68-70` (`startTravelUpdate` scrive solo `status.activeTravel`). Quest: `src/quests/acceptance/quest-acceptance.service.ts:142-154` (`movementWithFoodPlan`), :499 (rifiuto in transazione), :515 (claim), :390-397 (pre-verifica); `quest-acceptance.updates.ts:81-101` (nessun `mealSet`). Anteprima: `travel-pantry.reader.ts:123-150` usa lo stesso `planTravelFood` (`travel-food.ts:70-85`, non modificato; `food-selection.ts` fuori dal diff). Campi salvati: `travel-food.ts:121-133`. Legacy: `foodLegOf` → `null` senza `food` (`travel-food-settlement.ts:137-146`). |
| 2 | SC2 — Lo sweep scala la vita solo oltre i km coperti, incrementale, curva triangolare, scrittura atomica guardata da `settledKm`, mai sotto 1; la pozione resta nel conto | VERIFICATA | `travel-food.ts:95-118` (`travelHungerAt` cumulata, `hungerBetween` differenza); `travel-food-settlement.ts:93-97` (fame da `settledKm` al bersaglio), :259-261 (`Math.max(MIN_LIFE_POINTS, …)`), :201-211 (guardia `settledKm`), :188-191 (guardia sulla vita letta); `travel-food.sweep.ts:121-123` (transazione), :136-144 (lettura in sessione di viaggio e dispensa), :155-169 (update guardato), :102 (nessuna scrittura se nulla è dovuto). |
| 3 | SC3 — Cibo tolto una sola volta, in blocco: confine (selezione del piano sul posseduto), arrivo, sconfitta (fabbisogno dei soli km percorsi); teleport a viaggio iniziato = sconfitta; deviazione senza piano | VERIFICATA | `travel-food-settlement.ts:222-229` (`mealIsDue`: `foodConsumedAt` nullo, e per `progress` solo oltre `coveredKm`), :232-242 (`mealNeedOf`: pro-rata `foodNeededFor(durata × km / distanza)` allo `stop`, mai oltre `needed`), :112 e :207-209 (pasto registrato e riaffermato nullo nel filtro), :263-269 e :194 (vendita senza incasso con `soldQuantityGuards`). Teleport: `travel.service.ts:291-321` (`moment: 'stop'`, `reachedKmOf`), :252-270 (stesso `findOneAndUpdate` del teleport, guardie nel filtro). Deviazione: `ambush-plan.ts:321-331` (viaggio riscritto senza `food`), :354. |
| 4 | SC4 — L'imboscata assesta la fame esatta al suo km prima del combattimento (e il cibo oltre il confine); in vittoria stesso piano; l'arrivo assesta fame e cibo nella transazione del completamento; totali identici | VERIFICATA | Imboscata: `ambush-food.ts:33-45` (km **salvato**, `progress`), :65-78 (`withFoodSettlement`); `ambush-resolution.service.ts:427-448` (lettura in sessione, assestamento, poi `buildCombatContext` a :449 col `fighter`); vittoria `ambush-plan.ts:278-285` (`foodProgressSetOf`), sconfitta :194-197 e :347-350. Arrivo: `travel-completion.service.ts:93-116` (stesso callback), :156-188 (`moment: 'arrival'`, bersaglio `leg.distanceKm`, guardia mancata = transazione abortita). Totali: `travelHungerAt` restituisce `hpLostTotal` a fine strada (`travel-food.ts:96`). |
| 5 | SC5 — Unit, integration con orologio finto, SDL identico, handoff | VERIFICATA (esito dei test dal gate registrato) | Spec presenti e sostanziali (tabella requisiti). SDL: diff dalla base vuoto. Handoff: `BACKEND-NOTES.md` §0-§5, confrontato col codice (nomi, log, percorsi coincidono). Il riavvio reale del BE dal ramo è dell'orchestratore (UAT differita). |
| 6 | Il piano è interno, mai sul filo (D-05, D-10) | VERIFICATA | `src/models/character/active-travel-food.model.ts:4-23` (solo `@Schema`/`@Prop`, nessun `@Field` né `@ObjectType`); `active-travel.model.ts` (`food?` solo `@Prop`); `grep` di `settledKm`, `foodConsumedAt`, `uncoveredKm`, `hpLostTotal` in `src/schema.gql` → 0. |
| 7 | Una sola forma di scrittura (D-14): transazione, lettura in sessione, assestamento puro, guardie; nessun `$inc` sulla vita, nessun `lifePointsWithin` nell'assestamento | VERIFICATA | I quattro chiamanti usano `settlementOf`: sweep `travel-food.sweep.ts:145`, arrivo `travel-completion.service.ts:165`, teleport `travel.service.ts:305`, imboscata `ambush-food.ts:37` e :47. `grep` di `lifePointsWithin` in `src/travel/food` → 0; nessun `$inc`, `Date.now`, `Math.random`, `process.env` nei file della fase. |
| 8 | Mai un path `status.activeTravel.food.*` su un viaggio senza piano (legacy, malformato, deviazione, fermo) | VERIFICATA | `foodProgressSetOf` è chiamato solo dove `foodLegOf` ha restituito un piano: `travel-food.sweep.ts:142-143` e :164, `ambush-plan.ts:282-284`; arrivo e teleport scrivono solo `settlementSetOf` (`travel-food-settlement.ts:149-160`) e `settlementGuardsOf(null, …)` all'arrivo (`travel-completion.service.ts:179`); `ambushFoodOf` → `null` senza piano (`ambush-food.ts:34`) e `filterOf` non aggiunge guardie (`ambush-plan.ts:300-302`). |
| 9 | Con un'imboscata pendente la fame non supera `ambush.km` (D-16, D-17) | VERIFICATA | `travel-food-settlement.ts:126-134` (`reachedKmOf` = minimo fra km dell'ora e km dell'imboscata), usato da sweep (:102, :147) e teleport (`travel.service.ts:307`); `settledKm` dopo = massimo (`travel-food-settlement.ts:109`). |
| 10 | `hpBefore` del report d'imboscata = vita al km dell'imboscata, fame compresa (D-18) | VERIFICATA | `ambush-resolution.service.ts:468-470` passa `fighter` come `snapshot`; `ambush-plan.ts:171` e :251 (`hpBefore: before.currentLifePoints`). |
| 11 | Fail-safe del confine (D-19, forma chiarita): curva riscritta sulla copertura reale, riga di log col solo id e i km | VERIFICATA | `travel-food-settlement.ts:89-92` e :245-256 (solo momento `progress`), :171-177 (path riscritti); log da una sola sorgente `food-curve-change.ts:10-23`, usata da sweep (`travel-food.sweep.ts:104`, :191-193) e imboscata (`ambush-resolution.service.ts:501-518`, dopo il commit). |
| 12 | Passo «fame» dopo i completamenti allo stesso istante, errore isolato; indice dichiarato | VERIFICATA | `travel-sweeper.ts:67` (un solo `now`), :91-105; errore per personaggio `travel-food.sweep.ts:89-112`; provider in `travel-planning.module.ts` (providers ed exports); indice `character.model.ts:85-86` e :118-122; filtro `travel-food.updates.ts:20-25`. |
| 13 | Nessun codice scrive cibo o vita alla partenza: i builder del consumo alla partenza non esistono più | VERIFICATA | `grep -rnE "mealGuardsOf\|mealSetOf\|PlannedMeal\|TELEPORT_FOOD_PROJECTION\|FOOD_TRAVELLER_PROJECTION" src test` → 0 risultati; `travel-food.updates.ts` tiene solo `mealLinesOf` e i due filtri. |
| 14 | Nessun migratore, one-off, variabile d'ambiente o dipendenza nuova (D-11) | VERIFICATA | File aggiunti dalla fase: solo modello, moduli di `src/travel/food`, `ambush-food.ts` e le loro spec; `package.json`, `package-lock.json`, `.env.example`, `src/config` senza diff. |

**Score:** 14/14 verità verificate.

### Artefatti richiesti

| Artefatto | Atteso | Stato | Dettaglio |
|-----------|--------|-------|-----------|
| `src/models/character/active-travel-food.model.ts` | sotto-documento `ActiveTravelFood` | VERIFICATO | 6 campi, `_id: false`; cablato su `ActiveTravel.food` |
| `src/travel/food/travel-food.ts` | `coveredKmOf`, `travelHungerAt`, `hungerBetween`, `foodPlanOf` | VERIFICATO | usati da assestamento, partenza libera e claim |
| `src/travel/travel-timing.ts` | `travelKmAt` | VERIFICATO | usato da `reachedKmOf` |
| `src/travel/food/travel-food-settlement.ts` | `settlementOf`, `settlementIsDue`, `reachedKmOf`, `foodLegOf`, builder di set e guardie, `FOOD_LEG_PROJECTION` | VERIFICATO | 309 righe, importato da sweep, arrivo, teleport, imboscata |
| `src/travel/food/travel-food.sweep.ts` | `TravelFoodSweep.settleDue` | VERIFICATO | iniettato in `TravelSweeper`, registrato ed esportato da `TravelPlanningModule` |
| `src/travel/food/travel-food.updates.ts` | `mealLinesOf`, filtri dello sweep | VERIFICATO | builder della partenza rimossi |
| `src/travel/food/food-curve-change.ts` | testo unico del log D-19 | VERIFICATO | sweep e imboscata |
| `src/travel/ambush/ambush-food.ts` | `ambushFoodOf`, `withFoodSettlement`, `defeatSettlementOf` | VERIFICATO | usati da `ambush-resolution.service.ts` e `ambush-plan.ts` |
| `src/travel/travel-completion.service.ts` | `settleArrivalFood` | VERIFICATO | chiamato nel callback del completamento |
| `src/travel/travel.service.ts` | partenza col piano, `closingFoodOf` | VERIFICATO | `Clock` iniettato per l'ora del teleport |
| `src/quests/acceptance/quest-acceptance.service.ts`, `.updates.ts` | claim col piano, nessun consumo | VERIFICATO | |
| `src/models/character/character.model.ts` | indice `character_active_travel_food` | VERIFICATO | presente nelle due spec degli indici |
| `.planning/phases/20-cibo-e-vita-progressivi/BACKEND-NOTES.md` | handoff §0-§5 | VERIFICATO | §4 «da eseguire», nessun esito inventato, nessun segreto |

### Key link

| Da | A | Via | Stato |
|----|---|-----|-------|
| `ActiveTravel.food` | `ActiveTravelFoodSchema` | `@Prop({ type: ActiveTravelFoodSchema, required: false })` | CABLATO |
| `TravelSweeper.runOnce` | `TravelFoodSweep.settleDue(now)` | `travel-sweeper.ts:92` → :99 | CABLATO |
| `TravelFoodSweep` | `settlementOf` (`progress`, `reachedKmOf`) | `travel-food.sweep.ts:145-153` | CABLATO |
| `TravelCompletionService.complete` | `settlementOf` (`arrival`, distanza) | `travel-completion.service.ts:111`, :165 | CABLATO |
| `TravelCompletionService` | `TravelPantryReader.read` in sessione | :164 | CABLATO |
| `AmbushResolutionService.fight` | `ambushFoodOf` + `withFoodSettlement` prima di `buildCombatContext` | `ambush-resolution.service.ts:437-449` | CABLATO |
| `planAmbushOutcome` | `settlementGuardsOf` nel filtro, `foodProgressSetOf` in vittoria | `ambush-plan.ts:300-302`, :282-284 | CABLATO |
| `TravelService.teleport` | `settlementOf` (`stop`) + set e guardie nello stesso update | `travel.service.ts:252-270`, :305 | CABLATO |
| `TravelService.startTravel` | `foodPlanOf` nel viaggio scritto | :170 | CABLATO |
| `QuestAcceptanceService.claimLane` | `foodPlanOf` nel viaggio del claim | `quest-acceptance.service.ts:151`, :515 | CABLATO |
| `settlementOf` | `selectFood`, `applyTradeToInventory`, `soldQuantityGuards` | `travel-food-settlement.ts:87`, :268, :194 | CABLATO |
| Handoff §1 | `src/schema.gql` | diff vuoto dalla base (rieseguito qui) | CABLATO |

Due key link dei piani sono cambiati di forma con i fix della review, senza perdere la sostanza: il catalogo del cibo dell'imboscata (vedi «Note») e `foodPlanOf(meal, …)` al posto di `foodPlanOf(meal.plan, …)` dopo B-IN-04.

### Flusso dei dati (Level 4)

La fase non rende nulla a schermo: il dato è il piano salvato. La catena è reale da capo a fondo: dispensa letta a DB in sessione (`travel-pantry.reader.ts:103-121`) → `planTravelFood` → `foodPlanOf` → `status.activeTravel.food` → riletto in sessione da sweep, imboscata, arrivo e teleport → `settlementOf` → scrittura di `status.currentLifePoints` e `assets.ownedItems`. Nessun valore fisso né sorgente vuota.

### Spot-check comportamentali

SALTATI per vincolo dell'orchestratore (nessun jest, tsc, build, lint; BE non avviato). Sostituiti dal gate registrato in `20-REVIEW-FIX.md` e dalla lettura dei casi di prova. Controlli fatti a mano sui numeri delle spec: imboscata al km 290 di 400 con 120 km scoperti → 10 km scoperti completati → 55 HP → 945 (coincide con `ambush-resolution.int-spec.ts`); sconfitta al km 30 → `foodNeededFor(144 000 000 × 30 / 400)` = 60 power = 3 unità da 20 su 28 → restano 25 (coincide).

### Requisiti → codice → test

| Requisito | Codice | Test (file, caso principale) | Stato |
|-----------|--------|------------------------------|-------|
| BE-FOODP-01 — piano salvato alla partenza, nessun consumo, legacy ignorati, SDL invariato | `travel.service.ts:142-178`; `quest-acceptance.service.ts:142-154`, :499-515; `travel-food.ts:121-133`; `active-travel-food.model.ts` | `travel.service.int-spec.ts:325`, :359, :399 (rifiuto), :498 (concorrenti); `quest-acceptance.service.int-spec.ts:1660`, :1851 (salto e marker senza lettura della dispensa), :1902, :1951; `travel.updates.spec.ts`, `quest-acceptance.updates.spec.ts` (builder), `active-travel.schema.spec.ts`, `travel-food.spec.ts` (`foodPlanOf`) | SODDISFATTO |
| BE-FOODP-02 — fame per km nello sweep, guardia su `settledKm`, mai sotto 1, pozioni e danni si sommano | `travel-food.ts:95-118`; `travel-timing.ts:76-86`; `travel-food-settlement.ts:81-134`; `travel-food.sweep.ts`; `travel-sweeper.ts:91-105` | `travel-food.spec.ts` (confine, n-esimo km, partizioni che sommano al totale); `travel-timing.spec.ts` (`travelKmAt`); `travel-food-settlement.spec.ts`; `travel-food.sweep.int-spec.ts:137`, :163, :177 (pozione), :190 (concorrenti), :206 e :227 (guardie), :248 (imboscata pendente), :261 (clamp), :269 (legacy); `travel-sweeper.spec.ts` | SODDISFATTO |
| BE-FOODP-03 — cibo una sola volta, in blocco, nei tre momenti; teleport; deviazione senza piano | `travel-food-settlement.ts:222-242`, :263-269; `travel.service.ts:252-321`; `ambush-food.ts:47-91`; `ambush-plan.ts:194-197`, :321-331 | `travel-food-settlement.spec.ts` (pasto al confine, nessun secondo pasto, pro-rata allo stop); `travel-food.sweep.int-spec.ts:146`, :390; `teleport.resolver.int-spec.ts:409`, :423, :435, :447, :465, :478; `ambush-resolution.int-spec.ts` «eats only the food of the travelled kilometres on a defeat and detours without a plan» | SODDISFATTO |
| BE-FOODP-04 — imboscata al suo km, vittoria con lo stesso piano, arrivo nella transazione, totali della Phase 14 | `ambush-resolution.service.ts:427-503`; `ambush-plan.ts:271-289`, :292-304; `travel-completion.service.ts:156-188` | `ambush-food.spec.ts`, `ambush-plan.spec.ts` («progressive food in the ambush plan (Phase 20)»); `ambush-resolution.int-spec.ts` (945 al km 290, piano conservato, `hpBefore`); `travel-completion.int-spec.ts:502`, :563, :579, :619; fine a fine `travel.service.int-spec.ts:836`, :880 | SODDISFATTO |
| BE-FOODP-05 — unit, integration con orologio finto, SDL identico al boot, handoff | spec sopra; `test/app.int-spec.ts` (non modificato dalla fase); `BACKEND-NOTES.md` | gate di `20-REVIEW-FIX.md` (fonte dei numeri); `sweep-indexes.schema.spec.ts`, `sweep-index.verifier.int-spec.ts` (indice); diff SDL vuoto rieseguito qui | SODDISFATTO (riavvio reale del BE dal ramo: differito alla UAT) |

Nessun requisito orfano: `REQUIREMENTS.md` mappa alla Phase 20 solo BE-FOODP-01..05 e tutti e cinque compaiono nei `requirements` dei piani.

### Anti-pattern

| File | Riga | Pattern | Gravità | Impatto |
|------|------|---------|---------|---------|
| — | — | `TODO`, `FIXME`, placeholder, `Date.now`, `Math.random`, `process.env`, `$inc` nei file di produzione della fase | nessuno trovato | — |
| `src/travel/travel.service.ts` | 279 | Se le guardie del cibo mancassero nel teleport, il rifiuto passerebbe da `classifyUnteleported` (codice della quest in corso) | Info | Non raggiungibile in pratica: lettura e scrittura sono nella stessa transazione e una scrittura concorrente dà un WriteConflict che riesegue il callback. Nessuna azione richiesta. |

Nessun blocker, nessun warning.

### Note (non sono gap)

1. **Piano 06, verità «il catalogo del cibo si legge fuori dal callback»:** superata dal ruling B-IN-01 della review. Oggi il catalogo si legge **dentro** il callback, dalla dispensa in sessione (`ambush-resolution.service.ts:439-442`), con la prova `builds the boundary meal from the food catalog read in session (D-14)`. È la forma voluta da D-14; la verità del piano va letta nella forma del ruling.
2. **Ruling B-IN-02 (log della curva anche in arrivo e teleport):** applicato solo all'imboscata. Verificato sul codice che è corretto così: `failSafeCurveOf` gira solo col momento `progress` (`travel-food-settlement.ts:89-92`), quindi in `arrival` e `stop` la curva è sempre `null` e non c'è nulla da segnalare. Un «pasto corto» all'arrivo o al teleport resta senza riga di log (caso raggiungibile solo con modifiche a mano del DB).
3. **Teleport oltre il confine prima del pasto dello sweep:** il fabbisogno è il pro-rata dei km percorsi, non il totale. Con una dispensa coerente col piano il risultato è lo stesso del pasto (a), perché il cibo posseduto copre meno del pro-rata e viene mangiato tutto; il caso unit `eats the boundary food on a stop past the boundary (D-03, D-06)` lo fissa.
4. **Imboscata annullata (`skip`):** non assesta la fame al suo km; la recupera lo sweep successivo con la stessa somma (curva cumulata). Coerente con D-13.
5. La casella della Phase 20 nell'elenco in testa alla ROADMAP (riga 50) è ancora aperta: la chiude l'orchestratore alla chiusura della fase.

### Verifica umana — differita alla UAT su device (handoff §4)

La fase non ha companion FE. I passi qui sotto sono **differiti alla UAT su device (handoff `BACKEND-NOTES.md` §4)**, che l'orchestratore conduce con l'utente dopo il riavvio reale del BE dal ramo. Nessuno è stato eseguito né osservato in questa verifica.

1. **Viaggio lungo con poco cibo** — differito alla UAT su device (handoff §4, passo 1). Atteso: dispensa e vita invariate subito dopo la partenza; a DB `status.activeTravel.food` con `settledKm` 0 e `foodConsumedAt` nullo, coerente con l'anteprima.
2. **Confine dei km coperti** — differito alla UAT su device (handoff §4, passo 2). Atteso: cibo del piano tolto in blocco entro un intervallo di sweep, nessuna fame prima.
3. **Fame a scatti e pozione** — differito alla UAT su device (handoff §4, passo 3). Atteso: vita che scende a ogni km scoperto completato, mai sotto 1; la pozione resta nel conto.
4. **Arrivo** — differito alla UAT su device (handoff §4, passo 4). Atteso: totale della fame = HP dell'anteprima; `activeTravel` nullo.
5. **Sconfitta seminata al km 30** — differito alla UAT su device (handoff §4, passo 5). Atteso: solo il cibo dei 30 km, deviazione senza `food`, `hpBefore` = vita al km 30.
6. **Teleport dell'oste a metà viaggio** — differito alla UAT su device (handoff §4, passo 6). Atteso: cibo dei km percorsi e fame fino al km del momento.
7. **Viaggio già in corso prima del riavvio** — differito alla UAT su device (handoff §4, passo 7). Atteso: arriva senza cambi.
8. **Indice al boot** — differito alla UAT su device (handoff §4, prerequisiti). Atteso: `character_active_travel_food` presente dopo il riavvio.

Perché lo status è `passed` e non `human_needed`: ogni comportamento del goal ha una prova di integrazione sul replica set con i servizi veri e l'orologio finto, e la fase non cambia nulla sul filo né nell'app. La UAT conferma l'esperienza su dati e tempi reali, ma non è necessaria per dichiarare che il codice consegna il goal.

### Gap

Nessuno.

---

_Verificato: 2026-11-12T23:05:08Z_
_Verificatore: Claude (gsd-verifier)_
