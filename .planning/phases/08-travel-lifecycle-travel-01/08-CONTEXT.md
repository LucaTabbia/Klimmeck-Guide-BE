# Phase 8: Travel Lifecycle (TRAVEL-01) - Context

**Gathered:** 2026-10-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Viaggio server-autoritativo. `Character.status.activeTravel { road, startTime, endTime, duration }` su schema e subscription `characterUpdated`; mutation di viaggio libero **città → città** (`startTravel`) e query di preview ETA owner-only per il dialog di conferma FE; **avvio automatico** del viaggio verso il `markerLocation` della quest all'accettazione di una quest della corsia standard; completamento alla scadenza di `endTime` con il **DB come fonte di verità** (job Bull come trigger, reconciler al boot, sweep periodico), aggiornamento di `location`, push `travelEnd` per i soli viaggi liberi, avvio del countdown della quest **all'arrivo**; **velocità del personaggio** (base 10) modificata dal pet equipaggiato; teleport admin atomico; guard "non in viaggio" sull'accettazione quest (handoff Phase 7 §9). Sblocca la **FE Phase 7** (Travel) e tocca il contratto consumato dalla FE Phase 6 (`PendingQuest.startDate` nullable). Assorbe inoltre gli **emendamenti alla Phase 7** emersi nel discuss della FE Phase 6 dello stesso giorno (D-26..D-30): story/worldMission accettabili da qualunque città, registrazione sulla Quest anche per enemy e aid, `registeredAdventurers` con rango sul filo, slot per rango dentro `requiredAdventurers` (niente `party`, niente `registrations`), posti liberati alla cancellazione del personaggio.

Fuori dal boundary: annullamento o cambio meta di un viaggio (mai, D-05), chiusura delle quest e ritorno in città a missione finita (Phase 9), admin CRUD di pet/strade/POI, lavoro FE.

</domain>

<decisions>
## Implementation Decisions

### Mete, movimento e trigger del viaggio (BE-TRAVEL-02)
- **D-01:** Il viaggio libero (`startTravel`) ha come meta **solo il `markerLocation` di una città** esistente (`City.markerLocation`). Vale sia partendo da una città sia da un POI non-città (es. il marker di una quest): da lì il personaggio può raggiungere **qualsiasi** città. Qualunque altro POI → `TRAVEL_DESTINATION_NOT_ALLOWED`. (Conferma di Phase 7 D-10: "il viewer si sposta liberamente solo fra città".)
- **D-02:** **Accettare una quest della corsia standard** (`pendingQuest`: hunt, enemy, boss, dungeon, heal, aid, job, study — ogni tipo diverso da story/worldMission) **avvia automaticamente un viaggio** verso `infos.markerLocation` della quest, **se diverso dal POI in cui il personaggio si trova** (per Phase 7 D-10 il marker è tra i `pointsOfInterest` della città corrente, quindi è un viaggio intra-città). Marker uguale alla posizione → nessun viaggio e countdown subito. **Story e worldMission non muovono il personaggio.**
- **D-03:** Viaggio automatico **senza percorso stradale** verso il marker ("non dovrebbe esistere una possibilità simile"): **salto istantaneo** — `status.location` = marker, nessun `activeTravel`, countdown avviato subito, WARN con i soli id (quest, personaggio, POI). Il **viaggio libero** senza percorso invece **rifiuta** `TRAVEL_NO_PATH` fail-closed (nulla scritto).
- **D-04:** Rifiuti di `startTravel`: viaggio già attivo → `TRAVEL_IN_PROGRESS`; meta uguale alla posizione attuale → `TRAVEL_SAME_LOCATION`; `quests.pendingQuest` popolata → `QUEST_IN_PROGRESS` (il personaggio è impegnato finché la quest non viene risolta in Phase 9); **`activeStoryQuest` e `activeWorldMissionQuest` non bloccano** il viaggio. POI inesistente, personaggio inesistente o archiviato → `NOT_FOUND`.
- **D-05:** **Nessun annullamento né cambio meta**: un viaggio termina solo a `endTime` o col teleport dell'innkeeper. Nessuna mutation di cancel.
- **D-06:** Guard "non in viaggio" sull'accettazione quest (handoff Phase 7 §9, deferred di D-10): `acceptQuest` con `activeTravel` presente → `TRAVEL_IN_PROGRESS` (stesso codice del viaggio), sia nella pre-verifica (`classifyEligibility`) sia nel filtro del claim (`laneClaimFilter`) con il ramo in `classifyUnclaimed`.

