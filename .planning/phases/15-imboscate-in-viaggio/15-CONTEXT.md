# Phase 15: Imboscate in viaggio - Context

**Gathered:** 2026-11-06 (discuss congiunto con la FE Phase 16, condotto dal repo FE; branch `feat/15-imboscate-in-viaggio` da `develop` `b492a46`, la merge della PR #23)
**Status:** Ready for planning — i nomi del contratto (campi, enum, categoria push, costanti, job) restano a discrezione del planner e vengono fissati in `15-REPO-RULES.md` prima della pianificazione; la FE Phase 16 li consuma dopo la merge di questa fase su `develop`.

<domain>
## Phase Boundary

Un viaggio può essere teso da una o più imboscate. Alla partenza il server percorre la rotta km per km con un rischio per km che dipende dall'ora in cui la pedina transiterà (giorno/notte 22–06 nel fuso configurato) e fissa, se scatta, dove e quando avviene la prima imboscata; un job la risolve a quell'istante con la porta `CombatResolver` contro nemici della zona del punto, nella fascia [Facile, Medio] del livello del personaggio. Vittoria: HP e ferite del motore, monete e XP come una quest `enemy` generata del rango, viaggio invariato e nuovo sorteggio dal punto per la strada che resta. Sconfitta: HP ≥ 1 e ferite, `activeTravel` riscritto dal punto verso la città più vicina per strada (meta compresa), quest della corsia standard abbandonata, cibo non rimborsato, push immediato di sconfitta. Ogni imboscata produce un report che resta trattenuto fino all'arrivo (o al teleport) e viene consegnato come `QuestResult` sulla pipeline esistente (subscription owner-only, `unacknowledgedQuestResults`, ack).

Fuori scope: rimborso del cibo, costi sulla tratta deviata, imboscate sulla deviazione, soccorso o morte da imboscata, loot dagli assalitori, sblocco delle lore per vittoria (Phase 16), visibilità per il GM, modifiche al motore di combattimento (resta il placeholder dietro la porta), anteprime che svelano qualcosa.

</domain>

<decisions>
## Implementation Decisions

### Probabilità e sorteggio (BE-AMBUSH-01, BE-AMBUSH-02)
- **D-01 (utente, «Morbida»):** **rischio indipendente per km: 0,2% di giorno, 0,6% di notte** (notte = ore 22–06 nel fuso `AMBUSH_TIMEZONE`, default Europe/Rome). Il server percorre la rotta km per km: il km k-esimo è transitato all'istante `startTime + k / distanza × durata` (velocità costante sulla polilinea, come interpola il FE); al primo km in cui `chance < h(km)` l'imboscata è fissata a quel km e a quell'istante. Probabilità risultanti (giorno / notte piena): 16 km 3% / 9%, 50 km 10% / 26%, 204 km 34% / 71%, 506 km 64% / 95%; un viaggio di 2,7 h partito alle 21:00 cade per il 63% di notte, uno di 35 h per circa un terzo. Il punto dell'imboscata è il punto della polilinea a quel km (interpolazione per lunghezza, come `TravelRoute.pointAt` del FE).
- **D-02 (utente, verbatim):** **più imboscate per viaggio, con risorteggio dopo ogni vittoria.** «Su un percorso di 300km, i primi 100 non avviene nulla, poi hai un'imboscata. Finita l'imboscata si risorteggia e passano altri 130 km prima della successiva. Poi il personaggio riceve un'imboscata dopo 50km (l'ultimo sorteggio è andato male) e nell'ultimo tratto non ne riceve.» Dopo una vittoria il server risorteggia dal km dell'imboscata in poi, con lo stesso modello, sulla strada residua (il viaggio resta invariato: stessi `endTime` e polilinea). **Una sola imboscata pendente alla volta** (un solo job).
- **D-03 (utente, «10 km»):** **soglia di 10 km**: un viaggio con `distance` < 10 km non è mai teso; dopo un'imboscata non si risorteggia se restano meno di 10 km; **dopo una sconfitta la deviazione verso la città è senza imboscate**.
- **D-04 (default tecnico, per il veto):** **costanti in codice di dominio** (pattern `FOOD_RULES`, `PLACEHOLDER_RULES`, `generation-rules.ts`): ad esempio `src/travel/ambush/ambush-rules.ts` con `AMBUSH_RULES = { dayHazardPerKm: 0.002, nightHazardPerKm: 0.006, nightStartHour: 22, nightEndHour: 6, minTravelKm: 10, minRemainingKm: 10 } as const` e funzioni pure (ora locale di un istante, tasso per km, sorteggio su una rotta a partire da un km, punto a un km della polilinea). Solo **`AMBUSH_TIMEZONE`** passa dall'ambiente (opzionale, default `Europe/Rome`, validata al boot con `Intl.DateTimeFormat` nel pattern `config/*-config.ts` + `env.validation.ts` + drift di `.env.example`); nessuna dipendenza nuova per il fuso (`Intl` nativo). Il caso viene dalla porta `ChanceSource` già iniettata (`MathChanceSource` in produzione, `SeededChanceSource`/`FixedClock` nei test).
- **D-05 (default tecnico):** **il sorteggio della partenza si fa costruendo l'`activeTravel`** (partenza libera in `startTravel` e automatica in `claimLane`, nello stesso update condizionale di Phase 8/14) e si persiste in un campo interno `activeTravel.ambush { at, km }` **mai esposto sul filo** (come `kind`); il job Bull `ambush` sulla coda `travel` (jobId deterministico, es. `ambush-<characterId>-<startTimeMs>-<atMs>`, `delay` fino ad `at`, pattern `enqueueTrigger`) è solo il trigger: **reconciler al boot e sweep** come i viaggi (`TravelSweeper` o gemello, filtro `activeTravel.ambush.at ≤ now`), job duplicato, in anticipo o obsoleto no-op perché la transazione dell'imboscata riafferma nel filtro `activeTravel.startTime` e `activeTravel.ambush.at`. Il job della nuova imboscata (dopo una vittoria) e il job `complete` del viaggio riscritto (dopo una sconfitta) si schedulano dopo il commit; i job vecchi decadono per identità.

