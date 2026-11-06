# Phase 15: Imboscate in viaggio - Research

**Researched:** 2026-11-06
**Domain:** NestJS 11 + Mongoose 8.18.1 + Bull + Apollo code-first. Sorteggio puro alla partenza, job Bull sulla coda `travel`, transazione di combattimento fuori da una quest, deviazione su grafo stradale, report trattenuti e consegnati come `QuestResult`
**Confidence:** HIGH sul codice (tutto letto sul branch `feat/15-imboscate-in-viaggio`, `f618ad3`), MEDIUM su due scelte di semantica che il CONTEXT non copre (C1, C7)

## Summary

La fase non richiede librerie nuove. Il fuso orario si risolve con `Intl` nativo: Node 26.12.1 ha ICU 78.3 completa e `Europe/Rome` funziona (probe sotto). Per la città più vicina c'è già `dijkstra.singleSource` di `graphology-shortest-path` 2.1.0. Su un grafo sintetico della taglia del DB di sviluppo (2529 nodi, 3231 archi) costa **5,9 ms**, contro **37,6 ms** per 167 `bidirectional` (probe sotto). Il codice si divide in cinque blocchi:

1. un modulo puro `src/travel/ambush/` (regole, fasce per livello, sorteggio km per km, punto sulla polilinea, piano dell'esito, mappatura del report in `QuestResult`);
2. il sorteggio iniettato nelle due partenze, nello stesso `$set` dell'`activeTravel` (`travel.service.ts:94-103`, `quest-acceptance.updates.ts:76-93`), con il job `ambush` accodato dopo il commit;
3. un `AmbushResolutionService` con processor e sweeper propri, che riusa porta di combattimento, catalogo, regole di ferite/consumi/magie/progressione, wallet e abbandono della corsia;
4. completamento e teleport che inseriscono i report trattenuti nella stessa transazione;
5. lo SDL (`QuestResultKind`, `QuestResult.quest` nullable, `AmbushReport`/`AmbushCity`, `PushEventType.ambushDefeat`).

Il CONTEXT regge sul codice, tranne quattro punti.

- **Metrica del punto dell'imboscata (C1).** Il FE interpola su lunghezze *planari in gradi* (`travel_route.dart:81-85`). L'haversine del BE dà un'altra frazione. Inoltre `TravelPath.distance` non conta i tratti di snap che invece stanno nella polilinea (`road-route.ts:35-39`). Il punto va calcolato come frazione planare `k / distance`, identica al FE, altrimenti la pedina non si trova dove riparte la deviazione.
- **Il titolo non sale con gli xp (C2).** `nextTitleAfterStory` avanza solo con la story (`title-progression.ts:9-16`).
- **`CombatContext.quest.type` è `QuestType` (C3).** Il tipo `'ambush'` non esiste: conviene `QuestType.enemy`.
- **Gli HP non decidono la sconfitta del placeholder (C4).** La probabilità di vittoria è `potere / (potere + HP dei nemici)` (`placeholder-combat-resolver.ts:57-81`). Per forzare la sconfitta in UAT si toglie l'equipaggiamento, non gli HP.

Ci sono anche due buchi di progetto che il planner deve chiudere.

- **(a) Completamento con imboscata pendente.** Il completamento deve rifiutarsi di chiudere un viaggio con un'imboscata pendente (filtro `'status.activeTravel.ambush': null`). Dopo l'ultima imboscata il job `complete` va ri-accodato, altrimenti lo sweep o il job di arrivo possono consumare il viaggio prima dell'imboscata e il report si perde (Pitfall 1).
- **(b) Il placeholder consuma le magie.** A ogni imboscata usa 1 uso di ogni magia attiva (`placeholder-combat-resolver.ts:162-164`), quindi servono i job di recupero dopo il commit (Pitfall 6).

**Primary recommendation:** sorteggio puro in `TravelPlanningModule` (iniettato in `startTravel` e nel claim), `AmbushModule` nuovo (servizio, processor `@Process('ambush')` sulla coda `travel`, sweeper) che importa `QuestOutcomesModule` (con `CombatResolver`, `ChanceSource`, `ResolutionLoader` esportati), report come sotto-documenti interni tipizzati di `ActiveTravel`, `create(drafts, { session, ordered: true })` nel completamento e nel teleport (che diventa transazionale).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Probabilità e sorteggio (BE-AMBUSH-01, BE-AMBUSH-02)
- **D-01 (utente, «Morbida»):** **rischio indipendente per km: 0,2% di giorno, 0,6% di notte** (notte = ore 22–06 nel fuso `AMBUSH_TIMEZONE`, default Europe/Rome). Il server percorre la rotta km per km: il km k-esimo è transitato all'istante `startTime + k / distanza × durata` (velocità costante sulla polilinea, come interpola il FE); al primo km in cui `chance < h(km)` l'imboscata è fissata a quel km e a quell'istante. Probabilità risultanti (giorno / notte piena): 16 km 3% / 9%, 50 km 10% / 26%, 204 km 34% / 71%, 506 km 64% / 95%; un viaggio di 2,7 h partito alle 21:00 cade per il 63% di notte, uno di 35 h per circa un terzo. Il punto dell'imboscata è il punto della polilinea a quel km (interpolazione per lunghezza, come `TravelRoute.pointAt` del FE).
- **D-02 (utente, verbatim):** **più imboscate per viaggio, con risorteggio dopo ogni vittoria.** «Su un percorso di 300km, i primi 100 non avviene nulla, poi hai un'imboscata. Finita l'imboscata si risorteggia e passano altri 130 km prima della successiva. Poi il personaggio riceve un'imboscata dopo 50km (l'ultimo sorteggio è andato male) e nell'ultimo tratto non ne riceve.» Dopo una vittoria il server risorteggia dal km dell'imboscata in poi, con lo stesso modello, sulla strada residua (il viaggio resta invariato: stessi `endTime` e polilinea). **Una sola imboscata pendente alla volta** (un solo job).
- **D-03 (utente, «10 km»):** **soglia di 10 km**: un viaggio con `distance` < 10 km non è mai teso; dopo un'imboscata non si risorteggia se restano meno di 10 km; **dopo una sconfitta la deviazione verso la città è senza imboscate**.
- **D-04 (default tecnico, per il veto):** **costanti in codice di dominio** (pattern `FOOD_RULES`, `PLACEHOLDER_RULES`, `generation-rules.ts`): ad esempio `src/travel/ambush/ambush-rules.ts` con `AMBUSH_RULES = { dayHazardPerKm: 0.002, nightHazardPerKm: 0.006, nightStartHour: 22, nightEndHour: 6, minTravelKm: 10, minRemainingKm: 10 } as const` e funzioni pure (ora locale di un istante, tasso per km, sorteggio su una rotta a partire da un km, punto a un km della polilinea). Solo **`AMBUSH_TIMEZONE`** passa dall'ambiente (opzionale, default `Europe/Rome`, validata al boot con `Intl.DateTimeFormat` nel pattern `config/*-config.ts` + `env.validation.ts` + drift di `.env.example`); nessuna dipendenza nuova per il fuso (`Intl` nativo). Il caso viene dalla porta `ChanceSource` già iniettata (`MathChanceSource` in produzione, `SeededChanceSource`/`FixedClock` nei test).
- **D-05 (default tecnico):** **il sorteggio della partenza si fa costruendo l'`activeTravel`** (partenza libera in `startTravel` e automatica in `claimLane`, nello stesso update condizionale di Phase 8/14) e si persiste in un campo interno `activeTravel.ambush { at, km }` **mai esposto sul filo** (come `kind`); il job Bull `ambush` sulla coda `travel` (jobId deterministico, es. `ambush-<characterId>-<startTimeMs>-<atMs>`, `delay` fino ad `at`, pattern `enqueueTrigger`) è solo il trigger: **reconciler al boot e sweep** come i viaggi (`TravelSweeper` o gemello, filtro `activeTravel.ambush.at ≤ now`), job duplicato, in anticipo o obsoleto no-op perché la transazione dell'imboscata riafferma nel filtro `activeTravel.startTime` e `activeTravel.ambush.at`. Il job della nuova imboscata (dopo una vittoria) e il job `complete` del viaggio riscritto (dopo una sconfitta) si schedulano dopo il commit; i job vecchi decadono per identità.