### Durata, velocità, ETA e forma del `road` (BE-TRAVEL-01, BE-TRAVEL-02)
- **D-07:** La durata nasce dal cammino Dijkstra già esistente (`RoadsService.getShortestPath`: Σ `lengthKm / speedFactor`, ore) letta come **ore reali**: **nessuna scala globale, nessun clamp, nessuna variabile d'ambiente**. I viaggi si misurano in **ore**; la regolazione avviene solo via `Road.length`/`Road.speedFactor` a DB. *Research flag:* misurare sui dati reali le durate tipiche (città vicine, attraversata della mappa) e riportarle nel handoff; se risultano fuori scala (giorni, secondi) segnalarlo prima del planning.
- **D-08:** **Velocità del personaggio: base 10.** Il pet equipaggiato (`Character.assets.pet`, ref al catalogo `Pet`) può avere un **modificatore di velocità** in un campo **additivo e nullable** del catalogo `Pet` (es. `speedModifier: Float`; `null` = non cavalcabile = nessun bonus). Velocità = 10 × modificatore (10 se assente); **durata = durata base × 10 / velocità** (modificatore 2 → velocità 20 → metà tempo). Si applica a **tutti** i viaggi, liberi e automatici. Valorizzato a DB a mano (nessun admin CRUD). Default tecnico: modificatore ≤ 0 o non finito → trattato come assente con WARN.
- **D-09:** La velocità è **fotografata alla partenza**: `endTime` persistito è la fonte di verità; cambiare o togliere il pet durante il viaggio non ricalcola nulla.
- **D-10:** `activeTravel.road` è una **polilinea unica** del cammino (tipo dedicato, es. `TravelPath { coordinates: [[Float!]!]!, distance: Float! }`, nome a discrezione), calcolata dal percorso Dijkstra attraverso più `Road`, orientata dalla partenza alla meta, con il POI di partenza e di arrivo come estremi. `activeTravel { road, startTime: DateTime!, endTime: DateTime!, duration: Float! }` con `duration` in **millisecondi** (come `waitingTime`) e `duration = endTime − startTime`. Esporre anche la meta (es. `to: PointOfInterest`) e il tipo di viaggio (libero/quest) è additivo e a discrezione (D-14 richiede comunque di persistere il tipo).
- **D-11:** Query di **preview owner-only** (es. `travelPreview(request: { id, poiId })` → `{ duration, distance, road }`) con le **stesse regole e gli stessi codici** di `startTravel`, senza scrivere nulla: il FE la usa nel dialog di conferma (FE TRAVEL-02) e può disegnare la rotta prima di confermare. `getPath(from, to)` resta invariato.

### Completamento, reconciler e push (BE-TRAVEL-03)
- **D-12:** Trigger del completamento: **job Bull** con delay fino a `endTime` (coda dedicata) **+ reconciler al boot + sweep periodico** (es. ogni minuto, `setInterval` unref come `EventSubSubscriptionManager` di Phase 6, intervallo configurabile e `0` = off) che completano ogni `activeTravel.endTime <= now`. Il job è un trigger **idempotente**: al fire verifica che il viaggio sia ancora lo stesso (identità del viaggio: `startTime`/`endTime` o un id interno) e che il personaggio sia attivo (`activeCharacterById`, 03.1 D-06), altrimenti esce con un log senza scrivere. Un job perso (eviction Redis, blocker noto in STATE) è coperto dallo sweep; un job duplicato o rieseguito è un no-op.
- **D-13:** Completamento = **un solo update condizionale** sul `Character` (filtro: attivo, `activeTravel` uguale a quello atteso, `endTime <= now`): `status.location` = meta, `activeTravel` = `null`. Il change stream emette `characterUpdated` (nessun publish manuale). Se il viaggio era **automatico da quest**, nella **stessa unità** (transazione) scrive **`startDate = endTime pianificato`** sulla `PendingQuest` della corsia standard, se ancora nulla: il countdown non "perde" tempo per un downtime del server e il risultato è deterministico anche nel caso normale.
- **D-14:** Push **`travelEnd(characterId)`** via `PushService.sendToUser(ownerId, …)` (builder di Phase 5 D-12) **solo per i viaggi liberi** (avviati da `startTravel`), **mai** per quelli automatici da quest; best-effort dopo il commit, non blocca mai. Il tipo di viaggio (libero/quest) va quindi persistito su `activeTravel`. Il teleport non invia push.
- **D-15:** **`PendingQuest.startDate` diventa nullable sul filo** (`DateTime` invece di `DateTime!`): `null` = quest accettata, personaggio in viaggio verso il marker. Story/worldMission e quest senza viaggio (marker = posizione, o salto D-03) hanno `startDate` = ora dell'accettazione come oggi (Phase 7 D-16). Il FE parsa già `startDate` come `DateTime?` (`lib/models/pending_quest.dart`). Da comunicare nel handoff alla FE Phase 6 (countdown solo con `startDate` non nullo, prima "in viaggio") e alla FE Phase 7.

