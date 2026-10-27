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
- [x] **Phase 5: Infrastruttura Push FCM** - Registro token per-device, servizio push domain-agnostic, pruning token stale (completed 2026-10-18)
- [x] **Phase 6: EventSub: Punti Canale & Streamer Live** - Webhook Twitch EventSub, credito idempotente 1:1, push streamer-live (completed 2026-10-21)
- [x] **Phase 7: Quest Lanes (QUEST-04)** - Corsie story/worldMission su schema + subscription, accettazione lane-aware, cost model server-side (completed 2026-10-21)
- [x] **Phase 8: Travel Lifecycle (TRAVEL-01)** - `activeTravel` su schema + subscription, ETA/completamento server-side, teleport atomico (completed 2026-10-21)
- [x] **Phase 9: Combat Result & Admin Outcomes** - `QuestResult` persistito con delivery ibrida (subscription owner-only + push `questEnd` + query), corsia standard risolta server-side dietro `CombatResolver` (segnaposto), catena aid/morte, coda live innkeeper + `completePendingRequest`, guard `SHOP_NOT_IN_CITY` (completed 2026-10-24)
- [ ] **Phase 9.1: Spell State and Recovery Contract** (INSERTED 2026-10-27) - Stato per magia conosciuta `status.spellStates { spell, usages, recoveries }` che sopravvive a equip/disequip, recupero che non si interrompe mai (regola dell'utente), processor idempotente + reconciler/sweep, migrazione al boot; sblocca FE Phase 8 (SPELL-05)
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
**Branch**: `feat/06-eventsub-punti-canale-streamer-live` da `develop` → PR a `develop` (template `feat/{phase}-{slug}`; in origine `feat/06-eventsub-points`, allineato nel discuss del 2026-10-19).

### Phase 7: Quest Lanes (QUEST-04)
**Goal**: Corsie quest parallele — active story/worldMission quest sul Character esposte su schema + subscription, accettazione lane-aware, cost model server-side, countdown pending con timestamp server-side.
**Depends on**: Phase 3 (ownership/authz), Phase 4 (accept atomico)
**Requirements**: BE-QUEST-01, BE-QUEST-02, BE-QUEST-03, BE-QUEST-04
**Success Criteria** (what must be TRUE):
  1. `Character` espone `activeStoryQuest` e `activeWorldMissionQuest` (PendingQuest opzionali, indipendenti da `pendingQuest`) su schema GraphQL e payload della subscription — su staging prima di FE Phase 6.
  2. Accettare una story quest con un `pendingQuest` standard già presente riesce (corsie parallele); accettare una seconda story quest mentre una è attiva è rifiutato (solo la sua corsia blocca).
  3. Le quest story/worldMission debitano `User.twitchPoints` (`requiredPoints`); nessuna quest debita `Character.coins` (emendato nel discuss del 2026-10-21); eleggibilità (città del marker, titolo, non ripetibilità, capienza del party per rango) e debito sono calcolati server-side e non sovrascrivibili dal client.
  4. `pendingQuest` è emesso con `startDate` + `waitingTime` server-side così il countdown FE è autoritativo.
**Plans**: 8 piani in 4 wave (pianificati il 2026-10-21; contratto schema nelle prime wave così la FE Phase 6 può partire)
- [x] 07-01-PLAN.md — Wave 1: contratto dati — `CharacterQuests.activeStoryQuest`/`activeWorldMissionQuest`, `PendingQuest.pointsSpent: Int!`, `QuestRequirements.party: [QuestPartySlot!]!`, campo interno `Quest.registrations` (mai su GraphQL), fixture, SDL nel boot reale e `src/schema.gql` additivo (BE-QUEST-01, BE-QUEST-03)
- [x] 07-02-PLAN.md — Wave 1: regole pure testate a tabella — 5 codici `GameRuleErrorCode` nuovi, `quest-lanes.ts` (corsia dal tipo), `quest-eligibility.ts` (titolo, ripetibilità, condivise, costo, `waitingTime`, capienza, ordine di classificazione), `quest-acceptance.updates.ts` (filtri di claim e registrazione con `$expr`) (BE-QUEST-02/03/04)
- [x] 07-03-PLAN.md — Wave 2: populate «solo il PendingQuest» — helper `primeCharactersChangeStream` condiviso, costante `CHARACTER_QUESTS_POPULATE` (tre corsie + `completedQuests` con `select: '_id'`) in `findOne`/`findAll`, `PendingQuest`/`Quest` registrati in `CharactersModule` e nell'harness, int-spec su `character`, `characters`, `characterUpdated` (BE-QUEST-01)
- [x] 07-04-PLAN.md — Wave 2: autorizzazione — `@OwnsCharacter(selectId, { ownerOnly: true })` senza bypass innkeeper, `pendingQuest(id)` riconosce le tre corsie (BE-QUEST-02/03)
- [x] 07-05-PLAN.md — Wave 2: `serverTime: DateTime!` autenticata — `ServerTimeResolver` sincrono + `ServerTimeModule` con `Clock` locale, montato in `AppModule`, boot reale e schema (BE-QUEST-04)
- [x] 07-06-PLAN.md — Wave 2: `QuestAcceptanceService.accept({ ownerId, characterId, questId })` generalizzato — pre-letture lean, regole pure, transazione claim → registrazione `$expr` → insert `PendingQuest` → `debitUserPoints(session)`, verifica della città in una query, int-spec con la matrice D-19 e concorrenza, test Phase 4 su `costCopper` sostituiti (BE-QUEST-02/03/04)
- [x] 07-07-PLAN.md — Wave 3: superficie GraphQL — `input AcceptQuestRequest { id, questId }`, `QuestAcceptanceResolver.acceptQuest` owner-only in `QuestAcceptanceModule` (+ `AuthzModule`), int-spec sul filo (codici, FORBIDDEN senza audit, id malformati, UNAUTHENTICATED, `characterUpdated` con la corsia popolata), boot reale con `EXPECTED_OWNER_ONLY_HANDLERS` e test negativo riscritto in positivo, schema rigenerato (BE-QUEST-01..04)
- [x] 07-08-PLAN.md — Wave 4: gate di fase (suite complete, build, lint filtrato, schema additivo senza drift, invarianti) + `BACKEND-NOTES.md` per la FE Phase 6 + traceability BE-QUEST-01..04 + `07-VALIDATION.md` (BE-QUEST-01..04)
**Unblocks (FE)**: **FE Phase 6** (schema + resolver + payload subscription su staging) → FE QUEST-04/05/07.
**Branch**: `feat/07-quest-lanes-quest-04` da `develop` → PR a `develop`.

### Phase 8: Travel Lifecycle (TRAVEL-01)
**Goal**: Viaggio server-autoritativo — `activeTravel` su schema + subscription, start ETA-validato, completamento con DB come fonte di verità (Bull come trigger + reconciler al boot), teleport clear atomico.
**Depends on**: Phase 4 (atomiche), Phase 5 (push travel-end)
**Requirements**: BE-TRAVEL-01, BE-TRAVEL-02, BE-TRAVEL-03, BE-TRAVEL-04
**Success Criteria** (what must be TRUE):
  1. `Character.status.activeTravel { road, startTime, endTime, duration }` è su schema e payload subscription — su staging prima di FE Phase 7.
  2. `startTravel(poiId)` rifiuta se un travel è già attivo, altrimenti calcola percorso/ETA server-side (graphology) e persiste `activeTravel`; esiste una query di preview ETA per la conferma FE.
  3. Alla scadenza di `endTime` il BE cancella `activeTravel`, aggiorna `location` ed emette via subscription + push travel-end; un viaggio scaduto mentre il server era spento viene completato da un reconciler al boot (il DB `endTime` è la fonte di verità, il job Bull è solo un trigger).
  4. Il teleport admin sovrascrive `location` e cancella `activeTravel` (incluso il job Bull pendente) atomicamente in un'unica operazione.
**Plans**: 14 piani in 7 wave (pianificati il 2026-10-21; contratto schema in Wave 1 così la FE Phase 7 può partire)
- [x] 08-01-PLAN.md — Wave 1: contratto schema — `CharacterStatus.activeTravel` (`ActiveTravel`, `TravelPath`, `to: ID!`, `kind` interno), `PendingQuest.startDate` nullable, `Pet.speedModifier`, `requiredAdventurers` a slot e `registeredAdventurers` a oggetti (`party`/`registrations` rimossi), SDL nel boot reale, riga Branch allineata (BE-TRAVEL-01)
- [x] 08-02-PLAN.md — Wave 1: codici `TRAVEL_*`/`QUEST_IN_PROGRESS`, NOT_FOUND del luogo, `refIdOf` condiviso, modulo puro della capienza per rango D-32 con specchio `$expr` (BE-TRAVEL-02/04)
- [x] 08-03-PLAN.md — Wave 2: populate del catalogo quest D-31 (enemy, lore, item con refPath assoluto, orfani scartati), `quest(id)` NOT_FOUND tipizzato
- [x] 08-04-PLAN.md — Wave 1: `routeOf` puro + `RoadsService.routeBetween` (null mai eccezioni, arco più leggero), `RoadsModule` autosufficiente (BE-TRAVEL-02)
- [x] 08-05-PLAN.md — Wave 2: regole pure del viaggio — velocità/durata dal pet, `buildActiveTravel`, ordine dei rifiuti, filtri/update di avvio, completamento, countdown, teleport, scaduti, identità del job, `TRAVEL_SWEEP_INTERVAL_MS` fail-closed (BE-TRAVEL-02/03/04)
- [x] 08-06-PLAN.md — Wave 2: emendamenti all'accettazione — guard "non in viaggio" (D-06), story/worldMission da qualunque città, registrazione di enemy/aid a slot D-32, slot invalidi ⇒ `QUEST_NOT_ACCEPTABLE` (BE-TRAVEL-02)
- [x] 08-07-PLAN.md — Wave 2: `deleteCharacter` libera i posti nelle quest registrate (D-30)
- [x] 08-08-PLAN.md — Wave 3: `TravelPlanner` (planFree/planAuto) + `TravelScheduler` (coda `travel`, jobId deterministico) in `TravelPlanningModule`, mappa di prova e fake della coda (BE-TRAVEL-02/03)
- [x] 08-09-PLAN.md — Wave 3: `TravelCompletionService` idempotente (countdown della quest, push `travelEnd` solo per i viaggi liberi) + `TravelSweeper` (reconciler al boot, sweep periodico) in `TravelModule` (BE-TRAVEL-03)
- [x] 08-10-PLAN.md — Wave 4: processor Bull del completamento su Redis reale, `TravelModule` montato nel boot reale (BE-TRAVEL-03)
- [x] 08-11-PLAN.md — Wave 4: viaggio automatico all'accettazione della corsia standard (stesso claim, salto senza strada, job dopo il commit), `startDate` null sul filo (BE-TRAVEL-02/03)
- [x] 08-12-PLAN.md — Wave 5: `startTravel` e `travelPreview` owner-only, avvio condizionale, prova sul filo fino all'arrivo, whitelist e SDL (BE-TRAVEL-01/02/03)
- [x] 08-13-PLAN.md — Wave 6: `teleportCharacter` innkeeper atomico con rimozione del job e audit, whitelist e SDL (BE-TRAVEL-04)
- [x] 08-14-PLAN.md — Wave 7: gate di fase + `BACKEND-NOTES.md` per FE Phase 7/6 e BE Phase 9/10 + traceability BE-TRAVEL-01..04 + `08-VALIDATION.md` (BE-TRAVEL-01..04)
**Unblocks (FE)**: **FE Phase 7** (schema + lifecycle su staging) → FE TRAVEL-01/02/03/04, ADMIN-04.
**Branch**: `feat/08-travel-lifecycle-travel-01` da `develop` → PR a `develop` (template `feat/{phase}-{slug}`; in origine `feat/08-travel-lifecycle`, allineato nel planning del 2026-10-21, D-25).

### Phase 9: Combat Result & Admin Outcomes
**Goal**: Esiti delle quest risolti dal server (corsia standard alla scadenza, motore di combattimento sostituibile) e completati dal GM per story/worldMission, con un risultato persistito per personaggio consegnato in modo ibrido e la coda live dell'innkeeper con completamento role-guarded e audit-loggato _(emendato 2026-10-24, 09-CONTEXT D-01..D-04)_.
**Depends on**: Phase 3 (role guard + audit), Phase 4 (update character atomico), Phase 5 (push combat)
**Requirements**: BE-COMBAT-01, BE-COMBAT-02, BE-COMBAT-03, BE-ADMIN-01, BE-ADMIN-02
**Success Criteria** (what must be TRUE):
  1. Un'entità `CombatResult` persiste HP prima/dopo, consumabili/spell usate, injuries, rewards (equipment/items/coins) e XP.
  2. Su un outcome la subscription emette il payload completo in foreground, il data message FCM porta solo `resultId`, e `questResult(id)` ritorna lo stesso risultato al requery.
  3. L'innkeeper completa una richiesta story/worldMission via mutation role-guarded (solo esito positivo, override opzionali per personaggio, nessun grade) che crea un risultato per personaggio e aggiorna i Character atomicamente; la corsia standard è risolta dal server alla scadenza.
  4. L'innkeeper ha una vista live (query + subscription) delle pending request story/worldMission con i dati che servono al filtro FE su `activeTravel`.
  5. La mutation di completamento delle pending request story/worldMission è role-guarded e audit-loggata (nessun approve/reject, nessun rimborso).
**Plans**: 20 plans (12 waves)

Plans:
- [x] 09-01-PLAN.md — Wave 1: contratto dei modelli (`awaitingAid`, `concludedAt`/`rescue` interni, `prizes.spell`, `QuestResult` + `QuestOutcome`), slot magia dal rango mage, emendamenti BE-COMBAT-03/BE-ADMIN-02 (BE-COMBAT-01/03, BE-ADMIN-02)
- [x] 09-02-PLAN.md — Wave 1: tabella livelli/HP, progressione del titolo, HP iniziali 1000, codici nuovi (BE-COMBAT-01/03, BE-ADMIN-02)
- [x] 09-03-PLAN.md — Wave 1: `ChanceSource`, loot a cascata, premi, clone della aid, timeout di soccorso (C5), tabella segnaposto delle ferite (BE-COMBAT-01/03)
- [x] 09-04-PLAN.md — Wave 2: porta `CombatResolver`, contesto idratato, resolver segnaposto, fake e fixture `Enemy` (BE-COMBAT-03)
- [x] 09-05-PLAN.md — Wave 3: piano puro dell'esito, soccorso/morte, update della quest registrata (BE-COMBAT-01/03, BE-ADMIN-02)
- [x] 09-06-PLAN.md — Wave 2: proprietà per utente, query `questResult`, subscription `questResultReceived`, SDL del risultato (BE-COMBAT-01/02)
- [x] 09-07-PLAN.md — Wave 3: coda live `pendingRequests`/`pendingRequestsUpdated` innkeeper (BE-ADMIN-01)
- [x] 09-08-PLAN.md — Wave 2: guard `AWAITING_AID`, quest concluse fuori dalla board, rallentamento da ferite (BE-COMBAT-03)
- [x] 09-09-PLAN.md — Wave 2: guard del negozio `SHOP_NOT_IN_CITY` (BE-COMBAT-03)
- [x] 09-10-PLAN.md — Wave 3: coda `quest-resolution`, scheduler, env `QUEST_SWEEP_INTERVAL_MS`, accodamento dove si scrive `startDate` (BE-COMBAT-03)
- [x] 09-11-PLAN.md — Wave 2: `CharacterArchiver.archiveWithin` (morte nella transazione dell'esito, C1) (BE-COMBAT-03)
- [x] 09-12-PLAN.md — Wave 4: writer degli esiti, risoluzione individuale senza nemico e con combattimento, push `questEnd(resultId)` (BE-COMBAT-01/02/03)
- [x] 09-13-PLAN.md — Wave 5: dispatcher `resolveStandard`, boss di gruppo, catena di soccorso, timeout di 7 giorni (BE-COMBAT-01/03)
- [x] 09-14-PLAN.md — Wave 6: processor, reconciler + sweep, montaggio nel boot reale (BE-COMBAT-03)
- [x] 09-15-PLAN.md — Wave 7: `completePendingRequest` con override, audit, SDL (BE-COMBAT-01/03, BE-ADMIN-02)
- [x] 09-16-PLAN.md — Wave 8: gate di fase + `BACKEND-NOTES.md` per FE Phase 9/10/7 e BE Phase 10 + traceability + `09-VALIDATION.md` (BE-COMBAT-01..03, BE-ADMIN-01..02)
- [x] 09-17-PLAN.md — Wave 9: verdetto unico del combattimento (D-05 emendata, A3 decisa dall'utente il 2026-10-25), C5 confermata, segnaposto provvisori (BE-COMBAT-03)
- [x] 09-18-PLAN.md — Wave 10: una sola aid per combattimento perso con i posti della quest fallita, soccorso di gruppo, rescuedCharacters (decisione utente 2026-10-25) (BE-COMBAT-01/03)
- [x] 09-19-PLAN.md — Wave 11: avvio delle quest registrate solo a party completo (arrivedAt/startedAt), abandonQuest, scioglimento a 24 ore con push questCancelled, timer della aid sospeso solo dalla aid in corso (decisioni utente 2026-10-25) (BE-COMBAT-03)
- [x] 09-20-PLAN.md — Wave 12: posti della aid identici all'originale, subscription questUpdated per il contatore del party (decisioni utente 2026-10-26) (BE-COMBAT-03)
**Unblocks (FE)**: FE Phase 9 (contratto combat) e FE Phase 10 (operazioni admin) → FE COMBAT-01..05, ADMIN-02/03/05/06.
**Branch**: `feat/09-combat-result-admin-outcomes` da `develop` → PR a `develop` (allineato al template `feat/{phase}-{slug}`, 2026-10-24).

### Phase 09.1: Spell State and Recovery Contract (INSERTED 2026-10-27)
**Goal**: Usi e recuperi delle magie appartengono alla magia conosciuta, non allo slot: `CharacterStatus.spellStates { spell, usages, recoveries }` (additivo) espone per ogni magia gli usi rimasti e gli istanti in cui ogni uso torna; `equipSpell`/`unequipSpell` non toccano lo stato e il recupero prosegue anche fuori dagli slot («Il timer di recupero non si interrompe mai», utente 2026-10-27; Phase 4 D-11 superata); `useSpell` e i consumi degli esiti scrivono stato e `dueAt` in un solo update; processor idempotente, reconciler al boot + sweep (`SPELL_RECOVERY_SWEEP_INTERVAL_MS`) con il DB come fonte di verità; migrazione idempotente al boot; handoff per la FE Phase 8.
**Depends on**: Phase 4 (atomics delle magie), Phase 9 (consumi degli esiti, `spellLearned`)
**Requirements**: BE-SPELL-01, BE-SPELL-02, BE-SPELL-03, BE-SPELL-04
**Success Criteria** (what must be TRUE):
  1. `characterUpdated` e `character` portano `status.spellStates` con una voce per ogni magia conosciuta, `recoveries` crescente e `recoveries.length == maxUsages − usages` per ogni uso tracciato; `ActiveSpell.usages` coincide sempre con lo stato.
  2. Disequipaggiare e riequipaggiare una magia non cambia né gli usi né i recuperi; una magia disequipaggiata recupera un uso allo scadere del suo istante.
  3. Un job di recupero rieseguito, perso o in ritardo non supera mai `maxUsages` e non lascia istanti scaduti: reconciler e sweep restituiscono gli usi scaduti entro un giro.
  4. I personaggi esistenti ricevono `spellStates` coerente al primo boot senza downtime; i job legacy in Redis continuano a funzionare.
  5. `src/schema.gql` cambia solo in modo additivo e il handoff risponde alle domande della FE (`Klimmeck-Guide/.planning/phases/08-spells-section-journal-tab/BACKEND-NOTES.md` §6).
**Plans**: 10 plans (7 waves)

Plans:
- [x] 09.1-01-PLAN.md — Wave 1: modello `SpellState` e `CharacterStatus.spellStates`, SDL additivo rigenerato dal boot reale, fixture `spellBook`, creazione con `spellStates: []`
- [x] 09.1-02-PLAN.md — Wave 1: builder puri di uso/credito/legacy (`arrayFilters`), `spellStatesOrMigrated`, pipeline di migrazione/riparazione/taglio, contratto del job `recover`, config `SPELL_RECOVERY_SWEEP_INTERVAL_MS`
- [x] 09.1-03-PLAN.md — Wave 2: `SpellStateMigrator` (boot + `migrateOne`, riparazione e taglio) e `SpellRecoveryService` (credito dovuto/legacy, concorrenza, replay, archiviati, magia disequipaggiata)
- [x] 09.1-08-PLAN.md — Wave 2: esiti in lettura (contesto di combattimento, override GM) dallo stato; apprendimento con la voce di stato e `maxUsages` nel catalogo premi
- [x] 09.1-04-PLAN.md — Wave 3: processor-trigger in `src/characters/spells/`, `SpellRecoveryModule` con reconciler + sweep montato in `AppModule`, vecchio processor rimosso
- [x] 09.1-09-PLAN.md — Wave 3: esiti in spesa (`spellsSpent` sullo stato con `dueAt`, mirror) e `OutcomeWriter` con `enqueueTrigger` e `jobId` deterministico
- [x] 09.1-05-PLAN.md — Wave 4: `equipSpell` con update pipeline (usi dallo stato) e `unequipSpell` neutro
- [x] 09.1-06-PLAN.md — Wave 5: `useSpell` su stato e mirror con trigger best-effort, fixture su `spellBook`, rimozione dei vecchi builder e di `SPELL_RECOVERY_UNAVAILABLE`
- [ ] 09.1-07-PLAN.md — Wave 6: `spellsOnTheWire` in `findOne` (usi dallo stato, orfani scartati), prove su `character` e `characterUpdated`
- [ ] 09.1-10-PLAN.md — Wave 7: gate (suite complete, schema additivo), handoff `BACKEND-NOTES.md` per la FE Phase 8, traceability
**Unblocks (FE)**: FE Phase 8 (SPELL-05 countdown; il piano finale della FE seleziona `spellStates` solo dopo questa PR).
**Branch**: `feat/09.1-spell-state-and-recovery-contract` da `develop` → PR a `develop`; la Phase 10 parte da questo branch (stacked).

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
| 5. Infrastruttura Push FCM | 8/8 | Complete    | 2026-10-18 |
| 6. EventSub: Punti Canale & Streamer Live | 9/9 | Complete    | 2026-10-21 |
| 7. Quest Lanes (QUEST-04) | 8/8 | Complete    | 2026-10-21 |
| 8. Travel Lifecycle (TRAVEL-01) | 14/14 | Complete    | 2026-10-21 |
| 9. Combat Result & Admin Outcomes | 20/20 | Complete    | 2026-10-26 |
| 9.1. Spell State and Recovery Contract | 8/10 | In Progress | - |
| 10. Hardening Trasversale | 0/TBD | Not started | - |