#### Nemici dell'imboscata (BE-AMBUSH-03)
- **D-06 (utente, «Solo il POI più vicino»):** **zona = i `type` del POI più vicino al punto dell'imboscata** (scansione in memoria dei 642 POI con l'haversine di gioco di `roads.service`, nessun indice geografico; i marker di città contano, tipo `city`); **`all` di riserva** se il pool di zona è vuoto o non componibile. Tutti i POI appartengono a una città: il report porta «presso <città del POI>» (D-14).
- **D-07 (utente):** **pool = nemici non leggendari della zona + animali della zona + habitat `city` sempre** (banditi, cultisti…): a differenza di `zonePoolOf` della Phase 13 gli **animali sono inclusi** (sulla strada sono gli assalitori più naturali); i **leggendari mai** (restano alle worldMission). Il costruttore del pool riceve questa variante come parametro, non si duplica.
- **D-08 (utente, confermato coi numeri corretti):** **fascia = [Facile, Medio] del livello del personaggio** dalla tabella del world building (`.planning/phases/11-popolamento-del-mondo/source/world-building.md` righe 156–177, valori in PE) **convertita con `XP_SCALE` (0,14084507) e arrotondata** alla scala di `Enemy.xp`: livello 1 → 4–7, 3 → 11–21, 5 → 35–70, 8 → 63–127, 10 → 85–169, 13 → 155–310, 16 → 225–451, 20 → 394–803 (singoli disponibili sul DB: 19, 22, 31, 52, 33, 26, 22, 17). La tabella entra in codice come costante per livello (20 righe, Facile e Medio); **composizione come la Phase 13** (`composeEnemyQuest`: singolo nella fascia oppure branco di nemici più deboli con somma nella fascia, stessa logica di budget e tetto) con la fascia per livello al posto di quella per rango. Se né il pool di zona né quello di riserva sono componibili, l'imboscata **non avviene**: nessun report, nessun effetto, e si risorteggia dal punto come dopo una vittoria (default tecnico).
- **D-09 (default tecnico):** **scontro con la porta `CombatResolver`** (placeholder oggi, nessuna modifica al motore) con un contesto costruito come per le quest (`buildCombatContext`: HP correnti all'istante, ferite, equipaggiamento, magie attive, consumabili) e un `quest` sintetico `{ id: <id dell'imboscata>, type: 'ambush', title: 'Imboscata presso <città>' }`; unico partecipante il viaggiatore. Gli HP correnti sono già al netto del cibo (Phase 14 scala alla partenza).

#### Esito (BE-AMBUSH-04, BE-AMBUSH-05)
- **D-10 (utente):** **vittoria → HP e ferite del motore applicati subito** (perdita dimezzata e 20% di ferita con il placeholder), **ricompense come una quest `enemy` generata del rango**: `GENERATED_PRIZES.enemy` (150 rame, 40 xp) × `TIER_MULTIPLIER` del titolo (rookie 1, adventurer 2, paladin 5, mage 12, hero 25; legend come hero) **più la somma degli xp dei nemici battuti** (× quantità); monete via wallet e xp via `progressionAfter` (livello e titolo possono salire) **nello stesso istante**, in una sola transazione con lo snapshot del report; **viaggio invariato**; poi il risorteggio di D-02.
- **D-11 (utente):** **sconfitta → in una sola transazione:** HP del motore mai sotto 1 e ferite (nessun `awaitingAid`, nessun soccorso, nessuna morte); **città più vicina = minor tempo di strada dal punto** (Dijkstra dal nodo agganciato con `MAX_SNAP_DISTANCE_KM`, velocità con il pet e **le ferite nuove**) fra i 167 marker, **meta e partenza comprese** (se la più vicina è la meta la pedina prosegue fin lì); **`activeTravel` riscritto dal punto**: `kind: free`, polilinea punto → città, **`startTime` = istante dell'imboscata**, `endTime = startTime + durata`, `duration`, `to` = marker della città (il FE interpola da `startTime` e `duration`: una polilinea «partenza → punto → città» con il vecchio `startTime` lo sbaglierebbe); **`pendingQuest` abbandonata nella stessa transazione** (la `PendingQuest` cancellata, posto liberato con `$pull` da `registeredAdventurers`, `quests.pendingQuest = null`, riusando gli helper di `characters/deletion/seat-release.ts`: `abandonQuest` non vale in viaggio perché il suo filtro richiede `arrivedAt`); **cibo non rimborsato e nessun costo sulla tratta deviata** (né cibo né HP); nessun risorteggio (D-03). I report già accumulati (D-13) seguono nel nuovo `activeTravel`.
- **D-12 (utente):** **ogni sconfitta manda subito un push di categoria nuova** (es. `ambushDefeat`, nome definitivo nelle REPO-RULES; `PushEventType` esteso), **anche quando la città più vicina è la meta**: data-only come gli altri, con l'id del personaggio e **il nome della città raggiunta** (il FE compone il banner «Imboscata! Sei stato sconfitto: la via torna verso <città>», tap → Mappa); inviato dopo il commit, best effort come `travelEnd`. **Vittoria: nessun push.**

#### Report e consegna (BE-AMBUSH-06)
- **D-13 (utente, conferma della decisione del 2026-10-29):** **tutto all'arrivo**: nessun report è visibile prima della fine del viaggio. Default tecnico: lo snapshot di ogni imboscata risolta (esito, nemici con quantità, HP prima/dopo, ferite, monete, xp/livello/titolo prima/dopo, consumabili e magie usate dal motore, istante, città del POI, città raggiunta) si accumula in un campo interno **`activeTravel.ambushReports[]`** (mai sul filo), copiato nell'`activeTravel` riscritto alla sconfitta; **il completamento del viaggio inserisce i `QuestResult`** (uno per imboscata) **nella stessa transazione** del `findOneAndUpdate` di arrivo (`TravelCompletionService.complete`, che oggi non scrive risultati), con **`resolvedAt` = istante dell'imboscata** (la coda FE ordina per data: i report precedono qualsiasi risultato di quest dello stesso arrivo); la delivery resta quella esistente (change stream owner-only `questResultReceived`, `unacknowledgedQuestResults`, `acknowledgeQuestResult`). **Nessun push `questEnd` per i report**: il `travelEnd` del viaggio libero o deviato basta, l'arrivo al marker di una quest resta muto (utente: «Solo `travelEnd` come oggi»). **Il teleport del GM annulla l'imboscata pendente** (job no-op per identità) **e consegna i report accumulati** nella stessa transazione del teleport.
- **D-14 (default tecnico, contratto per la FE Phase 16):** **SDL additivo con un'eccezione dichiarata**: `QuestResult.kind: QuestResultKind!` (`quest` | `ambush`; i documenti esistenti leggono `quest`), **`QuestResult.quest` diventa nullable** (null per le imboscate: l'unica modifica non additiva, dichiarata nel handoff; il FE Phase 9 la seleziona senza assumerla), `QuestResult.ambush: AmbushReport` (`{ at: DateTime!, nearCity: { id, name } (città del POI più vicino), reachedCity: { id, name } (solo in sconfitta, altrimenti null) }`); `outcome` riusa `success`/`failure`; `enemies` snapshot con `quantity` come le quest; `hpBefore/hpAfter/maxLifePoints/injuriesAdded/rewards.coins/xp*/level*/title*/consumablesUsed/spellsUsed` come oggi. Nomi definitivi nelle REPO-RULES.

#### Anteprime, teleport, prove e handoff (BE-AMBUSH-07)
- **D-15 (roadmap):** `travelPreview` e `questTravelPreview` invariati: nulla sul filo svela un'imboscata; nessuna query o mutation nuova (`EXPECTED_OWNER_ONLY_HANDLERS` invariato); `src/schema.gql` rigenerato e committato.
- **D-16 (default tecnico):** integration sul replica set: vittoria (effetti subito, viaggio invariato, risorteggio), sconfitta con deviazione verso la città più vicina (caso «meta compresa» e caso quest abbandonata con posto liberato), notte vs giorno (`FixedClock` + fuso), viaggio sotto 10 km senza sorteggio e residuo sotto 10 km senza risorteggio, job duplicato/in anticipo/obsoleto no-op, reconciler e sweep, teleport che annulla e consegna, report inseriti all'arrivo con `resolvedAt` dell'imboscata, push su ogni sconfitta e mai in vittoria, pool senza nemici componibili. Handoff **`BACKEND-NOTES.md`** per la FE Phase 16: SDL verbatim, categoria push e payload, semantica (modello per km, fascia per livello, città più vicina, report trattenuti), numeri del discuss, **dati per la UAT** (come forzare un'imboscata a DB: `activeTravel.ambush.at` spostato nel passato + sweep; HP bassi per forzare la sconfitta; due imboscate per il carosello FE).

### Claude's Discretion
- Nomi (modulo, costanti, campi interni, enum, categoria push, jobId), granularità del percorso km per km (km interi, ultimo km parziale proporzionale), scelta dell'id dell'imboscata, forma dello snapshot interno, righe di log, se il sorteggio vive dentro il builder dell'`activeTravel` o subito dopo il commit della partenza (purché prima della schedulazione del job), come il costruttore del pool riceve la variante «animali inclusi», come la fascia per livello si innesta nella composizione della Phase 13.

### Deferred Ideas (OUT OF SCOPE)
- **Imboscate sulla deviazione** dopo una sconfitta — offerto, non scelto (la deviazione è sicura, D-03).
- **Costi di cibo/HP sulla tratta deviata** — offerto, non scelto (D-11).
- **Push per ogni report all'arrivo o categoria «Imboscate» d'arrivo** — offerti, non scelti (D-13).
- **Loot dagli assalitori** — mai richiesto; solo monete e xp (D-10).
- **Sblocco delle lore dei nemici battuti in imboscata** — BE Phase 16 (le vittorie in imboscata dovranno contare come vittorie).
- **Visibilità delle imboscate nel pannello del GM / audit** — fuori v1.0.
- **Calibrazione per zona o per regno** (strade più pericolose) — costanti globali per ora (D-04).
- **Fascia «Difficile» per i viaggi notturni** — non discusso; una sola fascia [Facile, Medio] (D-08).

### Nomi del contratto già fissati (`15-REPO-RULES.md`, bozza 2026-11-06)
`enum QuestResultKind { quest ambush }`; `QuestResult.kind: QuestResultKind!`; `QuestResult.quest: QuestResultQuest` (null sse `kind == ambush`); `type AmbushCity { id: ID! name: String! }`; `type AmbushReport { at: DateTime! nearCity: AmbushCity! reachedCity: AmbushCity }`; `QuestResult.ambush: AmbushReport`; `PushEventType.ambushDefeat` con `{ type, id: <characterId>, title: 'Imboscata!', body: 'Sei stato sconfitto: la via torna verso <nome città>' }` e il TTL di `travelEnd`; `ActiveTravel` sul filo identico; modulo `src/travel/ambush/` con `ambush-rules.ts` (`AMBUSH_RULES`), `level-bands.ts` (`LEVEL_BANDS`), `ambush-draw.ts`, `ambush-point.ts`, job `ambush` con `ambushJobId(characterId, startTimeMs, atMs)`, `AmbushResolutionService`, `AmbushSweeper` o estensione di `TravelSweeper`, `src/config/ambush-config.ts` (`AMBUSH_CONFIG`, `AMBUSH_TIMEZONE`).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-AMBUSH-01 | Sorteggio km per km 0,2%/0,6% (22–06 in `AMBUSH_TIMEZONE`), nessun sorteggio sotto 10 km, risorteggio dopo vittoria, interno mai sul filo | F1 (punti d'innesto `travel.service.ts:94-103`, `quest-acceptance.updates.ts:76-93`, campo interno come `kind` `active-travel.model.ts:56-57`), F2 (probe ICU, `hourCycle: 'h23'`), Pattern 1-2, C1, C8 |
| BE-AMBUSH-02 | Job Bull all'istante, reconciler al boot + sweep, duplicato/obsoleto no-op, teleport annulla e consegna | F3 (`travel-completion.processor.ts:14-41`, secondo `@Process` sulla stessa coda, `enqueueTrigger` `enqueue-trigger.ts:29-56`, `TravelSweeper` `travel-sweeper.ts:34-106`), F7 (teleport `travel.service.ts:138-167`), F13, Pitfall 1 |
| BE-AMBUSH-03 | POI più vicino + animali + `city`, mai leggendari, `all` di riserva, fascia [Facile, Medio] × `XP_SCALE`, composizione Phase 13, `CombatResolver` | F9 (`enemy-pool.ts:19-58`, `quest-composition.ts:143-202`, `generation-rules.ts:4`), F4 (`buildCombatContext` `combat-context.ts:252-267`, `readCatalog` `resolution-loader.service.ts:398-450`), C3 |
| BE-AMBUSH-04 | Vittoria: HP/ferite subito, monete e xp come una `enemy` del rango + Σ xp, viaggio invariato | F10 (`generated-prizes.ts:55-69`, `level-table.ts:58-71`, `wallet.service.ts:35-58`), F4 (helper privati di `outcome-plan.ts:181-283` da esportare), C2 |
| BE-AMBUSH-05 | Sconfitta: HP ≥ 1, `activeTravel` riscritto dal punto verso la città più vicina, `pendingQuest` abbandonata, push `ambushDefeat` | F5 (`dijkstra.singleSource`, probe 5,9 ms), F6 (`seat-release.ts:11-23`, `party-abandon.service.ts:46-78`), F11 (push `push-events.ts:9-71`), C7 |
| BE-AMBUSH-06 | Report inseriti come `QuestResult` all'arrivo/teleport con `resolvedAt` = istante, pipeline esistente, nessun `questEnd` | F7 (`travel-completion.service.ts:75-104`, `UNACKNOWLEDGED_RESULTS_SORT` `quest-result-acknowledgement.ts:7`, publisher sugli insert `quest-results.publisher.ts:18-21`), F8 (modello `quest-result.model.ts:95-97`, `create` con `ordered: true` Pitfall 4) |
| BE-AMBUSH-07 | Integration su tutti i casi, anteprime che non svelano, handoff | Validation Architecture (harness `createOutcomeHarness` `test/quests/outcome-world.ts:126-170`, `ScriptedCombatResolver`, `SequenceChance`, `FakeTravelQueue`), C4 (dati UAT) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Stack fisso: NestJS 11, Mongoose 8, Apollo code-first, Bull/ioredis, `graphology`. Nessuna libreria nuova (D-04: `Intl` nativo).
- **TDD Red → Green → Refactor** su ogni modulo. Clean Code, SoC, Boy Scout Rule: si esportano gli helper privati invece di duplicarli (Pattern 5).
- **Il backend è fonte di verità**: sorteggio, combattimento, deviazione ed effetti sono tutti server-side; il FE interpola soltanto.
- **Compatibilità FE**: SDL additivo con l'unica eccezione dichiarata (`QuestResult.quest` nullable). La FE Phase 16 consuma dopo la merge.
- Branch e PR verso `develop`. **Nessun trailer `Co-Authored-By` / `Generated with`** (regola dell'utente in `15-REPO-RULES.md`, prevale).
- Nessun segreto, mai leggere `.env`. `process.env.` solo nei provider di config (`src/config/env-example.drift.spec.ts:10-12`).
- Da `15-REPO-RULES.md`:
  - mai `npm run lint`/`npm run format`/`npm run build`/`nest build`;
  - `npx tsc --noEmit -p tsconfig.json` come gate;
  - jest con i percorsi prima di `--selectProjects`, integration `--runInBand`, mai in background;
  - nessun `Math.random` nel modulo imboscate;
  - nessuna migrazione o seeder e nessun avvio contro il DB reale;
  - operatori Mongo solo in code span nei `.md` e mai nei titoli dei test.

## Standard Stack

### Core (già installato, nessuna aggiunta)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mongoose | 8.18.1 (`node_modules/mongoose/package.json`) | transazioni, `findOneAndUpdate` condizionale, sotto-documenti interni | pattern di completamento ed esiti [VERIFIED: codebase] |
| @nestjs/bull + bull | in uso | secondo job nominato `ambush` sulla coda `travel` | stesso pattern di `quest-resolution.processor.ts:28-80` (tre `@Process` sulla stessa coda) [VERIFIED: codebase] |
| graphology-shortest-path | 2.1.0 (`node_modules/graphology-shortest-path/package.json`) | `dijkstra.singleSource(graph, source, weight)` → mappa nodo → cammino | già usato per `bidirectional` (`roads.service.ts:204-209`); `singleSource` dichiarato in `dijkstra.d.ts` [VERIFIED: node_modules] |
| `Intl.DateTimeFormat` | Node 26.12.1, ICU 78.3 (full) | ora locale in `Europe/Rome` | nativo, nessuna dipendenza (D-04) [VERIFIED: probe] |
| jest 30 + mongodb-memory-server + redis-memory-server | in uso | unit, integration sul replica set, processor su Redis effimero | harness esistenti [VERIFIED: codebase] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `dijkstra.singleSource` una volta + `routeOf` per i 167 marker (consigliato) | 167 × `routeBetween` | 37,6 ms contro 5,9 ms sul grafo della taglia reale. Funzionano entrambi; `singleSource` è un solo giro e la parità si risolve in un punto solo |
| Sorteggio per km con un tiro per km (D-01, consigliato) | Un solo tiro `u` e inversione della CDF (stessa distribuzione) | Il tiro per km è la regola scritta nel CONTEXT. Nei test si forza col fallback di `SequenceChance` (`test/quests/sequence-chance.ts:9-22`: fallback `0` = imboscata al primo km, `0.99` = mai) |
| `AmbushModule` separato con `AmbushSweeper` (consigliato) | Estendere `TravelSweeper` | Estenderlo vorrebbe dire importare in `TravelModule` lo stack degli esiti (`QuestOutcomesModule`, code `quest-resolution` e `spell-recovery`), che entrerebbe in ogni harness dei viaggi. Il modulo separato isola il costo (Pitfall 9) |

**Installation:** nessuna.

## Findings per flag

### F1 — Partenza e campo interno
- **Viaggio libero.** `TravelPlanner.planFree` costruisce il draft (`travel-planner.service.ts:128-134`, `buildActiveTravel` `travel-timing.ts:42-64`). `TravelService.startTravel` (`travel.service.ts:66-76`) lo scrive nella transazione con `startTravelUpdate(plan.travel, mealSet)` (`travel.updates.ts:55-60`, `$set` di `status.activeTravel`) e dopo il commit chiama `scheduler.schedule` (`:75`).
- **Viaggio da quest.** `movementTo` → `planner.planAuto` → `autoRoute` (`travel-planner.service.ts:141-166`). Il claim scrive `movement.travel` con `laneClaimUpdate` (`quest-acceptance.updates.ts:76-93`) dentro la transazione (`quest-acceptance.service.ts:194-237`, `claimLane` `:422-461`). Dopo il commit: `scheduler.schedule(characterId, movement.travel)` (`:240-241`).
- **Dove innestare il sorteggio.** Va fatto **dopo** il planner e **prima** della transazione, arricchendo il draft (`{ ...travel, ambush }`): in `startTravel` subito dopo `planFree` (`travel.service.ts:70`), nel claim subito dopo `movementTo` per `kind: 'travel'`. Non va fatto in `buildActiveTravel` né nel planner, perché `previewOf` (`travel-pantry.reader.ts:146-159`) e `previewTravel` (`quest-acceptance.service.ts:264-...`) chiamano lo stesso planner: consumerebbero caso a ogni apertura del foglio e sposterebbero le sequenze dei test. Il draft è calcolato fuori dal callback, quindi i retry per WriteConflict riscrivono la stessa imboscata (determinismo). Il `$set` dell'oggetto intero porta `ambush` senza toccare i filtri.
- **Campo interno.** `kind` è `@Prop` senza `@Field` (`active-travel.model.ts:56-57`), mentre `@ObjectType` espone solo i `@Field`. `ambush` e `ambushReports` seguono lo stesso pattern: `@Prop({ type: AmbushPlanSchema, default: null })` e `@Prop({ type: [AmbushReportSnapshotSchema], default: [] })`. Lo SDL resta fermo grazie a `test/app.int-spec.ts:514-516` (stringa esatta di `type ActiveTravel`) e `:757` (`PendingRequestCharacter.activeTravel: ActiveTravel`). Nessuna asserzione `Object.keys` sul sotto-documento: le uniche (`grep Object.keys`) stanno su altri oggetti. I `toEqual` su `raw.status.activeTravel` (`gm-completion.service.int-spec.ts:426`, `shop-transaction.service.int-spec.ts:944`, `character-deletion.resolver.int-spec.ts:617`, `equip-pet.int-spec.ts:206`) confrontano documenti scritti via collection grezza e non riscritti: restano verdi.
- `ActiveTravelDraft` (`travel-timing.ts:14-21`) guadagna `ambush?: { at: Date; km: number } | null`. Il tipo `TravelLeg` del pantry legge solo `road`/`duration`, quindi non cambia nulla.
- **Strict mode di Mongoose:** un campo non dichiarato nello schema viene scartato dal cast del `$set` (Pitfall 3). I due `@Prop` vanno quindi dichiarati prima di scrivere.

### F2 — Fuso, config, Clock, ChanceSource
**Probe (comando esatto):**
```
cd …/Klimmeck-Guide-BE && node -e 'const f=(o)=>new Intl.DateTimeFormat("en-US",o); const d=new Date("2026-11-06T23:30:00Z"); console.log("icu", process.versions.icu, …Intl.supportedValuesOf("timeZone").includes("Europe/Rome")); console.log("h23", f({timeZone:"Europe/Rome",hour:"numeric",hourCycle:"h23"}).format(d)); console.log("hour12false", f({…hour12:false}).format(d)); … try{ new Intl.DateTimeFormat("en-US",{timeZone:"Mars/Base"}) }catch(e){…} … resolvedOptions().timeZone … DST …'
```
Esito: `icu 78.3 full? true`; `h23 00`; `hour12false 00` (su questo ICU il «24» non compare più, ma su ICU più vecchi `hour12: false` dà «24» a mezzanotte: si usa **sempre** `hourCycle: 'h23'`); `Mars/Base` → `RangeError Invalid time zone specified`; `europe/rome` è accettato e canonicalizzato in `Europe/Rome` da `resolvedOptions().timeZone`.

| UTC | Ora locale (Europe/Rome) |
|---|---|
| 2026-03-29T00:59Z | 01 |
| 2026-03-29T01:00Z | 03 (salto CEST) |
| 2026-10-25T00:59Z | 02 |
| 2026-10-25T01:00Z | 02 (ritorno CET) |
| 2026-07-01T20:00Z | 22 |
| 2026-07-01T04:00Z | 06 |
| 2026-01-01T05:00Z | 06 |
| 2026-01-01T21:00Z | 22 |

10 000 `format` con formatter riusato: 10,5 ms. [VERIFIED: probe]

- **Formatter.** Si crea una volta per fuso, nel provider o nel servizio, e si riusa. `hourOf(instant) = Number(formatToParts(instant).find(p => p.type === 'hour').value)`. Notte = `hour >= 22 || hour < 6`.
- **Nuova env opzionale.** Si copia `src/config/travel-config.ts:1-47`:
  - `AMBUSH_ENV_KEYS = ['AMBUSH_TIMEZONE'] as const`, export obbligatorio: il drift test raccoglie ogni `*_ENV_KEYS` dei file `-config.ts` (`env-example.drift.spec.ts:7-8,23-34`);
  - `parseAmbushConfig` (vuota → `Europe/Rome`; non valida → `throw` con messaggio senza il valore, come `quest-generation-config.ts:44-47`);
  - `readAmbushEnv`, `ambushConfigProvider` (`provide: AMBUSH_CONFIG`, `config.get<string>('AMBUSH_TIMEZONE')`);
  - riga in `validateEnv` (`env.validation.ts:27-41`) e voce commentata in `.env.example` (blocco Viaggi `:74-77`). La regex `TEMPLATE_KEY = /^([A-Z][A-Z0-9_]*)=/gm` vuole `AMBUSH_TIMEZONE=` a inizio riga;
  - salvare il valore canonico (`resolvedOptions().timeZone`).
- **Clock** (`src/auth/clock.ts:3-12`) si fornisce **per modulo** (`{ provide: Clock, useClass: SystemClock }` in `TravelPlanningModule`/`TravelModule`/`QuestOutcomesModule`). Nei test `createAuthTestApp({ clock })` fa `overrideProvider(Clock)` (`test/auth/auth-test-app.ts:155-156`), che li sostituisce tutti. `FixedClock` (`test/auth/fixed-clock.ts`) ha `advanceSeconds`.
- **ChanceSource** (`src/quests/outcomes/chance-source.ts:4-14`) **non è globale**: la forniscono `QuestOutcomesModule` (`quest-outcomes.module.ts:87`) e `QuestGenerationTriggerModule`. `TravelPlanningModule` deve aggiungere `{ provide: ChanceSource, useClass: MathChanceSource }`. L'override nei test usa il token (`{ token: ChanceSource, useValue: … }`, `test/quests/outcome-world.ts:147`). Per i test ci sono `SequenceChance` (`test/quests/sequence-chance.ts`) e `SeededChanceSource` (`src/quests/generation/seeded-chance.ts:5-37`).

### F3 — Job, processor, sweep
- **Job.** `TRAVEL_QUEUE = 'travel'`, `TRAVEL_COMPLETE_JOB = 'complete'` (`travel-job.ts:6-7`). Il jobId deterministico non contiene `:` (`:16-27`) e il validatore dei dati vive in `travelJobDataOf` (`:30-45`). Si aggiungono `AMBUSH_JOB = 'ambush'`, `AmbushJobData { characterId, startTime, at }` in epoch ms, `ambushJobId(...) = ambush-<hex>-<startMs>-<atMs>` e `ambushJobDataOf` (stessa validazione con `isEpochMs`, `startTime ≤ at`).
- **Processor.** `@Processor(TRAVEL_QUEUE)` con `@Process(TRAVEL_COMPLETE_JOB)` (`travel-completion.processor.ts:14-41`). Un secondo `@Process(AMBUSH_JOB)` sulla stessa coda funziona, in una classe separata `AmbushProcessor` nell'`AmbushModule`: è il pattern di `quest-resolution.processor.ts:28,39,59,80`, tre nomi sulla stessa coda. Regole da copiare: dati malformati → WARN e return; `at > now` → log «in anticipo», return (lo sweep lo prenderà); altrimenti `resolution.resolve(identity)`.
- **Trigger.** `enqueueTrigger(queue, { name, data, jobId, dueAt }, ctx)` (`enqueue-trigger.ts:29-56`) imposta `delay = max(0, dueAt − now)`, `removeOnComplete: true` e timeout. `TravelScheduler.schedule/cancel` (`travel-scheduler.service.ts:37-80`) è il modello. Si consiglia di aggiungere `scheduleAmbush(characterId, startTime, at)` e `cancelAmbush(...)` allo stesso `TravelScheduler`, che ha già la coda e il timeout, senza un secondo scheduler.
- **Sweep.** `TravelSweeper` (`travel-sweeper.ts:34-106`): reconciler sempre al boot, mai atteso (`onApplicationBootstrap` `:49-57`); `setInterval(...).unref()` se `sweepIntervalMs > 0`; single-flight `inFlight` (`:65-70`); seriale (`:79-92`); log col solo codice (`codeOf` `:26-32`). `AmbushSweeper` lo replica con:
  - `dueAmbushesFilter(now) = { ...ACTIVE_CHARACTER_FILTER, 'status.activeTravel.ambush.at': { $lte: now } }`;
  - proiezione `{ 'status.activeTravel.startTime': 1, 'status.activeTravel.ambush.at': 1 }`;
  - stesso `TRAVEL_CONFIG.sweepIntervalMs` (`travel-config.ts:12-30`): nessuna env nuova.
- **Indice opzionale.** Pattern D-17b: `CHARACTER_ACTIVE_TRAVEL_END_INDEX` (`character.model.ts:94-97`). Se aggiunto, va elencato in `src/mongo/sweep-index.verifier.int-spec.ts:53-63` (RED prima).
- **Harness.** `FakeTravelQueue` (`test/travel/fake-travel-queue.ts`) registra `added` e `removed` e sostituisce `getQueueToken(TRAVEL_QUEUE)`. Il processor vero gira su Redis effimero (`travel-completion.processor.int-spec.ts:57-100`: `startRedis`, `BullModule.forRoot`, `SystemClock` reale, polling `waitFor`).

### F4 — Transazione dell'imboscata
- **Modello da seguire: `resolveLoadedIndividual`** (`quest-resolution.service.ts:87-163`).
  - Fuori dalla transazione si legge il catalogo con `readCatalog` (`resolution-loader.service.ts:398-450`).
  - Nel callback: snapshot in sessione col filtro d'identità (`snapshotWhere` `:384-396`, `StaleResolution` se assente), combattimento (`fight` `:166-189`, con `this.combat.resolve(context, this.chance)`), piano puro, `writer.writeParticipant` (`outcome-writer.service.ts:95-108`: `findOneAndUpdate` con filtro, poi `wallet.applyCharacterCoinsDelta(id, delta, session)`, poi `create([result], { session })`).
  - Dopo il commit: `writer.deliver` (`:166-177`).
  - L'esito vive in una variabile esterna, azzerata a ogni retry (`:103-105`).
- **Firma del wallet:** `applyCharacterCoinsDelta(characterId, deltaCopper, session?)` (`src/economy/wallet.service.ts:35-58`). Il delta positivo usa il filtro `activeCharacterById` e scrive `status.coins`.
- **Riutilizzabile senza quest:**
  - `buildCombatContext(hydration)` (`combat-context.ts:252-267`) con `quest: { _id, infos: { type, title } }`, `enemies: [{ snapshot, quantity }]`, `participants: [snapshot]` e le mappe `equipment/spells/loot`;
  - `combatCatalogRefsOf(participants)` (`:150-164`);
  - `enemyFactsOf` (`combatant-plan.ts:74-88`) e `battleOf` (`:91-104`), che lavorano su `ResolutionCatalog`: si passa un catalogo con i nemici composti;
  - `progressionAfter`, `lifePointsWithin`, `MIN_LIFE_POINTS` (`level-table.ts:4,52-71`) e `statusFactsOf` (`status-facts.ts:23-35`).
- **Da esportare, oggi privati in `outcome-plan.ts`:** `woundsAfter` (`:181-189`), `consumablesSpent` (`:192-209`), `sellLine` (`:211-216`) con `applyTradeToInventory`, e `spellsSpent` (`:237-283`). **`planParticipant` non è riusabile** per tre motivi: lancia su fallimento senza aid (`:323-325`), scrive `awaitingAid` (`:427-435`), azzera la corsia (`[lanePath]: null`, `:406`) e aggiunge `completedQuests`.
- Il nuovo piano puro `planAmbushOutcome` compone gli helper esportati (Boy Scout: niente duplicazione).
- **Catalogo.** `readCatalog` dipende dalla quest (`readEnemies` privato `:497-518`, ricompense). Si consiglia di estrarre la parte di combattimento in un metodo pubblico, per esempio `readCombatCatalog(enemies, participants)` (equipaggiamento, magie, loot, `recoveryTimes`, `spellMaxUsages`, nemici letti con `COMBAT_ENEMY_PROJECTION` `:144-151`), riusato da `readCatalog` (refactor senza cambi di comportamento) e dall'imboscata.
- **Moduli.** `CombatResolver`, `ChanceSource` e `ResolutionLoader` sono provider **non esportati** di `QuestOutcomesModule` (`quest-outcomes.module.ts:82-104`). Si consiglia di aggiungerli agli `exports`, così che l'`AmbushModule` usi **la stessa** porta del motore: quando arriverà il motore vero dell'utente, il binding si cambia in un solo posto.

**Forma consigliata:**
```typescript
// src/travel/ambush/ambush-resolution.service.ts — schema, nomi interni a discrezione
interface AmbushIdentity { characterId: Types.ObjectId; startTime: Date; at: Date }
type AmbushOutcome = 'won' | 'lost' | 'skipped' | 'stale';

