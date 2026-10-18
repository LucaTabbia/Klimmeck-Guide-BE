# Roadmap: Klimmeck Guide — Backend (v1.0 Core Loop)

## Overview

Questa milestone porta il backend brownfield da "completamente aperto e con bug di concorrenza" a "fonte di verità sicura e atomica". Si parte dalla fondazione di test TDD (senza cui nulla è testabile) e dal consolidamento del WIP spell nel working tree, poi si posa il seam di autenticazione (JWT di sessione, guard globale HTTP + WS) e l'autorizzazione (ownership, ruoli, audit). Sopra le atomiche economiche — la fondazione trasversale che rende sicuri i crediti EventSub e il lifecycle viaggi — si innestano push FCM, sync punti Twitch, le corsie quest e il lifecycle viaggi (i due contratti che sbloccano le fasi FE 6 e 7 su staging), il contratto combat/admin, e infine l'hardening trasversale. Ogni fase consegna una capacità coerente e verificabile, e diverse fasi sbloccano deliberatamente in anticipo le rispettive fasi FE.

## Phases

**Phase Numbering:**
- Integer phases (1-10): Planned milestone work
- Decimal phases (N.1): Urgent insertions (marked INSERTED)

**Branch convention (per PROJECT.md):** ogni fase parte da `develop` con branch `feat/NN-<slug>` e chiude con PR verso `develop` (mai push diretto su `develop`/`main`).

