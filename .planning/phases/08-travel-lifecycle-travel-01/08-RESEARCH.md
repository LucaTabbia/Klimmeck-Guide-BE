# Phase 8: Travel Lifecycle (TRAVEL-01) - Research

**Researched:** 2026-10-21
**Domain:** viaggio server-autoritativo su `Character.status.activeTravel` (Mongoose 8.18.1, sotto-documento nullable code-first con @nestjs/graphql 13.2.0 / graphql 16.11.0), percorso Dijkstra sul grafo graphology 0.26.0 / graphology-shortest-path 2.1.0 esposto come polilinea, completamento con DB come fonte di verità (Bull 4.16.5 + @nestjs/bull 11.0.3 come trigger, reconciler al boot, sweep periodico), push `travelEnd`, teleport innkeeper atomico, emendamenti alla Phase 7 (slot per rango in `requiredAdventurers`, `registeredAdventurers` a oggetti, rilascio dei posti alla cancellazione).
**Confidence:** HIGH sul codice e sulle forme (letture `file:riga`, tre probe usa-e-getta cancellati), HIGH sui dati reali del DB di sviluppo (script di sola lettura, soli aggregati numerici). Il flag di ricerca D-07 **scatta**: le durate reali dei viaggi lunghi sono in giorni (fino a 82 h) e il viaggio "intra-città" verso il marker delle quest esistenti dura 2,6 h. Va confermato con l'utente prima del planning (vedi "Conflitti con il CONTEXT", C1).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Mete, movimento e trigger del viaggio (BE-TRAVEL-02)
- **D-01:** Il viaggio libero (`startTravel`) ha come meta **solo il `markerLocation` di una città** esistente (`City.markerLocation`). Vale sia partendo da una città sia da un POI non-città (es. il marker di una quest): da lì il personaggio può raggiungere **qualsiasi** città. Qualunque altro POI → `TRAVEL_DESTINATION_NOT_ALLOWED`. (Conferma di Phase 7 D-10: "il viewer si sposta liberamente solo fra città".)
- **D-02:** **Accettare una quest della corsia standard** (`pendingQuest`: hunt, enemy, boss, dungeon, heal, aid, job, study — ogni tipo diverso da story/worldMission) **avvia automaticamente un viaggio** verso `infos.markerLocation` della quest, **se diverso dal POI in cui il personaggio si trova** (per Phase 7 D-10 il marker è tra i `pointsOfInterest` della città corrente, quindi è un viaggio intra-città). Marker uguale alla posizione → nessun viaggio e countdown subito. **Story e worldMission non muovono il personaggio.**
- **D-03:** Viaggio automatico **senza percorso stradale** verso il marker ("non dovrebbe esistere una possibilità simile"): **salto istantaneo** — `status.location` = marker, nessun `activeTravel`, countdown avviato subito, WARN con i soli id (quest, personaggio, POI). Il **viaggio libero** senza percorso invece **rifiuta** `TRAVEL_NO_PATH` fail-closed (nulla scritto).
- **D-04:** Rifiuti di `startTravel`: viaggio già attivo → `TRAVEL_IN_PROGRESS`; meta uguale alla posizione attuale → `TRAVEL_SAME_LOCATION`; `quests.pendingQuest` popolata → `QUEST_IN_PROGRESS` (il personaggio è impegnato finché la quest non viene risolta in Phase 9); **`activeStoryQuest` e `activeWorldMissionQuest` non bloccano** il viaggio. POI inesistente, personaggio inesistente o archiviato → `NOT_FOUND`.
- **D-05:** **Nessun annullamento né cambio meta**: un viaggio termina solo a `endTime` o col teleport dell'innkeeper. Nessuna mutation di cancel.
- **D-06:** Guard "non in viaggio" sull'accettazione quest (handoff Phase 7 §9, deferred di D-10): `acceptQuest` con `activeTravel` presente → `TRAVEL_IN_PROGRESS` (stesso codice del viaggio), sia nella pre-verifica (`classifyEligibility`) sia nel filtro del claim (`laneClaimFilter`) con il ramo in `classifyUnclaimed`.

#### Durata, velocità, ETA e forma del `road` (BE-TRAVEL-01, BE-TRAVEL-02)
- **D-07:** La durata nasce dal cammino Dijkstra già esistente (`RoadsService.getShortestPath`: Σ `lengthKm / speedFactor`, ore) letta come **ore reali**: **nessuna scala globale, nessun clamp, nessuna variabile d'ambiente**. I viaggi si misurano in **ore**; la regolazione avviene solo via `Road.length`/`Road.speedFactor` a DB. *Research flag:* misurare sui dati reali le durate tipiche (città vicine, attraversata della mappa) e riportarle nel handoff; se risultano fuori scala (giorni, secondi) segnalarlo prima del planning.
- **D-08:** **Velocità del personaggio: base 10.** Il pet equipaggiato (`Character.assets.pet`, ref al catalogo `Pet`) può avere un **modificatore di velocità** in un campo **additivo e nullable** del catalogo `Pet` (es. `speedModifier: Float`; `null` = non cavalcabile = nessun bonus). Velocità = 10 × modificatore (10 se assente); **durata = durata base × 10 / velocità** (modificatore 2 → velocità 20 → metà tempo). Si applica a **tutti** i viaggi, liberi e automatici. Valorizzato a DB a mano (nessun admin CRUD). Default tecnico: modificatore ≤ 0 o non finito → trattato come assente con WARN.
- **D-09:** La velocità è **fotografata alla partenza**: `endTime` persistito è la fonte di verità; cambiare o togliere il pet durante il viaggio non ricalcola nulla.
- **D-10:** `activeTravel.road` è una **polilinea unica** del cammino (tipo dedicato, es. `TravelPath { coordinates: [[Float!]!]!, distance: Float! }`, nome a discrezione), calcolata dal percorso Dijkstra attraverso più `Road`, orientata dalla partenza alla meta, con il POI di partenza e di arrivo come estremi. `activeTravel { road, startTime: DateTime!, endTime: DateTime!, duration: Float! }` con `duration` in **millisecondi** (come `waitingTime`) e `duration = endTime − startTime`. Esporre anche la meta (es. `to: PointOfInterest`) e il tipo di viaggio (libero/quest) è additivo e a discrezione (D-14 richiede comunque di persistere il tipo).
- **D-11:** Query di **preview owner-only** (es. `travelPreview(request: { id, poiId })` → `{ duration, distance, road }`) con le **stesse regole e gli stessi codici** di `startTravel`, senza scrivere nulla: il FE la usa nel dialog di conferma (FE TRAVEL-02) e può disegnare la rotta prima di confermare. `getPath(from, to)` resta invariato.

#### Completamento, reconciler e push (BE-TRAVEL-03)
- **D-12:** Trigger del completamento: **job Bull** con delay fino a `endTime` (coda dedicata) **+ reconciler al boot + sweep periodico** (es. ogni minuto, `setInterval` unref come `EventSubSubscriptionManager` di Phase 6, intervallo configurabile e `0` = off) che completano ogni `activeTravel.endTime <= now`. Il job è un trigger **idempotente**: al fire verifica che il viaggio sia ancora lo stesso (identità del viaggio: `startTime`/`endTime` o un id interno) e che il personaggio sia attivo (`activeCharacterById`, 03.1 D-06), altrimenti esce con un log senza scrivere. Un job perso (eviction Redis, blocker noto in STATE) è coperto dallo sweep; un job duplicato o rieseguito è un no-op.
- **D-13:** Completamento = **un solo update condizionale** sul `Character` (filtro: attivo, `activeTravel` uguale a quello atteso, `endTime <= now`): `status.location` = meta, `activeTravel` = `null`. Il change stream emette `characterUpdated` (nessun publish manuale). Se il viaggio era **automatico da quest**, nella **stessa unità** (transazione) scrive **`startDate = endTime pianificato`** sulla `PendingQuest` della corsia standard, se ancora nulla: il countdown non "perde" tempo per un downtime del server e il risultato è deterministico anche nel caso normale.
- **D-14:** Push **`travelEnd(characterId)`** via `PushService.sendToUser(ownerId, …)` (builder di Phase 5 D-12) **solo per i viaggi liberi** (avviati da `startTravel`), **mai** per quelli automatici da quest; best-effort dopo il commit, non blocca mai. Il tipo di viaggio (libero/quest) va quindi persistito su `activeTravel`. Il teleport non invia push.
- **D-15:** **`PendingQuest.startDate` diventa nullable sul filo** (`DateTime` invece di `DateTime!`): `null` = quest accettata, personaggio in viaggio verso il marker. Story/worldMission e quest senza viaggio (marker = posizione, o salto D-03) hanno `startDate` = ora dell'accettazione come oggi (Phase 7 D-16). Il FE parsa già `startDate` come `DateTime?` (`lib/models/pending_quest.dart`). Da comunicare nel handoff alla FE Phase 6 (countdown solo con `startDate` non nullo, prima "in viaggio") e alla FE Phase 7.

#### Teleport admin (BE-TRAVEL-04)
- **D-16:** Mutation innkeeper (es. `teleportCharacter(request: { id, poiId }): CommonResponse!`) con `@Roles(innkeeper)` e audit automatico (Phase 3 D-15/D-16); meta = **qualsiasi `PointOfInterest`** esistente. **Un solo `findOneAndUpdate` condizionale** ("il filtro è la regola", Phase 4): `status.location` = POI, `activeTravel` = `null`; filtro: personaggio attivo e `quests.pendingQuest` `null`. Poi rimozione **best-effort** del job Bull (il job si auto-neutralizza comunque per D-12). Nessuna push, nessuna scrittura sulle quest.
- **D-17:** **Teleport rifiutato con `QUEST_IN_PROGRESS`** se `pendingQuest` è popolata ("il GM non può teletrasportare durante una quest attiva"; solo la corsia standard: story e worldMission non bloccano). Un viaggio libero in corso senza quest è teletrasportabile e viene cancellato. Personaggio inesistente o archiviato → `NOT_FOUND`; POI inesistente → `NOT_FOUND`.

#### Ownership, codici e contratto GraphQL
- **D-18:** `startTravel` e `travelPreview` sono **owner-only** (`@OwnsCharacter(…, { ownerOnly: true })` di Phase 7 D-11/07-04): l'innkeeper su un personaggio altrui riceve `FORBIDDEN`; per muovere gli altri ha il teleport. Whitelist `EXPECTED_OWNER_ONLY_HANDLERS` e `@Roles` del boot reale aggiornate.
- **D-19:** Codici (`GameRuleException`, `extensions.code` stabile, messaggi in italiano, pattern Phase 4 D-15): `TRAVEL_IN_PROGRESS`, `TRAVEL_SAME_LOCATION`, `TRAVEL_DESTINATION_NOT_ALLOWED`, `TRAVEL_NO_PATH`, `QUEST_IN_PROGRESS`; `NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED` invariati. Nomi definitivi a discrezione del planner purché stabili e documentati nel handoff; **un rifiuto non scrive nulla**.
- **D-20:** Contratto SDL **additivo** (`CharacterStatus.activeTravel`, i tipi del viaggio e della polilinea, `Pet.speedModifier`, input/mutation/query nuove) con **tre eccezioni dichiarate** (nessun documento FE seleziona oggi questi campi): `PendingQuest.startDate` nullable (D-15), il nuovo tipo di `Quest.registeredAdventurers` (D-28) e `QuestRequirements.requiredAdventurers` da `Int!` a lista di slot con la rimozione di `party` (D-28). `src/schema.gql` rigenerato dal real-boot test e committato; il test del boot reale enumera le novità e vieta regressioni.