// filtro d'identità: stesso viaggio, stessa imboscata, già scaduta (gemello di completionFilter, travel.updates.ts:75-84)
export function ambushFilter(identity: AmbushIdentity, now: Date) {
    return {
        ...activeCharacterById(identity.characterId),
        'status.activeTravel.startTime': identity.startTime,
        'status.activeTravel.ambush.at': { $eq: identity.at, $lte: now },
    };
}

async resolve(identity: AmbushIdentity): Promise<AmbushOutcome> {
    const now = this.clock.now();
    // 1. fuori dalla transazione (come readCatalog): personaggio lean col filtro, punto, POI più vicino, pool e composizione
    //    (ChanceSource), catalogo del combattimento, rotta verso la città più vicina e risorteggio dal km (puri, deterministici)
    // 2. transazione: snapshot in sessione con ambushFilter (null → stale); context = buildCombatContext(...);
    //    resolution = this.combat.resolve(context, this.chance); plan = planAmbushOutcome(...);
    //    findOneAndUpdate(ambushFilter + 'status.xp' guard, plan.update, { session }); wallet se vittoria;
    //    sconfitta con pendingQuest letta in sessione → deleteOne PendingQuest + unstartedSeatReleaseOf; esito in variabile esterna
    // 3. dopo il commit: scheduleAmbush (nuova) o schedule(complete) del viaggio riscritto + cancel del vecchio;
    //    ri-accodo del complete se nessuna imboscata resta ed endTime ≤ now (Pitfall 1); recuperi magie; push ambushDefeat
}
```
**Snapshot interno consigliato** in `activeTravel.ambushReports[]`, schema `_id: false` dedicato e **mai** `QuestResultSchema` (Pitfall 5). I campi sono quelli del futuro `QuestResult`, senza `character`/`kind`/`quest`/`acknowledgedAt`:

`{ resultId, user, outcome, at, nearCity { id, name }, reachedCity { id, name } | null, enemies [{ enemy, quantity }], hpBefore, hpAfter, maxLifePoints, injuriesAdded, consumablesUsed, spellsUsed, coins, xpGained, xpBefore, xpAfter, levelBefore, levelAfter, titleBefore, titleAfter }`

- `resultId` è pre-generato (`new Types.ObjectId()`): diventa `QuestResult._id` e anche l'id del `quest` sintetico del contesto (D-09). Un doppio inserimento fallisce così per chiave duplicata.
- `user` è risolto al momento dell'imboscata, con lo stesso lookup del push.

### F5 — Città più vicina e punto dell'imboscata
- **API di `RoadsService`.**
  - Pubblici: `routeBetween(from: LonLat, to: LonLat): RoadRoute | null` (`roads.service.ts:199-218`), che torna `null` con stesso nodo o senza percorso, e `getShortestPath`.
  - Privati: `nodeFor` (`:220-225`: nodo esatto a 7 decimali, poi `nearestNodeWithinSnap` entro `MAX_SNAP_DISTANCE_KM = 5` `:18,77-91`), `haversineDistance` con `R = 127.42` (`:16,43-63`), `lightestEdge` (`:228-245`).
  - Il peso dell'arco è `lengthKm / speedFactor` (`:119-127`), cioè le **ore base**.
- **Dijkstra multi-destinazione:** `dijkstra.singleSource` esiste nella versione installata (`node_modules/graphology-shortest-path/dijkstra.d.ts`) e restituisce `{ [node]: string[] }`.
- **Probe** (`node /private/tmp/claude-501/…/scratchpad/probes/dijkstra-probe.cjs`, grafo sintetico connesso di 2529 nodi e 3231 archi con 167 destinazioni, la taglia del DB di sviluppo secondo il handoff Phase 8 §8): `{"singleSourceMs":5.86,"bidirectional167Ms":37.56}`. [VERIFIED: probe; grafo sintetico, non il DB reale]
- **Metodo nuovo consigliato:** `RoadsService.nearestByTime(from: LonLat, targets: { id: string; location: LonLat }[]): { id, route: RoadRoute } | null`. Fa un `singleSource` dal nodo di partenza, poi `nodeFor(target)` e `routeOf(path, …)` (`road-route.ts:17-40`) per ogni marker; vince il minimo `baseHours`, la parità si scioglie per id. La velocità (pet × ferite) è uno scalare uniforme, quindi **non cambia la città scelta**: entra solo nella durata (`durationMsOf(route.baseHours, speed)` `travel-timing.ts:37-39`). La rotta si può calcolare prima della transazione e solo la durata dentro, con le ferite nuove.
- **Velocità.** `TravelPlanner.speedFor` e `petSpeedOf` sono privati (`travel-planner.service.ts:200-222`): vanno resi pubblici, oppure si aggiunge `TravelPlanner.speedOfCharacter(pet, injuries)`. Formula: `petSpeed × travelSpeedFactorOf(injuries)` (`injury-rules.ts`).
- **`TravelPath.distance`** = Σ km degli archi. Le coordinate sono `[POI partenza, …nodi, POI arrivo]` compresse, con i tratti di snap che **compaiono nella polilinea ma non contano nei km** (`road-route.ts:26-39`; handoff Phase 8 §3).
- **Punto a un km.** Nel BE non esiste alcun helper (`road-route.ts` ha solo `routeOf`/`collapse`): va scritto (`ambush-point.ts`). Il FE (`/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/lib/models/travel/travel_route.dart:35-43,81-85`) interpola sulla **lunghezza planare in gradi** `sqrt(dLat² + dLon²)`, senza haversine e senza `cos(lat)`. → **CONFLICT C1.**
- **Haversine per i POI più vicini.** È privata in `RoadsService`: va estratta in una funzione pura esportata (per esempio `src/roads/game-distance.ts`, `gameDistanceKm(a, b)`), usata dal servizio e dall'imboscata (Boy Scout).

### F6 — Abbandono della corsia standard in viaggio
- **`PartyAbandonService.abandon`** (`party-abandon.service.ts:42-79`) apre una transazione propria e fa quattro cose:
  - legge la corsia in sessione;
  - `deleteOne(abandonClaimFilter)`, che richiede `startDate: null, arrivedAt: { $ne: null }` (`party-rules.ts:84-94`): **non vale in viaggio** (confermato);
  - `updateOne` con `quests.pendingQuest: null` e filtro sulla corsia;
  - `$pull registeredAdventurers.character`, senza filtro `startedAt`.
- Non pubblica nulla a mano: il `questUpdated` arriva dal change stream della collection quest (`quests.publisher.ts:19`, `update`/`replace`) e il `characterUpdated` dal publisher dei personaggi. Nessun job da cancellare.
- **`seat-release.ts` offre in sessione:**
  - `unstartedSeatReleaseOf(questIds, characterId)` → `{ filter: { _id: { $in }, startedAt: null }, update: { $pull: … } }` (`:11-23`);
  - `placeholderMarkOf` (`:27-41`) per le quest già avviate.
  - L'archiver li usa con `updateMany(..., { session })` (`character-archiver.ts:164-171`).
- **Stato della `PendingQuest` in viaggio.** All'accettazione con viaggio `arrivedAt: null` e `startDate: null` (`initialLaneDatesOf` `party-rules.ts:97-107`). L'arrivo li scrive solo nel completamento (`questArrivalUpdate` `travel.updates.ts:110-117`; da soli `startDate` = `endTime`, `travel-completion.service.ts:137-145`). Il party parte solo quando tutti hanno `arrivedAt` (`partyReadinessOf` `party-rules.ts:35-46`) e il claim del party riafferma `$size`/`$all` dei registrati (`:70-81`). **Conferma:** l'imboscata cade solo prima di `arrivedAt` (esiste solo con `activeTravel` non nullo) e la quest non può essere `startedAt` mentre il membro viaggia. `unstartedSeatReleaseOf` basta; `placeholderMarkOf` non serve.
- **Job `quest-resolution`.** Il `resolve` si accoda solo all'avvio (`startDate`); party-timeout e aid-timeout rileggono lo stato al fire. Una `PendingQuest` cancellata resta un trigger obsoleto, senza nulla da cancellare.
- **Casi limite.**
  - Party sciolto dal timeout mentre il membro viaggia (`party-timeout.service.ts:187-234` azzera `quests.pendingQuest`). L'imboscata legge `quests.pendingQuest` **in sessione** e salta l'abbandono se è nullo, senza mai `StaleResolution`.
  - Viaggio `kind: quest` con `pendingQuest` già nullo: si riscrive comunque `kind: free`.

### F7 — Completamento, teleport, consegna
- **Completamento.** `TravelCompletionService.complete` (`travel-completion.service.ts:69-119`) apre la transazione con `findOneAndUpdate(completionFilter, COMPLETION_UPDATE, { session, returnDocument: 'before', projection: COMPLETION_PROJECTION })` (`:79-90`).
  - `COMPLETION_UPDATE` è una **pipeline** (`travel.updates.ts:87-94`), quindi niente cast di Mongoose.
  - `arriveOnMarker` (`:122-156`) gira in sessione; dopo il commit vengono `startAfterCommit` e il push `travelEnd` solo per `kind: free` (`:114-117`, `notifyOwner` `:182-195`).
  - Per inserire i report: `COMPLETION_PROJECTION` (`:97-100`) guadagna `'status.activeTravel.ambushReports': 1` e, se il `before` ne ha, nel callback si fa `questResultModel.create(drafts, { session, ordered: true })` (Pitfall 4). `TravelModule` registra `QuestResult` in `forFeature` (`travel.module.ts:33-39`).
  - Il filtro di completamento deve guadagnare `'status.activeTravel.ambush': null`: `{campo: null}` combacia anche col campo mancante, quindi i viaggi in volo al deploy completano [CITED: mongodb.com/docs/manual/tutorial/query-for-null-fields].
- **Teleport.** `TravelService.teleport` (`travel.service.ts:138-167`) **non è transazionale**: un solo `findOneAndUpdate(teleportFilter, teleportUpdate, { returnDocument: 'before', projection: TELEPORT_PROJECTION })`, poi `scheduler.cancel` del job di viaggio. Per D-13 diventa `connection.transaction` con:
  - la proiezione estesa a `ambushReports` e `ambush.at`;
  - l'inserimento dei report in sessione;
  - dopo il commit `cancel` del job di viaggio **e** `cancelAmbush`.
  `teleportFilter` richiede `STANDARD_LANE_FREE` (`travel.updates.ts:121-128`): con una quest standard in corso il teleport resta rifiutato (`QUEST_IN_PROGRESS`) e i report arrivano solo al completamento. Dopo una sconfitta la corsia è libera e il teleport consegna.
- **Owner.** Lookup `User.findOne({ currentCharacter: { $in: idForms(characterId) } }, { _id: 1 })` (`travel-completion.service.ts:183-189`), oppure `ownersOf` (`src/mongo/owners-of.ts:6-29`). Si consiglia di memorizzare `user` nel report all'istante dell'imboscata, quando serve già per il push: il completamento non deve rifare il lookup e il proprietario è quello dell'istante (`QuestResult.user` è il proprietario anche dopo la morte, `quest-result.model.ts:90-93`).
- **Creazione dei risultati altrove:** solo `OutcomeWriter.writeResult` → `create([result], { session })` (`outcome-writer.service.ts:124-129`).
- **Change stream.** `QuestResultsPublisher` ascolta `operationType: 'insert'` (`quest-results.publisher.ts:18-21`) e rilegge con `findOne` idratato più populate. Gli insert di una transazione arrivano **dopo il commit**, uno per documento [CITED: mongodb.com/docs/manual/changeStreams — i change stream mostrano solo le scritture committate]. Nessun publish manuale.
- **Ordinamento.** `unacknowledgedQuestResults` ordina `{ resolvedAt: 1, _id: 1 }` (`quest-result-acknowledgement.ts:5-7`) con limite 50, sull'indice `{ user, acknowledgedAt, resolvedAt, _id }` (`quest-result.model.ts:202-207`). `resolvedAt` = `at` < `endTime` ≤ istante del risultato di una quest successiva, quindi i report precedono. Il FE ordina per data (D-13).

### F8 — SDL e modelli
- **`QuestResult.quest`** è oggi `@Field(() => QuestResultQuest)` più `@Prop({ required: true })` (`quest-result.model.ts:95-97`) e diventa `@Field(() => QuestResultQuest, { nullable: true })` più `@Prop({ type: QuestResultQuestSchema, default: null, required: function () { return this.kind !== 'ambush'; } })`.
  - Lettori nel BE: nessuno legge `result.quest` fuori dai test (`aid-timeout.int-spec.ts:197`, `quest-generation-trigger.int-spec.ts:154`, `quest-result.schema.spec.ts:129`).
  - Le scritture restano in `planParticipant` (`questFactsOf` `outcome-plan.ts:175-179`) e in `unpopulatedResultOf` (`quest-result.populate.ts:53-66`, spread della draft).
  - `QuestResultDraft.quest` (`outcome-plan.ts:103`) resta non nullo per le quest; la mappatura delle imboscate ha un tipo suo.
- **`kind`.** `@Field(() => QuestResultKind)` più `@Prop({ type: String, enum: Object.values(QuestResultKind), default: QuestResultKind.quest })`. Mongoose applica i default anche all'idratazione dei documenti legacy senza il campo (stesso comportamento provato in `active-travel.schema.spec.ts:18-32` con `hydrate`). Tutte le letture GraphQL dei risultati sono idratate: `findOne`/`findUnacknowledged`/`readCommitted` (`quest-results.service.ts:32-80`). [VERIFIED: codebase]
- **Enum.** Nuovo file `src/models/enums/quest-result-kind.enum.ts` con `registerEnumType(QuestResultKind, { name: 'QuestResultKind' })` (pattern `quest-outcome.enum.ts`).
- **Tipi annidati.** `AmbushCity` e `AmbushReport` vanno in `quest-result.model.ts` accanto a `QuestResultQuest` (`:17-34`, `@ObjectType` più `@Schema({ _id: false })`). `QuestResult.ambush`: `@Field(() => AmbushReport, { nullable: true })` più `@Prop({ type: AmbushReportSchema, default: null })`. Il validatore `required` condizionale lo lega a `kind`.
- **`PushEventType`** vive in **`src/push/push-event-type.enum.ts:4-10`**, non in `src/models/enums/` come scrive il CONTEXT (C5). Il nuovo valore `ambushDefeat` compare nello SDL via `SendTestPushInput`.
- **Asserzioni a stringa esatta da aggiornare RED:**
  - `test/app.int-spec.ts:657-659` (tutto il blocco `type QuestResult`: `quest: QuestResultQuest!` → `quest: QuestResultQuest`, più `ambush: AmbushReport` e `kind: QuestResultKind!` in ordine alfabetico, `sortSchema: true`);
  - `:717-720` (contains su `QuestResult`, restano veri);
  - `:814-815` (contains `enum PushEventType` e `'  questCancelled\n'`, restano veri; aggiungere `'  ambushDefeat\n'`);
  - `:514-516` (`type ActiveTravel`, deve restare identico);
  - nuove: `type AmbushCity {\n  id: ID!\n  name: String!\n}`, `type AmbushReport {\n  at: DateTime!\n  nearCity: AmbushCity!\n  reachedCity: AmbushCity\n}`, `enum QuestResultKind {\n  ambush\n  quest\n}` (ordine alfabetico dei valori atteso con `sortSchema` [ASSUMED: lexicographicSortSchema ordina anche i valori degli enum; verificarlo dal boot reale]).
- **`push-events.spec.ts`:**
  - `BUILDERS: Record<PushEventType, …>` (`:11-16`) non compila senza la voce nuova (RED naturale);
  - `IDENTIFIED_TYPES` (`:17-21`) va esteso;
  - la tabella delle chiavi (`:~95-125`) va estesa;
  - `it.each(Object.values(PushEventType))` (`:65`) copre `testPushMessage`.
- **`push-events.ts`.** `CATALOG: Record<PushEventType, CatalogEntry>` ha corpi **statici** (`:9-34`) e `IDENTIFIED_TYPES` (`:36-40`); `travelEnd(characterId)` restituisce `{ ...CATALOG[travelEnd], id }` con `ttlSeconds: 3600` (`:4,43-46`). Il corpo con la città è dinamico: il builder `ambushDefeat(characterId, cityName)` sovrascrive `body`, mentre la voce di catalogo porta un corpo generico per `testPushMessage` (C5). Il FCM data-only mette `title`/`body`/`id` in `data` (`transport/fcm-message.ts:9-17`).
- **Fixture.** `buildQuestResult` (`test/quests/quest-result.fixture.ts:9-13`) guadagna `kind: 'quest'` per default.

### F9 — Pool e composizione
- **`readEnemyCandidates`** (`enemy-candidate.ts:42-61`) legge la lore `type: animal` e i nemici `legendary: false`, con proiezione `ENEMY_CANDIDATE_FIELDS` (`:8-9`, **senza** `lifePoints`/`damages`) e ordine per `_id`. L'animale si riconosce da `relatedLore` ∩ lore animali (`:37`). Il combattimento richiede poi una lettura con `COMBAT_ENEMY_PROJECTION` per gli id composti (F4).
- **Pool.** `isGeneratable = legendary === false && animal === false` (`enemy-pool.ts:19-20`). `livesIn` accetta sempre `city` più i tipi del POI, mai `all` (`:25-31`); `zonePoolOf` (`:37-44`), `fallbackPoolOf` con `all` (`:47-58`). Variante consigliata senza duplicazione: un terzo parametro `{ animals: 'excluded' | 'included' }`, default `excluded`, su entrambe le funzioni, con il predicato `isPoolable(enemy, options)`.
- **Composizione.** `composeEnemyQuest(rank, pools, chance)` è privata (`quest-composition.ts:143-168`): tira la forma (`:148-151`), poi `budget = budgetOf(rank, ENEMY_SEATS)` e `cap = RANK_XP_BANDS[rank].max` (`:152-153`), poi gira i pool. Estrazione consigliata: `composeEnemies(budget: XpBand, cap: number, pools, chance): ComposedEnemy[] | null`. `composeEnemyQuest` la chiama con fascia e tetto del rango, l'imboscata con `LEVEL_BANDS[level]` (`cap = band.max`). **L'ordine dei tiri non deve cambiare**: le spec a seme fisso del generatore ne dipendono (`quest-composition.ts:1-7`). `composeQuest` costruisce i pool `[zone, fallback se più ampio]` (`:193-202`), stessa regola dell'imboscata.
- **Fasce.** `XP_SCALE = 0.14084507` (`generation-rules.ts:4`) e «xp = max(1, round(PE × XP_SCALE))» (`:3`). La tabella PE (`world-building.md` righe 156–177) è verificata: livello 1 → round(3,52) = 4 / round(7,04) = 7, livello 20 → 394 / 803, come in D-08.
- **POI.** Il generatore legge le città (`_id name type markerLocation pointsOfInterest relatedLore`) e i POI (`_id type location`) (`quest-generator.service.ts:318-334`). `PointOfInterest` ha `type: PoiType[]`, `location: [lon, lat]` e `city` ref (`point-of-interest.model.ts:14-24`). Il modo più economico: `poiModel.find({}, { _id: 1, type: 1, location: 1, city: 1 }).lean()` (642 documenti piccoli) più `cityModel.find({}, { _id: 1, name: 1, markerLocation: 1 }).lean()` (167), poi una scansione con `gameDistanceKm` e parità per id. Se `poi.city` manca si ripiega su `City.markerLocation`/`pointsOfInterest` [ASSUMED: CONTEXT dice «tutti i POI con città», dato del DB di sviluppo non verificato qui].

### F10 — Ricompense e progressione
- **Premi.** `GENERATED_PRIZES[enemy] = { copper: 150, xp: 40 }` (`generated-prizes.ts:55-60`), `TIER_MULTIPLIER` (`:63-69`) indicizzato per `GeneratedRank` (rookie…hero, **senza** legend). Non c'è una funzione titolo → rango: serve `prizeRankOf(title) = title === legend ? hero : title`, nel modulo imboscate o in `generation-rules.ts` accanto a `isGeneratedRank` (`:97-98`).
- **Progressione.** `progressionAfter(before, xpGained, hpAfter)` (`level-table.ts:58-71`) clampa a `MAX_XP = 50 000` e dà livello e massimi dalla tabella, **senza cura al level up**. **Il titolo non cambia mai con gli xp**: `nextTitleAfterStory` è l'unico avanzamento (`title-progression.ts:9-16`). → C2.
- **Monete.** `status.coins` è `CoinPurse` e va scritto solo dal wallet nella stessa sessione (`outcome-writer.service.ts:94-106`). Nel risultato `rewards.coins = fromCopper(delta)` (`src/economy/coins.ts:21-31`, `outcome-plan.ts:456`).

### F11 — Push
- **Invio.** `PushService.sendToUser(userId: ObjectId, message: PushMessage)` (`push.service.ts:56-82`) è già best effort: cattura gli errori e torna i conteggi. Il proprietario si risolve come in `travel-completion.service.ts:182-195`.
- **Fake.** `FakePushTransport` (`test/push/fake-push-transport.ts`) registra in `sent` le coppie `tokens` + `message`; serve un device registrato (`registerDevice` in `test/quests/outcome-world.ts:173-182`).
- **Nessun opt-out per categoria lato server**: i toggle li applica il FE prima della notifica locale (`fcm-message.ts:8`). Il server invia sempre.

### F12 — Test e gate
- **Harness.**
  - Viaggi: `createCharactersTestApp({ clock, imports: [TravelModule], overrides })` con `FakeTravelQueue` e `TRAVEL_CONFIG { sweepIntervalMs: 0 }` (`travel-completion.int-spec.ts:62-110`); viaggio persistito con `buildActiveTravelDoc` (`test/travel/active-travel.fixture.ts`); il tempo avanza con `FixedClock.advanceSeconds`.
  - Mondo: `persistTravelWorld(connection, roads)` (`test/travel/travel-world.ts`): A–B a 0,2° (≈ 0,445 km, **sotto i 10 km**: i test esistenti non sorteggiano mai e restano verdi).
  - Esiti: `createOutcomeHarness({ clock, chance, combat, imports })` (`test/quests/outcome-world.ts:106-170`) con code `quest-resolution`/`spell-recovery` finte, `ChanceSource` e `CombatResolver` sostituiti, `ScriptedCombatResolver` (`test/quests/scripted-combat-resolver.ts`, `willEnd`/`willResolve`). Manca la sostituzione della coda `travel`: va aggiunta un'opzione `overrides`, perché `quiet` sostituisce solo i default.
- **Soglie di coverage.** `./src/travel/` richiede statements 97, branches 84, lines 98 (`package.json:188-192`) e copre già `src/travel/ambush/`. Nessuna soglia su `src/quests/outcomes/`, `src/quests/results/`, `src/push/`. Una voce dedicata `./src/travel/ambush/` è opzionale.
- **Durata.** `npm run test:cov` nella Phase 14: **526,5 s, 341 suite** (`14-07-SUMMARY.md:47`). Con le nuove suite supererà probabilmente i 600 s del tool, quindi il piano di gate deve prevedere l'esecuzione in background (lo strumento la sposta da solo) o il ripiego per cartella.
- **Probe:** `npx jest src/travel/travel-timing.spec.ts src/push/push-events.spec.ts src/quests/generation/quest-composition.spec.ts --selectProjects unit` → 3 suite, 50 test, 2,1 s (3,6 s reali).

### F13 — Write-skew e identità
- **Phase 8/9.**
  - L'identità del viaggio è `startTime` più `endTime` (`travel.updates.ts:13-18,75-84`).
  - La partenza richiede `activeTravel: null` più `STANDARD_LANE_FREE` (`:40-53`) e il claim lo stesso (`quest-acceptance.updates.ts:46-68`).
  - La risoluzione riafferma la corsia e `status.xp` (`outcome-plan.ts:306-318`).
  - Nelle transazioni le scritture concorrenti sullo stesso documento finiscono in WriteConflict, e il driver riesegue il callback (`travel.service.ts:71-74`).
- **Imboscata contro le altre scritture.**
  - Contro partenza e claim: mutuamente esclusive, perché l'imboscata richiede `activeTravel` presente e le altre lo vogliono `null`.
  - Contro il completamento: col filtro `ambush: null` il completamento non può consumare un viaggio con imboscata pendente. Una sconfitta cambia `startTime`, quindi il job `complete` vecchio non combacia più.
  - Contro il teleport (trasformato in transazione): uno dei due va in WriteConflict, l'altro rilegge e non combacia.
  - Contro la risoluzione di una quest: impossibile, la risoluzione esiste solo dopo `startDate`, cioè dopo l'arrivo.
  - Contro uso di oggetti, equip o pet a viaggio in corso: WriteConflict e retry sullo snapshot in sessione.
  - Due trigger della stessa imboscata (job più sweep): uno vince, l'altro trova `ambush.at` cambiato. **Solo chi ha scritto** invia il push e accoda i job (pattern di `travel-completion.service.ts:105-118`).
- **Sweeper `quest-resolution` con `PendingQuest` cancellata a metà viaggio:** il trigger rilegge, non trova e chiude come obsoleto (`quest-resolution.service.ts:73-84`). Non ha nulla da fare, perché il `resolve` di una quest in viaggio non viene mai accodato.

## Architecture Patterns

### Recommended Project Structure
```
src/travel/ambush/
├── ambush-rules.ts            # AMBUSH_RULES, hazardAt(hour), isNight(hour), prizeRankOf(title)
├── level-bands.ts             # LEVEL_BANDS: 20 righe { easyPe, mediumPe } + xpBandOf(level) con XP_SCALE
├── ambush-clock.ts            # localHourOf(instant, formatter) con hourCycle h23 (puro sul formatter)
├── ambush-draw.ts             # drawAmbush(road, startTime, durationMs, fromKm, chance, hourOf) → { at, km } | null
├── ambush-point.ts            # pointAtFraction(coordinates, fraction) planare come il FE (C1) + indice del segmento
├── ambush-enemies.ts          # nearestPoi(point, pois), pool zona/riserva con animali, composizione con fascia per livello
├── ambush-plan.ts             # planAmbushOutcome(...) puro: $set/$push, delta monete, snapshot del report, recuperi magie
├── ambush-results.ts          # ambushResultDraftsOf(reports, characterId) → documenti QuestResult (kind ambush, quest null)
├── ambush-job.ts              # AMBUSH_JOB, AmbushJobData, ambushJobId, ambushJobDataOf
├── ambush.updates.ts          # ambushFilter, dueAmbushesFilter, proiezioni (filtro = regola)
├── ambush-resolution.service.ts
├── ambush.processor.ts        # @Processor(TRAVEL_QUEUE) @Process(AMBUSH_JOB)
├── ambush-sweeper.ts          # reconciler al boot + sweep single-flight
└── ambush.module.ts           # importato da AppModule
src/config/ambush-config.ts    # AMBUSH_CONFIG, AMBUSH_ENV_KEYS, parse/read/provider
src/models/enums/quest-result-kind.enum.ts
src/roads/game-distance.ts     # haversine di gioco R = 127,42 estratta da RoadsService
```
**Moduli:**
- `TravelPlanningModule`: + `ambushConfigProvider`, `ChanceSource`, il sorteggio iniettabile (es. `AmbushPlanner.planFor(travel)`), `scheduleAmbush`/`cancelAmbush` su `TravelScheduler`; esporta tutto ciò che serve a `TravelService` e `QuestAcceptanceService`.
- `AmbushModule`: importa `TravelPlanningModule`, `RoadsModule`, `EconomyModule`, `PushModule`, `QuestOutcomesModule` (con gli export nuovi) e `forFeature` di Character, PendingQuest, Quest, User, PointOfInterest, City, Enemy, Lore.
- `TravelModule` **non** importa `AmbushModule`: il completamento aspetta tramite filtro e il ri-accodo lo fa l'imboscata (Pitfall 1). Aggiunge solo `QuestResult` al `forFeature` e la mappatura pura dei report.

### Pattern 1: sorteggio km per km (BE-AMBUSH-01)
```typescript
// src/travel/ambush/ambush-draw.ts — schema; granularità a discrezione (CONTEXT)
export function drawAmbush(input: {
    road: { distance: number };
    startTime: Date;
    durationMs: number;
    fromKm: number;           // 0 alla partenza, km dell'ultima imboscata dopo una vittoria
    chance: ChanceSource;
    hourOf: (instant: Date) => number;
}): { at: Date; km: number } | null {
    const { distance } = input.road;
    if (distance - input.fromKm < (input.fromKm === 0 ? AMBUSH_RULES.minTravelKm : AMBUSH_RULES.minRemainingKm)) return null;
    for (let km = Math.floor(input.fromKm) + 1; km < distance; km += 1) {   // C8: nessuna imboscata con at ≥ endTime
        const at = new Date(input.startTime.getTime() + Math.floor((km / distance) * input.durationMs));
        if (input.chance.next() < hazardAt(input.hourOf(at))) return { at, km };
    }
    return null;
}
```
Il km finale parziale (fra `floor(distance)` e `distance`) e il km che coincide con `endTime` restano fuori (C8). Con `distance` sotto 10 non si tira nulla: nessun `chance.next()` consumato, e le spec esistenti a sequenza non si spostano.

### Pattern 2: punto planare identico al FE (C1)
```typescript
// src/travel/ambush/ambush-point.ts — stesso algoritmo di TravelRoute.pointAt (travel_route.dart:35-43,81-85)
const planar = ([lon1, lat1]: LonLat, [lon2, lat2]: LonLat) => Math.hypot(lon2 - lon1, lat2 - lat1);
export function pointAtFraction(coordinates: readonly LonLat[], fraction: number): { point: LonLat; segment: number } { … }
// frazione = km / road.distance (tempo del FE = (at − startTime) / duration = km / distance)
```

### Pattern 3: deviazione dopo la sconfitta (BE-AMBUSH-05)
1. `point = pointAtFraction(road.coordinates, km / road.distance).point`.
2. `nearest = roads.nearestByTime(point, cityMarkers)` (`singleSource` dal nodo di `point`). Ripieghi nell'ordine (C7): nodo agganciato entro 5 km, poi il vertice della polilinea dopo il punto, poi quello prima; nessuno raggiungibile → la meta originale `to`.
3. Durata `durationMsOf(nearest.route.baseHours, petSpeed × travelSpeedFactorOf(newInjuries))`.
4. `status.activeTravel = { road: { coordinates: [point, …route.coordinates senza il primo se coincide], distance: route.distanceKm }, startTime: at, endTime: at + duration, duration, to: markerId, kind: free, ambush: null, ambushReports: [...old, report] }`.
5. Se il punto aggancia proprio il nodo della città più vicina (cammino di un solo nodo), la deviazione è lunga 0: `endTime = at` e il completamento parte subito (C7).

### Pattern 4: report → `QuestResult` all'arrivo (BE-AMBUSH-06)
```typescript
// dentro il callback di complete() e di teleport(): stessa sessione, stesso commit
const reports = before.status?.activeTravel?.ambushReports ?? [];
if (reports.length > 0)
    await this.questResultModel.create(ambushResultDraftsOf(reports, identity.characterId), { session, ordered: true });