### Teleport admin (BE-TRAVEL-04)
- **D-16:** Mutation innkeeper (es. `teleportCharacter(request: { id, poiId }): CommonResponse!`) con `@Roles(innkeeper)` e audit automatico (Phase 3 D-15/D-16); meta = **qualsiasi `PointOfInterest`** esistente. **Un solo `findOneAndUpdate` condizionale** ("il filtro è la regola", Phase 4): `status.location` = POI, `activeTravel` = `null`; filtro: personaggio attivo e `quests.pendingQuest` `null`. Poi rimozione **best-effort** del job Bull (il job si auto-neutralizza comunque per D-12). Nessuna push, nessuna scrittura sulle quest.
- **D-17:** **Teleport rifiutato con `QUEST_IN_PROGRESS`** se `pendingQuest` è popolata ("il GM non può teletrasportare durante una quest attiva"; solo la corsia standard: story e worldMission non bloccano). Un viaggio libero in corso senza quest è teletrasportabile e viene cancellato. Personaggio inesistente o archiviato → `NOT_FOUND`; POI inesistente → `NOT_FOUND`.

### Ownership, codici e contratto GraphQL
- **D-18:** `startTravel` e `travelPreview` sono **owner-only** (`@OwnsCharacter(…, { ownerOnly: true })` di Phase 7 D-11/07-04): l'innkeeper su un personaggio altrui riceve `FORBIDDEN`; per muovere gli altri ha il teleport. Whitelist `EXPECTED_OWNER_ONLY_HANDLERS` e `@Roles` del boot reale aggiornate.
- **D-19:** Codici (`GameRuleException`, `extensions.code` stabile, messaggi in italiano, pattern Phase 4 D-15): `TRAVEL_IN_PROGRESS`, `TRAVEL_SAME_LOCATION`, `TRAVEL_DESTINATION_NOT_ALLOWED`, `TRAVEL_NO_PATH`, `QUEST_IN_PROGRESS`; `NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED` invariati. Nomi definitivi a discrezione del planner purché stabili e documentati nel handoff; **un rifiuto non scrive nulla**.
- **D-20:** Contratto SDL **additivo** (`CharacterStatus.activeTravel`, i tipi del viaggio e della polilinea, `Pet.speedModifier`, input/mutation/query nuove) con **tre eccezioni dichiarate** (nessun documento FE seleziona oggi questi campi): `PendingQuest.startDate` nullable (D-15), il nuovo tipo di `Quest.registeredAdventurers` (D-28) e `QuestRequirements.requiredAdventurers` da `Int!` a lista di slot con la rimozione di `party` (D-28). `src/schema.gql` rigenerato dal real-boot test e committato; il test del boot reale enumera le novità e vieta regressioni.

