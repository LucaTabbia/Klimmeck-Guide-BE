# Phase 22: Completamento guidato delle missioni - Research

**Researched:** 2026-11-13
**Domain:** flusso dell'oste lato BE (NestJS 11, Mongoose 8, Apollo code-first, change stream): bozza persistente, simulazione a secco sulla porta `CombatResolver`, catalogo dei premi per titolo, completamento transazionale, blocco «missione in corso» condiviso da tutte le mutation che cambiano lo stato di combattimento
**Confidence:** HIGH sul codice (letto sul branch `feat/22-completamento-guidato-missioni` = `develop` `c6079ca3` + i commit di contesto; tre sonde eseguite sull'harness di integrazione e cancellate), MEDIUM sulle proposte di forma (SDL, granularità delle mutation: default tecnici dichiarati), LOW solo sui conteggi del catalogo a DB (presi dai documenti delle fasi, DB reale non toccato)

## Summary

Oggi il completamento dell'oste è **un solo passo**: `completePendingRequest` (`src/quests/pending-requests/pending-requests.resolver.ts:45-58`) → `GmCompletionService.complete` (`src/quests/outcomes/gm-completion.service.ts:123-155`), che legge la richiesta, valida gli override (`validateOverrides`, `gm-overrides.ts:146-171`), legge il catalogo dei nemici **della quest** (`loader.readCatalog`, `resolution-loader.service.ts:426-442`) e in **una transazione** scrive per ogni partecipante `planParticipant` (`outcome-plan.ts:388-581`) con UN effetto di combattimento (l'override), xp e conoscenza dei nemici della quest, premio tirato dal blocco del titolo (`drawRewards(prizeBlockFor(...))`, `gm-completion.service.ts:317-321`), poi cancella le PendingQuest e conclude la worldMission. Tutti i pezzi che il flusso guidato richiede esistono già come **funzioni pure riusabili**: `readCombatCatalog(entries, participants, subject)` accetta nemici arbitrari (`resolution-loader.service.ts:445-494`), `buildCombatContext` è puro (`combat-context.ts:248-263`), `validateOverrides` valida già «effetti di uno scontro» contro lo stato di un personaggio, `planParticipant` accetta un effetto aggregato, nemici e conoscenza arbitrari. La **sonda 1** prova che una simulazione (lettura del catalogo + contesto + `PlaceholderCombatResolver.resolve` con una sorgente di caso propria, due scontri in sequenza con lo stato sovrapposto) lascia `characters`, `pendingquests`, `questresults`, `quests` identici byte per byte e la `ChanceSource` condivisa a zero tiri.

Il punto delicato è il **blocco** (D-10..D-12). La sua definizione si deriva quasi tutta da dati che esistono: per la corsia standard l'«inizio effettivo» è esattamente `PendingQuest.startDate != null` (solitarie: scritto all'arrivo, `soloStartDateOf`, `quest-start.service.ts:84-91`, `travel.updates.ts:131-136`; registrate: all'avvio del party), e `CharactersService.findOne` popola già le PendingQuest di tutte le corsie (`characters.service.ts:118`, `character-quests.populate.ts:13-20`). Per il flusso guidato serve **un marcatore** che il change stream possa vedere: si propone `PendingQuest.missionDraftStartedAt` (solo Mongoose), scritto/azzerato nella stessa transazione della bozza; la **sonda 3** conferma che `$set` a `null` arriva in `updateDescription.updatedFields` (quindi un publisher gemello di `PendingQuestStartPublisher` ripubblica i titolari sia all'avvio sia allo scarto). La **sonda 2** conferma che dal sotto-documento `status` idratato si raggiunge il personaggio (`status.$parent()` === documento, corsie popolate), quindi `CharacterStatus.missionInProgress` si può risolvere col nome di bozza. Le mutation da bloccare sono 10 (sei del personaggio, `useItem`, `doTransaction`, `startTravel`, `acceptQuest`); oggi nessuna controlla la missione avviata, e **D-12 contiene un'affermazione non vera**: l'accettazione di una story/worldMission durante una missione standard avviata è permessa (`quest-eligibility.ts:184-185` guarda solo la stessa corsia; la spec `quest-acceptance.service.int-spec.ts:476` lo pinna) → domanda di prodotto P-1.

**Primary recommendation:** modulo nuovo `src/quests/guided/` (bozza in una collection propria `missiondrafts` indirizzata da qualunque PendingQuest della richiesta, servizio di simulazione con una porta del caso dedicata `MissionSimulationChance`, catalogo dei premi con UNA funzione pura per opzioni e rivalidazione, completamento che riusa il ciclo di scrittura di `GmCompletionService` reso parametrico) + modulo `src/characters/mission-lock/` (predicato puro `missionInProgressOf`, lettore a due letture `MissionLockReader`, publisher del marcatore); codice nuovo `MISSION_IN_PROGRESS`; `completePendingRequest` convive e cancella la bozza nella sua transazione.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `teleportCharacter` accetta già qualunque POI: la FE ora lascia cadere anche sui POI interni. Passo saltabile se il gruppo è già sul posto; il luogo dà i tipi di POI del passo 2.
- **D-02:** **Uno o più scontri in sequenza**, ognuno con uno o più nemici (tipo + quantità); ogni scontro parte dallo stato lasciato dal precedente dopo le correzioni.
- **D-03:** Query della lista nemici: di default i tipi del POI + habitat `city` (stessa regola di `zonePoolOf`) nella fascia xp del titolo della missione (`RANK_XP_BANDS`), **i 22 leggendari ammessi per le worldMission** (riservati alle missioni del GM); con «mostra tutti» l'intero bestiario.
- **D-04:** **Simulazione a secco** col `CombatResolver` (segnaposto oggi, motore dell'utente domani) sullo stato reale dei personaggi (equipaggiamento, compagno, magie, consumabili), **nessuna scrittura** su personaggi, quest o risultati; ritorna per personaggio esito, HP dopo, ferite aggiunte, consumabili e magie usati. Il tiro non deve consumare la sorgente di caso delle risoluzioni reali in modo osservabile (planner).
- **D-05:** Sconfitta simulata → rilancio o nemici cambiati, poi correzioni; la missione finisce **sempre completata** (`gmCompleted`, nessuna aid, nessun rifiuto — regola della Phase 9).
- **D-06:** Correzioni per personaggio dopo ogni scontro: togliere ferite, vita (1..max), consumabili e magie usati; aggiungere una ferita resta possibile; validazione come `validateOverrides` oggi.
- **D-07:** Premi per personaggio: si parte dal **blocco del titolo** (Phase 21) e l'oste toglie o aggiunge voci dal catalogo filtrato per titolo (tetto di rarità del loot del titolo, pet con lo stesso tetto, magie solo `isSpellCaster` e con `minXpToLearn`); il BE **rivalida** ogni premio contro il filtro (mai fidarsi del client). Xp dei nemici, xp del compagno (10 %, Phase 19), conoscenza e lore di vittoria (Phase 16/17) dai nemici scelti, come una vittoria.
- **D-08:** Completamento in **una transazione** come `GmCompletionService` oggi: stato finale corretto, scontri e nemici (in `QuestResult.enemies`), premi scelti; foglio dell'esito ai giocatori come oggi.
- **D-09:** **Bozza salvata nel BE** sulla richiesta (passo, luogo, scontri e nemici, risultati simulati, correzioni, premi), ripresa da qualunque dispositivo dell'oste; si invalida se la richiesta sparisce; nessun effetto sui personaggi finché non si completa (il teleport è già reale).
- **D-10:** I giocatori vedono il teleport, un **avviso «Missione in corso»** (stato esposto sul loro personaggio) e l'esito finale; bozza e simulazioni mai esposte a loro (utente, 2026-11-12, correggendo la prima risposta).
- **D-11:** Dall'**avvio del flusso** (bozza creata) all'**arrivo del risultato** i partecipanti sono **bloccati**: niente partenza di viaggi né accettazione di quest, rifiuto nel BE con un codice proprio — utente: «Vorrei che avessero anche l'avviso "Missione in corso" e che fossero bloccati (così non rischio che inizino viaggi o quest mentre eseguo la loro quest) fino all'arrivo del risultato». Sblocco al completamento o allo scarto della bozza da parte dell'oste. **Bloccati anche acquisti e vendite, cambio di equipaggiamento e compagno, equip delle magie e pozioni** (cambiano lo stato su cui si simula; utente, 2026-11-12: «Blocchiamo anche quelle azioni»).

#### Stesso blocco per ogni missione (aggiunta 2026-11-12)
- **D-12:** Lacuna trovata nel discuss: nelle missioni normali il personaggio si legge **solo alla risoluzione** (`resolution-loader.service.ts:382`) e `equipItem`/`equipPet`/`equipSpell`, `useItem` (rifiutata solo in attesa di soccorso) e il negozio (solo «in città») non controllano la missione in corso: si può cambiare arma o bere una pozione un minuto prima dello scontro. Scelta dell'utente (opzione 1 di 2, scartato lo snapshot all'inizio): **il blocco di D-11 vale per ogni missione** dall'**inizio effettivo** (corsia standard: arrivo alla quest, cioè il tempo d'attesa; boss e quest registrate: party avviato, `startedAt`) **fino all'esito**: niente cambi di equipaggiamento, compagno o magie, niente `useSpell` fuori combattimento, niente pozioni, niente negozio, con lo stesso stato «missione in corso»; viaggi e accettazioni sono già bloccati dalla corsia occupata. Una sola guardia nel BE (un predicato «personaggio bloccato» condiviso dalle mutation) e un solo avviso nella FE.

### Claude's Discretion
- Forma SDL (query `missionEnemies`, mutation di simulazione, documento bozza vs campo sulla PendingQuest, completamento esteso vs mutation nuova), rimozione o convivenza del vecchio `completePendingRequest` con override (consiglio: il nuovo flusso lo sostituisce, FE gated).
- Invalidazione delle simulazioni a valle quando cambiano i nemici di uno scontro.

### Deferred Ideas (OUT OF SCOPE)
- Motore a turni dell'utente: si innesta dietro lo stesso `CombatResolver`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-GMFLOW-01 | Query innkeeper della lista nemici: tipi del POI + habitat `city` nella fascia xp del titolo, leggendari per le worldMission, «mostra tutti» | §Q3 (pool, fasce, POI, leggendari, firma), C-8, P-2, P-9 |
| BE-GMFLOW-02 | Simulazione a secco di uno scontro sullo stato corrente o lasciato dallo scontro precedente, nessuna scrittura, effetti per personaggio | §Q2 (sonda 1, porta del caso dedicata, sovrapposizione dello stato), C-2, C-5 |
| BE-GMFLOW-03 | Bozza sulla richiesta, ripresa da ogni dispositivo, invisibile ai giocatori, invalidata se la richiesta sparisce | §Q4 (collection propria, indice unico, marcatore, invalidazione), C-6, C-7 |
| BE-GMFLOW-04 | Correzioni per personaggio validate come gli override | §Q5 (`validateOverrides` sul personaggio sovrapposto), C-9 |
| BE-GMFLOW-05 | Premi dal blocco del titolo + catalogo filtrato, rivalidati | §Q6 (una funzione per opzioni e rivalidazione, `chosenRewardsOf`), P-3, P-4, P-5 |
| BE-GMFLOW-06 | Completamento in una transazione, sempre `gmCompleted` | §Q8 (ciclo di scrittura parametrico, effetto aggregato, nemici fusi) |
| BE-GMFLOW-07 | Ruolo innkeeper e audit; unit + integration; SDL al boot reale; handoff con worldMission e story d'esempio | §Q8 (audit automatico solo sulle mutation, C-3), §Q9 (SDL e matrice), §Q12 (handoff e dati UAT) |
| BE-GMFLOW-08 | Dall'avvio del flusso al risultato: stato «missione in corso» e rifiuto di viaggi, accettazioni, negozio, equipaggiamento, compagno, magie, pozioni | §Q7 (mutation, predicato, codici, emissione) |
| BE-GMFLOW-09 | Stesso blocco per ogni missione dall'inizio effettivo all'esito | §Q7(b) (`startDate` della corsia standard), C-1, P-1, P-6 |
</phase_requirements>

