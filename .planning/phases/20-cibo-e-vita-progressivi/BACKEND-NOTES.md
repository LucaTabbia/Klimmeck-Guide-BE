# BACKEND-NOTES — Phase 20 Cibo e vita progressivi in viaggio (handoff per la FE e per la UAT)

- **Fase BE:** 20-cibo-e-vita-progressivi (requisiti BE-FOODP-01..05; decisioni D-01..D-19 in `20-CONTEXT.md`, D-19 nella forma chiarita dopo la review; nomi interni fissati in `20-REPO-RULES.md`). **Fase solo BE:** nessuna companion FE (D-12).
- **Data:** 2026-11-12. Documento scritto dopo il gate 20-10 e dopo i fix della code review (`20-REVIEW.md`, `20-REVIEW-FIX.md`: 13 fix, 2 `not_needed`, 0 skipped); descrive il codice della HEAD del ramo (`3175329d` più i soli commit di documentazione del piano 20-11).
- **Branch:** `feat/20-cibo-e-vita-progressivi` → PR verso `develop` a cura dell'orchestratore, dopo il riavvio reale del BE dal ramo e la UAT su device (§4).
- **Gate dopo i fix:** `npx tsc --noEmit` 0 su `tsconfig.json` e `tsconfig.build.json`; unit 274 suite / 3 591 test; integration 141 suite / 2 037 test (`src/travel` 12 / 244, `src/quests` 35 / 529, resto di `src/` 77 / 992, `test/` 17 / 272); coverage di `./src/travel/` 98,75 / 86,99 / 99,37 (statements / branches / lines, soglie 97 / 84 / 98) e di `./src/quests/acceptance/` 99,06 / 92,79 / 99,73 (soglie 97 / 91 / 98); `src/schema.gql` e `package.json` senza diff. `npm run test:cov` completo: lanciato dall'orchestratore. Verifica (`20-VERIFICATION.md`) e audit di sicurezza (`20-SECURITY.md`): in arrivo, dopo questo piano.
- **Nessuna** variabile d'ambiente nuova, dipendenza nuova, migrazione, seeder o one-off (D-11).
- **Fonte:** ogni nome, percorso e testo di log è copiato dal codice (`src/travel/food/`, `src/travel/travel-sweeper.ts`, `src/travel/travel.service.ts`, `src/travel/travel-completion.service.ts`, `src/travel/ambush/ambush-resolution.service.ts`, `src/models/character/`). **Il codice vince su questo documento.**

---

## 0. TL;DR per il FE