### Emendamenti alla Phase 7 (folded dal discuss FE Phase 6, 2026-10-21)
- **D-26:** **Story e worldMission sono accettabili da qualunque città**: il vincolo di posizione di Phase 7 D-10 (`QUEST_NOT_IN_CITY`, "in città" = marker della città o uno dei suoi `pointsOfInterest`) resta **solo per la corsia standard**. Per story/worldMission nessun controllo di città (e nessun viaggio, D-02). La pre-verifica e il filtro del claim vengono aggiornati di conseguenza; il handoff Phase 7 §2/§6 è superato su questo punto. La definizione "in città" di Phase 7 D-10 (marker della città o uno dei suoi POI) resta invariata per la corsia standard: dal POI di una quest la board FE è disabilitata (CONTEXT FE 6 D-11) e la corsia è occupata, quindi la differenza non è osservabile.
- **D-27:** **Registrazione sulla Quest anche per `enemy` e `aid`**, oltre a worldMission e boss (Phase 7 D-03): l'accettazione registra il personaggio con guard di capienza — `requirements.party` per rango se presente, altrimenti il totale `requiredAdventurers` — e chi arriva dopo riceve `QUEST_FULL`. `hunt`, `dungeon`, `job`, `heal`, `study` restano **senza registrazione né capienza** (più personaggi in contemporanea, ripetibili). Capienza = slot di `requiredAdventurers` (D-28); una quest registrata **senza slot** è un difetto di catalogo → `QUEST_NOT_ACCEPTABLE` fail-closed con WARN del solo id (come `requiredPoints` assente su story, Phase 7 D-09).
- **D-28:** **Nessun campo nuovo dove uno esistente può essere esteso** (decisione utente: "vorrei evitare che compaiano nuove voci come registrations o party"). (a) `Quest.registeredAdventurers` cambia tipo sul filo da `[String!]!` a una lista di oggetti `{ character: ID!, title: String! }`; il campo interno `registrations` di Phase 7 (D-18, C1) viene **rimosso** (una sola fonte). (b) `QuestRequirements.requiredAdventurers` cambia da `Int!` a **lista di slot `{ title: String, count: Int! }`** con `title` **nullo = qualsiasi rango** (es. enemy `[{ title: null, count: 1 }]`, worldMission `[{ title: hero, count: 5 }, { title: paladin, count: 4 }]`); il campo `party` di Phase 7 viene **rimosso** (il tipo `QuestPartySlot` può essere riusato per gli slot, con `title` nullable); totale = somma dei `count`; slot **esatti** per rango (Phase 7 D-04) invariati, uno slot `null` accoglie qualunque titolo. **Nessuna migrazione**: oggi il DB non contiene quest; il handoff documenta la forma per il catalogo scritto a mano e il boot reale verifica che `party` e `registrations` non compaiano più nello schema. I modelli FE (`QuestRequirements`, `Quest.fromJson`) vengono adeguati dalla FE Phase 6 (CONTEXT FE 6 D-12/D-14).
- **D-29:** **Regola "strappata per tutti"** (derivata dal FE, resa coerente dal BE con `QUEST_FULL`): una quest registrata è piena quando i registrati raggiungono la somma dei `count` degli slot oppure quando i posti del rango del giocatore (slot con quel `title`, più gli slot `null`) sono esauriti. **Gli esiti sono Phase 9**: successo → la quest sparisce dalla board per tutti; fallimento di enemy/hunt/boss/dungeon → registrazione liberata, quest di nuovo disponibile e **creazione automatica di una quest `aid`**; se chi accetta l'`aid` fallisce, il personaggio che aveva fallito la prima quest **muore** (archivio con `deletionReason: death`) e il secondo fallimento genera una nuova `aid`, e così via; `aid` non torna mai disponibile dopo un fallimento.
- **D-30:** **Cancellazione del personaggio con registrazioni attive:** `deleteCharacter` (routine 03.1, `CharacterDeletionService.archiveCurrentCharacter`) **libera i posti** — `$pull` del personaggio da `registeredAdventurers` di ogni quest non ancora conclusa — così la quest torna disponibile per tutti e la board torna intera. La **morte** avviene solo all'esito della quest (Phase 9) e riuserà la stessa routine. Il `PendingQuest` resta sul documento archiviato (03.1 D-10).

