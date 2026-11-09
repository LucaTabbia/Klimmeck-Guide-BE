# Requirements: Klimmeck Guide Backend — v1.0 Core Loop (BE)

**Defined:** 2026-07-16
**Core Value:** Il backend è la fonte di verità affidabile e sicura dello stato di gioco: nessun client può alterare uno stato che non gli appartiene, e ogni valore mostrato dal frontend è calcolato e garantito server-side.

## FE Traceability Reference

Ogni requirement BE indica quale requirement/fase FE sblocca. Fonte: `Klimmeck-Guide/.planning/REQUIREMENTS.md` e `ROADMAP.md` (repo FE). Vincoli d'ordine dichiarati dal FE:

- **QUEST-04** e **TRAVEL-01** devono essere su staging prima delle fasi FE 6 e 7
- Il contratto **connection_init** serve alla fase FE 3
- **FCM** serve alla fase FE 5
- **Role guard + audit log** in lockstep con la fase FE 10 (non deferiti)
- L'**auth BE** deve atterrare prima o insieme alla fase FE 11 (anticipata: vedi ROADMAP)
- Le fasi FE **13–17** (negozi, companion della generazione quest, cibo, imboscate, lore — aggiunte il 2026-10-29) partono solo dopo la merge delle fasi BE **12–16** su `develop`; la BE **Phase 11** (popolamento) fornisce i dati di ogni UAT FE

## v1 Requirements

### Test Foundation (BE-TEST)

- [x] **BE-TEST-01**: La suite Jest gira contro `mongodb-memory-server` in modalità replica set (change stream e transazioni funzionanti nei test), con setup/teardown condiviso e CI-ready
- [x] **BE-TEST-02**: I test unit mockano le code Bull al confine DI (`getQueueToken`); i test di integrazione dei processor usano un Redis effimero reale (no `ioredis-mock`, incompatibile con Bull)
- [x] **BE-TEST-03**: Esistono fixture/factory riusabili per i modelli di dominio (User, Character, Quest, Spell, Road, POI)
- [x] **BE-TEST-04**: Il WIP spell use/recovery presente nel working tree è consolidato con TDD e committato: ordine validazione corretto in `useSpell` (spell verificata prima del decremento), processor coperto da test

### Authentication (BE-AUTH)

- [x] **BE-AUTH-01**: Login `Twitch OAuth → sessione BE`: il BE media l'authorization code flow Twitch (endpoint start/callback, `client_secret` solo lato server), valida il token una tantum su `id.twitch.tv/oauth2/validate`, risolve/crea lo User per `twitchId` e — al riscatto di un login ticket monouso — restituisce un JWT proprio a TTL breve con claims `{userId, twitchId, role}` più un refresh token rotante → sblocca FE Phase 11 (AUTH-01..07)
  - _Emendato il 2026-10-06 (Phase 2 CONTEXT D-01): la formulazione originale `twitchAccessToken → JWT` presupponeva che il FE potesse completare da solo l'OAuth dance; Twitch non supporta PKCE e richiede `client_secret` per l'authorization code grant, quindi lo scambio avviene sul BE. Intento invariato: una prova d'identità Twitch scambiata una tantum, zero chiamate Twitch per-request._