1. **Niente di nuovo sul filo (D-10, D-12):** nessun campo, tipo, argomento o codice d'errore nuovo; nessuna companion FE da scrivere.
2. **La partenza non scala più cibo e vita.** Anteprima (`travelPreview`, `questTravelPreview`) e rifiuto `TRAVEL_STARVING` sono identici a prima: stessi numeri, stessa regola «arrivi vivo».
3. **Durante il viaggio** la vita cala **a scatti di un km** nel solo tratto scoperto (lo sweep controlla ogni minuto) e il cibo sparisce **in blocco, una volta sola** (al confine dei km coperti, oppure all'arrivo, alla sconfitta o al teleport se arrivano prima).
4. Tutto arriva dallo stream `characterUpdated` già sottoscritto (vita in `status.currentLifePoints`, dispensa in `assets.ownedItems`).
5. **`hpBefore` del report d'imboscata** è ora la vita al km dell'imboscata, fame compresa (D-18).

---

## 1. Nessun cambio sul filo

- **Prova:** `git diff 466be7e7 -- src/schema.gql` è vuoto (`466be7e7` = `PHASE_BASE`, «docs(phase-20): begin phase execution», dal SUMMARY 20-10); `git diff --exit-code src/schema.gql` esce 0 dopo il boot reale (`test/app.int-spec.ts`, che rigenera lo schema).
- **Il piano del cibo è interno:** sotto-documento `ActiveTravelFood` su `status.activeTravel.food` (`src/models/character/active-travel-food.model.ts`), solo Mongoose, nessun `@Field` né `@ObjectType`, come `kind`, `ambush` e `ambushReports`. Campi: `needed`, `uncoveredKm`, `coveredKm`, `hpLostTotal`, `settledKm`, `foodConsumedAt`. Assente sui viaggi partiti prima del deploy e sulle deviazioni dopo una sconfitta.
- **Mutation e query invariate** in nome, argomenti, forma della risposta e codici di rifiuto: `startTravel`, `travelPreview`, `acceptQuest` con `questTravelPreview`, `teleportCharacter`, `characterUpdated`. Cambia solo **quando** il server scrive inventario e vita.
- **Indice nuovo** `character_active_travel_food` `{ deletedAt: 1, 'status.activeTravel.food.settledKm': 1 }` sul modello del personaggio: costruito al boot dal verificatore degli indici di sweep, nessun effetto sul filo.

---

## 2. Semantica nuova per la FE Phase 15

Emenda la nota della FE Phase 15 (`.planning/phases/15-travel-food/15-VERIFICATION.md`, Phase Goal: «inventory and HP change only through the subscription»). **Resta vera**: inventario e vita cambiano solo via `characterUpdated`. Ma ora cambiano anche **durante** il viaggio, non solo alla partenza.

- **(a) Partenza.** Il server calcola il piano con la stessa regola di prima (Phase 14: fabbisogno = ⌈durata / 180 000 ms⌉ power, selezione a scarto minimo, km scoperti in coda) e lo salva; dispensa e vita restano come sono (D-05).
- **(b) Tratto coperto.** Nulla cambia: nessuna scrittura, quindi nessun `characterUpdated` dello sweep.
- **(c) Confine dei km coperti.** Il cibo del piano sparisce **in blocco** con una sola scrittura (D-03), ricalcolato con la stessa selezione sulla dispensa di quel momento. Fail-safe D-19 (irraggiungibile senza modifiche a mano del DB: in viaggio non si vende, non si compra e `useItem` accetta solo le cure): se la dispensa copre meno del piano si mangia ciò che c'è e la curva viene riscritta sulla copertura reale; **i km scoperti della curva nuova già percorsi si pagano in blocco al pasto del confine**, poi la fame prosegue a scatti come per ogni viaggio; il totale è quello della copertura reale.
- **(d) Oltre il confine.** La vita scende di n HP al km scoperto n-esimo, **a scatti di un km** (D-10 rivisto): lo sweep (`TRAVEL_SWEEP_INTERVAL_MS`, default 60 s) controlla ogni minuto e scrive solo quando un km scoperto è stato completato. Un km dura `duration / distance`: a passo base, senza cavalcatura e senza ferite, **un'ora divisa per lo `speedFactor` della strada** (`durationMsOf` in `src/travel/travel-timing.ts`, ore base = km / `speedFactor` in `src/roads/`). Vita mai sotto 1 (`MIN_LIFE_POINTS`). Una pozione bevuta in viaggio si somma e nulla la cancella (D-09): la fame è sempre una perdita incrementale calcolata dalla lettura in transazione.
- **(e) Arrivo.** Fame residua fino a fine percorso e, se il pasto del confine non c'è stato, il cibo del fabbisogno totale, nella transazione del completamento. **I totali a fine viaggio sono quelli di oggi** (stesso cibo, stessi HP dell'anteprima).
- **(f) Sconfitta in imboscata.** Fame fino al km dell'imboscata e, se il pasto non c'è stato, il cibo dei **soli km percorsi** (`foodNeededFor(durata × km / distanza)`, mai più del fabbisogno totale). La deviazione verso la città vicina nasce senza piano: nessun cibo e nessuna fame in più (D-04).
- **(g) Teleport dell'oste a viaggio iniziato.** Chiude il viaggio come una sconfitta: cibo dei km percorsi (se il pasto non c'è stato) e fame fino al km del momento, fermandosi al km di un'imboscata pendente (D-17). Supera la Phase 14 D-13 per questo caso; il salto istantaneo dell'accettazione resta esente (nessun viaggio).
- **(h) `hpBefore` del report d'imboscata (D-18).** È la vita **al km dell'imboscata, fame compresa**: il combattimento parte dalla vita vera di quel punto. La FE oggi anima la barra da `hpBefore` a `hpAfter` (`quest_result_sheet.dart`) e mostra `PV hpBefore → hpAfter` nel riepilogo dell'oste (`completion_recap.dart`) senza etichette «alla partenza»: nessun cambio richiesto, solo la lettura corretta del numero.
- **(i) Viaggi già in corso al deploy (D-11).** Non hanno il piano: hanno già pagato cibo e vita alla partenza con la regola vecchia e arrivano senza cambi.
- **(l) `characterUpdated` senza cambi visibili (dalla review, A-IN-02).** Lo sweep scrive anche in due casi in cui sul filo non cambia nulla: **una volta per viaggio** al confine con la dispensa già vuota (registra solo `foodConsumedAt` e `settledKm`, interni) e **a ogni km scoperto** quando la vita è già a 1 (riscrive 1 e `settledKm`). «Niente `characterUpdated` a vuoto» vale come «non ogni minuto», non come «mai»: la FE riceve un evento identico al precedente e non deve reagire in modo speciale.