## Project Constraints (from CLAUDE.md e 22-REPO-RULES.md)

- Stack fisso NestJS 11 + Mongoose 8 + Apollo code-first; **nessuna dipendenza nuova** serve alla fase (verificato: tutto si appoggia a moduli esistenti).
- TDD RED → GREEN → REFACTOR, commit `test(...)` prima di `feat(...)`; titoli dei test con `(D-NN)`; il grep cerca `D-NN)`.
- Nessun push/PR/`gh`/fetch dagli esecutori; nessun trailer `Co-Authored-By`/`Generated with`/`Claude-Session`.
- Mai `npm run lint`/`format`/`build`/`nest build`; solo `npx prettier --write <file>`, `npx eslint <file>`, `npx tsc --noEmit -p tsconfig.json`.
- Jest: percorsi prima di `--selectProjects`; integration `--runInBand`; mai in background; trappola 15-03 (spec appesa → `kill -TERM`); nessun `jest.mock(` di moduli (override di provider); una spec unit non importa `AppModule`; `FixedClock`; nessun `Math.random`/`Date.now` nel codice della fase; **ogni tiro nuovo va dopo quelli esistenti e solo quando serve** (qui: la simulazione non tocca la `ChanceSource` condivisa, il completamento guidato non tira nulla).
- Mai intersezioni con interfacce negli update di Mongoose.
- SDL: `src/schema.gql` si rigenera solo col boot reale (`npx jest test/app.int-spec.ts --selectProjects integration --runInBand`) e si committa nel piano che cambia i decoratori; ogni handler innkeeper nuovo entra in `EXPECTED_INNKEEPER_HANDLERS` + fixture della matrice nello stesso piano (RED prima).
- Nessun file di contenuto nel repo (D-36), nessuna variabile d'ambiente nuova, log con soli id/conteggi/`describeError`; operatori Mongo solo in code span nei `.md` e mai nei titoli dei test.
- Regole invalicabili del progetto rilevanti: il backend è la fonte di verità (simulazione, blocco, catalogo filtrato tutti server-side); nessun secret.

## Risposte alle domande

### Q1 — Il completamento di oggi, da capo a fondo

**Cos'è una «richiesta».** Una voce di `pendingRequests` è **una PendingQuest di una corsia del GM di un personaggio attivo** (`pending-requests.service.ts:25-33,66-125`, builder `pending-requests.builder.ts:80-87,120-162`): una story = una voce; una worldMission con N iscritti = **N voci**, una per PendingQuest, tutte con lo stesso `quest.id`. Il «Gruppo · N» della FE nasce lato FE: `cardKeyOf` raggruppa per `quest.id` le sole worldMission (`lib/models/pending_request/request_card.dart:66-71`), la carta usa l'id della prima voce (`:95-100`) e la pedina del teleport si etichetta `Gruppo · ${companionIds.length + 1}` (`lib/models/travel/teleport_target.dart:26-28`). Lato BE, `completePendingRequest` accetta **qualunque** PendingQuest della worldMission e la espande a tutti i titolari attivi (`gm-completion.service.ts:205-208,215-234`). [VERIFIED: codebase]

**Flusso.** `complete` (`:123-155`): `readRequest` (`:180-212`: PendingQuest → titolare attivo in una corsia GM → quest → corsia; worldMission → tutti i titolari) → `assertNoBusyParticipant` (corsia standard occupata = `QUEST_IN_PROGRESS`, `:98-103`) → `validateOverrides` fuori transazione → `readCatalog(quest, partecipanti)` (nemici **di `quest.infos.enemies`**, magie, loot, pet, premi) → `commit` (`:266-357`): transazione; snapshot in sessione per ogni posto (`snapshotInSession`, `resolution-loader.service.ts:385-395`); riconvalida degli override; per ogni posto `planParticipant` con `verdict: gmCompleted`, `battle` = override o `null`, `enemies: enemyFactsOf(catalog)`, `victory: victoryKnowledgeOf(catalog)`, `rewards: drawRewards(prizeBlockFor(quest, snapshot.status.title), catalog.rewards, this.chance)` (`:302-326`); `writer.writeParticipant` + `writer.deletePendingQuest` (`:327-331`); `writer.updateQuest(questUpdateOf(...))` (worldMission conclusa, `:343-349`); dopo il commit `writer.deliver` (push `questEnd`, consegna dei risultati, job di recupero delle magie). [VERIFIED: codebase]

**Cosa si scrive.** Per personaggio un solo `$set` (`outcome-plan.ts:504-529`): xp, livello, vita, ferite, inventario, corsia del GM a `null`, titolo (story vinta del titolo esatto), magie spese/imparate, `completedQuests`, pet posseduti; `$addToSet` della conoscenza (`:497-501,533`); il filtro riafferma la corsia standard libera per le corsie GM (`participantFilter`, `:374-386`). Un `QuestResult` per posto con `enemies` = voci della quest (`:566`). [VERIFIED: codebase]

**Come si calcolano oggi** per `gmCompleted`: xp dei nemici = Σ `xp × quantity` dei nemici **della quest** (`combatant-plan.ts:80-96`), dati a chi vince anche senza override (`gm-completion.service.ts:313-315`); xp del compagno = quota dei soli xp dei nemici (`companionXpAward`, `outcome-plan.ts:474-478`); conoscenza/lore di vittoria = id e lore dei nemici del catalogo (`victory-knowledge.ts:37-51`, applicata in `outcome-plan.ts:484-501`); premi = un tiro dal blocco del titolo con la `ChanceSource` condivisa. [VERIFIED: codebase]