- [ ] **Phase 1: Fondazione Test & Consolidamento Spell WIP** - Harness TDD (replica-set Mongo, Bull DI-mock + Redis effimero, fixture) e consolidamento del WIP spell con fix ordine-validazione
- [x] **Phase 2: Auth & Identity Foundation** - JWT di sessione, guard globale HTTP + WS `onConnect`, dev bypass fail-closed, handoff FE (completed 2026-10-06)
- [x] **Phase 2.1: Character Creation Contract** (INSERTED 2026-10-09) - Mutation `createCharacter` sull'identità autenticata, tabella età/razza esposta via query, validazione autoritativa e codici d'errore stabili; sblocca FE Phase 2 (completed 2026-10-09)
- [x] **Phase 3: Autorizzazione: Ownership, Ruoli, Audit** - Ownership sulle mutation, role guard `@Roles(innkeeper)`, subscription filtrate per identità, audit log admin, user stream `userUpdated` + snapshot su subscribe (contratto FE Phase 3, assorbito il 2026-10-14) (completed 2026-10-14, PR #5)
- [x] **Phase 3.1: Character Deletion Contract** (INSERTED 2026-10-15) - Mutation `deleteCharacter` sull'identità autenticata: soft delete del personaggio corrente, unlink atomico di `User.currentCharacter`, nome liberato, codici stabili; sblocca FE Phase 4 (SET-05) (completed 2026-10-16)
- [x] **Phase 4: Integrità Economica (Atomics)** - Operazioni atomiche su coins/twitchPoints/quest/equip/spell (no read-modify-write, no stato parziale) (completed 2026-10-18)
- [ ] **Phase 5: Infrastruttura Push FCM** - Registro token per-device, servizio push domain-agnostic, pruning token stale
- [ ] **Phase 6: EventSub: Punti Canale & Streamer Live** - Webhook Twitch EventSub, credito idempotente 1:1, push streamer-live
- [ ] **Phase 7: Quest Lanes (QUEST-04)** - Corsie story/worldMission su schema + subscription, accettazione lane-aware, cost model server-side
- [ ] **Phase 8: Travel Lifecycle (TRAVEL-01)** - `activeTravel` su schema + subscription, ETA/completamento server-side, teleport atomico
- [ ] **Phase 9: Combat Result & Admin Outcomes** - `CombatResult` persistito con delivery ibrida, outcome admin-mediati, coda pending innkeeper
- [ ] **Phase 10: Hardening Trasversale** - Validazione input, introspection off/CORS/sanitization, `.env.example`, coverage aree critiche

## Phase Details

### Phase 1: Fondazione Test & Consolidamento Spell WIP
**Goal**: Esiste una fondazione TDD affidabile e il WIP spell nel working tree è consolidato, testato e committato — nulla a valle è testabile senza questo.
**Depends on**: Nothing (first phase)
**Requirements**: BE-TEST-01, BE-TEST-02, BE-TEST-03, BE-TEST-04
**Success Criteria** (what must be TRUE):
  1. `npm test` avvia un `MongoMemoryReplSet` e un test che esercita una transazione Mongo e un change stream su Character passa (prova la modalità replica set).
  2. Un unit test risolve un service con la coda Bull mockata al confine DI (`getQueueToken`, nessun Redis), mentre un test di integrazione del processor gira contro un Redis effimero reale (no `ioredis-mock`).
  3. Fixture/factory costruiscono istanze valide di User, Character, Quest, Spell, Road, POI riusate in almeno due spec file.
  4. `useSpell` verifica l'esistenza della spell prima di decrementare gli usages (test RED prova il vecchio ordine, GREEN dopo il fix) e il processor spell-recovery è coperto da test.
  5. Il working tree è pulito a fine fase: WIP spell use/recovery committato sul branch, dir vuota `src/spellRecovery/` rimossa.
**Plans**: 5 plans
Plans:
- [x] 01-01-PLAN.md — Harness test: MongoMemoryReplSet condiviso, split Jest unit/integration, helper Redis effimero (BE-TEST-01, BE-TEST-02)
- [x] 01-02-PLAN.md — Fixture/factory two-tier per User/Character/Quest/Spell/Road/POI (BE-TEST-03)
- [x] 01-03-PLAN.md — Consolidamento WIP spell TDD: unit Bull DI-mock, fix ordine validazione useSpell RED→GREEN, processor integration, change stream/PUB_SUB (BE-TEST-04, BE-TEST-01/02)
- [x] 01-04-PLAN.md — Pipeline CI GitHub Actions (lint+unit+integration, Redis container, cache binari Mongo) + rimozione src/spellRecovery/ (BE-TEST-01)
- [x] 01-05-PLAN.md — Gap closure: npm test affidabile (serializza integration), npm run lint exit 0 (override ESLint test + downgrade warn), cache binari Mongo WR-06 (BE-TEST-01)
**Unblocks (FE)**: nulla FE-side; prerequisito TDD per tutto il resto della milestone.
**Research flag**: mongodb-memory-server replica-set CI flakiness / binary caching (verificare prima di costruire il layer transazioni).
**Branch**: `feat/01-test-foundation` da `develop` → PR a `develop`.

### Phase 2: Auth & Identity Foundation
**Goal**: Il backend ha un seam di autenticazione a JWT di sessione che protegge ogni operazione GraphQL (HTTP + WS) e REST, con dev bypass fail-closed compatibile con lo stub FE e un handoff documentato.
**Depends on**: Phase 1
**Requirements**: BE-AUTH-01, BE-AUTH-02, BE-AUTH-03, BE-AUTH-04, BE-AUTH-05, BE-AUTH-06
**Success Criteria** (what must be TRUE):
  1. Il login mediato dal BE (authorization code Twitch scambiato lato server, token validato una tantum su `id.twitch.tv/oauth2/validate`) produce — al riscatto di un login ticket monouso — un JWT BE a TTL breve con claims `{userId, twitchId, role}` e un refresh token rotante, risolvendo/creando lo User per `twitchId`. _(Emendato 2026-10-06: Twitch non supporta PKCE e richiede `client_secret`, vedi 02-CONTEXT.md D-01.)_
  2. Una mutation chiamata senza JWT valido restituisce un errore di auth; un'operazione `@Public()` (es. login) riesce senza JWT — enforced da un `APP_GUARD` globale che copre HTTP e l'endpoint REST Cloudinary.
  3. Una connessione subscription WS con JWT assente/invalido in `connection_init` (`Authorization: Bearer <jwt>`) è rifiutata in `onConnect`; una valida connette e l'identità è disponibile ai resolver (verificato con test di integrazione, non context mockato).
  4. Con `DEV_AUTH_ENABLED=true` il guard accetta l'identità stub FE da `DEV_AUTH_ACCESS_TOKEN`; il bypass è impossibile con `NODE_ENV=production` (test fail-closed).
  5. Un handoff `BACKEND-NOTES` documenta login, header, `connection_init`, comportamento post-refresh e scope Twitch richiesti — chiude Open Questions #1 e #2 della Phase 11 FE.
**Plans**: 9 plans (7 waves)

Plans:
- [x] 02-01-PLAN.md — Wave 1: dipendenze (`@nestjs/jwt@^11`, graphql-ws, ws), primitive auth, config fail-closed (`validateEnv`), `.env.example`, upsert User + indice unico twitchId
- [x] 02-02-PLAN.md — Wave 2: sessioni rotanti (hash SHA-256, grace 30 s, reuse detection) + verifica al boot dell'indice twitchId
- [x] 02-03-PLAN.md — Wave 2: seam d'identità — access JWT, dev bypass fail-closed, `AuthIdentityResolver`, autenticatore WS (4403/4401)
- [x] 02-04-PLAN.md — Wave 2: mattoni login Twitch — ticket monouso S256, client Twitch iniettabile, state OAuth, builder URL
- [x] 02-05-PLAN.md — Wave 3: `AuthModule`, `AuthSessionService`, flusso REST `/auth/twitch/start|callback`, harness di test
- [x] 02-06-PLAN.md — Wave 4: `GraphQLModule.forRootAsync` + factory condivisa, `exchangeLoginTicket`/`refreshSession`, boot reale senza chiavi Twitch, schema
- [x] 02-07-PLAN.md — Wave 5: guard globale `APP_GUARD` + whitelist `@Public`, `me`/`logout`, copertura HTTP/REST/dev bypass e login completo
- [x] 02-08-PLAN.md — Wave 6: integration test WS reali (4403, 4401, identità, dev bypass) + CI build e schema aggiornato
- [x] 02-09-PLAN.md — Wave 7: handoff `BACKEND-NOTES.md` per il FE (D-24)
- [x] 02-10-PLAN.md — Gap closure (decisione utente D-35): ri-emissione idempotente del refresh token dentro la finestra di grazia
**Unblocks (FE)**: FE Phase 3 (contratto `connection_init`) e FE Phase 11 (contratto JWT; l'auth BE atterra deliberatamente prima della Phase 11 FE — rationale in PROJECT.md Key Decisions e REQUIREMENTS.md).
**Research flag**: propagazione del context graphql-ws / @nestjs/apollo@13 (nestjs/graphql#1756) — MEDIUM confidence, fissare con integration test reale.
**Branch**: `feat/02-auth-identity-foundation` → PR a `develop`. _(Creato sopra `feat/01-fondazione-test-consolidamento-spell-wip` perché la Phase 1 non è ancora su `develop`: aprire la PR della Phase 2 dopo il merge della Phase 1, oppure con base temporanea il branch della Phase 1.)_

### Phase 02.1: Character Creation Contract (INSERTED)
**Goal**: Un utente autenticato senza personaggio può crearne uno con una sola mutation; il BE definisce lo stato iniziale, valida ogni campo in modo autoritativo (nome, età per razza, background, enum) e assegna `User.currentCharacter` atomicamente. Il FE Phase 2 (pagina di creazione) consuma questo contratto.
**Depends on**: Phase 2 (identità autenticata via `@CurrentUser()`, guard su GraphQL e REST Cloudinary)
**Requirements**: BE-CHAR-01, BE-CHAR-02, BE-CHAR-03, BE-CHAR-04, BE-CHAR-05
**Why inserted**: scoperto nel discuss della FE Phase 2 (2026-10-08): il BE non espone alcuna mutation di creazione personaggio e il FE non può procedere senza. Direttiva utente: costruire il lato BE nella stessa fase, seguendo il GSD del BE.
**Success Criteria** (what must be TRUE):
  1. Un utente autenticato con `currentCharacter == null` chiama `createCharacter(input)` e riceve lo `User` aggiornato con `currentCharacter` popolato; il `Character` esiste con lo stato iniziale definito dal BE. Una seconda chiamata risponde `CHARACTER_ALREADY_EXISTS`; due chiamate concorrenti creano esattamente un personaggio.
  2. Nome non valido (lunghezza, caratteri), nome già in uso (case-insensitive), età fuori dal range della razza, background > 500, enum sconosciuto sono rifiutati con codici stabili in `extensions.code`; nessun documento parziale resta a DB.
  3. La query `raceTraits` restituisce min/max età per ciascuna delle 9 razze e la stessa tabella è usata dalla validazione (una sola fonte).
  4. `imagePath` facoltativo accetta l'URL restituito dall'endpoint REST `POST /cloudinary/uploadImage` già esistente; nessun controllo NSFW in questa fase (debito tracciato in BE-HARD).
  5. `BACKEND-NOTES.md` della fase documenta il contratto (schema, input, codici, esempi, stato iniziale) e `src/schema.gql` è rigenerato.
**Plans**: 8 plans (4 waves)
- [x] 02.1-01-PLAN.md — Wave 1: `formatDomainError` (ogni HttpException codificata conserva il codice) + helper E11000 condivisi `src/mongo/mongo-errors.ts`
- [x] 02.1-02-PLAN.md — Wave 1: `CharacterCreationException` + codici, tabella `race-traits.ts` (età D-06, patrie D-10), `RaceTraits`, `NormalizedCharacterInput`
- [x] 02.1-04-PLAN.md — Wave 1: harness `createAuthTestApp({ imports, overrides })` + fixture City
- [x] 02.1-03-PLAN.md — Wave 2: normalizzazione/validità del nome (NFC, ’→', ≥ 1 lettera), validator autoritativo, `CreateCharacterInput` con enum GraphQL
- [x] 02.1-05-PLAN.md — Wave 2: stato iniziale D-09 (builder puro), `RandomSource`, `StartingLocationService` (città patria D-10)
- [x] 02.1-06-PLAN.md — Wave 2: indice unico collation `character_name_ci_unique` + verifier al boot + WARN città patria mancanti
- [x] 02.1-07-PLAN.md — Wave 3: `CharacterCreationModule` (senza Bull), service transazionale claim-then-insert, resolver `createCharacter`/`raceTraits`, integration test sul wire (concorrenza inclusa)
- [x] 02.1-08-PLAN.md — Wave 4: cablaggio in `AppModule`, `src/schema.gql` rigenerato, `BACKEND-NOTES.md` per il FE
**Unblocks (FE)**: FE Phase 2 Character Creation (CHAR-01..05, CHAR-07..09). Contratto proposto dal FE in `Klimmeck-Guide/.planning/phases/02-character-creation/BACKEND-NOTES.md`.
**Branch**: `feat/02.1-character-creation-contract` da `develop` → PR a `develop`.

### Phase 3: Autorizzazione: Ownership, Ruoli, Audit
**Goal**: L'autorizzazione è basata sull'identità autenticata: ownership sulle mutation, role guard sulle operazioni admin, subscription filtrate per identità, audit log admin persistente.
**Depends on**: Phase 2
**Requirements**: BE-AUTHZ-01, BE-AUTHZ-02, BE-AUTHZ-03, BE-AUTHZ-04, BE-SYNC-01, BE-SYNC-02
**Success Criteria** (what must be TRUE):
  1. Una mutation su un character non posseduto dal chiamante (equip/spell/transazione/quest/travel) restituisce 403; il proprietario riesce. L'innkeeper è esente dall'ownership e la sua azione è auditata (decisione utente 2026-10-14).
  2. Un'operazione admin (CRUD quest/enemy/POI/road, teleport, outcome, approve/reject) chiamata da un non-innkeeper restituisce 403; `@Roles(innkeeper)` la consente.
  3. `characterUpdated` (e lo user stream) emette solo al proprietario/innkeeper autenticato: un subscriber non riceve gli eventi del character altrui nemmeno passando l'id della vittima come argomento.
  4. Ogni azione admin scrive un record di audit persistente (who, what, when, target, args completi, esito; TTL 90 giorni) consultabile a DB.
  5. `userUpdated: User!` (senza argomenti) emette all'utente autenticato il proprio `User` a ogni modifica (`twitchPoints`, `role`, `currentCharacter`), prodotto da un change stream su `users`; nessun client può ascoltare un altro utente. *(aggiunto 2026-10-14 — contratto FE Phase 3)*
  6. Ogni (ri)sottoscrizione a `userUpdated` e `characterUpdated` riceve subito il documento corrente (snapshot) e poi gli eventi live; `characterUpdated(id)` su un id altrui da parte di un non-innkeeper è rifiutata con `FORBIDDEN`. Il contratto real-time atterra nella prima wave con `src/schema.gql` rigenerato. *(aggiunto 2026-10-14)*
**Plans**: 10 plans (7 waves; waves 1-3 = contratto real-time per il FE, D-07)
Plans:
- [x] 03-01-PLAN.md — Wave 0: PubSubEvents tipizzato + PUB_SUB, harness con PubSubModule, helper WS multi-evento, fixture createPlayer (BE-SYNC-01/02, BE-AUTHZ-03)
- [x] 03-02-PLAN.md — Primitive: readRequestIdentity, eccezioni FORBIDDEN/NOT_FOUND tipizzate, subscribeWithSnapshot, documentIdOf/isObjectIdHex (BE-SYNC-02, BE-AUTHZ-01/03)
- [x] 03-03-PLAN.md — userUpdated: change stream su users + subscription senza argomenti con snapshot e filtro identità (BE-SYNC-01/02, BE-AUTHZ-03)
- [x] 03-04-PLAN.md — Nucleo ownership: CharacterAccessPolicy, AuthorizationDecisions, @OwnsCharacter/OwnershipGuard, AuthzModule (BE-AUTHZ-01/03)
- [x] 03-05-PLAN.md — characterUpdated protetta (FORBIDDEN alla subscribe, snapshot, filtro per evento) + schema.gql rigenerato + handoff wave 1 (BE-AUTHZ-03, BE-SYNC-01/02)
- [x] 03-06-PLAN.md — @Roles(innkeeper) + RolesGuard, users/user innkeeper-only, rimozione createUser/updateUser/deleteUser/UserInput (BE-AUTHZ-02)
- [x] 03-07-PLAN.md — Ownership su doTransaction/equipItem/equipSpell/unequipSpell/useSpell/character/equipment, characters innkeeper-only, NOT_FOUND tipizzato (BE-AUTHZ-01/02)
- [x] 03-08-PLAN.md — pendingQuest(id) via il personaggio del bearer, pendingQuests innkeeper-only (BE-AUTHZ-01/02)
- [x] 03-09-PLAN.md — Audit admin: admin_audit_logs con TTL 90 giorni, service best-effort, AdminAuditInterceptor globale (BE-AUTHZ-04)
- [x] 03-10-PLAN.md — Whitelist enumerate degli handler protetti, schema finale senza drift, BACKEND-NOTES completo per il FE (tutti)
**Unblocks (FE)**: **FE Phase 3** (SYNC-01/02/03/06: `userUpdated`, snapshot, filtro identità — in lockstep, decisione 2026-10-14); FE Phase 10 in lockstep (role guard + audit log consegnati in anticipo, non deferiti) → FE ADMIN-07/08, HARDEN-02.
**Branch**: `feat/03-autorizzazione-ownership-ruoli-audit` da `develop` → PR a `develop` (template `feat/{phase}-{slug}`).

### Phase 03.1: Character Deletion Contract (INSERTED)
**Goal**: Un utente autenticato può eliminare il proprio personaggio corrente con una sola mutation; il BE lo archivia (soft delete, mai purge), scollega `User.currentCharacter` atomicamente, libera il nome e restituisce lo `User` aggiornato. Il FE Phase 4 (tab Impostazioni, SET-05) consuma questo contratto.
**Depends on**: Phase 3 (identità, ownership, `userUpdated` con snapshot), Phase 2.1 (pattern claim transazionale su `User.currentCharacter`, indice unico del nome)
**Requirements**: BE-CHAR-06, BE-CHAR-07, BE-CHAR-08, BE-CHAR-09
**Why inserted**: scoperto nel discuss della FE Phase 4 (2026-10-15): la FE Phase 3 D-09 prevede la cancellazione esplicita dalle impostazioni, ma il BE non espone alcuna mutation di cancellazione. Direttiva utente: in scope ora, fase BE companion, PR BE prima della PR FE.
**Success Criteria** (what must be TRUE):
  1. Un utente autenticato con `currentCharacter` valorizzato chiama `deleteCharacter` e riceve lo `User` con `currentCharacter: null`; il `Character` resta a DB marcato `deletedAt`/`deletionReason: user_request` e scollegato. Una seconda chiamata (o il perdente di due chiamate concorrenti) risponde `CHARACTER_NOT_FOUND`; nessuno stato parziale.
  2. Il personaggio archiviato è invisibile ai percorsi giocatore: `character(id)` → `NOT_FOUND`, `characterUpdated(id)` rifiutata alla subscribe come un id altrui, mutation sotto ownership rifiutate, processor spell-recovery che lo ignora; nessun evento `characterUpdated` viene emesso per documenti archiviati (nemmeno dall'update di archivio).
  3. Il nome del personaggio archiviato è riutilizzabile: l'indice unico case-insensitive copre solo i documenti attivi e `createCharacter` con quel nome riesce; il verifier di boot costruisce il nuovo indice senza bloccare l'avvio.
  4. `userUpdated` emette lo `User` con `currentCharacter: null` dopo la cancellazione (change stream `users` esistente, nessun publish aggiunto) e un nuovo `createCharacter` dello stesso utente riesce.
  5. `BACKEND-NOTES.md` della fase documenta contratto, codici, semantica dell'archivio e le risposte alle 4 domande aperte del FE; `src/schema.gql` è rigenerato e la CI non rileva drift.
**Plans**: 6 plans
Plans:
- [x] 03.1-01-PLAN.md — fondamenta: `DeletionReason`, `deletedAt`/`deletionReason` @Prop, `ACTIVE_CHARACTER_FILTER`, `CharacterDeletionException`
- [x] 03.1-02-PLAN.md — indice parziale `character_name_active_ci_unique` + verifier build-then-drop del legacy
- [x] 03.1-03-PLAN.md — invisibilità HTTP: policy e `CharactersService` filtrati, `NOT_FOUND` su id archiviati
- [x] 03.1-04-PLAN.md — change stream `$match` sugli attivi, rifiuto alla subscribe, spell-recovery che salta gli archiviati
- [x] 03.1-05-PLAN.md — mutation `deleteCharacter: User!` (transazione di claim inverso), AppModule, `src/schema.gql`
- [x] 03.1-06-PLAN.md — `BACKEND-NOTES.md` + gate di regressione
**Unblocks (FE)**: FE Phase 4 Settings Screen (SET-05). Contratto proposto dal FE in `Klimmeck-Guide/.planning/phases/04-settings-screen/BACKEND-NOTES.md`; decisioni in `03.1-CONTEXT.md`.
**Branch**: `feat/03.1-character-deletion-contract` da `develop` → PR a `develop`.

### Phase 4: Integrità Economica (Atomics)
**Goal**: Tutte le scritture di bilancio/inventario/quest/spell/equip sono atomiche — mai read-modify-write, mai stato parziale, safe in concorrenza. Chiude le concern rosse #5 (`useSpell`), #6 (`doTransaction`), #7 (equip).
**Depends on**: Phase 1 (harness per i test RED di concorrenza)
**Requirements**: BE-ATOM-01, BE-ATOM-02, BE-ATOM-03, BE-ATOM-04, BE-ATOM-05
**Success Criteria** (what must be TRUE):
  1. Un debito su `Character.coins`/`User.twitchPoints` insufficienti fallisce con errore e non lascia mai un saldo negativo (`$inc` condizionale con guard `$gte`); i saldi non passano mai da read-modify-write.
  2. `doTransaction` valida la fattibilità e poi applica coins+items in un'unica transazione Mongo; un fallimento indotto a metà transazione non lascia stato parziale.
  3. Due accettazioni quest concorrenti sulla stessa corsia producono esattamente un successo e un solo debito (single-flight).
  4. Due equip/activeSpells concorrenti non superano mai `maxActiveSpells` (optimistic concurrency / update atomico).
  5. Due `useSpell` concorrenti su una spell con 1 usage lasciano gli usages a 0 con esattamente un successo; il recovery job è idempotente e non porta mai gli usages oltre il massimo.
**Plans**: 9 plans (5 wave; executor sequenziali sul working tree)

Plans:
- [x] 04-01-PLAN.md — Wave 1: fondamenta pure — `GameRuleErrorCode`/`GameRuleException` (15 codici D-15), `ResourceNotFoundException.quest()`, modulo `coins` + espressioni Mongo (`$toInt`/`$ifNull`), tabella condivisa `maxActiveSpells` (virtual + `$switch`), `objectIdFromHex`
- [x] 04-02-PLAN.md — Wave 2: `WalletService` + `EconomyModule`, unico scrittore dei saldi (coins: `findOneAndUpdate` condizionale a pipeline; punti: `$inc` con guard), session-aware, test di concorrenza (BE-ATOM-01)
- [x] 04-03-PLAN.md — Wave 2: builder ObjectId-typed e classificatori per le magie attive; `equipSpell`/`unequipSpell`/`equipItem` come singoli update condizionali, `usages` dal catalogo, 4 equip concorrenti → 1 successo (BE-ATOM-04)
- [x] 04-04-PLAN.md — Wave 2: planner puro della transazione di negozio — `planTradeLines`, `priceTrade` dal catalogo, `assertClientTotalMatches`, `applyTradeToInventory`, guard sulle quantità vendute (BE-ATOM-02)
- [x] 04-05-PLAN.md — Wave 3: `useSpell` (catalogo → `$inc -1` condizionato → Bull dopo la scrittura con `randomUUID()`, compensazione + `SPELL_RECOVERY_UNAVAILABLE`), recovery con cap `maxUsages` idempotente (BE-ATOM-05)
- [x] 04-06-PLAN.md — Wave 3: fixture catalogo con prezzi, `CatalogPricesReader`, `ShopTransactionService` in transazione (inventario con quantità riaffermate → wallet in sessione), fallimento indotto → documento intatto (BE-ATOM-01/02)
- [x] 04-07-PLAN.md — Wave 3: `QuestAcceptanceService.accept(characterId, questId, costCopper)` single-flight in transazione (claim slot → insert `PendingQuest` → debito), 3 accept concorrenti → 1 solo, montato in `AppModule` senza GraphQL (BE-ATOM-03)
- [x] 04-08-PLAN.md — Wave 4: `doTransaction` sul wire delegato a `ShopTransactionService`, `EconomyModule` in `CharactersModule` e nell'harness, fixture a totale zero, rimozione di `normalizeCoins`/`src/utils.ts` e di ogni `save()` residuo (BE-ATOM-02)
- [x] 04-09-PLAN.md — Wave 5: gate trasversale (suite completa, build, eslint/prettier sui file toccati, schema senza diff, grep "mai read-modify-write"), `BACKEND-NOTES.md` per il FE, traceability BE-ATOM-01..05 (tutti)
**Unblocks (FE)**: nessuna fase FE diretta; prerequisito interno per Phase 6 (credito EventSub), Phase 7 (accept atomico) e Phase 8 (teleport/clear atomico). Supporta FE QUEST-06.
**Branch**: `feat/04-integrita-economica-atomics` da `develop` → PR a `develop` (template `feat/{phase}-{slug}`; in origine `feat/04-atomic-operations`).

### Phase 5: Infrastruttura Push FCM
**Goal**: Esiste un'infrastruttura push FCM domain-agnostic: registro token per-device, servizio di invio condiviso, pruning dei token stale; il push è un side-channel non autoritativo.
**Depends on**: Phase 2 (la registrazione token richiede l'identità autenticata)
**Requirements**: BE-NOTIF-01, BE-NOTIF-02, BE-NOTIF-03
**Success Criteria** (what must be TRUE):
  1. Una mutation di registrazione token fa upsert per `userId+deviceId`; ri-registrare lo stesso device aggiorna invece di duplicare.
  2. Un servizio condiviso `sendToUser(userId, payload)` (firebase-admin, FCM HTTP v1) consegna un data message che porta al massimo un ID — mai stato di gioco.
  3. L'invio a un token che risponde `registration-token-not-registered` fa pruning di quel token dal registro.
  4. I push travel-end / quest-end / streamer-live sono emessi come data message agli utenti interessati (gestibili nei tre app state FE).
**Plans**: TBD
**Unblocks (FE)**: FE Phase 5 → FE NOTIF-01/03/04/05.
**Research flag**: nessuno — firebase-admin è pattern standard (HIGH confidence). Confermare runtime Node prod (18/20 vs 22) per firebase-admin 13 vs 14.
**Branch**: `feat/05-infrastruttura-push-fcm` da `develop` → PR a `develop`.

### Phase 6: EventSub: Punti Canale & Streamer Live
**Goal**: Un webhook Twitch EventSub accredita i punti canale 1:1 su `twitchPoints` — HMAC-verificato, challenge-gestito, idempotente e atomico; `stream.online` alimenta il push streamer-live.
**Depends on**: Phase 4 (credito atomico), Phase 5 (push streamer-live)
**Requirements**: BE-POINTS-01, BE-POINTS-02, BE-POINTS-03
**Success Criteria** (what must be TRUE):
  1. Il webhook (`@Public()`, `rawBody: true`) verifica l'HMAC-SHA256 su `message_id + timestamp + raw_body`, risponde al challenge handshake e rifiuta messaggi fuori dalla replay window o con firma errata.
  2. Una redemption della custom reward accredita `twitchPoints` 1:1 via `$inc` atomico; la redelivery dello stesso `message_id` accredita esattamente una volta (dedup).
  3. Le subscription EventSub `channel_points_custom_reward_redemption.add` e `stream.online` sono create/verificate/rinnovate con un app access token.
  4. Un evento `stream.online` scatena il push streamer-live agli utenti interessati.
**Plans**: TBD
**Unblocks (FE)**: sync punti live (FE SYNC-01/07) e push streamer-live (FE NOTIF-04).
**Research flag**: Twitch Helix subscription lifecycle (app access token, expiry/revocation) — approfondire in planning.
**Branch**: `feat/06-eventsub-points` da `develop` → PR a `develop`.

### Phase 7: Quest Lanes (QUEST-04)
**Goal**: Corsie quest parallele — active story/worldMission quest sul Character esposte su schema + subscription, accettazione lane-aware, cost model server-side, countdown pending con timestamp server-side.
**Depends on**: Phase 3 (ownership/authz), Phase 4 (accept atomico)
**Requirements**: BE-QUEST-01, BE-QUEST-02, BE-QUEST-03, BE-QUEST-04
**Success Criteria** (what must be TRUE):
  1. `Character` espone `activeStoryQuest` e `activeWorldMissionQuest` (PendingQuest opzionali, indipendenti da `pendingQuest`) su schema GraphQL e payload della subscription — su staging prima di FE Phase 6.
  2. Accettare una story quest con un `pendingQuest` standard già presente riesce (corsie parallele); accettare una seconda story quest mentre una è attiva è rifiutato (solo la sua corsia blocca).
  3. Le quest story/worldMission debitano `User.twitchPoints`, le altre `Character.coins`; eleggibilità e debito sono calcolati server-side e non sovrascrivibili dal client.
  4. `pendingQuest` è emesso con `startDate` + `waitingTime` server-side così il countdown FE è autoritativo.
**Plans**: TBD
**Unblocks (FE)**: **FE Phase 6** (schema + resolver + payload subscription su staging) → FE QUEST-04/05/07.
**Branch**: `feat/07-quest-lanes` da `develop` → PR a `develop`.

### Phase 8: Travel Lifecycle (TRAVEL-01)
**Goal**: Viaggio server-autoritativo — `activeTravel` su schema + subscription, start ETA-validato, completamento con DB come fonte di verità (Bull come trigger + reconciler al boot), teleport clear atomico.
**Depends on**: Phase 4 (atomiche), Phase 5 (push travel-end)
**Requirements**: BE-TRAVEL-01, BE-TRAVEL-02, BE-TRAVEL-03, BE-TRAVEL-04
**Success Criteria** (what must be TRUE):
  1. `Character.status.activeTravel { road, startTime, endTime, duration }` è su schema e payload subscription — su staging prima di FE Phase 7.
  2. `startTravel(poiId)` rifiuta se un travel è già attivo, altrimenti calcola percorso/ETA server-side (graphology) e persiste `activeTravel`; esiste una query di preview ETA per la conferma FE.
  3. Alla scadenza di `endTime` il BE cancella `activeTravel`, aggiorna `location` ed emette via subscription + push travel-end; un viaggio scaduto mentre il server era spento viene completato da un reconciler al boot (il DB `endTime` è la fonte di verità, il job Bull è solo un trigger).
  4. Il teleport admin sovrascrive `location` e cancella `activeTravel` (incluso il job Bull pendente) atomicamente in un'unica operazione.
**Plans**: TBD
**Unblocks (FE)**: **FE Phase 7** (schema + lifecycle su staging) → FE TRAVEL-01/02/03/04, ADMIN-04.
**Branch**: `feat/08-travel-lifecycle` da `develop` → PR a `develop`.

### Phase 9: Combat Result & Admin Outcomes
**Goal**: Risultati di combattimento persistiti con delivery ibrida, outcome di combat admin-mediati, e la coda pending dell'innkeeper con approve/reject role-guarded e audit-loggati.
**Depends on**: Phase 3 (role guard + audit), Phase 4 (update character atomico), Phase 5 (push combat)
**Requirements**: BE-COMBAT-01, BE-COMBAT-02, BE-COMBAT-03, BE-ADMIN-01, BE-ADMIN-02
**Success Criteria** (what must be TRUE):
  1. Un'entità `CombatResult` persiste HP prima/dopo, consumabili/spell usate, injuries, rewards (equipment/items/coins) e XP.
  2. Su un outcome la subscription emette il payload completo in foreground, il data message FCM porta solo `resultId`, e `combatResult(id)` ritorna lo stesso risultato al requery.
  3. L'innkeeper registra un outcome via mutation role-guarded che crea il CombatResult e aggiorna il Character atomicamente.
  4. L'innkeeper ha una vista live (query + subscription) delle pending request story/worldMission con i dati che servono al filtro FE su `activeTravel`.
  5. Le mutation approve/reject sulle pending request story/worldMission sono role-guarded e audit-loggate.
**Plans**: TBD
**Unblocks (FE)**: FE Phase 9 (contratto combat) e FE Phase 10 (operazioni admin) → FE COMBAT-01..05, ADMIN-02/03/05/06.
**Branch**: `feat/09-combat-admin` da `develop` → PR a `develop`.

### Phase 10: Hardening Trasversale
**Goal**: Hardening trasversale — validazione input, introspection off/CORS/error sanitization in prod, igiene dei secret, e coverage di test sulle aree critiche.
**Depends on**: Phases 2-9 (indurisce le superfici che aggiungono)
**Requirements**: BE-HARD-01, BE-HARD-02, BE-HARD-03, BE-HARD-04
**Success Criteria** (what must be TRUE):
  1. Tutti gli input GraphQL/REST sono validati da class-validator + `ValidationPipe` globale: ID Mongo invalidi, quantità negative e stringhe fuori lunghezza sono rifiutati prima di raggiungere un service.
  2. In produzione l'introspection GraphQL è disattivata e gli errori sono sanitizzati (nessun leak di ID/relazioni a client non autorizzati); il CORS è esplicito e documentato.
  3. `.env.example` è committato con ogni variabile documentata, nessun secret è nel repo, e un audit CI (grep) fallisce sui pattern di secret.
  4. Auth, atomics, EventSub e travel lifecycle hanno coverage di test su happy path, concorrenza e failure mode.
**Plans**: TBD
**Unblocks (FE)**: mirror di FE Phase 12 (hardening).
**Branch**: `feat/10-hardening` da `develop` → PR a `develop`.

## Backend ↔ Frontend alignment

Vincoli d'ordine dichiarati dal FE, mappati sulle fasi BE:

| Vincolo FE | Fase BE che lo soddisfa | Nota |
|-----------|------------------------|------|
| FE Phase 3 richiede il contratto `connection_init` | Phase 2 (BE-AUTH-03/04) | Il contratto WS auth va su staging prima di FE Phase 3 |
| FE Phase 5 dipende da FCM | Phase 5 (BE-NOTIF) | Servizio push pronto prima delle notifiche FE |
| FE Phase 6 bloccata da QUEST-04 su staging | Phase 7 (BE-QUEST) | Schema + resolver + subscription su staging prima di FE Phase 6 |
| FE Phase 7 bloccata da TRAVEL-01 su staging | Phase 8 (BE-TRAVEL) | Schema + lifecycle su staging prima di FE Phase 7 |
| FE Phase 10 vuole role guard + audit in lockstep | Phase 3 (BE-AUTHZ) + Phase 9 (BE-ADMIN) | Authz consegnata in anticipo; approve/reject e admin outcome in Phase 9 |
| FE Phase 11 (auth reale) — l'auth BE atterra prima/insieme | Phase 2 (BE-AUTH) | Anticipazione deliberata: rationale in PROJECT.md Key Decisions e REQUIREMENTS.md; l'handoff chiude le Open Questions #1/#2 |

Nota compatibilità: i contratti di schema aggiunti (QUEST-04, TRAVEL-01, combat, connection_init) devono arrivare su staging **prima** delle fasi FE che li consumano; i contratti GraphQL esistenti non si rompono. Le fasi FE 2–10 continuano a girare sullo stub `DEV_AUTH_ACCESS_TOKEN` grazie al dev bypass fail-closed di Phase 2.

## Progress

**Execution Order:**
Le fasi eseguono in ordine numerico: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fondazione Test & Consolidamento Spell WIP | 0/4 | Not started | - |
| 2. Auth & Identity Foundation | 9/9 | Complete    | 2026-10-06 |
| 3. Autorizzazione: Ownership, Ruoli, Audit | 10/10 | Complete    | 2026-10-14 |
| 3.1. Character Deletion Contract | 6/6 | Complete | 2026-10-16 |
| 4. Integrità Economica (Atomics) | 9/9 | Complete | 2026-10-18 |
| 5. Infrastruttura Push FCM | 8/8 | In Progress | - |
| 6. EventSub: Punti Canale & Streamer Live | 0/TBD | Not started | - |
| 7. Quest Lanes (QUEST-04) | 0/TBD | Not started | - |
| 8. Travel Lifecycle (TRAVEL-01) | 0/TBD | Not started | - |
| 9. Combat Result & Admin Outcomes | 0/TBD | Not started | - |
| 10. Hardening Trasversale | 0/TBD | Not started | - |
