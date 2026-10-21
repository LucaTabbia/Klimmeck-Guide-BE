# Phase 7: Quest Lanes (QUEST-04) - Research

**Researched:** 2026-10-21
**Domain:** corsie quest parallele su `Character.quests`, accettazione lane-aware in una transazione Mongo multi-documento (Mongoose 8.18.1 / mongod 8.0.4 e 8.2.6 su replica set), capienza del party per rango con guard atomica `$expr`, populate parziale per GraphQL code-first (NestJS 11.1.6, @nestjs/graphql 13.2.0, graphql 16.11.0), guard di ownership owner-only, query `serverTime`
**Confidence:** HIGH. Le quattro forme che potevano cambiare il piano sono state misurate con spec usa-e-getta (cancellate) sul harness reale: guard di capienza per rango sotto concorrenza (8.0.4 e 8.2.6), transazione claim → registrazione → insert → debito con zero scritture al rifiuto, `pendingQuest { id … quest { id } }` sul filo con e senza populate, `serverTime: DateTime!` con l'`AuthGuard` globale. I dati reali (DB di sviluppo su Atlas, lettura sola, soli conteggi) confermano il modello città/POI di D-10.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Corsie e modello (BE-QUEST-01, BE-QUEST-02)
- **D-01:** Tre corsie indipendenti su `Character.quests` (`CharacterQuests`): `pendingQuest` (già esistente: ospita **tutte** le quest con `infos.type` diverso da `story`/`worldMission`, **boss inclusa**), `activeStoryQuest` e `activeWorldMissionQuest` (nuovi, `PendingQuest` nullable con `default: null`, accanto a `completedQuests`/`pendingQuest`; `CharacterQuestsInput` esteso allo stesso modo). La corsia si sceglie dal **tipo della quest letto dal catalogo**, mai da un argomento del client. Una corsia occupata rifiuta **solo la propria tipologia** con `QUEST_SLOT_BUSY`; le altre due restano accettabili (story + hunt in parallelo riesce; seconda story mentre una è attiva → `QUEST_SLOT_BUSY`). Un personaggio può avere tutte e tre le corsie occupate.
- **D-02:** **Nessun campo stato sul `PendingQuest`.** Story e worldMission sono richieste che attendono di essere **eseguite dal GM durante le live**: il GM vede chi ha fatto la richiesta (corsia popolata), la esegue e la segna come completata (Phase 9). Prima del completamento esiste un solo stato possibile, quindi non si modella.
- **D-03:** **Story = quest per un singolo personaggio**: nessuna capienza, nessuna scrittura su `Quest.registeredAdventurers` (le 5 story del catalogo sono le stesse riusate da tutti gli utenti). **worldMission e boss sono le uniche quest condivise** fra più avventurieri: l'accettazione aggiunge l'id del personaggio a `Quest.registeredAdventurers` (atomico, senza duplicati; il campo resta `[String!]!` sul wire con gli id dei personaggi). Per le altre tipologie `registeredAdventurers` non viene toccato.
- **D-04:** **Party per rango modellato in questa fase**: campo **additivo** sul Quest (es. `requirements.party: [{ title: TitleType, count: Int }]`, nome/forma a discrezione del planner) che descrive quanti avventurieri per titolo servono (es. 5 hero + 4 paladin); `requiredAdventurers` resta il totale (derivato o coerente, a discrezione). **Slot esatti**: il personaggio occupa solo lo slot del proprio `status.title`; rango pieno, o rango assente dal party → `QUEST_FULL`. Nessun riempimento "verso il basso" (un hero non copre un posto da paladin). Default tecnico per i dati legacy senza party: capienza = `requiredAdventurers` totale senza vincolo di rango se > 0, altrimenti nessun limite.
- **D-05:** **Non ripetibili**: `story`, `worldMission`, `enemy`, `boss`, `aid` → `QUEST_ALREADY_TAKEN` se la quest è già in `completedQuests` del personaggio o, per le condivise, se il personaggio è già in `registeredAdventurers`. `hunt`, `dungeon`, `heal`, `job`, `study` (e `crime`/`guard`, fuori scope v1) sono ripetibili dopo il completamento.
- **D-06:** **Scala progressiva delle story**: una story quest è eleggibile solo con **titolo esatto** (`status.title === requirements.minTitle`: il rookie fa la story che lo rende adventurer, l'adventurer quella da paladin, poi mage, hero, legend; niente salti né ritorni). Per tutte le altre tipologie vale `status.title >= minTitle` nell'ordine dell'enum `TitleType` (rookie < adventurer < paladin < mage < hero < legend); `minTitle` assente → nessun vincolo. Rifiuto `QUEST_TITLE_MISMATCH`. La **progressione del titolo** al completamento della story è Phase 9.
- **D-07:** **Rimborso al rifiuto del GM** (Phase 9): il `PendingQuest` memorizza il costo pagato in un campo additivo `pointsSpent: Int` (0 per le quest senza costo), esposto sullo schema, così il rimborso usa la cifra realmente pagata e non un catalogo che potrebbe essere cambiato.

#### Cost model ed eleggibilità (BE-QUEST-03, emendato nel discuss)
- **D-08:** **Nessuna quest costa monete**: l'accettazione non debita mai `Character.coins` (`applyCharacterCoinsDelta` esce dal percorso di accettazione). `recommendedLoot` resta un suggerimento display-only. BE-QUEST-03 e il criterio 3 della ROADMAP sono emendati in questo discuss; il FE emenderà QUEST-05 nel proprio discuss di Phase 6 (nota nel handoff).
- **D-09:** **Story/worldMission costano `requirements.requiredPoints` punti canale** dell'**utente proprietario** del personaggio (`WalletService.debitUserPoints` → `INSUFFICIENT_POINTS`), nella stessa transazione del claim della corsia. `requiredPoints` è **obbligatorio e intero positivo** per story/worldMission ("non possono esistere" senza costo: le worldMission le crea il GM personalmente, le 5 story hanno un costo fisso): se nullo, 0 o non intero il BE **rifiuta fail-closed** con un codice di catalogo (es. `QUEST_NOT_ACCEPTABLE`, "Missione non disponibile", nome a discrezione) e logga WARN con il solo id della quest. Per le altre tipologie `requiredPoints` viene ignorato (nessun debito). Ogni avventuriero di una worldMission paga il proprio `requiredPoints`.
- **D-10:** **Vincolo di posizione**: la quest è accettabile solo se il personaggio si trova **nella città che contiene il `markerLocation` della quest nei propri `pointsOfInterest`**. "In città" = `status.location` uguale al `markerLocation` della città **o** a uno dei suoi `pointsOfInterest` (default tecnico; la research verifica sui dati reali se i marker delle quest stanno in `City.pointsOfInterest` e se il marker della città vi compare). Nessuna città contiene il marker → `QUEST_NOT_IN_CITY` (fail-closed). Contesto utente: il viewer si sposta liberamente **solo fra città** (ogni città ha POI di influenza); accettata la quest il personaggio si sposta verso il punto della missione e, a missione finita, sceglie una città; oggi il FE riporta già la pedina alla città della sua area. **Nessun vincolo sul viaggio** in questa fase: `activeTravel` arriva con la Phase 8, che aggiungerà la guard "non in viaggio" allo stesso filtro.
- **D-11:** **Solo il proprietario accetta**: `acceptQuest` è l'eccezione al bypass innkeeper di Phase 3 D-09. Il chiamante deve avere `currentCharacter === request.id`; l'innkeeper su un personaggio altrui riceve `FORBIDDEN` come chiunque (nessun bypass, quindi nessun audit on-behalf). Forma del guard (variante strict di `@OwnsCharacter`, es. opzione `allowInnkeeper: false` o decorator dedicato) a discrezione del planner, purché la whitelist del boot reale la enumeri.

#### Contratto GraphQL (BE-QUEST-01, BE-QUEST-04)
- **D-12:** `acceptQuest(request: AcceptQuestRequest!): CommonResponse!` con `input AcceptQuestRequest { id: String!, questId: String! }` (`id` = characterId come nelle altre request del personaggio). **Nessun ritorno del `PendingQuest`**: la subscription `characterUpdated` è sempre attiva nel FE e porta la corsia popolata; `userUpdated` porta il nuovo saldo punti. Id malformati → `NOT_FOUND` senza accesso al DB (pattern Phase 4). Montata nel resolver scelto dal planner (`QuestsResolver` o `CharactersResolver`).
- **D-13:** **Populate "solo il PendingQuest"**: `character(id)` e `characterUpdated` popolano `quests.pendingQuest`, `quests.activeStoryQuest`, `quests.activeWorldMissionQuest` con il documento `PendingQuest` (`id`, `startDate`, `waitingTime`, `pointsSpent`) ma **non** con i dettagli della `quest`: il FE seleziona solo `quest { id }` e risolve la quest dalla board già caricata o con `quest(id)`. Il planner sceglie come rendere `quest { id }` risolvibile senza populate completo (populate con proiezione `_id` o resolve field); oggi `pendingQuest` non è popolato affatto e `pendingQuest { id }` con valore non nullo non è mai stato esercitato sul wire (gap da chiudere con un test). `completedQuests` invariato.
- **D-14:** **Codici di rifiuto** (`GameRuleException`, `extensions.code` stabile, messaggi in italiano): `QUEST_SLOT_BUSY` (esistente, unico per tutte le corsie: il FE sa quale corsia dal tipo della quest), nuovi `QUEST_FULL` (party pieno per il rango), `QUEST_ALREADY_TAKEN` (non ripetibile), `QUEST_TITLE_MISMATCH` (titolo non eleggibile), `QUEST_NOT_IN_CITY` (posizione), il codice di catalogo di D-09; `INSUFFICIENT_POINTS` (esistente: punti canale insufficienti); `NOT_FOUND` (quest o personaggio), `FORBIDDEN`, `UNAUTHENTICATED` invariati. Messaggi e ordine di valutazione a discrezione, purché **un rifiuto non scriva nulla** (nessun PendingQuest orfano, nessun debito, nessuna registrazione).
- **D-15:** Nuova query **`serverTime: DateTime!`** autenticata (nessuna `@Public`): ora del server in ISO 8601. Il FE calcola l'offset device↔server al bootstrap e al resume e lo applica al countdown (QUEST-07) e, in FE Phase 7, al viaggio. Nessun `serverTime` dentro il payload delle entità.

#### Tempi (BE-QUEST-04)
- **D-16:** `startDate` = ora del server alla scrittura (già nella primitiva). `waitingTime` in **millisecondi** (come legge il FE): `infos.timeToComplete ?? 0` per le quest della corsia standard (quest senza durata = istantanea, countdown già scaduto); **sempre 0 per story/worldMission** (non può esistere un tempo fissato: dipendono dalla presenza e disponibilità del GM in live; `timeToComplete` non si applica). Tipo sul wire invariato (`Float`).
- **D-17:** **Nessuna azione alla scadenza** di `startDate + waitingTime`: nessun job, nessun timer; la corsia resta popolata finché la Phase 9 non risolve la quest (`questEnd`, `completedQuests`, svuotamento). Il FE mostra il countdown a zero.

#### Atomicità, test, tooling, handoff, branch (default tecnici)
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

### Deferred Ideas (OUT OF SCOPE)
- **Fine quest e coda del GM (Phase 9):** scadenza del countdown, push `questEnd`, svuotamento della corsia, `completedQuests`, progressione del titolo al completamento della story, **complete/reject** del GM con rimborso di `pointsSpent` al rifiuto. Nota per il discuss di Phase 9: BE-ADMIN-02 parla di "approve/reject", la semantica emersa qui è "esegui in live e segna come completata, oppure rifiuta con rimborso".
- **Guard "non in viaggio" sull'accettazione (Phase 8):** quando esisterà `activeTravel`, aggiungerlo al filtro di D-10/D-18.
- **Admin CRUD delle quest** (party per rango, `requiredPoints`, `minTitle`): fuori milestone; finché non esiste il catalogo si aggiorna a DB.
- **`registeredAdventurers` come `[Character]`** (o resolve field) per la vista live del GM: Phase 9 / BE-ADMIN-01.
- **Annullamento/abbandono di una quest da parte del viewer** (libera la corsia, nessun rimborso?): non in roadmap, backlog.
- **FE QUEST-05 da emendare** (nessun costo in monete; `recommendedLoot` solo suggerimento): discuss FE Phase 6, via handoff.
- **Dati a DB:** `City.relatedLore` da valorizzare (nota utente); verifica che i marker delle quest siano nei `pointsOfInterest` delle città.
- **Gating di story/worldMission sullo stato live dello streamer** (Phase 6 registra `stream.online`): idea non discussa, backlog se interessa.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-QUEST-01 | `Character` espone `activeStoryQuest` e `activeWorldMissionQuest` (PendingQuest opzionali, indipendenti da `pendingQuest`) su schema GraphQL e payload della subscription | Q3 (probe sul filo: senza populate `pendingQuest { id }` **fallisce oggi** con `ID cannot represent value: Buffer`; populate annidato con `select: '_id'` risolve `id/startDate/waitingTime/quest { id }`; change stream e snapshot passano entrambi da `findOne`), Q8 (SDL additivo), Code Example §3 |
| BE-QUEST-02 | Accettazione lane-aware: story/worldMission convivono col `pendingQuest` standard; una corsia occupata rifiuta solo la propria tipologia | Q2 (claim sul path scelto da `laneOf(type)`, filtro con guard riaffermate), Q1 (probe: 3 accept concorrenti dello stesso personaggio → 1 ok + 2 `QUEST_SLOT_BUSY`, 1 debito, 1 PendingQuest), Q5 (owner-only), Code Example §1–§2 |
| BE-QUEST-03 (emendato) | story/worldMission debitano `User.twitchPoints` (`requiredPoints`), nessuna quest debita `Character.coins`; eleggibilità (città, titolo, non ripetibilità, capienza per rango) e debito server-side | Q1 (registrazioni con titolo + `$expr`, provata su 8.0.4 e 8.2.6: 20 round × 4 hero per 1 slot → sempre 1 vincitore; 20 × 5 hero per 2 slot → sempre 2), Q2 (debito su `identity.userId` nella stessa sessione; `INSUFFICIENT_POINTS` → corsia `null`, 0 registrazioni, 0 PendingQuest), Q4 (query città su dati reali), Q7 (classificatori puri) |
| BE-QUEST-04 | `pendingQuest` emesso con `startDate` + `waitingTime` server-side | Q7 (`waitingTimeOf(lane, timeToComplete)`: 0 per story/worldMission), Q6 (`serverTime: DateTime!` provato: ISO, delta 2 ms, `UNAUTHENTICATED` senza bearer) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Stack fisso NestJS 11 + Mongoose 8 + Apollo code-first + Bull/ioredis. **Nessuna dipendenza nuova** in questa fase (tutto si fa con Mongoose/driver già installati).
- **TDD obbligatorio** (Red → Green → Refactor): classificatori puri prima, poi integration RED sul replica set, poi implementazione. Le whitelist di `test/app.int-spec.ts` diventano RED prima di decorare il resolver.
- Clean Code, SoC, Boy Scout Rule: i file modello toccati non sono Prettier-clean alla baseline (vedi Pitfall 10); il resolver non contiene logica (ownership nel guard, regole nei moduli puri, scritture nel service).
- Conventional Commits con scope `phase-7`; la memoria utente vieta il trailer `Co-Authored-By`.
- Tooling: `npx prettier --write <file>` e `npx eslint <file>` **solo** sui file toccati; mai `npm run lint`; jest con i percorsi **prima** di `--selectProjects`, integrazione `--runInBand`.
- Branch + PR verso `develop` (mai push su `develop`/`main`). Contratti GraphQL esistenti invariati: `src/schema.gql` con diff **solo additivo**.
- Il backend è la fonte di verità: corsia, costo, eleggibilità, `startDate`, `waitingTime` calcolati server-side; nessun valore del client usato come regola (il client manda solo `id` e `questId`).
- Nessun secret in repo (nessuna variabile d'ambiente nuova in questa fase).
- Le modifiche passano dal workflow GSD (`/gsd-execute-phase`).

## Summary

Tutte le decisioni del CONTEXT sono implementabili. La ricerca ha misurato quattro forme e due **sorprese** cambiano dettagli del piano (non le decisioni):

1. **`pendingQuest { id }` è rotto oggi sul filo.** I ref `@Prop({ type: Types.ObjectId })` sono `Mixed` (probe: `CharacterQuestsSchema.path('pendingQuest').instance === 'Mixed'`), quindi un `pendingQuest` non popolato arriva al resolver come `ObjectId` di bson, il cui getter `id` restituisce il **Buffer** dei 12 byte: GraphQL risponde `ID cannot represent value: { type: "Buffer" … }` con `INTERNAL_SERVER_ERROR` e azzera il campo. Popolare solo `quests.pendingQuest` sposta il problema su `quest { id }` (stesso errore, e `quest: Quest!` non-null azzera l'intero `pendingQuest`). **Il populate annidato `populate: { path: 'quest', model: 'Quest', select: '_id' }` risolve tutto** (`id`, `startDate`, `waitingTime`, `quest { id }`); un ref orfano diventa `null` senza errori. Stessa trappola, peggiore, su `completedQuests { id }`: con un solo elemento il `Character` intero diventa `data: null` (il fragment FE seleziona già `completedQuests { id }`) [VERIFIED: probe sul harness].
2. **`registeredAdventurers: [String]` non porta il titolo**, quindi la capienza per rango non è esprimibile su quel campo. La forma raccomandata è un campo **interno** `Quest.registrations: [{ character: ObjectId, title }]` (nessun `@Field`, wire invariato) scritto nello **stesso** `findOneAndUpdate` di `registeredAdventurers` (`$push` + `$addToSet`), con guard `$expr` sul conteggio per titolo. Sotto concorrenza dentro `connection.transaction`: 20 round × 4 hero per 1 slot → **20 vincitori, 60 `QUEST_FULL`**, 1 registrazione e 1 PendingQuest per round; 20 × 5 hero per 2 slot → sempre 2 vincitori e 2 debiti; identico su mongod **8.0.4** (pin CI) e **8.2.6**. Il callback è rieseguito al più 2 volte (WriteConflict ritentato dal driver) [VERIFIED: probe].

Dati reali (DB di sviluppo, lettura sola, soli conteggi): 167 città, **il `markerLocation` di ogni città è dentro i suoi `pointsOfInterest` (167/167)**, nessun POI appartiene a due città, i 4 marker delle quest stanno ciascuno nei `pointsOfInterest` di una sola città e **mai** coincidono con un marker di città, `POI.city` è coerente con le liste (4/4), tutti i ref sono `ObjectId`. Nel catalogo esistono solo 4 quest (`worldMission` 5000 punti con `requiredAdventurers: 1`, `enemy` 3000, `job`, `heal`), **nessuna story** e nessun party: la UAT richiede dati da preparare [VERIFIED: script di sola lettura].

**Primary recommendation:** generalizzare `QuestAcceptanceService.accept({ ownerId, characterId, questId })` con tre moduli puri in `src/quests/acceptance/` (`quest-lanes.ts`, `quest-eligibility.ts`, `quest-acceptance.updates.ts`), pre-letture lean fuori transazione e transazione `claim corsia (guard riaffermate) → registrazione condivisa con $expr → insert PendingQuest → debitUserPoints(session)`; esporre `acceptQuest` da un nuovo `QuestAcceptanceResolver` nello stesso modulo con `@OwnsCharacter(selectId, { ownerOnly: true })`; popolare le tre corsie (e `completedQuests`) con proiezione `_id` della quest in un'unica costante usata da `findOne`; `serverTime` in un `ServerTimeModule` minimo con `Clock` locale.

## Conflitti con il CONTEXT

Nessuna decisione è smentita; questi sono raffinamenti che il planner deve recepire.

| # | Decisione | Fatto trovato | Rimedio consigliato |
|---|---|---|---|
| C1 | D-18 "guard di capienza per rango, es. `$expr` sul conteggio per titolo" su `registeredAdventurers` | `registeredAdventurers` è `[String]` di id (`quest.model.ts:26-28`): nessun titolo da contare | Campo interno `registrations: [{ character, title }]` sul Quest (senza `@Field`), sincronizzato con `registeredAdventurers` nello stesso update (Q1). Emendamento a D-18 sotto. |
| C2 | D-13 "`completedQuests` invariato" | Con `completedQuests` non vuoto e non popolato, `character { quests { completedQuests { id } } }` risponde `data: null` (Buffer) — il fragment FE (`character_fragment.dart:75-78`) lo seleziona già. In Phase 7 nessun codice scrive `completedQuests`, ma i test di `QUEST_ALREADY_TAKEN` lo seminano e la Phase 9 lo scriverà | Popolare anche `quests.completedQuests` con `select: '_id'` (contenuto e tipo invariati). Emendamento minimo a D-13 sotto. |
| C3 | D-13 elenca solo `character(id)` e `characterUpdated` | `characters` (innkeeper, `characters.service.ts:116-118`) non popola nulla: stessa rottura per il GM appena una corsia è piena | Usare la stessa costante di populate anche in `findAll` (Boy Scout, una riga). |
| C4 | D-11 / Phase 3 D-10 | `CharacterAccessPolicy.readOwnPendingQuestId` (`character-access.policy.ts:135-149`) guarda solo `quests.pendingQuest`: il proprietario di una story/worldMission riceve `FORBIDDEN` su `pendingQuest(id)` della propria corsia | Estendere la proiezione alle tre corsie (owner se l'id è uno dei tre). Additivo, test nell'int-spec esistente. |
| C5 | Test boot reale | `test/app.int-spec.ts:282-292` asserisce `not.toMatch(/acceptQuest|QuestAcceptance|…/)` | Riscrivere il test in positivo (`acceptQuest(request: AcceptQuestRequest!): CommonResponse!`, `serverTime: DateTime!`) mantenendo i divieti `QuestAcceptance|twitchPointsDebit|INSUFFICIENT_FUNDS|registrations`. |
| C6 | Harness | `createCharactersTestApp` (`test/authz/characters-test-app.ts:33-40`) non registra `PendingQuest` né `Quest`: col populate `findOne` lancerebbe `MissingSchemaError` in tutte le suite che lo usano | Wave 0: aggiungere `PendingQuest` e `Quest` al `forFeature` dell'harness **e** di `CharactersModule` (in produzione `MongoModule` globale li registra già, `mongo.module.ts:32-45`). |

## Answers to the research questions

### Q1 — Capienza per rango atomica (D-03, D-04, D-18) — HIGH (empirico)

**Opzioni valutate:**

| Opzione | Esito |
|---|---|
| (a) `$expr` su `registeredAdventurers` | **Impossibile**: il campo contiene solo id stringa, nessun titolo. Un `$lookup` non è usabile nel filtro di un update. |
| (b) Registrazioni con titolo sul Quest (`registrations: [{ character, title }]`) + `registeredAdventurers` sincronizzato | **Raccomandata.** Un solo documento ⇒ il filtro e l'update sono atomici; dentro la transazione i concorrenti sullo stesso Quest vanno in WriteConflict, il driver riesegue il callback, il filtro rivalutato non matcha più ⇒ `QUEST_FULL`. Wire invariato. La Phase 9 sa chi togliere e da quale rango (`$pull: { registrations: { character } }, $pull: { registeredAdventurers: hex }`). |
| (b') Contatori per rango (`requirements.party.$.taken` con `$inc` posizionale e guard `$elemMatch: { title, taken: { $lt: count } }`) | Atomica anche lei, ma mescola stato runtime nei requisiti di catalogo e perde *chi* occupa lo slot (serve comunque `registeredAdventurers`); in Phase 9 il rilascio richiederebbe di conoscere il titolo al momento dell'iscrizione. Scartata. |
| (c) Collection di registrazione con indice unico `(quest, character)` | L'unicità è gratis, ma il **conteggio** su più documenti non è atomico: servirebbe comunque un contatore sul Quest ⇒ ricade in (b)/(b') con una collection in più. Scartata. |

**Forma provata** (spec usa-e-getta, cancellato; mongod 8.0.4 e 8.2.6, `MongoMemoryReplSet` del harness):

```ts
// filtro del Quest dentro la session
{
    _id: questId,
    'registrations.character': { $ne: characterId },       // anti-duplicato (riafferma D-05 per le condivise)
    registeredAdventurers: { $ne: characterId.toHexString() },
    $expr: { $lt: [ takenCount, limit ] },                 // takenCount per rango o totale, limit dalla pre-lettura
}
// update
{
    $push: { registrations: { character: characterId, title } },
    $addToSet: { registeredAdventurers: characterId.toHexString() },
}
// takenCount per rango
{ $size: { $filter: { input: { $ifNull: ['$registrations', []] }, as: 'r', cond: { $eq: ['$$r.title', title] } } } }
// takenCount totale (legacy)
{ $size: { $ifNull: ['$registrations', []] } }
```

Misure: 4 hero concorrenti su `party [{hero,1},{paladin,1}]` × 20 round → `{"ok":20,"QUEST_FULL":60}`, sempre 1 registrazione, 1 `registeredAdventurers`, 1 PendingQuest; callback eseguito al massimo **2 volte**. 5 hero su `[{hero,2}]` × 20 round → `{"ok":40,"QUEST_FULL":60}` su **8.0.4** e su **8.2.6**, sempre 2 debiti. Paladin con party solo hero (limite 0) → `QUEST_FULL`. Legacy senza party con `requiredAdventurers: 2`, 3 concorrenti → `[ok, ok, QUEST_FULL]` [VERIFIED: probe].

**Regola di capienza (funzione pura, dalla pre-lettura del Quest):**
- `party` non vuoto ⇒ `perRank`, `limit = party.find(p => p.title === title)?.count ?? 0` (rango assente ⇒ 0 ⇒ `QUEST_FULL`, D-04).
- `party` assente o vuoto e `requiredAdventurers > 0` ⇒ `total`, `limit = requiredAdventurers`.
- altrimenti ⇒ `unlimited` (nessun `$expr`, restano le guard anti-duplicato).

Nota sul default: con `@Prop({ type: [Schema], default: [] })` i documenti nuovi hanno `party: []`; i legacy non hanno il campo e l'idratazione Mongoose dà `[]`. La regola tratta i due casi allo stesso modo [VERIFIED: probe, `party` assente resta assente con `default: undefined`; con default `[]` l'idratazione lo valorizza].

`limit` letto prima della transazione: un cambio di catalogo fra pre-lettura e scrittura è un'operazione manuale del GM a DB, accettato (A1). `requiredAdventurers` resta scritto a mano (discrezione): con un party non vuoto è ignorato; un WARN di incoerenza non serve (YAGNI).

**Ordine dentro la transazione:** claim del Character **prima** (i concorrenti dello stesso personaggio perdono lì con `QUEST_SLOT_BUSY`), poi registrazione sul Quest (i concorrenti di personaggi diversi perdono lì con `QUEST_FULL`), poi insert del PendingQuest, poi debito. Se la registrazione non matcha, rilettura nella session: personaggio già in `registrations` ⇒ `QUEST_ALREADY_TAKEN`, altrimenti `QUEST_FULL`.

### Q2 — Claim di corsia + debito in una transazione — HIGH (codice + empirico)

**Stato attuale** (`src/quests/acceptance/quest-acceptance.service.ts`): `accept(characterId, questId, costCopper)` (`:37-83`) legge `infos.timeToComplete` (`:43-47`), apre `connection.transaction` (`:49`), claim `{ ...activeCharacterById(id), 'quests.pendingQuest': null }` → `$set` del `_id` pre-generato (`:50-60`), `rejectUnclaimed` rilegge nella session e sceglie `QUEST_SLOT_BUSY`/`NOT_FOUND` (`:85-96`), insert del PendingQuest (`:63-73`), debito coins (`:74-80`, **esce** per D-08), `waitingTimeOf` (`:107-109`).

**Generalizzazione:**
- Il path del claim viene da `lanePathOf(laneOf(quest.infos.type))` (`'quests.pendingQuest' | 'quests.activeStoryQuest' | 'quests.activeWorldMissionQuest'`), mai dal client.
- **Guard riaffermate nel filtro del claim** (tutte esprimibili sul documento Character, quindi gratuite):
  - `...activeCharacterById(characterId)` (03.1);
  - `[lanePath]: null` (corsia libera; `null` matcha anche il campo assente dei documenti legacy);
  - `'status.title': snapshot.title` (il rango usato per la capienza è quello vero al momento della scrittura);
  - `'status.location': { $in: idForms(snapshot.location) }` (riafferma la posizione verificata sulla città; `status.location` è `Mixed`, `character-status.model.ts:22-24`, quindi `idForms` di `src/mongo/document-id.ts:36-38`);
  - per i non ripetibili: `'quests.completedQuests': { $nin: idForms(questId) }` (array di `Mixed`).
- **Chi debitare:** il guard owner-only (Q5) ha già verificato che `User(identity.userId).currentCharacter === request.id`. Il resolver passa `identity.userId` (da `@CurrentUser()`, `src/auth/decorators/current-user.decorator.ts`) come `ownerId`. La finestra guard→transazione è sicura: `currentCharacter` cambia solo con la creazione (richiede `null`, `character-creation.service.ts:58-59`) e con la cancellazione, che lo azzera **e** archivia il personaggio nella stessa transazione (`character-deletion.service.ts:40-63`); un'accettazione concorrente a una cancellazione o trova il personaggio archiviato (claim fallito ⇒ `NOT_FOUND`) o va in WriteConflict sul documento User/Character e viene serializzata [VERIFIED: lettura codice]. Nessun bisogno di cercare lo User per `currentCharacter` (non indicizzato).
- **Debito:** `this.wallet.debitUserPoints(ownerId, cost, session)` (`wallet.service.ts:74-96`) solo se `cost > 0` (story/worldMission). Il filtro `{ _id, twitchPoints: { $gte: amount } }` fallito ⇒ rilettura `exists` nella session ⇒ `GameRuleException.insufficientPoints()` (o `ResourceNotFoundException.user()`), lanciata **dentro** il callback ⇒ `withTransaction` aborta (errore non transitorio, non ritentato) ⇒ claim, registrazione e insert annullati. Probe: `INSUFFICIENT_POINTS` ⇒ corsia `null`, `registrations` 0, `registeredAdventurers` 0, PendingQuest 0 [VERIFIED: probe]. `assertPositiveAmount` (`:118-122`) lancerebbe `RangeError` su un costo invalido: la validazione di catalogo (D-09) deve quindi precedere la transazione, così il `RangeError` resta irraggiungibile.
- **Retry/abort:** `Connection.prototype.transaction` di Mongoose 8.18.1 chiama `session.withTransaction` e resetta lo stato dei documenti fra i tentativi (`node_modules/mongoose/lib/connection.js:719-760`). I WriteConflict sono ritentati dal driver (callback rieseguito, misurato ≤ 2 volte); le eccezioni di dominio abortiscono subito. Stesso comportamento già sfruttato in 02.1, 03.1, 04 e 06 [VERIFIED: codice + probe].
- **Collection pre-create:** le integration devono fare `model.init()`/`createCollection()` di `characters`, `quests`, `pendingquests`, `users` (e `cities`) prima delle transazioni (Phase 1 Pitfall 9, `quest-acceptance.service.int-spec.ts:58-63`).
- **`pointsSpent`** sul PendingQuest = costo effettivamente debitato (0 per la corsia standard).

### Q3 — `quest { id }` su un `PendingQuest.quest` non popolato (D-13) — HIGH (empirico)

Probe sul filo (`createCharactersTestApp` + `CharactersService` sostituito con tre varianti di `findOne`; query `character(id) { id quests { pendingQuest { id startDate waitingTime quest { id } } } }`):

| Variante di `findOne` | Risposta |
|---|---|
| attuale (nessun populate) | `errors[0].message = 'ID cannot represent value: { type: "Buffer", data: [Array] }'`, path `…pendingQuest.id`, `INTERNAL_SERVER_ERROR`, `pendingQuest: null` — **anche senza selezionare `quest`** |
| `populate({ path: 'quests.pendingQuest', model: 'PendingQuest' })` | senza `quest`: OK; con `quest { id }`: stesso errore Buffer su `…quest.id` e `pendingQuest: null` (Quest! non-null) |
| `populate({ path: 'quests.pendingQuest', model: 'PendingQuest', populate: { path: 'quest', model: 'Quest', select: '_id' } })` | **OK**: `{ id, startDate: "2026-10-21T10:00:00.000Z", waitingTime: 60000, quest: { id } }` |
| come sopra, ref a un PendingQuest inesistente | `pendingQuest: null`, nessun errore |
| `completedQuests: [ObjectId]` non popolato, `completedQuests { id }` | `data: null` (intero `character` azzerato) |

Causa: i path `@Prop({ type: Types.ObjectId })` sono `Mixed` (probe: `pendingQuest`, `status.location`, `City.markerLocation` → `Mixed`; `completedQuests` → Array di `Mixed`; `City.pointsOfInterest` dichiarato `[{ type: Types.ObjectId }]` → Array di **ObjectId**), Mongoose non li casta né li sostituisce, e il getter `id` dell'`ObjectId` di bson 6.10.4 restituisce il buffer; con un documento idratato invece `id` è il virtual stringa [VERIFIED: probe].

**Raccomandazione:** populate annidato con proiezione `_id`, non `@ResolveField` (richiederebbe un resolver su `PendingQuest` e un'altra forma per `completedQuests`; il populate è una sola costante e copre anche il change stream). Costante in `src/characters/character-quests.populate.ts` (nome a discrezione):

```ts
const QUEST_ID_ONLY = { path: 'quest', model: Quest.name, select: '_id' };
export const CHARACTER_QUESTS_POPULATE = [
    ...(['pendingQuest', 'activeStoryQuest', 'activeWorldMissionQuest'] as const).map((lane) => ({
        path: `quests.${lane}`,
        model: PendingQuest.name,
        populate: QUEST_ID_ONLY,
    })),
    { path: 'quests.completedQuests', model: Quest.name, select: '_id' }, // C2
];
```

Applicata in `CharactersService.findOne` (`characters.service.ts:120-139`) e `findAll` (C3). **Subscription:** il change stream chiama `this.findOne(id)` (`characters.service.ts:91`) e lo snapshot di `characterUpdated` chiama `charactersService.findOne(id)` (`characters.resolver.ts:113-115`): entrambi i percorsi ereditano il populate senza altre modifiche [VERIFIED: lettura codice]. Il change stream vede solo il commit: quando arriva l'evento dell'update del Character il PendingQuest della stessa transazione esiste già.

`pointsSpent`: `@Prop({ type: Number, default: 0 })` ⇒ un PendingQuest legacy senza campo, **idratato** (anche via populate), legge `0`; con `.lean()` resta `undefined` (probe). Sul filo `pointsSpent: Int!` è sicuro perché `findOne`/`pendingQuests`/`pendingQuest` usano documenti idratati (`pending-quests.service.ts:17-25`).

### Q4 — Appartenenza alla città (D-10) — HIGH (codice + dati reali)

**Tipi:** `Quest.infos.markerLocation` `Mixed` ref POI obbligatorio (`quest-infos.model.ts:28-30`; **dentro `infos`**, non al top level); `City.markerLocation` `Mixed` (`city.model.ts:27-29`); `City.pointsOfInterest` array **castato a ObjectId** (`city.model.ts:35-37`); `Character.status.location` `Mixed` (`character-status.model.ts:22-24`); `PointOfInterest.city` ref City (`point-of-interest.model.ts:22-24`). `StartingLocationService` legge le città lean e tiene solo marker `ObjectId` (`starting-location.service.ts:36-50`).

**Dati reali** (DB di sviluppo Atlas, script Node di sola lettura con `readPreference: secondaryPreferred`, stampati solo conteggi e tipi):
- 167 città, marker tutti `ObjectId`; 642 elementi di `pointsOfInterest`, tutti `ObjectId`; **marker della città nella propria lista: 167/167**; POI condivisi fra due città: 0.
- 642 POI, tutti con `city` `ObjectId`; `POI.quest` è `null` su tutti (il back-ref non è usato: non basarsi su di esso).
- 4 quest (`worldMission`, `enemy`, `job`, `heal`), marker `ObjectId`; **marker in qualche `pointsOfInterest`: 4/4**, **uguale a un marker di città: 0/4**; `POI.city` del marker coerente con la città della lista: 4/4.
- 1 personaggio, `location` `ObjectId`, uguale a un marker di città (e quindi anche in una lista).
- `cities` ha solo l'indice `_id`.

**Query unica raccomandata** (dalla pre-lettura del Quest e del Character):

```ts
const inCity = await this.cityModel
    .exists({
        pointsOfInterest: questMarker,                         // la città che contiene il marker della quest
        $or: [
            { markerLocation: { $in: idForms(location) } },    // il personaggio è sul marker della città…
            { pointsOfInterest: location },                    // …o su uno dei suoi POI
        ],
    })
    .exec();
if (!inCity) throw GameRuleException.questNotInCity();
```

Copre entrambe le condizioni di D-10 in un solo round-trip; "nessuna città contiene il marker" e "personaggio altrove" danno lo stesso codice (fail-closed). Sui dati reali il ramo `markerLocation` è ridondante (il marker è sempre in lista) ma innocuo e rispetta la lettera di D-10. `questMarker`/`location` vanno passati come `ObjectId` (se letti come stringa da un dato legacy, il cast dell'array li converte; `idForms` copre il path `Mixed`).

**Indice:** non serve in questa fase — 167 documenti piccoli, una scansione per accettazione. Un `CitySchema.index({ pointsOfInterest: 1 })` multikey è un'ottimizzazione da rimandare a Phase 10 (build in produzione con `autoIndex`).

### Q5 — Guard owner-only (D-11) — HIGH (codice)

Oggi: `ownsResource` scrive `OwnershipRule { resource, selectId }` sotto `OWNERSHIP_KEY` e applica `OwnershipGuard` (`ownership.decorators.ts:7-31`); il guard chiede `policy.authorize(identity, resource, id)` e registra `onBehalf` per l'audit (`ownership.guard.ts:38-55`); il bypass è `if (identity.role === innkeeper) return onBehalf` in `authorizeCharacter` (`character-access.policy.ts:65-80`, riga `:76`).

**Variante minima raccomandata:** opzione sul decorator esistente, stessa chiave di metadata.

```ts
export interface OwnershipRule {
    resource: OwnedResource;
    selectId: (args: Record<string, unknown>) => string;
    ownerOnly: boolean;                      // default false
}
export const OwnsCharacter = <A>(selectId: (args: A) => string, options: { ownerOnly?: boolean } = {}) =>
    ownsResource(OwnedResource.character, selectId, options.ownerOnly ?? false);
```

Il guard passa `rule.ownerOnly` alla policy; in `authorizeCharacter(identity, id, { ownerOnly })` il ramo innkeeper diventa `if (identity.role === innkeeper && !ownerOnly) return onBehalf;`, così l'innkeeper su un personaggio altrui cade in `assertCharacterExists` + `AuthorizationException.notOwner()` (`FORBIDDEN`, distinzione 403/404 preservata) e sul proprio personaggio resta `owner`. Nessun `onBehalf` ⇒ nessun audit. Unit da estendere: `character-access.policy.spec.ts`, `ownership.guard.spec.ts`.

**Whitelist del boot reale:** `collectHandlersWithMetadata(app, OWNERSHIP_KEY)` (`test/app.int-spec.ts:91-115`, asserito a `:437-440`) enumera ogni handler con la regola, quindi `QuestAcceptanceResolver.acceptQuest` va aggiunto a `EXPECTED_OWNERSHIP_HANDLERS` (`:52-62`, ordine alfabetico). Per enumerare anche la strictness si usa il matcher già previsto dalla funzione: nuova costante `EXPECTED_OWNER_ONLY_HANDLERS = ['QuestAcceptanceResolver.acceptQuest']` asserita con `collectHandlersWithMetadata(app, OWNERSHIP_KEY, (rule) => (rule as OwnershipRule | undefined)?.ownerOnly === true)`. `EXPECTED_INNKEEPER_HANDLERS` e `EXPECTED_PUBLIC_HANDLERS` invariati.

**Dove montare `acceptQuest`:** nuovo `QuestAcceptanceResolver` (`src/quests/acceptance/quest-acceptance.resolver.ts`) dentro `QuestAcceptanceModule`, che importa `AuthzModule` (il guard di metodo si istanzia nel modulo del resolver e richiede `CharacterAccessPolicy` + `AuthorizationDecisions`, `authz.module.ts`) e registra anche `City`. Motivi: `QuestsModule` è il catalogo e non importa `AuthzModule`; `CharactersResolver` è già largo e importerebbe le dipendenze quest. L'integration del wire monta `createCharactersTestApp({ imports: [QuestAcceptanceModule] })` (nessun Bull).

### Q6 — `serverTime: DateTime!` (D-15) — HIGH (empirico)

Probe: un resolver con `@Query(() => Date) serverTime(): Date` produce nello schema stampato **`serverTime: DateTime!`** (stesso scalar `DateTime` già usato da `PendingQuest.startDate`, `schema.gql:174`), risponde `"2026-10-21T10:08:31.784Z"` (delta 2 ms dal clock del test) e senza bearer `extensions = { code: 'UNAUTHENTICATED' }` grazie all'`AuthGuard` globale deny-by-default [VERIFIED: probe]. `() => Date` equivale a `GraphQLISODateTime` (dateScalarMode di default `isoDate`); si usa `() => Date` per coerenza con `pending-quest.model.ts:12`.

Collocazione: `src/time/server-time.resolver.ts` + `src/time/server-time.module.ts` con `{ provide: Clock, useClass: SystemClock }` locale (pattern `push.module.ts:25`, `eventsub.module.ts:36`), montato in `AppModule`; unit con un `Clock` fisso, integration sul harness (`providers: [ServerTimeResolver, { provide: Clock, … }]` o `imports: [ServerTimeModule]`). Nessun decorator ⇒ non entra in alcuna whitelist; il boot reale asserisce `schema.toContain('serverTime: DateTime!')` e `UNAUTHENTICATED` su `{ serverTime }` senza bearer.

### Q7 — Classificatori puri (D-01, D-05, D-06, D-09, D-16) — HIGH

`QuestType` (`quest-type.enum.ts`): hunt, aid, enemy, worldMission, boss, dungeon, story, study, heal, job, crime, guard. `TitleType` (`title-type.enum.ts`): rookie, adventurer, paladin, mage, hero, legend. Nessuno dei due compare come enum nello schema (i campi sono `String!`).

Layout consigliato (stesso stile di `src/characters/spells/active-spell.updates.ts` e `equipment/equip-item.updates.ts`):

| File | Contenuto | Spec |
|---|---|---|
| `src/quests/acceptance/quest-lanes.ts` | `enum QuestLane { standard = 'pendingQuest', story = 'activeStoryQuest', worldMission = 'activeWorldMissionQuest' }`, `laneOf(type: QuestType): QuestLane`, `lanePathOf(lane)` → `` `quests.${lane}` ``, `QUEST_LANES` | tabella per ogni `QuestType` (boss → standard) |
| `src/quests/acceptance/quest-eligibility.ts` | `TITLE_RANK: Record<TitleType, number>` esplicito (non l'ordine di dichiarazione), `meetsTitle(type, title, minTitle)` (story: `===`; altrimenti `>=`; `minTitle` assente ⇒ true), `isRepeatable(type)`, `isShared(type)` (worldMission, boss), `pointsCostOf(lane, requiredPoints)` → `{ cost } | 'invalid'` (story/worldMission: intero sicuro > 0 altrimenti `invalid`; standard: 0), `waitingTimeOf(lane, timeToComplete)` (story/worldMission: 0; standard: `timeToComplete ?? 0`), `classifyEligibility(quest, character)` → `GameRuleException | null` nell'ordine sotto | tabelle per titolo × tipo, costi 0/-1/1.5/null/`2**53`, waitingTime |
| `src/quests/acceptance/quest-acceptance.updates.ts` | `laneClaimFilter(characterId, lane, snapshot, questId, repeatable)`, `laneClaimUpdate(lane, pendingQuestId)`, `capacityRuleOf(requirements, title)`, `registrationFilter(questId, characterId, rule, title)`, `registrationUpdate(characterId, title)`, `classifyUnclaimed(freshSnapshot, lane, …)` | forma dei filtri (deep equal) e regola di capienza a tabella |

**Ordine di valutazione raccomandato** (pre-transazione, codice deterministico; il filtro resta la regola):
1. `questId` malformato ⇒ `NOT_FOUND` (quest) senza DB; `request.id` malformato è già `NOT_FOUND` nel guard (`character-access.policy.ts:69-70`).
2. Quest lean (`infos.type`, `infos.markerLocation`, `infos.timeToComplete`, `requirements`, `registrations.character`) assente ⇒ `NOT_FOUND`.
3. Catalogo: story/worldMission con `requiredPoints` non intero positivo ⇒ `QUEST_NOT_ACCEPTABLE` + WARN col solo id della quest.
4. Character lean (`status.title`, `status.location`, `quests.*`) attivo assente ⇒ `NOT_FOUND`.
5. Non ripetibile già in `completedQuests` o già registrato ⇒ `QUEST_ALREADY_TAKEN`.
6. Titolo ⇒ `QUEST_TITLE_MISMATCH`.
7. Città ⇒ `QUEST_NOT_IN_CITY` (unica lettura extra).
8. Corsia occupata ⇒ `QUEST_SLOT_BUSY` (corto circuito; riaffermato nel filtro).
9. Capienza (pre-check sulla lettura; riaffermata con `$expr`) ⇒ `QUEST_FULL`.
10. Punti: solo nella transazione ⇒ `INSUFFICIENT_POINTS`.

Coerenza con D-19: "seconda story mentre una è attiva" usa due story con lo stesso `minTitle` (il titolo passa, la prima non è in `completedQuests`) ⇒ `QUEST_SLOT_BUSY`; i 3 concorrenti superano tutti la pre-lettura e si separano nella transazione.

Codici nuovi in `GameRuleErrorCode` (`game-rule-error-code.enum.ts`) con factory in `GameRuleException` (`game-rule.exception.ts`): `QUEST_FULL` ("Non ci sono più posti per il tuo rango"), `QUEST_ALREADY_TAKEN` ("Hai già affrontato questa missione"), `QUEST_TITLE_MISMATCH` ("Il tuo titolo non permette questa missione"), `QUEST_NOT_IN_CITY` ("Devi trovarti nella città della missione"), `QUEST_NOT_ACCEPTABLE` ("Missione non disponibile"). Lo spec `game-rule.exception.spec.ts:119-122` asserisce che ogni codice è prodotto da esattamente una factory: va esteso.

### Q8 — Impatto su schema e handoff — HIGH

SDL additivo atteso in `src/schema.gql` (`sortSchema: true`, `graphql-options.factory.ts:18`; nomi del party a discrezione, qui `party`/`QuestPartySlot`):

```graphql
type CharacterQuests {
  activeStoryQuest: PendingQuest
  activeWorldMissionQuest: PendingQuest
  completedQuests: [Quest!]!
  pendingQuest: PendingQuest
}

type PendingQuest {
  id: ID!
  pointsSpent: Int!
  quest: Quest!
  startDate: DateTime!
  waitingTime: Float!
}

type QuestPartySlot {
  count: Int!
  title: String!
}

type QuestRequirements {
  minTitle: String!
  party: [QuestPartySlot!]!
  recommendedLoot: [AssetQuantity!]!
  requiredAdventurers: Int!
  requiredPoints: Int
}

input AcceptQuestRequest {
  id: String!
  questId: String!
}

# type Mutation
  acceptQuest(request: AcceptQuestRequest!): CommonResponse!
# type Query
  serverTime: DateTime!
```

- `title: String!` nel party per coerenza con `minTitle: String!` e `QuestInfos.type: String!` (introdurre `enum TitleType` sarebbe additivo ma lascerebbe `minTitle` incoerente; cambiare `minTitle` in enum è **non additivo**).
- `CharacterQuestsInput`, `QuestRequirementsInput`, `QuestInput`, `PendingQuestInput` **non compaiono nello schema** (nessuna operazione li usa; grep su `src` e `schema.gql`): estenderli non produce diff SDL e non esiste alcun percorso create/update delle quest che possa rompersi. Si estendono comunque come chiede D-01 (`CharacterQuestsInput` + `QuestPartySlotInput` su `QuestRequirementsInput`).
- `registrations` resta **senza `@Field`** (interno); il boot reale asserisce `not.toContain('registrations')`.

**Da evitare (non additivo):** cambiare `registeredAdventurers` in `[Character]`, rendere non-null una corsia, cambiare `waitingTime` in `Int`, togliere `requiredPoints` o renderlo non-null, cambiare il tipo di ritorno di `quest(id)`/`quests`.

**Handoff (D-21), punti nuovi emersi qui:** (i) il fragment FE attuale `pendingQuest { id }` / `completedQuests { id }` oggi fallisce con un valore non nullo; dopo questa fase funziona senza modifiche FE; (ii) il catalogo reale ha `requiredPoints: 3000` su una quest `enemy`: il BE lo ignora (D-09), il FE deve mostrare il costo solo per story/worldMission; (iii) l'unica worldMission ha `requiredAdventurers: 1` e nessun party ⇒ un solo avventuriero finché il GM non aggiunge il party; (iv) nessuna story a DB.

### Q9 — Trappole specifiche del repo — HIGH

Raccolte in "Common Pitfalls" (Prettier che spezza le firme, `await-thenable`, `MongooseSchema.Types.ObjectId`, `ACTIVE_CHARACTER_FILTER`, collection pre-create, harness, env del boot reale, rigenerazione dello schema).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mongoose | 8.18.1 | transazione, populate annidato, `$expr` nei filtri | già in uso; comportamento misurato [VERIFIED: node_modules] |
| mongodb (driver) | 6.19.0 | `withTransaction` con retry dei WriteConflict | sotto Mongoose [VERIFIED: node_modules] |
| @nestjs/graphql | 13.2.0 | code-first, scalar `DateTime` | già in uso [VERIFIED] |
| graphql | 16.11.0 | serializzazione `ID` (origine dell'errore Buffer) | [VERIFIED] |
| jest / ts-jest | 30.1.3 / 29.4.1 | unit + integration | [VERIFIED] |
| mongodb-memory-server | 11.2.0 (default mongod 8.2.6; CI `MONGOMS_VERSION=8.0.4`) | replica set di test | [VERIFIED: `resolveConfig.js:52`, `ci.yml:13`] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| bson | 6.10.4 | `ObjectId` (getter `id` = buffer) | spiega Pitfall 1 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| populate `select: '_id'` | `@ResolveField` su `PendingQuest.quest` | un resolver in più, non copre `completedQuests`, nessun vantaggio |
| `registrations` + `$expr` | contatori `$inc` posizionali nel party | perde chi occupa lo slot, stato runtime nel catalogo |
| opzione `ownerOnly` | decorator dedicato `@OwnsOwnCharacter` | due API per la stessa regola; la whitelist dovrebbe enumerare due forme |

**Installation:** nessuna.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── quests/acceptance/
│   ├── quest-lanes.ts (+ .spec.ts)                 # corsia per tipo, path
│   ├── quest-eligibility.ts (+ .spec.ts)           # titolo, ripetibilità, condivise, costo, waitingTime, classificazione
│   ├── quest-acceptance.updates.ts (+ .spec.ts)    # filtri/update di claim e registrazione, regola di capienza
│   ├── quest-acceptance.service.ts                 # generalizzato: pre-letture + transazione
│   ├── quest-acceptance.service.int-spec.ts        # riscritto (concorrenza, corsie, party, punti, zero scritture)
│   ├── quest-acceptance.resolver.ts                # acceptQuest, @OwnsCharacter(…, { ownerOnly: true })
│   ├── accept-quest.resolver.int-spec.ts           # wire: codici, FORBIDDEN, characterUpdated
│   └── quest-acceptance.module.ts                  # + AuthzModule, City
├── models/quest/
│   ├── quest-party-slot.model.ts                   # ObjectType + Schema + Input
│   └── quest-registration.model.ts                 # solo Schema (interno)
├── models/request/accept-quest-request.model.ts
├── characters/character-quests.populate.ts         # CHARACTER_QUESTS_POPULATE
└── time/server-time.{resolver,module}.ts (+ spec)
```

### Pattern 1: pre-lettura lean → classificazione pura → transazione con guard riaffermate
Le regole non esprimibili nel filtro (città) si verificano prima; quelle esprimibili (attivo, corsia libera, titolo, posizione, non ripetibilità, capienza, saldo) stanno **anche** nel filtro. Nessun pre-check del saldo (il filtro `$gte` è la regola).

### Pattern 2: rifiuto nella transazione = eccezione di dominio lanciata nel callback
Rilettura leggera nella **stessa session** solo per scegliere il codice (`rejectUnclaimed`, Phase 4); l'eccezione aborta tutto.

### Pattern 3: populate come costante condivisa
Una sola costante per `findOne`/`findAll`; il change stream e lo snapshot la ereditano.

### Anti-Patterns to Avoid
- **Corsia dal client:** mai un argomento `lane`; solo `laneOf(quest.infos.type)` dal catalogo.
- **Due update sul Quest** (prima `$addToSet`, poi controllo del conteggio): finestra fra i due. Sempre filtro + update nello stesso `findOneAndUpdate`.
- **Debito fuori transazione o prima del claim:** il debito va per ultimo nella session.
- **`new Types.ObjectId(hex)` su input non validato:** usare `objectIdFromHex`/`requireCharacterObjectId`.
- **`.lean()` per il payload GraphQL:** perde il virtual `id` e il default di `pointsSpent`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retry dei conflitti | loop di retry manuale | `connection.transaction` (driver `withTransaction`) | già ritenta i WriteConflict; un loop manuale duplicherebbe i debiti |
| Saldo punti | `$inc` diretto sullo User | `WalletService.debitUserPoints(…, session)` | unico scrittore (04 D-04), `INSUFFICIENT_POINTS` già classificato |
| Conteggio posti | lettura + confronto in memoria | `$expr` nel filtro | atomico per documento |
| Id del client | regex locali | `isObjectIdHex`/`objectIdFromHex`/`idForms` (`src/mongo/document-id.ts`) | coerenza con i path `Mixed` |
| Filtro attivo | `{ deletedAt: null }` scritto a mano | `activeCharacterById` | 03.1 |

**Key insight:** ogni regola che si può scrivere nel filtro deve stare nel filtro; la classificazione serve solo a scegliere il messaggio.

## Common Pitfalls

### Pitfall 1: ref `Mixed` non popolati sul filo
**What goes wrong:** `ID cannot represent value: Buffer`, campo azzerato o `data: null`. **Why:** `Types.ObjectId` nei `@Prop` scalari ⇒ `Mixed`; il getter `id` di bson è il buffer. **How to avoid:** populate con `select: '_id'` (Q3); per i **nuovi** ref usare `MongooseSchema.Types.ObjectId` (Phase 2) — vale per `activeStoryQuest`, `activeWorldMissionQuest`, `registrations.character`; non ritipizzare `pendingQuest` (Phase 10). **Warning signs:** `INTERNAL_SERVER_ERROR` con path che finisce in `.id`.

### Pitfall 2: harness senza i modelli popolati
`createCharactersTestApp` non registra `PendingQuest`/`Quest` (C6) ⇒ `MissingSchemaError`. Registrarli nell'harness e in `CharactersModule`.

### Pitfall 3: filtri su path `Mixed` con id stringa
Un id stringa non matcha un `ObjectId` salvato (04 Pitfall 1). `status.location`, `completedQuests`, `City.markerLocation`: usare `idForms`.

### Pitfall 4: `ACTIVE_CHARACTER_FILTER` dimenticato
Ogni filtro sul Character (claim e riletture) usa `activeCharacterById`; un archiviato risponde `NOT_FOUND`.

### Pitfall 5: collection non create prima della transazione
Pre-creare `characters`, `quests`, `pendingquests`, `users`, `cities` (`model.init()`) nei `beforeAll` delle integration.

### Pitfall 6: `RangeError` del wallet raggiungibile
Se la validazione di catalogo non precede la transazione, un `requiredPoints` invalido produce un `RangeError` non classificato. Validare prima (`QUEST_NOT_ACCEPTABLE`).

### Pitfall 7: test Phase 4 obsoleti
`quest-acceptance.service.int-spec.ts` testa `accept(…, costCopper)`, `INSUFFICIENT_FUNDS` e `RangeError` sul costo: con D-08 la firma cambia e quei casi spariscono; riscrivere (RED) invece di adattare. Il test di concorrenza (`:266-304`) si conserva nella nuova forma.

### Pitfall 8: test del boot reale in negativo
`test/app.int-spec.ts:282-292` fallisce appena `acceptQuest` entra nello schema (C5).

### Pitfall 9: `pendingQuest(id)` per le nuove corsie
Senza C4 il proprietario riceve `FORBIDDEN` sul proprio PendingQuest story/worldMission.

### Pitfall 10: Prettier e grep di accettazione
`quest-requirements.model.ts`, `character-quests.model.ts`, `pending-quest.model.ts`, `quest.model.ts`, `quests.resolver.ts` **non** sono Prettier-clean (`npx prettier --check`): `--write` sul file toccato li riformatta tutti (Boy Scout accettato, diff più ampio). Prettier spezza firme e decorator su più righe: le verifiche nei plan usano `grep -A3`/`grep -Pzo`, non un `grep` su una riga sola (es. `@OwnsCharacter<…>(\n ({ request }) => request.id,\n { ownerOnly: true },\n)`).

### Pitfall 11: `@typescript-eslint/await-thenable` e `require-await`
`await` su valori non-Promise (es. una funzione pura di classificazione) è un errore di lint; i resolver sincroni (`serverTime`) non vanno marcati `async` senza `await` (`require-await` è `warn` ma sporca il gate filtrato).

### Pitfall 12: env del boot reale
`test/app.int-spec.ts:169-187` imposta già `JWT_SECRET`, `FIREBASE_SERVICE_ACCOUNT: ''` e le quattro variabili EventSub vuote: nessuna variabile nuova in questa fase, ma il test va lanciato da solo (`--runInBand`) e rigenera `src/schema.gql`, da committare (gate `git diff --exit-code src/schema.gql`).

### Pitfall 13: `createAuthTestApp` vs `createCharactersTestApp`
Il primo non ha `CharactersService`/change stream; per `characterUpdated` e `character(id)` serve il secondo, con `imports: [QuestAcceptanceModule]` (+ `MongooseModule.forFeature([City])` se non già nel modulo). Il change stream va "innescato" prima di asserire gli eventi (`primeCharactersChangeStream`, `character-updated.subscription.int-spec.ts:37-66`).

### Pitfall 14: GraphQL `Int` a 32 bit
`requiredPoints`/`pointsSpent` restano sotto 2^31: nessun problema con i costi reali (5000).

## Code Examples

### §1 Servizio generalizzato (forma raccomandata, `quest-acceptance.service.ts`)
```ts
async accept({ ownerId, characterId, questId }: AcceptQuestCommand): Promise<Types.ObjectId> {
    const quest = await this.readQuest(questId);                    // NOT_FOUND
    const lane = laneOf(quest.infos.type);
    const cost = this.costOrReject(quest, lane);                   // QUEST_NOT_ACCEPTABLE + WARN(id)
    const character = await this.readCharacter(characterId);      // NOT_FOUND
    const rejection = classifyEligibility(quest, character, lane);// ALREADY_TAKEN / TITLE / SLOT_BUSY / FULL
    if (rejection) throw rejection;
    await this.assertInQuestCity(quest.infos.markerLocation, character.status.location); // NOT_IN_CITY
    const pendingQuestId = new Types.ObjectId();
    await this.connection.transaction(async (session) => {
        await this.claimLane(characterId, lane, character, questId, pendingQuestId, session);
        if (isShared(quest.infos.type)) await this.register(quest, characterId, character.status.title, session);
        await this.pendingQuestModel.create(
            [{ _id: pendingQuestId, startDate: new Date(), waitingTime: waitingTimeOf(lane, quest.infos.timeToComplete),
               pointsSpent: cost, quest: questId }],
            { session },
        );
        if (cost > 0) await this.wallet.debitUserPoints(ownerId, cost, session); // INSUFFICIENT_POINTS → abort
    });
    return pendingQuestId;
}
```

### §2 Resolver
```ts
@Resolver()
export class QuestAcceptanceResolver {
    constructor(private readonly acceptance: QuestAcceptanceService) {}

    @OwnsCharacter<{ request: AcceptQuestRequest }>(({ request }) => request.id, { ownerOnly: true })
    @Mutation(() => CommonResponse)
    async acceptQuest(
        @Args('request', { type: () => AcceptQuestRequest }) request: AcceptQuestRequest,
        @CurrentUser() identity: AuthIdentity,
    ): Promise<CommonResponse> {
        const questId = objectIdFromHex(request.questId);
        if (!questId) throw ResourceNotFoundException.quest();
        await this.acceptance.accept({
            ownerId: new Types.ObjectId(identity.userId),
            characterId: requireCharacterObjectId(request.id),
            questId,
        });
        return { response: 'Missione accettata', successful: true };
    }
}
```

### §3 Esito del probe sul filo (spec usa-e-getta, cancellato)
```
none/withQuest           errors: "ID cannot represent value: { type: \"Buffer\" … }" path character.quests.pendingQuest.id, pendingQuest: null
pendingOnly/withQuest    errors: stesso, path ….pendingQuest.quest.id, pendingQuest: null
pendingOnly/noQuest      {"id":"…ce5","startDate":"2026-10-21T10:00:00.000Z","waitingTime":60000}
pendingAndQuestId        {"id":"…ce5","startDate":"2026-10-21T10:00:00.000Z","waitingTime":60000,"quest":{"id":"…ce2"}}
dangling ref             {"pendingQuest":null} senza errori
completedQuests {id}     data: null
serverTime               {"serverTime":"2026-10-21T10:08:31.784Z"} delta 2 ms; senza bearer UNAUTHENTICATED; SDL "serverTime: DateTime!"
```

### §4 Esito dei probe Mongo (cancellati)
```
instances  pendingQuest Mixed | completedQuests Array<Mixed> | status.location Mixed | City.pointsOfInterest Array<ObjectId> | City.markerLocation Mixed | Schema.Types.ObjectId → ObjectId
per-rank   4 hero × 1 slot × 20 round → {"ok":20,"QUEST_FULL":60}, callback ≤ 2 tentativi
per-rank   5 hero × 2 slot × 20 round → 8.0.4 {"ok":40,"QUEST_FULL":60} | 8.2.6 {"ok":40,"QUEST_FULL":60}
absent     paladin su party solo hero → QUEST_FULL
legacy     requiredAdventurers 2, 3 concorrenti → [ok, ok, QUEST_FULL]
same char  3 concorrenti → [ok, QUEST_SLOT_BUSY, QUEST_SLOT_BUSY], 1 debito, 1 PendingQuest
points     INSUFFICIENT_POINTS → corsia null, registrations 0, registeredAdventurers 0, PendingQuest 0
default    pointsSpent legacy: idratato 0, lean undefined
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@Prop({ type: Types.ObjectId })` | `MongooseSchema.Types.ObjectId` per i nuovi ref | Phase 2 | i nuovi campi sono castati; i vecchi restano `Mixed` fino a Phase 10 |
| Costo in rame nella primitiva | Costo in punti per corsia | Phase 7 (D-08) | `costCopper` e `applyCharacterCoinsDelta` escono dall'accettazione |

**Deprecated/outdated:** il parametro `costCopper` di `accept` e i relativi test.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Un cambio manuale del party fra pre-lettura e scrittura è trascurabile (limite letto prima della transazione) | Q1 | Un'iscrizione in più/meno nell'istante della modifica del GM; nessuna corruzione |
| A2 | La Phase 9 libererà gli slot con `$pull` su `registrations` e `registeredAdventurers` | Q1 | Solo design futuro; nessun effetto su questa fase |
| A3 | I messaggi italiani proposti per i nuovi codici sono accettabili | Q7 | Cambio di stringa, nessun impatto sul contratto (il FE mappa il codice) |

## Open Questions (RESOLVED)

1. **Come contare i posti per rango se `registeredAdventurers` non ha il titolo?**
   - RESOLVED: campo interno `registrations: [{ character, title }]` scritto nello stesso update, guard `$expr` (Q1, probe su 8.0.4 e 8.2.6).
2. **Il debito va allo User risolto da `currentCharacter` o all'identità?**
   - RESOLVED: `identity.userId`, già verificato owner dal guard; la finestra è sicura per costruzione (Q2).
3. **`quest { id }` risolve su un ObjectId non popolato?**
   - RESOLVED: no (Buffer); populate annidato con `select: '_id'` (Q3, probe).
4. **Lo snapshot della subscription riusa `findOne`?**
   - RESOLVED: sì, sia lo snapshot (`characters.resolver.ts:113-115`) sia il change stream (`characters.service.ts:91`).
5. **I marker delle quest stanno in `City.pointsOfInterest`? Il marker della città vi compare?**
   - RESOLVED sui dati reali: sì 4/4 e sì 167/167; marker di quest mai uguale a un marker di città (Q4).
6. **Serve un indice su `pointsOfInterest`?**
   - RESOLVED: no in questa fase (167 città); rimandato a Phase 10.
7. **Forma del guard owner-only e come la whitelist la enumera?**
   - RESOLVED: opzione `ownerOnly` sullo stesso `OWNERSHIP_KEY` + `EXPECTED_OWNER_ONLY_HANDLERS` col matcher (Q5).
8. **Dove montare `acceptQuest`?**
   - RESOLVED: `QuestAcceptanceResolver` in `QuestAcceptanceModule` (+ `AuthzModule`) (Q5).
9. **`serverTime`: scalar e autenticazione?**
   - RESOLVED: `@Query(() => Date)` ⇒ `DateTime!`, nessun decorator ⇒ `UNAUTHENTICATED` senza bearer (Q6, probe).
10. **`completedQuests` va toccato?**
    - RESOLVED: sì, solo populate con `select: '_id'` (C2) — emendamento proposto a D-13.
11. **`pendingQuest(id)` per le nuove corsie?**
    - RESOLVED: estendere `readOwnPendingQuestId` alle tre corsie (C4).
12. **Party vuoto vs assente?**
    - RESOLVED: trattati allo stesso modo (legacy) (Q1).
13. **`pointsSpent` non-null sui PendingQuest legacy?**
    - RESOLVED: `Int!` con `default: 0`; i percorsi GraphQL usano documenti idratati (Q3, probe).
14. **`QUEST_SLOT_BUSY` vs `QUEST_ALREADY_TAKEN` per la stessa worldMission riaccettata mentre è attiva?**
    - RESOLVED: `QUEST_ALREADY_TAKEN` (ripetibilità valutata prima della corsia, Q7); i test D-19 restano validi.

## Decisioni tecniche del CONTEXT: tengono o vanno emendate

| Decisione | Esito | Emendamento proposto (testo minimo) |
|---|---|---|
| **D-18** | Tiene nella sostanza; la lettera "`$addToSet` di `registeredAdventurers` + guard di capienza per rango, es. `$expr` sul conteggio per titolo" non è realizzabile su `[String]` | Sostituire la frase sull'update del Quest con: "per le condivise update condizionale sul `Quest` che, nello stesso `findOneAndUpdate`, fa `$push` su un campo **interno** `registrations: [{ character, title }]` (mai esposto su GraphQL) e `$addToSet` su `registeredAdventurers`, con guard anti-duplicato e guard di capienza `$expr` sul conteggio di `registrations` per titolo (o totale per i dati legacy)". Aggiungere: "Il filtro del claim riafferma anche `status.title`, `status.location` e, per i non ripetibili, l'assenza della quest da `completedQuests`; lo User da debitare è l'identità autenticata (`identity.userId`), già verificata owner dal guard". |
| **D-19** | Tiene; servono tre aggiunte | Aggiungere ai test: "`character(id)` con `completedQuests` non vuoto risolve `completedQuests { id }`; il proprietario legge con `pendingQuest(id)` il PendingQuest delle corsie story/worldMission; i test Phase 4 su `costCopper`/`INSUFFICIENT_FUNDS`/`RangeError` della primitiva sono sostituiti; il test del boot reale che vietava `acceptQuest` nello schema è riscritto in positivo". |
| **D-20** | Tiene | Nessuno. Nota operativa: il comando lint del gate è quello filtrato di Phase 6 (righe `^\s+[0-9]+:[0-9]+` senza `prettier/prettier|prefer-const` ⇒ 0) più `npx eslint <file toccati>`. |
| D-13 (non tecnico, ma toccato) | Da emendare per C2 | Sostituire "`completedQuests` invariato" con "`completedQuests` invariato nel contenuto e nel tipo, popolato con la sola proiezione `_id` (senza populate `completedQuests { id }` fa fallire l'intero `character`)". |
| D-10 | Tiene sui dati reali | Nessuno (il ramo `markerLocation` è ridondante ma conforme). |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | runtime/test | ✓ | v22.12.0 | — |
| mongod (mongodb-memory-server) | integration | ✓ | 8.2.6 (default locale), 8.0.4 (pin CI) in cache | — |
| Redis effimero | solo `test/app.int-spec.ts` | ✓ | come baseline | — |
| DB di sviluppo (Atlas, da `.env`) | verifica dati D-10 / UAT | ✓ (raggiungibile) | — | — |
| mongosh | ispezioni manuali | ✗ | — | script Node col driver del repo |

**Missing dependencies with no fallback:** nessuna. **Dati da preparare per la UAT:** 5 story con `requiredPoints` > 0 e `minTitle` a scala, una worldMission con `party`, boss con party; marker nei `pointsOfInterest` (già vero per le 4 quest esistenti).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.1.3 + ts-jest 29.4.1; progetti `unit` (`src/**/*.spec.ts`, `test/**/*.spec.ts`) e `integration` (`*.int-spec.ts`, `MongoMemoryReplSet` globale da `test/setup/global-setup.ts`) |
| Config file | `package.json` → `jest.projects` |
| Quick run command | `npx jest src/quests src/gameRules src/authz src/time src/characters --selectProjects unit` |
| Integration command | `npx jest src/quests/acceptance src/characters/character-quest-lanes.int-spec.ts src/pendingQuests test/app.int-spec.ts --selectProjects integration --runInBand` |
| Full suite command | `npm run test:unit && npm run test:int` |
| Estimated runtime | unit ~4 s; int-spec di fase ~15–25 s; `test/app.int-spec.ts` ~10 s; suite completa integrazione ~80–90 s |

**Baseline misurata (2026-10-21, `feat/07-quest-lanes-quest-04` pulito su `e18771f`):** `npx jest --selectProjects unit` → **80 suite, 1114 test**, verdi (3,4 s). Integration: 46 file `*.int-spec.ts` (non rilanciata per regola; ultima misura Phase 6: 46 suite / 550 test, ~77 s).

### Phase Requirements → Test Map
| Req / D | Behavior | Type | File | Automated Command | Exists? |
|---|---|---|---|---|---|
| D-01 | `laneOf` per ogni `QuestType` (boss → standard), `lanePathOf` | unit | `src/quests/acceptance/quest-lanes.spec.ts` | `npx jest src/quests/acceptance --selectProjects unit` | ❌ Wave 0 |
| D-05/D-06/D-09/D-16 | `meetsTitle` (story esatto, altri `>=`, minTitle assente), `isRepeatable`, `isShared`, `pointsCostOf` (null/0/-1/1.5/`2**53` ⇒ invalid; standard ⇒ 0), `waitingTimeOf`, ordine di `classifyEligibility` | unit | `src/quests/acceptance/quest-eligibility.spec.ts` | idem | ❌ |
| D-04/D-18 | `capacityRuleOf` (party, rango assente ⇒ 0, legacy totale, illimitato), forma di `laneClaimFilter`/`registrationFilter`/`registrationUpdate` | unit | `src/quests/acceptance/quest-acceptance.updates.spec.ts` | idem | ❌ |
| D-14 | nuove factory, ogni codice prodotto una volta | unit | `src/gameRules/game-rule.exception.spec.ts` | `npx jest src/gameRules --selectProjects unit` | ✅ estendere |
| D-11 | policy: innkeeper su altrui con `ownerOnly` ⇒ FORBIDDEN, su inesistente ⇒ NOT_FOUND, sul proprio ⇒ owner; guard passa `ownerOnly`; senza opzione comportamento invariato | unit | `src/authz/ownership/character-access.policy.spec.ts`, `ownership.guard.spec.ts` | `npx jest src/authz --selectProjects unit` | ✅ estendere |
| D-15 | `ServerTimeResolver` restituisce `Clock.now()` | unit | `src/time/server-time.resolver.spec.ts` | `npx jest src/time --selectProjects unit` | ❌ |
| BE-QUEST-02/03 | service: 3 concorrenti stessa corsia ⇒ 1 PendingQuest, 1 debito, 2 `QUEST_SLOT_BUSY`; story + hunt ⇒ entrambe; seconda story ⇒ `QUEST_SLOT_BUSY`; `INSUFFICIENT_POINTS` ⇒ zero scritture; party 1 hero: 2 hero concorrenti ⇒ 1 ok + 1 `QUEST_FULL`, paladin ⇒ `QUEST_FULL`; legacy totale; story completata ⇒ `QUEST_ALREADY_TAKEN`; worldMission già registrata ⇒ `QUEST_ALREADY_TAKEN`; titolo ⇒ `QUEST_TITLE_MISMATCH`; fuori città e marker orfano ⇒ `QUEST_NOT_IN_CITY`; story senza `requiredPoints` ⇒ `QUEST_NOT_ACCEPTABLE` senza scritture; `coins` mai toccati; `pointsSpent` = costo; `waitingTime` 0 per story/worldMission e `timeToComplete ?? 0` per standard; `registeredAdventurers` sincronizzato, story non registrata; NOT_FOUND quest/personaggio/archiviato | integration | `src/quests/acceptance/quest-acceptance.service.int-spec.ts` (riscritto) | `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand` | ✅ riscrivere |
| BE-QUEST-01/02, D-11/D-12 | wire: `acceptQuest` ⇒ `{ successful: true }`; `errors[0].extensions` esattamente `{ code }` per ogni codice; innkeeper su altrui ⇒ `FORBIDDEN`, nessun audit; id/questId malformati ⇒ `NOT_FOUND`; senza bearer ⇒ `UNAUTHENTICATED`; `characterUpdated` emette con la corsia popolata e `pendingQuest { id startDate waitingTime pointsSpent quest { id } }` | integration | `src/quests/acceptance/accept-quest.resolver.int-spec.ts` | `npx jest src/quests/acceptance/accept-quest.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-QUEST-01, D-13, C2/C3 | `character(id)` con le tre corsie piene e `completedQuests` non vuoto: tutti gli `id` risolti; ref orfano ⇒ `null`; `characters` (innkeeper) idem | integration | `src/characters/character-quest-lanes.int-spec.ts` | `npx jest src/characters/character-quest-lanes.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| C4 | proprietario legge il PendingQuest story/worldMission con `pendingQuest(id)` | integration | `src/pendingQuests/pending-quests-authz.int-spec.ts` | `npx jest src/pendingQuests --selectProjects integration --runInBand` | ✅ estendere |
| BE-QUEST-04, D-15 | `serverTime` ISO entro 5 s dal clock del test; senza bearer `UNAUTHENTICATED` | integration | dentro `accept-quest.resolver.int-spec.ts` o `src/time/server-time.int-spec.ts` | come sopra | ❌ |
| D-11/D-19/D-20 | boot reale: `EXPECTED_OWNERSHIP_HANDLERS` + `QuestAcceptanceResolver.acceptQuest`, `EXPECTED_OWNER_ONLY_HANDLERS`, innkeeper/public invariati; SDL con `acceptQuest(request: AcceptQuestRequest!): CommonResponse!`, `serverTime: DateTime!`, `activeStoryQuest: PendingQuest`, `pointsSpent: Int!`, `party: [QuestPartySlot!]!`, senza `registrations|QuestAcceptance|INSUFFICIENT_FUNDS`; `{ serverTime }` e `acceptQuest` senza bearer ⇒ `UNAUTHENTICATED` | integration + CI | `test/app.int-spec.ts` | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --stat src/schema.gql` | ✅ estendere |
| D-21 | BACKEND-NOTES con SDL verbatim, codici, populate, `serverTime`, QUEST-05, dati UAT, note Phase 9 | manual review | `.planning/phases/07-quest-lanes-quest-04/BACKEND-NOTES.md` | — | ❌ |

### Sampling Rate
- **Per task commit:** spec unit toccati con `--selectProjects unit` + il singolo int-spec toccato con `--selectProjects integration --runInBand`.
- **Per wave merge:** quick run unit + integration command di fase.
- **Phase gate:** `npm run test:unit && npm run test:int` verdi (≥ 80+N suite unit, ≥ 46+N integrazione); `npm run build`; lint filtrato ⇒ 0 righe; `npx eslint <file toccati>`; `src/schema.gql` rigenerato e committato con diff solo additivo, poi `git diff --exit-code src/schema.gql`; quindi `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `test/authz/characters-test-app.ts`: registrare `PendingQuest` e `Quest` (C6); `CharactersModule` idem.
- [ ] Fixture: `buildQuest` con `party: []`; helper per una città con POI reali (`persistCity` + `persistPoi` per il marker della quest e per la posizione del personaggio); `persistUser` con `twitchPoints`.
- [ ] Spec unit vuoti RED: `quest-lanes.spec.ts`, `quest-eligibility.spec.ts`, `quest-acceptance.updates.spec.ts`, `server-time.resolver.spec.ts`.
- [ ] `test/app.int-spec.ts`: whitelist e asserzioni SDL RED; riscrittura del test negativo (C5).
- Framework install: nessuno.

**Manual-only:** UAT su device con dati reali preparati (story a scala, worldMission con party): verifica del countdown con `serverTime` e della corsia sul FE — dopo la FE Phase 6.

## Security Domain

### Applicable ASVS Categories (L1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | sì (indiretto) | `AuthGuard` globale deny-by-default; `serverTime` e `acceptQuest` autenticati |
| V3 Session Management | no | invariato |
| V4 Access Control | sì | `@OwnsCharacter(…, { ownerOnly: true })`; nessun bypass innkeeper; whitelist enumerata nel boot reale |
| V5 Input Validation | sì | solo `id`/`questId` dal client, validati con `isObjectIdHex`; corsia, costo, tempi dal catalogo |
| V6 Cryptography | no | — |
| V7 Error Handling & Logging | sì | codici stabili `{ code }`; WARN di catalogo col solo id della quest |
| V11 Business Logic | sì | transazione tutto-o-niente, guard nel filtro, capienza atomica, debito con `$gte` |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Accettare per conto di un altro / GM che spende i punti altrui | Elevation | owner-only, `FORBIDDEN` anche all'innkeeper |
| Scegliere la corsia o il costo dal client | Tampering | `laneOf` e `pointsCostOf` dal catalogo |
| Doppio click / richieste concorrenti ⇒ doppio debito | Tampering | claim condizionale in transazione (probe: 1 debito) |
| Overbooking del party | Tampering | `$expr` nello stesso update (probe) |
| Quest gratuita per catalogo incompleto | Elevation (economia) | `QUEST_NOT_ACCEPTABLE` fail-closed |
| Accettare da fuori città | Tampering | query città + posizione riaffermata nel filtro |
| Fuga di stato di gioco altrui via subscription | Information disclosure | filtro per evento esistente (`mayDeliver`) invariato |

## Sources

### Primary (HIGH confidence)
- Codice del repo citato per `file:riga` (acceptance, wallet, gameRules, modelli, authz, characters, pendingQuests, starting-location, harness, `test/app.int-spec.ts`, `schema.gql`).
- `node_modules/mongoose/lib/connection.js:719-760` (transaction → `withTransaction`, reset fra i tentativi); `node_modules/mongodb-memory-server-core/lib/util/resolveConfig.js:52` (default 8.2.6); `.github/workflows/ci.yml:13` (pin 8.0.4).
- Probe empirici (spec usa-e-getta, cancellati): forme Mongo e concorrenza su 8.0.4 e 8.2.6; risoluzione GraphQL di `pendingQuest`/`completedQuests`/`serverTime` sul harness reale.
- Script di sola lettura sul DB di sviluppo (soli conteggi e tipi).

### Secondary (MEDIUM confidence)
- `.planning/phases/04-integrita-economica-atomics/BACKEND-NOTES.md` §7 (indicazioni per la Phase 7).

### Tertiary (LOW confidence)
- Nessuna.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nessuna dipendenza nuova, versioni lette da `node_modules`.
- Architecture: HIGH — transazione, capienza e populate provati sul harness reale.
- Dati reali: HIGH per lo stato attuale del DB di sviluppo (4 quest, 167 città); da riverificare se il catalogo cambia prima della UAT.
- Pitfalls: HIGH — ognuno ha un probe o una riga di codice.

**Research date:** 2026-10-21
**Valid until:** 2026-11-20 (stack stabile; rivedere se cambia il catalogo a DB o la versione di Mongoose)