**Cosa deve cambiare per più scontri e premi scelti.** `planParticipant` resta il solo piano: riceve (a) un **effetto aggregato** degli scontri (vita = quella corretta dell'ultimo scontro; ferite = unione delle aggiunte; consumi e magie = somme), (b) `EnemyFacts` dei **nemici degli scontri** fusi per id nell'ordine di prima comparsa, (c) `VictoryKnowledge` dello stesso catalogo, (d) `DrawnRewards` **costruiti dai premi scelti** senza tiri (`chosenRewardsOf`, §Q6). Il ciclo transazionale di `commit` va reso parametrico (strategia per posto: `battleOf(snapshot)`, `rewardsOf(snapshot)`, `enemies`, `victory`), così vecchio e nuovo completamento condividono scrittura, cancellazione delle PendingQuest, conclusione della quest e consegna (D-08 «come oggi»). Le spec di `gm-completion.service.int-spec.ts` fanno da guardia di regressione del refactor (restano verdi). [VERIFIED: codebase]

**Asserzioni pinnate che andranno RED:** nessuna nel percorso del completamento di oggi (si aggiunge un servizio, il vecchio resta). Le RED della fase sono nella tabella F (§Q10).

### Q2 — Simulazione a secco (D-04) — SONDA 1

**Sonda 1 (eseguita, file cancellato).** `test/_probes/gm22-probe.int-spec.ts` su `createOutcomeHarness` con `ChanceSource` = `SequenceChance` condivisa: due personaggi iscritti alla stessa worldMission (vita 800 e 900 su 1000), un nemico; dump grezzo ordinato di `characters`, `pendingquests`, `questresults`, `quests`; `ResolutionLoader.readCombatCatalog([{ enemy, quantity: 2 }], snapshots, …)` + `buildCombatContext` + `new PlaceholderCombatResolver().resolve(ctx, own)` con `own = new SequenceChance([0.1, 0.5, 0.1, 0.3, 0.9])`; secondo scontro costruito sugli snapshot sovrapposti (vita = `hpAfter` del primo); dump di nuovo. Comando: `npx jest test/_probes/gm22-probe.int-spec.ts --selectProjects integration --runInBand`. Esito:

```
PROBE1 {"equalDb":true,"sharedDrawn":0,"ownDrawn":[0.1,0.5,0.1,0.3,0.9,0.99,0.99],
 "fight1":{"verdict":"failure","participants":[{"characterId":"…aae","hpAfter":700,"injuriesAdded":[],"consumablesUsed":[],"spellsUsed":[]},
                                               {"characterId":"…abe","hpAfter":800,"injuriesAdded":["crushedRightHand"],…}]},
 "fight2HpIn":[700,800],
 "fight2":{"verdict":"failure","participants":[{"…aae","hpAfter":600,…},{"…abe","hpAfter":700,"injuriesAdded":[],…}]}}
```

Quindi: nessuna scrittura (`toEqual` dell'intero dump verde), la sorgente condivisa resta a **zero tiri** (una risoluzione reale successiva parte dal suo primo valore), il secondo scontro parte dalla vita lasciata dal primo. [VERIFIED: probe]

**Quale porta del caso.** La `ChanceSource` è un solo token (`quest-outcomes.module.ts:96`), e gli harness la sostituiscono per token in tutti i moduli (`:112-113`, `test/quests/outcome-world.ts:167`). Raccomandazione: **classe astratta nuova `MissionSimulationChance extends ChanceSource`** (token distinto, binding `useClass` su un'implementazione `Math.random` come `MathChanceSource`) iniettata solo nel servizio di simulazione. Le spec a seme fisso (13/16/19/21) non la vedono e il loro ordine dei tiri non cambia; le spec della simulazione sovrascrivono `MissionSimulationChance` con una `SequenceChance`. Il completamento guidato **non tira nulla** (premi scelti, effetti corretti). [VERIFIED: codebase + probe]

**Cosa restituisce oggi la porta** (`combat-resolver.ts:76-96`): `CombatResolution { verdict, participants: ParticipantEffects[] }`, con `ParticipantEffects = { characterId, hpAfter, injuriesAdded, consumablesUsed: { itemId, quantity }[], spellsUsed: { spellId, usages }[] }`. Il verdetto è **uno per scontro** (A3, `:84-88`; segnaposto `placeholder-combat-resolver.ts:109-126`: un tiro di vittoria, poi per partecipante ordinato per id il tiro della ferita e, se < 0,2, quello della scelta). Manca per D-04: (a) un esito **per personaggio** distinto (→ C-5: l'esito per personaggio è il verdetto dello scontro), (b) `hpBefore` per la UI (lo calcola il servizio dalla sovrapposizione), (c) **il compagno**: `CombatParticipant` non ha pet (`combat-resolver.ts:44-54`; nessun riferimento a pet in `src/quests/outcomes/combat/`) → C-2. [VERIFIED: codebase]

**Sovrapposizione dello stato (scontro N dallo stato corretto di N-1).** Funzione pura nuova `stateBeforeFight(snapshot, correctedOutcomes[])` in `src/quests/guided/fight-state.ts` che restituisce uno snapshot `ResolutionCharacter` con: `status.currentLifePoints` = `hpAfter` corretto dell'ultimo scontro; `status.injuries` via `woundsAfter` (`outcome-plan.ts:239-247`); `assets.ownedItems` meno i consumi via `consumablesSpent` (`:250-267`) + `applyTradeToInventory`; `status.spellStates` meno gli usi via `spellsSpent` (`:295-337`) con mappa dei tempi vuota (nessun istante di recupero nella simulazione). Lo snapshot sovrapposto entra **sia** in `readCombatCatalog`/`buildCombatContext` (simulazione) **sia** in `overrideParticipantOf` (validazione delle correzioni, §Q5): una sola sorgente dello «stato all'inizio dello scontro i». Nessun I/O, nessuna mutazione dello snapshot letto (copie). [VERIFIED: codebase; forma: default tecnico]

### Q3 — Lista dei nemici (D-03)

**Come sono oggi.** `zonePoolOf(enemies, poiTypes, options)` (`src/quests/generation/enemy-pool.ts:45-55`) tiene i nemici `isPoolable` (`legendary === false`, animali esclusi di default, `:26-28`) che vivono in un tipo del POI o hanno habitat `city` (`livesIn`, `:33-39`; `all` escluso), ordinati per id; `fallbackPoolOf` (`:58-70`) aggiunge `all`. I candidati si leggono con `readEnemyCandidates` che filtra già `legendary: false` a DB (`enemy-candidate.ts:44-63`). Le fasce: `RANK_XP_BANDS` solo per `rookie..hero` (`generation-rules.ts:11-17,26-53`: rookie 1–20, adventurer 21–69, paladin 70–224, mage 225–548, hero 549–803); `legend` non ha fascia e «gioca le hero» (13.1 D-02). [VERIFIED: codebase]

**Luogo del gruppo.** `PointOfInterest.type: PoiType[]` (`point-of-interest.model.ts:13-15`): un marker di città ha `city` fra i tipi, un POI interno i suoi (es. `ruins`, `forest`). Il luogo per la lista è `draft.place` (scritto dalla FE dopo il teleport) o, senza bozza/luogo, `status.location` del primo partecipante della richiesta. I leggendari sono `Enemy.legendary: true` (`enemy.model.ts:61-64`, scritto dal migratore della Phase 13); DB di sviluppo: 206 nemici, 178 non leggendari (`15-CONTEXT.md:120`; 205/28 al 2026-11-05 in `13-…/BACKEND-NOTES.md:444`; il brief dice 22: il conteggio esatto va riletto dall'orchestratore) [CITED: .planning]. Payload del bestiario intero ≈ 206 `Enemy` con `relatedLore` e `spells` popolati: piccolo.

**Rango della missione.** story: `requirements.minTitle` (la story si accetta col titolo esatto, `quest-eligibility.ts:82-92`); worldMission: posti per titolo (`requiredAdventurers`, D-02 della Phase 21 vieta i posti null). Default tecnico (P-9): **fascia unione** da `minTitle` al titolo più alto dei posti, `legend` → `hero`.

**Regola proposta (pura, `src/quests/guided/mission-enemy-pool.ts`):** `missionEnemyPoolOf(enemies, { poiTypes, band, legendaries })` = `livesIn` (stessa regola di `zonePoolOf`, riusata esportandola), animali **inclusi** (opzione `included` già prevista, `enemy-pool.ts:19-23`), `xp` dentro la fascia, più — solo per `worldMission` — i leggendari che vivono nella zona **senza filtro di fascia** (P-2); pool di zona vuoto → stessa regola con `all` (come `fallbackPoolOf`); `showAll: true` → l'intero bestiario, leggendari compresi. Ordinamento: `xp` crescente, poi nome, poi id (stabile). Lettura: un `enemyModel.find` con `ENEMY_WIRE_POPULATE` (`enemies.service.ts:13-31`, servizio già esportato da `EnemiesModule`) + la lore `animal` non serve più (animali inclusi). [VERIFIED: codebase; regola: default tecnico + P-2/P-9]

**Il tipo `Enemy` basta** (nome, `imagePath`, `xp`, `lifePoints`, `locations`, `legendary`, `weaknesses`, `relatedLore`: pinnato in `test/app.int-spec.ts:386-387`, invariato). **Firma:** `missionEnemies(pendingQuestId: ID!, showAll: Boolean = false): [Enemy!]!` (nome di bozza confermato).

### Q4 — Dove vive la bozza (D-09)

**Collection propria `missiondrafts`** (modello `MissionDraft`, `@Schema` con `@Prop`, separato dal read model GraphQL), non un sotto-documento: una worldMission ha N PendingQuest (C-7) e una story ha una PendingQuest ma la stessa Quest può essere in corsia a più personaggi in modo indipendente (`request_card.dart:66-71`: le story non sono collegate), quindi né la Quest né la singola PendingQuest sono la chiave giusta. Forma:

```
MissionDraft {
  quest: ObjectId
  questType: 'story' | 'worldMission'
  participants: [{ character, pendingQuest, name, title, maxLifePoints }]   // fotografati all'avvio
  step: 'teleport' | 'fights' | 'prizes' | 'recap'
  place: ObjectId | null                                                    // POI
  fights: [{
    enemies: [{ enemy, quantity }],
    verdict: 'success' | 'failure' | null,                                  // null = non simulato
    outcomes: [{ character, hpBefore, simulated: Effects | null, corrected: Effects }]
  }]
  prizes: [{ character, coins, xp, items: [{ itemType, item, quantity }], pet, spell, cure: QuestCure | null }]
  startedBy: ObjectId (utente), startedAt, updatedAt
}
Effects = { hpAfter, injuriesAdded, consumablesUsed: [{ item, quantity }], spellsUsed: [{ spell, usages }] }
```

- **Una bozza per richiesta-gruppo**, garantita da un **indice unico multikey su `participants.pendingQuest`** (unicità fra documenti diversi: due bozze della stessa worldMission collidono su qualunque PendingQuest condivisa) + indice su `participants.character` (letture del gruppo). Ogni operazione è indirizzata da **qualunque** PendingQuest della richiesta, come `completePendingRequest` oggi.
- **Marcatore del blocco sulla PendingQuest:** `PendingQuest.missionDraftStartedAt: Date | null` (`@Prop` senza `@Field`, mai sul filo: `PendingQuest` è leggibile dal proprietario via `pendingQuest`), scritto su tutte le PendingQuest della richiesta nella **stessa transazione** che crea la bozza e azzerato (`$set` a `null`, non `$unset`: sonda 3) in quella che la scarta. Motivi: (1) `findOne` ha già le PendingQuest popolate → `missionInProgress` senza letture in più; (2) il change stream della PendingQuest vede avvio e scarto (sonda 3) → ripubblicazione dei titolari; (3) **autoriparante**: se la PendingQuest sparisce (completamento, cancellazione a mano) il blocco sparisce con lei. → C-6.
- **Concorrenza (due dispositivi dell'oste):** default tecnico **last-write-wins per sezione** (ogni mutation restituisce la bozza intera, la FE la rimpiazza); nessun campo versione né codice nuovo (T-1). L'invalidazione lato server (sotto) impedisce che un dispositivo indietro tenga simulazioni non più valide.
- **Invalidazione quando la richiesta sparisce.** Chi cancella PendingQuest oggi: risoluzione standard/boss/soccorso (`quest-resolution.service.ts:133`, `boss-resolution.service.ts:174,187`, `rescue-resolution.service.ts:444,454`), completamento del GM (`gm-completion.service.ts:327-331`, l'unico per le corsie GM), abbandono (`party-abandon.service.ts:48-52`, solo standard prima dell'avvio), liberazione dei registrati (`registered-release.ts:54-58`, solo standard), imboscata persa (`ambush-resolution.service.ts:542-550`, solo standard). L'archivio **non tocca** le PendingQuest (`archived-character-queue.refresher.ts:13`). Per le corsie GM quindi: (a) entrambi i completamenti cancellano la bozza **nella loro transazione** (`completePendingRequest` compreso, T-6); (b) un partecipante archiviato a bozza aperta resta nella bozza ma esce dai posti al completamento (come oggi, filtro attivi); (c) PendingQuest cancellata a mano → la bozza orfana si cancella pigramente alla prima lettura (`missionDraft`/mutation: nessuna PendingQuest della bozza ancora in corsia → bozza eliminata, risposta come «nessuna bozza»). Nessun TTL né sweep.
- **Lettura dell'oste:** query propria `missionDraft(pendingQuestId: ID!): MissionDraft` (nullable) all'apertura del wizard; più un campo leggero sulla coda **`PendingRequest.missionDraftStartedAt: DateTime`** (dal marcatore, letto nella proiezione esistente della PendingQuest, `pending-requests.service.ts:82`) perché la carta mostri «in corso/Riprendi» anche sull'altro dispositivo. Serve allora un **refresher della coda** sugli update del marcatore (gemello di `ArchivedCharacterQueueRefresher`, `archived-character-queue.refresher.ts:13-48`, che chiama `PendingRequestsPublisher.requestRefresh()`): un publisher nuovo, nessun cambio alla pipeline esistente (che è pinnata, `pending-requests.publisher.spec.ts:110-115`). La bozza intera **non** entra nella coda (payload e WS).
- **Granularità delle mutation (il minimo che tiene il BE proprietario):** `startMissionDraft` (crea, marca, precompila i premi dal blocco; idempotente), `simulateMissionFight` (scrive i nemici dello scontro i e lo simula), `saveMissionDraft` (sezioni opzionali: `step`, `place`, `fights` con nemici e correzioni, `prizes`; ogni sezione presente rimpiazza, il BE valida e invalida), `discardMissionDraft`, `completeGuidedMission`. Le mutation per passo (setPlace, setFights, correctFight, setPrizes) moltiplicherebbero handler, fixture della matrice e audit senza dare più controllo al BE.
- **Invalidazione delle simulazioni a valle (discrezione):** lo scontro i **tiene** la simulazione solo se i suoi nemici e, per ogni j < i, nemici **e** correzioni sono invariati; altrimenti `verdict` e `simulated` tornano `null` e `corrected` torna vuoto (da rifare). Rilanciare lo scontro i (D-05) azzera la simulazione degli scontri > i (partivano dal suo stato). Correggere lo scontro i azzera le simulazioni > i.

### Q5 — Correzioni (D-06)

**Regole di oggi** (`gm-overrides.ts`): voci per partecipante esadecimali, mai doppie, tetto `MAX_OVERRIDE_ENTRIES = 50` (`complete-pending-request.model.ts:16`, `gm-overrides.ts:30-36,156-157`); `hpAfter` intero sicuro in `[MIN_LIFE_POINTS=1, max dello snapshot]` (`:69-81`); ferite dell'enum, deduplicate (`:83-88`); consumi e usi interi positivi, sommati per id, mai oltre il posseduto/gli usi delle sole voci **attive** (`:91-127`, limiti da `overrideParticipantOf`, `:42-66`); id fuori dai partecipanti = `OUTCOME_NOT_PARTICIPANT` (`:164-165`), il resto `OUTCOME_OVERRIDE_INVALID`. [VERIFIED: codebase]

**Per scontro:** le correzioni dello scontro i sono **l'effetto completo** dello scontro (stessa forma di `ParticipantOverrideInput`), validate con `validateOverrides(corrections, participants.map(p => overrideParticipantOf(stateBeforeFight(snapshot, corrected[0..i-1]))))` — nessuna funzione nuova di validazione: lo stato sovrapposto dà vita, posseduto e usi rimasti. «Togliere ferite» = togliere dalla lista le ferite **aggiunte** dalla simulazione; aggiungere = una ferita dell'enum non ancora presente; le ferite già possedute non si tolgono (la guarigione è il premio `cure`; `woundsAfter` ignora i duplicati) → C-9. **Stato finale** = stato dopo l'ultimo scontro corretto; al completamento l'effetto aggregato (§Q1) si **rivalida** con `validateOverrides` sullo snapshot in sessione (somme ≤ posseduto all'inizio) e la sequenza per scontro si ricontrolla sulla sovrapposizione in sessione: con il blocco attivo lo stato non può cambiare, quindi un errore qui è solo difesa in profondità.

### Q6 — Premi per personaggio (D-07)

**Blocco.** `prizeBlockFor(quest, title)` (`src/quests/prizes/rank-prizes.ts:92-105`): blocco del titolo esatto, poi il più alto non superiore, poi il più basso; senza blocchi validi la quest vale un blocco sul `minTitle` (`prizeBlocksOf`, `:64-70`, ripiego D-18 della Phase 21). Story (solitaria, non in `GROUP_PRIZE_TYPES`, `:7-11`) → premio unico sul `minTitle`. [VERIFIED: codebase]

**Tetto di rarità per titolo.** `LOOT_POOLS` ha solo le tabelle `boss` ed `enemy` (`loot-pools.ts:28-56`); il tetto è la rarità massima degli slot (`petRarityCapOf`, `pet-prize.ts:79-90`). Tetti: tabella boss rookie `common`, adventurer `uncommon`, paladin `rare`, mage `ultrarare`, hero `legendary`; tabella enemy rookie/adventurer `common`, paladin `uncommon`, mage `rare`, hero `ultrarare`; `legend` → `hero`. Quale tabella per le missioni del GM è una scelta di prodotto (P-3; default: boss per la worldMission, enemy per la story, come il gruppo/solitaria della Phase 21). Pet: stesso tetto, solo `rarity` dell'enum (fail-closed come `isRarity`, `pet-prize.ts:59-60,96-98`). Magie: solo se `isSpellCaster(title)` (`active-spell-slots.ts:12-22`) e `minXpToLearn ≤ xp` del personaggio e non già nota; le magie non hanno rarità (`spell.model.ts:35,43`).

**Una sola funzione per catalogo e rivalidazione:** `missionPrizeOptionsOf({ block, title, xp, knownSpells, ceilingTable, catalogue })` pura in `src/quests/guided/mission-prizes.ts` → `{ allowedItems, allowedPets, allowedSpells, maxRarity }` = **voci del blocco** (ammesse così come sono: «la mano vince», Phase 21 D-06) ∪ catalogo filtrato. La query la serve; `saveMissionDraft` (sezione `prizes`) e `completeGuidedMission` la richiamano e rifiutano ogni voce fuori dall'insieme con `OUTCOME_OVERRIDE_INVALID` (riuso del codice, nessun codice nuovo; la FE ha già il classificatore). Catalogo letto come `readPrizeCatalog` (`prize-catalog.ts:21-55`: equipaggiamenti e loot con rarità) + pet + magie.

**Monete e xp:** default tecnico (P-4) — interi `0..valore del blocco` (si può togliere o ridurre, non aumentare); oggetti: quantità `1..10` per voce, voci ≤ `MAX_OVERRIDE_ENTRIES`; **un** pet e **una** magia per personaggio (forma di `DrawnRewards`, `quest-rewards.ts:59-73`, e di `QuestPrizes`); `cure`: quella del blocco tenuta o tolta (`cure: Boolean!` nell'input), mai aggiunta dal catalogo (non esiste un catalogo di cure).

**Precompilazione (P-5):** all'avvio della bozza, per ogni partecipante, il blocco del suo titolo così com'è: monete, xp, `prizeItem`, **tutte** le voci di `randomLoot` (che nel blocco sono un pool da cui oggi si tira una voce a cascata, `cascading-loot.ts`), pet, magia (se insegnabile), cura. L'oste toglie.

**Applicazione al completamento:** `chosenRewardsOf(prize, rewardCatalog)` pura → `DrawnRewards` senza tiri: `coinsCopper` = `toCopper(coins)`, `xpPrize`, `items` = voci scelte (tipo risolto dal catalogo), `pet` + `petLifePoints` + `petLore` dal catalogo dei pet, `spellCandidate` dalla magia scelta (`minXpToLearn`, `maxUsages`), `spellDraw: null`, `loreDraw: null`, `cure` del blocco o `null`. `planParticipant` applica i cancelli di sempre (pet già posseduto ignorato, `canLearnSpell` col titolo dopo l'esito, `cureOf`). Il catalogo dei premi va letto sull'unione dei ref scelti: `readRewardCatalog(quest)` (`resolution-loader.service.ts:566-601`) va spezzato in `readRewardCatalogFor(refs)` (Boy Scout, nessuna duplicazione).

**Forma proposta:** query `missionPrizeOptions(characterId: ID!, pendingQuestId: ID!): MissionPrizeOptions!` con `block: QuestPrizes!` (blocco letto con `QUEST_CATALOG_POPULATE` e `dropOrphanCatalogRefs`, come `Quest.rankPrizes`), `equipment`, `loot`, `pets`, `spells`, `maxRarity`, `title`; input `MissionPrizeInput` (SDL in §Q9). Conteggi del catalogo da fonti di fase (non riletti a DB): ~172 equipaggiamenti e ~101 loot (`11-…/BACKEND-NOTES.md:17`), 44 pet, 92 magie (`13-…/BACKEND-NOTES.md:444`) [CITED: .planning]: lista intera ≈ 400 voci nel caso peggiore (hero), payload accettabile per una query esplicita dell'oste.

### Q7 — Il blocco (D-10, D-11, D-12)

**(a) Mutation coinvolte e guardie di oggi** [VERIFIED: codebase]:

| Mutation | Resolver | Servizio | Guardie di oggi | Missione avviata oggi |
|----------|----------|----------|-----------------|-----------------------|
| `equipItem` | `characters.resolver.ts:63-70` | `characters.service.ts:174-198` | possesso nel filtro (`equipItemFilter`) | permessa |
| `equipPet` | `:73-80` | `:201-220` | pet posseduto; «ammesso anche in viaggio» | permessa |
| `unequipPet` | `:82-89` | `:222-230` | personaggio attivo | permessa |
| `equipSpell` | `:91-98` | `:232-264` | magia nota, capienza sul documento vivo | permessa |
| `unequipSpell` | `:100-107` | `:266-288` | magia attiva | permessa |
| `useSpell` | `:109-118` | `:317-367` | voce attiva con usi | permessa |
| `useItem` | `src/characters/items/item-use.resolver.ts:14` | `item-use.service.ts:44-97`, piano `item-use.plan.ts:228-235` | `AWAITING_AID`, posseduto, usabile, ricarica, effetto | permessa |
| `doTransaction` | `characters.resolver.ts:53-61` | `shop-transaction.service.ts:151-227` | prigione, poi `SHOP_NOT_IN_CITY` (viaggio, soccorso, non sul marker della città) | permessa sul marker della città |
| `startTravel` | `travel.resolver.ts:17-30` | `travel.service.ts:119`, filtro `travel.updates.ts:52-65`, classificazione `:73-82` | `STANDARD_LANE_FREE` → `QUEST_IN_PROGRESS`; soccorso, viaggio, prigione | rifiutata se corsia standard occupata; **permessa con una sola corsia GM** (flusso guidato) |
| `acceptQuest` | `quest-acceptance.resolver.ts:23` | `quest-acceptance.service.ts:187-202`, `classifyEligibility` `quest-eligibility.ts:167-196` | soccorso, viaggio, già presa, titolo, **stessa corsia** occupata (`:184-185`), posti | standard rifiutata (`QUEST_SLOT_BUSY`); **story/worldMission permesse** durante una standard avviata (spec `quest-acceptance.service.int-spec.ts:476-491`) |

Fuori dal blocco: `abandonQuest` (si abbandona solo sul marker **prima** dell'avvio, `party-rules.ts:84-94`; le corsie GM non si abbandonano: `party-abandon.service.ts:81-…` legge solo la standard) → mai possibile a blocco attivo, nessuna modifica (risposta a (f): non è una decisione da prendere); `teleportCharacter` dell'oste (D-01: deve restare libero durante il flusso guidato; già rifiutato con la corsia standard occupata, `travel.updates.ts` `teleportFilter`); `deleteCharacter` (P-8, default: non bloccata); `acknowledgeQuestResult`, push, auth.

**(b) «Missione in corso», definizione precisa:**
- **Corsia standard:** `quests.pendingQuest` → PendingQuest con `startDate != null`. Copre: solitarie (`hunt`, `dungeon`, `job`, `heal`, `study`, `magic`, `crime`, `guard`) dall'arrivo sul marker (`soloStartDateOf`, `quest-start.service.ts:84-91`; arrivo `travel-completion.service.ts:222-250`; accettazione sul marker `quest-acceptance.service.ts:229-234`); registrate (`enemy`, `boss`, `aid` dei soccorritori, `quest-eligibility.ts:40-45`) dall'avvio del party (`startParty`); dungeon = solitaria. In viaggio verso il marker o in attesa del gruppo: **non** bloccato (viaggi e accettazioni standard già fermi per la corsia occupata).
- **Corsie GM:** la `startDate` è scritta all'accettazione (`party-rules.ts:97-107`) e **non** conta; conta solo `missionDraftStartedAt != null` (flusso guidato).
- **Soccorso:** il ferito ha la corsia libera e `status.awaitingAid` (già rifiutato da viaggio, accettazione, negozio, `useItem`): non è «missione in corso» (P-6). I soccorritori: registrati → coperti dall'avvio del party.
- **Imboscate (Phase 15):** non sono missioni, nessun blocco (il viaggio non si avvia a blocco attivo comunque).
- Rilascio (h): risoluzione/completamento (PendingQuest cancellata e corsia a `null` nella stessa transazione), scarto della bozza (marcatore a `null`), sconfitta (corsia a `null`, eventuale `awaitingAid`), aid conclusa, archivio (personaggio fuori dagli attivi). Le missioni del GM non scadono: solo completamento o scarto sbloccano.

**(c) Un solo predicato:** puro `missionInProgressOf(lanes)` in `src/characters/mission-lock/mission-lock.ts` che riceve le PendingQuest delle corsie (popolate o lette) e risponde `standard.startDate != null || story.missionDraftStartedAt != null || worldMission.missionDraftStartedAt != null`; `MissionLockReader` (stesso modulo, `MongooseModule.forFeature([Character, PendingQuest])`, esportato) con `isLocked(characterId, session?)` = 1 lettura delle corsie del personaggio + 1 `exists` sulle PendingQuest con la condizione per corsia; `assertFree(characterId, session?)` lancia `GameRuleException.missionInProgress()`. Ogni servizio lo chiama dopo il parsing degli id e prima delle letture di catalogo; `useItem` lo legge **in sessione** e lo passa al piano puro (`refuseWhileOnMission` dopo `refuseWhileAwaitingAid`). Costo: 2 letture indicizzate per mutation. **Corsa residua dichiarata:** la guardia è lettura-poi-scrittura; un avvio che fa commit fra la lettura e l'update (millisecondi) non è visto. Chiuderla richiederebbe il blocco persistito sul personaggio con N punti di rilascio (rischio di blocchi eterni): scartato.

**(d) Codici.** Nuovo `GameRuleErrorCode.MISSION_IN_PROGRESS` (messaggio proposto «Missione in corso: azione non disponibile fino al risultato»). **Precedenza: i codici esistenti vincono dove già scattano** (corsia standard occupata → `QUEST_IN_PROGRESS` in viaggio/teleport, stessa corsia → `QUEST_SLOT_BUSY`, `AWAITING_AID`, `TRAVEL_IN_PROGRESS`, `CHARACTER_IMPRISONED`); `MISSION_IN_PROGRESS` solo dove oggi l'azione passerebbe. Ordine nel negozio: dopo la prigione, prima di `SHOP_NOT_IN_CITY`. Sanificazione: il codice passa da solo (`format-domain-error.ts:55-65`, `production-errors.ts:15-40`), nessuna chiave in più nelle extensions, nessun cambio ai formatter. `QUEST_IN_PROGRESS` non è adatto (significa «corsia standard occupata» e la FE lo mappa sul viaggio, `innkeeper_failure.dart`, `travel_failure.dart`).

**(e) `CharacterStatus.missionInProgress`.** `@ResolveField` in `CharacterStatusResolver` (`character-status.resolver.ts:5-11`): `status.$parent()` dà il personaggio idratato (**sonda 2:** `parentIsDoc: true`, corsie popolate in `findOne`; con `findById` senza populate le corsie sono `ObjectId`). Se le corsie sono popolate → predicato puro senza letture; se sono id (es. `User.currentCharacter`, `users.service.ts:18-21`) → `MissionLockReader.isLocked`; senza `$parent` (oggetto piatto) → `false` (campo di sola visualizzazione; l'autorità è la guardia). Il PubSub è in memoria (`pubsub.module.ts`, «un solo PubSub in memoria») e passa il documento per riferimento: se un giorno diventasse Redis il `$parent` andrebbe perso (nota per BE-FUT-02). **Emissione di `characterUpdated` senza scrittura sul personaggio:**
  - avvio standard da solo: l'arrivo scrive anche il personaggio (posizione) → evento del change stream dei personaggi; avvio del party (scrive solo PendingQuest): già coperto da `PendingQuestStartPublisher` (`pending-quest-start.publisher.ts:24-37,62-88`, solo corsia standard);
  - avvio/scarto della bozza: **publisher nuovo** `MissionDraftLockPublisher` (gemello, nel modulo dei personaggi) sugli update con `updateDescription.updatedFields.missionDraftStartedAt` presente (anche `null`, sonda 3), che ripubblica i titolari **delle corsie GM** via `CharacterUpdatesPublisher.requestPublish` (`character-updates.publisher.ts:43-45`); nessun cambio alla pipeline pinnata del publisher esistente (`pending-quest-start.publisher.spec.ts:163-178`);
  - completamento: scrive i personaggi → evento normale (la lettura dopo il commit vede la PendingQuest sparita → `false`).

**(f)** vedi (a): l'abbandono è già impossibile in ogni stato bloccato; nessuna decisione.

**(g) Raggio d'azione sulle spec esistenti.** Nessuna spec di equip/pozioni/negozio usa un personaggio con missione avviata (grep: le spec che chiamano quelle mutation non scrivono `pendingQuest`/`startDate`; il fixture ha `pendingQuest: null`, `test/fixtures/character.fixture.ts:43`). RED certe o probabili: tabella F (§Q10) — DI della spec unit di `CharactersService`, la spec del «story in parallelo», le stringhe dello SDL, la copertura dei codici.

### Q8 — Completamento (D-08)

`completeGuidedMission(pendingQuestId: ID!): [QuestResult!]!` **legge la bozza** (nessun input di stato: il BE è il proprietario). Rifiuti: bozza assente → `NOT_FOUND` (fabbrica nuova `ResourceNotFoundException.missionDraft()`, codice esistente); partecipante con corsia standard occupata → `QUEST_IN_PROGRESS` (come `assertNoBusyParticipant`); uno scontro senza esito per un partecipante (né simulato né corretto) o un premio fuori catalogo → `OUTCOME_OVERRIDE_INVALID`. Zero scontri è ammesso (missione narrativa, come oggi senza override; T-5). Transazione (riuso del ciclo parametrico di `GmCompletionService.commit`): snapshot in sessione; rivalidazione per scontro sulla sovrapposizione + aggregato con `validateOverrides`; rivalidazione dei premi con la stessa funzione delle opzioni; per posto `planParticipant` (`gmCompleted`, effetto aggregato, nemici fusi, conoscenza, premi scelti) + `writeParticipant` + `deletePendingQuest`; `updateQuest` (worldMission conclusa); `deleteOne` della bozza; dopo il commit `writer.deliver` e `QuestResultsService.readCommitted` come oggi (`pending-requests.resolver.ts:56-57`). Nessun tiro.

**Vecchio `completePendingRequest`:** confermata la bozza dell'orchestratore — **convive** in questa fase (la FE pre-gate continua a funzionare) e nella sua transazione **cancella la bozza** della richiesta se esiste (così nessuna bozza orfana; il blocco sparisce con le PendingQuest). Rimozione dopo la merge della FE Phase 21 (quick o fase successiva; cambio SDL non additivo).

**Audit:** automatico per ogni **mutation** con `@Roles(innkeeper)` (`admin-audit.interceptor.ts:74,77-78,106-114`); le query non sono mai auditate (D-16 della Phase 3) → C-3. Ogni mutation nuova dichiara `@AuditTarget('PendingQuest', ({ pendingQuestId | input }) => …)` come `completePendingRequest` (`pending-requests.resolver.ts:46-50`).

### Q9 — SDL proposto (VERBATIM, additivo, ordinato come lo emette Apollo con `sortSchema: true`, `graphql-options.factory.ts:54`)

```graphql
type CharacterStatus {
  activeTravel: ActiveTravel
  awaitingAid: AwaitingAid
  coins: Coins!
  currentLifePoints: Int!
  imprisonedUntil: DateTime
  injuries: [InjuryType!]!
  level: Int!
  location: PointOfInterest!
  maxActiveSpells: Int!
  maxLifePoints: Int!
  missionInProgress: Boolean!
  potionRecoveryUntil: DateTime
  spellStates: [SpellState!]!
  title: String!
  unlockedLore: [ID!]!
  xp: Int!
}

type MissionDraft {
  fights: [MissionFight!]!
  id: ID!
  participants: [MissionParticipant!]!
  place: ID
  prizes: [MissionPrize!]!
  quest: ID!
  questType: String!
  startedAt: DateTime!
  step: MissionDraftStep!
  updatedAt: DateTime!
}

enum MissionDraftStep {
  fights
  prizes
  recap
  teleport
}

input MissionEnemyInput {
  enemy: ID!
  quantity: Int!
}

type MissionFight {
  enemies: [MissionFightEnemy!]!
  outcomes: [MissionFightOutcome!]!
  verdict: MissionFightVerdict
}

type MissionFightEffects {
  consumablesUsed: [MissionItemUsage!]!
  hpAfter: Int!
  injuriesAdded: [InjuryType!]!
  spellsUsed: [MissionSpellUsage!]!
}

type MissionFightEnemy {
  enemy: Enemy!
  quantity: Int!
}

input MissionFightInput {
  corrections: [ParticipantOverrideInput!]
  enemies: [MissionEnemyInput!]!
}

type MissionFightOutcome {
  character: ID!
  corrected: MissionFightEffects
  hpBefore: Int!
  simulated: MissionFightEffects
}

enum MissionFightVerdict {
  failure
  success
}

type MissionItemUsage {
  item: ID!
  quantity: Int!
}

type MissionParticipant {
  character: ID!
  maxLifePoints: Int!
  name: String!
  pendingQuest: ID!
  title: String!
}

type MissionPrize {
  character: ID!
  coins: Coins!
  cure: QuestCure
  items: [MissionPrizeItem!]!
  pet: ID
  spell: ID
  xp: Int!
}

input MissionPrizeInput {
  characterId: ID!
  coins: CoinsInput!
  cure: Boolean!
  items: [MissionPrizeItemInput!]!
  pet: ID
  spell: ID
  xp: Int!
}

type MissionPrizeItem {
  item: ID!
  quantity: Int!
}

input MissionPrizeItemInput {
  item: ID!
  quantity: Int!
}

type MissionPrizeOptions {
  block: QuestPrizes!
  character: ID!
  equipment: [EquipmentItem!]!
  loot: [LootItem!]!
  maxRarity: RarityType!
  pets: [Pet!]!
  spells: [Spell!]!
  title: String!
}

type MissionSpellUsage {
  spell: ID!
  usages: Int!
}

type PendingRequest {
  character: PendingRequestCharacter!
  id: ID!
  missionDraftStartedAt: DateTime
  pointsSpent: Int!
  quest: PendingRequestQuest!
  startDate: DateTime
  user: PendingRequestUser!
}

input SaveMissionDraftInput {
  fights: [MissionFightInput!]
  pendingQuestId: ID!
  place: ID
  prizes: [MissionPrizeInput!]
  step: MissionDraftStep
}

input SimulateMissionFightInput {
  enemies: [MissionEnemyInput!]!
  fightIndex: Int!
  pendingQuestId: ID!
}

type Mutation {
  completeGuidedMission(pendingQuestId: ID!): [QuestResult!]!
  discardMissionDraft(pendingQuestId: ID!): CommonResponse!
  saveMissionDraft(input: SaveMissionDraftInput!): MissionDraft!
  simulateMissionFight(input: SimulateMissionFightInput!): MissionDraft!
  startMissionDraft(pendingQuestId: ID!): MissionDraft!
}

type Query {
  missionDraft(pendingQuestId: ID!): MissionDraft
  missionEnemies(pendingQuestId: ID!, showAll: Boolean = false): [Enemy!]!
  missionPrizeOptions(characterId: ID!, pendingQuestId: ID!): MissionPrizeOptions!
}
```

(Le righe di `Mutation`/`Query` sono **aggiunte** ai tipi esistenti; `GameRuleErrorCode.MISSION_IN_PROGRESS` non è nello SDL.)

**Nullabilità motivata:** `missionDraft` nullable (nessuna bozza è un caso normale, non un errore); `place` nullable (passo del teleport saltabile/da fare); `MissionFight.verdict` e `MissionFightOutcome.simulated` nullable (scontro non ancora simulato o invalidato); `corrected` nullable (invalidato, da rifare); `MissionPrize.pet`/`spell`/`cure` nullable (assenti); `PendingRequest.missionDraftStartedAt` nullable (nessun flusso avviato); `showAll` con default `false`. `MissionFightEnemy.enemy: Enemy!` popolato con `ENEMY_WIRE_POPULATE` e voci orfane scartate prima del filo (un `null` annullerebbe la bozza). Gli id di oggetti/magie/pet nella bozza restano `ID!` (la FE li risolve con `character(id)` e `missionPrizeOptions`, che già legge). Nomi di bozza mantenuti: `missionEnemies`, `simulateMissionFight`, `MissionDraft`, `startMissionDraft`, `saveMissionDraft`, `discardMissionDraft`, `missionPrizeOptions`, `completeGuidedMission`, `CharacterStatus.missionInProgress`, `MISSION_IN_PROGRESS`; **aggiunte motivate:** `missionDraft` (lettura per la ripresa, D-09) e `PendingRequest.missionDraftStartedAt` (stato sulla coda per l'altro dispositivo).

**Cosa pinna `test/app.int-spec.ts`:** `CHARACTER_STATUS_BLOCK` (`:86-87`, usata in `:519-521` e `:535-537`) → aggiungere `  missionInProgress: Boolean!\n` dopo `maxLifePoints`; `type PendingRequest` (`:836-838`) → riga `missionDraftStartedAt`; la superficie di autorizzazione (`:1271-1276`) confronta i metadati con `EXPECTED_INNKEEPER_HANDLERS`. Casi nuovi consigliati: un `it` per i blocchi nuovi (stringhe esatte di `type MissionDraft`, `input SaveMissionDraftInput`, le sei righe di `Query`/`Mutation`), con `(D-NN)` nel titolo.

**Matrice di autorizzazione:** resolver nuovo `GuidedMissionResolver` (`src/quests/guided/guided-mission.resolver.ts`, `@Roles(RoleType.innkeeper)` su ogni handler); 8 voci nuove in `EXPECTED_INNKEEPER_HANDLERS` (`test/authz/expected-handlers.ts:2-14`, ordine alfabetico: dopo `CharactersResolver.characters`): `GuidedMissionResolver.completeGuidedMission`, `.discardMissionDraft`, `.missionDraft`, `.missionEnemies`, `.missionPrizeOptions`, `.saveMissionDraft`, `.simulateMissionFight`, `.startMissionDraft` (11 → 19); una fixture per handler in `HANDLER_FIXTURES` (`test/authz/handler-fixtures.ts:49`, `Record<ProtectedHandler,…>`: senza fixture non compila), `target: 'none'`, variabili con `MATRIX_ANY_ID` (es. `{ pendingQuestId: ANY }`, `{ input: { pendingQuestId: ANY, fightIndex: 0, enemies: [] } }`, `{ characterId: ANY, pendingQuestId: ANY }`). Il resolve field `missionInProgress` non ha metadati di ruolo (nessuna voce).

### Q10 — Asserzioni pinnate (tabella F) e Wave 0

| # | File:riga | Cosa pinna | Perché va RED | Piano |
|---|-----------|------------|---------------|-------|
| F1 | `test/app.int-spec.ts:86-87` (+ `:519-521`, `:535-537`) | stringa esatta di `type CharacterStatus` | campo `missionInProgress` | resolve field |
| F2 | `test/app.int-spec.ts:836-838` | stringa esatta di `type PendingRequest` | campo `missionDraftStartedAt` | bozza |
| F3 | `test/app.int-spec.ts:1271-1276` + `test/authz/expected-handlers.ts:2-14` | handler innkeeper esatti | 8 handler nuovi | ogni piano che aggiunge handler |
| F4 | `test/authz/handler-fixtures.ts:49` (+ `handler-fixtures.spec.ts`) | `Record<ProtectedHandler,…>` | fixture mancanti = errore di `tsc` | idem |
| F5 | `src/gameRules/game-rule.exception.spec.ts:247-255` | ogni `GameRuleErrorCode` prodotto una volta | `MISSION_IN_PROGRESS` | fondazione del blocco |
| F6 | `src/characters/characters.service.spec.ts:78-93` | provider del `TestingModule` | `CharactersService` inietta `MissionLockReader` (DI fallisce per tutto il file) | guardie del personaggio |
| F7 | `src/quests/acceptance/quest-acceptance.service.int-spec.ts:476-491` | «runs a story in parallel with a pending standard quest» | la hunt sul marker parte subito (salto senza strada → `startDate` = ora, `soloStartDateOf`) → bloccato → `MISSION_IN_PROGRESS` (MEDIUM: dedotto dal codice, non eseguito) — solo se P-1 = rifiuto | guardie viaggio/accettazione |
| F8 | `src/quests/pending-requests/pending-requests.builder.spec.ts:127-` | `toEqual` di oggetti `PendingRequest` interi | campo nuovo | bozza |
| F9 | `src/quests/outcomes/combat/combat-context.spec.ts`, `placeholder-combat-resolver.spec.ts`, `dungeon/dungeon-context.spec.ts`, `dungeon/placeholder-dungeon-resolver.spec.ts` | contesti `toEqual` / letterali `CombatParticipant` (8 letterali con `activeSpells: [`) | solo se C-2 = compagno nel contesto | compagno |

Non vanno RED (verificato): `pending-quest-start.publisher.spec.ts:163-178` e `pending-requests.publisher.spec.ts:110-115` (publisher nuovi, pipeline esistenti intatte); `gm-completion.service.int-spec.ts` (guardia del refactor, deve restare verde); `type Enemy` (`app.int-spec.ts:386-387`) e `type QuestPrizes` invariati; nessuna spec di equip/pozioni/negozio usa missioni avviate.

**File di spec nuovi (Wave 0):**
- `src/characters/mission-lock/mission-lock.spec.ts` (predicato puro, tutte le corsie e i casi di (b))
- `src/characters/mission-lock/mission-lock.reader.int-spec.ts` (due letture, sessione)
- `src/characters/mission-lock/mission-draft-lock.publisher.spec.ts` (pipeline e titolari GM)
- `src/characters/mission-in-progress.int-spec.ts` (subscription `characterUpdated`: avvio standard da solo, avvio party, avvio e scarto della bozza, completamento; con `prime-change-stream.ts`)
- int-spec per mutation bloccata (uno per gruppo: personaggio, `useItem`, negozio, viaggio/accettazione)
- `src/quests/guided/fight-state.spec.ts`, `mission-enemy-pool.spec.ts`, `mission-prizes.spec.ts`, `chosen-rewards.spec.ts`, `draft-invalidation.spec.ts`
- `src/quests/guided/mission-draft.service.int-spec.ts`, `mission-simulation.service.int-spec.ts` (la sonda 1 come spec), `guided-completion.service.int-spec.ts`, `guided-mission.resolver.int-spec.ts`
- `src/quests/pending-requests/mission-draft-queue.refresher.spec.ts`

**Tempi stimati:** unit < 5 s per file; int-spec della fase 3–30 s ciascuna (la sonda 1: 0,2 s di test dopo il boot dell'harness); `test/app.int-spec.ts` e la matrice al boot reale sono le lente (minuti). **Soglie a rischio** (`package.json` `coverageThreshold`): `./src/economy/` 98/91/98 (guardia del negozio), `./src/characters/characters.service.ts` 96/88/98, `./src/quests/acceptance/` 97/91/98, `./src/travel/` 97/84/98; `./src/quests/generation/` 96/82/97 solo se si esporta/tocca `enemy-pool.ts`. `src/quests/guided/`, `src/characters/mission-lock/`, `src/quests/outcomes/` senza soglia. **Ripiego del gate** (`test:cov` ≈ 630 s > 600 s del tool): suite senza coverage (`npm run test:unit`, `npm run test:int` lanciati dall'orchestratore o divisi per cartella) + coverage per cartella delle soglie toccate, forma: `npx jest src/economy --selectProjects unit integration --runInBand --coverage --collectCoverageFrom='src/economy/**/*.ts'` (stesso schema per `src/quests/acceptance`, `src/travel`, `src/characters/characters.service.ts`).

### Q11 — Prettier

`npx prettier --check` eseguito su 49 file che la fase tocca o può toccare (servizi, moduli, resolver, modelli, publisher, `game-rule.*`, `enemy-pool.ts`, `rank-prizes.ts`, `quest-rewards.ts`, `test/app.int-spec.ts`, `test/authz/*.ts`, `characters.service.spec.ts`, `quest-acceptance.service.int-spec.ts`, `gm-completion.service.int-spec.ts`, ecc.): **tutti passano**, nessun commit `style(...)` preventivo previsto. [VERIFIED: prettier]

### Q12 — Contenuto del handoff (`BACKEND-NOTES.md` per la FE Phase 21)

1. SDL verbatim di §Q9 (dopo il boot reale) e il diff di `src/schema.gql`.
2. Semantica per passo: `startMissionDraft` (idempotente; marca i partecipanti; precompila i premi; rifiuti `NOT_FOUND`, `QUEST_IN_PROGRESS`), teleport invariato (D-01), `saveMissionDraft` (sezioni opzionali che rimpiazzano; regole d'invalidazione di §Q4; `OUTCOME_OVERRIDE_INVALID`, `OUTCOME_NOT_PARTICIPANT`, `NOT_FOUND` per nemico/POI inesistente), `simulateMissionFight` (scrive i nemici dello scontro e simula; azzera le simulazioni successive; può essere rilanciata), `missionEnemies` (regola e ordinamento), `missionPrizeOptions` (blocco + catalogo; le voci del blocco sono sempre ammesse), `discardMissionDraft`, `completeGuidedMission` (legge la bozza; mai una sconfitta scritta).
3. Codici per mutation bloccata (tabella di §Q7(a) con la precedenza) e copia italiana del messaggio; `MISSION_IN_PROGRESS` senza extensions in più.
4. Comportamento WS del blocco: `characterUpdated` arriva a inizio e fine (avvio standard, avvio party, avvio/scarto bozza, esito); `pendingRequestsUpdated` arriva anche ad avvio/scarto della bozza (campo `missionDraftStartedAt`); la bozza e le simulazioni non arrivano mai ai giocatori.
5. **Dati UAT da scrivere a DB con uno script (D-36), campo per campo:**
   - **worldMission** (collection `quests`): `infos { title, type: 'worldMission', markerLocation: ObjectId di un marker di città (POI con `city` in `type`), enemies: [] (o voci { enemy: ObjectId, quantity }), timeToComplete: null, relatedLore: [], description }`; `requirements { minTitle: 'paladin', requiredAdventurers: [{ title: 'mage', count: 1 }, { title: 'paladin', count: 1 }] (nessun posto null, Phase 21 D-02), requiredPoints: intero 1..MAX_QUEST_POINTS (obbligatorio per le corsie GM, `quest-eligibility.ts:125-141`), recommendedLoot: [] }`; `prizes { prizeCoins, xpPrize, prizeItem, randomLoot: [], spell: null, pet: null, cure: null, rankPrizes: [ { title: 'mage', prizeCoins: { gold, silver, copper }, xpPrize, prizeItem: { itemType: 'LootItem'|'EquipmentItem', item: ObjectId, quantity ≥ 1 }, randomLoot: [{ itemType, item, quantity }], spell: ObjectId|null, pet: ObjectId|null, cure: null|{ lifePointsShare, canHeal: [] } }, { title: 'paladin', … } ] }`; `registeredAdventurers: []`, `concludedAt: null`, `startedAt: null`, `generated: false`. Due personaggi (uno mage, uno paladin) la accettano dall'app.
   - **story**: `infos.type: 'story'`, `requirements.minTitle` = **titolo esatto** del personaggio di prova (`meetsTitle` della story), `requiredAdventurers: []`, `requiredPoints` valido; `prizes` = premio unico (nessun `rankPrizes`); accettabile da qualunque città.
   - Un nemico leggendario con `locations` compatibile col POI della UAT, per vedere D-03 sulla worldMission.
6. Piano di UAT su device (passi: avvio → giocatore vede «Missione in corso» e i rifiuti → teleport su POI interno → due scontri → correzioni → premi → completamento → foglio) e domande aperte.

### Q13 — Taglio dei piani consigliato

Esecutori sequenziali, un tema per piano, TDD; ogni piano che cambia decoratori rigenera e committa `src/schema.gql`.

| # | Piano | Dipende da | Dimensione |
|---|-------|------------|------------|
| 01 | Fondazione del blocco: `MISSION_IN_PROGRESS` + fabbrica (F5), `PendingQuest.missionDraftStartedAt` (solo Mongoose), predicato puro, `MissionLockReader`, modulo | — | M |
| 02 | Guardie del personaggio: le sei mutation di `CharactersService`, `useItem` (in sessione, piano puro), `doTransaction` (F6) | 01 | M |
| 03 | Guardie di `startTravel` e `acceptQuest` (+ worldMission con bozza aperta → `QUEST_NOT_ACCEPTABLE`) secondo P-1 (F7) | 01 | S–M |
| 04 | `CharacterStatus.missionInProgress` (resolve field con `$parent`), `MissionDraftLockPublisher`, int-spec della subscription, SDL (F1) | 01 | M |
| 05 | Refactor: `GmRequestReader` (estratto da `readRequest`/`worldMissionHolders`/`seatsOf`) e ciclo di commit parametrico; `readRewardCatalogFor(refs)` — guardia `gm-completion.service.int-spec.ts` verde | — | M |
| 06 | Bozza: modello e indici, `startMissionDraft`/`missionDraft`/`discardMissionDraft` (marcatore in transazione, precompilazione, invalidazione pigra), `GuidedMissionResolver`, matrice (F3/F4), `PendingRequest.missionDraftStartedAt` + refresher della coda (F2, F8), SDL | 01, 05 | L (spezzabile in 06a modello+servizio, 06b filo) |
| 07 | `missionEnemies`: pool puro, fasce, leggendari, `showAll`, resolver, matrice, SDL | 06 | S–M |
| 08 | Simulazione: `MissionSimulationChance`, `fight-state.ts`, `MissionSimulationService`, `simulateMissionFight` + invalidazione a valle, spec «nessuna scrittura, sorgente condivisa intatta», SDL | 06 | M |
| 09 | Catalogo dei premi: `missionPrizeOptionsOf` (una funzione), `missionPrizeOptions`, SDL | 06 | M |
| 10 | `saveMissionDraft`: passo, luogo, scontri e correzioni (validazione sulla sovrapposizione), premi (rivalidazione), invalidazione, SDL | 08, 09 | M |
| 11 | `completeGuidedMission`: effetto aggregato, nemici fusi, conoscenza, xp del compagno, `chosenRewardsOf`, cancellazione della bozza; `completePendingRequest` cancella la bozza; SDL | 05, 10 | M–L |
| 12 | (se C-2 accolto) compagno nel `CombatContext` (F9) | — | S |
| 13 | Gate: `tsc`, suite senza coverage, coverage per cartella, `git diff --exit-code src/schema.gql` dopo il boot reale | tutti | — |
| 14 | Chiusura: `BACKEND-NOTES.md`, VALIDATION, requisiti chiusi dal codice | 13 | — |

## Architecture Patterns

### Struttura consigliata

```
src/characters/mission-lock/
├── mission-lock.ts                     # predicato puro missionInProgressOf (corsie → boolean)
├── mission-lock.reader.ts              # MissionLockReader: isLocked / assertFree (2 letture, sessione opzionale)
├── mission-draft-lock.publisher.ts     # change stream sul marcatore → requestPublish dei titolari GM
└── mission-lock.module.ts              # forFeature([Character, PendingQuest]); esporta il reader
src/quests/guided/
├── mission-draft.model.ts              # @Schema della collection missiondrafts + indici
├── mission-draft.wire.ts               # @ObjectType/@InputType del filo (MissionDraft, input)
├── mission-draft.service.ts            # start/read/save/discard, invalidazione, marcatore in transazione
├── draft-invalidation.ts               # regole pure di §Q4
├── fight-state.ts                      # stateBeforeFight (sovrapposizione pura)
├── mission-simulation.chance.ts        # MissionSimulationChance (token)
├── mission-simulation.service.ts       # readCombatCatalog + buildCombatContext + CombatResolver
├── mission-enemy-pool.ts               # regola pura di D-03
├── mission-prizes.ts                   # missionPrizeOptionsOf (catalogo E rivalidazione)
├── chosen-rewards.ts                   # chosenRewardsOf → DrawnRewards senza tiri
├── guided-completion.service.ts        # transazione via il ciclo parametrico di GmCompletionService
├── guided-mission.resolver.ts          # 8 handler @Roles(innkeeper)
└── guided-mission.module.ts
src/quests/pending-requests/mission-draft-queue.refresher.ts
src/quests/outcomes/gm-request.reader.ts   # estratto da GmCompletionService
```

### Pattern 1: porta del caso dedicata
**What:** token distinto per la simulazione, così gli harness che sovrascrivono `ChanceSource` non lo toccano.
```typescript
// src/quests/guided/mission-simulation.chance.ts
export abstract class MissionSimulationChance extends ChanceSource {}
@Injectable()
export class MathMissionSimulationChance extends MissionSimulationChance {
    next(): number { return Math.random(); } // come MathChanceSource (chance-source.ts:9-14): unico punto ammesso
}
// modulo: { provide: MissionSimulationChance, useClass: MathMissionSimulationChance }
```

### Pattern 2: publisher gemello sul marcatore
**What:** come `PendingQuestStartPublisher` (`pending-quest-start.publisher.ts:24-88`) ma sulle corsie GM e senza `$ne: null`.
```typescript
const MISSION_DRAFT_MARKS = {
    pipeline: [{ $match: {
        operationType: 'update',
        'updateDescription.updatedFields.missionDraftStartedAt': { $exists: true },
    } }],
    subject: 'degli avvii e degli scarti dei flussi guidati',
};
// onChange → titolari attivi con activeStoryQuest o activeWorldMissionQuest = documentKey._id → requestPublish
```

### Pattern 3: guardia unica, precedenza dei codici esistenti
```typescript
// characters.service.ts, equipItem: dopo il parsing, prima dell'update
const characterId = requireCharacterObjectId(request.id);
await this.missionLock.assertFree(characterId);
```

### Anti-Patterns to Avoid
- **Simulare con la `ChanceSource` condivisa:** sposta i tiri delle spec a seme fisso e delle risoluzioni reali (D-04).
- **Scrivere sul personaggio per avviare il blocco** (`status.missionLock`): N punti di rilascio, rischio di blocchi eterni; il marcatore sulla PendingQuest si autoripara.
- **Bozza sulla Quest o sulla singola PendingQuest:** la story è per personaggio, la worldMission ha N PendingQuest.
- **Fidarsi dei premi o degli effetti mandati dal client al completamento:** `completeGuidedMission` legge solo la bozza e rivalida in sessione.
- **Cambiare le pipeline dei publisher esistenti:** sono pinnate; publisher nuovi.
- **Mettere l'id del personaggio nel risultato della simulazione per i giocatori:** la bozza esce solo da handler innkeeper.
- **Un `null` su `Enemy!` nella bozza:** voci orfane scartate prima del filo (trappola dei ref della Phase 13/21).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Validazione delle correzioni | regole nuove di vita/ferite/consumi | `validateOverrides` + `overrideParticipantOf` sullo snapshot sovrapposto | stessi limiti di oggi (D-06), già testati |
| Stato dopo uno scontro | calcoli inline | `woundsAfter`, `consumablesSpent` + `applyTradeToInventory`, `spellsSpent` | stesse regole del piano d'esito |
| Contesto del combattimento | nuovo builder | `readCombatCatalog` + `buildCombatContext` | puri/riusabili (sonda 1) |
| Scrittura dell'esito | secondo writer | `planParticipant` + `OutcomeWriter` via il ciclo di `GmCompletionService` | D-08 «come oggi» |
| Blocco del titolo | lettura propria dei blocchi | `prizeBlockFor` / `prizeBlocksOf` | ripiego D-18 già deciso |
| Tetto di rarità | tabella nuova | `LOOT_POOLS` + `petRarityCapOf` | una sola fonte |
| Regola di zona | filtro nuovo | `livesIn` di `enemy-pool.ts` esportata | «stessa regola di `zonePoolOf`» |
| Emissione WS su write non del personaggio | publish nei servizi | change stream + `requestPublish` | precedente D-22 |

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | collection nuova `missiondrafts` (vuota al deploy); campo nuovo `PendingQuest.missionDraftStartedAt` (assente sulle PendingQuest esistenti = `null` per il filtro e il predicato) | nessuna migrazione; indici creati da Mongoose al boot (`autoIndex` come le altre collection; verificare nel boot reale) |
| Live service config | nessuno (nessun servizio esterno coinvolto) — verificato: niente FCM/Twitch nuovi | — |
| OS-registered state | nessuno — il processo dell'utente gira da `dist/` (riavvio dell'orchestratore) | riavvio dopo la merge |
| Secrets/env vars | nessuno — nessuna variabile nuova | — |
| Build artifacts | `dist/` del processo dell'utente obsoleto fino al rebuild | build e riavvio dell'orchestratore |

## Conflicts (CONTEXT / REPO-RULES non implementabili come scritti)

- **C-1 (D-12, «viaggi e accettazioni sono già bloccati dalla corsia occupata»):** vero per i viaggi e per le quest standard; **falso per story e worldMission**: l'accettazione guarda solo la stessa corsia (`quest-eligibility.ts:184-185`) e la spec `quest-acceptance.service.int-spec.ts:476-491` pinna una story accettata con una hunt in corso. Proposta: il predicato unico rifiuta anche queste accettazioni (`MISSION_IN_PROGRESS`, dopo i rifiuti esistenti) → P-1.
- **C-2 (D-04, «stato reale … compagno»):** la porta non vede il compagno (`CombatParticipant`, `combat-resolver.ts:44-54`). Proposta: campo additivo `companion: { petId, attack, defense, currentLifePoints, maxLifePoints, xp } | null` nel partecipante, costruito da `assets.pet` + voce di `ownedPets` + catalogo dei pet (già letto per i tetti, `resolution-loader.service.ts:497-507`), ignorato dal segnaposto (nessun tiro in più, come `accessoryUseTypes`); vale per tutti i percorsi. In alternativa rinviarlo al motore dell'utente. Default: aggiungerlo (piano 12).
- **C-3 (REPO-RULES «Tutto il nuovo è … nel log di audit»; BE-GMFLOW-07 «audit su ogni operazione nuova»):** l'interceptor registra solo le mutation (`admin-audit.interceptor.ts:74`). Testo proposto: «ogni **mutation** nuova è nel log di audit; le query dell'oste no, come `pendingRequests`».
- **C-4 (REPO-RULES, `missionPrizeOptions` senza tipo di ritorno):** proposta `MissionPrizeOptions!` di §Q9.
- **C-5 (D-04, «esito per personaggio»):** la porta dà un verdetto per scontro (A3, `combat-resolver.ts:84-88`): l'esito di ogni personaggio è il verdetto del suo scontro; sul filo `MissionFight.verdict`.
- **C-6 (REPO-RULES «`missionInProgress` risolto, non persistito se derivabile»):** derivabile per le missioni normali (`startDate` della corsia standard), **non** per il flusso guidato, che non lascia traccia sulle corsie: serve il marcatore `PendingQuest.missionDraftStartedAt` (persistito sulla PendingQuest, non sul personaggio; il campo del filo resta risolto).
- **C-7 (D-09, «bozza sulla richiesta»):** una worldMission ha N richieste (una PendingQuest per iscritto). Testo proposto: «una bozza per richiesta (story) o per gruppo di richieste della stessa worldMission, indirizzata da qualunque PendingQuest del gruppo».
- **C-8 (D-03, «stessa regola di `zonePoolOf`»):** `zonePoolOf` esclude per costruzione leggendari e (di default) animali (`enemy-pool.ts:26-28`). Proposta: riusare `livesIn` in una variante `missionEnemyPoolOf` con leggendari solo per la worldMission e animali inclusi.
- **C-9 (D-06, «togliere ferite»):** si tolgono solo le ferite **aggiunte** dagli scontri; quelle già possedute prima della missione non sono correzioni ma guarigioni (premio `cure`).

## Common Pitfalls

1. **Tiri della simulazione sulla sorgente condivisa** → spec a seme fisso RED e risoluzioni reali spostate. Prova: spec «la `SequenceChance` condivisa resta a zero tiri dopo una simulazione» (sonda 1).
2. **Blocco eterno da una bozza orfana:** il blocco dipende dal marcatore sulla PendingQuest (sparisce con lei); `discardMissionDraft` deve funzionare anche senza documento della bozza (azzera i marcatori della richiesta).
3. **`startDate` delle corsie GM scambiata per avvio:** è scritta all'accettazione; il predicato la legge solo per la corsia standard.
4. **`$parent` assente** (oggetto piatto) → `missionInProgress` falso: accettabile solo perché l'autorità è la guardia; mai usare il campo per decidere lato BE.
5. **Evento perso allo scarto:** usare `$set` a `null` (sonda 3), non `$unset` (finirebbe in `removedFields` e la pipeline non lo vedrebbe).
6. **Precedenza dei codici:** mettere la guardia prima delle classificazioni esistenti cambia codici pinnati (`QUEST_IN_PROGRESS`, `QUEST_SLOT_BUSY`, `AWAITING_AID`); va dopo.
7. **DI della spec unit** di `CharactersService` (F6): aggiungere il provider del reader nello stesso piano.
8. **Nuovo iscritto a una worldMission a bozza aperta:** fuori dalla bozza → rifiutare l'accettazione (`QUEST_NOT_ACCEPTABLE`) finché la bozza esiste.
9. **Indice unico multikey e transazioni:** creare la collection prima delle transazioni (`model.init()` negli harness, Pitfall 5 della Phase 9, `outcome-world.ts:110-116`) e gestire l'E11000 di due `startMissionDraft` concorrenti rileggendo la bozza (idempotenza).
10. **Int-spec appese** (trappola 15-03): chiudere l'harness in `afterAll`, nomi dei personaggi distinti (indice unico case-insensitive).
11. **Riferimenti orfani nella bozza** (nemico, oggetto, pet cancellati a catalogo): scartati in lettura, rifiutati in scrittura.
12. **Titolo cambiato fra avvio e completamento** (worldMission + story completata dall'oste nel frattempo, caso raro della Phase 21): la rivalidazione dei premi fallisce con `OUTCOME_OVERRIDE_INVALID`; l'oste risalva i premi.

## Code Examples

### Sovrapposizione dello stato (forma)
```typescript
// src/quests/guided/fight-state.ts — puro, nessuna mutazione dello snapshot
export function stateBeforeFight(
    snapshot: ResolutionCharacter,
    previous: readonly ParticipantEffects[],
): ResolutionCharacter {
    return previous.reduce((state, effects) => {
        const wounds = woundsAfter(state.status.injuries ?? [], effects.injuriesAdded);
        const spent = consumablesSpent(state.assets?.ownedItems, effects.consumablesUsed);
        const { ownedItems, ownedEquipments } = applyTradeToInventory(state.assets ?? {}, spent.map(sellLine));
        const spells = spellsSpent(state._id, state.status.spellStates ?? [], effects.spellsUsed, new Map(), EPOCH);
        return {
            ...state,
            status: {
                ...state.status,
                currentLifePoints: effects.hpAfter,
                injuries: wounds.injuries,
                spellStates: spells.spellStates ?? state.status.spellStates,
            },
            assets: { ...state.assets, ownedItems, ownedEquipments },
        };
    }, snapshot);
}
```

### Simulazione (forma)
```typescript
const catalog = await this.loader.readCombatCatalog(entries, overlaid, `della bozza ${draftId}`);
const context = buildCombatContext({ quest, enemies: catalog.enemies, participants: overlaid,
    equipment: catalog.equipment, spells: catalog.spells, loot: catalog.loot });
const resolution = this.combat.resolve(context, this.simulationChance); // mai this.chance
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Conteggi del catalogo a DB (206 nemici/22–28 leggendari, ~172+101 oggetti, 44 pet, 92 magie) presi dai documenti delle fasi | §Q3, §Q6 | solo dimensionamento del payload |
| A2 | La hunt della spec F7 parte col salto (nessuna strada nel mondo della spec) | §Q10 | F7 resta verde: nessun danno |
| A3 | Un ultimo campo `PendingRequest.missionDraftStartedAt` è utile alla FE | §Q4 | campo additivo inutilizzato |
| A4 | Last-write-wins basta per l'oste (un dispositivo attivo alla volta) | §Q4 | due dispositivi in contemporanea si sovrascrivono le sezioni |
| A5 | `autoIndex` crea gli indici della collection nuova al boot reale come per le altre | Runtime State | indice unico assente: due bozze possibili per la stessa richiesta |

## Open Questions (RESOLVED — ruling in `22-CONTEXT.md` D-13..D-27, 2026-11-14)

> Tutte chiuse come raccomandato, tranne **P-4**: l'utente ha scelto monete e xp liberi senza tetto (D-15). In più D-16 aggiunge `CharacterStatus.guidedMissionInProgress` e D-17 tre campi su `MissionFightOutcome`.

1. **P-1 (PRODOTTO) — Accettare una story/worldMission durante una missione standard avviata.** Oggi permesso (spec `:476`); D-12 dice «già bloccate», ma non lo sono. Opzioni: (a) rifiuto con `MISSION_IN_PROGRESS` (un solo predicato, riscrive F7 con una missione standard non avviata); (b) lasciare le corsie GM libere (accettare una story non cambia lo stato di combattimento). **Raccomandazione: (a)**, coerente con «una sola guardia» e con D-11 per il flusso guidato.
2. **P-2 (PRODOTTO) — Leggendari nella lista della worldMission.** Opzioni: (a) offerti se vivono nella zona, **senza** filtro di fascia (sono più forti per natura); (b) dentro la fascia come gli altri (comparirebbero quasi solo per le hero). **Raccomandazione: (a).**
3. **P-3 (PRODOTTO) — Tabella del tetto di rarità per le missioni del GM.** Opzioni: (a) tabella boss per la worldMission ed enemy per la story (gruppo/solitaria come la Phase 21); (b) boss per entrambe; (c) enemy per entrambe. **Raccomandazione: (a).**
4. **P-4 (PRODOTTO) — Monete e xp dei premi.** Opzioni: (a) `0..valore del blocco` (si toglie, non si aggiunge); (b) numeri liberi con un tetto (es. il doppio del blocco); (c) liberi. **Raccomandazione: (a)**; oggetti `1..10` per voce.
5. **P-5 (PRODOTTO) — Precompilazione dal blocco.** Opzioni: (a) tutto il blocco, compreso l'intero pool `randomLoot` e il pet (alla lettera di D-07, l'oste toglie); (b) solo la parte certa (monete, xp, `prizeItem`, cura, magia) con pool e pet proposti come aggiunte. **Raccomandazione: (a).**
6. **P-6 (PRODOTTO) — Il ferito in attesa di soccorso è «missione in corso»?** Oggi già fermo per viaggio, accettazione, negozio, pozioni; può cambiare equipaggiamento. **Raccomandazione: no** (nessun combattimento in vista per lui).
7. **P-7 (PRODOTTO, nota N-21-01) — `Quest.rankPrizes` leggibile da ogni utente.** Il flusso usa `missionPrizeOptions` (innkeeper), quindi la FE 21 non ne ha bisogno. **Raccomandazione: lasciarlo** (dati di gioco, non segreti), chiudendo la nota.
8. **P-8 (PRODOTTO, minore) — `deleteCharacter` durante una missione.** **Raccomandazione: permessa** (l'archivio gestisce già i posti).
9. **P-9 (PRODOTTO, minore) — Fascia di una worldMission mista.** **Raccomandazione:** unione delle fasce da `minTitle` al titolo più alto dei posti.
10. **T-1 — Concorrenza della bozza:** default last-write-wins (A4).
11. **T-2 — Compagno nel contesto (C-2):** default aggiungerlo, piano 12.
12. **T-3 — Valori di `MissionDraftStep`:** `teleport`, `fights`, `prizes`, `recap`; il BE li salva senza imporre l'ordine (il wizard è della FE).
13. **T-4 — Iscrizione a una worldMission con bozza aperta:** default `QUEST_NOT_ACCEPTABLE`.
14. **T-5 — Zero scontri:** ammesso (come oggi senza override).
15. **T-6 — `completePendingRequest`:** convive, cancella la bozza nella sua transazione; rimozione dopo la merge FE.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| MongoMemoryReplSet (harness) | int-spec, change stream, transazioni | ✓ | sonde eseguite: 3 test in ~1,5 s | — |
| Redis effimero | boot reale (`test/app.int-spec.ts`, matrice) | ✓ (usato dalle fasi precedenti) | — | — |
| Node/npx/jest/tsc/prettier del repo | tutto | ✓ | da `node_modules` | — |

Nessuna dipendenza esterna nuova.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest, progetti `unit` e `integration` (`package.json` `jest.projects`) |
| Config file | `package.json`; integration con `test/setup/global-setup.ts` (MongoMemoryReplSet) |
| Quick run command | `npx jest <spec> --selectProjects unit` / `npx jest <spec> --selectProjects integration --runInBand` |
| Full suite command | `npm run test:unit` + `npm run test:int` (`test:cov` lo lancia l'orchestratore in background) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-GMFLOW-01 | regola del pool (zona, `city`, fascia, leggendari solo worldMission, animali, ripiego `all`, `showAll`, ordinamento) | unit | `npx jest src/quests/guided/mission-enemy-pool.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-GMFLOW-01 | `missionEnemies` sul filo dal luogo della bozza o del primo partecipante | integration | `npx jest src/quests/guided/guided-mission.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-GMFLOW-02 | simulazione senza scritture, sorgente condivisa a zero tiri, scontro 2 dallo stato corretto dell'1, invalidazione a valle | unit + integration | `npx jest src/quests/guided/fight-state.spec.ts src/quests/guided/draft-invalidation.spec.ts --selectProjects unit`; `npx jest src/quests/guided/mission-simulation.service.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-GMFLOW-03 | avvio idempotente, una bozza per gruppo (indice unico), ripresa, scarto, bozza orfana cancellata, mai esposta ai giocatori (handler innkeeper) | integration | `npx jest src/quests/guided/mission-draft.service.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-GMFLOW-04 | correzioni per scontro validate sulla sovrapposizione (vita 1..max, posseduto/usi rimasti, ferite dell'enum, non partecipante) | unit + integration | `npx jest src/quests/outcomes/gm-overrides.spec.ts --selectProjects unit`; `npx jest src/quests/guided/mission-draft.service.int-spec.ts --selectProjects integration --runInBand` | ✅ / ❌ |
| BE-GMFLOW-05 | catalogo filtrato (tetto, pet, caster + `minXpToLearn`, voci del blocco sempre ammesse), rivalidazione, `chosenRewardsOf` | unit + integration | `npx jest src/quests/guided/mission-prizes.spec.ts src/quests/guided/chosen-rewards.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-GMFLOW-06 | completamento in transazione: stato finale, nemici fusi in `QuestResult.enemies`, xp nemici e compagno, conoscenza, premi scelti, `gmCompleted`, bozza cancellata, nessun tiro | integration | `npx jest src/quests/guided/guided-completion.service.int-spec.ts src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` | ❌ / ✅ |
| BE-GMFLOW-07 | ruoli (matrice), audit delle mutation, SDL al boot reale | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`; `npx jest test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand`; `npx jest test/authz/handler-fixtures.spec.ts --selectProjects unit` | ✅ (da estendere) |
| BE-GMFLOW-08 | blocco del flusso guidato: rifiuti `MISSION_IN_PROGRESS` per viaggio, accettazione, negozio, equip, compagno, magie, pozioni; sblocco a completamento/scarto; `characterUpdated` ad avvio e scarto | unit + integration | `npx jest src/characters/mission-lock --selectProjects unit`; `npx jest src/characters/mission-in-progress.int-spec.ts src/characters/mission-lock --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-GMFLOW-09 | stesso blocco dall'avvio effettivo delle missioni normali (solitaria all'arrivo, party all'avvio), precedenza dei codici esistenti | integration | `npx jest src/characters/equipment/equip-item.int-spec.ts src/characters/items/use-item.int-spec.ts src/economy/trade/do-transaction.int-spec.ts src/quests/acceptance/quest-acceptance.service.int-spec.ts src/travel/travel.service.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) |
| (manuale) | avviso «Missione in corso» e flusso completo su device | manual-only | UAT su device dell'orchestratore con la FE Phase 21 | — |

### Sampling Rate
- **Per task commit:** la spec mirata del task + `npx tsc --noEmit -p tsconfig.json`.
- **Per wave merge:** cartelle toccate (`src/quests/guided`, `src/characters`, `src/quests/outcomes`, `src/quests/pending-requests`) nei due progetti.
- **Phase gate:** suite completa senza coverage + coverage per cartella delle soglie toccate (§Q10) + `git diff --exit-code src/schema.gql` dopo il boot reale.

### Wave 0 Gaps
- [ ] `src/characters/mission-lock/mission-lock.spec.ts` — BE-GMFLOW-08/09
- [ ] `src/characters/mission-lock/mission-draft-lock.publisher.spec.ts` — BE-GMFLOW-08
- [ ] `src/characters/mission-in-progress.int-spec.ts` — BE-GMFLOW-08/09
- [ ] `src/quests/guided/*.spec.ts` (pool, sovrapposizione, invalidazione, premi, premi scelti) — BE-GMFLOW-01/02/04/05
- [ ] `src/quests/guided/*.int-spec.ts` (bozza, simulazione, completamento, resolver) — BE-GMFLOW-01..06
- [ ] `src/quests/pending-requests/mission-draft-queue.refresher.spec.ts` — BE-GMFLOW-03
- Nessuna installazione: framework presente.

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (invariata) | JWT di sessione esistente |
| V4 Access Control | sì | `@Roles(innkeeper)` su ogni handler nuovo + matrice; bozza e simulazioni mai su handler di giocatore; `missionInProgress` sul personaggio del proprietario (ownership esistente di `character`/`characterUpdated`); il blocco vale anche per il bypass dell'oste sulle mutation del personaggio (un solo predicato) |
| V5 Input Validation | sì | class-validator sugli input (`@IsObjectIdHex`, `@ArrayMaxSize(MAX_OVERRIDE_ENTRIES)`, interi ≥ 0/≥ 1), rivalidazione in dominio di correzioni (`validateOverrides`) e premi (una funzione), nemici e POI esistenti |
| V6 Cryptography | no | — |

| Pattern | STRIDE | Mitigation |
|---------|--------|-----------|
| Oste (o client compromesso) che manda premi oltre il rango | Tampering / Elevation | catalogo filtrato rivalidato in sessione al completamento |
| Giocatore che cambia arma o beve una pozione prima dello scontro | Tampering | guardia `MISSION_IN_PROGRESS` dall'avvio effettivo (corsa residua di millisecondi dichiarata) |
| Bozza/simulazioni esposte ai giocatori | Information disclosure | solo handler innkeeper; marcatore sulla PendingQuest senza `@Field` |
| Log | Information disclosure | solo id e conteggi (`describeError`) |
| Bozza enorme | DoS | tetti su scontri, nemici per scontro, quantità, voci dei premi |

## Sources

### Primary (HIGH)
- Codice del repo BE sul branch della fase (file:riga citati sopra).
- Sonda 1 (simulazione senza scritture e sorgente condivisa intatta), sonda 2 (`status.$parent()` e corsie popolate), sonda 3 (`$set` a `null` in `updatedFields` del change stream): `test/_probes/gm22-probe.int-spec.ts` su `createOutcomeHarness`/MongoMemoryReplSet, 3 test verdi, file cancellato; `git status --short` mostra solo questo documento.
- `npx prettier --check` su 49 file: tutti puliti.
- FE in sola lettura: `21-CONTEXT.md`, `21-REPO-RULES.md`, `lib/repository/innkeeper_repository.dart`, `innkeeper_failure.dart`, `lib/graphql/**/pending_request_*.dart`, `lib/models/pending_request/request_card.dart`, `lib/models/travel/teleport_target.dart`.

### Secondary (MEDIUM)
- `.planning` delle fasi 9, 13, 15, 19, 21 (conteggi del catalogo, D-18, N-21-01).

## Metadata

**Confidence breakdown:**
- Completamento di oggi, simulazione, blocco: HIGH — letti riga per riga, tre sonde.
- SDL e granularità: MEDIUM — default tecnici motivati, decide l'orchestratore.
- Regole di prodotto (P-1..P-9): aperte, raccomandazioni dichiarate.
- Pitfall: HIGH.

**Research date:** 2026-11-13
**Valid until:** fine della fase (codice stabile sul branch)

## RESEARCH COMPLETE