### Nemici dell'imboscata (BE-AMBUSH-03)
- **D-06 (utente, «Solo il POI più vicino»):** **zona = i `type` del POI più vicino al punto dell'imboscata** (scansione in memoria dei 642 POI con l'haversine di gioco di `roads.service`, nessun indice geografico; i marker di città contano, tipo `city`); **`all` di riserva** se il pool di zona è vuoto o non componibile. Tutti i POI appartengono a una città: il report porta «presso <città del POI>» (D-14).
- **D-07 (utente):** **pool = nemici non leggendari della zona + animali della zona + habitat `city` sempre** (banditi, cultisti…): a differenza di `zonePoolOf` della Phase 13 gli **animali sono inclusi** (sulla strada sono gli assalitori più naturali); i **leggendari mai** (restano alle worldMission). Il costruttore del pool riceve questa variante come parametro, non si duplica.
- **D-08 (utente, confermato coi numeri corretti):** **fascia = [Facile, Medio] del livello del personaggio** dalla tabella del world building (`.planning/phases/11-popolamento-del-mondo/source/world-building.md` righe 156–177, valori in PE) **convertita con `XP_SCALE` (0,14084507) e arrotondata** alla scala di `Enemy.xp`: livello 1 → 4–7, 3 → 11–21, 5 → 35–70, 8 → 63–127, 10 → 85–169, 13 → 155–310, 16 → 225–451, 20 → 394–803 (singoli disponibili sul DB: 19, 22, 31, 52, 33, 26, 22, 17). La tabella entra in codice come costante per livello (20 righe, Facile e Medio); **composizione come la Phase 13** (`composeEnemyQuest`: singolo nella fascia oppure branco di nemici più deboli con somma nella fascia, stessa logica di budget e tetto) con la fascia per livello al posto di quella per rango. Se né il pool di zona né quello di riserva sono componibili, l'imboscata **non avviene**: nessun report, nessun effetto, e si risorteggia dal punto come dopo una vittoria (default tecnico).
- **D-09 (default tecnico):** **scontro con la porta `CombatResolver`** (placeholder oggi, nessuna modifica al motore) con un contesto costruito come per le quest (`buildCombatContext`: HP correnti all'istante, ferite, equipaggiamento, magie attive, consumabili) e un `quest` sintetico `{ id: <id dell'imboscata>, type: 'ambush', title: 'Imboscata presso <città>' }`; unico partecipante il viaggiatore. Gli HP correnti sono già al netto del cibo (Phase 14 scala alla partenza).

### Esito (BE-AMBUSH-04, BE-AMBUSH-05)
- **D-10 (utente):** **vittoria → HP e ferite del motore applicati subito** (perdita dimezzata e 20% di ferita con il placeholder), **ricompense come una quest `enemy` generata del rango**: `GENERATED_PRIZES.enemy` (150 rame, 40 xp) × `TIER_MULTIPLIER` del titolo (rookie 1, adventurer 2, paladin 5, mage 12, hero 25; legend come hero) **più la somma degli xp dei nemici battuti** (× quantità); monete via wallet e xp via `progressionAfter` (livello e titolo possono salire) **nello stesso istante**, in una sola transazione con lo snapshot del report; **viaggio invariato**; poi il risorteggio di D-02.
- **D-11 (utente):** **sconfitta → in una sola transazione:** HP del motore mai sotto 1 e ferite (nessun `awaitingAid`, nessun soccorso, nessuna morte); **città più vicina = minor tempo di strada dal punto** (Dijkstra dal nodo agganciato con `MAX_SNAP_DISTANCE_KM`, velocità con il pet e **le ferite nuove**) fra i 167 marker, **meta e partenza comprese** (se la più vicina è la meta la pedina prosegue fin lì); **`activeTravel` riscritto dal punto**: `kind: free`, polilinea punto → città, **`startTime` = istante dell'imboscata**, `endTime = startTime + durata`, `duration`, `to` = marker della città (il FE interpola da `startTime` e `duration`: una polilinea «partenza → punto → città» con il vecchio `startTime` lo sbaglierebbe); **`pendingQuest` abbandonata nella stessa transazione** (la `PendingQuest` cancellata, posto liberato con `$pull` da `registeredAdventurers`, `quests.pendingQuest = null`, riusando gli helper di `characters/deletion/seat-release.ts`: `abandonQuest` non vale in viaggio perché il suo filtro richiede `arrivedAt`); **cibo non rimborsato e nessun costo sulla tratta deviata** (né cibo né HP); nessun risorteggio (D-03). I report già accumulati (D-13) seguono nel nuovo `activeTravel`.
- **D-12 (utente):** **ogni sconfitta manda subito un push di categoria nuova** (es. `ambushDefeat`, nome definitivo nelle REPO-RULES; `PushEventType` esteso), **anche quando la città più vicina è la meta**: data-only come gli altri, con l'id del personaggio e **il nome della città raggiunta** (il FE compone il banner «Imboscata! Sei stato sconfitto: la via torna verso <città>», tap → Mappa); inviato dopo il commit, best effort come `travelEnd`. **Vittoria: nessun push.**

### Report e consegna (BE-AMBUSH-06)
- **D-13 (utente, conferma della decisione del 2026-10-29):** **tutto all'arrivo**: nessun report è visibile prima della fine del viaggio. Default tecnico: lo snapshot di ogni imboscata risolta (esito, nemici con quantità, HP prima/dopo, ferite, monete, xp/livello/titolo prima/dopo, consumabili e magie usate dal motore, istante, città del POI, città raggiunta) si accumula in un campo interno **`activeTravel.ambushReports[]`** (mai sul filo), copiato nell'`activeTravel` riscritto alla sconfitta; **il completamento del viaggio inserisce i `QuestResult`** (uno per imboscata) **nella stessa transazione** del `findOneAndUpdate` di arrivo (`TravelCompletionService.complete`, che oggi non scrive risultati), con **`resolvedAt` = istante dell'imboscata** (la coda FE ordina per data: i report precedono qualsiasi risultato di quest dello stesso arrivo); la delivery resta quella esistente (change stream owner-only `questResultReceived`, `unacknowledgedQuestResults`, `acknowledgeQuestResult`). **Nessun push `questEnd` per i report**: il `travelEnd` del viaggio libero o deviato basta, l'arrivo al marker di una quest resta muto (utente: «Solo `travelEnd` come oggi»). **Il teleport del GM annulla l'imboscata pendente** (job no-op per identità) **e consegna i report accumulati** nella stessa transazione del teleport.
- **D-14 (default tecnico, contratto per la FE Phase 16):** **SDL additivo con un'eccezione dichiarata**: `QuestResult.kind: QuestResultKind!` (`quest` | `ambush`; i documenti esistenti leggono `quest`), **`QuestResult.quest` diventa nullable** (null per le imboscate: l'unica modifica non additiva, dichiarata nel handoff; il FE Phase 9 la seleziona senza assumerla), `QuestResult.ambush: AmbushReport` (`{ at: DateTime!, nearCity: { id, name } (città del POI più vicino), reachedCity: { id, name } (solo in sconfitta, altrimenti null) }`); `outcome` riusa `success`/`failure`; `enemies` snapshot con `quantity` come le quest; `hpBefore/hpAfter/maxLifePoints/injuriesAdded/rewards.coins/xp*/level*/title*/consumablesUsed/spellsUsed` come oggi. Nomi definitivi nelle REPO-RULES.

### Anteprime, teleport, prove e handoff (BE-AMBUSH-07)
- **D-15 (roadmap):** `travelPreview` e `questTravelPreview` invariati: nulla sul filo svela un'imboscata; nessuna query o mutation nuova (`EXPECTED_OWNER_ONLY_HANDLERS` invariato); `src/schema.gql` rigenerato e committato.
- **D-16 (default tecnico):** integration sul replica set: vittoria (effetti subito, viaggio invariato, risorteggio), sconfitta con deviazione verso la città più vicina (caso «meta compresa» e caso quest abbandonata con posto liberato), notte vs giorno (`FixedClock` + fuso), viaggio sotto 10 km senza sorteggio e residuo sotto 10 km senza risorteggio, job duplicato/in anticipo/obsoleto no-op, reconciler e sweep, teleport che annulla e consegna, report inseriti all'arrivo con `resolvedAt` dell'imboscata, push su ogni sconfitta e mai in vittoria, pool senza nemici componibili. Handoff **`BACKEND-NOTES.md`** per la FE Phase 16: SDL verbatim, categoria push e payload, semantica (modello per km, fascia per livello, città più vicina, report trattenuti), numeri del discuss, **dati per la UAT** (come forzare un'imboscata a DB: `activeTravel.ambush.at` spostato nel passato + sweep; HP bassi per forzare la sconfitta; due imboscate per il carosello FE).

### Claude's Discretion
- Nomi (modulo, costanti, campi interni, enum, categoria push, jobId), granularità del percorso km per km (km interi, ultimo km parziale proporzionale), scelta dell'id dell'imboscata, forma dello snapshot interno, righe di log, se il sorteggio vive dentro il builder dell'`activeTravel` o subito dopo il commit della partenza (purché prima della schedulazione del job), come il costruttore del pool riceve la variante «animali inclusi», come la fascia per livello si innesta nella composizione della Phase 13.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap e requisiti
- `.planning/ROADMAP.md` §Phase 15 (criteri 1–4, decisioni 2026-10-29 e 2026-11-06) e `.planning/REQUIREMENTS.md` BE-AMBUSH-01..07 (emendati 2026-11-06)

### Viaggio (Phase 8 e 14)
- `.planning/phases/08-travel-lifecycle-travel-01/08-CONTEXT.md` D-07..D-09 (durata, velocità), D-16/D-17 (teleport), D-21 (partenza in un solo update); `BACKEND-NOTES.md` §3 (semantica), §5 (interpolazione per lunghezza del FE), §6 (completamento, reconciler, sweep, push), §8 (scala delle durate: numeri riusati sopra)
- `.planning/phases/14-viaggio-e-cibo/14-CONTEXT.md` D-11..D-13 (partenza transazionale, teleport esente, cibo mai rimborsato) e `BACKEND-NOTES.md` §6/§9 (la deviazione non rifà il piano del cibo)

### Quest, esiti e generazione (Phase 9, 9.2, 13, 13.1)
- `.planning/phases/09.2-quest-result-delivery-contract/BACKEND-NOTES.md` (delivery dei risultati, ack, change stream owner-only)
- `.planning/phases/13-generazione-quest/13-CONTEXT.md` D-03/D-07 (composizione singolo o branco, pool di zona + `city`), `13-REPO-RULES.md` (modello per le `15-REPO-RULES.md`); `.planning/phases/13.1-correzioni-generazione-quest/13.1-CONTEXT.md` (animali fuori dalle quest generate: qui dentro, D-07; fasce contigue per rango)
- `.planning/phases/11-popolamento-del-mondo/source/world-building.md` righe 149–177 (titoli per livello e tabella Facile/Medio/Difficile/Mortale in PE)

### FE companion
- `../Klimmeck-Guide/.planning/phases/16-travel-ambushes/16-CONTEXT.md` — decisioni FE (carosello dei report, banner di sconfitta, pedina che riparte dal punto)
- `../Klimmeck-Guide/.planning/phases/09-combat-result-sheet/BACKEND-NOTES.md` e `07-travel/BACKEND-NOTES.md` — cosa consuma oggi il FE di `QuestResult` e `activeTravel`

### Regole del repo
- `CLAUDE.md`, `.planning/phases/14-viaggio-e-cibo/14-REPO-RULES.md` (modello per le `15-REPO-RULES.md`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Viaggio: `src/models/character/active-travel.model.ts` (`road { coordinates, distance }`, `startTime`, `endTime`, `duration`, `to`, `kind` interno), `src/travel/travel-timing.ts` (`BASE_SPEED`, `durationMsOf`, `buildActiveTravel`), `src/travel/travel-planner.service.ts` (velocità pet × ferite :200-205, `planFree`/`planAuto`), `src/roads/roads.service.ts` (grafo in memoria, `routeBetween` :199-218, `MAX_SNAP_DISTANCE_KM`, haversine R 127,42), `src/roads/road-route.ts` (`routeOf`), `src/travel/travel.updates.ts` (`startTravelFilter/Update`, `completionFilter`/`COMPLETION_UPDATE` :75-100, `teleportFilter`, `dueTravelsFilter`), `src/travel/travel-completion.service.ts` (`complete` :69-119, `arriveOnMarker`, push `travelEnd` solo `kind: free`), `src/travel/travel-sweeper.ts` (reconciler + sweep single-flight), `src/travel/travel-job.ts` (jobId deterministico), `src/travel/travel-scheduler.service.ts` (`schedule`/`cancel`), `src/queues/enqueue-trigger.ts`
- Esiti: `src/quests/outcomes/combat/combat-resolver.ts` (porta, `CombatContext`, `ParticipantEffects`), `placeholder-combat-resolver.ts` (`PLACEHOLDER_RULES`, clamp ≥ 1), `combat-context.ts` (`buildCombatContext`), `combatant-plan.ts` (`enemyFactsOf`, Σ xp), `outcome-plan.ts` (xp :330, monete :394, ferite `woundsAfter` :175-189, `awaitingAid` :427-435 da non toccare), `outcome-writer.service.ts` (scrittura personaggio + wallet + risultato, `deliver`/`notify`), `progression/level-table.ts` (`progressionAfter`, `MIN_LIFE_POINTS`, `lifePointsWithin`), `src/quests/outcomes/chance-source.ts`, `src/quests/generation/seeded-chance.ts`
- Generazione: `src/quests/generation/generation-rules.ts` (`XP_SCALE`, `RANK_XP_BANDS`, `budgetOf`), `enemy-pool.ts` (`zonePoolOf` :37-44, `fallbackPoolOf` :47-58), `enemy-candidate.ts` (`readEnemyCandidates`, animale = lore `animal`), `quest-composition.ts` (`composeEnemyQuest` :142-166, `composeQuest` :193-201), `generated-prizes.ts` (`GENERATED_PRIZES`, `TIER_MULTIPLIER`)
- Risultati: `src/models/quest-result/quest-result.model.ts` (campi, `quest` richiesto oggi, indice `{user, acknowledgedAt, resolvedAt, _id}`), `src/models/quest/quest-enemy.model.ts`, `src/quests/results/quest-results.publisher.ts` (change stream), `quest-results.resolver.ts`, `quest-result-acknowledgement.service.ts`, `quest-result.populate.ts`
- Posti e abbandono: `src/quests/party/party-abandon.service.ts` (transazione propria, filtro `arrivedAt` ≠ null), `party-rules.ts` (`abandonClaimFilter`), `src/characters/deletion/seat-release.ts` (`unstartedSeatReleaseOf`, `placeholderMarkOf`)
- Push: `src/models/enums/push-event-type.enum.ts` (`PushEventType`: questCancelled, questEnd, streamerLive, travelEnd), il notifier di `travel-completion.service.ts` :182-195
- Config: `src/config/*-config.ts` + `env.validation.ts` + `env-example.drift.spec.ts`; `src/auth/clock.ts` (`Clock`, `FixedClock`)

### Established Patterns
- «Il filtro è la regola»: un solo `findOneAndUpdate` condizionale con l'identità riaffermata (`startTime`, `endTime`); job Bull = trigger, DB = verità, reconciler al boot + sweep periodico single-flight (Phase 8)
- Moduli puri con costanti di dominio e porta `ChanceSource`/`Clock` iniettata; integration sul replica set con fixture `persist*`, `--runInBand`
- Push data-only best effort dopo il commit, mai dentro la transazione; categorie in `PushEventType` e registro device (Phase 5)
- SDL additivo con eccezioni dichiarate nel handoff; `git diff --exit-code src/schema.gql` in CI; `EXPECTED_OWNER_ONLY_HANDLERS` per i resolver owner-only
- Letture lean fuori dalla scrittura; populate solo dove serve il nome (`enemies.enemy`)

### Integration Points
- La partenza (`startTravel`, `claimLane`) costruisce l'`activeTravel`: il sorteggio entra lì (campo interno `ambush`), il job dopo il commit come `scheduler.schedule`
- `TravelCompletionService.complete` è il punto in cui i report trattenuti diventano `QuestResult` (stessa transazione); `TravelService.teleport` il secondo
- Il job dell'imboscata riusa `buildCombatContext` + `CombatResolver` + le regole di `outcome-plan.ts` (xp, monete, ferite, clamp) senza passare da `OutcomeWriter.deliver` (nessun `questEnd`)
- `roads.service` fornisce la rotta punto → città più vicina (Dijkstra multi-destinazione o 167 `routeBetween`)
- La FE Phase 16 aspetta la merge di questa fase: SDL, categoria push e handoff chiudono la fase

</code_context>

<specifics>
## Specific Ideas

- Utente 2026-11-06, modello delle imboscate multiple (verbatim in D-02); scelte esplicite: calibrazione «Morbida» al posto della «Media» raccomandata, «Solo il POI più vicino» al posto dell'unione entro 10 km, «Sì, ma anche quando la città più vicina è la meta» per il push di sconfitta, «Tutto all'arrivo (decisione del 29/10)» per i report, «Solo `travelEnd` come oggi» per l'arrivo.
- Numeri mostrati all'utente (DB di sviluppo del 2026-11-06 e handoff Phase 8 §8): 206 nemici di cui 178 non leggendari (`xp` 1–1408), 642 POI (tutti con città, 220 con più tipi, 167 marker `city`), 167 città, 964 strade; città → città più vicina 15,8 km / 2,72 h, marker quest 12,4 km, città qualsiasi mediana 204 km / 35,4 h, massimo 506 km / 82,3 h; 4 personaggi di prova (livelli 1, 3, 13, 20; Reavor legend con due ferite).
- Correzione fatta nel discuss: la prima tabella mostrata confrontava i PE del world building con `Enemy.xp` già scalato; i numeri di D-08 sono quelli corretti (× `XP_SCALE`).

</specifics>

<deferred>
## Deferred Ideas

- **Imboscate sulla deviazione** dopo una sconfitta — offerto, non scelto (la deviazione è sicura, D-03).
- **Costi di cibo/HP sulla tratta deviata** — offerto, non scelto (D-11).
- **Push per ogni report all'arrivo o categoria «Imboscate» d'arrivo** — offerti, non scelti (D-13).
- **Loot dagli assalitori** — mai richiesto; solo monete e xp (D-10).
- **Sblocco delle lore dei nemici battuti in imboscata** — BE Phase 16 (le vittorie in imboscata dovranno contare come vittorie).
- **Visibilità delle imboscate nel pannello del GM / audit** — fuori v1.0.
- **Calibrazione per zona o per regno** (strade più pericolose) — costanti globali per ora (D-04).
- **Fascia «Difficile» per i viaggi notturni** — non discusso; una sola fascia [Facile, Medio] (D-08).

</deferred>

---

*Phase: 15-imboscate-in-viaggio*
*Context gathered: 2026-11-06*