#### Emendamenti alla Phase 7 (folded dal discuss FE Phase 6, 2026-10-21)
- **D-26:** **Story e worldMission sono accettabili da qualunque città**: il vincolo di posizione di Phase 7 D-10 (`QUEST_NOT_IN_CITY`, "in città" = marker della città o uno dei suoi `pointsOfInterest`) resta **solo per la corsia standard**. Per story/worldMission nessun controllo di città (e nessun viaggio, D-02). La pre-verifica e il filtro del claim vengono aggiornati di conseguenza; il handoff Phase 7 §2/§6 è superato su questo punto. La definizione "in città" di Phase 7 D-10 (marker della città o uno dei suoi POI) resta invariata per la corsia standard: dal POI di una quest la board FE è disabilitata (CONTEXT FE 6 D-11) e la corsia è occupata, quindi la differenza non è osservabile.
- **D-27:** **Registrazione sulla Quest anche per `enemy` e `aid`**, oltre a worldMission e boss (Phase 7 D-03): l'accettazione registra il personaggio con guard di capienza — `requirements.party` per rango se presente, altrimenti il totale `requiredAdventurers` — e chi arriva dopo riceve `QUEST_FULL`. `hunt`, `dungeon`, `job`, `heal`, `study` restano **senza registrazione né capienza** (più personaggi in contemporanea, ripetibili). Capienza = slot di `requiredAdventurers` (D-28); una quest registrata **senza slot** è un difetto di catalogo → `QUEST_NOT_ACCEPTABLE` fail-closed con WARN del solo id (come `requiredPoints` assente su story, Phase 7 D-09).
- **D-28:** **Nessun campo nuovo dove uno esistente può essere esteso** (decisione utente: "vorrei evitare che compaiano nuove voci come registrations o party"). (a) `Quest.registeredAdventurers` cambia tipo sul filo da `[String!]!` a una lista di oggetti `{ character: ID!, title: String! }`; il campo interno `registrations` di Phase 7 (D-18, C1) viene **rimosso** (una sola fonte). (b) `QuestRequirements.requiredAdventurers` cambia da `Int!` a **lista di slot `{ title: String, count: Int! }`** con `title` **nullo = qualsiasi rango** (es. enemy `[{ title: null, count: 1 }]`, worldMission `[{ title: hero, count: 5 }, { title: paladin, count: 4 }]`); il campo `party` di Phase 7 viene **rimosso** (il tipo `QuestPartySlot` può essere riusato per gli slot, con `title` nullable); totale = somma dei `count`; slot **esatti** per rango (Phase 7 D-04) invariati, uno slot `null` accoglie qualunque titolo. **Nessuna migrazione e nessun seed**: oggi il DB non contiene quest e **l'utente adatta da sé le quest a DB al nuovo modello** dopo la merge (decisione 2026-10-21: "Cambio io le quest su DB"); la fase non scrive script di seed né fixture di catalogo fuori dai test. Il handoff documenta la forma esatta (un documento d'esempio per tipo, incluso `registeredAdventurers: []`) e il boot reale verifica che `party` e `registrations` non compaiano più nello schema. I modelli FE (`QuestRequirements`, `Quest.fromJson`) vengono adeguati dalla FE Phase 6 (CONTEXT FE 6 D-12/D-14).
- **D-29:** **Regola "strappata per tutti"** (derivata dal FE, resa coerente dal BE con `QUEST_FULL`): una quest registrata è piena quando i registrati raggiungono la somma dei `count` degli slot oppure quando i posti del rango del giocatore (slot con quel `title`, più gli slot `null`) sono esauriti. **Gli esiti sono Phase 9**: successo → la quest sparisce dalla board per tutti; fallimento di enemy/hunt/boss/dungeon → registrazione liberata, quest di nuovo disponibile e **creazione automatica di una quest `aid`**; se chi accetta l'`aid` fallisce, il personaggio che aveva fallito la prima quest **muore** (archivio con `deletionReason: death`) e il secondo fallimento genera una nuova `aid`, e così via; `aid` non torna mai disponibile dopo un fallimento.
- **D-30:** **Cancellazione del personaggio con registrazioni attive:** `deleteCharacter` (routine 03.1, `CharacterDeletionService.archiveCurrentCharacter`) **libera i posti** — `$pull` del personaggio da `registeredAdventurers` di ogni quest non ancora conclusa — così la quest torna disponibile per tutti e la board torna intera. La **morte** avviene solo all'esito della quest (Phase 9) e riuserà la stessa routine. Il `PendingQuest` resta sul documento archiviato (03.1 D-10).

#### Atomicità, test, tooling, handoff, branch (default tecnici)
- **D-21 (default tecnico):** Avvio del viaggio libero: letture lean fuori dalla scrittura (personaggio con `status.location`, `assets.pet` → `speedModifier`, POI meta, città che lo ha come marker, percorso dal grafo in memoria); scrittura = **un solo `findOneAndUpdate` condizionale** sul `Character` (filtro: attivo, `activeTravel` `null`, `quests.pendingQuest` `null`, `status.location` uguale allo snapshot) che imposta `activeTravel`; poi `queue.add` con delay. Se l'accodamento fallisce il viaggio resta valido (boot/sweep lo completano): WARN, nessuna compensazione. **Viaggio automatico:** `QuestAcceptanceService.accept` (Phase 7) viene **esteso, non duplicato**: percorso e velocità calcolati prima della transazione; il claim della corsia e `activeTravel` scritti nello **stesso update** del `Character`, nella stessa transazione del `PendingQuest` (con `startDate` `null`) e del debito; job accodato dopo il commit. `RoadsService` (grafo in memoria, `onModuleInit`) diventa una dipendenza del modulo viaggio e dell'accettazione; ogni filtro sul personaggio usa `activeCharacterById`.
- **D-22 (default tecnico):** **TDD.** Unit sui moduli puri: velocità/durata dal pet (null, 1, 2, valori invalidi), polilinea dal cammino (orientamento, estremi, più strade), regole di meta e rifiuto, builder di filtri/update, selezione dei viaggi scaduti. Integration sul replica set (`createAuthTestApp`/`createCharactersTestApp`, fixture `persistCharacter`/`persistCity`/`persistQuest`/`persistUser` + fixture `Road`/`Pet` nuove): `startTravel` ×2 concorrenti → un solo `activeTravel`; meta non città → `TRAVEL_DESTINATION_NOT_ALLOWED`; stessa posizione → `TRAVEL_SAME_LOCATION`; `pendingQuest` attiva → `QUEST_IN_PROGRESS`; story attiva → il viaggio riesce; `acceptQuest` standard con marker diverso → `activeTravel` + `startDate` `null`, fire del job → `location` = marker, `startDate` = `endTime`, **nessuna** push; `acceptQuest` con marker = posizione → nessun viaggio, `startDate` valorizzato; `acceptQuest` senza percorso → salto istantaneo + WARN; `acceptQuest` in viaggio → `TRAVEL_IN_PROGRESS`; viaggio libero completato → una push `travelEnd` (FakePushTransport) al proprietario; reconciler al boot completa un viaggio scaduto; sweep completa un viaggio con job perso; job duplicato/rieseguito/obsoleto → no-op; personaggio archiviato → job skip con log; teleport con `pendingQuest` → `QUEST_IN_PROGRESS`; teleport in viaggio libero → `activeTravel` `null`, `location` = POI, job neutralizzato, audit scritto; innkeeper su `startTravel` altrui → `FORBIDDEN`; **emendamenti Phase 7:** story accettata da una città diversa da quella del marker → riesce; enemy con `requiredAdventurers: [{ title: null, count: 1 }]` accettata da due personaggi → 1 successo + 1 `QUEST_FULL`, `registeredAdventurers` sul filo `[{ character, title }]`; enemy registrata senza slot → `QUEST_NOT_ACCEPTABLE` senza scritture; worldMission con slot `hero 1`: hero + paladin → 1 successo + `QUEST_FULL`; `deleteCharacter` di un registrato → posto liberato; `party` e `registrations` assenti dallo schema; hunt accettata da due personaggi → entrambe riescono senza registrazione; sul filo `characterUpdated` porta `activeTravel { road { coordinates distance } startTime endTime duration }` e poi `null`; real boot: whitelist aggiornate, SDL additivo salvo `startDate`. Processor test senza `CharactersService` (nessun change stream aperto), attesa del job via polling del documento (Phase 1 D-06).
- **D-23 (default tecnico):** Tooling (Phase 7 D-20): `npx prettier --write <file>` + `npx eslint <file>` solo sui file toccati; percorsi jest prima di `--selectProjects`, integration con `--runInBand`; gate CI: lint, build, unit, integration, `git diff --exit-code src/schema.gql`.
- **D-24 (default tecnico):** Handoff **`BACKEND-NOTES.md`** di fase per la **FE Phase 7** (e una nota esplicita per la FE Phase 6 su `startDate` nullable): SDL verbatim, semantica (città-only, viaggio automatico da quest, salto istantaneo, pet e velocità), tabella dei codici con l'azione FE, forma della preview e del dialog, interpolazione `(now + offset − startTime) / duration` sulla polilinea con `serverTime` (Phase 7 D-15), push solo per i viaggi liberi, durate tipiche misurate (D-07), dati a DB per la UAT che l'utente prepara da sé (quest nel nuovo formato con un esempio per tipo, pet con `speedModifier`, `speedFactor` delle strade, città e marker), la sezione "Emendamenti alla Phase 7" (D-26..D-30: città, registrazione enemy/aid, nuovi tipi di `registeredAdventurers` e `requiredAdventurers` a slot con esempi, regola "strappata per tutti", posti liberati alla cancellazione), note per la BE Phase 9 (fine quest: la corsia svuotata sblocca viaggio e teleport; ritorno in città = viaggio libero scelto dal giocatore; esiti, quest `aid` automatiche e morte, D-29) e per la Phase 10 (indici).
- **D-25 (default tecnico):** Branch **`feat/08-travel-lifecycle-travel-01`** da `develop` (template `feat/{phase}-{slug}`; la riga Branch della ROADMAP `feat/08-travel-lifecycle` va allineata), PR a `develop`. Nessuna dipendenza da una PR FE.

### Claude's Discretion
- Nomi e collocazione: modulo (es. `src/travel/`), tipi (`ActiveTravel`, `TravelPath`), operazioni (`travelPreview`, `startTravel`, `teleportCharacter`), campo `Pet.speedModifier`, nome della coda Bull, nomi definitivi dei codici e messaggi in italiano.
- Esporre su `activeTravel` la meta (`to`) e il tipo di viaggio; campo interno vs esposto.
- Identità del job Bull (jobId deterministico vs id interno del viaggio persistito) e rimozione best-effort nel teleport; intervallo dello sweep e sua configurazione (env opzionale con default).
- Ordine di valutazione dei rifiuti e quali guard riaffermare nel filtro dell'update.
- Come comporre `RoadsService` con `QuestAcceptanceService` (import del modulo, port astratta); come esporre la polilinea dal grafo (riuso di `getShortestPath` esteso vs funzione nuova).
- Split in wave: contratto schema (`activeTravel`, `startDate` nullable, `Pet.speedModifier`, tipi) nella prima wave, così la FE Phase 7 può partire sullo schema.