### Atomicità, test, tooling, handoff, branch (default tecnici)
- **D-21 (default tecnico):** Avvio del viaggio libero: letture lean fuori dalla scrittura (personaggio con `status.location`, `assets.pet` → `speedModifier`, POI meta, città che lo ha come marker, percorso dal grafo in memoria); scrittura = **un solo `findOneAndUpdate` condizionale** sul `Character` (filtro: attivo, `activeTravel` `null`, `quests.pendingQuest` `null`, `status.location` uguale allo snapshot) che imposta `activeTravel`; poi `queue.add` con delay. Se l'accodamento fallisce il viaggio resta valido (boot/sweep lo completano): WARN, nessuna compensazione. **Viaggio automatico:** `QuestAcceptanceService.accept` (Phase 7) viene **esteso, non duplicato**: percorso e velocità calcolati prima della transazione; il claim della corsia e `activeTravel` scritti nello **stesso update** del `Character`, nella stessa transazione del `PendingQuest` (con `startDate` `null`) e del debito; job accodato dopo il commit. `RoadsService` (grafo in memoria, `onModuleInit`) diventa una dipendenza del modulo viaggio e dell'accettazione; ogni filtro sul personaggio usa `activeCharacterById`.
- **D-22 (default tecnico):** **TDD.** Unit sui moduli puri: velocità/durata dal pet (null, 1, 2, valori invalidi), polilinea dal cammino (orientamento, estremi, più strade), regole di meta e rifiuto, builder di filtri/update, selezione dei viaggi scaduti. Integration sul replica set (`createAuthTestApp`/`createCharactersTestApp`, fixture `persistCharacter`/`persistCity`/`persistQuest`/`persistUser` + fixture `Road`/`Pet` nuove): `startTravel` ×2 concorrenti → un solo `activeTravel`; meta non città → `TRAVEL_DESTINATION_NOT_ALLOWED`; stessa posizione → `TRAVEL_SAME_LOCATION`; `pendingQuest` attiva → `QUEST_IN_PROGRESS`; story attiva → il viaggio riesce; `acceptQuest` standard con marker diverso → `activeTravel` + `startDate` `null`, fire del job → `location` = marker, `startDate` = `endTime`, **nessuna** push; `acceptQuest` con marker = posizione → nessun viaggio, `startDate` valorizzato; `acceptQuest` senza percorso → salto istantaneo + WARN; `acceptQuest` in viaggio → `TRAVEL_IN_PROGRESS`; viaggio libero completato → una push `travelEnd` (FakePushTransport) al proprietario; reconciler al boot completa un viaggio scaduto; sweep completa un viaggio con job perso; job duplicato/rieseguito/obsoleto → no-op; personaggio archiviato → job skip con log; teleport con `pendingQuest` → `QUEST_IN_PROGRESS`; teleport in viaggio libero → `activeTravel` `null`, `location` = POI, job neutralizzato, audit scritto; innkeeper su `startTravel` altrui → `FORBIDDEN`; **emendamenti Phase 7:** story accettata da una città diversa da quella del marker → riesce; enemy con `requiredAdventurers: [{ title: null, count: 1 }]` accettata da due personaggi → 1 successo + 1 `QUEST_FULL`, `registeredAdventurers` sul filo `[{ character, title }]`; enemy registrata senza slot → `QUEST_NOT_ACCEPTABLE` senza scritture; worldMission con slot `hero 1`: hero + paladin → 1 successo + `QUEST_FULL`; `deleteCharacter` di un registrato → posto liberato; `party` e `registrations` assenti dallo schema; hunt accettata da due personaggi → entrambe riescono senza registrazione; sul filo `characterUpdated` porta `activeTravel { road { coordinates distance } startTime endTime duration }` e poi `null`; real boot: whitelist aggiornate, SDL additivo salvo `startDate`. Processor test senza `CharactersService` (nessun change stream aperto), attesa del job via polling del documento (Phase 1 D-06).
- **D-23 (default tecnico):** Tooling (Phase 7 D-20): `npx prettier --write <file>` + `npx eslint <file>` solo sui file toccati; percorsi jest prima di `--selectProjects`, integration con `--runInBand`; gate CI: lint, build, unit, integration, `git diff --exit-code src/schema.gql`.
- **D-24 (default tecnico):** Handoff **`BACKEND-NOTES.md`** di fase per la **FE Phase 7** (e una nota esplicita per la FE Phase 6 su `startDate` nullable): SDL verbatim, semantica (città-only, viaggio automatico da quest, salto istantaneo, pet e velocità), tabella dei codici con l'azione FE, forma della preview e del dialog, interpolazione `(now + offset − startTime) / duration` sulla polilinea con `serverTime` (Phase 7 D-15), push solo per i viaggi liberi, durate tipiche misurate (D-07), dati a DB per la UAT (pet con `speedModifier`, `speedFactor` delle strade, città e marker), la sezione "Emendamenti alla Phase 7" (D-26..D-30: città, registrazione enemy/aid, nuovi tipi di `registeredAdventurers` e `requiredAdventurers` a slot con esempi, regola "strappata per tutti", posti liberati alla cancellazione), note per la BE Phase 9 (fine quest: la corsia svuotata sblocca viaggio e teleport; ritorno in città = viaggio libero scelto dal giocatore; esiti, quest `aid` automatiche e morte, D-29) e per la Phase 10 (indici).
- **D-25 (default tecnico):** Branch **`feat/08-travel-lifecycle-travel-01`** da `develop` (template `feat/{phase}-{slug}`; la riga Branch della ROADMAP `feat/08-travel-lifecycle` va allineata), PR a `develop`. Nessuna dipendenza da una PR FE.

### Claude's Discretion
- Nomi e collocazione: modulo (es. `src/travel/`), tipi (`ActiveTravel`, `TravelPath`), operazioni (`travelPreview`, `startTravel`, `teleportCharacter`), campo `Pet.speedModifier`, nome della coda Bull, nomi definitivi dei codici e messaggi in italiano.
- Esporre su `activeTravel` la meta (`to`) e il tipo di viaggio; campo interno vs esposto.
- Identità del job Bull (jobId deterministico vs id interno del viaggio persistito) e rimozione best-effort nel teleport; intervallo dello sweep e sua configurazione (env opzionale con default).
- Ordine di valutazione dei rifiuti e quali guard riaffermare nel filtro dell'update.
- Come comporre `RoadsService` con `QuestAcceptanceService` (import del modulo, port astratta); come esporre la polilinea dal grafo (riuso di `getShortestPath` esteso vs funzione nuova).
- Split in wave: contratto schema (`activeTravel`, `startDate` nullable, `Pet.speedModifier`, tipi) nella prima wave, così la FE Phase 7 può partire sullo schema.

