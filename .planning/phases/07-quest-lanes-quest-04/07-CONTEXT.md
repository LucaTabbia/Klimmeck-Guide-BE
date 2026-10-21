# Phase 7: Quest Lanes (QUEST-04) - Context

**Gathered:** 2026-10-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Consegnare le **corsie quest parallele** sul backend: `Character.quests` espone `activeStoryQuest` e `activeWorldMissionQuest` (oltre al `pendingQuest` esistente) su schema GraphQL e payload di `characterUpdated`; una mutation `acceptQuest` lane-aware monta sopra la primitiva single-flight di Phase 4 l'eleggibilità e il cost model **server-side** (punti canale per story/worldMission, nessuna quest costa monete); il `PendingQuest` è emesso con `startDate`/`waitingTime` del server e una query `serverTime` ancora il countdown del FE. Sblocca la **FE Phase 6** (QUEST-04/05/07).

Perché tre corsie (decisione utente): le code separate permettono al game master di vedere a colpo d'occhio chi attende cosa, e al viewer di non restare bloccato in attesa che il GM esegua la missione in live. Storia del personaggio (story), storia del mondo (worldMission) e missioni private (`pendingQuest`) avanzano in parallelo senza entrare in conflitto.

In scope: BE-QUEST-01 (campi su schema + subscription), BE-QUEST-02 (accettazione lane-aware, una corsia occupata rifiuta solo la propria tipologia), BE-QUEST-03 (emendato: solo story/worldMission debitano punti canale; eleggibilità server-side: città, titolo, non ripetibilità, capienza del party per rango), BE-QUEST-04 (timestamp server-side + `serverTime`), handoff `BACKEND-NOTES.md` per la FE Phase 6.

Fuori dal boundary: la **fine** di una quest (scadenza del countdown, `questEnd`, svuotamento della corsia, `completedQuests`, progressione del titolo, rimborso al rifiuto) e la coda del GM con complete/reject → Phase 9; la guard "non in viaggio" e `activeTravel` → Phase 8; l'admin CRUD delle quest (party, `requiredPoints`) → fuori milestone; l'annullamento di una quest da parte del viewer → non in roadmap (vedi Deferred).

</domain>

<decisions>
## Implementation Decisions

