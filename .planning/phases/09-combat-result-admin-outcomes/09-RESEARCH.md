# Phase 9: Combat Result & Admin Outcomes - Research

**Researched:** 2026-10-24
**Domain:** chiusura del ciclo di vita delle quest sul backend NestJS 11 / Mongoose 8.18.1 / Apollo code-first (@nestjs/graphql 13.2.0) / Bull 4.16.5: risoluzione server-side alla scadenza (job differito + reconciler + sweep), porta `CombatResolver` con regole segnaposto, applicazione atomica degli esiti in `connection.transaction`, catena aid/morte, tabelle XP/livello/HP, loot a cascata, entità dei risultati con consegna ibrida (change stream → subscription owner-only, push `questEnd`, query di requery), coda live dell'innkeeper con completamento GM, guard `SHOP_NOT_IN_CITY`.
**Confidence:** HIGH sul codice (letture `file:riga`), HIGH sulle forme Mongoose/GraphQL e sui meccanismi Nest/Bull (tre sonde usa-e-getta eseguite sull'harness e cancellate), HIGH sui dati di sviluppo (due script di sola lettura, soli aggregati). MEDIUM sulle scelte di dettaglio non decise dall'utente (messaggi dei codici, nomi, valori segnaposto), tutte marcate.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions


### Chi risolve gli esiti e quando (BE-COMBAT-03 emendato, BE-ADMIN-02 emendato)
- **D-01 (utente):** **Corsia standard risolta server-side alla scadenza** del countdown (`PendingQuest.startDate + waitingTime`; con `startDate` nullo — personaggio in viaggio — la scadenza non è ancora definita e la quest aspetta l'arrivo, che scrive `startDate` = `endTime` pianificato per Phase 8 D-13). Stesso schema del viaggio: **il DB è la fonte di verità**, job Bull differito come trigger idempotente (jobId deterministico), **reconciler al boot** e **sweep periodico** (env opzionale, pattern `TRAVEL_SWEEP_INTERVAL_MS`), timeout sulle chiamate alla coda (riuso `QUEUE_CALL_TIMEOUT_MS`). Quest **senza nemico** (`infos.enemy` nullo: job, heal, study e qualunque altra) → **successo automatico** con premi. Quest **con nemico** (enemy, boss, dungeon, hunt, aid quando hanno `infos.enemy`) → risolte dal **motore di combattimento** (D-02). Story e worldMission non scadono mai da sole (D-03).
- **D-02 (utente):** **Il motore di combattimento e le regole delle ferite sono dell'utente** e arriveranno in seguito ("Tu predisponi soltanto in modo che poi io possa dirti l'algoritmo e le regole in futuro"). La fase consegna una **porta** (es. `CombatResolver`, classe astratta DI come `PushTransport`): input = contesto puro e già idratato (partecipanti con status, equipaggiamento indossato con danni, magie attive con usi residui, ferite, consumabili posseduti; nemico con lifePoints/damages/debolezze/xp; quest), output = **un `ParticipantOutcome` per partecipante** `{ outcome: success | failure, hpAfter (≥ 1), injuriesAdded, consumablesUsed, spellsUsed }`, deterministico dato un RNG iniettato. Implementazione **segnaposto provvisoria** (`PlaceholderCombatResolver`, nome a discrezione): regola semplice e deterministica (es. confronto fra potenza del gruppo e del nemico, HP persi proporzionali ai danni del nemico, mai sotto 1, ferite e consumi con probabilità fisse), dichiarata provvisoria nel codice e nel handoff e sostituibile senza toccare ciclo di vita, applicazione dell'esito, consegna o test di contratto. Stessa cosa per la **tabella dei malus delle ferite** (`InjuryType` → `InjuryEffect` → malus su danni/HP effettivi/velocità): modulo puro con valori segnaposto. Nessuna regola nascosta altrove: tutto ciò che è "formula" vive in questi due moduli.
- **D-03 (utente):** **Story e worldMission: solo il GM, solo esito positivo** ("l'esito delle quest story e worldMission può essere solo positiva"). Niente rifiuto, niente rimborso, niente timeout: la richiesta resta in coda finché il GM non la completa. Il **grade** sparisce dal contratto (BE-COMBAT-03 e FE ADMIN-05 emendati nel primo piano: il GM non sceglie mostri/grade/premi a runtime; mostri e premi sono dati di catalogo).
- **D-04 (utente):** Mutation del GM, `@Roles(innkeeper)` con audit automatico (Phase 3): es. `completePendingRequest(input: { pendingQuestId, outcomes?: [{ characterId, hpAfter?, injuries?, consumablesUsed?, spellsUsed? }] })` (nomi a discrezione). **Premi e XP dal catalogo**; senza override HP intatti e nessuna ferita; con override il GM racconta il combattimento della live. **Una chiamata chiude la worldMission per tutti i registrati**, con **un risultato per personaggio, ciascuno potenzialmente diverso** (HP, ferite, consumi); la story riguarda un solo personaggio. Effetti: corsia svuotata (`activeStoryQuest`/`activeWorldMissionQuest` = null), `completedQuests` cresce, la worldMission **sparisce per tutti** (D-06), il titolo avanza per la story (D-14), premi/XP/livello applicati (D-11/D-12/D-16). Override su un personaggio non registrato o `hpAfter` fuori da `1..maxLifePoints` → rifiuto tipizzato senza scritture.
- **D-05 (utente):** **Boss = combattimento di gruppo**: si risolve quando **tutti i registrati** hanno finito il countdown (il trigger che trova tutti scaduti risolve; se qualcuno è ancora in viaggio o nel countdown si attende; **non** aspetta che gli slot si riempiano). Il motore riceve tutti i partecipanti e restituisce **un risultato per ciascuno, potenzialmente diverso anche nell'esito** ("worldMission e boss devono poter restituire un risultato diverso ad ogni personaggio che ha partecipato"). enemy e aid hanno un solo registrato; hunt e dungeon sono individuali alla propria scadenza e **ripetibili** (restano sulla board, nessuna registrazione, Phase 7 §3).
- **D-06:** **Successo di una quest registrata non ripetibile** (enemy, boss, worldMission, aid) → la quest **sparisce dalla board per tutti**: marcatore globale sulla `Quest` (es. `concludedAt`, nullable, interno o esposto a discrezione) e `quests`/`quest(id)` filtrano le concluse (la FE Phase 6 non mostra ciò che non riceve). **Fallimento** → posto liberato (`$pull` da `registeredAdventurers`), quest di nuovo disponibile, nasce la aid (D-08). Un personaggio che fallisce **non** entra in `completedQuests`.

### Fallimento, soccorso (aid) e morte (Phase 8 D-29/D-30 realizzate)
- **D-07 (utente):** **HP minimo 1**: il motore non uccide mai direttamente. Il fallimento di un combattimento mette il personaggio **"in attesa di soccorso"**: corsia standard svuotata (`pendingQuest` = null, PendingQuest risolto), **stato esplicito sul Character** esposto sul filo (es. `status.awaitingAid { quest, aidQuest, since }`, nullable, default null) che **blocca `startTravel`/`travelPreview` e `acceptQuest`** con un codice nuovo (es. `AWAITING_AID`) ma **non il teleport** del GM; HP ridotti dall'esito; resta sul marker della quest.
- **D-08 (utente):** **Quest aid automatica = clone della quest fallita**: stesso `infos.markerLocation`, `infos.enemy`, `requirements.minTitle`, `infos.timeToComplete`, stessi `prizes` dell'originale; `infos.type: aid`, `infos.title: "Soccorso: <titolo originale>"`, `requirements.requiredAdventurers: [{ title: null, count: 1 }]`, `requiredPoints: null`, `registeredAdventurers: []`, più un riferimento al personaggio da soccorrere (campo nuovo, es. `rescue { character, failedQuest }`, esposto se serve alla board). **Una aid per ferito.** Dopo un fallimento la aid **sparisce per sempre** (conclusa, D-06) e il suo soccorritore diventa a sua volta ferito con una **nuova aid** (catena, D-09). Una aid non è mai ripetibile né riproposta.
- **D-09 (utente):** **Aid riuscita:** il ferito è liberato (`awaitingAid` = null) **con gli HP che ha, nessuna cura**, e viene **riportato automaticamente nella città** del marker (`status.location` = `City.markerLocation` della città i cui `pointsOfInterest` contengono il marker; nessun viaggio, nessuna push di viaggio); riceve un risultato di tipo "soccorso" (D-19). Il soccorritore riceve i premi della aid e il proprio risultato. **Aid fallita:** il ferito **muore** — `CharacterDeletionService.archiveCurrentCharacter(userId, DeletionReason.death)` (03.1, libera già i posti su ogni quest) — e riceve un risultato di tipo "morte"; il soccorritore diventa "in attesa di soccorso" con una nuova aid clonata dalla quest **originale** (stesso nemico) riferita a lui.
- **D-10 (utente):** **Timeout del soccorso: 7 giorni** dalla creazione della aid senza esito → **morte** del ferito (stessa routine di D-09) e aid conclusa. Trigger con lo stesso meccanismo di D-01 (job differito + reconciler + sweep). Costante in codice (env opzionale a discrezione, mai obbligatoria).

### Progressione e ricompense
- **D-11 (utente):** **XP** = `prizes.xpPrize` della quest + `Enemy.xp` del nemico sconfitto (quest senza nemico: solo `xpPrize`; combattimento perso: 0). **XP massima 50 000** (clamp).
- **D-12 (utente):** **Livelli 1–20 e HP massimi** da una tabella unica in un modulo puro (come `ACTIVE_SPELL_SLOT_THRESHOLDS`), valutata nello stesso update dell'esito (tabella `$switch` in pipeline oppure calcolo applicativo con filtro condizionale — a discrezione, purché non esista un secondo scrittore di `level`/`maxLifePoints`). Soglie XP (curva triangolare, ~263 XP in più per livello): L1 0 · L2 250 · L3 800 · L4 1600 · L5 2650 · L6 3950 · L7 5500 · L8 7350 · L9 9450 · L10 11850 · L11 14450 · L12 17350 · L13 20550 · L14 23950 · L15 27650 · L16 31600 · L17 35800 · L18 40250 · L19 45000 · L20 50000. HP massimi sulla stessa curva: 1000 · 1200 · 1600 · 2250 · 3050 · 4100 · 5300 · 6750 · 8400 · 10250 · 12300 · 14550 · 17000 · 19700 · 22550 · 25650 · 28900 · 32400 · 36100 · 40000. **HP iniziali 1000** (`STARTING_LIFE_POINTS` di Phase 02.1 da 100 a 1000; i personaggi e i nemici già a DB li adatta l'utente). **Nessuna cura al level up**: salgono solo i massimi, `currentLifePoints` resta quello dopo l'esito (clamp al nuovo massimo).
- **D-13 (utente):** **Slot magia solo dal rango mage**: `maxActiveSpells` = 0 sotto il titolo `mage`; da `mage` in su valgono le soglie XP attuali (20k→1, 25k→2, 30k→3, 40k→4). Virtual e filtro di `equipSpell` cambiano insieme (Phase 4 D-11); le magie già attive di chi non è mage (caso teorico) restano a discrezione (nessun dato a DB).
- **D-14 (utente):** **Titolo:** avanza al successivo **solo completando la story del titolo esatto** (rookie → adventurer → paladin → mage → hero → legend; `legend` resta). Nessun avanzamento per XP.
- **D-15 (utente):** **Ferite:** assegnate dal motore (regole utente, segnaposto) e dal GM (override di D-04). **Pesano nel combattimento** (tabella malus di D-02, segnaposto) e **alcune rallentano il viaggio** (`InjuryEffect.movementImpairment` → fattore sulla velocità in `TravelPlanner`, valore segnaposto, fotografato alla partenza come il pet, Phase 8 D-09). Una quest **`heal` completata toglie tutte le ferite e riporta gli HP al massimo**. Le ferite restano narrative nel profilo (InjuryType, già sul filo).
- **D-16 (utente):** **Premi:** `prizes.prizeCoins` → `Character.coins` via `WalletService.applyCharacterCoinsDelta` (unico scrittore dei saldi); `prizes.prizeItem` → inventario (`ownedEquipments`/`ownedItems` per `itemType`, quantità intera, `$inc` sulla riga esistente o `$push`); `prizes.randomLoot` → **cascading rolls**: ordinare le voci per rarità decrescente (rarità assente sull'item = `common`); partendo dalla **rarità più alta presente** tirare con il drop rate di quella rarità; se il tiro fallisce scendere alla rarità inferiore **presente**; se riesce estrarre **a caso una voce di quella rarità** (quantità intera della voce); se tutti i tiri falliscono **nessun loot**. **Al massimo un oggetto.** Drop rate per rarità: tabella in codice, **default tecnico** (esempio dell'utente: legendary 2%; proposta common 60 · uncommon 35 · rare 15 · ultrarare 5 · legendary 2), RNG iniettabile per i test. Il risultato registra cosa è uscito.
- **D-17 (utente):** **Study e magie:** "Puoi studiare ovunque, ma solo a Valantar puoi imparare magie. Studiare altrimenti dà come reward xp." Realizzazione: campo nuovo **`prizes.spell`** (ref `Spell`, nullable) sulle quest; una `study` completata con `prizes.spell` e `status.xp ≥ spell.minXpToLearn` (XP valutata **dopo** l'aggiunta di `xpPrize`, a discrezione documentata) aggiunge la magia a `status.spells` (se non già nota) e il risultato porta `spellLearned`; altrimenti solo XP. **Nessun controllo di città nel codice**: il catalogo mette `prizes.spell` solo sulle study di Valantar. `requiredLearnTime` della Spell resta inutilizzato (il tempo è `timeToComplete` della quest).
- **D-18 (utente, richiesta FE Phase 7):** **Guard del negozio:** `doTransaction` rifiuta con un codice nuovo (es. `SHOP_NOT_IN_CITY`, messaggio italiano) quando `status.location` non è il `markerLocation` di una città, oppure `activeTravel` è presente, oppure il personaggio è in attesa di soccorso. Pre-verifica + riaffermazione nel filtro dell'update (Phase 4 "il filtro è la regola").

### Contratto di consegna (BE-COMBAT-01/02)
- **D-19 (utente):** **Un solo tipo di risultato per ogni esito**, combattimento o no — entità persistita (nome a discrezione, es. `QuestResult`; il requisito la chiama `CombatResult`), **una per personaggio partecipante**: `{ id, character: ID, user: ID, quest { id type title }, kind (success | failure | rescued | death | gmCompleted… a discrezione, enum stabile), resolvedAt, hpBefore, hpAfter, maxLifePoints, injuriesAdded: [InjuryType], consumablesUsed: [{ item, quantity }], spellsUsed: [{ spell, usages }], rewards { coins, items: [{ item, quantity }] (prizeItem + loot estratto) }, xpGained, xpBefore, xpAfter, levelBefore, levelAfter, titleBefore, titleAfter, spellLearned?, enemy? }`; campi definitivi a discrezione del planner purché coprano FE COMBAT-02..05 e il foglio esiti possa dire anche "soccorso", "morte", "quest completata dal GM". Popolati sul filo come il catalogo quest (D-31 Phase 8); orfani tollerati.
- **D-20 (utente):** **Consegna ibrida:** (a) **subscription dedicata owner-only** (es. `questResultReceived(characterId)`: proprietario del personaggio; innkeeper esente come `characterUpdated`, filtro per evento fail-closed, **senza snapshot** alla subscribe — i risultati passati si leggono con la query) che emette il payload completo alla creazione (change stream sulla collection dei risultati o publish dopo il commit, a discrezione); (b) **query `questResult(id)`** owner-only per il requery (il proprietario resta l'**utente**: leggibile anche quando il personaggio è archiviato per morte) e, a discrezione, una lista `questResults` del personaggio; (c) **push `questEnd` con `id` = id del risultato** (emenda il handoff Phase 5 §2 dove `id` = pendingQuestId: a esito avvenuto il PendingQuest non esiste più), best-effort dopo il commit, a **ogni** partecipante, anche per il soccorso e per la **morte** (al defunto). Nessun tipo push nuovo, nessun toggle nuovo lato FE.
- **D-21:** **Applicazione atomica dell'esito**, una transazione per personaggio-esito con il pattern Phase 4: update condizionale del `Character` (filtro: attivo, `pendingQuest` = quello atteso o corsia attesa, versione del documento se serve) che scrive HP/ferite/inventario/magie/XP/livello/titolo/`awaitingAid`/`completedQuests`/corsia; insert del risultato; eliminazione (o archivio, a discrezione documentata) del `PendingQuest`; update della `Quest` (`$pull` registrazione, marcatore `concludedAt`, creazione della aid); `WalletService` per le monete nella stessa session; push dopo il commit. Trigger idempotenti: job/sweep duplicati o obsoleti sono no-op; il boss di gruppo risolve una sola volta (claim atomico sulla Quest o sui PendingQuest coinvolti).

### Coda del GM (BE-ADMIN-01)
- **D-22 (utente):** **Query `pendingRequests`** (`@Roles(innkeeper)`) e **subscription `pendingRequestsUpdated`** (`@Roles(innkeeper)`, **snapshot alla subscribe** come `userUpdated`, **lista completa a ogni cambiamento**) che elencano le `PendingQuest` delle corsie story e worldMission: per ogni voce pendingQuest (`id`, `startDate`, `pointsSpent`), quest (`id`, `type`, `title`, slot e registrati per la worldMission), personaggio (`id`, nome, titolo, `status.location`, `status.activeTravel`, `status.awaitingAid`) e utente (`id`, `twitchId`). Una voce per personaggio (una worldMission con tre registrati = tre voci; raggruppamento a discrezione del FE). Alimentata dal change stream della collection `pendingquests` (inserimento/eliminazione) e ricalcolata per intero a ogni evento; i cambi di `activeTravel` del personaggio arrivano con il populate all'emissione successiva o dalla `characters` dell'innkeeper (il FE può incrociare). Solo innkeeper: un adventurer riceve `FORBIDDEN` alla subscribe (pattern Phase 3).
- **D-23:** Audit automatico (interceptor Phase 3) sulla mutation di completamento; whitelist del boot reale (`test/app.int-spec.ts`) aggiornate: innkeeper (`pendingRequests`, `pendingRequestsUpdated`, `completePendingRequest`), owner-only (`questResult`, `questResultReceived`), nessun handler pubblico nuovo.

### Default tecnici
- **D-24 (default tecnico):** Scheduling: coda Bull dedicata (es. `quest-resolution`) con job `resolve` alla scadenza del countdown (jobId deterministico `quest-<pendingQuestId>-<startMs>`) e job `aid-timeout` (jobId `aid-<questId>`), reconciler al boot, sweep con env opzionale (es. `QUEST_SWEEP_INTERVAL_MS`, vuota = 60 000, 0 = off, fail-closed sul formato come `TRAVEL_SWEEP_INTERVAL_MS`), `removeOnComplete`, timeout di coda riusato, job in anticipo = no-op (C10 Phase 8). Il viaggio automatico da quest accoda il job di scadenza al suo completamento (quando scrive `startDate`), non all'accettazione.
- **D-25 (default tecnico):** **TDD.** Unit sui moduli puri: tabella livelli/HP (soglie, clamp 50 000, nessuna cura), slot magia con titolo, cascading rolls (ordine delle rarità, discesa, estrazione, nessun loot, RNG iniettato), premi (coins, item, quantità), spell learning (minXpToLearn, già nota), clone della aid, tabella malus (segnaposto) e fattore di viaggio, resolver segnaposto (deterministico con RNG fisso, HP ≥ 1), filtri/update builder, selezione delle scadenze, boss "tutti scaduti". Integration sul replica set (`createCharactersTestApp`/`createAuthTestApp`, fixture esistenti + fixture `Enemy`/risultato): job alla scadenza → quest senza nemico completata con premi, XP, livello, risultato, push `questEnd` con id del risultato (FakePushTransport), subscription owner-only che emette e `FORBIDDEN` per gli altri; combattimento vinto/perso col resolver sostituito da un fake nei test (il fake decide l'esito) → `awaitingAid`, aid clonata, `startTravel`/`acceptQuest` → `AWAITING_AID`, teleport ammesso; aid riuscita → ferito liberato e in città, soccorritore premiato; aid fallita → morte (archivio, posti liberati, risultato "morte", push), nuova aid al soccorritore; timeout 7 giorni → morte; boss con due registrati → attende l'ultimo, un risultato ciascuno, esiti diversi dal fake; hunt ripetibile resta sulla board, enemy conclusa sparisce da `quests`; story completata dal GM → titolo successivo, corsia vuota, `completedQuests`; worldMission completata con override per personaggio → tre risultati diversi, quest sparita per tutti; override su personaggio non registrato → rifiuto senza scritture; `pendingRequests`/`pendingRequestsUpdated` innkeeper con snapshot, lista completa, `FORBIDDEN` per adventurer; `doTransaction` fuori città/in viaggio/in attesa di soccorso → `SHOP_NOT_IN_CITY`; `study` con `prizes.spell` → magia appresa o solo XP; `heal` → ferite azzerate e HP al massimo; trigger duplicato/obsoleto → no-op; reconciler al boot e sweep; real boot: whitelist, SDL additivo salvo emendamenti dichiarati, `grade` assente dallo schema. Processor test senza change stream (Phase 1 D-06), attesa job via polling.
- **D-26 (default tecnico):** Tooling (Phase 8 D-23): `npx prettier --write <file>` + `npx eslint <file>` solo sui file toccati, jest con i percorsi prima di `--selectProjects`, integration `--runInBand`, lint filtrato, `git diff --exit-code src/schema.gql`; nessuna riscrittura della storia git; STATE via python UTF-8/Edit.
- **D-27 (default tecnico):** Handoff **`BACKEND-NOTES.md`** di fase per la **FE Phase 9** (foglio esiti: SDL del risultato, subscription, query, push `questEnd` con id del risultato, tipi di esito, "soccorso"/"morte", popup di morte → creazione personaggio), la **FE Phase 10** (coda `pendingRequests`/`pendingRequestsUpdated`, `completePendingRequest` con override, `teleportCharacter` già pronto, `awaitingAid`), la **FE Phase 7** (codice `SHOP_NOT_IN_CITY`, blocco `AWAITING_AID` del viaggio), con i dati a DB per la UAT (HP 1000 sui personaggi, nemici riscalati, `prizes.spell` sulle study di Valantar, rarità sugli item, una quest per tipo), la sezione "regole segnaposto" (cosa l'utente dovrà sostituire e dove) e note per la Phase 10 (indici, validazione input).
- **D-28 (default tecnico):** Branch **`feat/09-combat-result-admin-outcomes`** da `develop` (template `feat/{phase}-{slug}`; la riga Branch della ROADMAP `feat/09-combat-admin` va allineata), PR a `develop`. Nessuna dipendenza da una PR FE. Contratto SDL **additivo** salvo gli emendamenti dichiarati (nessuna rimozione prevista; se il planner deve rimuovere una riga, la dichiara come Phase 8 D-20). Lo schema si rigenera dal boot reale e viene committato.
- **D-29 (default tecnico):** **Nessuna migrazione e nessun seed:** i documenti legacy leggono i default (`awaitingAid` null, `concludedAt` null, `prizes.spell` null); l'utente adatta a mano i dati (HP iniziali/attuali a 1000, `Enemy.lifePoints`/`damages` alla nuova scala, `rarity` sugli item, `prizes.spell` sulle study di Valantar); il handoff documenta i comandi `mongosh` come in Phase 8 §11.

### Claude's Discretion
- Regola del resolver segnaposto, valori della tabella malus e del fattore di rallentamento, drop rate per rarità (partendo da legendary 2%), ordine XP→spell learning, nomi di entità/campi/operazioni/codici (`QuestResult` vs `CombatResult`, `awaitingAid`, `concludedAt`, `AWAITING_AID`, `SHOP_NOT_IN_CITY`), eliminazione vs archivio del `PendingQuest`, change stream vs publish per la subscription dei risultati, raggruppamento delle voci della coda, env opzionali, split in wave (contratto SDL + tabelle pure in Wave 1 così la FE Phase 9 può partire sullo schema).

### Deferred Ideas (OUT OF SCOPE)

- **Formula del combattimento e regole delle ferite** — dell'utente, arriveranno in seguito come quick task o fase dedicata ("Phase 9.x: regole del motore"): sostituiscono il resolver segnaposto e la tabella malus senza toccare il resto.
- **Rifiuto con rimborso di story/worldMission** — escluso dall'utente (solo esito positivo, nessun rimborso).
- **Timeout su story/worldMission** — escluso (restano in coda).
- **Cura al level up** — esclusa.
- **Slot magia per titolo o per livello** — scartati (restano le soglie XP, gate su mage).
- **Combat log round-per-round** — BE-FUT-04.
- **Admin CRUD di quest/nemici/POI/strade** — fuori milestone (dati a DB).
- **Riconciliazione/refund EventSub** — BE-FUT-05.
- **Indici** sui campi di scadenza (`pendingquests.startDate`, aid `since`) e validazione input — Phase 10.
- **Loot con più oggetti o tiri indipendenti** — scartato (al massimo un oggetto).

### Reviewed Todos (not folded)
None — no pending todos matched this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-COMBAT-01 | Entità `CombatResult` persistita: HP prima/dopo, consumabili usati, spell usate, injuries, rewards (equipment/items/coins), XP → FE COMBAT-02..05 | Q2 (forma della collection `questresults`, ref castati, `AssetQuantity` con `refPath` assoluto provato), Q3 (valori before/after calcolati nello stesso passo applicativo), Q4 (insert nella transazione dell'esito), "Contratto SDL proposto" |
| BE-COMBAT-02 | Delivery ibrida: subscription col payload completo, push con il solo `resultId`, query di requery → FE COMBAT-01 | Q2 (change stream `insert` con `fullDocument` provato), Q5 (policy owner per **utente**, filtro per evento su `result.user`, morte), Q6 (`questEnd(resultId)`, `sendToUser` sul `user` del risultato) |
| BE-COMBAT-03 (emendato) | Esiti server-side per la corsia standard + completamento GM di story/worldMission (nessun grade), Character aggiornato atomicamente | Q1 (scheduler/processor/sweeper sul modello Phase 8), Q3/Q4 (transazione unica per esito o per gruppo), Q8 (porta `CombatResolver`), Q7 (modelli, enemy, rarità) |
| BE-ADMIN-01 | Vista live (query + subscription) delle pending request story/worldMission con i dati per il filtro FE su `activeTravel` | Q2 (change stream `pendingquests` con `delete` senza `fullDocument`: ricalcolo dalla collection `characters`), Q5 (`@Roles` su `@Subscription` provato: `FORBIDDEN` per l'adventurer) |
| BE-ADMIN-02 (emendato) | Solo "completa", role-guarded e audit-loggato, override per personaggio | Q5 (interceptor di audit: `target { type: <ritorno>, id: null }`, args completi), Q4 (validazione override prima della scrittura) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Stack non negoziabile: NestJS 11 + Mongoose 8 + Apollo code-first + Bull/ioredis. **Nessuna dipendenza nuova** (nessuna è necessaria: verificato).
- Backend fonte di verità: ogni valore di esito (HP, XP, livello, loot) calcolato server-side; il client manda solo id e override GM.
- Compatibilità FE: contratto GraphQL **additivo**; le aggiunte vanno su staging prima delle fasi FE che le consumano (Wave 1 = contratto).
- TDD obbligatorio (Red → Green → Refactor); Clean Code, SoC, Boy Scout Rule.
- Branch + PR verso `develop` (branch corrente `feat/09-combat-result-admin-outcomes`); Conventional Commits con scope `phase-9`; nessun push diretto.
- Nessun secret in repo; `.env.example` aggiornato con le variabili opzionali nuove.
- Convenzioni: `{feature}.service.ts`, `{feature}.resolver.ts`, `{feature}.processor.ts`; import assoluti `src/...`; messaggi utente in italiano, codici in `extensions.code`; ref nei `@Prop` nuovi come `MongooseSchema.Types.ObjectId`.
- GSD: lavoro solo dentro un comando GSD (`/gsd-execute-phase`).
- Tooling (D-26): mai `npm run lint` (riscrive il repo); `npx prettier --write <file>` + `npx eslint <file>` sui soli file toccati; jest con i percorsi **prima** di `--selectProjects`; integration `--runInBand`; `git diff --exit-code src/schema.gql` in CI.

## Summary

Tutte le decisioni D-01..D-29 sono implementabili con lo stack attuale e **senza dipendenze nuove**. Il modello del viaggio della Phase 8 (`TravelScheduler` + `TravelCompletionProcessor` + `TravelSweeper` + `travel-config.ts`) si replica 1:1 per la coda `quest-resolution`; le sonde hanno confermato le forme Mongoose/GraphQL necessarie (sotto-documento nullable `awaitingAid`, collection dei risultati con ref castati e `AssetQuantity` popolabile via `refPath` assoluto, change stream sulla nuova collection e su `pendingquests`), che `@Roles(innkeeper)` funziona su una `@Subscription` WS (adventurer → `FORBIDDEN`, innkeeper → snapshot) e che la stessa coda Bull registrata in due moduli è **la stessa istanza** (il modulo degli esiti può accodare il recupero delle magie su `spell-recovery` senza importare `CharactersModule`).

Quattro fatti trovati cambiano il piano più di quanto il CONTEXT preveda: (1) `CharacterDeletionService.archiveCurrentCharacter` apre **la propria** transazione e non accetta una `session`; una `connection.transaction` annidata **committa indipendentemente** dall'esterna (sonda), quindi la morte "nella transazione dell'esito" (D-21) richiede di estrarre una variante session-aware; (2) la guard del negozio (D-18) e il gate `mage` sugli slot (D-13) **rompono test esistenti** (nessuna suite del negozio crea città; le suite delle magie usano il fixture `rookie` con `xp: 20000`); (3) il boot reale vieta `\bkind\b` nello schema (`test/app.int-spec.ts`, test "travel contract"): il campo di D-19 non può chiamarsi `kind`; (4) dopo la morte `User.currentCharacter` è `null`, quindi né `CharacterAccessPolicy.mayReceiveCharacterEvent` né la lettura del proprietario usata dal viaggio (`findOne({ currentCharacter })`) funzionano per il risultato "morte": proprietà e push devono passare dal campo `user` del risultato.

Sui dati di sviluppo: 13 quest (una per tipo, più `crime` e `guard`), **1 solo nemico** a scala vecchia (`lifePoints` 100, `xp` 25, danni 100) e **2 ref `infos.enemy` orfani su 3**; rarità presenti su tutti gli 83 loot e 145 equipaggiamenti (nessun loot `legendary`); un personaggio attivo già a scala nuova (xp 50 000, livello 20, `legend`, HP 20 000/40 000, 2 ferite) con **tre corsie occupate e tutte scadute** (`job` standard da 2 h, story, worldMission): al primo boot dopo il deploy il reconciler risolverà subito la `job`, e la story/worldMission compariranno nella coda del GM. Valantar esiste (1 città, 3 POI) ma **nessuna study** è a Valantar e nessuna quest ha `prizes.spell`.

**Primary recommendation:** creare `src/quests/outcomes/` con moduli puri (progressione, slot con titolo, loot a cascata, premi, clone della aid, regole segnaposto delle ferite, applicazione dell'esito) + porta `CombatResolver` (classe astratta DI) + `QuestResolutionSchedulingModule` (solo coda `quest-resolution` + scheduler, nessun Push, importato da accettazione e viaggio) + `QuestOutcomesModule` (servizio di risoluzione con transazione unica per esito o per gruppo, processor, sweeper, completamento GM, resolver innkeeper/owner-only) + un modulo real-time separato per i change stream (`questresults`, `pendingquests`) così i processor test non aprono stream. Calcolo di XP/livello/HP **applicativo su snapshot letto in sessione** con l'XP attesa nel filtro (non `$switch` in pipeline). Consegnare il contratto SDL in Wave 1.

## Conflitti con il CONTEXT

Nessuna decisione è impossibile. I punti C1–C4 richiedono un piccolo emendamento del CONTEXT (o una conferma dell'utente) prima del planning; C5–C10 sono precisazioni che il planner recepisce.

| # | Decisione | Fatto trovato (prova) | Rimedio consigliato |
|---|---|---|---|
| C1 | D-09/D-10 "`archiveCurrentCharacter(userId, DeletionReason.death)` … stessa routine"; D-21 "una transazione per personaggio-esito" | `archiveCurrentCharacter` apre `this.connection.transaction(...)` da sé (`character-deletion.service.ts:44-96`), non accetta `session`, lancia `CHARACTER_NOT_FOUND`/`UNAUTHENTICATED` se l'utente non è collegato (`:61-63`, `:99-109`) e archivia **il personaggio corrente dell'utente**, non un id dato. **Sonda:** una `connection.transaction` annidata in un'altra committa da sola anche se l'esterna abortisce (`a.points 0`, `b.points 1`) | Estrarre `archiveWithin(session, { userId, characterId, reason })` (filtro User `{ _id: userId, currentCharacter: { $in: idForms(characterId) } }`, archivio, `$pull` dei posti, chiusura delle aid che lo riguardano) e far chiamare a `archiveCurrentCharacter` la stessa funzione dentro la sua transazione. Nel flusso di morte un utente già scollegato è un **no-op** (log), mai un'eccezione. È un emendamento di D-09 ("stessa routine" = stessa funzione interna, non lo stesso metodo pubblico). |
| C2 | D-19 "`kind` (success \| failure \| rescued \| death \| gmCompleted…)" | Il boot reale asserisce `expect(schema).not.toMatch(/TravelKind\|\bkind\b/)` (`test/app.int-spec.ts`, test "writes the travel contract into the generated schema") | Campo `outcome: QuestOutcome!` (enum `QuestOutcome { success failure rescued death gmCompleted }`). Il divieto della Phase 8 resta valido. |
| C3 | D-13 "Virtual e filtro di `equipSpell` cambiano insieme" | Il fixture `buildCharacter` ha `title: 'rookie'` e `xp: 20000` "così il virtual dà 1 slot" (`test/fixtures/character.fixture.ts:8-10,27-30`; `fixtures.spec.ts:60`). Con il gate `mage` il valore diventa 0 e falliscono i casi di successo di `equip-spell.int-spec.ts` (incl. la parità `maxActiveSpellsExpression` vs `maxActiveSpellsFor`, righe 359-388), `active-spell-slots.spec.ts`, `fixtures.spec.ts` | Non cambiare il titolo di default del fixture (le suite delle quest dipendono da `rookie`): le suite delle magie passano `title: 'mage'`; la parità diventa una matrice `xp × title`; `fixtures.spec.ts` aggiornato. Da elencare nel piano come modifica di test esistenti dichiarata. |
| C4 | D-18 guard del negozio "pre-verifica + riaffermazione nel filtro" | **Nessuna** suite del negozio crea città (`grep -c City` = 0 in `do-transaction.int-spec.ts`, `shop-transaction.service.int-spec.ts`, `characters-ownership.int-spec.ts`, `archived-character-visibility.int-spec.ts`, `admin-audit.int-spec.ts`); i personaggi stanno su un POI casuale (`persistCharacter` crea un POI qualunque, `character.fixture.ts:58-61`) | Helper di test `placeInCity(harness, character)` (persiste una `City` con `markerLocation` = posizione del personaggio) usato dai casi di successo; `EconomyModule` registra `City`. Modifica di test esistenti dichiarata. |
| C5 | D-10 "7 giorni dalla creazione della aid senza esito → morte" | Un soccorritore può essersi già registrato sulla aid (in viaggio o nel countdown) allo scadere dei 7 giorni; D-09 decide già cosa accade al suo esito (successo → ferito liberato; fallimento → ferito morto) | **Precisazione raccomandata:** il timeout non scatta finché la aid ha un soccorritore registrato (filtro `registeredAdventurers: { $size: 0 }`); lo sweep la ricontrolla a ogni giro. Senza questa regola il soccorritore combatterebbe per un ferito già morto. Da confermare con l'utente (se preferisce la lettura letterale, il soccorso diventa un combattimento "a vuoto"). |
| C6 | D-01 "quest con nemico → motore" | Sul DB di sviluppo **2 ref `infos.enemy` su 3 sono orfani**; il catalogo li espone già come `enemy: null` (Phase 8 D-31, `quest-catalog.populate.ts`) | Nemico orfano = quest **senza nemico** (successo automatico) con WARN che riporta solo gli id: il giocatore ha visto una scheda senza nemico e la corsia non resta mai bloccata. Nel handoff: rimettere a posto i 2 ref. |
| C7 | D-21 "eliminazione (o archivio) del `PendingQuest`" + D-02 `spellsUsed` | `useSpell` decrementa `usages` **e** accoda un job `spell-recovery` (`characters.service.ts:317-386`); senza il job le magie usate in combattimento non tornerebbero mai | Dopo il commit, per ogni utilizzo, un job `recover` sulla coda `spell-recovery` con lo stesso formato (`{ characterId, spellId }`, `delay: recoveryTime`, jobId `${characterId}-${spellId}-${uuid}`), best-effort con `withinTimeout`, **senza** compensazione (il combattimento è già avvenuto). Sonda: la coda registrata nel modulo degli esiti è la stessa istanza di `CharactersModule`. |
| C8 | D-24 "Il viaggio automatico da quest accoda il job di scadenza al suo completamento" | Anche l'accettazione **senza** viaggio (marker = posizione, o salto) scrive `startDate: now` (`quest-acceptance.service.ts:174-178`): anche lì serve il job | Due punti di accodamento dopo il commit: `QuestAcceptanceService.accept` (corsia standard con `startDate` valorizzato) e `TravelCompletionService.complete` (quando scrive `startDate`); reconciler e sweep coprono i mancati. Story/worldMission mai. |
| C9 | D-06 "`quests`/`quest(id)` filtrano le concluse" | `QuestAcceptanceService.readQuest` legge per `_id` senza filtro (`:218-227`) e `registrationFilter` non conosce il marcatore (`quest-acceptance.updates.ts:87-98`) | Anche l'accettazione rifiuta le concluse: `readQuest` con `concludedAt: null` (→ `NOT_FOUND` "Missione non trovata", coerente con la board) e `registrationFilter` con `concludedAt: null` (corsa fra conclusione e registrazione → `QUEST_FULL` via `classifyUnregistered`, oppure nuovo ramo `NOT_FOUND`). |
| C10 | D-20 "subscription owner-only … innkeeper esente come `characterUpdated`" vs D-23 "owner-only (`questResult`, `questResultReceived`)" | In `characterUpdated` "esente" significa **ammesso** (`@OwnsCharacter` senza `ownerOnly`, `characters.resolver.ts:101-116`; `mayReceiveCharacterEvent` ritorna `true` per l'innkeeper, `character-access.policy.ts:121-125`) | Seguire D-23 (più restrittivo, coerente con "owner-only"): `ownerOnly: true` su entrambi, innkeeper `FORBIDDEN` sui personaggi altrui. Se l'utente voleva l'innkeeper ammesso, basta togliere `ownerOnly` dalla subscription (la query `questResult` resta per utente). |

## Answers to the research questions

### Q1 — Modello Phase 8 da replicare (D-01, D-10, D-24) — HIGH (codice + sonda)

**Pezzi da copiare (verbatim nei pattern):**

| Phase 8 | Riga | Phase 9 |
|---|---|---|
| `TravelScheduler.schedule` (`travel-scheduler.service.ts:36-72`): `withinTimeout(queue.add(name, data, { jobId, delay: max(0, due − now), removeOnComplete: true, removeOnFail: false }), timeoutMs)`; WARN su timeout/errore, **nessuna compensazione** | 36-72 | `QuestResolutionScheduler.scheduleResolution(pendingQuestId, startDate, waitingTime)` e `scheduleAidTimeout(aidQuestId, since)` |
| `warnRedisOnce` su `queue.on('error')` in `onModuleInit` | 31-33, 98-107 | idem (testo "job delle missioni") |
| `QUEUE_CALL_TIMEOUT` / `QUEUE_CALL_TIMEOUT_MS = 2_000` / `withinTimeout` (`queue-call-timeout.ts:1-22`) | — | **riuso** (import da `src/travel/queue-call-timeout`; Boy Scout facoltativo: spostarlo in `src/queues/`) |
| `travelJobId` deterministico, niente `:` (`travel-job.ts:15-26`); `travelJobDataOf` valida dati non fidati (`:34-50`) | — | `questResolutionJobId(pqId, startMs)` = `quest-<pqId>-<startMs>`; `aidTimeoutJobId(aidQuestId)` = `aid-<questId>`; parser con `objectIdFromHex` + `isEpochMs` |
| Processor: dati malformati → WARN; `due > clock.now()` → LOG "in anticipo: lo completerà lo sweep", nessuna scrittura né ri-accodamento (C10 Phase 8) | `travel-completion.processor.ts:24-40` | `@Processor(QUEST_RESOLUTION_QUEUE)` con due `@Process`: `resolve` e `aid-timeout` |
| Sweeper: `onApplicationBootstrap` mai atteso, `setInterval(...).unref()` se > 0, single-flight `inFlight`, serie, errori per elemento loggati con `codeOf` | `travel-sweeper.ts:49-105` | `QuestResolutionSweeper` (scadenze standard + timeout aid) |
| Config: `parseTravelConfig` fail-closed (cifre, ≤ 2 147 483 647, vuota = 60 000, 0 = off), `readEnvKeys`, provider con `ConfigService`, chiamata da `validateEnv` | `travel-config.ts:1-47`, `env.validation.ts:15` | `src/config/quest-config.ts` con `QUEST_SWEEP_INTERVAL_MS` + `.env.example` + `validateEnv` |
| `BullModule.registerQueue({ name })` in un modulo **senza Push**, esportato con la registrazione (`TRAVEL_QUEUE_REGISTRATION`) | `travel-planning.module.ts:24-47` | `QuestResolutionSchedulingModule` (solo coda + scheduler + `Clock` + timeout) |

**Seconda coda Bull:** `BullModule.forRootAsync` è uno solo (`app.module.ts:47-55`); ogni coda è un `BullModule.registerQueue({ name })` nel proprio modulo. **Sonda (cancellata):** la stessa coda registrata in due moduli è **la stessa istanza** (`producer.queue === ownerQueue` → `true`) e il processor del primo modulo consuma i job accodati dal secondo → il modulo degli esiti registra anche `spell-recovery` (C7) senza importare `CharactersModule` (che aprirebbe il change stream dei personaggi). [VERIFIED: sonda]

**Delay lunghi:** il timeout della aid è 604 800 000 ms, sotto il limite dei timer (2 147 483 647 ms); Bull conserva i delayed in una zset di Redis con il timestamp, quindi il job sopravvive ai riavvii (salvo eviction: lo sweep copre, blocker STATE). [CITED: bull/lib/queue.js delayed set; ASSUMED il comportamento oltre 24,8 giorni, non necessario qui]

**Dove si accoda il job di scadenza (D-24, C8):**
1. `TravelCompletionService.complete` (`travel-completion.service.ts:69-82`): oggi `pendingQuestModel.updateOne(questCountdownFilter(pqId), questCountdownUpdate(endTime), { session })`. Diventa `findOneAndUpdate(..., { session, returnDocument: 'after', projection: { waitingTime: 1, startDate: 1 } })` e il callback memorizza `{ pendingQuestId, startDate, waitingTime }` nell'`outcome`; **dopo il commit** (riga 84 in poi) `scheduler.scheduleResolution(...)`. Il callback è rieseguito sui WriteConflict: azzerare anche questo campo all'inizio come già fa con `outcome.completed = null` (riga 54).
2. `QuestAcceptanceService.accept` (`quest-acceptance.service.ts:192-195`): oggi accoda solo il viaggio. Aggiungere: `lane === standard && movement?.kind !== 'travel'` → `scheduleResolution(pendingQuestId, startDate, waitingTime)` con lo stesso `startDate` scritto nella transazione (calcolarlo **una volta** prima della transazione, non due `clock.now()`).
3. `TravelModule` e `QuestAcceptanceModule` importano `QuestResolutionSchedulingModule` (niente cicli: lo scheduling non importa nulla del viaggio).

**Attesa dei job nei processor test (Phase 1 D-06):** Redis effimero reale (`startRedis`, `test/setup/redis.ts`), `SystemClock`, `waitFor(predicate)` con polling del documento e deadline (`travel-completion.processor.int-spec.ts:39-52`), mai `job.finished()`; `queue.empty()` nell'`afterAll` (Redis condiviso in CI); `ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })`, `overrideProvider(PushTransport)`, `overrideProvider(PUSH_CONFIG).useValue({ serviceAccount: null })`, `overrideProvider(QUEST_CONFIG).useValue({ sweepIntervalMs: 0 })` (`:67-84`); collection pre-create con `model.init()` prima delle transazioni (`:95-100`). Il processor test **non** deve importare il modulo con i change stream dei risultati/coda (vedi Architettura).

**Scadenze per lo sweep — trappola verificata sui dati:** le `PendingQuest` di story/worldMission hanno `waitingTime: 0` e `startDate` = accettazione (`waitingTimeOf`, `quest-eligibility.ts:126-131`): una query "scadute" su `pendingquests` le prenderebbe tutte (sul DB di sviluppo le due corsie GM risultano "scadute"). Lo sweep parte quindi dai **personaggi** e dalla sola corsia standard:

```ts
// src/quests/outcomes/quest-resolution.updates.ts — pura; `now` dal Clock, mai $$NOW
export function dueStandardQuestsPipeline(now: Date) {
    return [
        { $match: { ...ACTIVE_CHARACTER_FILTER, 'quests.pendingQuest': { $ne: null } } },
        { $lookup: { from: 'pendingquests', localField: 'quests.pendingQuest', foreignField: '_id', as: 'pq' } },
        { $unwind: '$pq' },
        { $match: { 'pq.startDate': { $ne: null }, $expr: { $lte: [{ $add: ['$pq.startDate', '$pq.waitingTime'] }, now] } } },
        { $project: { _id: 1, pendingQuestId: '$pq._id', startDate: '$pq.startDate', waitingTime: '$pq.waitingTime' } },
    ];
}
```

(`$add` Date + numero → Date è valido in MongoDB [CITED: docs.mongodb.com $add]; un ref legacy salvato come stringa non fa join: accettabile, nessun dato così — `spellsStoredAsString: 0`, corsie tutte ObjectId sul DB di sviluppo.) Timeout delle aid: `characters.find({ ...ACTIVE_CHARACTER_FILTER, 'status.awaitingAid.since': { $lte: now − 7 giorni } }, { 'status.awaitingAid': 1 })`.

### Q2 — Forme Mongoose/GraphQL (provate con sonda, poi cancellata) — HIGH

Sonda `test/_probe-phase9-shapes.int-spec.ts` (eseguita, 6/6 verdi, cancellata) con classi `@ObjectType`+`@Schema` locali che imitano le forme proposte:

| Forma | Risultato |
|---|---|
| `@Prop({ type: AwaitingAidSchema, default: null })` sotto `status` | path `Embedded`; documento legacy idratato a `null`, in `lean()` il campo è **assente** (`undefined`); il filtro `{ 'status.awaitingAid': null }` matcha il legacy; `$set: { 'status.awaitingAid': null }` funziona |
| ref interni `@Prop({ type: MongooseSchema.Types.ObjectId, ref })` | path `ObjectId`: un esadecimale passato in `create` è **castato** a `ObjectId` |
| populate di un ref dentro il sotto-documento nullable (`status.awaitingAid.aidQuest`) | funziona (`populated aidQuest title Q`) — non necessario se esposto come `ID!` |
| collection dei risultati con `character`/`user` ref castati, `outcome` enum, `injuriesAdded: [String] enum InjuryType`, `rewards.items: [assetQuantitySchemaAt('rewards.items')]` | cast a ObjectId; enum non valido (`'grade'`) → `create` rifiutato; **populate `rewards.items.item` via `refPath` assoluto funziona** anche su una collection nuova e annidato in un sotto-documento; item orfano → `item: null` (va scartato come in `dropOrphanCatalogRefs`, perché `AssetQuantity.item` è `ItemUnion!`) |
| `spellLearned` ref nullable `default: null` | salvato `null` |
| change stream `insert` sulla collection nuova | il primo evento arriva al **primo** tentativo dopo l'apertura, ma l'apertura del cursore resta asincrona: nei test va usato un priming come `primeCharactersChangeStream` (Pitfall 9 Phase 3, `test/characters/characters-change-stream.ts:14-44`) |
| change stream `pendingquests` | `insert` con `fullDocument`, **`delete` solo con `documentKey`** (nessun `fullDocument`): la coda va **ricalcolata per intero** a ogni evento (come D-22 prevede) |
| `$switch` a 20 rami in una pipeline update (`$let` su xp clampata) | funziona (`xp 2500 → 2800`, livello 5 corretto con L5 = 2650) |
| SDL code-first | `awaitingAid: ProbeAwaitingAid` (nullable), `aidQuest: ID!`, `since: DateTime!`, `outcome: ProbeOutcome!`, `injuriesAdded: [InjuryType!]!`, `items: [AssetQuantity!]!`, `character: ID!`, `user: ID!` |

Fatti di path verificati sui modelli reali (stessa sonda): `status.spells` = `Array` di **`Mixed`**, `quests.completedQuests` = `Array` di `Mixed`, `infos.enemy` = `Mixed`, `status.injuries` = `Array` di stringhe. Conseguenza (trappola Phase 7/4): i ref legacy `Types.ObjectId` non popolati arrivano come ObjectId grezzo (sul filo un `ObjectType` non popolato dà "ID cannot represent value: Buffer"); nei filtri e negli update usare sempre `Types.ObjectId` e `idForms` per i `$in/$nin`; per "magia già nota" confrontare con `sameId` sullo snapshot (un `$addToSet` non deduplica una voce legacy stringa).

**Forme raccomandate (nuove, tutte con `MongooseSchema.Types.ObjectId`):**

- `src/models/character/awaiting-aid.model.ts`: `AwaitingAid { quest: ID! (quest fallita), aidQuest: ID! (aid creata), since: DateTime! }`, `@Schema({ _id: false })`; `CharacterStatus.awaitingAid` `@Field(() => AwaitingAid, { nullable: true })` + `@Prop({ type: AwaitingAidSchema, default: null })` (modello identico ad `activeTravel`, `character-status.model.ts:27-30`). Esposto come `ID!` senza populate (precedente `ActiveTravel.to: ID!`).
- `src/models/quest/quest-rescue.model.ts`: `QuestRescue { character, failedQuest }` solo `@Schema` (interno, nessun `@Field`: l'aid si collega dal lato del ferito con `awaitingAid.aidQuest`; il titolo "Soccorso: …" basta alla board). `Quest.rescue` `@Prop({ type: QuestRescueSchema, default: null })`.
- `Quest.concludedAt` `@Prop({ type: Date, default: null })` **senza** `@Field` (interno; la board non riceve le concluse). Asserire nel boot reale `not.toContain('concludedAt')` e `not.toContain('rescue')`.
- `QuestPrizes.spell` `@Field(() => Spell, { nullable: true })` + `@Prop({ type: MongooseSchema.Types.ObjectId, ref: Spell.name, default: null })` e voce `{ path: 'prizes.spell', model: Spell.name }` in `QUEST_CATALOG_POPULATE` (`quest-catalog.populate.ts:6-13`); orfano → `null` (nullable, nessun filtro serve).
- Collection `questresults` (nome classe `QuestResult`, D-19 discrezione; vedi "Contratto SDL proposto").

**Change stream sui risultati vs publish (D-20, discrezione):** raccomandato il **change stream** (`$match: { operationType: 'insert' }`), come ogni altro evento real-time del repo ("nessun publish manuale nei service salvo decisione esplicita", CONTEXT Established Patterns): gli scrittori sono tre (job, sweep, GM) e l'evento arriva solo al commit, mai per una transazione abortita. Il publisher rilegge il risultato **popolato** con la stessa funzione della query `questResult(id)` e pubblica `questResultReceived`.

**`pendingRequestsUpdated` dal modello `userUpdated`:** `UserUpdatesPublisher` (`user-updates.publisher.ts:16-66`: `watch(pipeline, { fullDocument: 'updateLookup' })`, `publishChange` rilegge e pubblica, errori loggati senza valori) + `users.resolver.ts:35-48` (`subscribeWithSnapshot(pipe(subscribe, filter(...)), loadSnapshot)`). Per la coda: `PendingRequestsPublisher` con `watch([{ $match: { operationType: { $in: ['insert', 'delete'] } } }])` sulla collection `pendingquests`, ricalcolo **single-flight con rerun** (modello `EventSubSubscriptionManager`, `eventsub-subscription.manager.ts`) per coalescere le raffiche (una worldMission a 9 registrati elimina 9 `PendingQuest` nello stesso commit), `pubSub.publish('pendingRequestsUpdated', { pendingRequestsUpdated: list })` (**non** `await`: ritorna `void`, `@typescript-eslint/await-thenable`). Le corsie standard producono anch'esse eventi su `pendingquests` (la `PendingQuest` non ha tipo né personaggio): il ricalcolo costa una query, accettabile; il single-flight evita le tempeste.

**Perché serve il priming (`primeCharactersChangeStream`):** il cursore del change stream si apre in modo asincrono dopo `watch()`; un evento scritto prima dell'apertura si perde. L'helper scrive su un sentinella finché un evento arriva, poi pulisce il DB (`characters-change-stream.ts:14-44`). Servono due helper gemelli: `primeQuestResultsChangeStream` (insert su un risultato sentinella) e `primePendingRequestsChangeStream` (insert/delete di una `PendingQuest` sentinella).

### Q3 — Progressione in un solo update condizionale (D-12, D-13) — HIGH (codice + sonda)

**Modello esistente:** `active-spell-slots.ts:1-27` — una tabella `ACTIVE_SPELL_SLOT_THRESHOLDS` (ordinata decrescente), `maxActiveSpellsFor(xp)` per virtual e classificatore, `maxActiveSpellsExpression()` `$switch` per il filtro `$expr` di `equipSpell` (`active-spell.updates.ts:13-28`); virtual in `character-status.model.ts:61-68`.

**Raccomandazione: calcolo applicativo su snapshot letto nella sessione + XP attesa nel filtro**, non `$switch` in pipeline. Prove:
1. La pipeline funziona (sonda: 20 rami, xp clampata, livello corretto), ma l'esito scrive anche inventario (merge di voci con `$inc`-o-`$push` e rimozione a zero), `activeSpells.$.usages`, magie apprese, ferite, corsia, `awaitingAid`, `completedQuests` e soprattutto deve **produrre il documento del risultato** con `levelBefore/After`, `xpBefore/After`, `hpBefore/After`: con la pipeline servirebbe comunque un `returnDocument` e la logica raddoppierebbe (aggregazione + TS).
2. Il repo ha già il pattern esatto: `ShopTransactionService.applyTrade` (`shop-transaction.service.ts:103-131`) legge lo snapshot **in sessione**, calcola lo stato finale con funzioni pure (`applyTradeToInventory`, `trade-inventory.ts:98-111`) e scrive `$set` degli array completi con un filtro di sicurezza; la contesa la risolve il WriteConflict della transazione (provato in Phase 4 §6 con 3–5 concorrenti).
3. Unico scrittore di `level`/`maxLifePoints`: il builder dell'esito (D-12 "non esista un secondo scrittore"). Filtro: `activeCharacterById(id)` + corsia attesa (`quests.pendingQuest: pqId` o lane GM) + **`'status.xp': snapshot.xp`** (cintura e bretelle oltre al WriteConflict).

Moduli puri raccomandati:

```ts
// src/quests/outcomes/progression/level-table.ts — tabella unica (D-12)
export const MAX_XP = 50_000;
export const LEVEL_TABLE = [
    { level: 1, minXp: 0, maxLifePoints: 1_000 }, { level: 2, minXp: 250, maxLifePoints: 1_200 },
    { level: 3, minXp: 800, maxLifePoints: 1_600 }, { level: 4, minXp: 1_600, maxLifePoints: 2_250 },
    { level: 5, minXp: 2_650, maxLifePoints: 3_050 }, { level: 6, minXp: 3_950, maxLifePoints: 4_100 },
    { level: 7, minXp: 5_500, maxLifePoints: 5_300 }, { level: 8, minXp: 7_350, maxLifePoints: 6_750 },
    { level: 9, minXp: 9_450, maxLifePoints: 8_400 }, { level: 10, minXp: 11_850, maxLifePoints: 10_250 },
    { level: 11, minXp: 14_450, maxLifePoints: 12_300 }, { level: 12, minXp: 17_350, maxLifePoints: 14_550 },
    { level: 13, minXp: 20_550, maxLifePoints: 17_000 }, { level: 14, minXp: 23_950, maxLifePoints: 19_700 },
    { level: 15, minXp: 27_650, maxLifePoints: 22_550 }, { level: 16, minXp: 31_600, maxLifePoints: 25_650 },
    { level: 17, minXp: 35_800, maxLifePoints: 28_900 }, { level: 18, minXp: 40_250, maxLifePoints: 32_400 },
    { level: 19, minXp: 45_000, maxLifePoints: 36_100 }, { level: 20, minXp: 50_000, maxLifePoints: 40_000 },
] as const;
export function progressionAfter(before: { xp: number; currentLifePoints: number }, xpGained: number, hpAfterOutcome: number) {
    const xp = Math.min(MAX_XP, Math.max(0, before.xp) + Math.max(0, xpGained));
    const row = [...LEVEL_TABLE].reverse().find(({ minXp }) => xp >= minXp) ?? LEVEL_TABLE[0];
    // nessuna cura al level up (D-12): solo clamp al nuovo massimo
    return { xp, level: row.level, maxLifePoints: row.maxLifePoints, currentLifePoints: Math.min(hpAfterOutcome, row.maxLifePoints) };
}
```

Nota: `maxLifePoints` = valore della tabella **sempre** (anche se un legacy aveva un massimo diverso): deterministico, un solo scrittore. Sui dati di sviluppo l'unico personaggio (xp 50 000, livello 20, massimo 40 000) è già coerente.

**Gate `mage` (D-13), virtual e filtro insieme:**

```ts
// src/models/character/active-spell-slots.ts — stesso file, firma estesa
export const SPELL_CASTER_TITLES = [TitleType.mage, TitleType.hero, TitleType.legend] as const;
export function maxActiveSpellsFor(xp: number, title: TitleType | null | undefined): number {
    if (!title || !SPELL_CASTER_TITLES.includes(title as never)) return 0;
    return ACTIVE_SPELL_SLOT_THRESHOLDS.find(({ minXp }) => xp >= minXp)?.slots ?? 0;
}
export function maxActiveSpellsExpression() {
    return { $cond: [{ $in: [{ $ifNull: ['$status.title', null] }, [...SPELL_CASTER_TITLES]] }, /* $switch attuale */ xpSlotsSwitch(), 0] };
}
```

Da cambiare insieme: virtual (`character-status.model.ts:63-65` → `maxActiveSpellsFor(this.xp ?? 0, this.title)`), `hasNoFreeSlot` (`active-spell.updates.ts:115-120`, lo snapshot deve proiettare anche `status.title`: `ACTIVE_SPELL_SNAPSHOT_PROJECTION` riga 92-96), `active-spell-slots.spec.ts`, la parità in `equip-spell.int-spec.ts:359-388` (matrice xp × titolo), fixture/test (C3). Magie già attive di un non-mage: lasciarle (nessun dato a DB; il personaggio di sviluppo è `legend`).

**Titolo (D-14):** `nextTitleAfterStory(current, storyMinTitle)` puro su `TITLE_RANK` (`quest-eligibility.ts:15-22`): avanza solo se `current === storyMinTitle`; `legend` resta.

### Q4 — Transazione dell'esito (D-21) — HIGH (codice + sonda)

**Modelli di transazione nel repo:** `QuestAcceptanceService.accept` (`quest-acceptance.service.ts:151-191`: claim condizionale + registrazione + `create([...], { session })` + `wallet.debitUserPoints(..., session)`, side effect dopo il commit), `TravelCompletionService.complete` (`travel-completion.service.ts:52-83`: `outcome` azzerato a ogni riesecuzione del callback, `returnDocument: 'before'`), `ShopTransactionService.applyTrade` (snapshot in sessione). Regole: niente side effect né `Promise.all` nel callback (riesecuzione sui WriteConflict, 04 Pitfall 6); push e job **dopo** il commit.

**Primitive verificate:**
- `WalletService.applyCharacterCoinsDelta(characterId, deltaCopper, session?)` (`wallet.service.ts:35-58`): un `findOneAndUpdate` (pipeline `coinsDeltaStages`), `RangeError` se il delta non è intero, delta 0 = no-op; si compone nella sessione. Premio: `toCopper(prizes.prizeCoins)` (`src/economy/coins.ts:13`). Il campo è `status.coins` (D-16 dice "`Character.coins`").
- `CharacterDeletionService.archiveCurrentCharacter(userId, reason)` (`character-deletion.service.ts:44-96`): transazione propria, filtro User `{ _id, currentCharacter: { $ne: null } }` → `returnDocument: 'before'`, archivio con `activeCharacterById` (`deletedAt: new Date()`, `deletionReason`), `$pull` dei posti da **tutte** le quest (`:79-94`). Non accetta session (C1). Il modulo importa `UsersModule` (`character-deletion.module.ts:15-26`), che porta con sé `UserUpdatesPublisher` (change stream `users`) e `UsersResolver`: accettabile, ma nei processor test apre uno stream in più (chiudere l'app).
- `useSpell`: `useSpellFilter` (`$elemMatch { spell: { $in: idForms }, usages: { $gte: 1 } }`) + `DECREMENT_ACTIVE_SPELL_USAGE` (`active-spell.updates.ts:52-90`), poi job di recupero (C7). Nell'esito: decremento applicativo sullo snapshot (`usages − n`, mai sotto 0, clamp del consumo a quanto disponibile) scritto con `$set: { 'assets.activeSpells': [...] }`.
- `$pull` dai registrati: `{ $pull: { registeredAdventurers: { character: id } } }` (forma di `character-deletion.service.ts:85-91`; `QuestRegistration.character` è `MongooseSchema.Types.ObjectId`, `quest-registration.model.ts:11-16`).
- Consumabili e premi in inventario: **riuso di `applyTradeToInventory`** (`trade-inventory.ts:98-111`) con righe `sell` per i consumabili (decremento, voce rimossa a zero) e `buy` per `prizeItem` e loot (incremento o nuova voce con `itemType`), `MAX_ITEM_QUANTITY` incluso. Un consumabile non più posseduto al momento dell'applicazione: clamp a quanto posseduto (il resolver lavora sullo stesso snapshot letto in sessione, quindi il caso arriva solo dagli override GM, che vanno validati prima → rifiuto tipizzato).

**Forma raccomandata della risoluzione (per esito individuale o di gruppo):**
1. Fuori dalla transazione: letture di catalogo (quest con `infos.enemy`, `prizes`, nemico, item del loot con `rarity`, magie per `maxUsages`/`recoveryTime`/`minXpToLearn`). Il catalogo è stabile.
2. `connection.transaction(async (session) => { ... })`:
   a. snapshot **in sessione** di ogni partecipante (filtro: attivo + corsia = `pqId` atteso); se uno manca → `throw new StaleResolution()` (sentinella: la transazione abortisce senza scrivere; non è un `TransientTransactionError`, quindi non viene rieseguita);
   b. per le quest con nemico: `combatResolver.resolve(contextFrom(snapshots, enemy, quest), chance)` — puro, nessun I/O, quindi lecito nel callback (rieseguito = ricalcolato sullo snapshot nuovo);
   c. per ogni partecipante: `planOutcome(...)` puro → `{ filter, update, coinsDelta, resultDoc, spellRecoveries, aidToCreate?, death? }`;
   d. scritture in serie: `characterModel.findOneAndUpdate(filter, update, { session })` (0 match → sentinella), `wallet.applyCharacterCoinsDelta(..., session)` se delta ≠ 0, `questResultModel.create([...], { session })`, `pendingQuestModel.deleteOne({ _id }, { session })`, update della `Quest` (`$pull` dei falliti, `concludedAt` se D-06, creazione della aid con `questModel.create([aid], { session })`), morte con `archiveWithin(session, …)` (C1);
3. Dopo il commit: push `questEnd(resultId)` a ogni `result.user`, job `aid-timeout` per ogni aid creata, job `spell-recovery` per ogni utilizzo, log.

**Eliminazione del `PendingQuest` (discrezione): eliminare.** Nessun consumatore ne ha bisogno dopo l'esito (la corsia torna `null`, il risultato copia `pointsSpent`/`startDate` se servono), il `delete` alimenta il change stream della coda GM e `pendingQuest(id)` risponde `NOT_FOUND` come per un id inesistente (`pending-quests.service.ts:21-25`).

**Claim atomico del boss di gruppo (D-05, D-21):** **il claim è la scrittura della `Quest` nella stessa transazione**, non un marcatore separato. Il trigger che trova tutti i registrati scaduti apre una sola transazione per l'intero gruppo con:
- filtro della Quest `{ _id, concludedAt: null, 'registeredAdventurers.character': { $all: ids } }` (+ `$size` uguale al numero letto) e update `$pull` dei falliti / `concludedAt` se almeno un successo;
- filtri dei personaggi con la corsia attesa.
Due trigger concorrenti scrivono lo stesso documento `Quest` → il secondo va in WriteConflict, il driver riesegue il callback, i filtri (corsie ormai `null`, Quest cambiata) non matchano → sentinella → no-op. Stessa proprietà provata in Phase 7 Q1 per la registrazione (07-RESEARCH §4, MongoDB 8.0.4/8.2.6). Una transazione per gruppo, non per personaggio: una caduta a metà non deve lasciare un gruppo risolto a metà e ricombattuto da solo. Limite: `transactionLifetimeLimitSeconds` di default 60 s [CITED: docs.mongodb.com transactions], ampiamente sufficiente per decine di scritture.
- **Esito di gruppo sulla quest (raccomandato):** il boss è concluso (`concludedAt`) se **almeno un** partecipante vince; ciascun fallito libera il posto e riceve la propria aid. Regola nel modulo puro dell'esito, documentata come "regola di gioco" accanto al resolver.
- Registrato senza `PendingQuest` coerente (difetto di dati): `$pull` con WARN, non blocca il gruppo.

**Aid (D-08/D-09):** clone puro `buildAidQuest(original, injuredId, now)`; `infos.title: \`Soccorso: ${original.infos.title}\``; `requirements: { minTitle: original.requirements.minTitle, requiredPoints: null, requiredAdventurers: [{ title: null, count: 1 }], recommendedLoot: original.requirements.recommendedLoot }`; `prizes` copiati (incl. `spell`, `randomLoot`); `registeredAdventurers: []`; `rescue: { character: injuredId, failedQuest: rescue?.failedQuest ?? original._id }` (in una catena la quest "originale" resta quella del primo combattimento, D-09 "clonata dalla quest **originale**"); `concludedAt: null`. Ferito: `awaitingAid: { quest: originalId, aidQuest: aidId, since: now }`. Città del ritorno (aid riuscita): `cityModel.findOne({ pointsOfInterest: { $in: idForms(marker) } }, { markerLocation: 1 })`; nessuna città → posizione invariata + WARN.

**Morte (D-09/D-10):** proprietario del ferito letto **nella sessione prima** dell'archivio (`userModel.findOne({ currentCharacter: { $in: idForms(injuredId) } }, { _id: 1 })`): dopo l'archivio `currentCharacter` è `null`. Il risultato "morte" porta quel `user`. **Raccomandato (Boy Scout, stessa funzione `archiveWithin`):** all'archivio, per qualunque motivo, chiudere le aid che riguardano il personaggio (`updateMany({ 'rescue.character': id, concludedAt: null }, { $set: { concludedAt: now } })`): un utente che elimina il proprio ferito non lascia una aid orfana sulla board; un soccorritore già registrato viene risolto normalmente e il passo "liberazione" è un no-op.

### Q5 — Autorizzazione e filo — HIGH (codice + sonda)

- `@Roles(RoleType.innkeeper)` = `SetMetadata(ROLES_KEY)` + `UseGuards(RolesGuard)` (`roles.decorator.ts:10`); il ruolo è lo snapshot del JWT (`roles.guard.ts:9-24`). **Sonda (cancellata):** su una `@Subscription` WS l'adventurer riceve `{"errors":[{"message":"Operazione riservata al locandiere","extensions":{"code":"FORBIDDEN"}}]}` senza snapshot, l'innkeeper riceve lo snapshot. [VERIFIED]
- `@OwnsCharacter(select, { ownerOnly: true })` (`ownership.decorators.ts:35-39`): proprietario = `User.currentCharacter` del bearer (`character-access.policy.ts:80-96`); innkeeper → `FORBIDDEN` su altrui; inesistente/archiviato → `NOT_FOUND`.
- **`questResult(id)` owner = utente (D-20):** non esiste una policy adatta. Dopo la morte `currentCharacter` è `null` (`character-deletion.service.ts:49-58`), quindi `@OwnsCharacter` non può proteggere la lettura del risultato di morte. Serve `OwnedResource.questResult` (`owned-resource.ts:1-4`) + `authorizeQuestResult(identity, id)` nella policy (lo `switch` esaustivo con `never`, `:64-75`, obbliga il compilatore): id malformato → `NOT_FOUND`; `findById(id, { user: 1 })`; assente → `NOT_FOUND`; `user ≠ identity.userId` → `FORBIDDEN` (owner-only, nessun bypass innkeeper; 403/404 distinti come per `pendingQuest`, `:99-118`). `AuthzModule` registra `QuestResult` nel `forFeature` (`authz.module.ts:25-32`). Decoratore `OwnsQuestResult(select)` con `ownerOnly: true` → entra sia in `EXPECTED_OWNERSHIP_HANDLERS` sia in `EXPECTED_OWNER_ONLY_HANDLERS`.
- **`questResultReceived(characterId)`:** `@OwnsCharacter(({ characterId }) => characterId, { ownerOnly: true })` alla subscribe (il personaggio è vivo); filtro **per evento** fail-closed su `documentIdOf(result.user) === identity.userId && String(result.character) === characterId` — **non** `mayReceiveCharacterEvent`, che dopo la morte darebbe `false` e scarterebbe proprio il risultato "morte". Nessuno snapshot (D-20).
- **Interceptor di audit** (`admin-audit.interceptor.ts:64-89`): solo `Mutation`, solo se `@Roles(innkeeper)` o decisione on-behalf; registra `actor { userId, twitchId, role }`, `action` = nome del campo, `target` = decisione on-behalf **oppure** `{ type: <nome del tipo di ritorno>, id: args.id se stringa }`, `args` copiati in JSON, `outcome` `OK` o `extensions.code`. Con `completePendingRequest(input: { pendingQuestId, outcomes })` → `target: { type: 'QuestResult', id: null }` e il pendingQuest in `args.input.pendingQuestId` (precedente accettato: Phase 8 C7 `teleportCharacter`, `sendTestPush`). Asserire così nel test.
- **Whitelist del boot reale** (`test/app.int-spec.ts:65-89`, confronti a `toEqual` ordinati, `:586-609`): aggiungere a `EXPECTED_INNKEEPER_HANDLERS` `PendingRequestsResolver.pendingRequests`, `PendingRequestsResolver.pendingRequestsUpdated`, `PendingRequestsResolver.completePendingRequest` (nomi classe a discrezione, ma il test enumera `Classe.metodo`); a `EXPECTED_OWNERSHIP_HANDLERS` e `EXPECTED_OWNER_ONLY_HANDLERS` `QuestResultsResolver.questResult`, `QuestResultsResolver.questResultReceived`. Asserzione esatta da aggiornare (dichiarata): `type CharacterStatus { … }` (`:375`) con `awaitingAid: AwaitingAid` in ordine alfabetico (sortSchema). Nuove asserzioni: `type QuestResult`, `enum QuestOutcome`, `questResult(id: …): QuestResult!`, `questResultReceived(…)`, `pendingRequests: [PendingRequest!]!`, `pendingRequestsUpdated: [PendingRequest!]!`, `completePendingRequest(input: CompletePendingRequestInput!)`, `spell: Spell` in `QuestPrizes`; divieti `/\bgrade\b/`, `concludedAt`, `rescue`, `CombatResolver`. Env del boot reale: `QUEST_SWEEP_INTERVAL_MS: '0'` accanto a `TRAVEL_SWEEP_INTERVAL_MS` (`:215-216` circa) e `app.get(QUEST_CONFIG)` asserito come per il viaggio (`:307-316`).

### Q6 — Push — HIGH (codice)

- Builder `questEnd(pendingQuestId)` (`push-events.ts:41-44`): rinominare il parametro in `resultId` (D-20); copy e TTL invariati (`Missione conclusa`, 1 h); `IDENTIFIED_TYPES` invariato; `testPushMessage` invariato. Nessun tipo push nuovo (la nota Phase 5 §8 su `combatResult` è superata da D-20). Aggiornare il handoff Phase 5 §2 (esempio `questEnd` con `id` = id del risultato).
- `PushService.sendToUser(userId, message)` (`push.service.ts:55-83`): non lancia mai; transport disabilitato → report vuoto; token per `userId` dal registro (`push-device.registry.ts:54-61`, **indipendente dal personaggio**: il defunto riceve la push di morte finché il device è registrato). Destinatario = `result.user`, mai `userModel.findOne({ currentCharacter })` (modello del viaggio, `travel-completion.service.ts:100-113`, che per la morte troverebbe `null`).
- Solo il chiamante la cui transazione ha committato invia (job e sweep concorrenti → una sola push per risultato). Mai dentro il callback.
- Test: `overrides: [{ token: PushTransport, useValue: new FakePushTransport() }]` (`test/push/fake-push-transport.ts`), device registrato con `PushService.registerDevice`, asserzione su `transport.sent[i].message.id === resultId`; `PushModule` richiede `ConfigService` globale e nei processor test `overrideProvider(PUSH_CONFIG)` (Phase 8 C6).

### Q7 — Modelli esistenti e fixture — HIGH (codice + dati)

- `Enemy` (`enemy.model.ts:11-59`): `name`, `locations: [PoiType]`, `energyWeaknesses`, `baseWeaknesses`, `relatedLore`, `xp: Int!`, `spells: [SpellSchema]` (**embedded**, non ref), `lifePoints: Int!`, `imagePath`, `damages: Damages { base: [BaseDamage { type, power }], energy: [EnergyDamage { type, power }] }` (`damages.model.ts:7-17`). Registrato globalmente in `MongoModule` (`mongo.module.ts:36`).
- `InjuryType` (28 valori, `injury-type.enum.ts`), `InjuryEffect` (10 valori, `injury-effect-type.enum.ts`): **nessuna mappa `InjuryType → InjuryEffect` esiste** nel codice (grep: `InjuryEffect` usato solo dal suo file) e `InjuryEffect` **non è nello schema** (registrato ma mai referenziato). La tabella di D-02 va creata da zero come modulo puro segnaposto.
- `RarityType` (`common, uncommon, rare, ultrarare, legendary`); `AssetItem.rarity` `@Prop({ type: String, enum })` **senza** default (`asset-item.model.ts:33-35`): legacy senza campo = `undefined` → "common" (D-16).
- `LootItem` (`loot-item.model.ts`): `power: Int!`, `effect: EffectType` (`none, heal, hunger, munition, exploration`): `heal` = pozione. `EquipmentItem`: `equipType`, `addedSpell` ref, `damages`.
- `QuestInfos.enemy` `Types.ObjectId` → `Mixed` (`quest-infos.model.ts:20-22`): leggere con `refIdOf`.
- `STARTING_LIFE_POINTS = 100` (`starting-character.ts:7`, usato per `currentLifePoints` e `maxLifePoints` alle righe 59-60; `STARTING_LEVEL = 1`); test da aggiornare: `starting-character.spec.ts:43-44`, `character-creation.resolver.int-spec.ts:244-245`. Il valore iniziale va preso dalla tabella (`LEVEL_TABLE[0].maxLifePoints`) per non avere due fonti.
- Fixture esistenti (`test/fixtures/index.ts`): spell, user, road, poi, city, character, quest, session, catalog-item (equipment/loot con `rarity: 'common'`), pet. **Manca `Enemy`.** Proposta:

```ts
// test/fixtures/enemy.fixture.ts — valido contro src/models/enemy.model.ts; scala D-12 (HP 1000)
export function buildEnemy(overrides: Record<string, any> = {}) {
    return {
        name: 'Test Bandit', locations: [], energyWeaknesses: [], baseWeaknesses: [], relatedLore: [],
        xp: 100, spells: [], lifePoints: 1000, imagePath: 'enemies/test.png',
        damages: { base: [{ type: 'cut', power: 100 }], energy: [] },   // DamageType: blunt | cut | pierce
        ...overrides,
    };
}
export const persistEnemy = (model: Model<any>, overrides: Record<string, any> = {}) => model.create(buildEnemy(overrides));
```

  più un caso in `fixtures.spec.ts` / `fixtures.int-spec.ts` e l'export in `index.ts`. Fixture del risultato: `buildQuestResult` per i test della query/policy (inserimento diretto). `buildQuest` resta valido (aggiungere `concludedAt`/`rescue`/`prizes.spell` non serve: default dello schema).

**Dati di sviluppo (sola lettura, soli aggregati, 2026-10-24):**

| Misura | Valore |
|---|---|
| Collection | 13 `quests`, **1 `enemies`**, 83 `lootitems`, 145 `equipmentitems`, 77 `spells`, 1 `characters` attivo, 2 `users`, 3 `pendingquests`, 167 `cities`, 642 `pointsofinterest`, 0 `pets`; `questresults` non esiste ancora |
| Quest per tipo | una ciascuna: `hunt`, `boss`, `aid`, `heal`, `worldMission`, `crime`, `dungeon`, `guard`, `enemy`, `job`, `study`; due `story` |
| `infos.enemy` | presente su `hunt`, `boss`, `enemy` (3 ref): **1 risolvibile, 2 orfani** (C6) |
| `timeToComplete` | presente su tutte tranne story e worldMission |
| `prizes` | `xpPrize` su 11/13 (min 30, mediana 90, max 800); `prizeItem` su 7; `randomLoot` non vuoto su 7; `prizes.spell` su **0**; `concludedAt` su 0 |
| `aid` di sviluppo | creata a mano: nessun nemico, nessun `rescue`, nessun registrato → si comporta come quest registrata senza combattimento (successo, conclusa) |
| Rarità | loot: common 41, uncommon 28, rare 9, ultrarare 5, **legendary 0**, mancante 0; equipaggiamenti: common 30, uncommon 28, rare 30, ultrarare 28, legendary 29, mancante 0 |
| Loot `effect` | heal 19, hunger 21, munition 13, exploration 18, none 12 |
| Nemico | `lifePoints` 100, `xp` 25, somma `power` dei danni 100, nessuna magia → **scala vecchia** (da riscalare, D-29) |
| Equipaggiamenti | somma `power` dei danni: min 50, mediana 1 800, max 18 500; **1 documento con `damages.base` oggetto invece di array** (difetto di dati: l'idratazione del contesto deve normalizzare) |
| Personaggio attivo | xp 50 000, livello 20, `legend`, HP 20 000/40 000, 2 ferite, magie attive e oggetti posseduti, **tre corsie occupate e scadute**: standard `job` (senza nemico, 2 h), story, worldMission; nessun viaggio |
| Magie | `minXpToLearn` min 4 000, mediana 16 000, max 50 000; `maxUsages` 1–5; `recoveryTime` 5 s–220 s |
| Valantar | 1 città, 3 POI; **0 study** con marker a Valantar |

### Q8 — Porta `CombatResolver` come token DI — HIGH (codice)

Modelli esistenti: `PushTransport` classe astratta (`push-transport.ts:18-38`) fornita da `pushTransportProvider` (`push-transport.provider.ts:8-15`) e sostituita nei test con `overrides`/`overrideProvider(PushTransport)`; `Clock` astratto con `{ provide: Clock, useClass: SystemClock }` in ogni modulo (`push.module.ts:25`, `quest-acceptance.module.ts:37`) e `createAuthTestApp({ clock })` che fa `overrideProvider(Clock)` (`auth-test-app.ts:107-109`); `RandomSource { pickIndex(length) }` con `MathRandomSource` (`random-source.ts`, `character-creation.module.ts:39`) e `FixedRandomSource` nei test.

```ts
// src/quests/outcomes/combat/combat-resolver.ts — la porta (D-02): contesto puro e già idratato in ingresso, un esito per partecipante in uscita
export abstract class CombatResolver {
    abstract resolve(context: CombatContext, chance: ChanceSource): ParticipantOutcome[];
}
export interface ParticipantOutcome {
    characterId: string;
    outcome: 'success' | 'failure';
    hpAfter: number;                       // ≥ 1, ≤ maxLifePoints (clamp nel builder dell'esito, difesa in profondità)
    injuriesAdded: InjuryType[];
    consumablesUsed: { itemId: string; quantity: number }[];
    spellsUsed: { spellId: string; usages: number }[];
}
// src/quests/outcomes/chance-source.ts — RNG iniettabile; RandomSource.pickIndex non basta per i tiri percentuali
export abstract class ChanceSource { abstract next(): number; }              // [0, 1)
@Injectable() export class MathChanceSource extends ChanceSource { next() { return Math.random(); } }
// modulo: { provide: CombatResolver, useClass: PlaceholderCombatResolver }, { provide: ChanceSource, useClass: MathChanceSource }
// test: overrides: [{ token: CombatResolver, useValue: new ScriptedCombatResolver({ [id]: 'failure' }) }, { token: ChanceSource, useValue: new SequenceChance([0.01, 0.9]) }]
```

`PlaceholderCombatResolver` (D-02, discrezione, commento "PROVVISORIO: regole dell'utente in arrivo"): potenza del gruppo = Σ (somma `power` dei danni degli equipaggiamenti indossati + danni delle magie attive con usi) × malus delle ferite; vittoria se potenza ≥ `enemy.lifePoints` (oppure tiro `chance.next() < potenza / (potenza + lifePoints)`); HP persi = somma dei danni del nemico × fattore (diviso fra i partecipanti), `hpAfter = max(1, hp − persi)`; ferita con probabilità fissa (es. 20 %) scelta con `chance`; consuma una pozione `heal` se `hpAfter` < 30 % del massimo; usa 1 utilizzo di ogni magia attiva. Tutto ciò che è "formula" vive **solo** in `placeholder-combat-resolver.ts` e `injury-rules.ts` (tabella `InjuryType → InjuryEffect[]` + malus per effetto + `travelSpeedFactorOf(injuries)`).

### Q9 — Dati reali — vedi tabella in Q7. Variabili da far verificare all'orchestratore: nessuna obbligatoria nuova; `QUEST_SWEEP_INTERVAL_MS` opzionale (assente = 60 000).

### Q10 — Trappole di tooling — HIGH (codice + misura)

- `npm run lint` = `eslint "{src,apps,libs,test}/**/*.ts" --fix` (package.json scripts): riscrive tutto il repo → **vietato**; usare `npx prettier --write <file>` + `npx eslint <file>`.
- File **non** Prettier-clean che la fase toccherà (`npx prettier --check`, 2026-10-24): `src/models/quest/quest-infos.model.ts`, `src/models/character/character-assets.model.ts`, `src/models/enemy.model.ts`, `src/models/enums/injury-type.enum.ts`, `src/models/enums/injury-effect-type.enum.ts`, `src/models/enums/rarity-type.enum.ts`, `src/models/city.model.ts`, `src/models/spell.model.ts` → commit `style(phase-9)` separato **prima** di modificarli. Puliti: `quest.model.ts`, `quest-prizes.model.ts`, `character-status.model.ts`, `active-spell-slots.ts`, `asset-quantity.model.ts`, `pending-quest.model.ts`, `src/quests/**`, `src/travel/**`, `src/characters/deletion/**`, `src/economy/trade/**`, `src/push/push-events.ts`, `src/pubsub.module.ts`, `src/app.module.ts`, `src/authz/**`, `src/pendingQuests/**`, `test/fixtures/**`, `test/app.int-spec.ts`.
- Jest: percorsi **prima** di `--selectProjects` (`npx jest <path> --selectProjects integration --runInBand`); integration sempre `--runInBand`, mai in background.
- `src/schema.gql` solo dal boot reale (`npx jest test/app.int-spec.ts --selectProjects integration --runInBand`), poi commit; CI: `git diff --exit-code src/schema.gql` (`.github/workflows/ci.yml:66`).
- `@typescript-eslint/await-thenable` / `require-await`: `pubSub.publish(...)` ritorna `void` (mai `await`); resolver sincroni non `async`; `no-floating-promises` è `warn` (`eslint.config.mjs:34`): usare `void` esplicito.
- Letterali Mongo con `$` nelle grep di accettazione: `grep -F '$pull'` (macOS: `cat -v` per vedere caratteri invisibili); grep multilinea inaffidabili dopo Prettier.
- Baseline misurata oggi: **unit 96 suite / 1424 test, 4,2 s**; integration **57 file** (ultima misura 08-14: 57 suite / 739 test, ~104 s).

## Contratto SDL proposto (Wave 1, additivo)

Nomi a discrezione del planner; forma verificata dalla sonda.

```graphql
enum QuestOutcome { death failure gmCompleted rescued success }

type AwaitingAid { aidQuest: ID!  quest: ID!  since: DateTime! }
# CharacterStatus: + awaitingAid: AwaitingAid
# QuestPrizes:     + spell: Spell

type QuestResultQuest { id: ID!  title: String!  type: String! }      # fotografia: leggibile anche se la quest sparisce (D-06)
type SpellUsage { spell: Spell  usages: Int! }                        # spell nullable: orfano tollerato
type QuestRewards { coins: Coins!  items: [AssetQuantity!]! }         # prizeItem + loot estratto (D-16)

type QuestResult {
  id: ID!
  character: ID!
  user: ID!
  quest: QuestResultQuest!
  outcome: QuestOutcome!
  resolvedAt: DateTime!
  hpBefore: Int!  hpAfter: Int!  maxLifePoints: Int!
  injuriesAdded: [InjuryType!]!
  consumablesUsed: [AssetQuantity!]!
  spellsUsed: [SpellUsage!]!
  rewards: QuestRewards!
  xpGained: Int!  xpBefore: Int!  xpAfter: Int!
  levelBefore: Int!  levelAfter: Int!
  titleBefore: String!  titleAfter: String!
  spellLearned: Spell
  enemy: Enemy
  rescuedCharacter: ID        # facoltativo: per "hai salvato X" sul foglio del soccorritore
}

type PendingRequestCharacter { id: ID!  name: String!  title: String!  location: ID!  activeTravel: ActiveTravel  awaitingAid: AwaitingAid }
type PendingRequestUser { id: ID!  twitchId: String! }
type PendingRequest {
  id: ID!                     # pendingQuestId
  startDate: DateTime
  pointsSpent: Int!
  quest: PendingRequestQuest! # { id type title requiredAdventurers: [QuestPartySlot!]! registeredAdventurers: [QuestRegistration!]! }
  character: PendingRequestCharacter!
  user: PendingRequestUser!
}

input ParticipantOverrideInput { characterId: ID!  hpAfter: Int  injuries: [InjuryType!]  consumablesUsed: [ItemUsageInput!]  spellsUsed: [SpellUsageInput!] }
input CompletePendingRequestInput { pendingQuestId: ID!  outcomes: [ParticipantOverrideInput!] }

type Query { questResult(id: ID!): QuestResult!   pendingRequests: [PendingRequest!]! }
type Mutation { completePendingRequest(input: CompletePendingRequestInput!): [QuestResult!]! }
type Subscription { questResultReceived(characterId: String!): QuestResult!   pendingRequestsUpdated: [PendingRequest!]! }
```

- Tipi dedicati per la coda invece di `Character`/`Quest`: `Character` sul filo richiede il populate completo (`location: PointOfInterest!`, `characters.service.ts:124-195`), pena "ID cannot represent value: Buffer"; il read model piatto si costruisce con una funzione pura da letture lean. `location` come `ID!` (il FE ha i POI della mappa); a discrezione `PointOfInterest` con populate.
- `requiredAdventurers`/`registeredAdventurers` riusano `QuestPartySlot`/`QuestRegistration` (già nello schema).
- Popolamenti del risultato: `consumablesUsed.item` e `rewards.items.item` via `assetQuantitySchemaAt('consumablesUsed')`/`('rewards.items')`, `spellsUsed.spell` (`Spell`), `spellLearned` (`Spell`), `enemy` (`Enemy`); orfani scartati/annullati come `dropOrphanCatalogRefs`.
- Codici nuovi in `GameRuleErrorCode` + factory con messaggio italiano + riga in `game-rule.exception.spec.ts`: `AWAITING_AID` ("Il tuo personaggio è in attesa di soccorso"), `SHOP_NOT_IN_CITY` ("Il negozio è disponibile solo in città"), `OUTCOME_NOT_PARTICIPANT` ("Il personaggio non partecipa a questa missione"), `OUTCOME_OVERRIDE_INVALID` ("Esito non valido per questo personaggio"). [ASSUMED: testi]

## Standard Stack

### Core (già installato, versioni dal `package.json` / CLAUDE.md)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mongoose | 8.18.1 | modelli, transazioni, change stream | unico ODM del repo |
| @nestjs/graphql + @nestjs/apollo | 13.2.0 / 13.1.0 | code-first, subscription WS | contratto esistente |
| bull + @nestjs/bull | 4.16.5 / 11.0.3 | job differiti come trigger | Phase 1/4/8 |
| @graphql-yoga/subscription | 5.0.5 | PubSub in memoria, `pipe`/`filter`/`Repeater` | `characterUpdated`, `userUpdated` |
| mongodb-memory-server (replSet) + redis-memory-server | come da harness | test con transazioni, change stream, Redis reale | Phase 1 |

### Supporting
| Asset | Purpose | When to Use |
|---------|---------|-------------|
| `src/travel/queue-call-timeout.ts` | timeout delle chiamate Bull | ogni `add`/`remove` |
| `src/economy/trade/trade-inventory.ts` | merge inventario | consumabili, premi, loot |
| `src/graphql/subscribe-with-snapshot.ts` | snapshot senza perdite | `pendingRequestsUpdated` |
| `test/travel/fake-travel-queue.ts` | coda finta | override di `getQueueToken('quest-resolution')` e `('spell-recovery')` (Boy Scout: rinominare in `FakeQueue` generica) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| calcolo applicativo su snapshot in sessione | pipeline `$switch` a 20 rami | provata funzionante, ma non copre inventario/risultato; duplica la logica |
| change stream sui risultati | publish dopo il commit | più semplice da testare, ma rompe la convenzione e va ripetuto in tre scrittori |
| claim sulla scrittura della `Quest` | campo `resolvingAt` sulla Quest o sui `PendingQuest` | stato in più da pulire in caso di crash; la transazione dà già l'esclusione |
| `ChanceSource.next()` nuova porta | estendere `RandomSource` | `RandomSource` ha solo `pickIndex`; estenderla obbliga a toccare la creazione personaggio |

**Installation:** nessuna.

## Architecture Patterns

### Recommended Project Structure
```
src/quests/outcomes/
├── progression/level-table.ts            # D-12 tabella + progressionAfter (puro)
├── progression/title-progression.ts      # D-14 (puro)
├── rewards/cascading-loot.ts             # D-16 drop rate + tiri (puro, ChanceSource)
├── rewards/quest-rewards.ts              # coins/prizeItem/loot → righe "buy" + spell learning D-17 (puro)
├── injuries/injury-rules.ts              # D-02/D-15 SEGNAPOSTO: InjuryType→InjuryEffect, malus, fattore viaggio
├── combat/combat-resolver.ts             # porta astratta + tipi
├── combat/placeholder-combat-resolver.ts # SEGNAPOSTO
├── combat/combat-context.ts              # idratazione pura da snapshot lean (normalizza damages)
├── chance-source.ts                      # porta RNG
├── aid/aid-quest.ts                      # D-08 clone (puro)
├── outcome-plan.ts                       # snapshot + esito → { filter, update, coinsDelta, resultDoc, ... } (puro)
├── quest-resolution-job.ts               # nomi coda/job, jobId, parser dati
├── quest-resolution.scheduler.ts         # come TravelScheduler
├── quest-resolution-scheduling.module.ts # solo coda + scheduler (no Push)
├── quest-resolution.updates.ts           # filtri/pipeline delle scadenze (puri)
├── quest-resolution.service.ts           # individuale, gruppo boss, aid, timeout
├── quest-resolution.processor.ts
├── quest-resolution.sweeper.ts
├── gm-completion.service.ts              # D-04 + validazione override
├── pending-requests.service.ts           # read model della coda
├── pending-requests.resolver.ts          # innkeeper: query, subscription, mutation
├── quest-results.service.ts / .resolver.ts  # owner-only: query + subscription
├── quest-outcomes.module.ts              # tutto tranne i change stream
└── realtime/ (quest-results.publisher.ts, pending-requests.publisher.ts, quest-outcomes-realtime.module.ts)
src/models/quest-result/ (quest-result.model.ts, …)   src/models/character/awaiting-aid.model.ts   src/models/quest/quest-rescue.model.ts
src/config/quest-config.ts
```

Dipendenze dei moduli: `QuestOutcomesModule` importa `MongooseModule.forFeature([...])` (Character, Quest, PendingQuest, QuestResult, User, City, Enemy, LootItem, EquipmentItem, Spell), `AuthzModule`, `PushModule`, `EconomyModule`, `CharacterDeletionModule`, `QuestResolutionSchedulingModule`, `BullModule.registerQueue({ name: 'spell-recovery' })`; provider `{ provide: Clock, useClass: SystemClock }`, `questConfigProvider`, `{ provide: CombatResolver, useClass: PlaceholderCombatResolver }`, `{ provide: ChanceSource, useClass: MathChanceSource }`. `AppModule` monta `QuestOutcomesModule` e il modulo realtime dopo `TravelModule`.

### Pattern 1: "il filtro è la regola" con snapshot in sessione
Pre-letture di catalogo → transazione: snapshot in sessione → regole pure → `findOneAndUpdate` con filtro che riafferma identità e XP attesa → 0 match = sentinella e no-op. (Phase 4 `applyTrade`, Phase 8 `complete`.)

### Pattern 2: trigger idempotenti, DB fonte di verità
Job differito con jobId deterministico, processor che non scrive in anticipo, reconciler al boot mai atteso, sweep single-flight; tutti chiamano **la stessa** funzione di risoluzione. (Phase 8.)

### Pattern 3: real-time da change stream + filtro per evento fail-closed
Publisher separato dai servizi; subscription con guard alla subscribe e filtro per evento sull'identità (per i risultati: `result.user`).

### Anti-Patterns to Avoid
- **`$$NOW` nei filtri:** sweep non testabile con `FixedClock`; usare `clock.now()`.
- **Push o job dentro `connection.transaction`:** duplicati ai WriteConflict (Phase 5 §8).
- **`findById` sul personaggio:** usare `activeCharacterById` (03.1 §8).
- **Una query "scadute" su `pendingquests`:** prende story/worldMission (`waitingTime: 0`).
- **Proprietario del risultato via `currentCharacter`:** fallisce per la morte.
- **Formula sparsa:** nessuna regola di combattimento o malus fuori dai due moduli segnaposto.
- **Transazione annidata** (`archiveCurrentCharacter` dentro la transazione dell'esito): committa da sola (sonda, C1).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| merge dell'inventario | nuovo algoritmo `$inc`/`$push` | `applyTradeToInventory` + `INVENTORY_FIELD` | rimozione a zero, `itemType`, `MAX_ITEM_QUANTITY`, voci legacy stringa già gestiti |
| movimento dei coins | `$inc` su `status.coins` | `WalletService.applyCharacterCoinsDelta(…, session)` | unico scrittore (gate grep Phase 4) |
| timeout Bull | `Promise.race` locale | `withinTimeout` + `QUEUE_CALL_TIMEOUT` | unhandled rejection e timer `unref` già risolti |
| snapshot + live | subscribe ad hoc | `subscribeWithSnapshot` | evento fra snapshot e live non perso |
| confronto id | `===` su ref | `sameId`, `idForms`, `refIdOf`, `objectIdFromHex` | path `Mixed`, legacy stringa |
| config env | parse ad hoc | `readEnvKeys` + parser fail-closed come `parseTravelConfig` | messaggi senza valori, boot rifiutato |
| archivio | `updateOne deletedAt` | `archiveWithin` estratto da `CharacterDeletionService` | scollegamento, posti, concorrenza |

**Key insight:** quasi tutta la fase è composizione di primitive esistenti; il codice nuovo vero è nei moduli puri (tabelle, loot, clone, piano dell'esito) e nella porta del resolver.

## Runtime State Inventory

Fase additiva (non un rename), ma tocca stato a runtime:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 3 `PendingQuest` scadute sul DB di sviluppo (standard `job`, story, worldMission); 2 ref `infos.enemy` orfani; nemico a scala vecchia; nessuna `prizes.spell` | Nessuna migrazione (D-29). Handoff: al primo boot la `job` viene risolta dal reconciler (successo + push); story/worldMission compaiono nella coda; comandi `mongosh` per nemico, ref orfani, `prizes.spell`, study a Valantar |
| Live service config | Redis: nuova coda `bull:quest-resolution:*`; job `recover` aggiuntivi su `bull:spell-recovery:*` | Nessuna azione; policy `maxmemory-policy noeviction` raccomandata (blocker STATE) |
| OS-registered state | None — verificato: nessun cron/systemd nel repo | — |
| Secrets/env vars | `QUEST_SWEEP_INTERVAL_MS` nuova **opzionale**, non segreta | `.env.example`; nessuna variabile obbligatoria |
| Build artifacts | None — `src/schema.gql` rigenerato dal boot reale | commit dello schema |

## Common Pitfalls

### Pitfall 1: transazione annidata nella morte
**What goes wrong:** `archiveCurrentCharacter` dentro la transazione dell'esito committa l'archivio anche se l'esito abortisce. **Avoid:** `archiveWithin(session, …)` (C1). **Warning sign:** un personaggio archiviato senza risultato "morte".

### Pitfall 2: sweep che risolve story/worldMission
**What goes wrong:** `waitingTime: 0` le rende "scadute". **Avoid:** sweep dalla corsia standard dei personaggi (Q1). **Warning sign:** test con una story accettata e lo sweep acceso.

### Pitfall 3: risultato di morte mai consegnato
**What goes wrong:** filtro per evento con `mayReceiveCharacterEvent` o proprietario via `currentCharacter`. **Avoid:** `result.user`. **Test:** subscription aperta prima della morte riceve il risultato `death`.

### Pitfall 4: test esistenti rotti da D-13 e D-18
Elenco in C3/C4; da pianificare come task espliciti (RED attesi), non come sorprese.

### Pitfall 5: collection non create prima delle transazioni
`questresults` non esiste sul DB; nei test `model.init()` prima della prima transazione (Phase 1/7 Pitfall 5). In produzione Mongoose crea la collection all'avvio (`autoCreate`). [ASSUMED: autoCreate default di Mongoose 8]

### Pitfall 6: change stream non ancora aperto nei test
Priming come `primeCharactersChangeStream` per `questresults` e `pendingquests`.

### Pitfall 7: `\bkind\b` e asserzioni esatte del boot reale
C2; `type CharacterStatus { … }` asserito per intero.

### Pitfall 8: boss che non si risolve mai
Un registrato senza `PendingQuest` coerente blocca "tutti scaduti". Pull con WARN.

### Pitfall 9: job in anticipo / orologi
Processor che confronta `startDate + waitingTime` con `clock.now()` e lascia lo sweep (C10 Phase 8); nel boot reale `QUEST_SWEEP_INTERVAL_MS: '0'`.

### Pitfall 10: dati di danni malformati
1 equipaggiamento con `damages.base` oggetto: l'idratazione del contesto normalizza (array o oggetto singolo → array) e scarta `power` non numerici.

### Pitfall 11: fixture con XP incoerente
`buildCharacter` ha `xp: 20000`, `level: 1`, HP 100: dopo un esito il livello salta a 13 e il massimo a 17 000. I test dell'esito fissano `xp`, `currentLifePoints`, `maxLifePoints` espliciti.

### Pitfall 12: push duplicate
Solo chi ha committato invia; job e sweep concorrenti → una push per risultato.

### Pitfall 13: ferite e velocità di viaggio
Il personaggio di sviluppo ha 2 ferite: col fattore segnaposto i suoi viaggi rallentano dal deploy. `TravelPlanner.planFree` deve proiettare `status.injuries` (`travel-planner.service.ts:58-63`) e `planAuto` riceverle (`AutoTravelRequest`, `:35-41`; l'accettazione proietta `status.injuries`, `quest-acceptance.service.ts:85-91`); velocità = `BASE_SPEED × pet × fattoreFerite`, fotografata alla partenza.

## Code Examples

### Guard `AWAITING_AID` (accettazione e viaggio libero)
```ts
// quest-eligibility.ts classifyEligibility — prima regola: lo stato blocca tutto
if (character.status.awaitingAid != null) return GameRuleException.awaitingAid();
if (character.status.activeTravel != null) return GameRuleException.travelInProgress();
// quest-acceptance.updates.ts laneClaimFilter: + 'status.awaitingAid': null ; classifyUnclaimed: ramo dopo NOT_FOUND
// travel.updates.ts startTravelFilter: + 'status.awaitingAid': null ; classifyUnstarted: ramo AWAITING_AID
// travel-rules.ts FreeTravelFacts: + awaitingAid (dopo destinationIsCityMarker); teleportFilter INVARIATO (D-07)
```

### Guard `SHOP_NOT_IN_CITY` (D-18)
```ts
// shop-transaction.service.ts applyTrade — snapshot in sessione con status.location/activeTravel/awaitingAid
const location = refIdOf(snapshot.status?.location);
const inCity = location && !snapshot.status?.activeTravel && !snapshot.status?.awaitingAid &&
    (await this.cityModel.exists({ markerLocation: { $in: idForms(location) } }).session(session));
if (!inCity) throw GameRuleException.shopNotInCity();
// writeInventory filter: + 'status.location': { $in: idForms(location) }, 'status.activeTravel': null, 'status.awaitingAid': null
// anche lo scambio vuoto (no-op senza transazione, :83-86) applica la pre-verifica (stesso esito per il FE)
```

### Cascading rolls (D-16)
```ts
// rewards/cascading-loot.ts — puro
export const DROP_RATES: Readonly<Record<RarityType, number>> = { legendary: 0.02, ultrarare: 0.05, rare: 0.15, uncommon: 0.35, common: 0.6 }; // default tecnico
const ORDER = [RarityType.legendary, RarityType.ultrarare, RarityType.rare, RarityType.uncommon, RarityType.common];
export function rollLoot<T extends { rarity?: RarityType | null }>(entries: readonly T[], chance: ChanceSource): T | null {
    for (const rarity of ORDER) {
        const pool = entries.filter((e) => (e.rarity ?? RarityType.common) === rarity);
        if (pool.length === 0) continue;                              // rarità assente: non si tira
        if (chance.next() < DROP_RATES[rarity]) return pool[Math.floor(chance.next() * pool.length)];
    }
    return null;                                                      // al massimo un oggetto
}
```
(La rarità sta sull'item del catalogo: leggere `rarity` dei `randomLoot.item` popolati; orfani esclusi.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `questEnd(id = pendingQuestId)` (Phase 5 §2) | `id` = id del risultato | Phase 9 D-20 | handoff Phase 5 emendato |
| grade e reject GM (BE-COMBAT-03/BE-ADMIN-02 originali) | solo completamento positivo, override per personaggio | Phase 9 D-03/D-04 | ROADMAP success criteria 3 e 5 da leggere emendati |
| `PushEventType.combatResult` previsto (Phase 5 §8) | nessun tipo nuovo | D-20 | nessun cambio dell'enum |
| slot magia per sola XP | XP + titolo ≥ mage | D-13 | virtual, filtro, test |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Testi italiani dei quattro codici nuovi | Contratto SDL | basso: solo copy |
| A2 | Valori segnaposto (drop rate, probabilità ferite, fattore viaggio, regola del resolver) | Q8, Code Examples | basso: dichiarati provvisori, sostituibili |
| A3 | Boss concluso se almeno un partecipante vince | Q4 | medio: regola di gioco non decisa dall'utente |
| A4 | Timeout aid sospeso con un soccorritore registrato | C5 | medio: da confermare |
| A5 | Nemico orfano = quest senza nemico | C6 | basso: dati di sviluppo da correggere comunque |
| A6 | Mongoose 8 crea le collection all'avvio (`autoCreate`) in produzione | Pitfall 5 | basso: se no, la prima transazione fallisce e lo sweep riprova; mitigabile con `init()` al boot |
| A7 | `hpAfter` degli override validato contro il massimo **prima** della ricompensa | Open Q | basso |

## Open Questions (RESOLVED)

1. **Change stream o publish per `questResultReceived`?** — RESOLVED: change stream `insert` sulla collection dei risultati (convenzione del repo, tre scrittori, solo commit). Sonda: `fullDocument` presente, priming necessario nei test.
2. **Eliminare o archiviare il `PendingQuest`?** — RESOLVED: eliminare nella transazione dell'esito (Q4).
3. **Calcolo livello/HP in pipeline o applicativo?** — RESOLVED: applicativo su snapshot in sessione + `status.xp` attesa nel filtro (Q3, sonda della pipeline come prova dell'alternativa).
4. **Claim del boss: marcatore sulla Quest o sui PendingQuest?** — RESOLVED: nessun marcatore; la scrittura della `Quest` e i filtri delle corsie nella stessa transazione di gruppo (Q4).
5. **`archiveCurrentCharacter` nella transazione?** — RESOLVED: estrarre `archiveWithin(session, …)` (C1, sonda).
6. **Come si ottiene il proprietario del risultato dopo la morte?** — RESOLVED: campo `user` del risultato, letto in sessione prima dell'archivio; policy `OwnedResource.questResult` (Q5).
7. **Nome del campo di esito?** — RESOLVED: `outcome: QuestOutcome!` (C2).
8. **Recupero degli usi delle magie usate in combattimento?** — RESOLVED: job `spell-recovery` dopo il commit, best-effort, nessuna compensazione (C7, sonda della coda condivisa).
9. **Dove si accoda il job di scadenza?** — RESOLVED: accettazione senza viaggio + completamento del viaggio da quest (C8).
10. **Le quest concluse sono accettabili?** — RESOLVED: no, `readQuest` e `registrationFilter` filtrano `concludedAt: null` (C9).
11. **Timeout aid con soccorritore registrato?** — RESOLVED (da confermare con l'utente, C5): sospeso finché c'è un registrato.
12. **Nemico orfano?** — RESOLVED: quest senza nemico + WARN (C6).
13. **Esito del boss con risultati misti?** — RESOLVED: concluso se ≥ 1 successo; i falliti ricevono ciascuno la propria aid (Q4, A3).
14. **Override `hpAfter`: limite prima o dopo il level up?** — RESOLVED: `1..maxLifePoints` dello snapshot **prima** della ricompensa (il combattimento avviene prima del premio); dopo il level up il massimo cresce e l'HP resta (nessuna cura). Override duplicati per lo stesso personaggio, consumabili non posseduti, magie non attive o usi oltre il disponibile → `OUTCOME_OVERRIDE_INVALID`; personaggio non partecipante → `OUTCOME_NOT_PARTICIPANT`; `pendingQuestId` malformato, inesistente o della corsia standard → `NOT_FOUND` (`ResourceNotFoundException.pendingQuest()`); nessuna scrittura in tutti i casi.
15. **Completamento GM di un partecipante in viaggio?** — RESOLVED: nessun blocco lato BE (il filtro su `activeTravel` è UX del pannello, ADMIN-02); l'esito non cambia la posizione.
16. **Lista `questResults` del personaggio?** — RESOLVED: non necessaria (YAGNI): il requery usa l'id dalla push o dalla subscription; eventualmente in Phase 10.
17. **`rescue` e `concludedAt` sul filo?** — RESOLVED: interni (nessun `@Field`), asseriti assenti dallo schema.
18. **Env per il timeout aid?** — RESOLVED: costante `AID_TIMEOUT_MS = 7 × 24 × 3 600 000` in codice; UAT del timeout via `mongosh` (retrodatare `status.awaitingAid.since` e attendere lo sweep).
19. **Spell learning: XP prima o dopo `xpPrize`?** — RESOLVED: dopo (D-17), nello stesso calcolo puro.
20. **Una study senza `prizes.spell` o con magia già nota?** — RESOLVED: solo XP, `spellLearned: null`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test | ✓ | ≥ 22 (engines) | — |
| MongoMemoryReplSet (harness) | transazioni, change stream | ✓ | 8.0.4 (CI pin) | — |
| Redis effimero (`redis-memory-server`) | processor test | ✓ | sonda eseguita | `REDIS_HOST/PORT` in CI |
| DB di sviluppo | aggregati handoff | ✓ (letto in sola lettura) | — | — |

**Missing dependencies:** nessuna. **Variabili da far verificare all'orchestratore:** nessuna obbligatoria; facoltativo controllare che il `.env` locale **non** contenga `QUEST_SWEEP_INTERVAL_MS` con un valore non intero (boot rifiutato, fail-closed).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest, projects `unit` / `integration` (package.json `jest.projects`) |
| Config file | `package.json` (jest), `test/setup/global-setup.ts` (replSet), `test/setup/redis.ts` |
| Quick run command | `npx jest <file.spec.ts> --selectProjects unit` (~4 s tutta la unit) |
| Integration singola | `npx jest <file.int-spec.ts> --selectProjects integration --runInBand` (3–20 s) |
| Full suite command | `npm run test:unit && npm run test:int` (~110–140 s stimati con la fase) |
| Baseline | unit 96 suite / 1424 test; integration 57 suite / ~739 test |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-COMBAT-01 | tabella livelli/HP, clamp 50 000, nessuna cura | unit | `npx jest src/quests/outcomes/progression --selectProjects unit` | ❌ Wave 0/1 |
| BE-COMBAT-01 | slot con titolo (virtual = espressione) | unit + int | `active-spell-slots.spec.ts`, `equip-spell.int-spec.ts` | ✅ da estendere |
| BE-COMBAT-01 | cascading rolls, premi, spell learning, clone aid, malus segnaposto, resolver segnaposto deterministico | unit | `npx jest src/quests/outcomes --selectProjects unit` | ❌ |
| BE-COMBAT-01 | piano dell'esito (filtro/update/risultato) | unit | `outcome-plan.spec.ts` | ❌ |
| BE-COMBAT-03 | job alla scadenza → successo senza nemico, premi, XP, livello, risultato, push | int (Redis reale) | `npx jest src/quests/outcomes/quest-resolution.processor.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-COMBAT-03 | combattimento vinto/perso (fake), `awaitingAid`, aid clonata, `AWAITING_AID` su viaggio/accettazione, teleport ammesso | int | `quest-resolution.service.int-spec.ts`, `accept-quest.resolver.int-spec.ts`, `travel.resolver.int-spec.ts` | ❌ / ✅ da estendere |
| BE-COMBAT-03 | aid riuscita/fallita, catena, timeout 7 giorni, boss di gruppo, hunt ripetibile, enemy conclusa sparisce | int | `quest-resolution.service.int-spec.ts`, `quest-resolution.sweeper.int-spec.ts`, `quests.resolver.int-spec.ts` | ❌ / ✅ |
| BE-COMBAT-03 | trigger duplicato/obsoleto no-op, reconciler, sweep | int | `quest-resolution.sweeper.int-spec.ts` | ❌ |
| BE-COMBAT-02 | subscription owner-only emette, `FORBIDDEN` altrui, morte consegnata | int (WS) | `quest-result-received.subscription.int-spec.ts` | ❌ |
| BE-COMBAT-02 | `questResult(id)` owner per utente, anche dopo la morte; `NOT_FOUND`/`FORBIDDEN` | int | `quest-results.resolver.int-spec.ts` | ❌ |
| BE-ADMIN-01 | `pendingRequests`/`pendingRequestsUpdated` innkeeper, snapshot, lista completa, `FORBIDDEN` | int (WS) | `pending-requests.resolver.int-spec.ts` | ❌ |
| BE-ADMIN-02 | story → titolo, corsia vuota, `completedQuests`; worldMission con override → risultati diversi, sparita per tutti; override non valido → nessuna scrittura; audit | int | `gm-completion.int-spec.ts` | ❌ |
| D-18 | `doTransaction` fuori città / in viaggio / in attesa → `SHOP_NOT_IN_CITY` | int | `do-transaction.int-spec.ts`, `shop-transaction.service.int-spec.ts` | ✅ da estendere |
| tutte | whitelist, SDL additivo, `grade`/`kind`/`concludedAt` assenti | real boot | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ da estendere |

### Sampling Rate
- **Per task commit:** unit dei moduli toccati + int-spec del task.
- **Per wave merge:** `npm run test:unit` + int-spec della wave + real boot se cambia lo schema.
- **Phase gate:** `npm run test:unit && npm run test:int`, `npm run build`, `npx eslint` + `npx prettier --check` sui file toccati, `git diff --exit-code src/schema.gql`.

### Wave 0 Gaps
- [ ] `test/fixtures/enemy.fixture.ts` (+ export e caso in `fixtures.spec.ts`)
- [ ] `test/quests/scripted-combat-resolver.ts` (fake: esito per characterId, HP/ferite/consumi configurabili)
- [ ] `test/quests/sequence-chance.ts` (fake di `ChanceSource` con sequenza)
- [ ] `test/quests/quest-result.fixture.ts` (`buildQuestResult`/`persistQuestResult`)
- [ ] `test/quests/quest-results-change-stream.ts` e `pending-requests-change-stream.ts` (priming)
- [ ] `test/economy/place-in-city.ts` (C4) e aggiornamento delle suite del negozio
- [ ] `FakeTravelQueue` generalizzata (o seconda istanza) per `quest-resolution` e `spell-recovery`

### Manual-Only Verifications
- UAT su device con la FE Phase 9/10: foglio esiti in foreground (subscription) e da push in background, popup di morte → creazione personaggio, coda GM live, completamento con override (dati §dati UAT del handoff).
- Timeout aid reale: `mongosh` per retrodatare `since` e attendere lo sweep (60 s).
- Policy Redis di produzione (`maxmemory-policy`).

## Security Domain

### Applicable ASVS Categories (L1)
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | sì (ereditata) | JWT di sessione, guard globale |
| V3 Session Management | no (invariata) | — |
| V4 Access Control | **sì** | `@Roles(innkeeper)` su coda e completamento; owner-only per utente sui risultati; filtro per evento fail-closed; whitelist enumerate nel boot reale |
| V5 Input Validation | sì | `objectIdFromHex`, override validati (partecipante, range HP, quantità intere ≥ 1, duplicati), nessun valore di esito dal client oltre gli override GM |
| V6 Cryptography | no | — |
| V7 Error/Logging | sì | codici in `extensions.code`, log con soli id, audit delle mutation innkeeper |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Lettura dei risultati altrui (IDOR) | Information disclosure | policy `questResult` per `user`, owner-only, `FORBIDDEN` |
| Subscription che fa trapelare risultati di altri | Information disclosure | guard alla subscribe + filtro per evento su `user` e `character` |
| Adventurer che completa richieste | Elevation of privilege | `@Roles(innkeeper)`, test `FORBIDDEN` |
| Doppia ricompensa da job/sweep concorrenti | Tampering | filtro d'identità della corsia + transazione + sentinella |
| Override che crea oggetti/monete | Tampering | override solo HP/ferite/consumi/magie; premi solo dal catalogo |
| Negozio usato fuori città | Tampering | `SHOP_NOT_IN_CITY` riaffermato nel filtro |
| Dati di job non fidati | Tampering | parser con `objectIdFromHex`/`isEpochMs`, WARN e uscita |
| Log con dati sensibili | Information disclosure | solo id e codici (`codeOf`), mai messaggi grezzi o env |

## Sources

### Primary (HIGH confidence)
- Codice del repo BE (letture `file:riga` citate in ogni sezione).
- Sonde eseguite e cancellate: `test/_probe-phase9-shapes.int-spec.ts` (6 test), `test/_probe-phase9-authz.int-spec.ts` (2 test), `test/_probe-phase9-bull.int-spec.ts` (1 test).
- Script di sola lettura sul DB di sviluppo (scratchpad, soli aggregati; nessun valore di configurazione stampato).
- `.planning/phases/08-*/08-RESEARCH.md`, `BACKEND-NOTES.md` §6/§8/§11/§12/§13; 07 §9; 04 §3/§6/§7; 03.1 §8; 05 §2/§8; FE 07 BACKEND-NOTES §2, ROADMAP FE §9/§10, REQUIREMENTS FE COMBAT/ADMIN.

### Secondary (MEDIUM confidence)
- [CITED] MongoDB: `$add` con Date, limiti delle transazioni (`transactionLifetimeLimitSeconds` 60 s).

### Tertiary (LOW confidence)
- Nessuna affermazione basata solo su ricerca web.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nessuna dipendenza nuova, primitive esistenti.
- Architecture: HIGH — modelli Phase 4/8 replicati, meccanismi provati con sonde.
- Pitfalls: HIGH — trovati nel codice e nei dati (test che si rompono, sweep, morte).
- Valori di gioco segnaposto: MEDIUM/ASSUMED — dichiarati provvisori.

**Research date:** 2026-10-24
**Valid until:** 2026-11-23 (stack stabile; ricontrollare i dati di sviluppo prima della UAT)