### Deferred Ideas (OUT OF SCOPE)
- **Fine quest e ritorno in città (Phase 9):** a missione risolta la corsia si svuota (sblocca viaggio libero e teleport, D-04/D-17); il personaggio sul marker sceglie una città con un viaggio libero. Nota per la Phase 9: completamento/rifiuto del GM con `startDate` ancora nullo (quest "in viaggio") va definito lì.
- **Esiti delle quest registrate (Phase 9, da D-29):** successo → la quest sparisce per tutti (serve un marcatore globale sulla Quest o la rimozione dalla lista `quests`); fallimento → registrazione liberata e quest `aid` generata automaticamente; catena aid → morte del personaggio (`deletionReason: death`, 03.1 D-12).
- **Velocità base come attributo del personaggio** (bonus da titolo, oggetti, magie): futuro; oggi costante 10 in un modulo puro.
- **Admin CRUD di pet (`speedModifier`), strade (`speedFactor`) e POI:** fuori milestone; dati a DB.
- **Ricalcolo dell'ETA al cambio pet in viaggio:** escluso (D-09).
- **Annullamento o cambio meta del viaggio:** escluso by design (D-05), non in backlog.
- **Push per i viaggi automatici da quest:** escluso (D-14).
- **Query dedicata dei viaggi per l'admin panel (BE-ADMIN-01, Phase 9):** `activeTravel` arriva già su `characters`/`characterUpdated` dell'innkeeper.
- **Indice su `status.activeTravel.endTime`** per lo sweep: Phase 10 se i volumi lo richiedono (oggi pochi personaggi).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-TRAVEL-01 | `Character.status` espone `activeTravel { road, startTime, endTime, duration }` su schema e subscription | Q7 (sotto-documento `_id: false` con `default: null` provato: legacy idratato → `null`, path `Embedded`), `[[Float]]` → `[[Float!]!]!` (precedente `City.area` in `schema.gql:85`), change stream e snapshot passano da `CharactersService.findOne` (`characters.service.ts:91,124`): `activeTravel` arriva su `characterUpdated` senza publish manuale; populate di `to` da aggiungere (C9) |
| BE-TRAVEL-02 | `startTravel(poiId)` rifiuta se un travel è attivo, calcola percorso/ETA server-side (graphology) e persiste `activeTravel`; query di preview ETA | Q2 (nuovo metodo di `RoadsService` che restituisce la lista dei nodi + polilinea orientata, `getPath` intatto), Q1 (durate reali), Pattern 1 (letture lean → regole pure → un `findOneAndUpdate` condizionale), owner-only (Q8), codici (Q9) |
| BE-TRAVEL-03 | Completamento a `endTime` con DB fonte di verità: job Bull trigger + reconciler al boot (+ sweep), `location` aggiornata, subscription + push travel-end | Q3 (Bull: jobId deterministico, `getJob` + `remove` best-effort, `removeOnComplete`, override del token della coda nei test — probe), Q4 (sweep: `setInterval(...).unref()` + single-flight + `onModuleDestroy`, `onApplicationBootstrap` con `void`), Q10 (push dopo il commit, `FakePushTransport`), Pattern 3 (transazione per il viaggio da quest) |
| BE-TRAVEL-04 | Teleport admin atomico: `location` sovrascritta e `activeTravel` cancellato (incluso il job) in un'unica operazione | Q8 (`@Roles(RoleType.innkeeper)` + audit automatico; target audit `{ type: 'CommonResponse', id: null }` come `sendTestPush`, C7), Pattern 1 (filtro `pendingQuest: null` + `returnDocument: 'before'` per conoscere il job da rimuovere) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Stack fisso NestJS 11 + Mongoose 8 + Apollo code-first + Bull/ioredis. **Nessuna dipendenza nuova** necessaria: graphology, graphology-shortest-path, bull, @nestjs/bull, ioredis, redis-memory-server sono già installati [VERIFIED: node_modules].
- **TDD obbligatorio** (Red → Green → Refactor): moduli puri prima, poi integration RED sul replica set, poi implementazione; le whitelist di `test/app.int-spec.ts` diventano RED prima di decorare i resolver.
- Clean Code, SoC, Boy Scout Rule: resolver senza logica, regole nei moduli puri, scritture nei service. I file `src/roads/*.ts`, `src/models/pet.model.ts`, `character-assets.model.ts`, `city.model.ts`, `point-of-interest.model.ts`, `quest-infos.model.ts` **non** sono Prettier-clean [VERIFIED: `npx prettier --check`]: formattarli in un commit `style(...)` separato prima di modificarli (memoria execute-phase, punto 9).
- Conventional Commits; **nessun trailer `Co-Authored-By`** (memoria utente, prevale sul reminder dell'harness).
- Branch + PR verso `develop`, mai push su `develop`/`main`.
- Security: nessun secret in repo; se si introduce `TRAVEL_SWEEP_INTERVAL_MS` va documentata in `.env.example` (nessun valore segreto).
- Backend fonte di verità: il client manda solo `id` del personaggio e `poiId`; percorso, durata, velocità, meta ammessa calcolati server-side.
- Lavoro dentro il workflow GSD.

## Summary

Tutte le decisioni sono implementabili con lo stack attuale e senza dipendenze nuove. Tre fatti misurati cambiano il piano più di quanto il CONTEXT preveda:

1. **Durate reali (D-07, flag che scatta).** Sul DB di sviluppo (964 strade, 2529 nodi, 3231 archi, **un solo componente connesso**, tutti i 167 marker di città sono nodi esatti del grafo) la durata base (velocità 10, nessun pet) fra una città e la **città più vicina** ha mediana **2,7 h** (p25 1,7 h, p75 3,7 h, min 22 min, max 9,7 h); fra due città qualsiasi mediana **35,4 h**, p75 48 h, **max 82,3 h (≈ 3,4 giorni)**. Il viaggio automatico dalla città al marker delle 4 quest esistenti dura **2,6 h** (12,4 km), più del `timeToComplete` della quest `job` (2 h). Inoltre `Road.length` **non esiste** su nessuna delle 964 strade e il grafo non lo usa: la regolazione passa solo da `speedFactor` (3–7, mediana 5) e dalla geometria [VERIFIED: script di sola lettura].
2. **Il catalogo quest non è vuoto.** Il DB di sviluppo contiene ancora **4 quest** con `requiredAdventurers` numerico e senza `party`/`registrations`. Con il nuovo tipo a slot, Mongoose idrata `1` come `[{ title: null }]` (senza `count`) e `0` come `[0]`, senza errori: sul filo `count: Int!` diventa null e **l'intera query `quests` risponde `data: null`** finché l'utente non aggiorna quei documenti [VERIFIED: probe di idratazione]. L'accettazione legge lean e deve validare gli slot (fail-closed `QUEST_NOT_ACCEPTABLE`).
3. **Topologia dei moduli nei test.** `RoadsModule` non registra `PointOfInterest` e funziona solo grazie al `MongoModule` globale: importato in un harness fallisce con `Nest can't resolve dependencies of the PointOfInterestsService` [VERIFIED: probe]. Un modulo che registra una coda Bull è invece importabile nei test sovrascrivendo `getQueueToken(name)` con un fake `{ add, getJob, process, on }` (l'explorer chiama `process` una volta) [VERIFIED: probe]. `PushModule` richiede `ConfigService` globale, quindi non può entrare nel modulo che `QuestAcceptanceModule` importa (la sua int-spec standalone non ha `ConfigModule`).

**Primary recommendation:** creare `src/travel/` con moduli puri (velocità, polilinea, regole di meta, filtri/update, selezione scaduti) + `TravelPlanner` (letture lean + `RoadsService.routeBetween`, nuovo metodo che restituisce `null` invece di lanciare) + `TravelScheduler` (coda Bull `travel`, jobId deterministico `travel-<characterId>-<startTimeMs>`) + `TravelCompletionService` (un update condizionale; transazione solo per i viaggi da quest) + processor + sweeper (`onApplicationBootstrap` + `setInterval().unref()` single-flight) + resolver owner-only (`startTravel`, `travelPreview`) e innkeeper (`teleportCharacter`). Esporre `routeBetween` senza toccare `getShortestPath`. Separare i moduli in modo che `QuestAcceptanceModule` importi solo planner + scheduler (niente Push). Il contratto schema (wave 1) va consegnato per primo.

## Conflitti con il CONTEXT

Nessuna decisione è impossibile; questi punti vanno recepiti dal planner (C1 e C2 vanno **confermati con l'utente** prima di bloccare il piano).

| # | Decisione | Fatto trovato | Rimedio consigliato |
|---|---|---|---|
| C1 | D-07 "ore reali, nessuna scala"; "regolazione via `Road.length`/`speedFactor`"; research flag | Città vicine: mediana 2,7 h, max 9,7 h. Città qualsiasi: mediana 35 h, **max 82 h**. Città → marker quest: **2,6 h** (più lungo della quest `job`, 2 h). `Road.length` assente su 964/964 strade e mai letto da `buildGraph` (`roads.service.ts:80-111`, usa l'haversine con `R = 127.42`, riga 16) | **Segnalare all'utente prima del planning** (richiesto da D-07). Il codice non cambia: l'utente decide se ritoccare `speedFactor` a DB o rivedere D-07. Nel handoff togliere "`Road.length`" dalla leva di regolazione (resta solo `speedFactor` e la geometria). |
| C2 | D-28 "oggi il DB non contiene quest", "nessuna migrazione" | DB di sviluppo: 4 quest (`worldMission`, `enemy`, `job`, `heal`), `requiredAdventurers` numerico, `registeredAdventurers: []`. Con lo schema a slot: idratazione silenziosa a forme invalide, `quests { requirements { requiredAdventurers { count } } }` → errore non-null che azzera tutta la lista | Nessuna migrazione (decisione utente), ma: (a) handoff con il comando `updateOne` d'esempio per ciascuna delle 4 quest da eseguire **subito dopo il deploy**; (b) l'accettazione valida gli slot dalla lettura lean (`slotsOf` puro: array, `count` intero ≥ 1, `title` null o `TitleType`) → `QUEST_NOT_ACCEPTABLE` + WARN per i tipi registrati; i tipi non registrati ignorano gli slot. |
| C3 | D-21 "`RoadsService` diventa dipendenza del modulo viaggio e dell'accettazione" | `RoadsModule` (`roads.module.ts:8-16`) registra solo `Road`; `PointOfInterestsService` vi è fornito ma il suo modello arriva da `MongoModule` globale (`mongo.module.ts:22-45`). Fuori dall'AppModule: errore DI (probe) | Boy Scout: aggiungere `PointOfInterest` al `forFeature` di `RoadsModule`. Nei test chiamare `roadsService.buildGraph()` **dopo** aver persistito le strade (il grafo si costruisce in `onModuleInit`, quando il DB di test è vuoto). |
| C4 | D-11 "`getPath` invariato"; riuso di `getShortestPath` | `getShortestPath` (`roads.service.ts:120-170`) lancia `Error`/`NotFoundException` grezzi (→ `INTERNAL_SERVER_ERROR`), tratta "partenza e meta sullo stesso nodo" come "Nessun percorso" (riga 144; `dijkstra.bidirectional` restituisce `[source]` se source === target e `null` senza cammino), somma gli archi paralleli col primo arco (`edgeKeys[0]`, riga 157) invece del più leggero; **nessun test** su `RoadsService` | Nuovo metodo pubblico `routeBetween(from, to)` che restituisce `null` (mai eccezioni) e sceglie l'arco parallelo di peso minimo; `getShortestPath` intatto (nessuna rete di sicurezza per rifattorizzarlo). |
| C5 | D-08 pet con `speedModifier` | Collection `pets` **vuota** (0 documenti) sul DB di sviluppo; nessun personaggio ha un pet. `Pet` ha campi non-null sul filo (`name: String!`, `damages: Damages!`, …) con `default: null` | Handoff: documento pet d'esempio **completo** (altrimenti `pets`/`pet(id)` falliscono sul filo) + `assets.pet` come ObjectId. UAT dipende da dati che l'utente crea. |
| C6 | D-21 composizione planner/accettazione | `PushModule` inietta `ConfigService` (`push-config.ts:48-58`); la int-spec standalone di `QuestAcceptanceService` (`quest-acceptance.service.int-spec.ts:58-69`) non ha `ConfigModule` | `QuestAcceptanceModule` importa solo i moduli Bull-only/planner (vedi Architettura), mai il modulo che contiene `PushModule`. Nei test che importano il modulo con la coda: override `getQueueToken('travel')` con un fake. |
| C7 | D-16 "audit automatico" | L'interceptor scrive `target: { type: <tipo di ritorno>, id: args.id }` (`admin-audit.interceptor.ts:83-86`): con `request: { id, poiId }` il target è `{ type: 'CommonResponse', id: null }` (args completi comunque salvati). Precedente identico accettato: `sendTestPush` → `{ type: 'PushDeliveryReport', id: null }` (`push.resolver.int-spec.ts:422`) | Accettare (coerente col repo) e asserire nel test `target: { type: 'CommonResponse', id: null }` + `args.request.id`. In alternativa (non necessaria) estendere l'interceptor a `args.request?.id`. |
| C8 | D-26 story/worldMission da qualunque città | `laneClaimFilter` riafferma sempre `status.location` (`quest-acceptance.updates.ts:47-62`) e `accept` chiama sempre `locationInQuestCity` (`quest-acceptance.service.ts:117-120`) | `LaneClaimSnapshot.location` opzionale: presente solo per la corsia standard; `classifyUnclaimed` controlla la posizione solo se attesa. La guard `status.activeTravel: null` vale per tutte le corsie (D-06). |
| C9 | D-10 esporre `to: PointOfInterest` | `findOne` popola `status.location` (`characters.service.ts:136-138`), `findAll` (innkeeper, righe 117-121) **no**: un ref non popolato su un ObjectType dà `ID cannot represent value: Buffer` (07 Pitfall 1) | Se `to` è esposto: ref `MongooseSchema.Types.ObjectId` + populate `status.activeTravel.to` in **entrambi** (costante condivisa, come `CHARACTER_QUESTS_POPULATE`). Boy Scout facoltativo: popolare anche `status.location` in `findAll`. |
| C10 | D-12 job identità/early fire | Bull muove i job dal set delayed quando `Date.now() >= timestamp`; con più istanze o orologi sfasati un job può arrivare con `endTime > clock.now()` | Il processor non scrive se `endTime > now` (filtro), logga e lascia lo sweep (≤ 1 intervallo). Non ri-accodare con lo stesso jobId mentre il job è attivo (Bull ignora un `add` con id esistente). |

## Answers to the research questions

### Q1 — Durate reali (D-07) — HIGH (dati reali, sola lettura)

Script Node di sola lettura (`readPreference: secondaryPreferred`, stampati solo aggregati numerici, cancellabile nello scratchpad) che ricostruisce il grafo **esattamente** come `RoadsService.buildGraph` (coordinate arrotondate a 7 decimali, haversine con `R = 127.42`, `weight = segmentKm / (speedFactor || 1)`, multigrafo non orientato) e calcola Dijkstra fra i marker delle città. Durata base in ore = Σ `lengthKm / speedFactor`; con D-08 senza pet la durata finale coincide (× 10 / 10).

| Misura | Valore |
|---|---|
| Collection | 964 `roads`, 642 `pointsofinterest`, 167 `cities`, 4 `quests`, **0 `pets`**, 1 `characters`, 0 `pendingquests` |
| `speedFactor` | min 3, p25 4,5, mediana 5, p75 5, max 7; nessuno mancante o 0 |
| `Road.length` | **assente su tutte le strade** (il modello lo dichiara `required`, i dati no) |
| Grafo | 2529 nodi, 3231 archi, **1 componente connesso** |
| Marker delle città | 167/167 **nodi esatti**; nessuna coppia sullo stesso nodo; 0 coppie irraggiungibili |
| POI in generale | 176 nodi esatti, 466 agganciati entro 5 km, 0 non agganciabili |
| Città → città più vicina | **ore** min 0,37 · p25 1,75 · **mediana 2,72** · p75 3,72 · max 9,72; km mediana 15,8 |
| Città → città qualsiasi (27 722 coppie ordinate) | **ore** p25 22,8 · **mediana 35,4** · p75 48,0 · **max 82,3**; km mediana 204, max 506 |
| Città → marker delle 4 quest | **2,64 h**, 12,4 km (tutte e 4 sullo stesso cammino; marker nodi esatti) |
| `timeToComplete` delle quest | `job` 7 200 000 ms (2 h), `heal` 18 000 000 ms (5 h), `worldMission`/`enemy` assente |

**Lettura:** i viaggi fra città vicine stanno "in ore" come voluto; l'attraversata della mappa arriva a ~3,4 giorni; il viaggio automatico intra-città verso il marker di una quest (2,6 h) è più lungo della quest stessa. Con un pet `speedModifier: 2` tutto si dimezza. La decisione di scala resta dell'utente (C1).

**Per la UAT / misure future:** lo stesso script (Dijkstra sui marker) è il modo di rimisurare dopo un ritocco degli `speedFactor`; nel handoff riportare la tabella sopra.

### Q2 — Polilinea dal cammino Dijkstra (D-10, D-11) — HIGH (codice + sorgente graphology)

**Oggi** (`roads.service.ts`):
- nodi = chiave `"lon,lat"` delle coordinate arrotondate a 7 decimali, attributo `coord: [lon, lat]` (righe 80-111); archi non orientati con `{ weight, roadId, lengthKm, speedFactor }`;
- `getShortestPath(fromPoiId, toPoiId)` legge i POI con `PointOfInterestsService.findOne` (`NotFoundException` grezzo), arrotonda `location`, usa il nodo se esiste altrimenti `findNearestNode` (O(N), soglia `MAX_SNAP_DISTANCE_KM = 5`, lancia `Error` oltre soglia), `dijkstra.bidirectional(graph, start, end, (e, attr) => attr.weight)` restituisce **la lista ordinata dei nodi dalla partenza alla meta**, poi somma `lengthKm` e `lengthKm / speedFactor` per coppie consecutive con `edgeKeys[0]` → `{ distance, time }` (km, ore).
- `dijkstra.bidirectional` (sorgente `graphology-shortest-path/dijkstra.js:84-200`): `source === target` → `[source]`; nessun cammino → `null`; nodo inesistente → `throw`.

**Orientamento:** la lista dei nodi è già ordinata dalla partenza alla meta (il grafo non orientato non impone versi): mappando ogni nodo al suo `coord` si ottiene la polilinea orientata, **qualunque sia il verso in cui la `Road` era stata disegnata**. Non serve conoscere le `Road` attraversate.

**Forma raccomandata** (nuovo metodo, `getShortestPath` invariato):

```ts
// src/roads/roads.service.ts — nuovo metodo pubblico, nessuna eccezione: null = nessun percorso (D-03/D-04)
routeBetween(from: LonLat, to: LonLat): RoadRoute | null {
    if (!this.graph) return null;
    const start = this.nodeFor(from);          // nodo esatto o snap entro 5 km, altrimenti null
    const end = this.nodeFor(to);
    if (!start || !end || start === end) return null;   // stesso nodo = viaggio di durata 0: trattato come "nessun percorso" (Open Q1)
    const nodes = dijkstra.bidirectional(this.graph, start, end, 'weight');
    if (!nodes || nodes.length < 2) return null;
    return routeOf(nodes, (a, b) => this.lightestEdge(a, b), (k) => this.graph.getNodeAttribute(k, 'coord'), from, to);
}
```

con `routeOf` **puro** in `src/roads/road-route.ts` (unit-testabile con un `Graph` graphology costruito nel test):

```ts
export interface RoadRoute { coordinates: LonLat[]; distanceKm: number; baseHours: number; }
// estremi = POI di partenza e di arrivo (D-10); punti consecutivi uguali (POI già nodo esatto) collassati
export function routeOf(nodes, edgeOf, coordOf, from, to): RoadRoute { … Σ lengthKm, Σ lengthKm / speedFactor … }
```

- `distanceKm` e `baseHours` contano **solo gli archi** (stessa base di `getPath`: la preview e `getPath` danno lo stesso numero); i tratti di snap (POI → nodo, ≤ 5 km) compaiono nella polilinea ma non nella durata. Sui dati reali le città e i marker delle quest sono nodi esatti, quindi la differenza è nulla nei casi d'uso di questa fase.
- `lightestEdge`: fra archi paralleli (multigrafo) scegliere quello con `weight` minimo, coerente con Dijkstra.
- Dedup: confrontare dopo `roundCoord` (POI non arrotondato vs nodo arrotondato).
- La polilinea attraverso la mappa ha centinaia di punti (strade fino a 102 coordinate): accettabile nel documento e nel payload, ma viaggia su **ogni** `characterUpdated` durante il viaggio (nota per il FE).

### Q3 — Bull: identità del job, rimozione, test — HIGH (codice + probe)

**Pattern esistente** (`characters.service.ts:362-386`, `spell-recovery.processor.ts`): `queue.add('recover', data, { delay, jobId: '<…>-<uuid>', removeOnComplete: true, removeOnFail: false })`; processor idempotente con update condizionale, `objectIdFromHex` sui dati del job, WARN e uscita senza scrivere su id malformati o personaggio assente; nessun publish.

**Raccomandazione per il viaggio:**
- Coda `travel` (costante `TRAVEL_QUEUE`), job `complete`, dati `{ characterId: string, startTime: number, endTime: number }` (epoch ms: niente `Date` serializzate in JSON).
- **jobId deterministico** `travel-${characterId}-${startTimeMs}`: (a) un secondo `add` dello stesso viaggio è ignorato da Bull (dedup gratuita, 04 Pitfall 5); (b) il teleport ricostruisce l'id dallo snapshot `before` senza persistere un id del job (parsimonia schema). Nessun `:` nell'id (le chiavi Redis di Bull sono `bull:<queue>:<id>`).
- `delay = max(0, endTime − clock.now())`; `removeOnComplete: true`; `removeOnFail: false` come lo spell (ispezione). `attempts` default 1: un errore Mongo transitorio lascia il job in failed e lo sweep completa.
- **Rimozione best-effort** (teleport): `const job = await queue.getJob(id); await job?.remove()` dentro `try/catch` con WARN dei soli id. `Job.prototype.remove` **lancia** `Could not remove job <id>` se il job è attivo/bloccato (`bull/lib/job.js:463-476`): innocuo, il job si neutralizza da solo (filtro sull'identità).
- Accodamento fallito dopo la scrittura (D-21): WARN, nessuna compensazione (lo sweep completa).
- `queue.empty()` cancella anche i delayed (`bull/lib/queue.js:833-873`): usarlo negli `afterAll` delle suite con Redis reale. In CI Redis è **un solo container condiviso** (`ci.yml`: `REDIS_HOST: localhost`) fra le suite in serie: un delayed rimasto da una suite può partire nella successiva che registra lo stesso processor (no-op grazie al filtro, ma rumore nei log).
- Durate brevi nei test: con `speedFactor` molto alto nelle fixture `Road` (es. `1e6`) o con un pet `speedModifier` alto si ottengono viaggi di centinaia di ms; il processor test può anche persistere un `activeTravel` già scaduto e accodare il job a mano con `delay: 0` (come lo spell test).
- **Attesa del job:** polling del documento con deadline (spell test, righe 104-120), mai `job.finished()` (apre una connessione subscriber, open handle).

**Probe (cancellato):** un modulo con `BullModule.registerQueue({ name })` + `@Processor(name)` compila e parte nei test con `.overrideProvider(getQueueToken(name)).useValue({ add, getJob, process, on })`: l'explorer chiama `process` una volta, nessun Redis [VERIFIED]. `createAuthTestApp` supporta già `overrides: [{ token, useValue }]` (`auth-test-app.ts:129-131`).

### Q4 — Reconciler e sweep (D-12) — HIGH (codice)

Modello: `EventSubSubscriptionManager` (`eventsub-subscription.manager.ts`):
- `onApplicationBootstrap(): void { this.startTimer(interval); void this.reconcileSafely(); }` — mai atteso (non blocca il boot); `onApplicationBootstrap` gira dopo tutti gli `onModuleInit` (il grafo è pronto, anche se il completamento non lo usa);
- `startTimer`: `if (intervalMs <= 0) return; this.timer = setInterval(() => void this.reconcileSafely(), intervalMs).unref();`
- `onModuleDestroy`: `clearInterval`;
- single-flight: `inFlight` promessa condivisa + `rerunRequested`; `reconcileSafely` cattura e logga.

Per lo sweep basta il single-flight senza rerun (un tick saltato è recuperato dal successivo). Lavoro dello sweep: `find({ ...ACTIVE_CHARACTER_FILTER, 'status.activeTravel.endTime': { $lte: clock.now() } }, { 'status.activeTravel.startTime': 1, 'status.activeTravel.endTime': 1 }).lean()` e per ognuno la **stessa** routine di completamento del processor (seriale, errori per-personaggio loggati e non propagati). Indice su `status.activeTravel.endTime` rimandato (D-deferred, 1 personaggio oggi).

**Clock:** `Clock`/`SystemClock` in `src/auth/clock.ts`; ogni modulo lo fornisce localmente (`{ provide: Clock, useClass: SystemClock }`, es. `quest-acceptance.module.ts:34`, `push.module.ts:26`); i test lo sostituiscono con `FixedClock` (`test/auth/fixed-clock.ts`, `advanceSeconds`) via `createAuthTestApp({ clock })` (che fa `overrideProvider(Clock)` su **tutti** i moduli) o `.overrideProvider(Clock)` diretto. **Usare `clock.now()` nei filtri** (`$lte: now`), mai `$$NOW` di Mongo: altrimenti lo sweep non è testabile con un orologio finto.

**Configurazione dell'intervallo:** token DI `TRAVEL_SWEEP_INTERVAL_MS` (default 60 000, `0` = off). Raccomandato: leggere un'env opzionale `TRAVEL_SWEEP_INTERVAL_MS` con un parser puro fail-closed (intero ≥ 0, altrimenti boot rifiutato, come `parseEventSubConfig`) e documentarla in `.env.example`; i test sovrascrivono il token con `0` e chiamano `sweep()` a mano.

### Q5 — Codice di accettazione da modificare (D-02, D-06, D-21, D-26..D-28) — HIGH (codice)

**Forme attuali:**
- `laneClaimFilter(characterId, lane, { title, location }, questId, repeatable)` (`quest-acceptance.updates.ts:47-62`) = `activeCharacterById` + corsia `null` + `status.title` + `status.location: { $in: idForms(location) }` + (non ripetibili) `completedQuests: { $nin }`. `laneClaimUpdate` = `$set` della corsia.
- `classifyUnclaimed(fresh, quest, expected)` (righe 125-144): NOT_FOUND → SLOT_BUSY → ALREADY_TAKEN → TITLE_MISMATCH → NOT_IN_CITY → SLOT_BUSY.
- `classifyEligibility(quest, character, lane)` (`quest-eligibility.ts:180-203`): ALREADY_TAKEN → TITLE_MISMATCH → SLOT_BUSY → FULL (solo `isShared`).
- `SHARED_TYPES = { worldMission, boss }` (riga 30); `capacityRuleOf` (`perRank` da `party`, `total` da `requiredAdventurers`, `unlimited`), `hasCapacity`, `takenCountExpr` (`$size` di `$filter` su `$registrations`), `registrationFilter` (`registrations.character $ne` + `registeredAdventurers $ne hex` + `$expr`), `registrationUpdate` (`$push registrations` + `$addToSet registeredAdventurers` hex).
- `QuestAcceptanceService.accept` (`quest-acceptance.service.ts:104-149`): `readQuest` (lean, proiezione con `registrations`, `registeredAdventurers`) → `laneOf` → `costOrReject` → `readCharacter` (lean, `status.title`, `status.location`, `quests`) → `classifyEligibility` → `locationInQuestCity` (query `cities.exists`) → `pendingQuestId = new Types.ObjectId()` → `connection.transaction`: `claimLane` → `register` (condivise) → `pendingQuestModel.create([{ _id, startDate: clock.now(), waitingTime, pointsSpent, quest }], { session })` → `debitUserPoints`.
- Modelli: `Quest.registeredAdventurers: [String]` con `@Field(() => [String])` + `registrations: [QuestRegistrationSchema]` interno (`quest.model.ts:42-47`); `QuestRequirements.requiredAdventurers: Int!` + `party: [QuestPartySlot!]!` (`quest-requirements.model.ts:23-34`); `QuestPartySlot.title: String!` con enum `TitleType`, `count` `min: 1` (`quest-party-slot.model.ts`); `QuestRegistration` solo `@Schema` (`quest-registration.model.ts`); `QuestInput`/`QuestRequirementsInput` non usati da nessuna operazione (assenti da `schema.gql`).
- Usi da riscrivere (grep): `quest-acceptance.updates.spec.ts` (70-126, 269-294), `quest-eligibility.spec.ts` (154-534), `quest-acceptance.service.int-spec.ts` (509-937), `accept-quest.resolver.int-spec.ts:399`, `src/models/quest-lanes.schema.spec.ts:48-97`, `test/fixtures/quest.fixture.ts:21-33`, `test/fixtures/fixtures.spec.ts:79`, `test/app.int-spec.ts:301-334`.

**Modifiche raccomandate:**

1. **Guard viaggio (D-06):** `CHARACTER_PROJECTION` + `status.activeTravel`, `assets.pet`; `classifyEligibility` controlla `character.status.activeTravel != null` → `TRAVEL_IN_PROGRESS` **per primo** fra le regole sul personaggio (è uno stato che blocca tutto); `laneClaimFilter` aggiunge `'status.activeTravel': null` (matcha anche il campo assente dei legacy); `classifyUnclaimed` dopo NOT_FOUND controlla `fresh.status?.activeTravel != null` → `TRAVEL_IN_PROGRESS`.
2. **Città solo per la standard (D-26, C8):** `locationInQuestCity` solo se `lane === standard`; `LaneClaimSnapshot.location?: Types.ObjectId` e filtro/classificazione sulla posizione solo se presente.
3. **Registrazione (D-27):** `SHARED_TYPES = { worldMission, boss, enemy, aid }` (nome consigliato `REGISTERED_TYPES`/`isRegistered` per chiarezza; `isShared` resta valido se si preferisce il diff minimo). Validazione slot **prima** della transazione, accanto a `costOrReject`: tipo registrato con slot assenti/vuoti/invalidi → WARN `Missione <id> non accettabile: slot non validi` + `QUEST_NOT_ACCEPTABLE`.
4. **Capienza a slot con jolly (D-28/D-29).** Con `seats(U)` = somma dei `count` degli slot di titolo `U`, `W` = somma dei `count` degli slot `title: null`, `r(U)` = registrati di titolo `U`: lo stato è valido se Σ_U max(0, r(U) − seats(U)) ≤ W (gli eccedenti di ogni rango occupano i jolly). Un nuovo personaggio di titolo `T` entra **se e solo se** `r(T) < seats(T)` **oppure** Σ_U max(0, r(U) − seats(U)) < W. Ne segue anche totale < Σ count. Espressione `$expr` generata in TS (i titoli sono i 6 valori di `TitleType`, `seats`/`W` letti nella pre-lettura come in Phase 7 A1):

```ts
// src/quests/acceptance/quest-capacity.ts (puro) — specchio esatto di hasSeatFor()
const countOf = (title: TitleType) => ({
    $size: { $filter: { input: { $ifNull: ['$registeredAdventurers', []] }, as: 'r', cond: { $eq: ['$$r.title', title] } } },
});
export function seatAvailableExpr(rule: SlotRule, title: TitleType) {
    const own = { $lt: [countOf(title), rule.seats[title] ?? 0] };
    if (rule.wildcard === 0) return own;
    const overflow = { $add: TITLES.map((u) => ({ $max: [0, { $subtract: [countOf(u), rule.seats[u] ?? 0] }] })) };
    return { $or: [own, { $lt: [overflow, rule.wildcard] }] };
}
```

   Filtro di registrazione: `{ _id: questId, 'registeredAdventurers.character': { $ne: characterId }, $expr: seatAvailableExpr(rule, title) }`; update: `{ $push: { registeredAdventurers: { character: characterId, title } } }`. Stesso `findOneAndUpdate` nella transazione: la proprietà di concorrenza (WriteConflict → filtro rivalutato) è quella provata in Phase 7 Q1 su 8.0.4 e 8.2.6 [VERIFIED: 07-RESEARCH §4]; la **nuova** espressione va provata dal test di integrazione (TDD) con concorrenti e un caso jolly (es. slot `[{ hero, 1 }, { null, 1 }]`: hero, hero → ok, ok; terzo hero → `QUEST_FULL`; paladin dopo un hero → ok; dopo due hero → `QUEST_FULL`).
   `classifyUnregistered`: registrato (`registeredAdventurers.some(r => sameId(r.character, id))`) → `QUEST_ALREADY_TAKEN`, altrimenti `QUEST_FULL`. `alreadyTaken` in `quest-eligibility.ts` idem.
5. **Modelli (D-28):** `QuestPartySlot.title` nullable (`@Field(() => String, { nullable: true })`, `@Prop({ type: String, enum: Object.values(TitleType), default: null })` — **null passa il validatore enum** [VERIFIED: probe]); `QuestRequirements.requiredAdventurers: QuestPartySlot[]` con `@Field(() => [QuestPartySlot])` e `default: []`; `party` rimosso. `QuestRegistration` diventa anche `@ObjectType()` con `@Field(() => ID) character` (un `ObjectId` serializzato da `GraphQLID` diventa la stringa esadecimale: `serializeObject` → `toJSON()` [VERIFIED: `GraphQLID.serialize(new ObjectId()) === hex`]) e `@Field(() => String) title`; `Quest.registeredAdventurers: [QuestRegistration]` con `@Field(() => [QuestRegistration])`, `default: []`; `registrations` rimosso. Aggiornare gli `Input` inutilizzati per coerenza (Boy Scout) o lasciarli fuori dallo schema come oggi.
6. **Viaggio automatico (D-02, D-03, D-21):** dopo `locationInQuestCity`, se `marker` ≠ `location`: `planner.planAuto(locationPoi, markerPoi, petModifier, now)` → `{ kind: 'travel', travel }` oppure `{ kind: 'jump' }` (nessun percorso → WARN con soli id quest/personaggio/POI). Nella transazione l'update del claim diventa `$set: { [lanePath]: pendingQuestId, 'status.activeTravel': travel }` (o `'status.location': marker` per il salto); `startDate: travel ? null : clock.now()`. Dopo il commit `scheduler.schedule(characterId, travel)` (best-effort). La funzione resta una sola (`accept` esteso, non duplicato).

### Q6 — `CharacterDeletionService.archiveCurrentCharacter` (D-30) — HIGH (codice)

`character-deletion.service.ts:41-75`: transazione `findOneAndUpdate` sullo User (`returnDocument: 'before'`, proiezione `currentCharacter`) → `updateOne(activeCharacterById(prev), { $set: { deletedAt, deletionReason } })` → WARN se `matchedCount === 0`. **Punto d'innesto:** subito dopo l'archivio, nella **stessa session**, solo se `archived.matchedCount > 0`:

```ts
await this.questModel
    .updateMany(
        { 'registeredAdventurers.character': unlinked.currentCharacter },
        { $pull: { registeredAdventurers: { character: unlinked.currentCharacter } } },
        { session },
    )
    .exec();
```

"Quest non ancora concluse": oggi non esiste alcun marcatore di conclusione (D-29 lo rimanda alla Phase 9), quindi il filtro è su tutte le quest. `CharacterDeletionModule` deve registrare `Quest` nel `forFeature`; i test pre-creano la collection `quests` (07 Pitfall 5). La stessa routine sarà riusata per la morte (Phase 9). Il viaggio attivo resta sul documento archiviato: job e sweep lo saltano grazie ad `activeCharacterById`/`ACTIVE_CHARACTER_FILTER`.

### Q7 — Mongoose / GraphQL specifici (BE-TRAVEL-01) — HIGH (codice + probe)

- `CharacterStatus` (`character-status.model.ts`) è `@Schema({ _id: false })`; `location` è `@Prop({ type: Types.ObjectId, ref })` → path `Mixed` (07 Pitfall 1): filtri sempre con `ObjectId`/`idForms`.
- **Sotto-documento nullable** [VERIFIED: probe Mongoose 8.18.1]: `@Prop({ type: ActiveTravelSchema, default: null })` → path `Embedded`; un documento legacy senza il campo è idratato a `null`; un documento nuovo nasce con `null`. Sul filo: `@Field(() => ActiveTravel, { nullable: true })`.
- Forma raccomandata (nuovi ref con `MongooseSchema.Types.ObjectId`, decisione Phase 2):

```ts
@ObjectType() @Schema({ _id: false })
export class TravelPath {
    @Field(() => [[Float]]) @Prop({ type: [[Number]], required: true }) coordinates: [number, number][];   // → [[Float!]!]!
    @Field(() => Float) @Prop({ type: Number, required: true }) distance: number;                             // km di gioco
}
@ObjectType() @Schema({ _id: false })
export class ActiveTravel {
    @Field(() => TravelPath) @Prop({ type: TravelPathSchema, required: true }) road: TravelPath;
    @Field(() => Date) @Prop({ type: Date, required: true }) startTime: Date;                                // → DateTime!
    @Field(() => Date) @Prop({ type: Date, required: true }) endTime: Date;
    @Field(() => Float) @Prop({ type: Number, required: true }) duration: number;                             // ms, = endTime − startTime
    @Field(() => PointOfInterest) @Prop({ type: MongooseSchema.Types.ObjectId, ref: PointOfInterest.name, required: true }) to: Types.ObjectId | PointOfInterest;
    @Prop({ type: String, enum: Object.values(TravelKind), required: true }) kind: TravelKind;                // interno (D-14)
}
```

  `to` è **necessario a DB** (il completamento deve sapere la meta); esporlo richiede il populate (C9). `kind` interno: il FE distingue il viaggio da quest con `pendingQuest.startDate == null`. `durationMs = Math.round(baseHours × 3 600 000 × 10 / speed)`, `endTime = new Date(startTime.getTime() + durationMs)` (uguaglianza esatta `duration = endTime − startTime`).
- `[[Float]]` → `[[Float!]!]!` (precedente `City.area`, `schema.gql:85`); `@Field(() => Date)` → `DateTime` (`schema.gql:181`, `PendingQuest.startDate`).
- `PendingQuest.startDate`: `@Field(() => Date, { nullable: true })`, `@Prop({ type: Date, default: null })`; `PendingQuestInput` (non in schema) invariato.
- `Pet.speedModifier`: `@Field(() => Float, { nullable: true })`, `@Prop({ type: Number, default: null })`. `Character.assets.pet` è `@Prop({ type: Types.ObjectId, ref: Pet.name, default: null })` → `Mixed` (`character-assets.model.ts:29-31`): leggere con `refIdOf` (ObjectId o hex legacy) e `petModel.findById(id, { speedModifier: 1 }).lean()`.
- Real-time: il change stream `characters` (`characters.service.ts:76-104`) rilegge con `findOne` e pubblica; lo snapshot di `characterUpdated` usa `findOne`: `activeTravel` (impostato e poi `null`) arriva senza publish manuale. Un viaggio da quest scrive `PendingQuest.startDate` nella stessa transazione: l'evento del Character arriva al commit e il populate legge già la data.
- **Rigenerazione di `src/schema.gql`:** solo dal boot reale `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` (`autoSchemaFile` + `sortSchema: true`, `graphql-options.factory.ts:13-18`); poi commit e gate `git diff --exit-code src/schema.gql`.
- Asserzioni del boot reale da aggiornare (`test/app.int-spec.ts`): `EXPECTED_OWNERSHIP_HANDLERS` (righe 53-64) + `TravelResolver.startTravel`, `TravelResolver.travelPreview`; `EXPECTED_OWNER_ONLY_HANDLERS` (riga 66) + le stesse due; `EXPECTED_INNKEEPER_HANDLERS` (righe 46-52) + `TravelAdminResolver.teleportCharacter` (nome a discrezione); test SDL righe 288-311 riscritti (`startDate: DateTime`, `requiredAdventurers: [QuestPartySlot!]!`, `QuestPartySlot { count: Int! title: String }`, `registeredAdventurers: [QuestRegistration!]!`), divieto con **regex a parola intera** `/\bparty\b|\bregistrations\b/` (`toContain('party')` sarebbe case-sensitive e fragile); nuove asserzioni per `activeTravel: ActiveTravel`, `type ActiveTravel`, `type TravelPath`, `speedModifier: Float`, `startTravel(…)`, `travelPreview(…)`, `teleportCharacter(…)`; nessun `kind`/`TravelKind` nello schema se resta interno.

### Q8 — Authz (D-16, D-18) — HIGH (codice)

```ts
import { OwnsCharacter } from 'src/authz/ownership/ownership.decorators';
import { Roles } from 'src/authz/roles/roles.decorator';
import { RoleType } from 'src/models/enums/role-type.enum';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@OwnsCharacter<{ request: StartTravelRequest }>(({ request }) => request.id, { ownerOnly: true })
@Mutation(() => CommonResponse)
startTravel(@Args('request', { type: () => StartTravelRequest }) request: StartTravelRequest) { … }

@OwnsCharacter<{ request: TravelPreviewRequest }>(({ request }) => request.id, { ownerOnly: true })
@Query(() => TravelPreview)
travelPreview(…) { … }

@Roles(RoleType.innkeeper)
@Mutation(() => CommonResponse)
teleportCharacter(@Args('request', { type: () => TeleportCharacterRequest }) request: TeleportCharacterRequest) { … }
```

- Il modulo che ospita i resolver importa `AuthzModule` (i guard di metodo si istanziano lì; `quest-acceptance.module.ts:28-30`).
- `ownerOnly`: innkeeper su personaggio altrui → `FORBIDDEN`, inesistente → `NOT_FOUND`, nessun audit on-behalf (07-04). Funziona anche su una `@Query` (come `character`).
- `@Roles(innkeeper)`: non-innkeeper → `FORBIDDEN`; l'interceptor globale (`admin-audit.interceptor.ts`) registra solo le **mutation** con outcome `OK` o il codice d'errore (C7 per il target).
- Nel resolver: `requireCharacterObjectId(request.id)` (`NOT_FOUND` su id malformato) e `objectIdFromHex(request.poiId)` → `null` ⇒ `NOT_FOUND` del POI (nuova factory `ResourceNotFoundException.pointOfInterest()` con messaggio italiano, es. `Luogo non trovato`). Non usare `PointOfInterestsService.findOne` (lancia `NotFoundException` grezzo → `INTERNAL_SERVER_ERROR`, commento in `resource-not-found.exception.ts:4`).

### Q9 — Codici (D-19) — HIGH (codice)

Pattern Phase 4: valore in `GameRuleErrorCode` (enum TS puro, `game-rule-error-code.enum.ts`), factory statica con messaggio italiano in `GameRuleException` (`game-rule.exception.ts`), riga nella tabella parametrica di `game-rule.exception.spec.ts` (RED prima). `formatDomainError` (`src/graphql/format-domain-error.ts`) espone `extensions.code` stringa senza altro: nessuna modifica. Codici nuovi: `TRAVEL_IN_PROGRESS`, `TRAVEL_SAME_LOCATION`, `TRAVEL_DESTINATION_NOT_ALLOWED`, `TRAVEL_NO_PATH`, `QUEST_IN_PROGRESS`. Messaggi proposti [ASSUMED]: `Sei già in viaggio`, `Sei già in questo luogo`, `Puoi viaggiare solo verso una città`, `Nessuna strada porta a questa meta`, `Hai una missione in corso`.

**Ordine consigliato per `startTravel`/`travelPreview`** (letture → regole pure): personaggio inesistente/archiviato → `NOT_FOUND`; POI inesistente → `NOT_FOUND`; POI non marker di città → `TRAVEL_DESTINATION_NOT_ALLOWED`; `activeTravel` → `TRAVEL_IN_PROGRESS`; `pendingQuest` → `QUEST_IN_PROGRESS`; meta = posizione → `TRAVEL_SAME_LOCATION`; nessun percorso → `TRAVEL_NO_PATH`. Dopo un update fallito (corsa): rilettura nella stessa logica → `NOT_FOUND` / `TRAVEL_IN_PROGRESS` / `QUEST_IN_PROGRESS` / fallback `TRAVEL_IN_PROGRESS` (posizione cambiata = altro movimento concorrente).

### Q10 — Push (D-14) — HIGH (codice)

`PushService.sendToUser(userId: Types.ObjectId, message)` non lancia mai (`push.service.ts:55-83`); builder `travelEnd(characterId: string)` in `src/push/push-events.ts`. Proprietario: `userModel.findOne({ currentCharacter: characterId }, { _id: 1 }).lean()` (dopo il commit; un archiviato ha `currentCharacter: null` → nessuna push). **Solo il chiamante il cui update condizionale ha matchato** invia la push (job e sweep concorrenti → una sola push). Test: `overrides: [{ token: PushTransport, useValue: new FakePushTransport() }]` (`test/push/fake-push-transport.ts`), device registrato con `PushService.registerDevice(userId, { deviceId, token, platform })`, asserzione su `transport.sent`. `PushModule` richiede `ConfigModule` globale (C6).

### Q11 — Fixture e harness — HIGH (codice)

- Esistono: `buildRoad/persistRoad` (`coordinates`, `length: 1`, `speedFactor: 1`), `buildPoi/persistPoi`, `buildCity/persistCity(model, overrides, poiModel?)` (crea il POI marker), `buildCharacter/persistCharacter(model, overrides, poiModel?)`, `buildQuest/persistQuest`, `buildUser/persistUser` (`test/fixtures/*.ts`). **Mancano** `buildPet/persistPet` e un helper "mappa" (POI A/B + strada fra le coordinate).
- `buildQuest` va aggiornato: `requirements.requiredAdventurers: []`, niente `party`, `registeredAdventurers: []`, niente `registrations`; `buildCharacter` può restare (il default `activeTravel: null` arriva dallo schema).
- `createCharactersTestApp` (`test/authz/characters-test-app.ts`) registra Character, Spell, EquipmentItem, LootItem, PointOfInterest, PendingQuest, Quest e un fake della coda `spell-recovery`; `createPlayer(harness, { twitchId, characterOverrides })` (`test/authz/player-fixture.ts`) crea User + Character con POI reale e bearer vero; `primeCharactersChangeStream(harness)` (`test/characters/characters-change-stream.ts`) va chiamato prima di asserire eventi `characterUpdated`.
- Per i moduli viaggio nell'harness: `imports: [TravelModule]` + `overrides: [{ token: getQueueToken(TRAVEL_QUEUE), useValue: fakeQueue }, { token: PushTransport, useValue: fakePush }, { token: TRAVEL_SWEEP_INTERVAL_MS, useValue: 0 }]`, `RoadsModule` con `PointOfInterest` registrato (C3) e `buildGraph()` dopo le fixture.

### Q12 — Comandi e gate — HIGH (codice + misura)

- Unit: `npx jest <paths> --selectProjects unit` (baseline misurata oggi: **85 suite, 1264 test, 3,4 s**). Integration: `npx jest <paths> --selectProjects integration --runInBand` (49 file `*.int-spec.ts`; ultima misura Phase 7: 49 suite / 610 test, ~79 s). Percorsi **prima** di `--selectProjects`.
- Prettier/ESLint solo sui file toccati; file legacy non formattati → commit `style(...)` separato.
- CI (`.github/workflows/ci.yml`): `npm run lint` → `npm run build` → `npm run test:unit` → `npm run test:int` → `git diff --exit-code src/schema.gql`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| graphology | 0.26.0 | multigrafo non orientato della rete stradale | già in uso da `RoadsService` [VERIFIED: node_modules] |
| graphology-shortest-path | 2.1.0 | `dijkstra.bidirectional` → lista ordinata dei nodi | già in uso; comportamento di `source === target`/`null` letto dal sorgente [VERIFIED] |
| bull | 4.16.5 | job differito di completamento (trigger) | già in uso (spell recovery) [VERIFIED] |
| @nestjs/bull | 11.0.3 | `registerQueue`, `@Processor`, `@InjectQueue`, `getQueueToken` | già in uso [VERIFIED] |
| mongoose | 8.18.1 | sotto-documento nullable, update condizionali, transazioni | già in uso; probe di idratazione [VERIFIED] |
| @nestjs/graphql / graphql | 13.2.0 / 16.11.0 | code-first `[[Float]]`, `DateTime`, `ID` | già in uso [VERIFIED] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ioredis | 5.7.0 | client Redis di Bull | implicito |
| redis-memory-server | 0.17.0 | Redis effimero locale nei test con processor reale | `startRedis()`/`stopRedis()` (`test/setup/redis.ts`); in CI il container `redis:7` |
| jest / ts-jest | 30 / 29 | unit + integration | progetti `unit` e `integration` in `package.json` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jobId deterministico `travel-<char>-<startMs>` | id interno persistito in `activeTravel` | un campo in più senza vantaggi: l'identità `startTime`/`endTime` basta per filtro e jobId |
| nuovo `routeBetween` | estendere `getShortestPath` | toccherebbe un metodo senza test che `getPath` espone; i suoi errori grezzi non servono al viaggio |
| sweep con `setInterval` | job Bull ripetibile (`repeat`) | dipenderebbe proprio da Redis, che è il punto debole (eviction) che lo sweep deve coprire |
| transazione solo per il viaggio da quest | transazione sempre | uniformità; costo trascurabile; il planner può scegliere "sempre" per semplicità (replica set già obbligatorio) |

**Installation:** nessuna.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── roads/
│   ├── road-route.ts (+ .spec.ts)              # puro: routeOf (polilinea orientata, estremi POI, dedup, Σ km/ore, arco più leggero)
│   ├── roads.service.ts                         # + routeBetween(from, to): RoadRoute | null; getShortestPath intatto
│   └── roads.module.ts                          # + PointOfInterest nel forFeature (C3)
├── travel/
│   ├── travel-speed.ts (+ .spec.ts)             # BASE_SPEED 10, speedOf(modifier), durationMsOf(baseHours, speed)
│   ├── travel-rules.ts (+ .spec.ts)             # classifyTravelRequest(snapshot, poi, isCityMarker, route) → codice | ok
│   ├── travel.updates.ts (+ .spec.ts)           # startFilter/Update, completionFilter/Update, teleportFilter/Update, dueTravelsFilter, classify*
│   ├── travel-job.ts                            # TRAVEL_QUEUE, TravelJobData, travelJobId()
│   ├── travel-planner.service.ts                # letture lean (personaggio, pet, POI, città) + RoadsService.routeBetween → piano
│   ├── travel-scheduler.service.ts              # @InjectQueue: schedule(), cancel() best-effort
│   ├── travel-completion.service.ts             # complete(characterId, startTime, endTime): update condizionale (+ transazione per kind quest) → push se libero
│   ├── travel-completion.processor.ts           # @Processor(TRAVEL_QUEUE) @Process('complete')
│   ├── travel-sweeper.ts                        # onApplicationBootstrap/onModuleDestroy, single-flight
│   ├── travel.service.ts                        # startTravel, preview, teleport
│   ├── travel.resolver.ts                       # startTravel, travelPreview (owner-only)
│   ├── travel-admin.resolver.ts                 # teleportCharacter (@Roles innkeeper)
│   ├── travel-scheduling.module.ts              # BullModule.registerQueue + Planner + Scheduler + RoadsModule (niente Push)
│   └── travel.module.ts                         # importa TravelSchedulingModule, PushModule, AuthzModule; service, resolver, completion, processor, sweeper
├── models/
│   ├── character/active-travel.model.ts         # ActiveTravel, TravelPath, TravelKind (enum interno)
│   ├── request/start-travel-request.model.ts    # { id, poiId } (riusabile per preview e teleport, o tre input distinti)
│   └── travel-preview.model.ts                  # { distance, duration, road }
└── quests/acceptance/quest-capacity.ts (+ .spec.ts)   # slot, seatAvailableExpr, hasSeatFor (D-28/D-29)
test/fixtures/pet.fixture.ts, test/travel/fake-travel-queue.ts, test/travel/travel-world.ts (POI + strade + città)
```

`QuestAcceptanceModule` importa `TravelSchedulingModule` (planner + scheduler). `AppModule` importa `TravelModule`. La int-spec standalone dell'accettazione sovrascrive `getQueueToken(TRAVEL_QUEUE)` e registra `PointOfInterest`/`Road`/`Pet` tramite i moduli importati.

### Pattern 1: letture lean → regole pure → un `findOneAndUpdate` condizionale ("il filtro è la regola")
Esempio `startTravel`: filtro `{ ...activeCharacterById(id), 'status.activeTravel': null, 'quests.pendingQuest': null, 'status.location': { $in: idForms(snapshotLocation) } }`, update `{ $set: { 'status.activeTravel': travel } }`, `projection: { _id: 1 }`; se `null` → rilettura leggera per il codice. `travelPreview` esegue le stesse letture e regole e restituisce il piano senza scrivere.

### Pattern 2: teleport con `returnDocument: 'before'`
`findOneAndUpdate({ ...activeCharacterById(id), 'quests.pendingQuest': null }, { $set: { 'status.location': poiId, 'status.activeTravel': null } }, { returnDocument: 'before', projection: { 'status.activeTravel.startTime': 1 } })`: un solo round-trip scrive e restituisce il viaggio annullato (per ricostruire il jobId). `null` → rilettura: assente → `NOT_FOUND`, `pendingQuest` → `QUEST_IN_PROGRESS`. Poi `scheduler.cancel()` best-effort. Il POI va verificato esistente prima (lettura lean).

### Pattern 3: completamento idempotente
```ts
// filtro = identità del viaggio + attivo + scaduto (D-12, D-13)
const filter = {
    ...activeCharacterById(characterId),
    'status.activeTravel.startTime': new Date(job.startTime),
    'status.activeTravel.endTime': { $eq: new Date(job.endTime), $lte: this.clock.now() },
};
// kind libero: un solo findOneAndUpdate; kind quest: stessa operazione + PendingQuest dentro connection.transaction
const before = await this.characterModel.findOneAndUpdate(filter, { $set: { 'status.location': to, 'status.activeTravel': null } },
    { session, returnDocument: 'before', projection: { 'quests.pendingQuest': 1, 'status.activeTravel.kind': 1, 'status.activeTravel.to': 1 } }).lean().exec();
if (!before) return 'stale';                     // duplicato, rieseguito, teleportato, archiviato, non ancora scaduto
if (kind === quest) await pendingQuests.updateOne({ _id: before.quests.pendingQuest, startDate: null }, { $set: { startDate: endTime } }, { session });
// dopo il commit, solo se kind libero: push al proprietario
```
Il valore `to` va letto prima (o dallo snapshot dello sweep / dal job) perché l'update lo usa; in alternativa pipeline update `[{ $set: { 'status.location': '$status.activeTravel.to', 'status.activeTravel': null } }]` (una sola operazione, legge la meta dal documento stesso, nessuna lettura preliminare). Raccomandata la pipeline: elimina la finestra fra lettura e scrittura.

### Anti-Patterns to Avoid
- **ETA o percorso dal client:** il client manda solo `id` e `poiId`.
- **`findById` nel processor/sweep:** sempre `activeCharacterById`/`ACTIVE_CHARACTER_FILTER` (03.1 §8).
- **Push dentro `connection.transaction`:** il callback si ripete sui WriteConflict (05 §8).
- **`$$NOW` nei filtri:** rende lo sweep intestabile con `FixedClock`.
- **`await` della riconciliazione in `onApplicationBootstrap`:** blocca il boot; usare `void` + catch.
- **`getShortestPath` dentro il viaggio:** errori grezzi → `INTERNAL_SERVER_ERROR`.
- **Ri-accodare con lo stesso jobId mentre il job è attivo:** Bull lo ignora in silenzio.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cammino minimo | Dijkstra a mano | `dijkstra.bidirectional` già usato | stesso grafo e stessi pesi di `getPath` |
| Timer persistenti | `setTimeout` per viaggio | job Bull delayed + sweep | sopravvive al restart; lo sweep copre i job persi |
| Retry delle transazioni | loop manuale | `connection.transaction` (`withTransaction`) | ritenta i WriteConflict |
| Saldo punti | `$inc` diretto | `WalletService.debitUserPoints(…, session)` | unico scrittore (04 D-04) |
| Id del client | regex locali | `objectIdFromHex`, `requireCharacterObjectId`, `idForms`, `sameId` | path `Mixed` |
| Invio push | chiamate firebase | `PushService.sendToUser` + `travelEnd()` | best-effort, pruning, catalogo unico |
| Capienza | lettura + confronto in memoria | `$expr` nello stesso `findOneAndUpdate` | atomico per documento (07 Q1) |

**Key insight:** ogni regola esprimibile sul documento sta nel filtro; Bull e lo sweep sono solo trigger, il DB (`endTime`) decide.

## Runtime State Inventory

Non è una fase di rename, ma D-28 cambia la forma di dati già persistiti senza migrazione: l'inventario serve al deploy.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | DB di sviluppo: **4 quest** con `requirements.requiredAdventurers` numerico (1/0…), `registeredAdventurers: []`, nessun `party`/`registrations` [VERIFIED]; 0 pet; 1 personaggio senza `activeTravel` né pet; 0 pendingquests. Produzione: non ispezionata | **Aggiornamento dati manuale dell'utente** (decisione D-28) subito dopo il deploy: `requiredAdventurers` → lista di slot per le 4 quest (handoff con un `updateOne` d'esempio per tipo). Nessuna azione per `activeTravel` (default `null`) e `startDate` (i PendingQuest esistenti restano valorizzati) |
| Live service config | Redis: nuova coda `travel` (chiavi `bull:travel:*`), nessuna configurazione esistente da rinominare | Nessuna; verificare la policy `maxmemory-policy` (blocker STATE: con eviction i delayed spariscono, lo sweep compensa) |
| OS-registered state | Nessuno — verificato: il repo non registra task di sistema | Nessuna |
| Secrets/env vars | Opzionale `TRAVEL_SWEEP_INTERVAL_MS` (non segreta) | Se introdotta: `.env.example` + parser fail-closed |
| Build artifacts | `dist/` presente nel working tree (artefatto locale) | Nessuna (ricostruito da `npm run build`) |

## Common Pitfalls

### Pitfall 1: grafo costruito prima delle fixture
**What goes wrong:** `routeBetween` restituisce `null` (grafo vuoto) e tutti i viaggi falliscono con `TRAVEL_NO_PATH` o diventano salti. **Why:** `RoadsService.onModuleInit` costruisce il grafo al boot del modulo di test, col DB vuoto. **How to avoid:** `await app.get(RoadsService).buildGraph()` dopo `persistRoad`. **Warning signs:** WARN di salto istantaneo inattesi nei test.

### Pitfall 2: `RoadsModule` fuori da `MongoModule`
Errore DI su `PointOfInterestModel` (probe). Registrare `PointOfInterest` in `RoadsModule`.

### Pitfall 3: ref `Mixed` e populate
`status.location`, `assets.pet`, `quests.pendingQuest` sono `Mixed`: filtri con `ObjectId`/`idForms`, letture con `refIdOf`. Un `to: PointOfInterest` esposto senza populate rompe il campo (Buffer). Nuovi ref con `MongooseSchema.Types.ObjectId`.

### Pitfall 4: dati quest legacy dopo D-28
Idratazione silenziosa a forme invalide (probe) → `quests` con `data: null` sul filo finché i documenti non sono aggiornati; nel codice leggere lean e validare gli slot.

### Pitfall 5: collection non create prima delle transazioni
Pre-creare `characters`, `quests`, `pendingquests`, `users`, `cities`, `pointsofinterest`, `pets`, `roads` (`model.init()`) nei `beforeAll`.

### Pitfall 6: Redis condiviso in CI
Delayed job residui fra suite (stesso container). `queue.empty()` negli `afterAll`, `removeOnComplete: true`.

### Pitfall 7: job prima di `endTime` / orologi
Il filtro `$lte: now` scarta un fire anticipato: lo sweep lo completa. Nei test con `FixedClock` il delay Bull usa il tempo reale: per i test del processor usare il `SystemClock` e viaggi già scaduti o brevissimi.

### Pitfall 8: `startDate` nullable e consumatori esistenti
`PendingQuestsResolver.pendingQuests` (innkeeper) e `pendingQuest(id)` restituiscono ora `startDate: null` per le quest in viaggio; i test esistenti che asseriscono `DateTime!` nello schema (`test/app.int-spec.ts:295-297`) vanno aggiornati.

### Pitfall 9: test del boot reale con divieti di sottostringa
`expect(schema).not.toContain('registrations')` resta valido; per `party` usare una regex a parola intera. Le whitelist sono **elenchi esatti**: ogni handler nuovo le rende RED.

### Pitfall 10: Prettier su file legacy e grep multilinea
`src/roads/*.ts`, `pet.model.ts`, `character-assets.model.ts`, `city.model.ts`, `point-of-interest.model.ts` non sono formattati: commit `style` separato. Prettier spezza decorator e chiamate: i `key_links` dei PLAN usano pattern tolleranti (`findOneAndUpdate\(\s*` o il solo simbolo).

### Pitfall 11: push duplicate
Inviare la push solo se **questo** update ha matchato (`findOneAndUpdate` non nullo); mai dalla lettura dello sweep.

### Pitfall 12: viaggio a durata zero
Partenza e meta agganciate allo stesso nodo (POI distinti entro 5 km dallo stesso nodo) danno un cammino di un nodo: trattarlo come "nessun percorso" (Open Q1). Sui dati reali non accade per città e marker.

### Pitfall 13: env del boot reale
Il boot reale imposta l'env prima di importare `AppModule` (`test/app.int-spec.ts:169-187`): se si introduce `TRAVEL_SWEEP_INTERVAL_MS`, impostarla lì (es. `'0'`) per non lasciare timer; il `.env` locale non deve influenzare il test.

## Code Examples

### Velocità e durata (puro)
```ts
// src/travel/travel-speed.ts
export const BASE_SPEED = 10;
const MS_PER_HOUR = 3_600_000;
export function speedOf(modifier: number | null | undefined): { speed: number; invalid: boolean } {
    if (modifier == null) return { speed: BASE_SPEED, invalid: false };
    if (!Number.isFinite(modifier) || modifier <= 0) return { speed: BASE_SPEED, invalid: true };   // WARN nel service (D-08)
    return { speed: BASE_SPEED * modifier, invalid: false };
}
export function durationMsOf(baseHours: number, speed: number): number {
    return Math.round((baseHours * MS_PER_HOUR * BASE_SPEED) / speed);
}
```

### Sweeper (dal pattern di Phase 6)
```ts
@Injectable()
export class TravelSweeper implements OnApplicationBootstrap, OnModuleDestroy {
    private timer: NodeJS.Timeout | null = null;
    private inFlight: Promise<void> | null = null;
    constructor(@Inject(TRAVEL_SWEEP_INTERVAL_MS) private readonly intervalMs: number, /* model, clock, completion */) {}
    onApplicationBootstrap(): void {
        if (this.intervalMs > 0) this.timer = setInterval(() => void this.sweepSafely(), this.intervalMs).unref();
        void this.sweepSafely();                       // reconciler al boot
    }
    onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
    sweep(): Promise<void> { return (this.inFlight ??= this.runOnce().finally(() => { this.inFlight = null; })); }
    private sweepSafely(): Promise<void> { return this.sweep().catch((e) => this.logger.error(`Travel sweep failed: ${describe(e)}`)); }
}
```

### Accodamento
```ts
await this.queue.add('complete', { characterId, startTime: start.getTime(), endTime: end.getTime() }, {
    jobId: travelJobId(characterId, start),   // `travel-${characterId}-${start.getTime()}`
    delay: Math.max(0, end.getTime() - this.clock.now().getTime()),
    removeOnComplete: true,
    removeOnFail: false,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `registrations` interno + `registeredAdventurers: [String]` | `registeredAdventurers: [{ character, title }]` (una fonte) | Phase 8 (D-28) | riscrittura di filtri, classificatori e test Phase 7 |
| `party` + `requiredAdventurers: Int` | `requiredAdventurers: [{ title?, count }]` con jolly | Phase 8 (D-28) | nuova espressione di capienza |
| `PendingQuest.startDate: DateTime!` | `DateTime` (null = in viaggio) | Phase 8 (D-15) | eccezione dichiarata al contratto additivo |
| BE-FUT-03 "pet speed modifiers" futuro | `Pet.speedModifier` in v1 | Phase 8 (D-08) | REQUIREMENTS: BE-FUT-03 di fatto assorbito (da segnalare nel handoff/REQUIREMENTS) |

**Deprecated/outdated:** `QuestRegistration` solo-schema e `capacityRuleOf` a tre modalità (`perRank`/`total`/`unlimited`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Messaggi italiani proposti per i 5 codici nuovi | Q9 | solo stringhe; il FE mappa il codice |
| A2 | Viaggio a durata zero (stesso nodo) trattato come "nessun percorso" | Q2, Pitfall 12 | un salto istantaneo (auto) o `TRAVEL_NO_PATH` (libero) in un caso limite assente dai dati reali |
| A3 | Durata e distanza contano solo gli archi (non i tratti di snap) | Q2 | differenza ≤ 5 km sui POI non-nodo; nulla per città e marker reali |
| A4 | `kind` interno, `to` esposto | Q7 | se il FE vuole `kind`, aggiunta additiva |
| A5 | La produzione ha dati simili al DB di sviluppo | Q1, Inventory | durate e quest legacy diverse in prod: da rimisurare con lo script |
| A6 | Ordine dei rifiuti proposto (Q5 punto 1, Q9) | Q5, Q9 | solo il codice restituito nei casi multipli |

## Open Questions

1. **Scala delle durate (C1, D-07).**
   - What we know: città vicine ~2,7 h, attraversata fino a 82 h, quest intra-città 2,6 h.
   - What's unclear: se l'utente accetta giorni per i viaggi lunghi e 2,6 h prima di ogni quest standard.
   - Recommendation: chiedere all'utente prima del planning; il codice non cambia (si regolano gli `speedFactor` a DB o si emenda D-07).
2. **Viaggio a durata zero.** Recommendation: `null` da `routeBetween` (A2).
3. **Le 4 quest di sviluppo (C2).** Recommendation: comando di aggiornamento nel handoff; l'utente lo esegue al deploy.
4. **`TRAVEL_SWEEP_INTERVAL_MS` come env o solo DI.** Recommendation: env opzionale fail-closed + default 60 s (D-12 "configurabile").
5. **Target dell'audit del teleport (C7).** Recommendation: accettare `{ type: 'CommonResponse', id: null }` come `sendTestPush`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | runtime/test | ✓ | v22.12.0 | — |
| mongod (mongodb-memory-server) | integration | ✓ | 8.2.6 locale, 8.0.4 pin CI | — |
| Redis effimero (redis-memory-server) | processor test, boot reale | ✓ | 0.17.0 (locale), `redis:7` in CI | — |
| DB di sviluppo (Atlas, da `.env`) | misure D-07, UAT | ✓ (raggiungibile, lettura sola) | — | — |
| `timeout` (coreutils) | — | ✗ | — | non necessario |

**Missing dependencies with no fallback:** nessuna. **Dati da preparare per la UAT (utente):** pet con `speedModifier` (collection vuota), `assets.pet` su un personaggio, le 4 quest nel nuovo formato a slot, eventuale ritocco di `speedFactor`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest 29; progetti `unit` (`*.spec.ts`) e `integration` (`*.int-spec.ts`, `MongoMemoryReplSet` da `test/setup/global-setup.ts`, Redis da `test/setup/redis.ts`) |
| Config file | `package.json` → `jest.projects` |
| Quick run command | `npx jest src/travel src/roads src/quests/acceptance src/gameRules src/models --selectProjects unit` |
| Integration command | `npx jest src/travel src/quests/acceptance src/characters/deletion test/app.int-spec.ts --selectProjects integration --runInBand` |
| Full suite command | `npm run test:unit && npm run test:int` |
| Estimated runtime | unit ~4 s; int di fase ~30–40 s (processor con Redis reale incluso); suite completa integrazione ~90 s |

**Baseline misurata (2026-10-21, `feat/08-travel-lifecycle-travel-01` pulito su `7f98d0f`):** unit **85 suite / 1264 test** verdi (3,4 s); integration 49 file (ultima misura Phase 7: 49 / 610).

### Phase Requirements → Test Map
| Req / D | Behavior | Type | File | Automated Command | Exists? |
|---|---|---|---|---|---|
| D-10, Q2 | `routeOf`: ordine dei nodi = orientamento (anche su strade disegnate al contrario), estremi = POI, dedup del POI già nodo, Σ km e ore su più strade, arco parallelo più leggero | unit | `src/roads/road-route.spec.ts` | `npx jest src/roads --selectProjects unit` | ❌ Wave 0 |
| D-03, D-11, Q2 | `routeBetween`: nodo esatto, snap ≤ 5 km, oltre soglia → `null`, stesso nodo → `null`, nessun cammino → `null`, grafo non costruito → `null`; `getShortestPath` invariato | integration (grafo da fixture) | `src/roads/roads.service.int-spec.ts` | `npx jest src/roads --selectProjects integration --runInBand` | ❌ |
| D-08, D-09 | `speedOf` (null, 1, 2, 0, −1, NaN, Infinity → 10 + invalid), `durationMsOf` (arrotondamento, `duration = end − start`) | unit | `src/travel/travel-speed.spec.ts` | `npx jest src/travel --selectProjects unit` | ❌ |
| D-01, D-04, D-19 | `classifyTravelRequest`: ordine e codici (NOT_FOUND POI, DESTINATION_NOT_ALLOWED, IN_PROGRESS, QUEST_IN_PROGRESS, SAME_LOCATION, NO_PATH), story/worldMission non bloccano | unit | `src/travel/travel-rules.spec.ts` | idem | ❌ |
| D-12, D-13, D-16, D-21 | forme di `startFilter/Update`, `completionFilter/Update` (identità + `$lte now`), `teleportFilter/Update`, `dueTravelsFilter`, `travelJobId`, classificatori dopo update fallito | unit | `src/travel/travel.updates.spec.ts` | idem | ❌ |
| D-19 | factory dei 5 codici + `ResourceNotFoundException.pointOfInterest` | unit | `src/gameRules/game-rule.exception.spec.ts`, `src/authz/resource-not-found.exception.spec.ts` | `npx jest src/gameRules src/authz --selectProjects unit` | ✅ estendere |
| D-28, D-29 | `slotsOf` (validazione), `hasSeatFor` e `seatAvailableExpr` (rango esatto, jolly condivisi, eccedenze, totale), `classifyEligibility` con TRAVEL_IN_PROGRESS e REGISTERED_TYPES | unit | `src/quests/acceptance/quest-capacity.spec.ts`, `quest-eligibility.spec.ts`, `quest-acceptance.updates.spec.ts` | `npx jest src/quests/acceptance --selectProjects unit` | ❌ / ✅ riscrivere |
| BE-TRAVEL-01, D-15, D-28 | schema Mongoose: `activeTravel` default `null` (nuovo e legacy), `startDate` nullable, `title` slot nullable, `registeredAdventurers` oggetti | unit | `src/models/quest-lanes.schema.spec.ts` (riscrivere), `src/models/character/active-travel.schema.spec.ts` | `npx jest src/models --selectProjects unit` | ✅ / ❌ |
| BE-TRAVEL-02 | service: `startTravel` scrive `activeTravel` (road, start, end, duration, to, kind libero) e accoda un job con jobId/delay corretti; ×2 concorrenti → 1 ok + `TRAVEL_IN_PROGRESS`; tutti i rifiuti senza scritture né job; story attiva → ok; pet `2` → metà durata; pet invalido → base + WARN; accodamento fallito → viaggio valido + WARN; preview = stessi numeri senza scritture | integration | `src/travel/travel.service.int-spec.ts` | `npx jest src/travel/travel.service.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-TRAVEL-02, D-18 | wire: `startTravel`/`travelPreview` → `{ code }` esatti; innkeeper su altrui → `FORBIDDEN`; id malformati → `NOT_FOUND`; senza bearer → `UNAUTHENTICATED`; `characterUpdated` porta `activeTravel { road { coordinates distance } startTime endTime duration to { id } }` | integration | `src/travel/travel.resolver.int-spec.ts` | idem per file | ❌ |
| BE-TRAVEL-03 | processor (Redis reale, senza `CharactersService`): job → `location` = meta, `activeTravel` `null`, una push `travelEnd` al proprietario (FakePushTransport); job duplicato/rieseguito/obsoleto (startTime diverso) → no-op; archiviato → skip + log; job prima di `endTime` → nessuna scrittura; viaggio da quest → `startDate = endTime`, nessuna push | integration | `src/travel/travel-completion.processor.int-spec.ts` | `npx jest src/travel/travel-completion.processor.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-TRAVEL-03, D-12 | sweep/reconciler con `FixedClock`: viaggio scaduto senza job completato al boot (`onApplicationBootstrap`) e da `sweep()`; non scaduto intatto; sweep e job concorrenti → una sola push; intervallo 0 → nessun timer | integration | `src/travel/travel-sweeper.int-spec.ts` | idem | ❌ |
| BE-TRAVEL-04 | teleport: in viaggio libero → `location` = POI, `activeTravel` `null`, `getJob(id).remove` chiamato (fake queue) e fallimento tollerato; `pendingQuest` → `QUEST_IN_PROGRESS` senza scritture; POI/personaggio inesistenti → `NOT_FOUND`; non-innkeeper → `FORBIDDEN`; audit `teleportCharacter` con outcome e args; nessuna push | integration | `src/travel/teleport.resolver.int-spec.ts` | idem | ❌ |
| D-02, D-03, D-06, D-21 | accettazione: standard con marker ≠ posizione → `activeTravel` (kind quest) + `startDate` `null` + job accodato; marker = posizione → nessun viaggio, `startDate` ora; senza percorso → salto (`location` = marker) + WARN; in viaggio → `TRAVEL_IN_PROGRESS` (pre-verifica e corsa nel claim); story in viaggio → `TRAVEL_IN_PROGRESS` | integration | `src/quests/acceptance/quest-acceptance.service.int-spec.ts` | `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand` | ✅ estendere |
| D-26, D-27, D-28, D-29 | story/worldMission da città diversa → ok; enemy slot `[{ null, 1 }]` ×2 concorrenti → 1 ok + `QUEST_FULL`; enemy senza slot o legacy numerico → `QUEST_NOT_ACCEPTABLE` senza scritture; worldMission `hero 1`: hero + paladin → 1 ok + `QUEST_FULL`; jolly; hunt ×2 → entrambe senza registrazione; wire `registeredAdventurers { character title }` | integration | `quest-acceptance.service.int-spec.ts`, `accept-quest.resolver.int-spec.ts` | come sopra | ✅ riscrivere |
| D-30 | `deleteCharacter` di un registrato → `$pull` da tutte le quest, un concorrente può poi registrarsi | integration | `src/characters/deletion/character-deletion.resolver.int-spec.ts` | `npx jest src/characters/deletion --selectProjects integration --runInBand` | ✅ estendere |
| D-18, D-20 | boot reale: whitelist (ownership, owner-only, innkeeper), SDL nuove righe, `startDate: DateTime`, nessun `\bparty\b`/`\bregistrations\b`/`TravelKind`; `travelPreview` e `startTravel` senza bearer → `UNAUTHENTICATED`; `schema.gql` senza drift | integration + CI | `test/app.int-spec.ts` | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --stat src/schema.gql` | ✅ estendere |
| D-24 | BACKEND-NOTES con SDL verbatim, codici, durate misurate, dati UAT, emendamenti Phase 7, note Phase 9/10 | manual review | `.planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md` | — | ❌ |

### Sampling Rate
- **Per task commit:** spec unit toccati + il singolo int-spec toccato (`--runInBand`).
- **Per wave merge:** quick run unit + integration command di fase.
- **Phase gate:** `npm run test:unit && npm run test:int` verdi (≥ 85+N unit, ≥ 49+N integrazione), `npm run build`, lint filtrato 0 righe + `npx eslint <file toccati>`, `src/schema.gql` rigenerato e committato, `git diff --exit-code src/schema.gql`; poi `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `test/fixtures/pet.fixture.ts` (`buildPet`/`persistPet` con tutti i campi non-null del filo + `speedModifier`), export in `index.ts`.
- [ ] `test/fixtures/quest.fixture.ts`: `requiredAdventurers: []`, niente `party`/`registrations`.
- [ ] `test/travel/travel-world.ts`: helper che crea POI A/B (+ città con marker) e una o più `Road` fra le loro coordinate, con `speedFactor` alto per durate di centinaia di ms, e chiama `buildGraph()`.
- [ ] `test/travel/fake-travel-queue.ts`: `{ add, getJob, process, on }` che registra i job (override di `getQueueToken('travel')`).
- [ ] `RoadsModule`: `PointOfInterest` nel `forFeature` (C3).
- [ ] Spec unit RED: `road-route.spec.ts`, `travel-speed.spec.ts`, `travel-rules.spec.ts`, `travel.updates.spec.ts`, `quest-capacity.spec.ts`.
- [ ] `test/app.int-spec.ts`: whitelist e asserzioni SDL RED.
- Framework install: nessuno.

**Manual-only:** UAT su device dopo la FE Phase 7 (conferma con ETA, interpolazione con `serverTime`, kill dell'app a metà viaggio, push di fine viaggio, teleport dal pannello admin) con i dati che l'utente prepara.

## Security Domain

### Applicable ASVS Categories (L1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | sì (indiretto) | `AuthGuard` globale deny-by-default; nessun `@Public` nuovo |
| V3 Session Management | no | invariato |
| V4 Access Control | sì | `@OwnsCharacter(…, { ownerOnly: true })` su `startTravel`/`travelPreview`; `@Roles(innkeeper)` + audit su `teleportCharacter`; whitelist enumerate nel boot reale |
| V5 Input Validation | sì | solo `id`/`poiId` dal client, validati con `isObjectIdHex`; meta ammessa, percorso, velocità, durata dal server; slot del catalogo validati (fail-closed) |
| V6 Cryptography | no | — |
| V7 Error Handling & Logging | sì | codici stabili `{ code }`; WARN con soli id (salto istantaneo, pet invalido, accodamento fallito, job obsoleto) |
| V11 Business Logic | sì | update condizionali e transazioni; completamento idempotente; un solo viaggio attivo; nessun viaggio durante `pendingQuest` |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| ETA/percorso/meta manipolati dal client | Tampering | il client manda solo `poiId`; tutto calcolato server-side; meta solo marker di città |
| Avviare/vedere viaggi di altri | Elevation / Info disclosure | owner-only, `FORBIDDEN` anche all'innkeeper; `characterUpdated` filtrato per proprietario/innkeeper (invariato) |
| Doppio click → due viaggi | Tampering | filtro `activeTravel: null` (concorrenza testata) |
| Job duplicato/rieseguito → doppio arrivo o doppia push | Tampering / Repudiation | filtro d'identità + push solo dal vincitore dell'update |
| Viaggio "eterno" per job perso (eviction Redis) | Denial of Service | reconciler al boot + sweep |
| Teleport abusivo | Elevation | `@Roles(innkeeper)` + `admin_audit_logs` |
| Overbooking delle quest registrate | Tampering | `$expr` di capienza nello stesso `findOneAndUpdate` |
| Preview come amplificatore di carico | Denial of Service | Dijkstra in memoria su 2,5 k nodi (millisecondi); autenticata e owner-only |
| Push con stato di gioco | Info disclosure | solo `travelEnd(characterId)` dal catalogo |

## Sources

### Primary (HIGH confidence)
- Codice del repo citato per `file:riga`: `src/roads/*`, `src/quests/acceptance/*`, `src/models/**`, `src/characters/characters.service.ts`, `spell-recovery.processor.ts`, `src/characters/deletion/*`, `src/authz/**`, `src/gameRules/*`, `src/push/*`, `src/eventsub/subscriptions/eventsub-subscription.manager.ts`, `src/auth/clock.ts`, `src/mongo/*`, `test/**`, `test/app.int-spec.ts`, `src/schema.gql`, `.github/workflows/ci.yml`.
- Sorgenti in `node_modules`: `graphology-shortest-path/dijkstra.js` (bidirectional), `bull/lib/queue.js` (`empty`, delay timer), `bull/lib/job.js` (`remove`), `@nestjs/bull/dist/bull.providers.js`/`bull.module.js`/`bull.explorer.js`, `graphql/type/scalars.js` (`GraphQLID`).
- Probe usa-e-getta (cancellati, albero pulito): override del token della coda Bull; DI di `RoadsModule` fuori da `MongoModule`; idratazione Mongoose di quest legacy e sotto-documento `default: null`; enum con `null`; serializzazione `ID` di un `ObjectId`.
- Script di sola lettura sul DB di sviluppo (solo aggregati numerici).
- Baseline unit misurata sul branch di fase.

### Secondary (MEDIUM confidence)
- `07-RESEARCH.md` (probe di concorrenza `$expr` su 8.0.4/8.2.6), BACKEND-NOTES 03.1 §8, 04 §7, 05 §2/§8, 07 §9.

### Tertiary (LOW confidence)
- Nessuna.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nessuna dipendenza nuova, versioni lette da `node_modules`.
- Architecture: HIGH — pattern esistenti nel repo; topologia dei moduli provata con probe.
- Dati reali: HIGH per il DB di sviluppo; da rimisurare se cambiano strade/quest o in produzione (A5).
- Pitfalls: HIGH — ognuno ha un probe o una riga di codice.

**Research date:** 2026-10-21
**Valid until:** 2026-11-20 (stack stabile; rivedere se cambiano il catalogo a DB o la rete stradale)