### Corsie e modello (BE-QUEST-01, BE-QUEST-02)
- **D-01:** Tre corsie indipendenti su `Character.quests` (`CharacterQuests`): `pendingQuest` (già esistente: ospita **tutte** le quest con `infos.type` diverso da `story`/`worldMission`, **boss inclusa**), `activeStoryQuest` e `activeWorldMissionQuest` (nuovi, `PendingQuest` nullable con `default: null`, accanto a `completedQuests`/`pendingQuest`; `CharacterQuestsInput` esteso allo stesso modo). La corsia si sceglie dal **tipo della quest letto dal catalogo**, mai da un argomento del client. Una corsia occupata rifiuta **solo la propria tipologia** con `QUEST_SLOT_BUSY`; le altre due restano accettabili (story + hunt in parallelo riesce; seconda story mentre una è attiva → `QUEST_SLOT_BUSY`). Un personaggio può avere tutte e tre le corsie occupate.
- **D-02:** **Nessun campo stato sul `PendingQuest`.** Story e worldMission sono richieste che attendono di essere **eseguite dal GM durante le live**: il GM vede chi ha fatto la richiesta (corsia popolata), la esegue e la segna come completata (Phase 9). Prima del completamento esiste un solo stato possibile, quindi non si modella.
- **D-03:** **Story = quest per un singolo personaggio**: nessuna capienza, nessuna scrittura su `Quest.registeredAdventurers` (le 5 story del catalogo sono le stesse riusate da tutti gli utenti). **worldMission e boss sono le uniche quest condivise** fra più avventurieri: l'accettazione aggiunge l'id del personaggio a `Quest.registeredAdventurers` (atomico, senza duplicati; il campo resta `[String!]!` sul wire con gli id dei personaggi). Per le altre tipologie `registeredAdventurers` non viene toccato.
- **D-04:** **Party per rango modellato in questa fase**: campo **additivo** sul Quest (es. `requirements.party: [{ title: TitleType, count: Int }]`, nome/forma a discrezione del planner) che descrive quanti avventurieri per titolo servono (es. 5 hero + 4 paladin); `requiredAdventurers` resta il totale (derivato o coerente, a discrezione). **Slot esatti**: il personaggio occupa solo lo slot del proprio `status.title`; rango pieno, o rango assente dal party → `QUEST_FULL`. Nessun riempimento "verso il basso" (un hero non copre un posto da paladin). Default tecnico per i dati legacy senza party: capienza = `requiredAdventurers` totale senza vincolo di rango se > 0, altrimenti nessun limite.
- **D-05:** **Non ripetibili**: `story`, `worldMission`, `enemy`, `boss`, `aid` → `QUEST_ALREADY_TAKEN` se la quest è già in `completedQuests` del personaggio o, per le condivise, se il personaggio è già in `registeredAdventurers`. `hunt`, `dungeon`, `heal`, `job`, `study` (e `crime`/`guard`, fuori scope v1) sono ripetibili dopo il completamento.
- **D-06:** **Scala progressiva delle story**: una story quest è eleggibile solo con **titolo esatto** (`status.title === requirements.minTitle`: il rookie fa la story che lo rende adventurer, l'adventurer quella da paladin, poi mage, hero, legend; niente salti né ritorni). Per tutte le altre tipologie vale `status.title >= minTitle` nell'ordine dell'enum `TitleType` (rookie < adventurer < paladin < mage < hero < legend); `minTitle` assente → nessun vincolo. Rifiuto `QUEST_TITLE_MISMATCH`. La **progressione del titolo** al completamento della story è Phase 9.
- **D-07:** **Rimborso al rifiuto del GM** (Phase 9): il `PendingQuest` memorizza il costo pagato in un campo additivo `pointsSpent: Int` (0 per le quest senza costo), esposto sullo schema, così il rimborso usa la cifra realmente pagata e non un catalogo che potrebbe essere cambiato.

### Cost model ed eleggibilità (BE-QUEST-03, emendato nel discuss)
- **D-08:** **Nessuna quest costa monete**: l'accettazione non debita mai `Character.coins` (`applyCharacterCoinsDelta` esce dal percorso di accettazione). `recommendedLoot` resta un suggerimento display-only. BE-QUEST-03 e il criterio 3 della ROADMAP sono emendati in questo discuss; il FE emenderà QUEST-05 nel proprio discuss di Phase 6 (nota nel handoff).
- **D-09:** **Story/worldMission costano `requirements.requiredPoints` punti canale** dell'**utente proprietario** del personaggio (`WalletService.debitUserPoints` → `INSUFFICIENT_POINTS`), nella stessa transazione del claim della corsia. `requiredPoints` è **obbligatorio e intero positivo** per story/worldMission ("non possono esistere" senza costo: le worldMission le crea il GM personalmente, le 5 story hanno un costo fisso): se nullo, 0 o non intero il BE **rifiuta fail-closed** con un codice di catalogo (es. `QUEST_NOT_ACCEPTABLE`, "Missione non disponibile", nome a discrezione) e logga WARN con il solo id della quest. Per le altre tipologie `requiredPoints` viene ignorato (nessun debito). Ogni avventuriero di una worldMission paga il proprio `requiredPoints`.
- **D-10:** **Vincolo di posizione**: la quest è accettabile solo se il personaggio si trova **nella città che contiene il `markerLocation` della quest nei propri `pointsOfInterest`**. "In città" = `status.location` uguale al `markerLocation` della città **o** a uno dei suoi `pointsOfInterest` (default tecnico; la research verifica sui dati reali se i marker delle quest stanno in `City.pointsOfInterest` e se il marker della città vi compare). Nessuna città contiene il marker → `QUEST_NOT_IN_CITY` (fail-closed). Contesto utente: il viewer si sposta liberamente **solo fra città** (ogni città ha POI di influenza); accettata la quest il personaggio si sposta verso il punto della missione e, a missione finita, sceglie una città; oggi il FE riporta già la pedina alla città della sua area. **Nessun vincolo sul viaggio** in questa fase: `activeTravel` arriva con la Phase 8, che aggiungerà la guard "non in viaggio" allo stesso filtro.
- **D-11:** **Solo il proprietario accetta**: `acceptQuest` è l'eccezione al bypass innkeeper di Phase 3 D-09. Il chiamante deve avere `currentCharacter === request.id`; l'innkeeper su un personaggio altrui riceve `FORBIDDEN` come chiunque (nessun bypass, quindi nessun audit on-behalf). Forma del guard (variante strict di `@OwnsCharacter`, es. opzione `allowInnkeeper: false` o decorator dedicato) a discrezione del planner, purché la whitelist del boot reale la enumeri.

### Contratto GraphQL (BE-QUEST-01, BE-QUEST-04)
- **D-12:** `acceptQuest(request: AcceptQuestRequest!): CommonResponse!` con `input AcceptQuestRequest { id: String!, questId: String! }` (`id` = characterId come nelle altre request del personaggio). **Nessun ritorno del `PendingQuest`**: la subscription `characterUpdated` è sempre attiva nel FE e porta la corsia popolata; `userUpdated` porta il nuovo saldo punti. Id malformati → `NOT_FOUND` senza accesso al DB (pattern Phase 4). Montata nel resolver scelto dal planner (`QuestsResolver` o `CharactersResolver`).
- **D-13:** **Populate "solo il PendingQuest"**: `character(id)` e `characterUpdated` popolano `quests.pendingQuest`, `quests.activeStoryQuest`, `quests.activeWorldMissionQuest` con il documento `PendingQuest` (`id`, `startDate`, `waitingTime`, `pointsSpent`) ma **non** con i dettagli della `quest`: il FE seleziona solo `quest { id }` e risolve la quest dalla board già caricata o con `quest(id)`. Il planner sceglie come rendere `quest { id }` risolvibile senza populate completo (populate con proiezione `_id` o resolve field); oggi `pendingQuest` non è popolato affatto e `pendingQuest { id }` con valore non nullo non è mai stato esercitato sul wire (gap da chiudere con un test). `completedQuests` invariato.
- **D-14:** **Codici di rifiuto** (`GameRuleException`, `extensions.code` stabile, messaggi in italiano): `QUEST_SLOT_BUSY` (esistente, unico per tutte le corsie: il FE sa quale corsia dal tipo della quest), nuovi `QUEST_FULL` (party pieno per il rango), `QUEST_ALREADY_TAKEN` (non ripetibile), `QUEST_TITLE_MISMATCH` (titolo non eleggibile), `QUEST_NOT_IN_CITY` (posizione), il codice di catalogo di D-09; `INSUFFICIENT_POINTS` (esistente: punti canale insufficienti); `NOT_FOUND` (quest o personaggio), `FORBIDDEN`, `UNAUTHENTICATED` invariati. Messaggi e ordine di valutazione a discrezione, purché **un rifiuto non scriva nulla** (nessun PendingQuest orfano, nessun debito, nessuna registrazione).
- **D-15:** Nuova query **`serverTime: DateTime!`** autenticata (nessuna `@Public`): ora del server in ISO 8601. Il FE calcola l'offset device↔server al bootstrap e al resume e lo applica al countdown (QUEST-07) e, in FE Phase 7, al viaggio. Nessun `serverTime` dentro il payload delle entità.

### Tempi (BE-QUEST-04)
- **D-16:** `startDate` = ora del server alla scrittura (già nella primitiva). `waitingTime` in **millisecondi** (come legge il FE): `infos.timeToComplete ?? 0` per le quest della corsia standard (quest senza durata = istantanea, countdown già scaduto); **sempre 0 per story/worldMission** (non può esistere un tempo fissato: dipendono dalla presenza e disponibilità del GM in live; `timeToComplete` non si applica). Tipo sul wire invariato (`Float`).
- **D-17:** **Nessuna azione alla scadenza** di `startDate + waitingTime`: nessun job, nessun timer; la corsia resta popolata finché la Phase 9 non risolve la quest (`questEnd`, `completedQuests`, svuotamento). Il FE mostra il countdown a zero.

### Atomicità, test, tooling, handoff, branch (default tecnici)
- **D-18 (default tecnico):** Accettazione **tutto-o-niente** in una `connection.transaction` (Phase 4 D-09/D-19, documenti multipli): claim condizionale della corsia sul `Character` (`null` → `_id` pre-generato, con le guard esprimibili nel filtro: attivo, corsia libera), insert del `PendingQuest`, per le condivise update condizionale sul `Quest` (`$addToSet` di `registeredAdventurers` + guard di capienza per rango, es. `$expr` sul conteggio per titolo), debito punti sullo User proprietario via `WalletService.debitUserPoints(session)`. Le verifiche non esprimibili nel filtro (posizione, titolo, ripetibilità) si fanno prima della transazione su letture lean e si **riaffermano** dove possibile nel filtro di scrittura; riletture leggere solo per scegliere il codice (fail-closed). `QuestAcceptanceService.accept` di Phase 4 viene **generalizzato** (corsia + costo in punti) e non duplicato; `WalletService` resta l'unico scrittore dei saldi.
- **D-19 (default tecnico):** **TDD.** Unit sui classificatori puri: corsia per tipo, confronto titoli (esatto per story, `>=` altrove), ripetibilità per tipo, capienza per rango, `waitingTime` per tipo, validazione `requiredPoints`. Integration sul replica set (`createAuthTestApp`/`createCharactersTestApp`, fixture `persistCharacter`/`persistQuest`/`persistCity`/`persistUser`): 3 `accept` concorrenti sulla stessa corsia → 1 `PendingQuest`, 1 debito, 2 `QUEST_SLOT_BUSY`; story + hunt in parallelo → entrambe riescono; seconda story → `QUEST_SLOT_BUSY`; punti insufficienti → `INSUFFICIENT_POINTS` senza `PendingQuest` né registrazione; worldMission con party 1 hero: due hero concorrenti → 1 successo + 1 `QUEST_FULL`, un paladin → `QUEST_FULL`; story già completata → `QUEST_ALREADY_TAKEN`; titolo sbagliato → `QUEST_TITLE_MISMATCH`; fuori città → `QUEST_NOT_IN_CITY`; story senza `requiredPoints` → rifiuto di catalogo senza scritture; innkeeper su personaggio altrui → `FORBIDDEN`; sul wire: `acceptQuest` → `characterUpdated` emette con la corsia popolata e `pendingQuest { id startDate waitingTime pointsSpent quest { id } }` risolvibile; `serverTime` risponde un ISO entro pochi secondi dal clock del test; boot reale `test/app.int-spec.ts`: whitelist ownership/roles aggiornata, `src/schema.gql` con diff **solo additivo**.
- **D-20 (default tecnico):** Tooling (02.1 D-14 / 04 D-18 / 06 D-18): `npx prettier --write <file>` + `npx eslint <file>` solo sui file toccati (mai `npm run lint`); percorsi jest **prima** di `--selectProjects`; gate CI: lint, build, unit, integration, `git diff --exit-code src/schema.gql` (rigenerato dal real-boot test e committato).
- **D-21 (default tecnico):** Handoff **`BACKEND-NOTES.md`** di fase per la FE Phase 6: SDL additivo verbatim (campi su `CharacterQuests`, `PendingQuest.pointsSpent`, party sul Quest, `AcceptQuestRequest`, `acceptQuest`, `serverTime`), tabella dei codici con l'azione FE, regola di populate (`quest { id }` soltanto), uso di `serverTime` per l'offset, emendamento di FE QUEST-05 (nessun costo in monete, solo `requiredPoints` per story/worldMission), campi utili alla board per nascondere/disabilitare (party + `registeredAdventurers`, `minTitle`, `requiredPoints`, corsie popolate), dati a DB da preparare per la UAT (story con `requiredPoints` e `minTitle` a scala, worldMission con party, città con `pointsOfInterest` che includono i marker delle quest), note per la Phase 9 (complete/reject con rimborso di `pointsSpent`, progressione titolo).
- **D-22 (default tecnico):** Branch **`feat/07-quest-lanes-quest-04`** da `develop` (template `feat/{phase}-{slug}`; la riga Branch della ROADMAP `feat/07-quest-lanes` è stata allineata in questo discuss), PR a `develop`. Nessuna dipendenza da una PR FE: la FE Phase 6 consuma lo schema dopo la merge.

### Claude's Discretion
- Nomi e collocazione: dove montare `acceptQuest` (`QuestsResolver` vs `CharactersResolver`), se `QuestAcceptanceModule` resti separato o rientri in `QuestsModule`, nome del campo party e del codice di catalogo di D-09, messaggi in italiano dei nuovi codici.
- Forma della variante owner-only del guard di ownership (D-11) e come esporre `quest { id }` senza populate completo (D-13).
- Ordine dei controlli di eleggibilità e quali guard riaffermare nel filtro della transazione (D-18); strategia per la capienza per rango (`$expr` sul conteggio vs documento di registrazione per rango).
- Se `requiredAdventurers` resti un campo scritto a mano o diventi derivato dal party; se la validazione del catalogo (`requiredPoints`, party) venga anche loggata da un verifier di boot non bloccante (pattern Phase 2/5).
- Split in wave e ordine dei plan (contratto schema + serverTime prima, così la FE Phase 6 può partire sullo schema).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope e requisiti
- `.planning/ROADMAP.md` — Phase 7 (goal, criteri di successo 1–4 con il criterio 3 emendato, dipendenze Phase 3/4, sblocco FE Phase 6).
- `.planning/REQUIREMENTS.md` — BE-QUEST-01..04 (BE-QUEST-03 emendato il 2026-10-21: nessun costo in monete).
- `.planning/PROJECT.md` — core value (nessun client altera uno stato che non gli appartiene; ogni valore è calcolato server-side), vincolo single channel / unico innkeeper, Key Decisions di Phase 3/4.

### Decisioni precedenti su cui si costruisce
- `.planning/phases/04-integrita-economica-atomics/04-CONTEXT.md` — D-02/D-03/D-04 (WalletService unico scrittore, `debitUserPoints`), **D-09** (primitiva single-flight da generalizzare), D-15 (codici `GameRuleException`), D-17/D-18/D-19 (test di concorrenza, tooling, transazioni solo multi-documento).
- `.planning/phases/04-integrita-economica-atomics/BACKEND-NOTES.md` — §2 tabella codici (`QUEST_SLOT_BUSY`, `INSUFFICIENT_POINTS`, `NOT_FOUND`), §7 primitive per le fasi successive.
- `.planning/phases/03-autorizzazione-ownership-ruoli-audit/03-CONTEXT.md` — D-04/D-05 (`characterUpdated` con snapshot), D-09 (bypass innkeeper: **eccezione** in D-11 di questa fase), D-10 (`pendingQuest(id)` risolto dal personaggio del bearer), D-15/D-16 (convenzione admin e audit).
- `.planning/phases/03.1-character-deletion-contract/03.1-CONTEXT.md` — `ACTIVE_CHARACTER_FILTER` / `activeCharacterById` in ogni filtro di scrittura.
- `.planning/phases/05-infrastruttura-push-fcm/05-CONTEXT.md` — D-12 (`questEnd(pendingQuestId)` esiste; il trigger è Phase 9, non questa fase).
- `.planning/phases/02.1-character-creation-contract/02.1-CONTEXT.md` — starting location = `markerLocation` di una città (il personaggio nasce "in città", D-10).

### Lato FE (consumatore)
- `../../Klimmeck-Guide/.planning/REQUIREMENTS.md` — QUEST-01..07 (QUEST-04 campi, QUEST-05 da emendare, QUEST-06 codici, QUEST-07 countdown ancorato al server), ADMIN-02/03.
- `../../Klimmeck-Guide/.planning/ROADMAP.md` — FE Phase 6 (prerequisito BE, criteri 3/4/5).
- `../../Klimmeck-Guide/.planning/phases/03-real-time-sync-foundation/BACKEND-NOTES.md` — il fragment `CharacterFragment.fullFields` resta senza i nuovi campi finché la FE Phase 6 non li aggiunge.
- `../../Klimmeck-Guide/lib/graphql/fragments/character_fragment.dart`, `lib/models/pending_quest.dart`, `lib/models/quest/quest_requirements.dart`, `lib/shared/components/popup/quest_info_sheet.dart` — cosa legge oggi il FE (`pendingQuest { id }`, `waitingTime` in ms, `requiredPoints` mostrato in scheda).

### Codice da leggere
- `src/quests/acceptance/quest-acceptance.service.ts`, `quest-acceptance.module.ts`, `quest-acceptance.service.int-spec.ts` — la primitiva e i suoi test di concorrenza.
- `src/economy/wallet.service.ts` — `debitUserPoints(userId, amount, session)`.
- `src/gameRules/game-rule-error-code.enum.ts`, `game-rule.exception.ts` — dove aggiungere i codici.
- `src/models/character/character-quests.model.ts`, `src/models/pending-quest.model.ts`, `src/models/quest/quest.model.ts`, `quest-requirements.model.ts`, `quest-infos.model.ts`, `src/models/enums/quest-type.enum.ts`, `title-type.enum.ts`, `src/models/city.model.ts`, `src/models/user.model.ts`.
- `src/authz/ownership/ownership.decorators.ts`, `ownership.guard.ts`, `character-access.policy.ts` — guard da estendere in modalità owner-only.
- `src/characters/characters.service.ts` (`findOne` e change stream → `characterUpdated`), `characters.resolver.ts`, `src/quests/quests.resolver.ts`, `src/pendingQuests/*`.
- `src/characters/creation/starting-location.service.ts` — come si leggono le città e i marker.
- `test/app.int-spec.ts` — whitelist degli handler e rigenerazione di `src/schema.gql`; `test/` harness e fixture (`persistQuest`, `persistCity`, `persistCharacter`, `persistUser`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `QuestAcceptanceService.accept(characterId, questId, costCopper)` — transazione claim-then-insert sullo slot `quests.pendingQuest` con `QUEST_SLOT_BUSY`/`NOT_FOUND`, `startDate` del server e `waitingTimeOf(quest)`; da generalizzare a corsia + costo in punti (D-18), il parametro `costCopper` sparisce (D-08).
- `WalletService.debitUserPoints` (session-aware, `INSUFFICIENT_POINTS`/`NOT_FOUND`), `GameRuleException` + `GameRuleErrorCode`, `ResourceNotFoundException`, `formatDomainError`.
- `@OwnsCharacter` + `OwnershipGuard` + `CharacterAccessPolicy.readCurrentCharacterId` (lookup `User.currentCharacter`) — base per la variante owner-only e per risolvere lo User proprietario da debitare.
- `activeCharacterById` / `ACTIVE_CHARACTER_FILTER`; change stream `characters` + `subscribeWithSnapshot` (nessuna modifica necessaria: i nuovi campi viaggiano nello stesso documento).
- Harness: `createAuthTestApp`, `createCharactersTestApp` (con `AuthzModule`), `createAuthenticatedUser(role)`, fixture `persistQuest`, `persistCity` (con POI reale come `markerLocation`), `persistCharacter`, `persistUser`; `Promise.all` per la concorrenza (Phase 4).
- `isObjectIdHex` / `documentIdOf` per gli id malformati.

### Established Patterns
- Mutation giocatore protette nel resolver da un guard di ownership; il service riceve id già autorizzati (Phase 3).
- Update condizionali a documento singolo ovunque possibile; transazione solo multi-documento; il filtro è la regola, rilettura leggera solo per scegliere il codice (Phase 4).
- Ogni rifiuto è un `GameRuleException` con `extensions.code` stabile e messaggio italiano; `errors[0].extensions` è esattamente `{ code }`.
- Schema code-first rigenerato dal real-boot test e committato; il gate CI fallisce su drift.
- Handoff per-fase `BACKEND-NOTES.md`: nomi copiati dal codice, "lo schema vince sul documento".

### Integration Points
- `src/models/character/character-quests.model.ts` (+ input) — i due nuovi campi; `src/models/pending-quest.model.ts` — `pointsSpent`; `src/models/quest/quest-requirements.model.ts` (+ input) — party per rango.
- `src/gameRules/*` — nuovi codici; `src/quests/acceptance/*` — logica lane-aware; resolver per `acceptQuest`; nuovo resolver/service per `serverTime`.
- `src/characters/characters.service.ts` `findOne` — populate delle tre corsie (solo PendingQuest).
- `src/authz/ownership/*` — variante owner-only.
- `test/app.int-spec.ts` — whitelist e schema; `src/schema.gql` — diff additivo; `.planning/phases/07-quest-lanes-quest-04/BACKEND-NOTES.md` — handoff.

### Gaps found during scouting
- `quests.pendingQuest` non è popolato in `findOne`: il FE legge `pendingQuest { id }` ma un valore non nullo non è mai passato sul wire (verificare che `id` risolva su un ObjectId non popolato; D-13).
- `Quest.registeredAdventurers: [String]` non è mai scritto da nessun service; il FE lo parsa come `List<Character>` ma non lo seleziona nella query `quests` (nessuna rottura se resta `[String]`).
- `Quest.requirements.requiredPoints` è nullable e `requiredAdventurers` è un semplice intero: nessun campo party; il catalogo a DB va aggiornato a mano (nessun admin CRUD).
- `City.pointsOfInterest` è una lista di id (default `[]`); `relatedLore` non è ancora valorizzato a DB (dato, non codice). Nessun indice su `pointsOfInterest`.
- Nessuna mutation quest esiste oggi; `QuestAcceptanceModule` è montato in `AppModule` senza resolver.
- Il FE mostra "Punti canale richiesti: 3000 / N" con un 3000 hard-coded: il saldo reale arriva da `userUpdated`.

</code_context>

<specifics>
## Specific Ideas

- "Le code per story e worldMission separate servono a me per visualizzare più facilmente chi è in attesa di cosa, ma servono anche per non bloccare l'esperienza di gioco dell'utente [...] la storia di un personaggio può proseguire, così come la storia del mondo, così come le missioni private di un utente, senza andare in conflitto le une con le altre."
- "Le story sono quest per un singolo utente, le worldMission e le missioni boss invece sono condivise fra più avventurieri [...] poter specificare la quantità di avventurieri di un rango rispetto ad un altro. Ad esempio 5 eroi, 4 paladini."
- "Story è progressivo. Tutti fanno prima una quest avventurieri, poi paladino, poi mago, poi eroe, poi leggenda. Ognuna di queste fa progredire il personaggio al titolo successivo."
- "Le worldMission vengono create da me personalmente, mentre le missioni story sono le stesse 5 riutilizzate per tutti gli utenti e hanno un costo fisso."
- "L'utente può solo spostarsi liberamente da una città all'altra, ogni città ha dei POI di influenza. Le missioni che appaiono in quei POI possono essere accettate solo in quella città."
- "Io non posso accettare missioni per conto di qualcun altro."
- "Le story e le worldMission avranno sempre settato il waitingTime a 0 [...] dipendono dalla mia presenza e disponibilità in live."

</specifics>

<deferred>
## Deferred Ideas

- **Fine quest e coda del GM (Phase 9):** scadenza del countdown, push `questEnd`, svuotamento della corsia, `completedQuests`, progressione del titolo al completamento della story, **complete/reject** del GM con rimborso di `pointsSpent` al rifiuto. Nota per il discuss di Phase 9: BE-ADMIN-02 parla di "approve/reject", la semantica emersa qui è "esegui in live e segna come completata, oppure rifiuta con rimborso".
- **Guard "non in viaggio" sull'accettazione (Phase 8):** quando esisterà `activeTravel`, aggiungerlo al filtro di D-10/D-18.
- **Admin CRUD delle quest** (party per rango, `requiredPoints`, `minTitle`): fuori milestone; finché non esiste il catalogo si aggiorna a DB.
- **`registeredAdventurers` come `[Character]`** (o resolve field) per la vista live del GM: Phase 9 / BE-ADMIN-01.
- **Annullamento/abbandono di una quest da parte del viewer** (libera la corsia, nessun rimborso?): non in roadmap, backlog.
- **FE QUEST-05 da emendare** (nessun costo in monete; `recommendedLoot` solo suggerimento): discuss FE Phase 6, via handoff.
- **Dati a DB:** `City.relatedLore` da valorizzare (nota utente); verifica che i marker delle quest siano nei `pointsOfInterest` delle città.
- **Gating di story/worldMission sullo stato live dello streamer** (Phase 6 registra `stream.online`): idea non discussa, backlog se interessa.

</deferred>

---

*Phase: 07-quest-lanes-quest-04*
*Context gathered: 2026-10-21*
