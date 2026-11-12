# Phase 20: Cibo e vita progressivi in viaggio - Research

**Researched:** 2026-11-12
**Domain:** regole del viaggio lato BE (NestJS 11, Mongoose 8.18.1, MongoDB replica set, Bull) — piano del cibo salvato, fame incrementale allo sweep, consumo in blocco in tre momenti
**Confidence:** HIGH (codice letto riga per riga sul branch `feat/20-cibo-e-vita-progressivi` allineato a `develop`; tre sonde eseguite fuori dall'albero)

## Summary

Oggi il cibo e la vita del viaggio si pagano in un solo punto per ciascuna delle due partenze: `TravelService.departWithMeal` (`src/travel/travel.service.ts:112-144`) e `QuestAcceptanceService.claimLane` (`src/quests/acceptance/quest-acceptance.service.ts:477-521`) leggono la dispensa **in sessione** (`TravelPantryReader.planFor`, `src/travel/food/travel-pantry.reader.ts:131-144`), rifiutano con `TRAVEL_STARVING` se `!arrivesAlive`, e scrivono nello stesso `findOneAndUpdate` l'inventario (`applyTradeToInventory`) e la vita **assoluta** `plan.hpAfter` con le guardie `mealGuardsOf` (`src/travel/food/travel-food.updates.ts:21-48`). Arrivo, imboscata e teleport non toccano né cibo né vita della fame. Non esistono altri percorsi di partenza: la deviazione nasce dentro l'imboscata (`ambush-plan.ts:284-310`), il salto istantaneo non è un viaggio.

Il disegno della fase si appoggia interamente su meccanismi già presenti: la curva della Phase 14 è **telescopica** se si definisce la fame come `travelHungerAt(km)` (perdita cumulata fino al km) e l'incremento come differenza di due valori della stessa funzione monotona; la somma di qualsiasi partizione di `[0, distanceKm]` vale esattamente `hpLostFor(uncoveredKm)` della Phase 14 (sonda: 3 500 partizioni casuali su 10 distanze × 7 coperture, 0 discrepanze, 0 incrementi negativi, 0 incrementi prima del confine). Tutti i percorsi a evento (imboscata, arrivo, teleport, confine) stanno già dentro una transazione con lettura in sessione: la scrittura della vita può essere un `$set` calcolato dalla lettura in sessione, esattamente come pozione (`item-use.plan.ts:214-253`), imboscata (`ambush-plan.ts:211`) e partenza (`travel-food.updates.ts:26,45`) fanno oggi; un writer concorrente provoca `WriteConflict` e il driver riesegue il callback (sonda: 2 tentativi, entrambe le scritture conservate).

Il problema più insidioso è numerico: `uncoveredKmOf` arrotonda **per eccesso** e può superare la distanza (`uncoveredKmOf(89, 0, 22.24) = 23`, pin in `travel-food.spec.ts`), quindi `coveredKm = distanceKm − uncoveredKm` è frazionario e può essere **negativo**; ricostruire l'intero `uncoveredKm` da `coveredKm` in virgola mobile introduce errori (`20.37 − 21 = −0.629999…`). Raccomandazione: salvare anche `uncoveredKm` (intero esatto della Phase 14) e tenere `coveredKm = max(0, distanceKm − uncoveredKm)` solo come confine del pasto (a).

**Primary recommendation:** un modulo puro in `src/travel/food/` (curva telescopica + piano di assestamento «fame fino al km X e pasto se dovuto») usato da cinque chiamanti che già hanno una transazione (sweep per personaggio, imboscata prima del combattimento, sconfitta, arrivo, teleport); la partenza salva il piano e smette di scrivere inventario e vita **per ultima**, così ogni commit intermedio del ramo resta coerente con la Phase 14.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Vita (BE-FOODP-01, BE-FOODP-02)
- **D-01 (utente, «La vita avviene allo sweep, una volta superato il chilometro scoperto dal cibo posseduto»; confermato):** la vita cala **solo nel tratto scoperto** (oltre i chilometri che il cibo del piano copre). Lo **sweep del viaggio** (`TravelSweeper`, già ogni `TRAVEL_SWEEP_INTERVAL_MS`, default 60 s) scrive a ogni passaggio la **perdita incrementale** dei chilometri fatti dall'ultimo passaggio (`hungerBetween(settledKm, nowKm)`), mai un valore assoluto: così una pozione bevuta in viaggio (Phase 18) o i danni di un'imboscata si sommano e nulla li cancella. `currentLifePoints` mai sotto 1 (`MIN_LIFE_POINTS`): la fame non uccide, come oggi il rifiuto alla partenza garantisce. Scrittura atomica con filtro su `settledKm` (idempotenza fra sweep, imboscata e arrivo concorrenti).
- **D-02 (utente, «Cibo prima, fame in coda»):** la curva è quella della Phase 14 D-02: i chilometri coperti sono i primi, i chilometri scoperti gli ultimi e il chilometro scoperto n-esimo costa n HP; **totali, anteprima (`travelPreview`, anteprima dell'accettazione) e rifiuto «arrivi vivo» restano identici**, cambia solo il momento in cui si paga. Chilometro corrente dal tempo: `nowKm = distanceKm × (now − startTime) / duration` (velocità uniforme sulla polilinea, la stessa che la Phase 15 usa per il `km` dell'imboscata), limitato a `[0, distanceKm]`.
- **D-05 (Claude):** il piano della partenza viene **salvato** su `activeTravel.food` (interno, mai sul filo): `{ needed, coveredKm, hpLostTotal, settledKm: 0, foodConsumedAt: null }` (nomi default tecnico in `20-REPO-RULES.md`); alla partenza non si scrive più né inventario né vita (la Phase 14 D-04 è superata), il rifiuto resta nella stessa transazione della partenza con lo stesso `planTravelFood`. I viaggi iniziati **prima del deploy** non hanno `food`: hanno già pagato tutto alla partenza con la regola vecchia e lo sweep li ignora (nessun migratore, D-11).

#### Cibo (BE-FOODP-03)
- **D-03 (utente, «il cibo lo rimuoviamo quando vieni sconfitto, quando arrivi a destinazione e quando hai finito i chilometri coperti»; «Calcoliamo come oggi la combinazione più efficiente e con meno sprechi»; confermato):** il cibo si toglie **in blocco** in tre momenti, una sola volta per viaggio (`foodConsumedAt`): (a) **fine dei chilometri coperti** (`nowKm ≥ coveredKm`, allo sweep o all'evento che lo supera per primo): tutto il cibo che li copriva, cioè la selezione del piano della partenza ricalcolata sul posseduto in quel momento (stesso `selectFood`, stesso fabbisogno totale); (b) **arrivo**: come oggi, selezione sul fabbisogno totale, se non già consumato in (a); (c) **sconfitta** in imboscata: selezione a **scarto minimo sul fabbisogno dei soli chilometri percorsi** (`foodNeededFor(durata × km/distanza)`), sul posseduto in quel momento, se non già consumato in (a). Nessun ordine dei pasti da decidere e nessuna lista di unità salvata: la regola della Phase 14 D-06 gira al momento del consumo. Il consumo è una vendita senza incasso con le guardie di quantità (Phase 14 D-12); se nel frattempo il cibo è sparito (vendita impossibile in viaggio, ma fail-safe) il blocco consuma ciò che c'è e il resto è scoperto da lì in avanti (log).
- **D-04 (utente, «Resta senza cibo e senza fame»):** la **deviazione** dopo una sconfitta (Phase 15, `kind: free` riscritto dal punto) non ha piano del cibo: né consumo né fame, come oggi; il tratto già percorso è stato pagato dal consumo (c).
- **D-06 (Claude, default dichiarato):** il **teleport dell'oste a viaggio iniziato** chiude il viaggio come una sconfitta: cibo per i chilometri percorsi (c) e fame fino al chilometro del momento (D-01), nella stessa transazione del teleport; il **salto istantaneo** dell'accettazione resta esente (nessun viaggio).

#### Imboscata e arrivo (BE-FOODP-04)
- **D-07 (Claude):** l'**imboscata** (risoluzione del job o dello sweep al suo `km`) prima del combattimento setta la fame esatta fino a quel chilometro (`settledKm = km`) e, se il chilometro supera `coveredKm`, consuma il cibo (a); il combattimento parte dalla vita così aggiornata (è il «vita vera di quel punto» chiesto dall'utente). In **vittoria** il viaggio continua sulla stessa polilinea con lo stesso piano; in **sconfitta** si applica (c) e la deviazione nasce senza piano. L'**arrivo** (`TravelCompletionService.complete`) setta la fame fino a `distanceKm` e il cibo (b) nella stessa transazione del completamento.
- **D-08 (Claude):** una sola funzione pura in `src/travel/food/` (`travelHungerAt`/`hungerBetween` con la curva triangolare spostata sui chilometri scoperti) riusata da sweep, imboscata, arrivo, sconfitta e teleport; nessun processor o job nuovo: lo sweep esistente guadagna un passo «fame» che seleziona solo i personaggi in viaggio con `food` presente, `settledKm < nowKm` e `nowKm > coveredKm` (indice sui campi del piano se il filtro lo richiede).

#### Pozioni, FE, prove e ordine (BE-FOODP-05)
- **D-09 (utente, conversazione precedente):** le pozioni in viaggio (Phase 18, ricarica globale) restano la sola mitigazione della fame: nessun debito di fame né tetto alle cure; la fame continua a mordere dopo il sorso (perdita incrementale).
- **D-10 (utente, «Niente di nuovo» in app):** nessun campo nuovo sul filo, nessuna companion FE: vita e dispensa arrivano dallo stream del personaggio (change stream) a ogni scrittura dello sweep o degli eventi; l'anteprima resta la sola informazione esplicita. Il handoff emenda la nota della FE Phase 15 («inventario e HP cambiano solo via subscription»: ora anche durante il viaggio, a scatti di un minuto nel tratto scoperto e in blocco al confine).
- **D-11 (Claude):** nessun migratore: i viaggi legacy senza piano sono ignorati; nessun one-off; la spec del boot reale conferma lo SDL identico.
- **D-12 (utente, «BE 20 da sola, dopo la 19»):** fase solo BE, impilata sulla 19, eseguita dopo la sua merge; UAT su device con l'app com'è.
- **Prove (default tecnico):** unit sulla funzione pura (0 km, confine, oltre il confine, tratto intero, incrementi che sommano al totale della Phase 14, clamp a 1), sul chilometro dal tempo, sulla selezione parziale alla sconfitta (30 km su 400 → solo il fabbisogno di 30 km; tutto il cibo se 400); integration sul replica set con orologio finto: partenza senza scritture di inventario/vita; sweep che non scrive prima del confine, consuma il cibo al confine e scala la vita ogni passaggio dopo; pozione bevuta fra due sweep che resta nel conto; imboscata al km 290 con vita esatta; sconfitta al km 30 con cibo pro-rata e deviazione senza piano; arrivo con totali identici a oggi; teleport a metà; viaggio legacy ignorato; handoff `BACKEND-NOTES.md` per la FE (nessun cambio, semantica nuova) e per la UAT (viaggio lungo con poco cibo, sconfitta seminata a 30 km).

### Claude's Discretion
- Nomi dei campi del piano salvato e della funzione pura in `20-REPO-RULES.md`; soglia di «chilometro percorso» frazionario (il km n-esimo si paga quando lo si completa).
- Dove vive il passo «fame» dello sweep (dentro `TravelSweeper.runOnce` o un servizio dedicato chiamato da lì) e l'eventuale indice.

### Deferred Ideas (OUT OF SCOPE)
- **Debito di fame / cure che non superano la vita d'ingresso in battaglia**: rinviato dall'utente, la ricarica delle pozioni basta per ora.
- **Riga in app «Cibo per altre 3 h, poi fame»**: non voluta («Niente di nuovo»).
- **Deviazione che consuma e affama**: non scelta.
- **Fame fuori dal viaggio**: fuori scope dalla Phase 14.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-FOODP-01 | Partenza (libera e da quest) calcola il piano con `planTravelFood`, lo salva su `activeTravel.food`, non consuma né scala; legacy ignorati; SDL invariato | §Q1 (due soli writer: `travel.service.ts:131-141`, `quest-acceptance.service.ts:492-516`), §Q2 (forma del piano, `uncoveredKm`), §Q11 (Mongoose-only `@Prop` non entra nello SDL: precedenti `kind`/`ambush`/`ambushReports`, `active-travel.model.ts:62-70` vs `src/schema.gql:20-26`) |
| BE-FOODP-02 | Sweep scala la vita solo oltre i km coperti, incrementale, telescopica, guardata da `settledKm`, mai sotto 1; pozioni e danni si sommano | §Q2 (curva telescopica, sonda 2), §Q3 (`travelKmAt` nuovo), §Q4 (forma della scrittura, sonda 1), §Q9 (pozioni in transazione con guardia sulla vita) |
| BE-FOODP-03 | Cibo una volta per viaggio, in blocco: confine (a), arrivo (b), sconfitta/teleport (c) sul fabbisogno dei km percorsi; vendita senza incasso con guardie; deviazione senza piano | §Q5 (selezione al momento del consumo, catalogo, fail-safe), §Q6 (sconfitta: il piano cade da solo con la riscrittura di `status.activeTravel`), §Q8 (teleport) |
| BE-FOODP-04 | Imboscata setta fame al suo km prima del combattimento (e il cibo oltre il confine); vittoria conserva il piano; arrivo setta fame fino a `distanceKm` e cibo nella transazione del completamento; totali identici alla Phase 14 | §Q6 (punto d'iniezione: snapshot in sessione prima di `buildCombatContext`, `ambush-resolution.service.ts:415-437`), §Q7 (seconda scrittura nella transazione di `complete`), §Q12 (proprietà dei totali) |
| BE-FOODP-05 | Unit, integration con orologio finto, boot reale con SDL identico, handoff | §Validation Architecture, §Wave 0, §Piano suggerito |
</phase_requirements>

## Project Constraints (from CLAUDE.md e 20-REPO-RULES.md)

- Stack fisso NestJS 11 + Mongoose 8 + Apollo code-first + Bull/ioredis; nessuna dipendenza nuova serve a questa fase.
- TDD obbligatorio RED → GREEN → REFACTOR, un commit `test(...)` di RED prima del `feat(...)`; titoli dei test con `(D-NN)`.
- Branch già attivo, nessun push/PR/`gh`/fetch dagli esecutori; nessun trailer `Co-Authored-By`/`Generated with`/`Claude-Session` (regola dell'utente, prevale).
- Mai `npm run lint`/`format`/`build`/`nest build`; solo `npx prettier --write <file>` e `npx eslint <file>` per file; `npx tsc --noEmit -p tsconfig.json`.
- Jest: percorsi prima di `--selectProjects`; integration sempre `--runInBand`; mai in background; nessun `jest.mock(` di moduli; `FixedClock`, mai timer reali; nessun `Date.now`/`Math.random` nel codice della fase.
- **Mai intersezioni con interfacce negli update di Mongoose** (`A & B` di interfacce di dominio): documenti di update come letterali o tipi di Mongoose.
- **SDL invariato**: `git diff --exit-code src/schema.gql` vuoto a fine di ogni piano; nessun `@Field` sul piano del cibo.
- Nessun migratore, one-off, variabile d'ambiente nuova; log solo con id, conteggi, codici (`describeError`).
- Mai leggere `.env`; il database reale non si tocca dagli esecutori.
- Gli operatori Mongo compaiono solo nel codice o in code span, mai nei titoli dei test.

## Verifica dei riferimenti del CONTEXT dopo la Phase 19

| Riferimento del CONTEXT | Stato oggi | Evidenza |
|-------------------------|-----------|----------|
| `travel-food.ts` (`FOOD_RULES`, `TravelFoodPlan`, `foodNeededFor`, `uncoveredKmOf`, `hpLostFor`, `planTravelFood`) | invariato | `src/travel/food/travel-food.ts:6-69` |
| `food-selection.ts` (`selectFood`) | invariato | `src/travel/food/food-selection.ts:31-49` |
| `travel-food.updates.ts` (`mealLinesOf`, `mealGuardsOf`, `mealSetOf`) | invariato | `src/travel/food/travel-food.updates.ts:11-48` |
| `travel-pantry.reader.ts` | invariato (`read`, `planFor`, `previewOf`, `foodItemsOf`; `foodCatalogOf` è **privato**) | `travel-pantry.reader.ts:108-190` |
| `TravelService` partenza e teleport | invariato | `travel.service.ts:89-144`, `187-269` |
| `quest-acceptance.service.ts` | invariato (ma la partenza da quest vive in `claimLane`) | `quest-acceptance.service.ts:220-261`, `477-521` |
| `COMPLETION_UPDATE` | invariato, **è una pipeline** | `travel.updates.ts:97-104` |
| `TravelCompletionService.complete` | invariato | `travel-completion.service.ts:79-139` |
| `TravelSweeper.runOnce`/`sweepSafely` | invariati | `travel-sweeper.ts:72-105` |
| `ambush-plan.ts` `hpFought` | invariato | `ambush-plan.ts:161-163` |
| `ambush-point.ts` «km dal tempo» | **non esiste una funzione tempo → km**: la Phase 15 va da km a tempo | `ambush-draw.ts:29-33`; frazione `km / distance` in `ambush-resolution.service.ts:346-349` |
| «`src/characters/` teleport» | **spostato/impreciso**: il teleport è in `src/travel/` | `travel.service.ts:187`, `travel-admin.resolver.ts:19-27`, `teleport.resolver.int-spec.ts` |
| `TravelPath.distance` | il campo è `activeTravel.road.distance` (classe `TravelPath`) | `active-travel.model.ts:20-28,37-39` |
| `MIN_LIFE_POINTS`, `lifePointsWithin` | invariati | `level-table.ts:4`, `52-55` |
| `writeCharacterUpdate` | esiste, tipizzato `update: Record<string, unknown>` (non accetta un array pipeline senza cambiare tipo) | `outcome-writer.service.ts:110-122` |
| Phase 19: `petXpGained`, `AmbushReportSnapshot` | presenti, non interagiscono con la fame (vedi §Q6) | `ambush-plan.ts:98-99,194-199,254` |

## Risposte alle domande

### Q1 — La partenza oggi

**Partenza libera** (`TravelService.startTravel`, `travel.service.ts:89-110`):
- planner e sorteggio fuori dalla transazione (`:93-98`); `connection.transaction` (`:100-102`) → `departWithMeal` (`:112-144`).
- (a) `planTravelFood` via `this.pantry.planFor(characterId, plan.travel, session)` (`:117-121`), lettura in sessione di personaggio e catalogo `LootItem` (`travel-pantry.reader.ts:108-129,177-190`).
- (b) rifiuto: `if (!meal.arrivesAlive) throw await this.starvingOrRace(...)` (`:124-130`); la corsa batte la fame (`:147-162`).
- (c) scrittura: un `findOneAndUpdate` con `startTravelFilter(..., { ...notImprisonedAt(now), ...mealGuardsOf(meal, pantry.hpRaw) })` e `startTravelUpdate(plan.travel, mealSetOf(meal, pantry.assets))` (`:131-141`; builder in `travel.updates.ts:48-68`). `mealSetOf` scrive `assets.ownedItems` (assoluto, da `applyTradeToInventory`) e `status.currentLifePoints: plan.hpAfter` (assoluto); `mealGuardsOf` riafferma le quantità vendute (`$elemMatch … $gte`) e la vita letta.

**Partenza da quest** (`QuestAcceptanceService.accept`, `quest-acceptance.service.ts:170-295`):
- pre-verifica fuori sessione `fedOrReject` (`:378-388`, solo `movement.kind === 'travel'`).
- in transazione (`:220-261`): `meal = movement?.kind === 'travel' ? await this.pantry.planFor(..., session) : null` (`:224-232`); `claimLane` (`:477-521`) rifiuta (`:490-491`) e scrive guardie (`:503-506`) e set (`laneClaimUpdate(..., mealSetOf(...))`, `:508-513`; builder `quest-acceptance.updates.ts:81-103`).

**Altri percorsi di partenza** — verificato con `grep` di `buildActiveTravel|planAuto|planFree|planFor(|withAmbush(` e di ogni scrittura di `'status.activeTravel'`:

| Percorso | Dove | Salva il piano? |
|----------|------|-----------------|
| Partenza libera | `travel.service.ts:131-141` | **sì** |
| Viaggio automatico della corsia standard | `quest-acceptance.service.ts:492-516` | **sì** |
| Salto istantaneo (marker senza strada) | `quest-acceptance.updates.ts:94-96` (`kind: 'jump'`) | no (D-06, nessun viaggio) |
| Marker = posizione, story, worldMission | nessun movimento (`movementTo` → `null`) | no |
| Deviazione dopo sconfitta | `ambush-plan.ts:284-310,327` | **no** (D-04) |
| Party / dungeon / soccorso | nessuna partenza: ogni membro parte con la propria accettazione; nessun altro writer di `status.activeTravel` | — |

Gli altri writer di `status.activeTravel` sono solo azzeramenti: completamento (`travel.updates.ts:101`), teleport (`:149`); `shop-transaction.service.ts:297` è un filtro.

**Spec che fissano «tutto alla partenza» (vanno RED per prime):**

| Spec | Test | Cosa cambia |
|------|------|-------------|
| `src/travel/travel.service.int-spec.ts:312` | eats the selected food at departure and keeps the life points when covered (D-06, D-12) | partenza: inventario intatto, `food` salvato |
| `src/travel/travel.service.int-spec.ts:335` | eats all the food and lowers the life points on a partial cover (D-03, D-04) | idem, vita intatta |
| `src/travel/travel.service.int-spec.ts:356` | charges the life of the whole road without food (D-02) | vita intatta, `hpLostTotal` salvato |
| `src/travel/travel.service.int-spec.ts:471` | lets exactly one of two concurrent departures eat the same food (D-12) | diventa «un solo piano salvato» |
| `src/travel/travel.service.int-spec.ts:500` | keeps a concurrent non-food purchase made after the pantry read (D-20) | probabilmente verde (nessuna scrittura d'inventario): da riscrivere come prova che la partenza non tocca l'inventario |
| `src/quests/acceptance/quest-acceptance.service.int-spec.ts:1654` | eats the food of the automatic travel in the claim (D-06, D-12) | claim: nessun consumo, `food` salvato |
| `…service.int-spec.ts:1693` | eats all the food and lowers the life points of a partial cover in the claim (D-03, D-04) | idem |
| `…service.int-spec.ts:1921` | lets exactly one of two concurrent quest departures eat the same food (D-12) | «un solo piano» |
| `…service.int-spec.ts:1961` | keeps a concurrent non-food purchase made after the pantry read of the claim (D-20) | come sopra |
| `…service.int-spec.ts:1827` | does not eat on an instant jump nor on a marker at the position (D-13) | resta verde; aggiungere l'assenza di `food` |
| `src/travel/travel.updates.spec.ts:68,82` | startTravelFilter/Update con guardie e costo (D-12) | la firma cambia (piano dentro il viaggio, nessun meal set) |
| `src/quests/acceptance/quest-acceptance.updates.spec.ts:87,196` | laneClaimFilter/Update con guardie e costo (D-12) | idem |
| `src/travel/food/travel-food.updates.spec.ts:43-109` | `mealGuardsOf`/`mealSetOf` | i builder vengono riusati/sostituiti dai builder di assestamento (vedi §Architettura) |
| `src/travel/teleport.resolver.int-spec.ts:344` | teleports without eating nor refunding the food (D-13) | **RED per D-06**: il teleport a metà ora mangia (c) e affama |

Restano verdi (rifiuto e anteprima identici): `travel.service.int-spec.ts:372,388,425,441,453`, `quest-acceptance.service.int-spec.ts:1726,1759,1791,1872`, `travel.resolver.int-spec.ts:567,602`, `accept-quest.resolver.int-spec.ts:954,1235,1290`, `travel-pantry.reader.int-spec.ts:103-265`. `ambush-resolution.int-spec.ts:701` («keeps the food eaten and charges nothing on the detour») usa un viaggio **senza** `food` → resta verde e diventa la prova legacy dell'imboscata.

### Q2 — Forma del piano

`TravelFoodPlan` (`travel-food.ts:18-26`): `consumed: ConsumedFood[]`, `needed` (power, intero, `⌈durationMs / 180 000⌉`, `:33-35`), `covered` (power coperta dalla selezione, intera), `uncoveredKm` (**intero**, per eccesso in metri, `:38-46`), `hpLost = uncoveredKm(uncoveredKm+1)/2` (`:49-51`), `hpAfter`, `arrivesAlive`.

| Campo del piano salvato | Disponibile? | Derivazione |
|-------------------------|-------------|-------------|
| `needed` | diretto | `plan.needed` (power) |
| `hpLostTotal` | diretto | `plan.hpLost` (HP, intero) |
| `uncoveredKm` (**proposto**) | diretto | `plan.uncoveredKm` (km interi) |
| `coveredKm` | derivato | `max(0, travel.road.distance − plan.uncoveredKm)` (km, **frazionario**, mai negativo dopo il clamp) |
| `settledKm` | costante | `0` (km, frazionario dopo) |
| `foodConsumedAt` | costante | `null` |

Unità: power per il cibo (1 power = 3 min, `FOOD_RULES.minutesPerPower`), ms per `duration`, km di gioco per `road.distance` (Float, `active-travel.model.ts:25-28`).

**`coveredKm` non è intero e può essere negativo prima del clamp**: `uncoveredKmOf(89, 0, 22.24) = 23 > 22.24` (pin esistente in `travel-food.spec.ts`); senza cibo su 20,37 km `U = 21`, `coveredKm` grezzo `= −0.629999…` (sonda 2). Ricostruire `U` come `distanceKm − coveredKm` in virgola mobile può dare `20.999…` o `21.000…004` → errore di un km sulla curva. Da qui la correzione proposta **C-1**: salvare `uncoveredKm`.

**Curva sui km frazionari.** La Phase 14 non gestisce km frazionari dentro `hpLostFor` (riceve sempre un intero); la frazione è assorbita da `uncoveredKmOf`. La regola «il km scoperto n-esimo si paga quando lo si completa» con «scoperti gli ultimi» dà, in metri interi come `uncoveredKmOf`:

```
completati(x) = clamp(U − ⌈(round(D·1000) − x·1000) / 1000⌉, 0, U)
travelHungerAt(x) = x ≥ D ? hpLostTotal : hpLostFor(completati(x))
hungerBetween(from, to) = to ≤ from ? 0 : travelHungerAt(to) − travelHungerAt(from)
```

Con `U > D` il primo km scoperto «inizia prima della partenza» e si completa dopo `D − ⌊D⌋` km: è la stessa cosa che la Phase 14 fa arrotondando per eccesso, e il totale resta `hpLostFor(U)`.

**Invariante (provato, sonda 2):** per costruzione è una serie telescopica di una funzione monotona non decrescente con `travelHungerAt(0) = 0` e `travelHungerAt(D) = hpLostTotal` (caso esplicito `x ≥ D`, così l'errore in virgola mobile non tocca il totale): per **qualsiasi** sequenza di `settledKm` crescenti la somma degli incrementi è esattamente il totale della Phase 14, nessun incremento è negativo, e nessun incremento cade prima di `coveredKm`. Il clamp della vita a 1 non entra nella funzione pura (riguarda la vita, non la fame).

Firme proposte (pure, `src/travel/food/travel-food.ts` o un file fratello `travel-hunger.ts`):

```ts
export interface TravelFoodCurve {
    distanceKm: number;   // activeTravel.road.distance
    uncoveredKm: number;  // intero della Phase 14
    hpLostTotal: number;  // hpLostFor(uncoveredKm)
}
export function coveredKmOf(curve: TravelFoodCurve): number;            // max(0, D − U)
export function travelHungerAt(curve: TravelFoodCurve, km: number): number;
export function hungerBetween(curve: TravelFoodCurve, fromKm: number, toKm: number): number;
export function foodPlanOf(plan: TravelFoodPlan, distanceKm: number): ActiveTravelFoodDraft;
```

### Q3 — Km dal tempo

La Phase 15 **non** calcola il km dal tempo: sorteggia km interi e ne ricava l'istante, `at = startTime + ⌊(km / distance) × durationMs⌋` (`ambush-draw.ts:29-33`), e salva entrambi in `activeTravel.ambush { at, km, attempts }` (`ambush-snapshot.model.ts` `AmbushPlanEntry`); la risoluzione usa `pointAtFraction(coordinates, km / distance)` (`ambush-resolution.service.ts:346-349`). Quindi `travelKmAt` è **nuovo** e il nome resta (la REPO-RULES lo prevedeva).

```ts
// src/travel/travel-timing.ts
export function travelKmAt(
    travel: { road: { distance: number }; startTime: Date; duration: number },
    now: Date,
): number; // duration ≤ 0 ⇒ distance; clamp [0, distance]
```

Tipi: `startTime: Date`, `endTime: Date`, `duration: number` (ms, `= endTime − startTime`), `road.distance: number` (km) (`active-travel.model.ts:37-51`, `travel-timing.ts:49-71`).

**Imboscata vinta:** `victoryUpdateOf` tocca solo `status.activeTravel.ambush` e `ambushReports` (`ambush-plan.ts:259-273`): `road`, `startTime`, `duration` restano → `travelKmAt` resta valido e il piano `food` sopravvive (stesso path non riscritto).
**Sconfitta:** `defeatTravelOf` riscrive `status.activeTravel` per intero con `road` della deviazione, `startTime = at`, nuova `duration` (`ambush-plan.ts:284-310,327`) → il piano cade da solo (l'oggetto non ha `food`).

**Pitfall di arrotondamento:** `travelKmAt(ambush.at) ≤ ambush.km` (il `⌊…⌋` dell'istante). All'imboscata si usa **`ambush.km` salvato**, mai `travelKmAt(at)`; dopo una vittoria, per qualche ms `travelKmAt(now) < settledKm` → `hungerBetween` deve restituire 0 per `to ≤ from`.

### Q4 — Sweep

**Oggi.** `TravelSweeper.runOnce` (`travel-sweeper.ts:72-97`): `find(dueTravelsFilter(this.clock.now()), DUE_TRAVEL_PROJECTION).lean().exec()` (filtro `travel.updates.ts:171-177`: attivo, `endTime ≤ now`, nessuna imboscata pendente), poi in serie `completion.complete(identity)` con `try/catch` per personaggio e log del solo codice (`codeOf`, `:26-32`). Single-flight (`sweep()`, `:65-70`), timer `unref` e reconciler al boot sempre (`:49-57`), ora dalla porta `Clock`. `AmbushSweeper.runOnce` (`ambush-sweeper.ts:89-111`) è identico nella forma, con `recordFailureSafely` per isolare gli errori.

**Selezione del passo «fame».** `nowKm` dipende dal documento (`startTime`, `duration`, `road.distance`): esprimerlo in query richiede `$expr` con aritmetica sulle date, che non usa indici per il confronto calcolato. Con la cardinalità reale (un solo canale: decine di personaggi in viaggio, non migliaia) la scelta prescrittiva è **selezionare per presenza del piano e calcolare in codice**:

```ts
{ ...ACTIVE_CHARACTER_FILTER, 'status.activeTravel.food.settledKm': { $gte: 0 } }
// proiezione: startTime, duration, road.distance, ambush.km, food
```

`$gte: 0` dà limiti d'indice stretti (meglio di `$exists`). Indice consigliato col pattern D-17b (ogni sweep ha il suo, `character.model.ts:79-115`): `character_active_travel_food` su `{ deletedAt: 1, 'status.activeTravel.food.settledKm': 1 }`; i due test di indice usano `toContainEqual`/`arrayContaining` (`sweep-indexes.schema.spec.ts:84-93`, `sweep-index.verifier.int-spec.ts:126-128`) → aggiungere le voci non rompe nulla. Indice opzionale (OQ-4).

**Bersaglio del passo:** `targetKm = min(travelKmAt(travel, now), travel.ambush?.km ?? Infinity)`: con un'imboscata pendente scaduta (job in ritardo, sweep delle imboscate non ancora passato) la fame non deve superare il km dell'imboscata, altrimenti il combattimento partirebbe da una vita «più avanti» del punto.

**Quando scrivere:** solo se `hungerBetween(curve, settledKm, targetKm) > 0` oppure il pasto (a) è dovuto (`foodConsumedAt == null && targetKm ≥ coveredKm`). Nel tratto coperto lo sweep non scrive niente (altrimenti `characterUpdated` partirebbe ogni minuto per ogni viaggiatore, vedi §Q9). Nel tratto scoperto la fame cresce a km interi completati: a velocità base 10 km/h circa una scrittura ogni 6 minuti, non ogni minuto (vedi **C-3**).

**Forma della scrittura — valutazione delle tre opzioni:**

| Opzione | Come | Pro | Contro | Prova |
|---------|------|-----|--------|-------|
| (i) pipeline | `updateOne(filtro con settledKm letto, [{ $set: { 'status.currentLifePoints': { $max: [1, { $subtract: [{ $ifNull: ['$status.currentLifePoints', maxFallback] }, loss] }] }, 'status.activeTravel.food.settledKm': target } }])` | atomica senza transazione, relativa al valore corrente | serve `maxFallback` calcolato in codice per i legacy; non si combina col consumo d'inventario (array assoluto) senza `$literal`; `writeCharacterUpdate` è tipizzato `Record` | **sonda 1**: Mongoose 8.18.1 + server 8.2.6, path puntati annidati ok, doppio tick con lo stesso `settledKm` → `matchedCount 0`, clamp a 1 ok, vita `null`/assente → `$ifNull` ok |
| (ii) lettura in sessione + `$set` guardato | `connection.transaction`: `findOne` in sessione, piano puro, `updateOne(filtro + settledKm + currentLifePoints letto + quantità vendute, { $set: … })` | **una sola forma** per sweep, confine, imboscata, arrivo, teleport; legacy della vita risolti da `statusFactsOf`; consumo d'inventario nella stessa scrittura | una transazione per scrittura (rara: a km completato o al confine) | **sonda 1**: un tick concorrente fra lettura e scrittura → `WriteConflict` → callback rieseguito (2 tentativi), vita finale 597 = 500 − 3 + 100 |
| (iii) `$inc` semplice | `$inc: -loss` | banale | **non clampa**; su vita `null` errore `TypeMismatch` (codice 14); su vita assente scrive `−3` | **sonda 1** |

Precedenti in codice: pipeline già usate con `findOneAndUpdate` (`COMPLETION_UPDATE`, `travel.updates.ts:97-104`); decrementi/scritture della vita **sempre** `$set` da lettura in sessione con guardia d'uguaglianza: partenza (`travel-food.updates.ts:26,45`), pozione (`item-use.plan.ts:221,250`), imboscata (`ambush-plan.ts:211`), esiti delle quest (`outcome-plan.ts:476`, `unrewarded-plan.ts:84`). La regola del repo «mai intersezioni con interfacce negli update» vale per entrambe le opzioni (letterali `Record<string, unknown>` o tipi Mongoose).

**Raccomandazione:** (ii) come forma unica — è l'«equivalente guardato» della REPO-RULES: il valore assoluto è calcolato da una lettura **in sessione**, non vecchia, e la transazione più la guardia su `settledKm` e sulla vita letta impediscono ogni lost update; (i) resta un'alternativa provata se l'orchestratore preferisce il tick della sola fame senza transazione (OQ-1). In entrambi i casi il passo vive in un servizio dedicato chiamato da `runOnce` **dopo** i completamenti, con `try/catch` per personaggio e log col solo id e `describeError`; `runOnce` continua a restituire i completamenti (le int-spec esistenti asseriscono `sweep()` → `1`, `travel-completion.int-spec.ts:1081-1135`).

### Q5 — Consumo in blocco

**Oggi** il consumo è una vendita senza incasso: `mealLinesOf` → righe `sell` di `LootItem` (`travel-food.updates.ts:11-18`), `applyTradeToInventory` calcola l'**array assoluto** `ownedItems` (`trade-inventory.ts:104-117`), `soldQuantityGuards` riafferma `$elemMatch { item, quantity ≥ q }` per ogni riga in un `$and` (`trade-inventory.ts:120-137`). Poiché l'array è assoluto, **il consumo deve stare in una transazione con lettura in sessione**: fuori sessione una pozione bevuta fra lettura e scrittura verrebbe resuscitata (la guardia copre solo le righe vendute). È il motivo per cui la Phase 14 D-12 rese la partenza transazionale.

`TravelPantryReader.read(characterId, session)` legge in sessione `assets.ownedItems`, vita, massimo, xp, titolo (`PANTRY_PROJECTION`, `travel-pantry.reader.ts:54-60,108-129`) e il catalogo `LootItem` con `effect: hunger` (`power`, `sellPrice`, `:177-190`), e restituisce `{ stacks, assets, hpRaw, hpBefore }`.

**Cosa cambia per i tre momenti:**

| Momento | Fabbisogno | Chiamante | Sessione |
|---------|-----------|-----------|----------|
| (a) confine | `food.needed` | sweep (transazione per personaggio) o imboscata prima del combattimento | stessa transazione dell'assestamento |
| (b) arrivo | `food.needed` | `TravelCompletionService.complete` | transazione del completamento |
| (c) sconfitta / teleport | `min(food.needed, foodNeededFor(duration × targetKm / distance))` | imboscata dopo il combattimento; teleport | transazione dell'imboscata / del teleport |

Regola unica: `foodConsumedAt == null` è la condizione per ogni pasto (una sola volta per viaggio); (c) con `targetKm ≥ coveredKm` coincide con (a) — col posseduto invariato `selectFood(min(...))` mangia lo stesso cibo — quindi la formula `min` copre anche il teleport arrivato al confine prima che lo sweep consumi.

**Catalogo:** l'imboscata legge i cataloghi fuori dal callback (`ambush-resolution.service.ts:1`, Pitfall 10 della Phase 15; Phase 16 D-05 «nella transazione solo scritture»). Proposta: rendere pubblico il catalogo del cibo (`foodCatalogFor(ownedItems)`) ed esportare la funzione pura `stacksOf(entries, catalog)` (`travel-pantry.reader.ts:76-95`), così imboscata e teleport leggono il catalogo prima della transazione e costruiscono gli stack dalla `ownedItems` in sessione; sweep e arrivo possono usare `read(characterId, session)` come la partenza.

**Il cibo può cambiare durante il viaggio?** In pratica no: negozio vietato in viaggio (`shop-transaction.service.ts:212`, filtro `:297`), `useItem` solo `effect: heal` (`item-use.plan.ts:150`), consumabili del combattimento solo `heal` (`placeholder-combat-resolver.ts:103`), nessun loot dalle imboscate (`ambushPrizesOf`, `ambush-rules.ts:38-48`; `commonSetOf` scrive solo i consumabili usati, `ambush-plan.ts:205-222`). Il fail-safe di D-03 è quindi raggiungibile solo con modifiche a mano del DB.

**«Scoperto da lì in avanti»** (OQ-2): default raccomandato — se la selezione di (a)/(b) copre una power `covered'` diversa da quella implicita nel piano (`uncoveredKmOf(needed, covered', D) ≠ food.uncoveredKm`), si riscrivono `uncoveredKm`, `coveredKm`, `hpLostTotal` con la formula della Phase 14 su `covered'` e la fame continua telescopica **da `settledKm`** (nessun addebito retroattivo); log `Viaggio <jobId>: cibo cambiato al confine (<covered'>/<needed> power)`.

### Q6 — Imboscata

Ordine attuale (`ambush-resolution.service.ts`): `resolve` (`:203-288`) legge lo snapshot **fuori sessione** (`:210-213`), calcola luogo, composizione, risorteggio `next = drawFrom(travel, km)`, proprietario, catalogo e deviazione (`detourOf`, `:291-340`) — tutto fuori dal callback; `fight` (`:407-495`) apre la transazione, rilegge lo snapshot **in sessione** con `ambushFilter` (`:415-423`), costruisce `buildCombatContext({ participants: [inSession] })` (`:424-437`), risolve, `planAmbushOutcome` (`:443-458`), `writer.writeCharacterUpdate(plan.filter, plan.update, session)` (`:459-463`), abbandono della corsia (`:464-466`), monete (`:467-473`). Dopo il commit: recuperi, push e job (`:481-494`, `afterDefeat :521-539`). Lo sweep delle imboscate chiama lo stesso `resolve` (`ambush-sweeper.ts:97-101`).

**Vita d'ingresso:** il motore parte da `participant.currentLifePoints` del contesto (vedi `ScriptedCombatResolver`, `test/quests/scripted-combat-resolver.ts:47-62`); `hpFought = lifePointsWithin(effects.hpAfter, max)` (`ambush-plan.ts:161-163`); il report scrive `hpBefore: before.currentLifePoints` (`:239`) e la vita assoluta `progression.currentLifePoints` (`:211`).

**Punto d'iniezione (D-07):** dentro il callback, subito dopo la lettura in sessione e **prima** di `buildCombatContext`: `preFight = withFoodSettlement(inSession, settlementOf({ target: ambush.km, momento: progresso }))` — vita scalata (clamp a 1) e, se `km ≥ coveredKm` e `foodConsumedAt == null`, `ownedItems` dopo il pasto (a). `preFight` va a contesto e piano: il motore combatte con la vita vera del punto, `applyTradeToInventory(snapshot.assets, consumables)` parte dall'inventario già senza il cibo.

- **Vittoria** (`victoryUpdateOf`, `:259-273`): aggiungere al `$set` `'status.activeTravel.food.settledKm': km` e, se il pasto è avvenuto, `'status.activeTravel.food.foodConsumedAt': now` — **solo se lo snapshot ha `food`** (vedi Pitfall 3).
- **Sconfitta** (`defeatPlanOf`, `:312-336`): `status.activeTravel` riscritto senza `food` (D-04 gratis); (c) se `foodConsumedAt == null`: righe del pasto parziale applicate a `fought.inventory` (dopo i consumabili), stessa scrittura, stessa transazione.
- Filtro: `filterOf` (`:275-281`) = `ambushFilter` + `status.xp`; aggiungere `'status.activeTravel.food.settledKm'` letto quando c'è `food` (coerenza con D-01; dentro la transazione è una rete).
- **Skip** (`skip`, `:376-405`, nessun combattimento): nessun assestamento, ci pensa lo sweep.
- **Phase 19:** `petXpGained` dipende solo dagli xp dei nemici e dalla vittoria (`companionXpAward`, `:195-199`); `AmbushReportSnapshot` riceve `hpBefore` che ora è la vita **dopo la fame** (cambio di semantica visibile nel report, **C-6**). Nessun'altra interazione.

### Q7 — Arrivo

`complete` (`travel-completion.service.ts:79-139`): una transazione; `findOneAndUpdate(completionFilter, COMPLETION_UPDATE, { returnDocument: 'before', projection: COMPLETION_PROJECTION })` (`:89-100`) — pipeline che copia `to` in `location` e azzera `status.activeTravel` (`travel.updates.ts:97-104`); poi nello stesso callback geografia (`:142-156`, già una **seconda** `updateOne` sul personaggio), report trattenuti (`:159-170`), arrivo sul marker (`:173-207`). Push e avvio quest dopo il commit (`:134-137`).

Dove assestare: dopo il `findOneAndUpdate`, nello stesso callback, una funzione `settleArrival(before, characterId, session)`: `COMPLETION_PROJECTION` (`travel.updates.ts:108-113`) guadagna `status.activeTravel.food`, `road.distance`, `duration`; se `before.status.activeTravel.food` esiste: lettura della dispensa in sessione, fame `hungerBetween(curve, settledKm, distanceKm)` e pasto (b) se `foodConsumedAt == null`, `updateOne({ _id }, { $set: vita, ownedItems }, { session })` con le guardie delle quantità. La pipeline del completamento resta intatta (come per la geografia, Phase 16 C-4).

**Idempotenza:** `completionFilter` (`travel.updates.ts:84-94`) matcha una sola volta per identità (`startTime` + `endTime ≤ now` + nessuna imboscata pendente); job duplicato, reconciler al boot e sweep in corsa → il secondo non matcha (`travel-completion.int-spec.ts:1115` «pushes once when the sweep races a job trigger»). L'assestamento sta nello stesso callback → avviene una volta sola o mai. Un tick dello sweep concorrente scrive con filtro su `startTime`+`settledKm`: dopo il completamento `activeTravel` è `null` → nessun match; se il tick arriva prima della scrittura del completamento → `WriteConflict` → il completamento riparte e legge il nuovo `settledKm`.

### Q8 — Teleport (D-06)

Flusso (`travel.service.ts:187-269`): esistenza del POI e geografia **fuori** dal callback (`:191-194`); in transazione un solo `findOneAndUpdate(teleportFilter, teleportUpdate, { returnDocument: 'before', projection: TELEPORT_PROJECTION })` (`:215-226`) — `$set: { 'status.location': poiId, 'status.activeTravel': null }` + geografia (`travel.updates.ts:144-152`); report trattenuti consegnati nella stessa transazione (`:228-234`); dopo il commit rimozione best-effort dei job (`:253-269`). `TravelService` **non ha `Clock`** (`:64-77`): va iniettato (il provider esiste in `TravelModule`, `travel.module.ts`).

Varianti: c'è **una sola** mutation, `teleportCharacter` dell'oste verso **qualsiasi** POI (città o territorio, `travel-admin.resolver.ts:15-27`). `teleportFilter` richiede la corsia standard libera (`travel.updates.ts:134-141`) → si teletrasportano solo viaggi **liberi** (compresa la deviazione, che è `kind: free` ma senza `food` → nulla da fare). Il salto istantaneo è nell'accettazione (`quest-acceptance.updates.ts:94-96`) e resta esente.

Dove applicare (c) + fame: nel callback, prima del `findOneAndUpdate`, una lettura in sessione (`teleportFilter`, proiezione `activeTravel` con `startTime`, `duration`, `road.distance`, `ambush`, `food`, più `ownedItems` e vita); `targetKm = min(travelKmAt(now), ambush?.km)`; il `$set` dell'assestamento si fonde in `teleportUpdate` e le guardie (settledKm, vita letta, quantità vendute) nel filtro. Catalogo del cibo letto fuori dal callback insieme alla geografia.

### Q9 — Pozioni e altri writer della vita in viaggio

| Writer | Forma | Rischio con la fame |
|--------|-------|--------------------|
| Pozione `useItem` | transazione, lettura in sessione, `$set` assoluto di vita e `ownedItems`, guardia d'uguaglianza su `status.currentLifePoints` (`item-use.service.ts:52-98`, `item-use.plan.ts:214-253`) | nessuno: un tick concorrente cambia la vita → `WriteConflict`/filtro mancato e la pozione si ricalcola (sonda 1). La fame mai assoluta da lettura vecchia → non cancella la pozione |
| Imboscata | transazione, `$set` assoluto da snapshot in sessione (`ambush-plan.ts:211`) | come sopra |
| Esiti di quest / GM | transazione (`OutcomeWriter.writeCharacterUpdate`, `outcome-writer.service.ts:110-122`) | un viaggiatore non ha quest risolvibili; comunque protetto dalla transazione |
| Partenza (oggi) | `$set` assoluto guardato | sparisce |

**Change stream:** `CharacterUpdatesPublisher` emette `characterUpdated` per **ogni** `update`/`replace` di un personaggio attivo (`character-changes.pipeline.ts`, `character-updates.publisher.ts:46-61`), con single-flight per personaggio. Ogni scrittura dello sweep arriva quindi all'app (effetto voluto, D-10). Nessuna push né audit su vita/inventario: le push sono solo su eventi (`travelEnd`, `ambushDefeat`, prigione, party), l'audit solo sulle mutation admin (`admin-audit.interceptor.ts`). `noEffect` delle heal si ricalcola sugli eventi di quest, non sui cambi di vita. Per questo lo sweep **non** deve scrivere quando l'incremento è zero.

### Q10 — Viaggi legacy (D-11)

Un `activeTravel` senza `food` attraversa intatto ogni percorso se il codice rispetta tre regole:
1. **Sweep:** la selezione `'status.activeTravel.food.settledKm': { $gte: 0 }` non lo trova (sonda 1: «legacy tick» → `matchedCount 0`).
2. **Imboscata, arrivo, teleport:** il piano puro restituisce «nessun assestamento» se `food` è assente; nessun path `status.activeTravel.food.*` va nel `$set` (altrimenti Mongoose crea un sotto-documento parziale che lo sweep poi selezionerebbe, Pitfall 3).
3. **Difesa:** la funzione che legge il piano rifiuta forme non valide (`needed`/`uncoveredKm` non numerici) come «nessun piano», con log del solo id.

Prove esistenti già legacy: `ambush-resolution.int-spec.ts:701`, tutte le `travel-completion*.int-spec.ts` (fixture senza `food`, `test/travel/active-travel.fixture.ts`), `teleport.resolver.int-spec.ts:229-263`. I personaggi in viaggio al deploy hanno già pagato tutto alla partenza: nessuna azione (vedi §Stato in volo al deploy).

### Q11 — Test e harness

- **Orologio:** `FixedClock` (`test/auth/fixed-clock.ts`) con `advanceSeconds`; gli harness lo sovrascrivono per token `Clock` in tutti i moduli (`test/quests/outcome-world.ts:60` e opzione `clock`). Pattern `moveClockTo(instant)` in `ambush-sweeper.int-spec.ts:44-47`.
- **Sweep nelle int-spec:** `harness.app.get(TravelSweeper).sweep()` atteso esplicitamente (`travel-completion.int-spec.ts:1063-1135`, `ambush-sweeper.int-spec.ts:110-114`); config `sweepIntervalMs: 0` (`outcome-world.ts:50,179`, `travel-completion.int-spec.ts:84`). Il reconciler al boot gira comunque (`void sweepSafely()` in `onApplicationBootstrap`): non inserire fixture con `food` prima che l'app sia avviata.
- **Mondo delle imboscate:** `persistTraveller` (`test/travel/ambush-world.ts:229-283`) costruisce un viaggio su R1 (~20 km, `AMBUSH_ROUTE_KM`, `:199-205`) con imboscata al `km`; non accetta `distance`, `duration` né `food` (`activeTravel: travel` è scritto **dopo** lo spread degli override, `:263-268`). Per «km 290» e «km 30 su 400» serve estendere `TravellerOptions` con `distanceKm`, `durationMs`, `food` (la polilinea R1 va bene: punto e deviazione usano solo la frazione `km / distance`).
- **Cibo:** `persistFood(model, power)` e `foodStack(item, q)` (`test/travel/travel-food.fixture.ts`), `HARDY_LIFE_POINTS = 1000`.
- **Combattimento:** `ScriptedCombatResolver.contexts` registra i contesti → si asserisce la vita d'ingresso `contexts[0].participants[0].currentLifePoints`; default `hpAfter = currentLifePoints` del contesto.
- **Tempi misurati oggi (2026-11-12):** unit `src/travel/food` + `travel-sweeper.spec` + `travel.updates.spec` + `ambush-plan.spec` + `quest-acceptance.updates.spec` = 7 suite, 120 test, 2,6 s; integration `travel.service` 6,3 s, `teleport.resolver` 5,6 s, `ambush-resolution` 9,0 s, `travel-completion` 6,3 s, `travel-pantry.reader` < 5 s (5 suite, 122 test, 28 s).
- **Coverage** (`package.json` `coverageThreshold`): `./src/travel/` 97/84/98, `./src/quests/acceptance/` 97/91/98, `./src/economy/` 98/91/98 (se si toccano i builder di `trade-inventory`, non previsto). Rischio: rami nuovi del servizio di sweep (errore per personaggio, piano non valido, fail-safe) → coprirli con unit sul servizio o int-spec dedicate.
- **Unit dello sweeper:** `travel-sweeper.spec.ts:28-38` costruisce `new TravelSweeper(config, model, completion, clock)` e simula `find` con un solo risultato: un nuovo parametro del costruttore richiede di aggiornare `sweeperWith` e di stubbare il servizio della fame (motivo in più per un servizio dedicato anziché una seconda `find` dentro `runOnce`).
- **SDL:** `@Prop` senza `@Field` non entra nello SDL: `ActiveTravel` ha `kind`, `ambush`, `ambushReports` solo Mongoose (`active-travel.model.ts:62-70`) e `type ActiveTravel` in `src/schema.gql:20-26` elenca solo `duration endTime road startTime to`. La nuova classe `ActiveTravelFood` deve essere `@Schema({ _id: false })` **senza** `@ObjectType` (precedente `AmbushPlanEntry`, `ambush-snapshot.model.ts`). Il boot reale confronta lo schema (`test/app.int-spec.ts:77`).
- **Prettier:** tutti i file che la fase toccherà verosimilmente sono già puliti (`npx prettier --check`, 44 file controllati: `src/travel/**` toccati, `src/quests/acceptance/*`, `src/models/character/active-travel.model.ts`, `character.model.ts`, i due spec degli indici, `test/travel/*.ts`, `test/quests/outcome-world.ts`, `test/app.int-spec.ts`). **Nessun file da formattare prima.**

### Q12 — Totali identici alla Phase 14

Spec che fissano totali/anteprima/rifiuto: `travel-food.spec.ts` (fabbisogno, arrotondamento, triangolare, `planTravelFood`), `food-selection.spec.ts` (selezione), `travel.resolver.int-spec.ts:567,602` e `accept-quest.resolver.int-spec.ts:1235,1290` (anteprima), `travel.service.int-spec.ts:372,388` e `quest-acceptance.service.int-spec.ts:1726-1791` (rifiuto). Restano tutti verdi: `planTravelFood`/`selectFood`/`previewOf` non cambiano.

Come asserire i totali nuovi:
1. **Unit di proprietà** (deterministica, nessun `Math.random`: griglia fissa) su `hungerBetween`: per distanze `{0.44, 1, 2.7, 16, 20.37, 22.24, 49.999, 100, 400, 506.3}` × coperture `{0, 1, n/3, n/2, n−1, n, n+5}` × alcune partizioni fisse (passo 1 km, passo 0,37 km, passo `D/7`, confine esatto, un solo passo) la somma degli incrementi è `hpLostFor(uncoveredKmOf(needed, covered, D))`; nessun incremento negativo; zero prima di `coveredKmOf`.
2. **Integration** «arrivo con totali identici»: partenza vera con cibo parziale, `FixedClock` mosso a scatti con `sweep()`, poi completamento: `HARDY − vita finale === hpLostFor(uncoveredKmOf(needed, covered, route.distanceKm))` e inventario finale uguale a quello che la Phase 14 lasciava alla partenza (stesso `selectFood`).

## Conflitti col CONTEXT

_Arbitrati il 2026-11-12: C-1 → D-13; C-2 → D-17; C-3 → D-15 e D-10 rivisto; C-4 → D-16; C-5 → D-14; C-6 → D-18; C-7 → riferimenti corretti nel CONTEXT; C-8 → D-19._

**C-1 — `coveredKm` non basta a ricostruire la curva.** Evidenza: `uncoveredKmOf` per eccesso può superare la distanza (`travel-food.ts:38-46`; pin `uncoveredKmOf(89, 0, 22.24) = 23`); `coveredKm` grezzo `−0.6299…` (sonda 2). Ruling raccomandato: aggiungere `uncoveredKm` (intero) ad `ActiveTravelFood`, tenere `coveredKm = max(0, distanceKm − uncoveredKm)` come confine del pasto (a) e `hpLostTotal` come invariante. È una correzione motivata dei nomi fissati: la decide l'orchestratore.

**C-2 — La Phase 14 D-13 («teleport e salto non consumano; il cibo mangiato resta mangiato») è superata da D-06 per il teleport.** Il CONTEXT dichiara superata solo la D-04. Evidenza: `teleport.resolver.int-spec.ts:344` asserisce che il teleport non tocca la dispensa. Ruling: vale D-06 (decisione successiva e dichiarata); la spec va RED; il handoff lo scrive.

**C-3 — «a scatti di un minuto» (D-10) contro «il km n-esimo si paga quando lo si completa» (D-02 / discrezione).** Evidenza: la fame cresce solo a km scoperto completato; a 10 km/h (`BASE_SPEED`, `travel-timing.ts:6`) un km dura 6 minuti, con un pet più veloce meno. Ruling raccomandato: lo sweep scrive solo quando l'incremento è positivo (o il pasto è dovuto); il handoff dice «a scatti di un km (circa ogni 6 minuti a passo base, controllati ogni minuto)». Non cambia una regola di gioco, solo la descrizione.

**C-4 — «la stessa proporzione che la Phase 15 usa per il `km`»: la Phase 15 va da km a tempo, non da tempo a km.** Evidenza: `ambush-draw.ts:29-33`, nessuna funzione inversa nel codice. Ruling: `travelKmAt` nuovo; all'imboscata si usa `ambush.km` salvato (il `⌊…⌋` dell'istante darebbe un km leggermente minore); lo sweep limita il bersaglio a `ambush.km` se un'imboscata è pendente.

**C-5 — «mai un valore assoluto» (D-01, REPO-RULES) e i percorsi a evento.** Evidenza: l'imboscata scrive per forza la vita assoluta dell'esito (`ambush-plan.ts:211`), come pozione e partenza. Ruling raccomandato: nei percorsi transazionali la vita si scrive col `$set` calcolato dalla lettura **in sessione** (equivalente guardato, nessuna lettura vecchia); il divieto resta pieno per qualsiasi scrittura fuori transazione (OQ-1).

**C-6 — `hpBefore` del report d'imboscata cambia semantica.** Evidenza: `reportOf` usa `before.currentLifePoints` dello snapshot (`ambush-plan.ts:239`), che ora è la vita dopo la fame al km. È ciò che l'utente chiede («vita vera di quel punto»), ma il FE mostra `hpBefore` nei risultati: nessun campo nuovo, valore diverso. Ruling: accettare e scriverlo nel handoff §2 (domanda alla FE solo se mostra «vita alla partenza»).

**C-7 — riferimenti spostati.** «teleport in `src/characters/`» → `src/travel/travel.service.ts:187` e `travel-admin.resolver.ts`; «`TravelPath.distance`» → `activeTravel.road.distance`; «impilato sulla 19» → oggi il ramo parte da `develop` (già annotato nella REPO-RULES). Ruling: nessuna regola cambia, i piani citano i path veri.

**C-8 — Il fail-safe «il resto è scoperto da lì in avanti» non ha una forma nel piano salvato.** Evidenza: il piano non conserva la power coperta né la lista delle unità; il cibo in viaggio non può cambiare (§Q5). Ruling raccomandato: OQ-2 (riscrittura della curva con la formula della Phase 14, telescopica da `settledKm`). È una regola di gioco marginale: da confermare con l'utente solo se l'orchestratore lo ritiene necessario.

## Architettura raccomandata

```
src/travel/food/
├── travel-food.ts               # + TravelFoodCurve, coveredKmOf, travelHungerAt, hungerBetween, foodPlanOf (puri)
├── travel-food-settlement.ts    # NUOVO puro: settlementOf(input) → FoodSettlement | null; settlementSetOf, settlementGuardsOf
├── travel-food.updates.ts       # mealLinesOf resta; mealGuardsOf/mealSetOf sostituiti o ridotti (non più usati alla partenza)
├── travel-pantry.reader.ts      # + foodCatalogFor(ownedItems) pubblico, stacksOf esportato
└── travel-food.sweep.ts         # NUOVO @Injectable: settleDue(now) chiamato da TravelSweeper.runOnce (in TravelPlanningModule o TravelModule)
src/travel/travel-timing.ts      # + travelKmAt; ActiveTravelDraft.food?
src/models/character/active-travel-food.model.ts  # NUOVO @Schema({ _id: false }) senza @ObjectType
src/models/character/active-travel.model.ts       # + @Prop({ type: ActiveTravelFoodSchema, required: false }) food?
```

**Piano di assestamento (puro)** — un solo punto di verità per i cinque chiamanti:

```ts
export type FoodMoment = 'progress' | 'arrival' | 'stop';
export interface FoodSettlementInput {
    food: ActiveTravelFoodSnapshot;   // dal documento, validato
    distanceKm: number;
    durationMs: number;
    targetKm: number;                 // sweep: min(travelKmAt, ambush.km); imboscata: ambush.km; arrivo: distanceKm; teleport: come lo sweep
    moment: FoodMoment;               // progress = sweep/imboscata; arrival = (b); stop = sconfitta/teleport (c)
    lifeNow: number;                  // statusFactsOf(snapshot).currentLifePoints
    assets: InventorySnapshot;        // ownedItems in sessione
    stacks: readonly FoodStack[];
    now: Date;
}
export interface FoodSettlement {
    hpLoss: number;
    lifeAfter: number;                // Math.max(MIN_LIFE_POINTS, lifeNow − hpLoss): mai lifePointsWithin (non abbassare una vita oltre il massimo)
    settledKm: number;                // max(food.settledKm, targetKm)
    consumed: ConsumedFood[];         // vuoto se nessun pasto
    ownedItems: InventoryEntry[] | null;
    foodConsumedAt: Date | null;
    food: ActiveTravelFoodDraft;      // piano dopo (fail-safe) — ignorato per moment 'stop'/'arrival'
}
// null = niente da scrivere (incremento 0 e nessun pasto dovuto)
export function settlementOf(input: FoodSettlementInput): FoodSettlement | null;
```

Regole del pasto: `foodConsumedAt == null` e (`progress` con `targetKm ≥ coveredKm`) → `selectFood(needed, stacks)`; `arrival` → `selectFood(needed, stacks)`; `stop` → `selectFood(min(needed, foodNeededFor(durationMs × targetKm / distanceKm)), stacks)`.

### Anti-pattern da evitare
- **Scrivere `status.activeTravel.food.*` su un viaggio senza piano:** Mongoose crea un sotto-documento parziale che lo sweep selezionerebbe (Pitfall 3).
- **`$inc` semplice sulla vita:** non clampa, fallisce su `null`, scrive negativo su assente (sonda 1).
- **`lifePointsWithin` per la fame:** clampa anche al massimo e abbasserebbe una vita «oltre» (D-02 della Phase 18, `item-use.plan.ts:184-191`).
- **Consumo fuori transazione:** `ownedItems` è un array assoluto; fuori sessione cancella una pozione bevuta in mezzo.
- **Scrivere a ogni sweep anche a incremento zero:** `characterUpdated` ogni minuto per ogni viaggiatore.
- **Usare `travelKmAt(ambush.at)` come km dell'imboscata.**

## Don't Hand-Roll

| Problema | Non costruire | Usa | Perché |
|----------|---------------|-----|--------|
| Selezione del cibo | una nuova euristica per i km parziali | `selectFood(needed', stacks)` | Phase 14 D-06, knapsack lessicografico già provato (`food-selection.ts`) |
| Inventario dopo il pasto | splice a mano di `ownedItems` | `applyTradeToInventory` + `mealLinesOf` + `soldQuantityGuards` | voci a zero rimosse, prima voce per id, guardie già testate |
| Vita legacy (`null`/assente) | default a mano | `statusFactsOf(snapshot).currentLifePoints` | legge il massimo dalla tabella unica |
| Retry sui conflitti | loop di retry | `connection.transaction(cb)` | il driver riesegue il callback sui `WriteConflict` (sonda 1) |
| Ora | `new Date()` | porta `Clock` | testabilità con `FixedClock`, regola del repo |
| Km del confine in float | confronti con epsilon | metri interi come `uncoveredKmOf` + caso esplicito `x ≥ D` | telescopia esatta |

## Stato in volo al deploy (D-11)

| Categoria | Trovato | Azione |
|-----------|---------|--------|
| Dati salvati | personaggi con `activeTravel` senza `food` (hanno già pagato tutto alla partenza) | nessuna: ignorati per costruzione (§Q10) |
| Config dei servizi | nessuna | — |
| Stato registrato nell'OS | nessuno | — |
| Segreti / env | nessuna variabile nuova (`TRAVEL_SWEEP_INTERVAL_MS` esiste) | — |
| Artefatti di build | `dist/` ricostruito dall'orchestratore | nessuna azione degli esecutori |

Nuovo indice opzionale: costruito al boot da `SweepIndexVerifier` (`sweep-index.verifier.ts`), mai bloccante.

## Common Pitfalls

### Pitfall 1: un km di troppo o di meno alla fine
**Cosa va storto:** la somma degli incrementi differisce dal totale della Phase 14. **Perché:** ricostruire `U` da `coveredKm` float, o valutare la curva a `D` con errore di arrotondamento. **Come evitarlo:** salvare `uncoveredKm`, caso esplicito `x ≥ D → hpLostTotal`, incremento = differenza della stessa funzione. **Segnale:** la unit di proprietà su 22,24 km o 20,37 km fallisce di `U` HP.

### Pitfall 2: fame oltre il km dell'imboscata
**Cosa va storto:** lo sweep della fame passa prima dello sweep delle imboscate quando l'imboscata è scaduta e affama fino a `nowKm > ambush.km`. **Come evitarlo:** `targetKm = min(travelKmAt, ambush.km)` finché `ambush` è pendente. **Segnale:** la vita d'ingresso nel contesto del combattimento è minore di quella attesa al km.

### Pitfall 3: sotto-documento `food` parziale sui legacy
**Cosa va storto:** `$set 'status.activeTravel.food.settledKm'` su un viaggio senza piano crea `food: { settledKm, foodConsumedAt: null }` → lo sweep lo seleziona. **Come evitarlo:** builder che restituiscono `{}` senza `food`; test legacy con `Object.keys(raw.status.activeTravel).sort()`.

### Pitfall 4: consumo che resuscita una pozione
**Cosa va storto:** `ownedItems` assoluto scritto fuori sessione. **Come evitarlo:** ogni pasto dentro una transazione con lettura in sessione; int-spec col pattern di `travel.service.int-spec.ts:500` (acquisto concorrente dopo la lettura) adattato a pasto (a) e (b).

### Pitfall 5: incrementi negativi dopo la vittoria
**Cosa va storto:** `settledKm = ambush.km` e `travelKmAt(now)` di poco minore per il `⌊…⌋` dell'istante. **Come evitarlo:** `hungerBetween` → 0 per `to ≤ from`; selezione in codice salta `target ≤ settledKm`.

### Pitfall 6: `characterUpdated` ogni minuto
**Come evitarlo:** nessuna scrittura a incremento zero nel tratto coperto o fra due km.

### Pitfall 7: reconciler al boot che corre col setup dei test
**Cosa va storto:** `onApplicationBootstrap` lancia `void sweepSafely()`; una fixture con `food` inserita mentre gira può essere toccata. **Come evitarlo:** inserire le fixture dopo `beforeAll`, guidare sempre `sweep()` a mano e attenderlo.

### Pitfall 8: harness che si appende
Trappola 15-03 della REPO-RULES: un provider nuovo non risolvibile (es. il servizio della fame in `TravelModule` ma richiesto da `AmbushModule`, che importa solo `TravelPlanningModule`, `ambush.module.ts:31-44`) fa fallire `compile()` dopo l'apertura di Mongoose → jest appeso. **Come evitarlo:** ciò che serve all'imboscata (puro + `TravelPantryReader`) sta in `TravelPlanningModule` o è puro.

### Pitfall 9: collisione di `$and` nei filtri
`soldQuantityGuards` restituisce `{ $and: [...] }`; se il filtro del chiamante ne ha già uno, lo spread lo sovrascrive. Oggi nessun filtro coinvolto ha `$and` (`notImprisonedAt` usa `$not`, `imprisonment.ts:38-40`): mantenere una sola fonte di `$and` (passare le guardie extra come secondo argomento di `soldQuantityGuards`, come fa `mealGuardsOf`).

### Pitfall 10: Mongoose 9
Mongoose 9 richiede un'opzione esplicita per le pipeline negli update; il repo è su 8.18.1 (`node_modules/mongoose/package.json`) e `COMPLETION_UPDATE` già le usa. Solo un appunto se si sceglie l'opzione (i). [ASSUMED: comportamento di Mongoose 9 da conoscenza pregressa, non verificato in questa sessione]

## Code Examples

### Curva telescopica (verificata dalla sonda 2)
```ts
// Source: sonda 2 di questa ricerca, su foodNeededFor/uncoveredKmOf/hpLostFor di src/travel/food/travel-food.ts
const METRES_PER_KM = 1000;
export function travelHungerAt(curve: TravelFoodCurve, km: number): number {
    if (km >= curve.distanceKm) return curve.hpLostTotal;
    const remaining = Math.round(curve.distanceKm * METRES_PER_KM) - km * METRES_PER_KM;
    const completed = Math.min(
        curve.uncoveredKm,
        Math.max(0, curve.uncoveredKm - Math.ceil(remaining / METRES_PER_KM)),
    );
    return hpLostFor(completed);
}
export const hungerBetween = (curve: TravelFoodCurve, fromKm: number, toKm: number): number =>
    toKm <= fromKm ? 0 : travelHungerAt(curve, toKm) - travelHungerAt(curve, fromKm);
```

### Assestamento nello sweep (opzione raccomandata, forma della pozione)
```ts
// Source: pattern di item-use.service.ts:72-98 e travel.service.ts:100-141
await this.connection.transaction(async (session) => {
    const snapshot = await this.characterModel
        .findOne(foodSweepFilter(identity), FOOD_SETTLEMENT_PROJECTION)
        .session(session).lean<FoodTravellerSnapshot | null>().exec();
    if (!snapshot?.status.activeTravel?.food) return;
    const pantry = await this.pantry.read(identity.characterId, session);
    const settlement = settlementOf({ /* targetKm, moment: 'progress', … */ });
    if (!settlement) return;
    await this.characterModel.updateOne(
        { ...foodSweepFilter(identity), ...settlementGuardsOf(snapshot, settlement, pantry.hpRaw) },
        { $set: settlementSetOf(settlement) },
        { session },
    ).exec();
});
```

### Pipeline alternativa (verificata dalla sonda 1)
```ts
// Source: sonda 1 (Mongoose 8.18.1, server 8.2.6); precedente pipeline: travel.updates.ts:97-104
await characterModel.updateOne(
    { ...activeCharacterById(id), 'status.activeTravel.startTime': start,
      'status.activeTravel.food.settledKm': settledKm },
    [{ $set: {
        'status.currentLifePoints': { $max: [MIN_LIFE_POINTS,
            { $subtract: [{ $ifNull: ['$status.currentLifePoints', maxFallback] }, hpLoss] }] },
        'status.activeTravel.food.settledKm': targetKm,
    } }],
).exec();
```

## State of the Art

| Vecchio | Nuovo | Quando | Impatto |
|---------|-------|--------|---------|
| Phase 14 D-04: cibo e vita tutti alla partenza, l'arrivo non tocca nulla | piano salvato; fame allo sweep; cibo al confine/arrivo/sconfitta | Phase 20 | dispensa e vita cambiano in viaggio via stream |
| Phase 14 D-13: il teleport non consuma | teleport a viaggio iniziato = sconfitta (c) | Phase 20 D-06 | spec `teleport.resolver.int-spec.ts:344` riscritta |
| Phase 15: la deviazione «non costa», cibo già mangiato | la deviazione non costa; il cibo dei km non percorsi non è mai stato mangiato | Phase 20 D-04 | nessun rimborso, nessun codice di rimborso |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Mongoose 9 richiede un'opzione per le pipeline negli update | Pitfall 10 | basso: rilevante solo a un upgrade futuro e solo con l'opzione (i) |
| A2 | Cardinalità dei viaggiatori con piano = decine (un solo canale) | Q4 | basso: senza indice lo sweep resta corretto, solo più lento; l'indice D-17b copre comunque |
| A3 | Il server di produzione è ≥ 4.2 (pipeline negli update) | Q4 opz. (i) | nullo per l'opzione (ii); `COMPLETION_UPDATE` già in produzione lo dimostra |

## Open Questions (RESOLVED — ruling dell'orchestratore del 2026-11-12 in `20-CONTEXT.md` D-13..D-19: tutti i default raccomandati accettati)

_OQ-1 → D-14 (opzione ii); OQ-2 → D-19; OQ-3 → D-13; OQ-4 e OQ-5 → D-15; OQ-6 → D-10 rivisto e D-18; OQ-7 → D-17._

1. **Forma della scrittura dello sweep.** Sappiamo: (i) pipeline e (ii) transazione con `$set` guardato funzionano entrambe (sonda 1). Non deciso: quale vuole l'orchestratore. **Default raccomandato: (ii)**, una sola forma per tutti i percorsi, coerente con pozione/imboscata/partenza; (i) solo se si vuole il tick della fame senza transazione.
2. **Fail-safe al confine (cibo cambiato).** Default raccomandato: riscrivere `uncoveredKm`/`coveredKm`/`hpLostTotal` con `uncoveredKmOf(needed, covered', D)` e continuare la fame telescopica da `settledKm`, nessun addebito retroattivo, un log; caso irraggiungibile senza modifiche a mano del DB.
3. **Campo `uncoveredKm` (C-1).** Default raccomandato: aggiungerlo ad `ActiveTravelFood` (intero), tenere gli altri nomi della REPO-RULES invariati.
4. **Indice del passo «fame».** Default raccomandato: sì, `character_active_travel_food` `{ deletedAt: 1, 'status.activeTravel.food.settledKm': 1 }` col pattern D-17b, con le due voci nei test degli indici.
5. **Dove vive il servizio dello sweep.** Default raccomandato: `TravelFoodSweep` (`src/travel/food/travel-food.sweep.ts`) registrato in `TravelPlanningModule` (ha `Character`, `LootItem`, `Clock`, `TravelPantryReader`) e chiamato da `TravelSweeper.runOnce` dopo i completamenti; `runOnce` restituisce ancora i soli completamenti.
6. **Testo del handoff su C-3 e C-6.** Default raccomandato: «vita a scatti di un km, controllata ogni minuto»; «`hpBefore` del report = vita al km dell'imboscata, fame compresa».
7. **Teleport con imboscata pendente scaduta.** Default raccomandato: bersaglio `min(travelKmAt(now), ambush.km)` come lo sweep (la pedina non ha superato un'imboscata non risolta).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node + npx | jest, tsc, prettier | ✓ | (in uso dal repo) | — |
| mongodb-memory-server (replica set) | int-spec | ✓ | binari 8.0.4 e 8.2.6 in cache; la sonda ha girato su 8.2.6 | — |
| Mongoose | modelli, pipeline | ✓ | 8.18.1 | — |
| Redis effimero | harness con code | ✓ (già usato dalle suite) | — | `FakeTravelQueue` |

Nessuna dipendenza mancante.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest, progetti `unit` e `integration` (`package.json` `jest.projects`) |
| Config file | `package.json` (`jest`), `test/setup/global-setup.ts` (replica set condiviso) |
| Quick run command | `npx jest src/travel/food --selectProjects unit` |
| Full suite command | `npx jest --selectProjects unit` poi `npx jest --selectProjects integration --runInBand` (la coverage `test:cov` la lancia l'orchestratore) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-FOODP-01 | piano salvato alla partenza libera, inventario e vita intatti | integration | `npx jest src/travel/travel.service.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi da riscrivere) |
| BE-FOODP-01 | piano salvato nel claim, salto e marker senza piano | integration | `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi da riscrivere) |
| BE-FOODP-01 | builder di partenza/claim con `food`, nessun meal set | unit | `npx jest src/travel/travel.updates.spec.ts src/quests/acceptance/quest-acceptance.updates.spec.ts --selectProjects unit` | ✅ |
| BE-FOODP-01 | `foodPlanOf` (campi, `uncoveredKm`, clamp di `coveredKm`) | unit | `npx jest src/travel/food/travel-food.spec.ts --selectProjects unit` | ✅ (casi nuovi) |
| BE-FOODP-02 | `travelKmAt` (0, metà, clamp, duration 0) | unit | `npx jest src/travel/travel-timing.spec.ts --selectProjects unit` | ✅ (casi nuovi) |
| BE-FOODP-02 | `travelHungerAt`/`hungerBetween`: 0 km, confine, oltre, intero, proprietà dei totali, nessun negativo | unit | `npx jest src/travel/food/travel-food.spec.ts --selectProjects unit` | ✅ (casi nuovi) |
| BE-FOODP-02 | `settlementOf`: clamp a 1, nessuna scrittura a incremento zero, vita oltre il massimo non abbassata | unit | `npx jest src/travel/food/travel-food-settlement.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-FOODP-02 | sweep: niente prima del confine; scatti dopo; pozione fra due sweep; imboscata pendente limita il km; doppio sweep idempotente; legacy ignorato | integration | `npx jest src/travel/food/travel-food.sweep.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-FOODP-02 | `TravelSweeper` chiama il passo dopo i completamenti, errore isolato | unit | `npx jest src/travel/travel-sweeper.spec.ts --selectProjects unit` | ✅ (da aggiornare) |
| BE-FOODP-03 | selezione parziale: 30 km su 400 → fabbisogno di 30 km; 400 → tutto; dopo il confine = (a) | unit | `npx jest src/travel/food/travel-food-settlement.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-FOODP-03 | pasto al confine una volta sola; acquisto/pozione concorrente conservati | integration | `npx jest src/travel/food/travel-food.sweep.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-FOODP-03 | teleport a metà: (c) + fame al km; senza viaggio/deviazione/legacy nulla | integration | `npx jest src/travel/teleport.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ (344 riscritto + casi nuovi) |
| BE-FOODP-04 | imboscata al km 290: vita d'ingresso esatta nel contesto; vittoria conserva il piano con `settledKm = km` | integration | `npx jest src/travel/ambush/ambush-resolution.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) |
| BE-FOODP-04 | sconfitta al km 30 di 400: cibo pro-rata, deviazione senza `food`; legacy invariato (701) | integration | idem | ✅ (casi nuovi) |
| BE-FOODP-04 | arrivo: fame fino a `distanceKm`, pasto (b), totali = Phase 14; doppio trigger una volta; legacy invariato | integration | `npx jest src/travel/travel-completion.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) |
| BE-FOODP-04 | piano puro dell'imboscata con assestamento (vittoria/sconfitta, legacy) | unit | `npx jest src/travel/ambush/ambush-plan.spec.ts --selectProjects unit` | ✅ (casi nuovi) |
| BE-FOODP-05 | SDL identico al boot reale | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` + `git diff --exit-code src/schema.gql` | ✅ |
| BE-FOODP-05 | indice dichiarato e costruito (se OQ-4) | unit + integration | `npx jest src/models/sweep-indexes.schema.spec.ts --selectProjects unit`; `npx jest src/mongo/sweep-index.verifier.int-spec.ts --selectProjects integration --runInBand` | ✅ (voce nuova) |

### Sampling Rate
- **Per task commit:** la spec mirata del task (unit < 5 s; int-spec singola 6–10 s) + `npx tsc --noEmit -p tsconfig.json`.
- **Per piano:** le spec del piano + `git diff --exit-code src/schema.gql`.
- **Phase gate:** unit completa, integration completa `--runInBand`, coverage per cartella `./src/travel/` e `./src/quests/acceptance/` come ripiego se `test:cov` supera i 600 s.

### Wave 0 Gaps
- [ ] `test/travel/ambush-world.ts` — `TravellerOptions` con `distanceKm`, `durationMs`, `food` (viaggi da 400 km sulla polilinea R1)
- [ ] `test/travel/active-travel.fixture.ts` — opzione `food` per `buildActiveTravelDoc` e un builder `buildActiveTravelFood(overrides)`
- [ ] `src/travel/food/travel-food-settlement.spec.ts` — unit del piano di assestamento
- [ ] `src/travel/food/travel-food.sweep.int-spec.ts` — harness `createOutcomeHarness` o quello di `travel-completion.int-spec.ts` con `FixedClock` e `sweepIntervalMs: 0`
- Nessuna installazione di framework.

## Piano suggerito (onde sequenziali, un piano per onda)

Ordine scelto perché **la partenza cambia per ultima**: finché nessun viaggio riceve `food` il comportamento resta quello della Phase 14 e ogni commit del ramo è coerente; le int-spec dei piani 03–06 seminano `food` con le fixture.

| Piano | Contenuto | RED prima |
|-------|-----------|-----------|
| 20-01 | Modello `ActiveTravelFood` (Mongoose-only, `_id: false`, `uncoveredKm` se OQ-3) su `ActiveTravel.food`; `travelKmAt`; `TravelFoodCurve`, `coveredKmOf`, `travelHungerAt`, `hungerBetween`, `foodPlanOf`; fixture Wave 0 | unit nuove in `travel-food.spec.ts`, `travel-timing.spec.ts`; SDL invariato |
| 20-02 | Piano puro di assestamento `settlementOf` + `settlementSetOf`/`settlementGuardsOf`; `TravelPantryReader.foodCatalogFor` pubblico e `stacksOf` esportato | `travel-food-settlement.spec.ts` |
| 20-03 | Arrivo: `COMPLETION_PROJECTION` esteso, assestamento + pasto (b) nella transazione di `complete`; legacy invariato | casi nuovi in `travel-completion.int-spec.ts`, `travel.updates.spec.ts:183` |
| 20-04 | Sweep: `TravelFoodSweep` + chiamata da `runOnce`, selezione, transazione per personaggio, pasto (a), limite all'imboscata pendente; indice (OQ-4) | `travel-food.sweep.int-spec.ts`, `travel-sweeper.spec.ts`, spec degli indici |
| 20-05 | Imboscata: assestamento in sessione prima del combattimento, vittoria con piano, sconfitta con (c) e deviazione senza piano | `ambush-plan.spec.ts`, `ambush-resolution.int-spec.ts` (km 290, km 30/400, legacy) |
| 20-06 | Teleport: `Clock` in `TravelService`, lettura in sessione, fame + (c), catalogo fuori dal callback | `teleport.resolver.int-spec.ts:344` riscritto + casi nuovi |
| 20-07 | Partenza libera e da quest: salva `foodPlanOf`, niente `mealSetOf`/`mealGuardsOf`; rifiuto e anteprima identici; integration «arrivo con totali identici» end-to-end | le spec della tabella di §Q1 |
| 20-08 | Gate: unit + integration complete, `tsc`, SDL, grep di gate (nessun `process.env.` nuovo, nessun `Date.now`, nessun trailer), coverage per cartella | — |
| 20-09 | Handoff `BACKEND-NOTES.md` (§1 nessun cambio sul filo, §2 semantica nuova incl. C-3/C-6, §3 prove, §4 UAT su device: viaggio lungo con poco cibo, sconfitta seminata al km 30, §5 domande) + `requirements mark-complete` | — |

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | invariato |
| V3 Session Management | no | invariato |
| V4 Access Control | sì (teleport) | `@Roles(RoleType.innkeeper)` invariato (`travel-admin.resolver.ts:17`); nessuna mutation nuova |
| V5 Input Validation | no input nuovi | — |
| V6 Cryptography | no | — |
| V7 Logging | sì | solo id, conteggi, `describeError` (`ambush-sweeper.ts:123,142`) |

| Pattern | STRIDE | Mitigazione |
|---------|--------|-------------|
| Lost update fra pozione e fame | Tampering | transazione con lettura in sessione + guardie (sonda 1) |
| Doppio addebito fra sweep, imboscata, arrivo | Tampering | guardia su `settledKm`, identità del viaggio nel filtro, `foodConsumedAt` |
| Morte per fame | Denial of service del personaggio | clamp a `MIN_LIFE_POINTS` |

## Sources

### Primary (HIGH confidence)
- Codice del repo sul branch `feat/20-cibo-e-vita-progressivi` (path:riga citati in ogni sezione).
- Sonda 1 (script fuori dall'albero, `MongoMemoryReplSet` 8.2.6, Mongoose 8.18.1): pipeline con `$max`/`$subtract`/`$ifNull` e path puntati annidati; idempotenza sul filtro `settledKm`; clamp a 1; vita `null`/assente; `$inc` su `null` → codice 14, su assente → −3; filtro legacy senza match; transazione con tick concorrente → 2 tentativi, entrambe le scritture conservate.
- Sonda 2 (`ts-node` sulle funzioni reali di `travel-food.ts`): 3 500 partizioni, somma = `hpLostFor(uncoveredKmOf(...))` sempre; `uncoveredKmOf(1, 0, 20.37) = 21`.
- Sonda 3: `npx prettier --check` su 44 file probabili (tutti puliti); tempi delle suite (unit 2,6 s; integration 28 s per 5 suite).

### Secondary (MEDIUM confidence)
- `.planning/phases/14-viaggio-e-cibo/14-CONTEXT.md` D-01..D-19, `15-CONTEXT.md` D-09..D-13, `18-CONTEXT.md` D-15..D-17.

### Tertiary (LOW confidence)
- A1 (Mongoose 9 e pipeline) — conoscenza pregressa.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nessuna libreria nuova, versioni lette da `node_modules`.
- Architecture: HIGH — tutti i punti d'iniezione letti; sonde su scrittura e curva.
- Pitfalls: HIGH per 1–7, 9 (provati o letti nel codice); MEDIUM per 8 (dipende da dove si registra il servizio); LOW per 10.

**Research date:** 2026-11-12
**Valid until:** 2026-12-12 (codice stabile; da rivedere se un quick task tocca `src/travel/` prima dei piani)