---

## 3. Comportamenti provati

Una riga per comportamento: decisione, spec (percorso verificato sulla HEAD), caso principale.

| Comportamento | Decisioni | Spec |
|---------------|-----------|------|
| Piano interno su `ActiveTravel.food`, assente sui legacy, mai sul tipo del filo | D-05, D-10 | `src/models/character/active-travel.schema.spec.ts` («keeps only the food plan fields (D-10)») |
| Curva telescopica: fame cumulata e incrementi che sommano al totale della Phase 14 (griglia di 350 partizioni) | D-01, D-02, D-13 | `src/travel/food/travel-food.spec.ts` |
| Km dal tempo (`travelKmAt`: 0, metà, clamp, durata 0) | D-02 | `src/travel/travel-timing.spec.ts` |
| Assestamento puro: clamp a 1, niente scritture a incremento zero, vita oltre il massimo non abbassata, pasto nei tre momenti, pro-rata alla sosta, fail-safe del confine, piano o `startTime` malformati scartati | D-01, D-03, D-11, D-14, D-15, D-19 | `src/travel/food/travel-food-settlement.spec.ts` |
| Arrivo: fame residua e pasto (b), una volta sola sotto completamenti concorrenti, guardia mancata = transazione abortita e ripresa dallo sweep, legacy invariato | D-01, D-03, D-07, D-11, D-14 | `src/travel/travel-completion.int-spec.ts` (describe «progressive food on arrival (Phase 20)») |
| Sweep: niente nel tratto coperto, pasto al confine una volta, fame a scatti di km, pozione conservata, idempotenza sotto sweep concorrenti, imboscata pendente come limite, legacy ignorato, piano malformato segnalato una volta per viaggio, fail-safe D-19, errore isolato per personaggio | D-01, D-03, D-09, D-11, D-14, D-15, D-16, D-19 | `src/travel/food/travel-food.sweep.int-spec.ts` |
| `TravelSweeper.runOnce` chiama il passo «fame» dopo i completamenti allo stesso istante, errore isolato | D-15 | `src/travel/travel-sweeper.spec.ts` |
| Imboscata, parte pura: fame e pasto al km salvato (mai dall'ora), pasto dei km percorsi alla sconfitta, `hpBefore` fame compresa, guardie in una sola lista, legacy senza path | D-03, D-04, D-07, D-11, D-14, D-16, D-18 | `src/travel/ambush/ambush-food.spec.ts`, `src/travel/ambush/ambush-plan.spec.ts` (describe «progressive food in the ambush plan (Phase 20)») |
| Imboscata sul replica set: vita d'ingresso 945 al km 290 di 400 e piano conservato in vittoria; sconfitta al km 30 col solo cibo dei km percorsi e deviazione senza piano; catalogo del cibo letto in sessione; riga di log D-19 dopo il commit; legacy | D-03, D-04, D-07, D-11, D-14, D-16, D-18, D-19 | `src/travel/ambush/ambush-resolution.int-spec.ts` (describe «progressive food (Phase 20)») |
| Teleport a viaggio iniziato: cibo dei km percorsi e fame fino al momento, dispensa abbondante pro-rata, nessun secondo pasto, stop all'imboscata pendente, legacy e fermo intatti | D-03, D-06, D-11, D-17 | `src/travel/teleport.resolver.int-spec.ts` (describe «progressive food on teleport (Phase 20)») |
| Partenza libera: piano salvato, dispensa e vita intatte, rifiuto e corsa identici, due partenze concorrenti = un piano | D-05, D-13, D-14 | `src/travel/travel.service.int-spec.ts` (describe «food plan at departure (D-05)») |
| Partenza da quest (claim della corsia standard): piano salvato nello stesso update, salto istantaneo e marker senza piano | D-05, D-13, D-14 | `src/quests/acceptance/quest-acceptance.service.int-spec.ts` (describe «food on the automatic travel (D-12)») |
| Fine a fine: partenza vera, sweep a scatti e arrivo danno i totali della Phase 14 (vita 1000 → 934 su R1 con 11 km scoperti, 66 HP; cibo uguale a quello che la Phase 14 mangiava alla partenza) | D-02, D-03, D-13 | `src/travel/travel.service.int-spec.ts` (describe «TravelService progressive food end to end (Phase 20)») |
| Indice dichiarato e costruito al boot | D-15 | `src/models/sweep-indexes.schema.spec.ts`, `src/mongo/sweep-index.verifier.int-spec.ts` |
| Boot reale e SDL identico | D-10, D-11 | `test/app.int-spec.ts` |

---

## 4. Piano di UAT su device con l'app com'è

Per l'orchestratore e l'utente, **dopo** questo piano: **stato «da eseguire»**, nessun esito registrato qui. Nessun esecutore lo esegue né tocca il DB reale.

**Prerequisiti**

- Riavvio del BE dal ramo a cura dell'orchestratore (build a BE fermo: `deleteOutDir` cancella `dist/`); app costruita dalla HEAD attuale del repo FE (nessun cambio FE).
- **Nessun migratore, nessun seeder.** L'indice `character_active_travel_food` lo costruisce al boot il verificatore degli indici di sweep: controllarne la presenza dopo il riavvio.
- Identità di test `<twitchId di test>`, personaggio `<characterId>`; città di partenza e destinazione `<poiId>`.
- Solo i viaggi partiti **dopo** il riavvio hanno `status.activeTravel.food`: le prove 1–6 vanno fatte su viaggi nuovi.
- **Tempi reali:** a passo base un km dura un'ora divisa per lo `speedFactor` della strada (§2 d). Per vedere confine e scatti in tempi da UAT l'orchestratore sposta indietro `status.activeTravel.startTime` **e** `status.activeTravel.endTime` dello stesso intervallo, con `duration` invariata (come nella Phase 15, handoff §6 d: il job Bull resta orfano, lo sweep completa comunque su `endTime`). Lo sweep successivo paga in una sola scrittura tutti i km scoperti superati con lo spostamento (somma identica, D-13); per vedere gli scatti uno a uno spostare di un km alla volta (`duration / road.distance` ms per km). Mai scrivere a mano dentro `status.activeTravel.food` né aggiungerlo a un viaggio che non lo ha.

**Passi (uno per messaggio durante la UAT)**

1. **Viaggio lungo con poco cibo.** Personaggio in città con poche unità di cibo, così che una parte della strada resti scoperta ma la vita basti (un rookie da 1000 HP regge al massimo 44 km scoperti; la curva della Phase 14 dà 16 km → 136 HP, 50 → 1 275). Aprire l'anteprima: mostra cibo e HP persi come prima. Partire. **Atteso:** subito dopo la partenza dispensa (Diario) e vita (scheda del personaggio) **invariate**; a DB `status.activeTravel.food` presente con `settledKm` 0 e `foodConsumedAt` `null`, e `needed` / `uncoveredKm` / `hpLostTotal` coerenti con l'anteprima.
2. **Confine dei km coperti.** L'istante si calcola dal documento: `startTime + duration × coveredKm / road.distance`. **Atteso:** entro un intervallo di sweep dal confine il cibo del piano sparisce in blocco dal Diario, senza azioni dell'utente; a DB `foodConsumedAt` valorizzato; nessuna fame prima del confine.
3. **Fame a scatti.** Oltre il confine la vita scende nella scheda del personaggio a ogni km scoperto completato (1, poi 2, poi 3 HP…), mai sotto 1. Bere una pozione in viaggio (Diario): la vita sale e la fame continua da lì, senza cancellare la cura. **Atteso:** `settledKm` cresce a ogni scrittura; nessuna scrittura fra un km e l'altro.
4. **Arrivo.** **Atteso:** vita persa totale per fame = gli HP dell'anteprima del passo 1 (al netto della pozione del passo 3); dispensa finale uguale a quella che la Phase 14 lasciava alla partenza; `activeTravel` `null`, posizione = destinazione.
5. **Sconfitta seminata al km 30.** Su un viaggio nuovo col piano, di almeno 31 km, appena partito: l'orchestratore semina l'intero sotto-documento `status.activeTravel.ambush` = `{ at: <istante nel passato fra startTime e adesso>, km: 30, attempts: 0 }`, come nelle UAT della Phase 15 (handoff della Phase 15, §6 a), su un personaggio destinato alla sconfitta (§6 b di quel handoff; ricontrollare sul codice corrente del combattimento come forzarla). L'imboscata si assesta al `km` salvato, non all'ora. **Atteso:**
   - con `coveredKm` > 30: tolto **solo il cibo dei 30 km** (`foodNeededFor(duration × 30 / road.distance)` power, con la selezione a scarto minimo), nessuna fame;
   - con `coveredKm` < 30: tolto il cibo del piano al confine e la fame dei km scoperti fino al km 30;
   - la deviazione verso la città vicina non toglie altro cibo né vita (a DB il nuovo `activeTravel` è senza `food`);
   - il foglio d'esito anima la barra da `hpBefore` = **vita al km 30** (fame compresa) a `hpAfter`.
6. **Teleport dell'oste a metà viaggio.** Su un viaggio nuovo col piano, l'oste usa `teleportCharacter` verso `<poiId>`. **Atteso:** tolto il cibo dei km percorsi (se il confine non era ancora passato) e la fame fino al km del momento; viaggio chiuso, posizione aggiornata.
7. **Viaggio già in corso prima del riavvio (se c'è).** **Atteso:** arriva senza cambi (nessun `food`, nessuna fame o cibo in più all'arrivo).

**Diagnosi suggerita**

- A DB: il sotto-documento `status.activeTravel.food` del personaggio (`settledKm`, `foodConsumedAt`, e `uncoveredKm` / `coveredKm` / `hpLostTotal` se il fail-safe D-19 li ha riscritti), con `status.currentLifePoints` e `assets.ownedItems`.
- Log del BE (solo id, conteggi e codici):
  - `Sweep della fame: <n> viaggi assestati` (solo se n > 0);
  - `Fame del viaggio del personaggio <id> fallita: <nome>[, code <n>]`;
  - `Viaggio del personaggio <id>: piano del cibo non valido, ignorato` (una volta per viaggio, memoria di 1 000 viaggi);
  - `Viaggio del personaggio <id>: cibo cambiato al confine, km scoperti X → Y` (sweep e imboscata, dopo il commit; arrivo e teleport non riscrivono la curva e non la loggano);
  - `Sweep della fame fallito: <nome>[, code <n>]`, `Sweep dei viaggi fallito: …`, `Completamento del viaggio del personaggio <id> fallito: …` (ora tutti con `describeError`, per esempio `Error, code 112` invece del solo `112`);
  - `Imboscata <jobId> risolta: won` / `Imboscata <jobId> risolta: lost verso <città>`, `Viaggio <jobId> completato`.

---

## 5. Domande aperte e deviazioni

**Domande per la FE: nessuna.**

- **D-10:** nessun campo nuovo e nessuna riga in app: la FE non deve fare nulla; l'unico testo da emendare è la nota della Phase 15 (§2), che resta vera nella sostanza.
- **D-18:** la FE non etichetta `hpBefore` come «vita alla partenza» (barra animata e `PV hpBefore → hpAfter`): nessun cambio di testo serve.

**Deviazioni e scelte annotate durante l'esecuzione**

- **Passo dei km (C-3):** la ricerca e il piano 20-11 stimavano «circa ogni 6 minuti a passo base»; il codice dice un'ora per km a passo base e `speedFactor` 1 (`durationMsOf`, ore base = km / `speedFactor`). Questo handoff usa il valore del codice; la regola di gioco non cambia, cambia solo la frequenza attesa degli scatti in UAT.
- **Casi verdi al primo colpo** (motivati nei SUMMARY): legacy all'arrivo (20-03), `hpBefore` fame compresa, vittoria nel tratto coperto, nessun secondo pasto alla sconfitta e legacy nel piano dell'imboscata (20-05), legacy dell'imboscata sul replica set (20-06), legacy e fermo del teleport (20-07), i builder di partenza e claim e le due prove fine a fine (20-08, 20-09).
- **Spec riscritte oltre l'elenco della ricerca:** le tre D-01 di `travel.service.int-spec.ts` con l'helper `eatenAtDeparture` (diventato `neededAtDeparture`) e «feeds the slower march of an injured character (D-01)» di `quest-acceptance.service.int-spec.ts` (ora «saves the food need of the slower march of an injured character (D-01, D-05)»); il caso del teleport Phase 14 D-13 sostituito da casi a viaggio seminato; la chiave `food` aggiunta alla lista pinnata di un caso Phase 15 della partenza libera.
- **Scelte del planner accettate dall'orchestratore:** il piano viaggia come `FoodLeg` validato da `foodLegOf` (un piano malformato vale «nessun piano»); builder separato per i path del piano; D-19 solo al pasto del confine (momento `progress`); arrivo con guardia mancata = transazione abortita e ripresa dallo sweep; il teleport legge la dispensa in sessione.
- **Fix della review (interni, nessun effetto sul filo):** `foodLegOf` scarta uno `startTime` non valido; `COMPLETION_PROJECTION` legge anche `startTime`; una sola `FOOD_LEG_PROJECTION`; `planFor` restituisce solo il piano (`PlannedMeal` rimosso); il catalogo del cibo dell'imboscata si legge in sessione; log cambiati come al §4.
- **Chiuso dall'orchestratore il 2026-11-13:** `npm run test:cov` completo verde (415 suite / 5 628 test, 609 s, soglie rispettate); verifica `passed` 14/14 (`20-VERIFICATION.md`); audit di sicurezza `secured`, 50 minacce: 47 chiuse, 2 accettate, 1 trasferita alla UAT, nessuna aperta (`20-SECURITY.md`, con quattro note non bloccanti N-20-01..04).
- **Restano all'orchestratore:** build e riavvio reale del BE dal ramo, UAT su device (§4), PR verso `develop`.