- [x] **BE-AUTH-02**: Guard globale (`APP_GUARD`) su tutte le operazioni GraphQL HTTP: ogni operazione non decorata `@Public()` richiede un JWT valido → FE HARDEN-02
- [x] **BE-AUTH-03**: Le subscription WS sono autenticate via `connection_init`: JWT nel payload (chiave `Authorization: Bearer <jwt>`), verificato in `onConnect`, connessione rifiutata se assente/invalido, identità disponibile ai resolver → FE SYNC-06, Phase 3 (chiude Open Question #1 della Phase 11 FE)
- [x] **BE-AUTH-04**: Il contratto auth (login, header, connection_init, comportamento dopo token refresh, scope Twitch richiesti) è documentato in un handoff per il FE (`BACKEND-NOTES` della fase) → chiude Open Questions #1 e #2 della Phase 11 FE
- [x] **BE-AUTH-05**: Modalità dev fail-closed: con `DEV_AUTH_ENABLED=true` (impossibile in produzione, guard su NODE_ENV) il BE accetta l'identità stub del FE (`DEV_AUTH_ACCESS_TOKEN` → user/role configurati) così le fasi FE 2–10 continuano a funzionare → compatibilità FE DEV-AUTH-01..05
- [x] **BE-AUTH-06**: I resolver derivano l'identità dal context autenticato (decorator `@CurrentUser()`), mai da `twitchId`/`userId` passati come argomenti; gli endpoint REST (Cloudinary) sono coperti dallo stesso guard

### Character Creation (BE-CHAR) — fase inserita 02.1

- [x] **BE-CHAR-01**: Mutation `createCharacter(input: CreateCharacterInput!): User!` sull'identità autenticata (`@CurrentUser()`, nessun `userId` in input): crea il `Character` con lo stato iniziale definito dal BE e assegna `User.currentCharacter` in modo atomico (una sola creazione per utente; seconda chiamata → `CHARACTER_ALREADY_EXISTS`) → FE CHAR-01, CHAR-07
- [x] **BE-CHAR-02**: Validazione autoritativa dell'input: nome 2–20 caratteri dopo trim con sole lettere Unicode/spazi/apostrofi/trattini e **unico case-insensitive**; età intera nel range della razza; background facoltativo ≤ 500 caratteri; enum validi. Errori con codici stabili in `extensions.code` (`CHARACTER_NAME_INVALID`, `CHARACTER_NAME_TAKEN`, `CHARACTER_AGE_OUT_OF_RANGE`, `CHARACTER_ALREADY_EXISTS`) → FE CHAR-02, CHAR-03, CHAR-04, CHAR-09
- [x] **BE-CHAR-03**: Query `raceTraits` che espone `minAge`/`maxAge` per ogni `RaceType`; la stessa tabella guida la validazione di BE-CHAR-02 (nessuna copia nel FE) → FE CHAR-03 (campo età abilitato dopo la razza)
- [x] **BE-CHAR-04**: `imagePath` facoltativo: URL restituito dal REST autenticato `POST /cloudinary/uploadImage` (cartella `characters_profile`, già esistente); nessun controllo NSFW in questa fase — il controllo autoritativo è debito esplicito di BE-HARD → FE CHAR-05 (CHAR-06 rinviato dall'utente il 2026-10-08)
- [x] **BE-CHAR-05**: Handoff `BACKEND-NOTES.md` della fase 02.1 con schema, input, codici d'errore, stato iniziale del personaggio ed esempi → consumato da FE Phase 2

### Character Deletion (BE-CHAR) — fase inserita 03.1, richiesta dalla FE Phase 4 (2026-10-15)

- [x] **BE-CHAR-06**: Mutation `deleteCharacter: User!` sull'identità autenticata (nessun argomento): archivia il `currentCharacter` del chiamante (soft delete con `deletedAt`/`deletionReason`), azzera `User.currentCharacter` atomicamente (transazione, una sola archiviazione anche in concorrenza) e restituisce lo `User` aggiornato; senza personaggio corrente → `CHARACTER_NOT_FOUND` → FE SET-05
- [x] **BE-CHAR-07**: Il personaggio archiviato è invisibile ai percorsi giocatore (`character`, `characterUpdated`, mutation sotto ownership, processor/job) e il suo nome torna disponibile per `createCharacter` (indice unico case-insensitive limitato ai documenti attivi, verifier di boot aggiornato) → FE SET-05, CHAR-04
- [x] **BE-CHAR-08**: Dopo la cancellazione `userUpdated` emette `currentCharacter: null` (change stream `users` esistente) e nessun `characterUpdated` viene emesso per documenti archiviati; un nuovo `createCharacter` dello stesso utente riesce → FE SYNC-05, SET-05
- [x] **BE-CHAR-09**: Handoff `BACKEND-NOTES.md` della fase 03.1 con schema, codici, semantica dell'archivio, risposte alle domande aperte del FE ed esempi; `src/schema.gql` rigenerato → consumato da FE Phase 4

### Authorization & Admin (BE-AUTHZ)

- [x] **BE-AUTHZ-01**: Ownership enforcement: solo il proprietario può mutare il proprio Character (equip, spell, transazioni, quest, travel); tentativi su character altrui → 403; l'innkeeper è esente dall'ownership e il bypass è auditato (emendato 2026-10-14) → FE HARDEN-02
- [x] **BE-AUTHZ-02**: Role guard `@Roles(innkeeper)` su tutte le operazioni admin (CRUD quest/enemies/POI/roads, teleport, outcome assignment, approve/reject); non-innkeeper → 403 → FE ADMIN-07, HARDEN-02
- [x] **BE-AUTHZ-03**: Le subscription filtrano per identità autenticata, non per argomento client: `characterUpdated` emette solo al proprietario (o innkeeper), idem per lo user stream → FE SYNC-01/02 sicuri
- [x] **BE-AUTHZ-04**: Ogni azione admin è audit-loggata in collection persistente (who, what, when, target, args completi, esito), TTL 90 giorni, consultabile a DB (emendato 2026-10-14) → FE ADMIN-08

### Real-Time Sync (BE-SYNC) — aggiunta 2026-10-14, contratto richiesto dalla FE Phase 3 e assorbito nella Phase 3

- [x] **BE-SYNC-01**: Subscription `userUpdated: User!` senza argomenti: identità dal bearer del `connection_init`; emette lo `User` dell'utente autenticato a ogni modifica del documento (`twitchPoints`, `role`, `currentCharacter`), prodotta da un change stream su `users` → FE SYNC-01/05/07
- [x] **BE-SYNC-02**: Snapshot su subscribe: ogni (ri)sottoscrizione a `userUpdated` e `characterUpdated` riceve immediatamente il documento corrente, poi gli eventi live (chiude il gap di riconnessione WS senza replay) → FE SYNC-03

### Data Integrity (BE-ATOM)

- [x] **BE-ATOM-01**: Tutti i debiti/crediti di bilancio (`Character.coins`, `User.twitchPoints`) usano update atomici condizionali (`$inc` con guard `$gte`) o transazioni Mongo: mai read-modify-write; saldo insufficiente → errore, mai negativo
- [x] **BE-ATOM-02**: `doTransaction` è atomico: validazione di fattibilità prima dell'esecuzione, coins+items applicati in un'unica unità (transazione), nessuno stato parziale su fallimento
- [x] **BE-ATOM-03**: L'accettazione quest è atomica e single-flight: debito del costo e assegnazione della quest in un'unica operazione; doppia accettazione concorrente → una sola vince → FE QUEST-06
- [x] **BE-ATOM-04**: Le mutazioni degli array equip/activeSpells usano optimistic concurrency (versionKey) o update atomici: due equip concorrenti non superano `maxActiveSpells`
- [x] **BE-ATOM-05**: Gli usages delle spell sono decrementati/ripristinati atomicamente; il recovery job è idempotente e non porta gli usages oltre il massimo

### Notifications / FCM (BE-NOTIF)

- [x] **BE-NOTIF-01**: Mutation di registrazione token FCM per-device (upsert per userId+deviceId), con pruning dei token invalidi (`registration-token-not-registered`) → FE NOTIF-01
- [x] **BE-NOTIF-02**: Servizio push condiviso domain-agnostic (`sendToUser`, topic broadcast) basato su firebase-admin (FCM HTTP v1); il push è side-channel non autoritativo: porta al massimo un ID, mai stato di gioco
- [x] **BE-NOTIF-03**: Push travel-end, quest-end e streamer-live inviati agli utenti interessati come data message (gestibili nei tre app state FE) → FE NOTIF-03/04/05

### Twitch Points Sync (BE-POINTS)

- [x] **BE-POINTS-01**: Endpoint webhook EventSub (REST, `@Public()`, `rawBody: true`) con verifica firma HMAC-SHA256 su `message_id + timestamp + raw_body`, gestione challenge e rifiuto messaggi fuori dalla replay window → SYNC punti FE
- [x] **BE-POINTS-02**: Accredito `twitchPoints` idempotente: dedup per `message_id` (delivery at-least-once) + `$inc` atomico; la redemption della custom reward accredita 1:1 → FE SYNC-01/07
- [x] **BE-POINTS-03**: Lifecycle delle subscription EventSub gestito (app access token, creazione/verifica/rinnovo di `channel_points_custom_reward_redemption.add` e `stream.online`); `stream.online` alimenta il push streamer-live → FE NOTIF-04

### Quest Lanes (BE-QUEST)

- [x] **BE-QUEST-01**: `Character` espone `activeStoryQuest` e `activeWorldMissionQuest` (PendingQuest opzionali, indipendenti da `pendingQuest`) su schema GraphQL e payload della subscription → FE QUEST-04, sblocca Phase 6 FE (staging)
- [x] **BE-QUEST-02**: Le mutation di accettazione rispettano le corsie parallele: story/worldMission convivono col `pendingQuest` standard; una corsia occupata rifiuta solo la propria tipologia → FE QUEST-04
- [x] **BE-QUEST-03**: Cost model server-side: quest `story`/`worldMission` debitano `User.twitchPoints`, le altre debitano `Character.coins`; eleggibilità e debito sono autoritativi lato BE → FE QUEST-05
  - _Emendato il 2026-10-21 (Phase 7 CONTEXT D-08/D-09): **nessuna quest costa monete** (`Character.coins` non viene mai debitato); solo `story`/`worldMission` debitano `requirements.requiredPoints` punti canale dell'utente proprietario. L'eleggibilità server-side comprende corsia libera, posizione nella città del marker, titolo (esatto per le story), non ripetibilità, capienza del party per rango._
- [x] **BE-QUEST-04**: `pendingQuest` (startDate + waitingTime) è emesso con timestamp server-side coerenti per il countdown FE → FE QUEST-07

### Travel (BE-TRAVEL)

- [x] **BE-TRAVEL-01**: `Character.status` espone `activeTravel { road, startTime, endTime, duration }` su schema e subscription → FE TRAVEL-01, sblocca Phase 7 FE (staging)
- [x] **BE-TRAVEL-02**: Mutation `startTravel(poiId)`: valida che il character sia libero (no travel attivo), calcola percorso/ETA server-side via graphology e persiste `activeTravel`; esiste una query di preview ETA per la conferma FE → FE TRAVEL-02
- [x] **BE-TRAVEL-03**: Completamento server-side: alla scadenza di `endTime` il BE cancella `activeTravel`, aggiorna `location` ed emette via subscription + push travel-end. Il DB è la fonte di verità dei timer (endTime persistito): job Bull come trigger + reconciler al boot per i viaggi scaduti → FE TRAVEL-03/04
- [x] **BE-TRAVEL-04**: Teleport admin atomico: override di `location` e clear di `activeTravel` (incluso il job pendente) in un'unica operazione → FE ADMIN-04

### Combat Result (BE-COMBAT)

- [x] **BE-COMBAT-01**: Entità `CombatResult` persistita: HP prima/dopo, consumabili usati, spell usate, injuries, rewards (equipment/items/coins), XP → FE COMBAT-02..05 _(realizzata come `QuestResult` e query `questResult(id)`, 09-CONTEXT D-19/D-20)_
- [x] **BE-COMBAT-02**: Delivery ibrida: la subscription emette il payload completo in foreground; il push FCM (data message) porta solo `resultId`; esiste la query `combatResult(id)` per il requery → FE COMBAT-01, contratto chiuso per la Phase 9 FE _(realizzata come `QuestResult` e query `questResult(id)`, 09-CONTEXT D-19/D-20)_
- [x] **BE-COMBAT-03**: Gli esiti delle quest sono server-side: la corsia standard si risolve da sola alla scadenza del countdown (quest senza nemico = successo con premi; con nemico = motore di combattimento dietro una porta sostituibile, regole segnaposto) e l'innkeeper completa story/worldMission solo con esito positivo tramite mutation role-guarded, con override opzionali per personaggio (HP, ferite, consumi, magie) e nessun grade; ogni esito produce un risultato per personaggio e aggiorna il Character atomicamente → FE ADMIN-05/06 _(emendato 2026-10-24, 09-CONTEXT D-01..D-04)_

### Admin Queue (BE-ADMIN)

- [x] **BE-ADMIN-01**: L'innkeeper ha una vista live (query + subscription) delle pending request story/worldMission, con i dati necessari al filtro FE su `activeTravel` → FE ADMIN-02
- [x] **BE-ADMIN-02**: Mutation di completamento (solo esito positivo, nessun reject né rimborso) per le pending request story/worldMission, role-guarded e audit-loggata, con override opzionali per personaggio → FE ADMIN-03 _(emendato 2026-10-24, 09-CONTEXT D-03/D-04)_

### Spell State & Recovery (BE-SPELL) — fase inserita 9.1, richiesta dalla FE Phase 8 (2026-10-27)

- [x] **BE-SPELL-01**: `CharacterStatus.spellStates: [SpellState!]!` con `SpellState { spell: Spell!, usages: Int!, recoveries: [DateTime!]! }`: una voce per ogni magia conosciuta, `recoveries` crescente (un istante per ogni uso in recupero), contratto additivo su query e `characterUpdated`; `ActiveSpell.usages` coincide sempre con lo stato → FE SPELL-05
- [x] **BE-SPELL-02**: Usi e recuperi appartengono alla magia, non allo slot: `equipSpell`/`unequipSpell` non li toccano e il recupero prosegue anche fuori dagli slot («Il recupero vale sempre, che la magia venga equipaggiata o disequipaggiata. Il timer di recupero non si interrompe mai», utente 2026-10-27); Phase 4 D-11 superata → FE SPELL-03/04/05
- [x] **BE-SPELL-03**: `useSpell` e i consumi degli esiti (Phase 9) scrivono stato e `dueAt` nello stesso update atomico; processor idempotente (`dueAt` nel job, regola per i job legacy senza `dueAt`); reconciler al boot + sweep `SPELL_RECOVERY_SWEEP_INTERVAL_MS` rendono il DB la fonte di verità dei recuperi (accodamento best-effort)
- [x] **BE-SPELL-04**: Migrazione idempotente al boot per i personaggi esistenti; invariante `status.spells` ↔ `spellStates` mantenuto da ogni scrittore (apprendimento) e verificato al boot; handoff `BACKEND-NOTES.md` per la FE Phase 8 con SDL, esempi, codici e dati UAT; `src/schema.gql` rigenerato

### Quest Result Delivery (BE-RESULT) — fase inserita 9.2, richiesta dalla FE Phase 9 (2026-10-27)

- [x] **BE-RESULT-01**: `unacknowledgedQuestResults: [QuestResult!]!` — i risultati dell'utente autenticato con `acknowledgedAt` nullo, in ordine di `resolvedAt` crescente con un tetto, compresi quelli del personaggio archiviato (`death`); nessun bypass innkeeper; `QuestResult.acknowledgedAt: DateTime` additivo, nullo a ogni insert → FE COMBAT-09
- [x] **BE-RESULT-02**: `acknowledgeQuestResult(id: String!): CommonResponse!` idempotente (update condizionale su `acknowledgedAt` nullo; già confermato ⇒ `successful: true`), riservata al proprietario del risultato (`FORBIDDEN` anche per l'innkeeper), `NOT_FOUND` per id malformato/inesistente, nessun audit; per un risultato `death` la conferma stacca anche `User.currentCharacter` nella stessa transazione e la morte non lo stacca più («currentCharacter resta sul morto fino alla conferma», utente 2026-10-27) → FE COMBAT-09
- [x] **BE-RESULT-03**: Dopo l'avvio di una quest registrata l'archivio di un partecipante non libera il suo posto (registrazione mantenuta come segnaposto fino alla conclusione; la quest si risolve con chi resta; roster di soli segnaposto ⇒ quest di nuovo non avviata); prima dell'avvio la regola di Phase 8 D-30 resta — «finché una missione non è conclusa il foglio resta strappato sulla board una volta che i posti sono pieni» (utente 2026-10-27) → FE COMBAT-10
- [x] **BE-RESULT-04**: `src/schema.gql` rigenerato in modo additivo, indice per la lista dei non confermati, backfill idempotente al boot dei risultati precedenti al deploy, handoff `BACKEND-NOTES.md` per la FE Phase 9 con SDL, esempi, codici e dati UAT; emendamenti datati al handoff Phase 9 (§3, §14, §16)

### Hardening (BE-HARD)

- [x] **BE-HARD-01**: Tutti gli input GraphQL/REST validati con class-validator + `ValidationPipe` globale (ID Mongo validi, quantità non negative, lunghezze stringhe)
  - _Emendato il 2026-10-27 (Phase 10 discuss, D-01..D-04): `ValidationPipe` con `whitelist: true` senza `forbidNonWhitelisted` (proprietà sconosciute scartate), `@IsMongoId()` su ogni id (id malformato → `BAD_USER_INPUT`; i codici di dominio restano per gli id inesistenti), codice unico `BAD_USER_INPUT` con i soli nomi dei campi; la validazione manuale di `CompletePendingRequestInput` migra ai decoratori a semantica invariata._
- [x] **BE-HARD-02**: Introspection GraphQL disabilitata in produzione; error sanitization (nessun leak di ID/relazioni a client non autorizzati); CORS esplicito e documentato
  - _Emendato il 2026-10-27 (D-05..D-08): introspection e landing page accese solo se `NODE_ENV !== 'production'`; CORS chiuso senza configurazione («Chiuso e basta»); errori senza codice di dominio → `INTERNAL_SERVER_ERROR` + `requestId`, log server completo, suggerimenti dello schema spenti in prod; throttling minimo (`@nestjs/throttler`) su login/refresh/OAuth/webhook EventSub/REST Cloudinary con `TOO_MANY_REQUESTS`, limiti da env._
- [x] **BE-HARD-03**: `.env.example` committato con tutte le variabili documentate; nessun secret in repo; audit automatico (grep CI) su pattern di secret
  - _Emendato il 2026-10-27 (D-09..D-11): `gitleaks/gitleaks-action@v3` come job CI (storia completa, `.gitleaks.toml`); secret storico → rotazione alla fonte + allowlist del commit, nessuna riscrittura della storia; test di drift fra le chiavi lette dal codice e `.env.example` (incluse `SIGHTENGINE_*`, `THROTTLE_*`, `SPELL_RECOVERY_SWEEP_INTERVAL_MS`)._
- [x] **BE-HARD-04**: Le aree critiche (auth, atomics, EventSub, travel lifecycle) hanno coverage di test su happy path + concorrenza + failure mode
  - _Emendato il 2026-10-27 (D-16): `coverageThreshold` per cartella sulle aree critiche (auth, atomics, EventSub, travel) che fa fallire la CI; soglie iniziali = baseline misurata − 2 punti, alzate dopo i test nuovi._
- [x] **BE-HARD-05**: Moderazione delle immagini del personaggio con Sightengine (`models=nudity-2.1,offensive-2.0,text-content,face-age,gore-2.0,text,qr-content,self-harm`, chiavi `SIGHTENGINE_USER_ID`/`SIGHTENGINE_API_SECRET`): il buffer è moderato prima dell'upload su Cloudinary, policy severa con soglie dal model reference, rifiuto 422 `IMAGE_REJECTED`, fail-closed 503 `IMAGE_MODERATION_UNAVAILABLE`, chiavi obbligatorie in produzione; chiude il debito di BE-CHAR-04 → FE CHAR-05 (quick task FE per i codici) _(aggiunto 2026-10-27, decisione dell'utente)_
- [x] **BE-HARD-06**: Debiti rinviati dalle fasi precedenti chiusi a comportamento invariato: change stream riaperti con backoff per tutti i publisher, `removeOnFail` con limite, `KeyedSingleFlight` su `UserUpdatesPublisher`; indici dello sweep e di `spellStates.recoveries`, fix `Enemy.locations` e `PointOfInterest.type`, `types: ["jest"]`; refactor `commitRescue`, helper di priming unico, `@AuditTarget`; ritipizzazione dei ref `Mixed` a `ObjectId` con migrazione idempotente (ultima wave, gate proprio) _(aggiunto 2026-10-27)_
- [x] **BE-HARD-07**: Combattimento con i segnaposto (utente 2026-10-29): alla risoluzione di una quest avviata i registrati archiviati contano nel combattimento come se fossero presenti (fotografia del personaggio archiviato), senza risultato né ricompensa per loro; l'avvio di una quest senza posti è atomico con l'arrivo e la corsia aggiornata (`startDate`) arriva al FE con un evento. Supera la 9.2 D-07.
- [x] **BE-HARD-08**: Coda del GM e corsia standard (utente 2026-10-29, dal discuss della FE Phase 10): la voce della coda porta il campo additivo `pendingQuest` del personaggio (id della missione della corsia standard, nullo se libera) così il pannello nasconde chi è «in viaggio o in combattimento» per una quest accettata; il completamento di una richiesta è rifiutato con `QUEST_IN_PROGRESS` senza scritture finché un partecipante registrato ha la corsia standard occupata; il viaggio libero fra città non blocca. Supera la nota «nessun blocco se il partecipante è in viaggio» del handoff della Phase 9.

### World Content (BE-CONTENT) — Phase 11, aggiunta 2026-10-29

- [x] **BE-CONTENT-01**: Una cartella di contenuto versionata nel repo contiene i file (JSON/YAML) di lore, nemici, pet, magie, equipaggiamento, loot e quest fisse scritti a partire dal documento di world building dell'utente (testo estratto in `.planning/phases/11-popolamento-del-mondo/source/`, `.docx` fuori dal repo) e rivisti dall'utente; nessuna immagine nel repo → dati per le UAT FE 13–17
- [x] **BE-CONTENT-02**: Uno script CLI idempotente (`--dry-run / --apply / --verify`) carica i contenuti per `_id` (ogni voce YAML porta il proprio id; i riferimenti lore ↔ lore, `Enemy.relatedLore`, `City.relatedLore`, `Quest.infos.relatedLore`, marker e `prizes.spell` sono id) e riporta orfani, duplicati e violazioni di schema senza scrivere; rieseguito non cambia nulla; un secondo passaggio aggancia le URL Cloudinary per id (`content/images.yaml`)
- [x] **BE-CONTENT-03**: Circa 300 schede di lore a grana fine (culti in tre schede god/religion/ceremony; regni `state`, aree `region`, ere e magia `knowledge`, figure `character`, creature `enemy`/`animal`, piante `plant`) con `relatedLore` incrociate; ogni città agganciata alla propria lore e ogni lore di città alla regione → FE LORE-01..03
- [x] **BE-CONTENT-04**: 99 creature del documento + voci proposte dall'utente nell'intake (nemici umani, giganti, briganti…) + proposte per le fasce vuote; XP e `locations` dal documento; `lifePoints`, `damages` e debolezze da una formula per fascia in scala con `LEVEL_TABLE`, ritoccabili nel file
- [x] **BE-CONTENT-05**: Pet (6–8 dagli animali + 3–4 nuovi, con `speedModifier` e prezzi), le 77 magie esistenti più le 11 nuove (10 dal saggio sulla magia, sciamanesimo e Vuoto, più «Urlo del Berserker» voluta dall'utente) (`UseType`/`EnergyType`, `minXpToLearn`, usi, recupero), 27 equipaggiamenti unici rari/ultrarari/leggendari (uno per divinità, figure storiche e parti di mostro), equipaggiamento comune/uncommon e loot `hunger`/`heal`/`munition` con `power` tarato sulla regola del cibo (1 power = 3 minuti di marcia) _(emendato 2026-11-02, D-15)_
- [x] **BE-CONTENT-06**: Quest fisse e ripetibili per città — sempre una `heal` e un `job`, più una `hunt` sorteggiata dove vivono animali facili (solo animali della zona, PE ≤ 200), eventuali `crime`/`guard`/`study` (study di magia solo a Valantar: una sola, con magia sorteggiata alla risoluzione fra quelle apprendibili dal personaggio; Necrorian solo `dungeon`, Ferrion senza `crime`) — e una `dungeon` su ogni POI di tipo `dungeon`; quest di servizio (heal, job, guard, crime, study) sul marker della città, hunt e dungeon su POI distinti, premi per fascia; nessuna `enemy`/`boss` a mano → FE QGEN-04 _(emendato 2026-11-02, D-21)_
- [x] **BE-CONTENT-07**: Handoff `BACKEND-NOTES.md` con l'inventario dei dati, la procedura di ricarica per ambiente e le note per le fasi 12–16

### City Shops (BE-SHOP) — Phase 12, aggiunta 2026-10-29, emendata 2026-11-02 e 2026-11-03

- [x] **BE-SHOP-01**: `City.size` (village / city / capital, additivo, dedotto dal `CityType` con la tabella dei tipi speciali) e `City.hasShop` a schema; il pool di oggetti per città (ref a EquipmentItem / LootItem / Pet, additivo) a DB, **seminato una volta sola** (2026-11-03, dal branch, con una migrazione idempotente poi rimossa dal repo prima della merge, D-25) solo dove assente (regola di taglia, cibo e cure garantiti, pet per lore, Necrorian vuoto) e da allora curato solo a DB; un report di sola lettura (log al boot + query innkeeper) segnala i pool fuori regola senza correggerli → FE SHOP-02
- [x] **BE-SHOP-02**: Il client ottiene il pool di una città con `cityShop(cityId)` (equipaggiamenti, loot e pet, veti su `legendary` e `sellable: false` applicati in lettura); `City.size` e `City.hasShop` viaggiano con `cities`; le query di catalogo globali sono deprecate; `sellable` entra nello schema di `EquipmentItem`, `LootItem` e `Pet` → FE SHOP-02
- [x] **BE-SHOP-03**: `doTransaction` rifiuta con `ITEM_NOT_IN_SHOP` ogni acquisto (equip, loot, pet) fuori dal pool della città del marker o vietato, prima di qualsiasi scrittura e riaffermato nella transazione; vendita ammessa in ogni città anche per i leggendari posseduti (`SHOP_NOT_IN_CITY` invariato) → FE SHOP-03
- [x] **BE-SHOP-04**: Scorte infinite e prezzi del catalogo identici in ogni città; costanti configurabili per taglia (villaggio 10 + 12, città 16 + 18, capitale 24 + 24, con i pesi di rarità del CONTEXT D-08); i leggendari non compaiono in nessun pool; «la mano vince»: ciò che l'utente mette a DB viene venduto così com'è
- [x] **BE-SHOP-05**: Integration su villaggio / città / capitale, acquisto fuori pool e pet doppione senza scritture, vendita fuori pool e di un leggendario, acquisto / equipaggiamento / vendita di un pet; real boot con SDL additivo; handoff per la FE Phase 13
- [x] **BE-SHOP-06** _(aggiunto 2026-11-02)_: `assets.ownedPets` (additivo) distinto da `assets.pet` (compagno equipaggiato, letto dal viaggio); `TransactionItems.petAssets` (quantità 1) compra e vende pet, `PET_ALREADY_OWNED` sui doppioni, vendere il pet equipaggiato svuota lo slot; mutation `equipPet` / `unequipPet` guardate come `equipItem` (`@OwnsCharacter`: owner o innkeeper; `PET_NOT_OWNED`), nessun equipaggiamento automatico all'acquisto; migrazione al boot di `ownedPets` e `Pet.sellable` → FE SHOP-04

### Quest Generation (BE-QGEN) — Phase 13, aggiunta 2026-10-29

- [x] **BE-QGEN-01**: `QuestInfos.enemies: [{ enemy, quantity }]` sostituisce `infos.enemy` (SDL non additivo, dichiarato) nel populate, nel contesto del `CombatResolver` (più nemici e più tipi), nel `QuestResult`, nella clone della aid e nei fixture; migrazione idempotente `enemy` → `enemies` con `quantity: 1` → FE QGEN-01/02 _(emendato 2026-11-04, discuss: anche `QuestResult.enemies` + `stagesCleared`/`stagesTotal` sostituiscono `QuestResult.enemy`; CONTEXT D-01/D-02)_
- [x] **BE-QGEN-02**: Il generatore gira quando una quest generata si conclude o viene annullata, con uno sweep periodico configurabile e al boot, e su mutation innkeeper `generateQuests` auditata; ogni corsa è idempotente, single-flight e deterministica dato un RNG iniettato → FE QGEN-03
- [x] **BE-QGEN-03**: Genera solo `enemy` e `boss` (consumabili, `concludedAt`); `hunt` e `dungeon` non si generano mai (fisse, Phase 11); tetto di 3 quest generate attive per città, con le fisse e le GM escluse dal conto _(emendato 2026-11-04: boss = un solo nemico di fascia superiore con posti = ⌈PE / media del rango⌉ fra 2 e 6, 1 boss ogni 10; i 22 leggendari non si generano mai, riservati alle worldMission (`Enemy.legendary` seminato una tantum); CONTEXT D-03..D-06)_
- [x] **BE-QGEN-04**: La città è sorteggiata con peso decrescente al crescere della densità di quest generate nelle città vicine (distribuzione casuale non concentrata, città da 0 a 3 quest); il POI è un `pointsOfInterest` libero della città (nessuna quest non conclusa sul marker, marker della città escluso)
- [x] **BE-QGEN-05**: `minTitle` = rango meno coperto fra le quest generate attive di tutto il mondo (count a DB); i nemici sono estratti fra quelli con `locations` compatibili con i `type` del POI (`all` di riserva) e XP nella fascia del rango, uno o più tipi con quantità; boss con `requiredAdventurers` per rango _(emendato 2026-11-04: forma (a) nemico singolo della fascia o (b) branco di nemici più deboli con somma xp nella fascia; pool = zona del POI + habitat `city`, `all` di riserva, animali inclusi; un posto del rango; CONTEXT D-07..D-09)_
- [x] **BE-QGEN-06**: Premi (`prizeCoins`, `xpPrize`, `randomLoot` per rarità) dalla tabella per fascia; `recommendedLoot` fra equipaggiamento che colpisce `baseWeaknesses`/`energyWeaknesses` e consumabili contro i `damages` dei nemici _(emendato 2026-11-04: enemy 150 rame + 40 XP, boss 600 rame + 120 XP, × moltiplicatore di fascia; `randomLoot` = pool ampio per rango e tipo tirato per ogni partecipante, legendary solo da hero; CONTEXT D-19/D-20)_
- [x] **BE-QGEN-07**: Titolo da template per tipo e nemico (descrizione LLM resta v2, BE-FUT) _(emendato 2026-11-04: titolo con nemici e città, annuncio `infos.description` da 3 varianti per tipo nella voce del committente, `relatedLore` città + nemici; CONTEXT D-22)_
- [x] **BE-QGEN-08**: Integration su tetto, concorrenza (nessuna doppia quest sullo stesso POI), distribuzione, `FORBIDDEN` per l'adventurer; handoff per la FE Phase 14 con i piani FE gated prima della merge
- [x] **BE-QGEN-09**: Le `dungeon` sono esplorazioni a tappe: `enemies` in ordine = tappe di combattimento risolte in sequenza con gli HP residui da una porta `DungeonResolver` con segnaposto (prove di esplorazione neutre, premi solo a fine percorso, `stagesCleared`/`stagesTotal` nel risultato); le 40 dungeon fisse arricchite al boot una tantum e poi curate a DB (Phase 11 D-33; aggiunto 2026-11-04, CONTEXT D-10..D-13) → FE QGEN-02
- [x] **BE-QGEN-10**: `QuestPrizes.pet` (ref `Pet`, additivo): alla vittoria ogni vincitore ottiene il pet in `ownedPets` con probabilità 20% (già posseduto → nulla); il generatore lo assegna solo ai boss con probabilità 1%; pool = pet con `sellable: false`; il risultato espone il pet ottenuto (aggiunto 2026-11-04, CONTEXT D-21) → FE QGEN-02
- [x] **BE-QGEN-11**: `EquipmentItem.accessoryUseTypes: [AccessoryUseType!]` (`attack` | `defense`) solo su `ring` e `necklace`, additivo e nel contesto del `CombatResolver`; i 42 gioielli a DB ricevono il valore da una tabella rivista dall'utente (magia + descrizione) tramite un migratore una tantum che poi esce dal repo (aggiunto 2026-11-04, regola dell'utente, CONTEXT D-23..D-26) → FE QGEN-06
- [x] **BE-QGEN-12**: Un nemico con una lore `type: animal` non entra mai nelle quest generate (singolo, branco, boss) né nelle tappe delle dungeon; nessun campo nuovo su `Enemy`, la cura resta nella lore (aggiunto 2026-11-05 dalla UAT della FE Phase 14, CONTEXT 13.1 D-01; emenda la D-08 della Phase 13)
- [x] **BE-QGEN-13**: Fasce di xp dei ranghi contigue e solo da rookie a hero (1–20, 21–69, 70–224, 225–548, 549–803); nessuna quest `legend` generata (legend è solo un titolo e gioca le hero); le `enemy` hanno un solo posto e un budget Σ xp ∈ [lo, hi] con membri della fascia o inferiori e `requiredAdventurers = [{ title: R, count: 1 }]` (solo boss e worldMission hanno più posti, CONTEXT 13.1 D-09); il boss resta un singolo sopra hi con posti dalla formula, clamp a 2 sopra il massimo hero (aggiunto 2026-11-05, CONTEXT 13.1 D-02/D-03; emenda le D-05/D-07 della Phase 13)
- [x] **BE-QGEN-14**: Tetto di quest generate attive per taglia di città (villaggio 1, città 2, capitale 4, entro i POI liberi) e peso di sorteggio = taglia × fattore di densità; target globale invariato; città con `type` ignoto saltata (aggiunto 2026-11-05, CONTEXT 13.1 D-04; emenda la D-15 della Phase 13)
- [x] **BE-QGEN-15**: `quests` restituisce al chiamante solo le quest aperte sui POI della città in cui sta il suo personaggio corrente (marker + `pointsOfInterest`), le `story` del suo titolo e le quest delle sue corsie; `[]` senza personaggio corrente; SDL invariato, `quest(id)` e `questUpdated` invariate → FE Mappa per area (aggiunto 2026-11-05, CONTEXT 13.1 D-05)
- [x] **BE-QGEN-16**: Al primo boot reale dal branch, dopo il popolamento del DB, tre passi una tantum prima della corsa del generatore: reset delle generate aperte (idempotente, registrate e in corsia lasciate), prede delle hunt ri-estratte fra gli animali della zona con `minTitle` = fascia della preda, tappe delle dungeon ricomposte senza animali e nel budget; i migratori escono dal repo prima della merge (aggiunto 2026-11-05, CONTEXT 13.1 D-06/D-07)

### Travel Food (BE-FOOD) — Phase 14, aggiunta 2026-10-29

- [x] **BE-FOOD-01**: Modulo puro con costanti configurabili: fabbisogno = ⌈durata del viaggio / 3 minuti⌉ power (durata già comprensiva di terreno, pet e ferite: pet ×2 dimezza il cibo, ferita che raddoppia il tempo lo raddoppia, strada lenta costa di più) → FE FOOD-01
- [x] **BE-FOOD-02**: Selezione a scarto minimo fra gli `ownedItems` con `effect: hunger` (60 richiesti con un 50 e tre 20 → i tre 20; a parità di scarto meno unità, poi minor valore di vendita); un oggetto usato in parte è consumato intero; il server copre sempre se può; cibo insufficiente → consumato tutto, il resto è scoperto _(emendato 2026-11-05)_
- [x] **BE-FOOD-03**: Km scoperti = quota di fabbisogno non coperta × distanza; HP persi = n(n+1)/2 sui km scoperti (il km n-esimo costa n HP), km scoperti arrotondati per eccesso _(2026-11-05)_; HP risultante ≥ 1 altrimenti rifiuto con codice stabile (es. `TRAVEL_STARVING`) senza scritture → FE FOOD-03
- [x] **BE-FOOD-04**: `travelPreview` espone in modo additivo cibo da consumare, HP persi e un flag «arrivi vivo» (mai il codice di fame); una query owner-only dedicata con la stessa forma (nullable senza viaggio) serve l'accettazione della quest standard _(emendato 2026-11-05)_ → FE FOOD-01/02
- [x] **BE-FOOD-05**: `startTravel` e `acceptQuest` consumano il cibo e scalano gli HP nello stesso update condizionale della partenza o del claim (quantità e HP riaffermati nel filtro); teleport e salto istantaneo non consumano → FE FOOD-04
- [x] **BE-FOOD-06**: Integration su viaggio coperto, parziale, rifiutato, modificatori e concorrenza; handoff per la FE Phase 15

### Travel Ambushes (BE-AMBUSH) — Phase 15, aggiunta 2026-10-29

- [x] **BE-AMBUSH-01**: Alla partenza il server sorteggia l'imboscata km per km con un rischio per km di 0,2% di giorno e 0,6% di notte (ore 22–06 nel fuso `AMBUSH_TIMEZONE`, default Europe/Rome; costanti in codice), nessun sorteggio sotto 10 km; dopo una vittoria risorteggia dal punto per la strada residua (mai sotto 10 km residui, mai sulla deviazione); esito persistito in modo interno, mai sul filo → FE AMBUSH-03 _(emendato 2026-11-06)_
- [x] **BE-AMBUSH-02**: Un job Bull scatta all'istante dell'imboscata (una sola pendente alla volta), con reconciler al boot e sweep come i viaggi; job duplicato o obsoleto no-op; il teleport del GM annulla l'imboscata pendente e consegna i report trattenuti _(emendato 2026-11-06)_
- [x] **BE-AMBUSH-03**: Nemici estratti dal POI più vicino al punto (zona + animali della zona + habitat `city`, mai leggendari, `all` di riserva) nella fascia [Facile, Medio] del livello del personaggio (tabella del world building × `XP_SCALE`) con la composizione della Phase 13; scontro risolto con la porta `CombatResolver` _(emendato 2026-11-06)_
- [x] **BE-AMBUSH-04**: Vittoria → HP e ferite del motore applicati subito, monete e XP come una quest `enemy` generata del rango più gli xp dei nemici, viaggio invariato _(emendato 2026-11-06)_
- [x] **BE-AMBUSH-05**: Sconfitta → in una sola transazione: HP ≥ 1 e ferite dal motore, `activeTravel` riscritto dal punto (`kind: free`, `startTime` = istante dell'imboscata, polilinea punto → città più vicina per strada, meta compresa, `to` e `endTime` nuovi), `pendingQuest` abbandonata con posto liberato, cibo non rimborsato e nessun costo sulla deviazione; nessun soccorso né morte; push di sconfitta di categoria nuova con il nome della città → FE AMBUSH-01 _(emendato 2026-11-06)_
- [x] **BE-AMBUSH-06**: All'arrivo (o al teleport) il completamento inserisce nella stessa transazione un `QuestResult` per imboscata (`kind: ambush`, `quest` null, `ambush { at, nearCity, reachedCity }`, nemici, HP prima/dopo, ferite, monete, XP; `resolvedAt` = istante dell'imboscata) consegnato sulla pipeline esistente (subscription owner-only, `unacknowledgedQuestResults`, ack) senza push `questEnd` → FE AMBUSH-02 _(emendato 2026-11-06)_
- [x] **BE-AMBUSH-07**: Integration su vittoria con risorteggio, sconfitta con deviazione (meta compresa) e quest abbandonata, notte vs giorno, tratto sotto 10 km, job duplicato no-op, teleport, `travelPreview` che non svela; handoff per la FE Phase 16 _(emendato 2026-11-06)_

### Unlockable Lore (BE-LORE) — Phase 16, aggiunta 2026-10-29

- [x] **BE-LORE-01**: Due insiemi additivi sul personaggio: `Character.status.unlockedLore` (id esposti sul filo come `CharacterStatus.unlockedLore: [ID!]!`) e `Character.status.knownEnemies` (interno); alla creazione `unlockedLore` contiene la geografia della città natale (lore della città più le lore `region` e `state` collegate); nessun flag globale (`Lore.unlocked` non esiste dalla Phase 11 D-25); backfill one-off dei personaggi esistenti al boot reale (posizione + esiti vinti), rimosso prima della merge _(emendato 2026-11-07)_ → FE LORE-03
- [x] **BE-LORE-02**: Arrivo su un POI che è il marker di una città (completamento del viaggio libero o da quest, deviazione dopo un'imboscata, salto istantaneo dell'accettazione, teleport) → sblocco idempotente della geografia di quella città (lore + regioni + stato) nella stessa transazione del movimento; i POI del territorio non contano _(emendato 2026-11-07)_
- [x] **BE-LORE-03**: Esito `success` con nemici (individuale, party, dungeon, imboscata vinta) → `Enemy.relatedLore` dei nemici affrontati in `unlockedLore` e id esatti in `knownEnemies` per ogni partecipante vincente; la sconfitta non insegna nulla; `QuestResult.loreUnlocked: [Lore!]!` elenca le sole lore nuove dell'esito _(emendato 2026-11-07)_
- [x] **BE-LORE-04**: `study` vinta senza magia appresa → con probabilità `LORE_STUDY_CHANCE` (default 0,5) una lore casuale non sbloccata fra i tipi `knowledge`, `god`, `religion`, `ceremony`, `material`, `state`, `character` (110 a DB); nessuna cascata sulle `relatedLore`; la lore appresa va in `unlockedLore` e in `loreUnlocked` _(emendato 2026-11-07)_
- [x] **BE-LORE-05**: `lores` e `lore(id)` filtrate sul personaggio corrente del bearer (`relatedLore` comprese, `NOT_FOUND` per una lore chiusa come per una inesistente); `City.relatedLore` null e `Enemy.relatedLore` filtrata per i giocatori finché chiuse; `Quest.infos.relatedLore` intera; l'innkeeper vede tutto; `characterUpdated` riemette al cambio dell'insieme _(emendato 2026-11-07)_ → FE LORE-01
- [x] **BE-LORE-06**: Quest e risultati espongono per ogni voce di `enemies` se il nemico esatto è conosciuto dal personaggio del bearer (`QuestEnemy.known: Boolean!` risolto per viewer, innkeeper → true), non la specie _(emendato 2026-11-07)_ → FE LORE-02

### Heal Quests by Size (BE-HEAL) — Phase 18, aggiunta 2026-11-09

- [ ] **BE-HEAL-01**: `Quest.prizes.cure` sotto-documento nullable `{ lifePointsShare: Number in [0, 1], canHeal: [InjuryType] }` (`QuestCure` sullo SDL, campo additivo `QuestPrizes.cure`, `QuestCureInput` in `QuestPrizesInput`); `canHeal` riusa nome e semantica di `LootItem.canHeal` (enum Mongoose, default vuota); `cure` assente = nessuna cura, nessuna migrazione → FE HEAL-01
- [ ] **BE-HEAL-02**: Una quest vinta che porta `cure` riporta `currentLifePoints` almeno a `round(maxLifePoints × lifePointsShare)` (tetto: mai sopra il massimo né sotto il corrente, calcolato sul massimo dopo la progressione) e toglie da `status.injuries` le ferite presenti in `canHeal` nella stessa scrittura; vale per ogni tipo di quest (il ramo `type === heal` della Phase 9 D-15 è superato); primitiva pura `cureInjuries` riusabile → FE HEAL-01
- [ ] **BE-HEAL-03**: Contenuto delle 166 heal fisse scritto a DB per taglia (`citySizeOf`) con script mirato fuori repo (D-36) dopo la revisione dell'utente su file e dopo la merge: liste villaggio 19 (gravità FE ≤ 20) / città 28 (≤ 40) / capitale 37, ritocchi per `CityType` (montagna/nord, deserto, tropicale, mare), quota 0,5 / 0,8 / 1, `timeToComplete` 2 / 5 / 8 h, tre descrizioni per taglia nella voce del tempio; titoli, `minTitle` rookie, gratuità e Necrorian invariati → FE HEAL-03
- [ ] **BE-HEAL-04**: `QuestResult.injuriesHealed: [InjuryType!]!` (default vuota) con le ferite tolte da quell'esito per il partecipante, accanto a `hpBefore`/`hpAfter` → FE HEAL-02
- [ ] **BE-HEAL-05**: Unit (primitiva, tetto, piano con `cure` null/0/1 e su quest non heal), integration (heal di villaggio: una ferita tolta e una no, HP al 50 %, `injuriesHealed` sul filo; SDL verbatim della FE), boot reale con SDL additivo, handoff `BACKEND-NOTES.md` per la FE Phase 18 con tre quest d'esempio e il runbook dello script di contenuto
- [ ] **BE-HEAL-06**: `LootItem.recovery` sotto-documento nullable `{ time: ms intero ≥ 0, turns: intero ≥ 0 }` (`LootRecovery` sullo SDL, input admin) e `LootItem.relatedLore: [Lore]` (ref, filtrata per viewer come le altre) additivi; `CharacterStatus.potionRecoveryUntil: DateTime` nullable additivo, una sola data per personaggio, nessun processor; `turns` solo dato per il motore di combattimento (il combattimento non legge né scrive la ricarica) → FE HEAL-04, HEAL-05
- [ ] **BE-HEAL-07**: Mutation `useItem(itemId: ID!): UseItemResult` sul bearer: rifiuti in ordine `AWAITING_AID`, `ITEM_NOT_OWNED`, `ITEM_NOT_USABLE` (effetto non heal o `recovery.time` assente), `POTION_RECOVERING` (con `recoveryUntil` nelle extensions), `ITEM_NO_EFFECT` (HP pieni e nessuna ferita in `canHeal`: nessun consumo né ricarica); consentita in città e in viaggio; una sola scrittura atomica (HP + `power` fino al massimo, ferite − `canHeal` con `cureInjuries`, pila − 1 con le guardie di quantità, `potionRecoveryUntil = now + recovery.time`, `relatedLore` dell'oggetto in `unlockedLore`) e risultato `{ hpBefore, hpAfter, injuriesHealed, quantityLeft, recoveryUntil, loreUnlocked }` → FE HEAL-04, HEAL-05
- [ ] **BE-HEAL-08**: Contenuto fuori repo dopo la merge e la revisione dell'utente: `recovery.time` delle 28 pozioni heal dalla tabella (30 min–24 h: base per potenza, scalino per rarità, minimi per ferita più grave), `turns` dalla bozza, lore nuova «Il limite del corpo» (`knowledge`) scritta a DB e collegata dalle 28 pozioni; integration su prima pozione, seconda entro la ricarica, nessun effetto, attesa di soccorso, viaggio; handoff aggiornato con lo script e la lore → FE HEAL-04, HEAL-05

### Model Review (BE-MODEL) — Phase 19, aggiunta 2026-11-09

- [ ] **BE-MODEL-01**: `Enemy.weaknesses { base: [DamageType], energy: [EnergyType] }` sostituisce `energyWeaknesses` e `baseWeaknesses` (modello, SDL non additivo, `EnemyInput`); generatore (`recommended-loot`) e combattimento leggono il sotto-documento; migratore idempotente sui 206 nemici → FE MODEL-01
- [ ] **BE-MODEL-02**: `Enemy.spells` diventa una lista di riferimenti al catalogo (stesso SDL `[Spell!]!`); il migratore abbina le copie incorporate per `_id` o per `name` e riporta nel log quelle senza corrispondenza, senza inventarle → FE MODEL-01
- [ ] **BE-MODEL-03**: Lo stato del pet vive sul personaggio: `CharacterAssets.ownedPets: [OwnedPet { pet, xp, currentLifePoints }]` (non additivo), il catalogo `Pet` perde `xp` e `currentLifePoints`, tiene `maxLifePoints`, `maxXp`, prezzi, `speedModifier`, `sellable`, `imagePath` e sostituisce `damages` con `attack: Damages` e `defense: Damages` (SDL non additivo; migratore: i danni attuali → `attack`, `defense` vuoto per la cura a DB); acquisto, vendita, premio e «già posseduto» sulle voci; `assets.pet` resta il riferimento al catalogo; migratore (`xp` 0, vita = `maxLifePoints`) → FE MODEL-02
- [ ] **BE-MODEL-04**: A ogni vittoria con nemici (quest individuale, party, dungeon, imboscata vinta) il compagno equipaggiato riceve `round(Σ Enemy.xp × PET_XP_SHARE)` con `PET_XP_SHARE` 0,10 (costante), senza il premio della quest, tetto `maxXp` del catalogo, nella stessa scrittura dell'esito; `QuestResult.petXpGained: Int!` additivo (default 0); `maxXp` dei 44 pet rivisti a DB dalla tabella approvata (contenuto dopo la merge) → FE MODEL-02
- [ ] **BE-MODEL-05**: `CharacterAssets.wearedEquipment` → `wornEquipment` e `Equipment.foots` → `feet` (modello, SDL non additivo, input, filtri di `equipItem` e del negozio); migratore con rinomina → FE MODEL-03
- [ ] **BE-MODEL-06**: `status.spellStates [{ spell, usages, recoveries, active }]` è l'unica lista delle magie: `status.spells` e `assets.activeSpells` tolti da modello e SDL; equip/unequip scrivono `active`, uso/recupero/apprendimento/combattimento lavorano sulle voci; `maxActiveSpells` resta sullo SDL come resolve field calcolato e perde il `@Prop`; migratore che fonde le tre liste (log sui conflitti di `usages`) → FE MODEL-03
- [ ] **BE-MODEL-07**: `PointOfInterest.quest` tolto da modello, SDL e input (nessun lettore, 0 su 642 POI); `City.shop { equipment, loot, pets }` sostituisce i tre array del pool (solo Mongoose; `cityShop`, report e vendita lo leggono; pool presenti conservati) → FE MODEL-01
- [ ] **BE-MODEL-08**: `Lore.image` → `Lore.imagePath` (modello, SDL non additivo, input, migratore); file enum `item_reference_type.enum.ts` e `slot_type.enum.ts` rinominati in kebab-case; modello `KGNotification` rimosso → FE MODEL-01
- [ ] **BE-MODEL-09**: Un solo modulo one-off `src/migrations/model-review/` con un passo idempotente per decisione e log di soli conteggi, eseguito al boot reale dall'orchestratore dopo il backup e rimosso in TDD prima della merge; unit sui migratori e sul premio xp del pet, integration per area, SDL verbatim della FE, handoff `BACKEND-NOTES.md` con la tabella dei cambi SDL vecchio → nuovo

## Future Requirements

Deferred a post-v1.0. Tracciati ma non nella roadmap corrente.

- **BE-FUT-01**: Refresh/rotazione del JWT di sessione (per v1.0: TTL breve + re-login trasparente FE)
- **BE-FUT-02**: Redis PubSub adapter per scaling orizzontale delle subscription
- **BE-FUT-03**: Pet/mount speed modifiers su `activeTravel.duration` (FE FUT-02)
  _Anticipato nella Phase 8 (D-08, 2026-10-21): `Pet.speedModifier` modifica la durata di ogni viaggio._
- **BE-FUT-04**: Combat log round-per-round (FE FUT-01)
- **BE-FUT-05**: Riconciliazione/refund redemption EventSub (reject della redemption su Twitch quando il credito fallisce)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-canale Twitch | Prodotto single-channel per design |
| Validazione token Twitch per-request | Contraddice il constraint rate limit; decisione JWT di sessione |
| Storage a lungo termine dei token Twitch degli utenti | Il BE valida al login e non conserva il token; riduce superficie di attacco |
| RBAC generico a matrice | Bastano 3 ruoli fissi; overengineering |
| Descrizioni delle quest via LLM, audio, speech-to-text | v2 (come FE); la generazione e il posizionamento server-side delle quest `enemy`/`boss` è la Phase 13 (2026-10-29) con titoli da template |
| Sistema crime/guard | v2 (enum presenti, non usati) |
| Modifiche al codice FE | Handoff solo via BACKEND-NOTES nel repo FE |

## Traceability

Populated during roadmap creation (2026-07-16). Ogni requirement mappato a esattamente una fase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BE-TEST-01 | Phase 1 | Complete |
| BE-TEST-02 | Phase 1 | Complete |
| BE-TEST-03 | Phase 1 | Complete |
| BE-TEST-04 | Phase 1 | Complete |
| BE-AUTH-01 | Phase 2 | Complete |
| BE-AUTH-02 | Phase 2 | Complete |
| BE-AUTH-03 | Phase 2 | Complete |
| BE-AUTH-04 | Phase 2 | Complete |
| BE-AUTH-05 | Phase 2 | Complete |
| BE-AUTH-06 | Phase 2 | Complete |
| BE-CHAR-01 | Phase 02.1 | Complete |
| BE-CHAR-02 | Phase 02.1 | Complete |
| BE-CHAR-03 | Phase 02.1 | Complete |
| BE-CHAR-04 | Phase 02.1 | Complete |
| BE-CHAR-05 | Phase 02.1 | Complete |
| BE-CHAR-06 | Phase 03.1 | Complete |
| BE-CHAR-07 | Phase 03.1 | Complete |
| BE-CHAR-08 | Phase 03.1 | Complete |
| BE-CHAR-09 | Phase 03.1 | Complete |
| BE-AUTHZ-01 | Phase 3 | Complete |
| BE-AUTHZ-02 | Phase 3 | Complete |
| BE-AUTHZ-03 | Phase 3 | Complete |
| BE-AUTHZ-04 | Phase 3 | Complete |
| BE-SYNC-01 | Phase 3 | Complete |
| BE-SYNC-02 | Phase 3 | Complete |
| BE-ATOM-01 | Phase 4 | Complete |
| BE-ATOM-02 | Phase 4 | Complete |
| BE-ATOM-03 | Phase 4 | Complete |
| BE-ATOM-04 | Phase 4 | Complete |
| BE-ATOM-05 | Phase 4 | Complete |
| BE-NOTIF-01 | Phase 5 | Complete |
| BE-NOTIF-02 | Phase 5 | Complete |
| BE-NOTIF-03 | Phase 5 | Complete |
| BE-POINTS-01 | Phase 6 | Complete |
| BE-POINTS-02 | Phase 6 | Complete |
| BE-POINTS-03 | Phase 6 | Complete |
| BE-QUEST-01 | Phase 7 | Complete |
| BE-QUEST-02 | Phase 7 | Complete |
| BE-QUEST-03 | Phase 7 | Complete |
| BE-QUEST-04 | Phase 7 | Complete |
| BE-TRAVEL-01 | Phase 8 | Complete |
| BE-TRAVEL-02 | Phase 8 | Complete |
| BE-TRAVEL-03 | Phase 8 | Complete |
| BE-TRAVEL-04 | Phase 8 | Complete |
| BE-COMBAT-01 | Phase 9 | Complete |
| BE-COMBAT-02 | Phase 9 | Complete |
| BE-COMBAT-03 | Phase 9 | Complete |
| BE-ADMIN-01 | Phase 9 | Complete |
| BE-ADMIN-02 | Phase 9 | Complete |
| BE-SPELL-01 | Phase 09.1 | Complete |
| BE-SPELL-02 | Phase 09.1 | Complete |
| BE-SPELL-03 | Phase 09.1 | Complete |
| BE-SPELL-04 | Phase 09.1 | Complete |
| BE-RESULT-01 | Phase 09.2 | Complete |
| BE-RESULT-02 | Phase 09.2 | Complete |
| BE-RESULT-03 | Phase 09.2 | Complete |
| BE-RESULT-04 | Phase 09.2 | Complete |
| BE-HARD-01 | Phase 10 | Complete |
| BE-HARD-02 | Phase 10 | Complete |
| BE-HARD-03 | Phase 10 | Complete |
| BE-HARD-04 | Phase 10 | Complete |
| BE-HARD-05 | Phase 10 | Complete |
| BE-HARD-06 | Phase 10 | Complete |
| BE-HARD-07 | Phase 10 | Complete |
| BE-HARD-08 | Phase 10 | Complete |
| BE-CONTENT-01..07 | Phase 11 | Complete (aggiunti 2026-10-29, chiusi 2026-11-02) |
| BE-SHOP-01..06 | Phase 12 | Complete (gate 12-18, 2026-11-03; aggiunti 2026-10-29, emendati e BE-SHOP-06 aggiunto 2026-11-02) |
| BE-QGEN-01..11 | Phase 13 | Complete (gate 13-19, 2026-11-04; 01..08 aggiunti 2026-10-29, 09..11 il 2026-11-04) |
| BE-QGEN-12..16 | Phase 13.1 | Complete (gate 13.1-07, 2026-11-05; aggiunti 2026-11-05 dalla UAT della FE Phase 14; boot reale e rimozione dei one-off fatti il 2026-11-05, PR #21 mergiata) |
| BE-FOOD-01..06 | Phase 14 | Complete (gate 14-07, 2026-11-05; aggiunti 2026-10-29; discuss 2026-11-05, BE-FOOD-02/03/04 emendati) |
| BE-AMBUSH-01..07 | Phase 15 | Complete (gate 15-11 e chiusura 15-12, 2026-11-06; aggiunti 2026-10-29, emendati 2026-11-06) |
| BE-LORE-01..06 | Phase 16 | Complete (gate 16-11 e chiusura 16-12, 2026-11-07; aggiunti 2026-10-29, emendati 2026-11-07) |
| BE-HEAL-01..08 | Phase 18 | Pending (01..05 dal discuss congiunto con la FE Phase 18, 06..08 dalla riapertura delle pozioni la sera stessa, 2026-11-09; esecuzione dopo la Phase 17) |
| BE-MODEL-01..09 | Phase 19 | Pending (aggiunti 2026-11-09 nel discuss congiunto con la FE Phase 19; esecuzione dopo la Phase 18) |

**Coverage:**

- v1 requirements: 56 total (42 + BE-SYNC-01/02 aggiunti il 2026-10-14 + BE-SPELL-01..04 della 9.1 + BE-RESULT-01..04 della 9.2 + BE-HARD-05/06 della Phase 10, 2026-10-27 + BE-HARD-07 dalla UAT della FE Phase 9, 2026-10-29 + BE-HARD-08 dal discuss della FE Phase 10, 2026-10-29)
- Mapped to phases: 50 / 50 ✓ (nessun orfano, nessun duplicato)
- Estensione del 2026-10-29: +39 requisiti (BE-CONTENT-01..07, BE-SHOP-01..05, BE-QGEN-01..08, BE-FOOD-01..06, BE-AMBUSH-01..07, BE-LORE-01..06) mappati sulle Phase 11–16 → 95 totali, 89 mappati (i BE-TEST-01..04 restano nella Phase 1 non avviata e i 2 BE-SYNC assorbiti nella 3 come prima)
- Estensione del 2026-11-04 (discuss Phase 13 congiunto con la FE Phase 14): +3 requisiti (BE-QGEN-09 dungeon a tappe, BE-QGEN-10 premio pet, BE-QGEN-11 `accessoryUseTypes`) → 98 totali, 92 mappati
- Inserimento del 2026-11-05 (Phase 13.1, dalla UAT della FE Phase 14): +5 requisiti (BE-QGEN-12 animali fuori, BE-QGEN-13 fasce contigue e budget per posti, BE-QGEN-14 taglie, BE-QGEN-15 tabellone per area, BE-QGEN-16 reset e revisione di hunt/dungeon al boot) → 103 totali, 97 mappati
- Discuss del 2026-11-07 (Phase 16 congiunto con la FE Phase 17): BE-LORE-01..06 emendati (id sul filo, geografia città + regioni + stato, nemico esatto, `loreUnlocked`, studio al 50 %, filtri fuori dalla Biblioteca, backfill one-off); nessun requisito nuovo
- Discuss del 2026-11-06 (Phase 15 congiunto con la FE Phase 16): BE-AMBUSH-01..07 emendati (rischio per km 0,2%/0,6%, più imboscate con risorteggio, POI più vicino + animali, fascia [Facile, Medio] per livello, città più vicina meta compresa, push su sconfitta, report trattenuti all'arrivo, `kind`/`ambush` sul `QuestResult`); conteggi invariati (103 totali, 97 mappati)
- Discuss del 2026-11-09 (Phase 18 congiunto con la FE Phase 18): +8 requisiti (BE-HEAL-01..05: `prizes.cure` con quota di vita a tetto e lista `canHeal`, cura su ogni quest vinta che la porta, contenuto delle 166 heal per taglia, `injuriesHealed`, prove e handoff; BE-HEAL-06..08 aggiunti la sera stessa: `LootItem.recovery { time, turns }` + `relatedLore`, `potionRecoveryUntil`, mutation `useItem` con ricarica globale, tempi e lore «Il limite del corpo» a DB) → 106 totali, 100 mappati senza la Phase 17 (111 / 105 con i BE-SESSION-01..05 della Phase 17, sul ramo `feat/17-autorizzazione-e-sessioni`)
- Discuss del 2026-11-09 (Phase 19 congiunto con la FE Phase 19): +9 requisiti (BE-MODEL-01..09: debolezze in un sotto-documento, magie dei nemici per riferimento, stato dei pet sul personaggio con il 10 % degli xp dei nemici al compagno e `maxXp` rivisti, `wornEquipment`/`feet`, una sola lista di magie, `maxActiveSpells` calcolato, via `PointOfInterest.quest`, `City.shop`, `Lore.imagePath`, enum e modello morto, migratore one-off unico) → 115 totali, 109 mappati senza la Phase 17 (120 / 114 con i BE-SESSION-01..05 della Phase 17)

---

_Requirements defined: 2026-07-16 — Traceability aggiornata in fase di roadmap_