</decisions>

<specifics>
## Specific Ideas

- "Il giocatore può spostarsi liberamente solo di città in città. Quando accetta una quest in una città parte in automatico il viaggio verso la markerLocation di quella quest (se diverso dal POI della città). Quando un personaggio si trova su un markerLocation che non è una città, può spostarsi liberamente verso qualsiasi città. Se il personaggio ha già un viaggio attivo, allora non può iniziarne un altro. Se un personaggio ha una pendingQuest attiva, allora non può spostarsi liberamente. Può farlo solo a quest conclusa."
- "Tutta la corsia standard se porta verso un markerLocation diverso da quello della città stessa."
- "Non dovrebbe esistere una possibilità simile [nessun percorso verso il marker]. Nel caso il viaggio avviene istantaneamente."
- "Il pet equipaggiato dovrebbe avere un modificatore di velocità (parametro nullabile nel caso in cui non possa essere usato come cavalcatura). La velocità del personaggio base dovrebbe essere 10, se l'animale ha velocità 2 allora la velocità del personaggio è 20."
- Durata in **ore** reali: "Ore"; scala solo dallo `speedFactor` delle strade.
- "Il GM non può teletrasportare durante una quest attiva" (solo `pendingQuest`).
- Dal discuss FE Phase 6 (stesso giorno): "le missioni story e worldMission sono accettabili in tutte le città"; "Quest ha registeredAdventurers. Quando il numero di registeredAdventurers raggiunge lo stesso numero di requiredAdventurers allora la quest risulta strappata. Se la quest accetta più di un avventuriero, se il tuo rango è completo allora vedrai la scheda strappata, altrimenti intera. […] si poteva modificare registeredAdventurers in modo da essere un array di oggetti contenenti rango e ids. La quest aid viene creata in automatico quando una quest enemy, hunt, boss o dungeon fallisce per un utente. A quel punto la quest torna disponibile e compare anche la quest di aid. Se chi accetta la quest di aid fallisce, il personaggio che ha fallito la prima quest muore (e viene quindi cancellato), mentre il secondo che ha fallito farà scattare una nuova quest di aid e così via."; registrano worldMission, boss, enemy, aid.
- "Vorrei evitare che compaiano nuove voci come registrations o party. Comunque anche QuestPartySlot può essere contenuto dentro requiredAdventurers, così come registrations può essere registeredAdventurers." / "Non abbiamo missioni nel DB attualmente." / "Il personaggio muore solo quando la quest riceve il risultato. Se l'utente cancella il proprio personaggio mentre è in una quest, allora la quest torna disponibile per tutti."

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap, requisiti, progetto
- `.planning/ROADMAP.md` §"Phase 8: Travel Lifecycle (TRAVEL-01)" — goal, success criteria 1–4, dipendenze (Phase 4, 5), branch; §"Backend ↔ Frontend alignment" (FE Phase 7 bloccata da TRAVEL-01).
- `.planning/REQUIREMENTS.md` — BE-TRAVEL-01..04.
- `.planning/PROJECT.md` — core value (fonte di verità server-side), decisione "Bull + Redis per job differiti", "Backend fonte di verità (ETA viaggi)".
- `.planning/STATE.md` — decisione "[Phase 8]: il DB (`endTime` persistito) è la fonte di verità dei timer viaggio; il job Bull è solo un trigger + reconciler al boot"; blocker "policy Redis prod (eviction dei delayed job Bull)".