```

### Pattern 5: esportare invece di duplicare
`woundsAfter`, `consumablesSpent`, `spellsSpent` e `sellLine` di `outcome-plan.ts` diventano export (refactor puro, con la loro spec). `ambush-plan.ts` li compone con `progressionAfter` e `applyTradeToInventory`. Il risultato non scrive mai `awaitingAid`, la corsia o `completedQuests`.

### Anti-Patterns to Avoid
- **Sorteggiare nel planner o in `buildActiveTravel`:** le anteprime consumerebbero caso (F1).
- **Riusare `planParticipant`:** lancia su sconfitta senza aid e scrive `awaitingAid`/corsia (F4).
- **Incorporare `QuestResultSchema` nei report:** gli indici dello schema finirebbero sulla collection dei personaggi (Pitfall 5).
- **Push dentro la transazione** o push inviato da un trigger che non ha scritto.
- **Haversine per il punto:** diverge dal FE (C1).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ora locale con DST | tabelle di offset / date-fns-tz | `Intl.DateTimeFormat(..., { timeZone, hour: 'numeric', hourCycle: 'h23' })` | probe: transizioni CEST/CET corrette, ICU completa |
| Città più vicina | Dijkstra proprio | `dijkstra.singleSource` + `routeOf` | già nel grafo, 5,9 ms |
| Composizione dei nemici | nuovo algoritmo di branco | `composeEnemies` estratta da `quest-composition.ts` | stessa logica di budget, tetto e tentativi (D-08) |
| Effetti del combattimento | calcolo HP/ferite/consumi | `CombatResolver` + helper esportati di `outcome-plan.ts` + `progressionAfter` | clamp ≥ 1, consumi clampati, recuperi magie |
| Monete | `$inc` su `status.coins` | `WalletService.applyCharacterCoinsDelta(id, delta, session)` | unico scrittore del saldo (04 D-04) |
| Posto liberato | `$pull` a mano | `unstartedSeatReleaseOf` | stessa regola dell'archivio |
| Trigger e retry | code proprie / `setTimeout` | `enqueueTrigger` + sweeper single-flight | timeout Redis, idempotenza per jobId |
| Recupero magie | job propri | `OutcomeWriter.deliver({ ...emptyCommitted(), spellRecoveries })` (`outcome-writer.service.ts:59-64,166-177`; risultati vuoti ⇒ nessun `questEnd`) | stesso trigger e fallback dello sweep |

## Runtime State Inventory

Fase additiva, senza rename. Per categoria:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `questresults` esistenti senza `kind`/`ambush`; `characters.status.activeTravel` dei viaggi in volo al deploy senza `ambush` | Nessuna migrazione: `kind` col default all'idratazione; il filtro `ambush: null` combacia col campo mancante. I viaggi in volo non avranno imboscate |
| Live service config | Nessuna | — |
| OS-registered state | Nessuna (il processo BE dell'utente gira da `dist/`) | Riavvio dopo la build, a cura dell'utente (runbook nel handoff) |
| Secrets/env vars | `AMBUSH_TIMEZONE` nuova, opzionale, non segreta | Riga in `.env.example`; nessun valore richiesto |
| Build artifacts | `dist/` del BE dell'utente | Mai `npm run build` nella fase; build e riavvio dell'utente |

## Conflicts

- **C1 (D-01, REPO-RULES `ambush-point.ts` «punto a un km»; richiesta del brief «haversine R = 127,42»).** Il FE misura la polilinea in **gradi planari** (`travel_route.dart:81-85`), mentre `TravelPath.distance` conta solo gli archi in km haversine ed esclude i tratti di snap che invece stanno nelle coordinate (`road-route.ts:26-39`). «Il punto al km k», misurato in haversine lungo la polilinea, non coincide con la posizione della pedina all'istante `at`. **Raccomandazione:** frazione `f = km / distance` (la stessa che il FE ricava dal tempo) e punto alla frazione `f` della lunghezza **planare**, con lo stesso algoritmo del FE. Così la pedina all'istante `at` sta esattamente nel punto da cui riparte la deviazione. Il nome `ambush-point.ts` resta; la firma prende `(coordinates, fraction)`.
- **C2 (D-10 «livello e titolo possono salire»).** Il titolo avanza solo con la story del titolo esatto (`title-progression.ts:9-16`, «nessun avanzamento per XP»). **Raccomandazione:** `titleAfter = titleBefore` sempre; salgono livello e HP massimi. Da dichiarare nel handoff.
- **C3 (D-09 `type: 'ambush'`).** `CombatContext.quest.type` è `QuestType` (`combat-resolver.ts:66`), che non ha `ambush` (`quest-type.enum.ts`). **Raccomandazione:** `QuestType.enemy` (le ricompense sono già «come una `enemy`») con titolo «Imboscata presso <città>». Allargare la porta a `QuestType | 'ambush'` cambierebbe il contratto del motore dell'utente.
- **C4 (D-16 «HP bassi per forzare la sconfitta»).** Il placeholder tira `chance < potere / (potere + HP totali dei nemici)` (`placeholder-combat-resolver.ts:57-81,109-113`), dove il potere è la somma dei danni di equipaggiamento e magie: gli HP del personaggio non contano. **Raccomandazione per la UAT:** sconfitta = personaggio senza armi né magie (potere 0 ⇒ probabilità 0); vittoria = arma forte (la probabilità sale ma non arriva a 1). Nei test `ScriptedCombatResolver`.
- **C5 (CONTEXT `src/models/enums/push-event-type.enum.ts`; REPO-RULES body con la città).** Il file vero è `src/push/push-event-type.enum.ts`. Il catalogo dei push ha corpi statici (`push-events.ts:9-34`). **Raccomandazione:** voce di catalogo con corpo generico («Sei stato sconfitto: la via torna verso la città più vicina.») per `sendTestPush`; il builder `ambushDefeat(characterId, cityName)` sostituisce `body` con la città. Il FE mostra `title`/`body` senza parsing (FE 16-REPO-RULES).
- **C6 (D-05 «`TravelSweeper` o gemello»; D-13 completamento).** Il CONTEXT non dice che il completamento deve **aspettare** un'imboscata pendente. **Raccomandazione:** `completionFilter` guadagna `'status.activeTravel.ambush': null`; l'imboscata, dopo il commit, ri-accoda il `complete` (jobId deterministico, idempotente) quando non lascia imboscate pendenti; `AmbushSweeper` separato (Pitfall 1, 9).
- **C7 (D-11 «Dijkstra dal nodo agganciato con `MAX_SNAP_DISTANCE_KM`»).** Ci sono due bordi non coperti: il punto non aggancia alcun nodo entro 5 km (archi lunghi), oppure aggancia proprio il nodo della città più vicina (cammino di un nodo, `routeOf` → `null` `road-route.ts:24`). **Raccomandazione:** ripiego sui vertici della polilinea, che sono nodi esatti del grafo, poi sulla meta; deviazione lunga 0 ammessa (`endTime = at`, arrivo immediato), in deroga a «durata zero non esiste» della Phase 8 §8, che riguardava solo i rifiuti delle partenze.
- **C8 (D-01 «km k transitato a `startTime + k/distanza × durata`», ultimo km parziale).** L'ultimo km cade a `endTime`, e lì un'imboscata coinciderebbe con l'arrivo. **Raccomandazione:** nessuna imboscata con `at ≥ endTime` (si escludono il km finale e il parziale). La perdita di probabilità è al più 0,6%.
- **C9 (D-13 «nessun report visibile prima della fine del viaggio»).** D-10 applica HP, ferite, xp, livello, monete, consumabili e usi delle magie **subito**, e `characterUpdated` li porta al FE a metà viaggio. Il report resta nascosto, ma gli effetti si vedono (Diario, monete). Conseguenza di prodotto da confermare e da scrivere nel handoff per la FE 16.

## Common Pitfalls

### Pitfall 1: il completamento consuma il viaggio prima dell'imboscata
**What goes wrong:** con Redis giù o dopo un downtime, lo sweep dei viaggi (o il job `complete` a `endTime`) arriva prima della risoluzione dell'imboscata scaduta. Il viaggio si chiude e l'imboscata sparisce senza report.
**Why it happens:** `completionFilter` non sa nulla di `ambush` (`travel.updates.ts:75-84`) e i due sweeper sono indipendenti.
**How to avoid:**
- filtro di completamento con `'status.activeTravel.ambush': null`;
- dopo il commit di ogni imboscata che non lascia imboscate pendenti, se `endTime ≤ now`, si chiama `scheduler.schedule(characterId, travel)`: Bull ignora il doppione se il job ritardato esiste ancora e lo ri-accoda se è già passato ed è stato rimosso (`removeOnComplete`);
- politica anti-blocco: un errore non transitorio ripetuto lascerebbe il viaggio fermo per sempre. Si raccomanda «fail-open», cioè `ambush: null` con l'identità riaffermata e un ERROR, da decidere (Open Question 5).
**Warning signs:** integration «sweep dei viaggi con imboscata scaduta e job perso» che completa senza report.

### Pitfall 2: due ore notturne diverse
`hour12: false` su ICU vecchi dà «24» a mezzanotte. Si usa `hourCycle: 'h23'` e `formatToParts` (probe F2). Il formatter va costruito una volta: è caro da creare e costa 1 µs per `format`.

### Pitfall 3: strict mode e campi interni
Il `$set` di `status.activeTravel` con un `ambush` non dichiarato nello schema viene ripulito in silenzio da Mongoose (strict). Si dichiarano `@Prop` tipizzati senza `@Field` e si verifica con un int-spec che rilegge il documento grezzo.

### Pitfall 4: `create` multiplo in sessione
`Model.create([a, b], { session })` lancia `Cannot call create() with a session and multiple documents unless ordered: true is set` (`node_modules/mongoose/lib/model.js:2710-2711`). Servono `{ session, ordered: true }` oppure `insertMany(docs, { session })`. [VERIFIED: node_modules]

### Pitfall 5: `QuestResultSchema` incorporato
`QuestResultSchema.index({ user, acknowledgedAt, resolvedAt, _id })` (`quest-result.model.ts:204-207`): incorporare lo schema in `ActiveTravel` porterebbe indici e `required` sulla collection dei personaggi. Si usa uno schema snapshot `_id: false` dedicato.

### Pitfall 6: magie consumate senza recupero
Il placeholder spende 1 uso di ogni magia attiva con usi ≥ 1 a ogni combattimento (`placeholder-combat-resolver.ts:162-164`). `spellsSpent` produce `recoveries` (`outcome-plan.ts:267-274`) che vanno accodati dopo il commit, come fa `OutcomeWriter.deliver`. `spendFromState` scrive comunque le voci `recoveries` nello stato (`src/characters/spells/spell-state.snapshot.ts:54-64`), quindi lo sweep dei recuperi (indice `character_spell_recoveries`) restituisce gli usi anche senza job: il job resta il trigger puntuale e va accodato come nelle quest. Istante di recupero consigliato: `at`.

### Pitfall 7: ordine dei tiri del generatore
Estrarre `composeEnemies` cambiando l'ordine delle chiamate a `chance.next()` rompe le spec a seme fisso della generazione (`quest-composition.ts:1-7`). Refactor con le spec esistenti verdi **prima** di aggiungere la variante.

### Pitfall 8: FE precedente alla 16
Il FE di oggi legge `quest` come obbligatorio (`lib/models/quest_result/quest_result.dart:99`) ma usa `tryFromJson` elemento per elemento (`lib/repository/services/graphql/graphql.dart:177-179`). Un report di imboscata viene scartato in silenzio e resta non confermato finché non arriva la FE 16, poi compare tutto insieme. Nessun crash. Va scritto nel handoff (UAT del BE con le probe GraphQL).

### Pitfall 9: costo dell'harness
Se `TravelModule` importasse `QuestOutcomesModule`, ogni int-spec dei viaggi dovrebbe sostituire anche le code `quest-resolution`/`spell-recovery`, la config dello sweep delle quest e lo sweeper. `AmbushModule` separato e montato in `AppModule` evita il problema. `test/app.int-spec.ts` (boot reale) lo vede comunque.

### Pitfall 10: caso consumato nei retry
`chance.next()` dentro il callback (combattimento) viene ripetuto a ogni WriteConflict: con `SequenceChance` un retry sposta la sequenza. Composizione, risorteggio e rotta si fanno **fuori** dal callback. Il combattimento sta dentro (come `resolveLoadedIndividual`) e le spec di concorrenza usano `ScriptedCombatResolver`.

## Code Examples

### Config opzionale validata
```typescript
// src/config/ambush-config.ts — pattern di travel-config.ts:1-47
export const AMBUSH_CONFIG = 'AMBUSH_CONFIG';
export const DEFAULT_AMBUSH_TIMEZONE = 'Europe/Rome';
export const AMBUSH_ENV_KEYS = ['AMBUSH_TIMEZONE'] as const;
export interface AmbushConfig { timeZone: string }
export function parseAmbushConfig(env: Partial<Record<'AMBUSH_TIMEZONE', string>>): AmbushConfig {
    const raw = (env.AMBUSH_TIMEZONE ?? '').trim() || DEFAULT_AMBUSH_TIMEZONE;
    try {
        return { timeZone: new Intl.DateTimeFormat('en-US', { timeZone: raw }).resolvedOptions().timeZone };
    } catch {
        throw new Error('AMBUSH_TIMEZONE must be an IANA time zone (empty = Europe/Rome)');
    }
}
```

### Ora locale
```typescript
export const hourFormatterOf = (timeZone: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' });
export const localHourOf = (formatter: Intl.DateTimeFormat, instant: Date): number =>
    Number(formatter.formatToParts(instant).find(({ type }) => type === 'hour')?.value ?? 0);
```

### Città più vicina in un solo Dijkstra
```typescript
// RoadsService — schema
nearestByTime(from: LonLat, targets: readonly { id: string; location: LonLat }[]) {
    const start = this.nodeFor(from);
    if (!start) return null;
    const paths = dijkstra.singleSource(this.graph, start, (_e, a) => a.weight as number);
    let best: { id: string; route: RoadRoute } | null = null;
    for (const target of [...targets].sort((a, b) => a.id.localeCompare(b.id))) {
        const end = this.nodeFor(target.location);
        const nodes = end ? paths[end] : undefined;
        const route = nodes ? routeOf(nodes, (a, b) => this.lightestEdge(a, b), (n) => this.coordOf(n), from, target.location) : null;
        if (route && (!best || route.baseHours < best.route.baseHours)) best = { id: target.id, route };
    }
    return best;   // nodes di un solo elemento (stesso nodo) ⇒ routeOf null: caso di C7 da gestire a parte
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `hour12: false` per le 24 ore | `hourCycle: 'h23'` | ICU recenti (78.3 qui risponde già «00») | evita «24» sugli ICU vecchi |
| N × `bidirectional` | `singleSource` | — | un solo giro del grafo |

**Deprecated/outdated:** nessuno nell'ambito della fase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `sortSchema` ordina alfabeticamente anche i valori degli enum (`enum QuestResultKind {\n  ambush\n  quest\n}`) | F8 | Asserzione a stringa esatta da correggere dopo il boot reale (basso) |
| A2 | Ogni POI ha `city` valorizzato, marker compresi (dato del discuss, non verificato a DB in questa sessione) | F9 | `nearCity` mancante: serve il ripiego su `City.markerLocation`/`pointsOfInterest` (medio) |
| A3 | Nessun arco reale supera i 10 km, quindi il punto aggancia quasi sempre un nodo entro 5 km (probe solo su grafo sintetico) | F5, C7 | Senza il ripiego sui vertici, `nearestByTime` → null (medio; il ripiego lo neutralizza) |
| A4 | Il timing del probe Dijkstra (grafo sintetico) è rappresentativo del grafo reale con la stessa taglia | F5 | Basso: anche 10× resta sotto i 100 ms |

## Open Questions (RESOLVED — orchestratore 2026-11-06: 1 frazione planare come il FE → D-01; 2 `QuestType.enemy` → D-09; 3 nessuna imboscata con `at ≥ endTime` → D-01; 4 ripiego sui vertici poi sulla meta, deviazione di durata 0 ammessa → D-11; 5 fail-open al terzo errore con contatore `attempts` → D-18; 6 effetti visibili a metà viaggio accettati → D-17; 7 titolo fermo → D-10; 8 indice dedicato → D-19; 9 istante `at` → D-20; 10 handoff con «armi e magie tolte» → D-16)

1. **Metrica del punto (C1).** Va bene la frazione planare identica al FE (consigliata) invece dell'haversine? È la sola scelta per cui pedina e deviazione combaciano.
2. **Tipo del contesto di combattimento (C3).** `QuestType.enemy` (consigliato) o allargare la porta con `'ambush'`?
3. **Ultimo km (C8).** Si conferma che non si tende un'imboscata con `at ≥ endTime`?
4. **Bordi della deviazione (C7).** Vanno bene il ripiego sui vertici della polilinea, poi sulla meta, e la deviazione di durata 0 (arrivo immediato) quando il punto aggancia il nodo della città?
5. **Imboscata che fallisce sempre (Pitfall 1).** Va bene il «fail-open» (dopo un errore non transitorio l'imboscata si annulla per identità con ERROR e il viaggio completa) o si preferisce un blocco con soli log?
6. **Effetti visibili a metà viaggio (C9).** D-10 contro D-13: il giocatore vede HP, monete, livello e ferite cambiare prima del report. Lo si accetta e lo si scrive nel handoff?
7. **Titolo (C2).** Si conferma che il titolo non sale con gli xp dell'imboscata?
8. **Indice dello sweep.** Si aggiunge `character_active_travel_ambush` `{ deletedAt: 1, 'status.activeTravel.ambush.at': 1 }` (pattern D-17b, verifier spec da aggiornare) o basta l'indice esistente su `endTime`?
9. **Istante dei recuperi delle magie e dei dati del report.** `at` (consigliato, coerente con `resolvedAt` e con lo `startTime` della deviazione) o `now`, quando l'imboscata si risolve in ritardo?
10. **UAT (C4).** Il handoff dice «arma tolta per forzare la sconfitta» al posto di «HP bassi»?

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | runtime, `Intl` con fusi | ✓ | v26.12.1 (`engines >=22`) | — |
| ICU completa | `Europe/Rome` | ✓ | 78.3, `supportedValuesOf` contiene Europe/Rome | — |
| graphology-shortest-path | `singleSource` | ✓ | 2.1.0 | 167 × `routeBetween` |
| MongoMemoryReplSet / redis-memory-server | integration e processor | ✓ | già nei global setup | — |

**Missing dependencies with no fallback:** nessuna.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest 30 + ts-jest, progetti `unit` e `integration` (`package.json:88-141`) |
| Config file | `package.json` (`jest.projects`, `coverageThreshold` `./src/travel/` 97/84/98) |
| Quick run command | `npx jest src/travel/ambush --selectProjects unit` (≈ 2–4 s) |
| Full suite command | `npx tsc --noEmit -p tsconfig.json && npm run test:cov` (≈ 9–10 min, oltre i 600 s del tool: in background o con ripiego per cartella) più `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-AMBUSH-01 | tassi giorno/notte, 22–06 nel fuso con DST, soglia 10 km, risorteggio dal km, residuo < 10 km, nessun `at ≥ endTime`, nessun tiro sotto soglia | unit | `npx jest src/travel/ambush/ambush-draw.spec.ts src/travel/ambush/ambush-rules.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-AMBUSH-01 | config: vuota → Europe/Rome, non valida → boot rifiutato, drift `.env.example` | unit | `npx jest src/config/ambush-config.spec.ts src/config/env-example.drift.spec.ts src/config/env.validation.spec.ts --selectProjects unit` | ❌ / ✅ |
| BE-AMBUSH-01 | partenza libera e claim scrivono `ambush` interno, sul filo `ActiveTravel` identico, job accodato dopo il commit, anteprime invariate (`Object.keys` del `TravelPreview`) | integration | `npx jest src/travel/travel.service.int-spec.ts src/quests/acceptance/quest-acceptance.service.int-spec.ts src/travel/travel.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) |
| BE-AMBUSH-02 | job duplicato, in anticipo, obsoleto no-op; reconciler e sweep; completamento bloccato da imboscata pendente e ri-accodato | integration | `npx jest src/travel/ambush/ambush-resolution.int-spec.ts src/travel/ambush/ambush-sweeper.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-AMBUSH-02 | processor `ambush` su Redis reale accanto a `complete` | integration | `npx jest src/travel/ambush/ambush.processor.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-AMBUSH-03 | POI più vicino, pool con animali, mai leggendari, `all` di riserva, fascia per livello, branco, pool non componibile → nessuna imboscata | unit | `npx jest src/travel/ambush/ambush-enemies.spec.ts src/travel/ambush/level-bands.spec.ts src/quests/generation/enemy-pool.spec.ts src/quests/generation/quest-composition.spec.ts --selectProjects unit` | ❌ / ✅ |
| BE-AMBUSH-04 | vittoria: HP/ferite del motore, monete 150 × mult, xp 40 × mult + Σ xp, legend = hero, livello sale, titolo fermo, viaggio invariato, risorteggio | unit + integration | `npx jest src/travel/ambush/ambush-plan.spec.ts --selectProjects unit` + int-spec della risoluzione | ❌ Wave 0 |
| BE-AMBUSH-05 | sconfitta: HP ≥ 1, deviazione verso la città più vicina (meta compresa, partenza compresa), `startTime` = `at`, quest abbandonata con posto liberato, cibo non rimborsato, push `ambushDefeat` sempre, mai in vittoria | integration | `npx jest src/travel/ambush/ambush-resolution.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-AMBUSH-05 | `nearestByTime` (parità per id, stesso nodo, snap mancante) e `pointAtFraction` identico al FE | unit + integration | `npx jest src/travel/ambush/ambush-point.spec.ts --selectProjects unit` + `npx jest src/roads/roads.service.int-spec.ts --selectProjects integration --runInBand` | ❌ / ✅ |
| BE-AMBUSH-06 | completamento e teleport inseriscono i report (`kind: ambush`, `quest` null, `resolvedAt` = `at`), ordine in `unacknowledgedQuestResults`, subscription owner-only, ack, nessun `questEnd` | integration | `npx jest src/travel/travel-completion.int-spec.ts src/travel/teleport.resolver.int-spec.ts src/quests/results/unacknowledged-quest-results.int-spec.ts src/quests/results/quest-result-received.subscription.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) |
| BE-AMBUSH-06 | schema: `kind` di default `quest` su documento legacy idratato, `quest` richiesto sse `kind == quest`, `ambush` sse `kind == ambush` | unit | `npx jest src/models/quest-result/quest-result.schema.spec.ts src/models/character/active-travel.schema.spec.ts --selectProjects unit` | ✅ (casi nuovi) |
| BE-AMBUSH-06/07 | SDL: `type QuestResult`, `AmbushReport`, `AmbushCity`, `QuestResultKind`, `ambushDefeat`, `ActiveTravel` identico | integration (boot) | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ (RED prima) |
| BE-AMBUSH-05 | catalogo push: builder con città, `testPushMessage`, chiavi del messaggio | unit | `npx jest src/push/push-events.spec.ts --selectProjects unit` | ✅ (RED naturale da `Record<PushEventType, …>`) |

### Sampling Rate
- **Per task commit:** spec mirate del task più `npx tsc --noEmit -p tsconfig.json`.
- **Per wave merge:** unit di `src/travel/ambush`, `src/quests/generation`, `src/quests/outcomes`, più le int-spec dei viaggi e delle imboscate toccate.
- **Phase gate:** full suite con coverage, boot reale e `git diff --exit-code src/schema.gql` prima di `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `test/travel/ambush-world.ts`: mondo con strade ≥ 10 km (≥ 4,5° di latitudine a R 127,42), tre o più città marker per la «più vicina» (meta compresa e no), POI con tipi di zona e `city`, nemici con lore `animal`, un leggendario, nemici in fascia per livello 1, `buildGraph()` dopo la semina.
- [ ] Estensione di `createOutcomeHarness` (`test/quests/outcome-world.ts:126-170`) con un'opzione `overrides` per `getQueueToken(TRAVEL_QUEUE)` e `TRAVEL_CONFIG`, più un helper `persistTraveller` (personaggio in viaggio con `ambush` e `ambushReports`).
- [ ] `buildActiveTravelDoc` con `ambush`/`ambushReports` opzionali; `buildQuestResult` con `kind: 'quest'`.
- [ ] Nessuna dipendenza nuova.

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | nessun endpoint nuovo |
| V3 Session Management | no | — |
| V4 Access Control | yes | i report passano dalla pipeline owner-only esistente (`authorizeQuestResult` `character-access.policy.ts:133-146`, `QuestResult.user`); `EXPECTED_OWNER_ONLY_HANDLERS` invariato |
| V5 Input Validation | yes | dati del job come input non fidato (`ambushJobDataOf` sul modello di `travelJobDataOf`); `AMBUSH_TIMEZONE` validata al boot senza ripetere il valore nel messaggio |
| V6 Cryptography | no | caso di gioco da `ChanceSource`, non crittografico (accettato come per gli esiti) |

### Known Threat Patterns for NestJS + Mongo + Bull
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Job replayato o falsificato in Redis | Tampering | filtro d'identità `startTime` + `ambush.at` + `at ≤ now`; dati validati; nessun effetto senza match |
| Imboscata svelata prima della partenza | Information disclosure | campi senza `@Field`, anteprime invariate (test con `Object.keys`), nessuna query nuova |
| Doppio effetto (job + sweep) | Tampering | transazione con identità, push e job solo da chi ha scritto, `resultId` pre-generato come `_id` |
| Fuga di dati nei log | Information disclosure | solo id, conteggi, nomi di nemici e città, `describeError`/`codeOf` |

## Sources

### Primary (HIGH confidence)
- Codice del branch `feat/15-imboscate-in-viaggio` (`f618ad3`): tutti i file citati con le righe
- `node_modules/graphology-shortest-path/dijkstra.d.ts` (2.1.0), `node_modules/mongoose/lib/model.js:2710-2711` (8.18.1)
- Probe locali: ICU/fuso (`node -e …`), Dijkstra (`/private/tmp/claude-501/-Users-lucatabbia-Personale-Code-Klimmeck-Guide-Klimmeck-Guide/1c1b92c5-969a-4a39-ba32-b6d43ae2af1c/scratchpad/probes/dijkstra-probe.cjs`), jest unit mirati
- FE: `lib/models/travel/travel_route.dart`, `lib/models/quest_result/quest_result.dart`, `lib/repository/services/graphql/graphql.dart`, `.planning/phases/16-travel-ambushes/16-CONTEXT.md` e `16-REPO-RULES.md`

### Secondary (MEDIUM confidence)
- MongoDB docs: query per campi null/mancanti; i change stream mostrano solo le operazioni committate (conoscenza consolidata, coerente con il comportamento già usato dal publisher)

### Tertiary (LOW confidence)
- Ordine alfabetico dei valori degli enum con `sortSchema` (A1)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (nulla di nuovo, versioni lette da `node_modules`)
- Architecture: HIGH sui punti d'innesto, MEDIUM sulla divisione in moduli (scelta di costo dell'harness)
- Pitfalls: HIGH (1, 3, 4, 5, 6 dimostrati sul codice), MEDIUM (A2/A3)

**Research date:** 2026-11-06
**Valid until:** 2026-12-06 (codice stabile; da rivedere se cambiano `outcome-plan.ts` o `quest-composition.ts`)
