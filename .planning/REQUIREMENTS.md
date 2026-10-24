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

- [ ] **BE-COMBAT-01**: Entità `CombatResult` persistita: HP prima/dopo, consumabili usati, spell usate, injuries, rewards (equipment/items/coins), XP → FE COMBAT-02..05 _(realizzata come `QuestResult` e query `questResult(id)`, 09-CONTEXT D-19/D-20)_
- [ ] **BE-COMBAT-02**: Delivery ibrida: la subscription emette il payload completo in foreground; il push FCM (data message) porta solo `resultId`; esiste la query `combatResult(id)` per il requery → FE COMBAT-01, contratto chiuso per la Phase 9 FE _(realizzata come `QuestResult` e query `questResult(id)`, 09-CONTEXT D-19/D-20)_
- [ ] **BE-COMBAT-03**: Gli esiti delle quest sono server-side: la corsia standard si risolve da sola alla scadenza del countdown (quest senza nemico = successo con premi; con nemico = motore di combattimento dietro una porta sostituibile, regole segnaposto) e l'innkeeper completa story/worldMission solo con esito positivo tramite mutation role-guarded, con override opzionali per personaggio (HP, ferite, consumi, magie) e nessun grade; ogni esito produce un risultato per personaggio e aggiorna il Character atomicamente → FE ADMIN-05/06 _(emendato 2026-10-24, 09-CONTEXT D-01..D-04)_

### Admin Queue (BE-ADMIN)

- [ ] **BE-ADMIN-01**: L'innkeeper ha una vista live (query + subscription) delle pending request story/worldMission, con i dati necessari al filtro FE su `activeTravel` → FE ADMIN-02
- [ ] **BE-ADMIN-02**: Mutation di completamento (solo esito positivo, nessun reject né rimborso) per le pending request story/worldMission, role-guarded e audit-loggata, con override opzionali per personaggio → FE ADMIN-03 _(emendato 2026-10-24, 09-CONTEXT D-03/D-04)_

### Hardening (BE-HARD)

- [ ] **BE-HARD-01**: Tutti gli input GraphQL/REST validati con class-validator + `ValidationPipe` globale (ID Mongo validi, quantità non negative, lunghezze stringhe)
- [ ] **BE-HARD-02**: Introspection GraphQL disabilitata in produzione; error sanitization (nessun leak di ID/relazioni a client non autorizzati); CORS esplicito e documentato
- [ ] **BE-HARD-03**: `.env.example` committato con tutte le variabili documentate; nessun secret in repo; audit automatico (grep CI) su pattern di secret
- [ ] **BE-HARD-04**: Le aree critiche (auth, atomics, EventSub, travel lifecycle) hanno coverage di test su happy path + concorrenza + failure mode

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
| Generazione quest LLM, audio, speech-to-text | v2 (come FE) |
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
| BE-COMBAT-01 | Phase 9 | Pending |
| BE-COMBAT-02 | Phase 9 | Pending |
| BE-COMBAT-03 | Phase 9 | Pending |
| BE-ADMIN-01 | Phase 9 | Pending |
| BE-ADMIN-02 | Phase 9 | Pending |
| BE-HARD-01 | Phase 10 | Pending |
| BE-HARD-02 | Phase 10 | Pending |
| BE-HARD-03 | Phase 10 | Pending |
| BE-HARD-04 | Phase 10 | Pending |

**Coverage:**

- v1 requirements: 48 total (42 + BE-SYNC-01/02 aggiunti il 2026-10-14)
- Mapped to phases: 44 / 44 ✓ (nessun orfano, nessun duplicato)

---

_Requirements defined: 2026-07-16 — Traceability aggiornata in fase di roadmap_