### Fasi precedenti (decisioni vincolanti)
- `.planning/phases/07-quest-lanes-quest-04/07-CONTEXT.md` — D-01 corsie, D-10 "in città" e movimento solo fra città, D-11 owner-only, D-13 populate, D-15 `serverTime`, D-16/D-17 tempi (`startDate`, `waitingTime`), D-18 transazione di accettazione.
- `.planning/phases/07-quest-lanes-quest-04/BACKEND-NOTES.md` — §1 contratto, §3 corsie/tempi, §4 populate, §5 `serverTime`, §9 note per la Phase 8 (guard "non in viaggio" in `laneClaimFilter`/`classifyEligibility`/`classifyUnclaimed`).
- `.planning/phases/05-infrastruttura-push-fcm/05-CONTEXT.md` — D-08 invio best-effort, D-10 data message, D-11 TTL, D-12 builder `travelEnd(characterId)`.
- `.planning/phases/05-infrastruttura-push-fcm/BACKEND-NOTES.md` — §2 payload `travelEnd`, uso di `PushService` dalle fasi di dominio.
- `.planning/phases/04-integrita-economica-atomics/04-CONTEXT.md` — D-10 "un singolo update condizionale", D-13/D-14 pattern job Bull + compensazione, D-19 topologia (update a documento singolo prima delle transazioni).
- `.planning/phases/04-integrita-economica-atomics/BACKEND-NOTES.md` — §7 nota Phase 8 ("il filtro è la regola", `objectIdFromHex`/`requireCharacterObjectId`, `activeCharacterById`).
- `.planning/phases/03-autorizzazione-ownership-ruoli-audit/03-CONTEXT.md` — D-09 bypass innkeeper (non applicato qui), D-12 `@Roles`, D-15/D-16 audit automatico delle mutation admin.
- `.planning/phases/03.1-character-deletion-contract/03.1-CONTEXT.md` — D-06 archiviati invisibili a job e resolver, D-10 archivio anche in viaggio.
- `.planning/phases/03.1-character-deletion-contract/BACKEND-NOTES.md` — §8 regola per i job delle Phase 7/8 (`ACTIVE_CHARACTER_FILTER`, mai `findById`).
- `.planning/phases/06-eventsub-punti-canale-streamer-live/06-CONTEXT.md` — pattern del manager con `setInterval` unref, single-flight e `onModuleDestroy` (modello per lo sweep).
- `.planning/phases/01-fondazione-test-consolidamento-spell-wip/01-CONTEXT.md` — D-05/D-06 harness Bull (Redis effimero, attesa job via polling, processor test senza change stream).

### Lato FE (consumatore)
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/.planning/phases/06-quest-accept-info-sheets/06-CONTEXT.md` — D-11/D-12 (board solo in città, story del titolo esatto, regola "strappata per tutti" e per il proprietario), D-14 (fragment e selezioni, `registeredAdventurers { character title }`, `requiredAdventurers { title count }`), D-15 (stato "In viaggio" con `startDate` nullo), D-16 (lockstep con questa fase).
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/.planning/ROADMAP.md` §"Phase 7: Travel" — success criteria FE (conferma con ETA dal BE, interpolazione su `road.coordinates`, snap alla nuova `location`, ricostruzione dopo kill) e §"Phase 6" (countdown su `startDate + waitingTime`).
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/.planning/REQUIREMENTS.md` — TRAVEL-01..04, QUEST-07.
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/lib/models/pending_quest.dart` — `startDate` già `DateTime?` (compatibile con D-15).
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/lib/graphql/fragments/character_fragment.dart` — `statusFields`/`questsFields` oggi selezionati dal FE.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/roads/roads.service.ts` — grafo graphology (nodi = coordinate arrotondate, archi con `weight`, `roadId`, `lengthKm`, `speedFactor`), `dijkstra.bidirectional`, snap al nodo più vicino (`MAX_SNAP_DISTANCE_KM` 5), `getShortestPath(fromPoiId, toPoiId)` → `{ distance, time }` in km/ore; il cammino (lista di nodi) è già disponibile internamente: da esporre come polilinea (D-10).
- `src/roads/roads.resolver.ts` — `getPath(from, to): PathResponse` (resta invariato, D-11).
- `src/push/push-events.ts` — builder `travelEnd(characterId)` (titolo "Viaggio completato", TTL 1 h); `src/push/push.service.ts` — `sendToUser(userId, message)` best-effort.
- `src/characters/spell-recovery.processor.ts` + `scheduleRecovery` in `characters.service.ts` — pattern Bull: `queue.add(name, data, { delay, jobId, removeOnComplete })`, processor idempotente con update condizionale, skip con WARN su id malformati/personaggio assente.
- `src/quests/acceptance/` — `quest-acceptance.service.ts` (pre-letture → regole pure → transazione claim), `quest-acceptance.updates.ts` (`laneClaimFilter`, `classifyUnclaimed`), `quest-eligibility`/`classifyEligibility`: punto di innesto di D-02/D-06/D-21.
- `src/models/character/active-character.filter.ts` — `ACTIVE_CHARACTER_FILTER`, `activeCharacterById`; `src/mongo/document-id.ts` (`objectIdFromHex`), `src/characters/character-id.ts` (`requireCharacterObjectId`).
- `src/authz/` — `@OwnsCharacter(selectId, { ownerOnly: true })`, `@Roles(RoleType.innkeeper)`, audit interceptor automatico.
- `src/auth/clock.ts` — `Clock`/`SystemClock` (già usato da `ServerTimeModule`): da usare per `startTime`/`endTime` e per lo sweep nei test.
- `src/gameRules/` — `GameRuleException` + `GameRuleErrorCode` per i nuovi codici.
- `src/eventsub/` — `EventSubSubscriptionManager`: `setInterval` unref, single-flight, `onModuleDestroy` (modello per lo sweep D-12).
- Harness test: `test/harness` (`createAuthTestApp`, `createCharactersTestApp`), `test/fixtures` (`persistCharacter`, `persistCity`, `persistQuest`, `persistUser`), `test/characters/characters-change-stream.ts` (`primeCharactersChangeStream`), `FakePushTransport`.

### Established Patterns
- Schema = classe unica `@ObjectType` + `@Schema` (`src/models/character/character-status.model.ts`: `location` è `Types.ObjectId | PointOfInterest`, popolato in `findOne` con `populate({ path: 'status.location' })`); i ref `@Prop({ type: Types.ObjectId })` sono `Mixed` → passare sempre `Types.ObjectId` nei filtri.
- Scritture = un solo `findOneAndUpdate` condizionale ("il filtro è la regola"); transazioni solo per più documenti (accettazione quest + PendingQuest + wallet).
- Real-time = change stream `characters` → `pubSub.publish('characterUpdated')`; nessun publish manuale nei service; `characterUpdated` filtrato per proprietario/innkeeper con snapshot alla subscribe.
- Codici stabili in `extensions.code` con messaggi italiani; whitelist enumerate nel real-boot test (`test/app.int-spec.ts`), `src/schema.gql` committato e verificato in CI.
- `PendingQuest` popolato con `quest { id }` soltanto (`CHARACTER_QUESTS_POPULATE`).

### Integration Points
- `CharacterStatus` (+ `CharacterStatusInput`?) ← `activeTravel` (nuovo sotto-documento `_id: false`, default `null`); `PendingQuest.startDate` → nullable; `Pet` ← `speedModifier`; `QuestRequirements` ← `requiredAdventurers` a slot (`party` rimosso); `Quest` ← `registeredAdventurers` a oggetti (`registrations` rimosso); `CharacterDeletionService` ← rilascio delle registrazioni (D-30).
- `CharactersModule`/`AppModule` ← nuovo modulo viaggio (service, resolver owner-only, resolver/mutation innkeeper del teleport, processor Bull, reconciler/sweep `onModuleInit`/`onModuleDestroy`), `BullModule.registerQueue` dedicata, dipendenze: `RoadsModule` (grafo), `PushModule`, `AuthzModule`, `Clock`.
- `QuestAcceptanceService.accept` ← calcolo percorso/velocità + scrittura `activeTravel` nello stesso claim + `startDate` `null` + accodamento del job dopo il commit; guard `TRAVEL_IN_PROGRESS`.
- `test/app.int-spec.ts` ← whitelist owner-only/roles e asserzioni SDL; `createCharactersTestApp` ← registrazione di `Road`/`Pet`/`PointOfInterest`/`City` se il populate o il grafo li richiedono.

</code_context>

<deferred>
## Deferred Ideas

- **Fine quest e ritorno in città (Phase 9):** a missione risolta la corsia si svuota (sblocca viaggio libero e teleport, D-04/D-17); il personaggio sul marker sceglie una città con un viaggio libero. Nota per la Phase 9: completamento/rifiuto del GM con `startDate` ancora nullo (quest "in viaggio") va definito lì.
- **Esiti delle quest registrate (Phase 9, da D-29):** successo → la quest sparisce per tutti (serve un marcatore globale sulla Quest o la rimozione dalla lista `quests`); fallimento → registrazione liberata e quest `aid` generata automaticamente; catena aid → morte del personaggio (`deletionReason: death`, 03.1 D-12).
- **Velocità base come attributo del personaggio** (bonus da titolo, oggetti, magie): futuro; oggi costante 10 in un modulo puro.
- **Admin CRUD di pet (`speedModifier`), strade (`speedFactor`) e POI:** fuori milestone; dati a DB.
- **Ricalcolo dell'ETA al cambio pet in viaggio:** escluso (D-09).
- **Annullamento o cambio meta del viaggio:** escluso by design (D-05), non in backlog.
- **Push per i viaggi automatici da quest:** escluso (D-14).
- **Query dedicata dei viaggi per l'admin panel (BE-ADMIN-01, Phase 9):** `activeTravel` arriva già su `characters`/`characterUpdated` dell'innkeeper.
- **Indice su `status.activeTravel.endTime`** per lo sweep: Phase 10 se i volumi lo richiedono (oggi pochi personaggi).

</deferred>

---

*Phase: 08-travel-lifecycle-travel-01*
*Context gathered: 2026-10-21*
