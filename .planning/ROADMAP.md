# Roadmap: Klimmeck Guide — Backend (v1.0 Core Loop)

## Overview

Questa milestone porta il backend brownfield da "completamente aperto e con bug di concorrenza" a "fonte di verità sicura e atomica". Si parte dalla fondazione di test TDD (senza cui nulla è testabile) e dal consolidamento del WIP spell nel working tree, poi si posa il seam di autenticazione (JWT di sessione, guard globale HTTP + WS) e l'autorizzazione (ownership, ruoli, audit). Sopra le atomiche economiche — la fondazione trasversale che rende sicuri i crediti EventSub e il lifecycle viaggi — si innestano push FCM, sync punti Twitch, le corsie quest e il lifecycle viaggi (i due contratti che sbloccano le fasi FE 6 e 7 su staging), il contratto combat/admin, e infine l'hardening trasversale. Ogni fase consegna una capacità coerente e verificabile, e diverse fasi sbloccano deliberatamente in anticipo le rispettive fasi FE.

**Estensione del 2026-10-29 (Phases 11–16).** Prima di chiudere la v1.0 l'utente ha aggiunto sei fasi di contenuto e regole di gioco: il popolamento del mondo dal documento di world building (dati per tutto il resto), i negozi con pool per città e taglia, la generazione server-side delle quest consumabili con il contratto multi-nemico, il cibo consumato dal viaggio, le imboscate lungo la strada e le lore sbloccabili per personaggio. Ordine deciso dall'utente: 11 → 12 → 13 → 14 → 15 → 16 (il multi-nemico della 13 arriva prima dell'imboscata della 15; il cibo della 14 lascia i punti d'innesto della partenza alla 15). Le fasi FE 13–17 sono companion delle BE 12–16 e partono dopo la merge della fase BE corrispondente su `develop`. Ogni regola di gioco resta server-side; i valori numerici nascono come costanti configurabili con default provvisori, come il motore di combattimento (Phase 9 D-02).

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
- [x] **Phase 9.1: Spell State and Recovery Contract** (INSERTED 2026-10-27) - Stato per magia conosciuta `status.spellStates { spell, usages, recoveries }` che sopravvive a equip/disequip, recupero che non si interrompe mai (regola dell'utente), processor idempotente + reconciler/sweep, migrazione al boot; sblocca FE Phase 8 (SPELL-05) (completed 2026-10-27)
- [x] **Phase 9.2: Quest Result Delivery Contract** (INSERTED 2026-10-27) - Query dei risultati non confermati dell'utente, mutation di conferma idempotente, `QuestResult.acknowledgedAt` additivo, posti delle quest avviate non più liberati dall'archivio (regola dell'utente), il morto resta corrente fino alla conferma (D-12); sblocca FE Phase 9 (COMBAT-09/10) (completed 2026-10-28)
- [x] **Phase 10: Hardening Trasversale** - Validazione input, introspection off/CORS/sanitization, `.env.example`, coverage aree critiche, throttling minimo, moderazione immagini Sightengine, debiti rinviati (BE-HARD-05/06, 2026-10-27), combattimento con i segnaposto e avvio atomico delle quest da soli (BE-HARD-07, dalla UAT FE Phase 9, 2026-10-29), coda del GM e corsia standard (BE-HARD-08, dal discuss FE Phase 10, 2026-10-29) (completed 2026-10-30)

- [x] **Phase 11: Popolamento del mondo** - File di contenuto versionati (lore ~300 schede, 99 creature + voci proposte dall'utente, pet, magie, equipaggiamento, cibo e consumabili, quest fisse per città e dungeon sui POI) scritti dal documento di world building e caricati da uno script idempotente `--dry-run/--apply/--verify`; immagini a carico dell'utente in un secondo passaggio _(aggiunta 2026-10-29)_
- [x] **Phase 12: Negozi per città** - `City.size` esposto (dedotto dal `CityType`) e `City.hasShop`; pool per città (equip, loot, compagni) seminato al boot con la regola di taglia e curato a DB (D-36: niente file né CLI), `cityShop(cityId)`; acquisto fuori pool rifiutato (`ITEM_NOT_IN_SHOP`), vendita ovunque, scorte infinite, leggendari mai in vendita, prezzi del catalogo; pet posseduti vs compagno equipaggiato (`assets.ownedPets`, `equipPet`/`unequipPet`) _(aggiunta 2026-10-29, emendata nel discuss del 2026-11-02)_
- [x] **Phase 13: Generazione quest** - `infos.enemies [{ enemy, quantity }]` sostituisce `infos.enemy`; generatore server-side delle quest consumabili `enemy`/`boss` (reattivo + sweep + mutation GM), tetto 3 per città, distribuzione casuale non concentrata, rango meno coperto nel mondo, nemico dalla zona del POI, premi per fascia, oggetti consigliati da debolezze e danni; `hunt` e `dungeon` mai generate (fisse, Phase 11) _(aggiunta 2026-10-29)_
- [x] **Phase 13.1: Correzioni generazione quest** (INSERTED 2026-11-05) - Dalla UAT su device della FE Phase 14: animali (lore `animal`) fuori dalle quest generate; fasce di xp contigue a cinque ranghi (legend è solo un titolo) e composizione delle `enemy` a budget per posti; tetto e peso di sorteggio per taglia di città (1/2/4); `quests` scopata sul personaggio corrente del chiamante (stessa SDL); al primo boot reale reset delle generate, prede delle hunt ri-estratte e tappe delle dungeon ricomposte (one-off poi rimossi); contenuto nuovo dettato dall'utente a DB (completed 2026-11-05)
- [x] **Phase 14: Viaggio e cibo** - Il viaggio consuma oggetti `hunger` in base al tempo di marcia (1 power = 3 min), selezione a scarto minimo, km scoperti → vita persa (il km n-esimo costa n HP), partenza libera o da quest rifiutata se non si arriva con ≥ 1 HP, tutto alla partenza; teleport e salto esenti _(aggiunta 2026-10-29)_
- [x] **Phase 15: Imboscate in viaggio** - Rischio per km di giorno e di notte (22–06, `AMBUSH_TIMEZONE`), più imboscate per viaggio con risorteggio dopo ogni vittoria, nemici del POI più vicino nella fascia [Facile, Medio] del livello, job al momento dell'imboscata con `CombatResolver`; vittoria → XP e monete del rango, sconfitta → HP ≥ 1 e ferite, rotta riscritta dal punto verso la città più vicina, quest abbandonata, push di sconfitta; report trattenuti e consegnati all'arrivo come `QuestResult` di tipo `ambush` _(aggiunta 2026-10-29, discussa 2026-11-06)_
- [x] **Phase 16: Lore sbloccabili** - Due insiemi additivi sul `Character`: lore sbloccate (`status.unlockedLore`, id sul filo) e nemici sconfitti (`status.knownEnemies`, interno); geografia della città (lore + regioni + stato) alla nascita e a ogni arrivo sul marker di una città (viaggio, deviazione, salto, teleport); nemici alla vittoria (tutti i vincitori: lore del bestiario + id esatto); `study` senza magia → lore casuale al 50 %; query di lore filtrate per il personaggio del bearer (`City.relatedLore` null se chiusa), `known` per viewer sulle voci di `enemies`, `loreUnlocked` sugli esiti; innkeeper vede tutto. Discussa il 2026-11-07.
- [ ] **Phase 17: Autorizzazione e sessioni** - Matrice di autorizzazione table-driven sulle liste enumerate dal boot reale (11 handler innkeeper, 19 owner-only: `FORBIDDEN` per `adventurer`/`guard` e sul personaggio altrui, `UNAUTHENTICATED` senza bearer) come prova del requisito FE HARDEN-02; «l\'ultimo login caccia l\'altro»: il login revoca le altre sessioni dell\'utente e chiude subito i loro WS con un close code dedicato, JWT stateless fino alla scadenza; `SESSION_REVOKED` + `extensions.reason` (`newLogin`, `roleChanged`, `reuseDetected`, `userLogout`) sul rifiuto del refresh e nella reason del close; cambio di ruolo a DB → revoca delle sessioni; logout invariato. Companion della FE Phase 12 Hardening _(aggiunta 2026-11-09)_

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

### Phase 9.2: Quest Result Delivery Contract (INSERTED 2026-10-27)
**Goal**: Nessun foglio esiti va perso e la board rispetta la regola dell'utente sulle quest avviate: il BE espone i risultati **non confermati** dell'utente autenticato (`unacknowledgedQuestResults`), una mutation di **conferma** idempotente chiamata dal FE alla chiusura del foglio (`acknowledgeQuestResult`), il campo additivo `QuestResult.acknowledgedAt`, e **non libera più i posti di una quest avviata** quando un partecipante viene archiviato (registrazione mantenuta come segnaposto fino alla conclusione: «finché una missione non è conclusa il foglio resta strappato sulla board una volta che i posti sono pieni», utente 2026-10-27). Schema solo additivo, handoff per la FE Phase 9.
**Depends on**: Phase 9 (`QuestResult`, proprietà per utente, risoluzione, avvio a party completo, archivio), Phase 3 (ownership e codici)
**Requirements**: BE-RESULT-01, BE-RESULT-02, BE-RESULT-03, BE-RESULT-04
**Why inserted**: scoperto nel discuss della FE Phase 9 (2026-10-27): `questResultReceived` non ha snapshot e non esiste una lista dei risultati, quindi un esito arrivato ad app chiusa senza push (notifiche spente, force stop, morte) non verrebbe mai mostrato; e il FE non può tenere strappata una quest avviata a cui l'archivio libera un posto. Decisioni dell'utente: «Companion BE 9.2: risultati non confermati + ack», conferma «alla chiusura col tasto», «Il BE non libera i posti delle quest avviate». PR BE prima del gate FE.
**Success Criteria** (what must be TRUE):
  1. `unacknowledgedQuestResults` restituisce al chiamante i propri `QuestResult` con `acknowledgedAt` nullo in ordine di `resolvedAt` crescente (con tetto), compresi i risultati `death` del personaggio archiviato; un altro utente (anche innkeeper) non vede nulla di altrui.
  2. `acknowledgeQuestResult(id)` scrive `acknowledgedAt` una sola volta con un update condizionale; una seconda chiamata risponde `successful: true` senza scrivere; `NOT_FOUND` per id malformato/inesistente e `FORBIDDEN` per risultati altrui (anche innkeeper), come `questResult`; nessun audit.
  3. `QuestResult.acknowledgedAt: DateTime` è additivo, nullo a ogni insert e restituito da `questResult`/`questResultReceived`; i risultati precedenti al deploy non inondano il primo cold start (backfill idempotente al boot o tetto).
  4. L'archivio di un personaggio registrato a una quest **avviata** lascia la registrazione come segnaposto (posti pieni, `QUEST_FULL`, `questUpdated` emesso con il segnaposto) e la quest si risolve con chi resta; prima dell'avvio il posto è liberato come oggi; un roster di soli segnaposto riporta la quest a non avviata.
  5. `src/schema.gql` cambia solo in modo additivo e il handoff risponde alle domande della FE (`Klimmeck-Guide/.planning/phases/09-combat-result-sheet/BACKEND-NOTES.md` §2.5).
  6. La morte di un personaggio (aid fallita o timeout) lo archivia **senza** staccare `User.currentCharacter`; la conferma del suo risultato `death` lo stacca nella stessa transazione e solo allora `userUpdated` emette `currentCharacter: null`; `createCharacter` resta rifiutato fino alla conferma; `me` restituisce il morto come corrente nel frattempo. _(Utente 2026-10-27, D-12.)_
**Plans**: 7 plans
- [x] 09.2-01-PLAN.md — Wave 1: RED del contratto nel boot reale (Wave 0), campo di conferma con default null, indice, marcatore del segnaposto (BE-RESULT-01, BE-RESULT-04)
- [x] 09.2-02-PLAN.md — Wave 2: lista dei non confermati dell'utente e conferma owner-only idempotente (BE-RESULT-01, BE-RESULT-02)
- [x] 09.2-03-PLAN.md — Wave 2: archivio con segnaposto sulle quest avviate, archivi concorrenti, questUpdated (BE-RESULT-03)
- [x] 09.2-04-PLAN.md — Wave 3: indice e backfill al boot mai bloccanti, campo sulle letture (BE-RESULT-01, BE-RESULT-04)
- [x] 09.2-05-PLAN.md — Wave 3: risoluzione con segnaposto, conferma nulla su ogni esito, regola dei posti sul filo (BE-RESULT-01, BE-RESULT-03)
- [x] 09.2-06-PLAN.md — Wave 4: il morto resta corrente fino alla conferma della morte (D-12) (BE-RESULT-02)
- [x] 09.2-07-PLAN.md — Wave 5: gate, handoff FE Phase 9, emendamenti 09/03.1, traceability (BE-RESULT-01..04)
**Unblocks (FE)**: FE Phase 9 Combat Result Sheet (COMBAT-09 risultati mai persi, COMBAT-10 quest avviate strappate). Contratto proposto dal FE in `Klimmeck-Guide/.planning/phases/09-combat-result-sheet/BACKEND-NOTES.md`; decisioni in `09.2-CONTEXT.md`.
**Branch**: `feat/09.2-quest-result-delivery-contract` da `develop` → PR a `develop`; la Phase 10 (`feat/10-hardening`) si sposta sopra questo branch (stacked) e apre la PR dopo la merge.

### Phase 10: Hardening Trasversale
**Goal**: Hardening trasversale — validazione input, introspection off/CORS/error sanitization in prod, igiene dei secret, e coverage di test sulle aree critiche.
**Depends on**: Phases 2-9.2 (indurisce le superfici che aggiungono; branch `feat/10-hardening` rebasato su `develop` il 2026-10-29 dopo la merge della 9.2 con la PR #15; in precedenza stacked su 9.1 e 9.2)
**Requirements**: BE-HARD-01, BE-HARD-02, BE-HARD-03, BE-HARD-04, BE-HARD-05, BE-HARD-06, BE-HARD-07, BE-HARD-08
**Success Criteria** (what must be TRUE):
  1. Tutti gli input GraphQL/REST sono validati da class-validator + `ValidationPipe` globale: ID Mongo invalidi, quantità negative e stringhe fuori lunghezza sono rifiutati prima di raggiungere un service.
  2. In produzione l'introspection GraphQL è disattivata e gli errori sono sanitizzati (nessun leak di ID/relazioni a client non autorizzati); il CORS è esplicito e documentato.
  3. `.env.example` è committato con ogni variabile documentata, nessun secret è nel repo, e un audit CI (grep) fallisce sui pattern di secret.
  4. Auth, atomics, EventSub e travel lifecycle hanno coverage di test su happy path, concorrenza e failure mode.
  5. Un'immagine del personaggio respinta dalla policy Sightengine non raggiunge mai Cloudinary (422 `IMAGE_REJECTED`); con Sightengine irraggiungibile l'upload fallisce chiuso (503 `IMAGE_MODERATION_UNAVAILABLE`); in produzione il boot rifiuta le chiavi mancanti. _(2026-10-27)_
  6. Login, refresh, OAuth, webhook e upload rispondono `TOO_MANY_REQUESTS`/429 oltre il limite configurato; introspection e landing page sono spente con `NODE_ENV=production`; gli errori imprevisti in produzione espongono solo `INTERNAL_SERVER_ERROR` + `requestId`. _(2026-10-27)_
  7. I debiti di BE-HARD-06 sono chiusi con test: change stream riaperti dopo un errore, job falliti non accumulati, nessuna gara sugli utenti, indici presenti, ref tipizzati dopo una migrazione idempotente. _(2026-10-27)_
  8. La voce della coda del GM espone la corsia standard del personaggio (campo additivo `pendingQuest`) e `completePendingRequest` risponde `QUEST_IN_PROGRESS` senza scritture finché un partecipante registrato ha la corsia standard occupata; ogni transizione della corsia standard fa riemettere la coda. _(2026-10-29, FE Phase 10)_
**Plans**: 31 plans (26 wave; esecutori sequenziali; wave 8 = ref `Mixed` con gate proprio, 10-29)
- [x] 10-01-PLAN.md — Wave 1 (1a): campo additivo `pendingQuest` su `PendingRequestCharacter`, filtro esplicito dei personaggi attivi, ricalcolo della coda dopo un archivio, liveness delle 4 transizioni della corsia standard (BE-HARD-08)
- [x] 10-02-PLAN.md — Wave 1 (1a): `completePendingRequest` → `QUEST_IN_PROGRESS` senza scritture (pre-check, ricontrollo in sessione, `STANDARD_LANE_FREE` solo sulle corsie del GM) (BE-HARD-08)
- [x] 10-03-PLAN.md — Wave 1 (3): gitleaks-action v3 (push, PR, `workflow_dispatch`, schedule; versione fissata), `.gitleaks.toml`, `.gitleaksignore`, spec sui secret vuoti del template (BE-HARD-03)
- [x] 10-04-PLAN.md — Wave 1 (5): base `ChangeStreamPublisher` che riapre gli stream con backoff 1→30 s e `startAfter`; int-spec di invalidate (BE-HARD-06)
- [x] 10-05-PLAN.md — Wave 1 (1): dipendenze, `BadUserInputException`, `invalidFieldsOf`, `createValidationPipe`, `@IsObjectIdHex`, `ObjectIdPipe`/`ObjectIdListPipe`, `ValidationModule` non ancora montato (BE-HARD-01)
- [x] 10-06-PLAN.md — Wave 2 (1): decoratori di sola forma sui 17 input + spec di copertura contro lo schema + regole nominate (BE-HARD-01)
- [x] 10-07-PLAN.md — Wave 2 (2): `NODE_ENV` validato (3 valori), `RUNTIME_CONFIG`, `RuntimeModeReporter`, bypass dev letto da config (BE-HARD-02/03)
- [x] 10-08-PLAN.md — Wave 3 (1): montaggio globale della pipe in app e harness + RED sul filo dei codici spostati (C5), regressione completa (BE-HARD-01)
- [x] 10-09-PLAN.md — Wave 4 (1): id posseduti malformati → `BAD_USER_INPUT` nella policy (C1); `ObjectIdPipe` su `quest`, `questUpdated`, `user`, `getPath` (BE-HARD-01)
- [x] 10-10-PLAN.md — Wave 5 (1/2): id del catalogo con pipe + `NOT_FOUND` codificati negli 8 service di catalogo (BE-HARD-01/02)
- [x] 10-11-PLAN.md — Wave 6 (2): superficie di produzione — introspection, landing e suggerimenti spenti, sanitizer + `requestId` su HTTP e graphql-ws (BE-HARD-02)
- [x] 10-12-PLAN.md — Wave 7 (2): middleware `x-request-id`, filtro REST 500 codificato, CORS chiuso con test, Cloudinary con DTO, upload validato per firma (BE-HARD-01/02)
- [x] 10-13-PLAN.md — Wave 8 (2): throttler — config `THROTTLE_*`, guard GraphQL/REST, `TooManyRequestsException`, 5 handler limitati, `EXPECTED_THROTTLED_HANDLERS` (BE-HARD-02)
- [x] 10-14-PLAN.md — Wave 9 (2): OAuth limitato con redirect `rate_limited`, bucket del webhook ×50 con prova di raffica firmata, `THROTTLE_TRUST_PROXY` (BE-HARD-02)
- [x] 10-15-PLAN.md — Wave 10 (3): config Sightengine fail-closed, nessun `process.env` sparso, `.env.example` commentato, test di drift (BE-HARD-03/05)
- [x] 10-16-PLAN.md — Wave 11 (4): tabella di policy pura, porta `ImageModerator`, adapter Sightengine (fetch nativo), adapter disattivato, fake (BE-HARD-05)
- [x] 10-17-PLAN.md — Wave 12 (4): `PortraitUploadService` — moderazione prima di Cloudinary (422/503), `ModerationModule`, reporter, harness (BE-HARD-05)
- [x] 10-18-PLAN.md — Wave 13 (5): `CharacterUpdatesPublisher` sulla base comune + single-flight; single-flight degli utenti; `removeOnFail` limitato (BE-HARD-06)
- [x] 10-19-PLAN.md — Wave 14 (5): 8 indici con nome + verificatore non bloccante; backfill una sola volta al boot (BE-HARD-06)
- [x] 10-20-PLAN.md — Wave 15 (5): `Enemy.locations`/`PointOfInterest.type` come liste; `types: ["jest"]` + 56 fix negli spec + step CI `tsc` (BE-HARD-06)
- [x] 10-21-PLAN.md — Wave 16 (5): D-21 — i registrati archiviati combattono come seat holder (boss + soccorso), senza esiti né premi (BE-HARD-07)
- [x] 10-22-PLAN.md — Wave 17 (5): D-22 — avvio da soli atomico con l'arrivo/claim + publisher degli avvii su `characterUpdated` (BE-HARD-07)
- [x] 10-23-PLAN.md — Wave 18 (6): refactor `fightRescuers`/`settleWounded`, `@AuditTarget`, un solo `primeChangeStream` (BE-HARD-06)
- [x] 10-24-PLAN.md — Wave 19 (7): `collectCoverageFrom` corretto, `test:cov` unico, soglie per cartella = misura − 2, CI, gap di auth/EventSub (BE-HARD-04)
- [x] 10-25-PLAN.md — Wave 20 (7): gap di economia, magie, equipaggiamento, accettazione e viaggi; soglie alzate (BE-HARD-04)
- [x] 10-26-PLAN.md — Wave 21 (8): inventario dei ref `Mixed`, pipeline pure, migrazione `--dry-run/--apply/--verify` + CLI + verificatore al boot (BE-HARD-06)
- [x] 10-27-PLAN.md — Wave 22 (8): ritipizzazione dei ref condivisi e di catalogo; test legacy sul percorso migrato (BE-HARD-06)
- [x] 10-28-PLAN.md — Wave 23 (8): ritipizzazione dei ref dei personaggi; nessun `Mixed` rimasto (BE-HARD-06)
- [x] 10-29-PLAN.md — Wave 24 (8, gate): suite + coverage, CLI compilato provato, runbook di migrazione e rollback, PR draft fino alla produzione (BE-HARD-06)
- [x] 10-30-PLAN.md — Wave 25 (9): `BACKEND-NOTES.md` (codici, codici spostati, risposte FE, checklist di deploy, default da confermare) + emendamenti a 8 handoff + README (BE-HARD-01..08)
- [x] 10-31-PLAN.md — Wave 26 (9): gate finale, invarianti, VALIDATION `nyquist_compliant: true`, `requirements mark-complete`, ROADMAP/STATE (BE-HARD-01..08)
**Unblocks (FE)**: mirror di FE Phase 12 (hardening); BE-HARD-08 sblocca il piano gated 10-11 della FE Phase 10 (Admin Panel).
**Branch**: `feat/10-hardening` da `develop` → PR a `develop`. _(Emendato 2026-10-27: creato sopra `feat/09.1-spell-state-and-recovery-contract`; spostato sopra `feat/09.2-quest-result-delivery-contract` dopo il merge della 9.1; PR dopo il merge della 9.2, con rebase.)_

### Phase 11: Popolamento del mondo
**Goal**: Il DB contiene il mondo di Klimmeck descritto nel documento di world building dell'utente — circa 300 schede di lore collegate fra loro, alle città e ai nemici; 99 creature più quelle proposte dall'utente (nemici umani, giganti, bande di briganti…) con statistiche derivate per fascia; pet, magie, equipaggiamento comune e unico, cibo e consumabili; le quest fisse di ogni città (sempre una `heal`, una fra `job` e `hunt`, eventuali `crime`/`guard`/`study`) e le `dungeon` fisse sui POI di tipo dungeon — tutto in file di contenuto versionati nel repo e caricati da uno script idempotente, così che le Phase 12–16 e le UAT FE abbiano dati reali.
**Depends on**: Phase 10 (validazione input, indici, ref tipizzati: i file di contenuto rispettano lo schema indurito e lo script riusa il pattern CLI `--dry-run/--apply/--verify` di 10-26)
**Requirements**: BE-CONTENT-01, BE-CONTENT-02, BE-CONTENT-03, BE-CONTENT-04, BE-CONTENT-05, BE-CONTENT-06, BE-CONTENT-07
**Success Criteria** (what must be TRUE):
  1. Una cartella di contenuto nel repo (es. `content/`) contiene i file (JSON o YAML, deciso nel discuss) di lore, nemici, pet, magie, equipaggiamento, loot e quest fisse, scritti a partire dal testo del documento (estratto in `.planning/phases/11-popolamento-del-mondo/source/world-building.md`; il `.docx` da 103 MB resta fuori dal repo) e rivisti dall'utente; nessuna immagine nel repo, le URL Cloudinary arrivano in un secondo passaggio per nome.
  2. Uno script CLI idempotente carica i contenuti per `_id` (ogni voce porta il proprio id, i riferimenti sono id; emendato 2026-11-01 nel discuss), risolve i riferimenti (lore ↔ lore, `Enemy.relatedLore`, `City.relatedLore`, `Quest.infos.relatedLore`, marker delle quest fisse, `prizes.spell` delle study) e riporta orfani, duplicati e violazioni di schema senza scrivere (`--verify`); rieseguito non cambia nulla.
  3. Lore: circa 300 schede a grana fine — ogni culto in tre schede (`god` = rappresentazione, `religion` = credo/discepoli/luoghi, `ceremony` = feste), regni `state`, aree `region`, ere e saggio di magia `knowledge`, figure `character`, creature `enemy`/`animal`, piante `plant` — con `relatedLore` incrociate, ogni città agganciata alla propria lore e ogni lore di città alla regione.
  4. Nemici: le 99 creature del documento (63 mostri, 22 animali, 14 leggendari) più le voci proposte dall'utente nel passo di **intake** del discuss (nemici umani di vario tipo, giganti, bande di briganti…) e le proposte di Claude per le fasce di livello vuote; XP e habitat (`locations: PoiType[]`) dal documento; `lifePoints`, `damages`, debolezze base/energia da una formula per fascia in scala con `LEVEL_TABLE` (1 000 → 40 000) e dedotte dal testo, tutte ritoccabili nel file e da rivedere con il motore di combattimento dell'utente.
  5. Pet (6–8 cavalcature dagli animali del documento + 3–4 proposte nuove, con `speedModifier`, HP e prezzi), le 77 magie esistenti più le 11 nuove (10 dal saggio sulla magia, sciamanesimo e Vuoto, più «Urlo del Berserker» voluta dall'utente) (`UseType`/`EnergyType`, `minXpToLearn`, usi, recupero) _(emendato 2026-11-02, D-15)_, 27 equipaggiamenti unici rari/ultrarari/leggendari legati a figure, culti e mostri, equipaggiamento comune/uncommon per i negozi e loot `hunger`/`heal`/`munition` con `power` tarato sulla regola del cibo della Phase 14 (1 power = 3 minuti di marcia).
  6. Quest fisse e ripetibili (regola per tipo della Phase 7): per ogni città una `heal` e un `job`, più una `hunt` sorteggiata dove vivono animali facili (caccia a soli animali della zona), eventuali `crime`/`guard`/`study` (study di magia solo a Valantar, una sola con magia sorteggiata per personaggio; Necrorian solo `dungeon`, Ferrion senza `crime`; emendato 2026-11-01 nel discuss), e una `dungeon` su ogni POI di tipo `dungeon`; quest di servizio (heal, job, guard, crime, study) sul marker della città, hunt e dungeon su POI distinti _(emendato 2026-11-02, D-21)_, premi dalla tabella per fascia; nessuna quest `enemy`/`boss` a mano (le genera la Phase 13).
  7. Suite verde, schema GraphQL invariato (o solo campi additivi di contenuto dichiarati), handoff `BACKEND-NOTES.md` con l'inventario dei dati per le UAT delle FE Phase 13–17 e la procedura di ricarica.
**Decisioni dell'utente (2026-10-29)**: flusso file + script; grana fine delle lore; formula per fascia con scelte di Claude; intake delle voci nuove prima della stesura; immagini a carico dell'utente; `hunt` solo animali e `dungeon` fissa sui POI dungeon.
**Da decidere nel discuss**: formato e layout di `content/`, formula HP/danni per fascia, tabella premi per fascia, tie-break dei nomi duplicati, quali città ricevono crime/guard/study, sorte del flag globale `Lore.unlocked` (Phase 16), ambienti su cui girare lo script (dev, staging, produzione).
**Unblocks (FE)**: dati reali per le UAT delle FE Phase 13–17; nessun contratto nuovo.
**Branch**: `feat/11-popolamento-del-mondo` da `develop` → PR a `develop`.
**Plans**: 27 plans (il 27 aggiunto il 2026-11-02 dalla revisione dei file dell'utente: D-32/D-33) — esecuzione completa il 2026-11-02; PR `feat/11-popolamento-del-mondo` → `develop` in draft fino al rilascio del quick task FE che toglie `unlocked`
- [x] 11-01-PLAN.md — Wave 1: `Lore.unlocked` rimosso (SDL dichiarato nel boot reale) e `relatedLore` popolati in lore e nemici (BE-CONTENT-03)
- [x] 11-02-PLAN.md — Wave 1: D-31, la study di Valantar sorteggia una magia apprendibile (`QuestPrizes.spellDraw` interno) (BE-CONTENT-06)
- [x] 11-03-PLAN.md — Wave 2: dipendenza `yaml`, loader con posizioni, `content/config.yaml`, regole pure di XP/HP/danni/premi/tempi (BE-CONTENT-01/02/04/05/06)
- [x] 11-04-PLAN.md — Wave 3: schema dei file per collezione (class-validator) e mini-albero di test (BE-CONTENT-01/02)
- [x] 11-05-PLAN.md — Wave 4: controlli offline `checkContent` (riferimenti, regole delle quest) e `content/README.md` (BE-CONTENT-01/02/06)
- [x] 11-06-PLAN.md — Wave 4: mapper canonici voce → documento (BE-CONTENT-02/04/06)
- [x] 11-07-PLAN.md — Wave 4: correzioni dichiarate (6 POI, Kliever, quest di prova con guardie, `unlocked`) (BE-CONTENT-02)
- [x] 11-08-PLAN.md — Wave 5: generatore deterministico delle quest fisse, TDD (BE-CONTENT-06)
- [x] 11-09-PLAN.md — Wave 5: sync idempotente (diff BSON, upsert per `_id`, orfani, prune, report) (BE-CONTENT-02)
- [x] 11-10-PLAN.md — Wave 6: export una tantum con commenti `# nome` (BE-CONTENT-01/02)
- [x] 11-11-PLAN.md — Wave 7: CLI `run-content` (`--check/--dry-run/--apply/--verify/--export/--prune/--new-id`) provato sul compilato (BE-CONTENT-02)
- [x] 11-12-PLAN.md — Wave 8: export reale, snapshot del mondo, baseline `--verify`, misura D-12 con `--stats` (BE-CONTENT-01/02/05/07)
- [x] 11-13-PLAN.md — Wave 9: lore di regni, regioni, storia, materiali e magia (BE-CONTENT-01/03)
- [x] 11-14-PLAN.md — Wave 9: magie dello sciamanesimo e del Vuoto, unici, cibo tarato e pozioni (BE-CONTENT-01/05)
- [x] 11-15-PLAN.md — Wave 10: lore dei 18 culti e delle figure (BE-CONTENT-01/03)
- [x] 11-16-PLAN.md — Wave 10: mostri A (lore + nemici) (BE-CONTENT-01/03/04)
- [x] 11-17-PLAN.md — Wave 10: mostri B (lore + nemici) (BE-CONTENT-01/03/04)
- [x] 11-18-PLAN.md — Wave 10: mostri C (lore + nemici) (BE-CONTENT-01/03/04)
- [x] 11-19-PLAN.md — Wave 10: animali, piante e cavalcature (BE-CONTENT-01/03/04/05)
- [x] 11-20-PLAN.md — Wave 10: lore di città 1 (Drustea, Valan, Mirwa + 12 esistenti) (BE-CONTENT-01/03)
- [x] 11-21-PLAN.md — Wave 10: lore di città 2 (Fiamme, Madre, Liberia, speciali) (BE-CONTENT-01/03)
- [x] 11-22-PLAN.md — Wave 11: leggendari, umani ostili, orchi e gigante delle colline (BE-CONTENT-01/03/04)
- [x] 11-23-PLAN.md — Wave 12: generazione reale delle quest fisse (BE-CONTENT-01/06)
- [x] 11-27-PLAN.md — Wave 12.5 (aggiunto 2026-11-02): `QuestInfos.description` additivo, descrizioni e `recommendedLoot` più ricco nel generatore, rigenerazione delle quest (D-32, D-33) (BE-CONTENT-06)
- [x] 11-24-PLAN.md — Wave 13 (checkpoint backup): prova sul filo dell'albero reale e caricamento sul DB (BE-CONTENT-02..06)
- [x] 11-25-PLAN.md — Wave 14: runbook `content-seeding.md`, `BACKEND-NOTES.md`, requisiti emendati (BE-CONTENT-07)
- [x] 11-26-PLAN.md — Wave 15: gate finale, coverage `./src/content/`, VALIDATION, requisiti, stato (BE-CONTENT-01..07)

### Phase 12: Negozi per città
**Goal**: Ogni città vende un proprio pool di equipaggiamenti, loot e compagni (pet), coerente con la sua taglia (`City.size`: village / city / capital, dedotta dal `CityType` ed esposta dal server — villaggi comuni e qualche uncommon, città anche rari, capitali anche ultrarari, leggendari mai), **seminato da una migrazione idempotente al boot e poi curato direttamente a DB dall'utente** (Phase 11 D-36: il mondo vive solo nel database, niente file né CLI); il server rifiuta l'acquisto di oggetti fuori dal pool della città in cui si trova il personaggio; vendita ovunque, scorte infinite, prezzi del catalogo. I pet entrano nel commercio con la distinzione fra **posseduti** (`assets.ownedPets`, nuovo) e **compagno equipaggiato** (`assets.pet`, quello letto dal viaggio), con `equipPet` / `unequipPet` e nessun equipaggiamento automatico all'acquisto. _(emendata nel discuss del 2026-11-02)_
**Depends on**: Phase 4 (`ShopTransactionService`, prezzi dal catalogo), Phase 8 (città e marker, `SHOP_NOT_IN_CITY`, `assets.pet` nel viaggio), Phase 11 (catalogo, pet e città a DB)
**Requirements**: BE-SHOP-01, BE-SHOP-02, BE-SHOP-03, BE-SHOP-04, BE-SHOP-05, BE-SHOP-06
**Success Criteria** (what must be TRUE):
  1. `City.size: CitySize!` (dedotto dal `CityType`: `*Village` → village, `*City`/`*SeaCity` → city, `*Capital` → capital; `elfCapital` capital, `talmvereVillage` village, `ferrionCity` e `necrorianCity` city) e `City.hasShop: Boolean!` sono a schema (additivi) e viaggiano con `cities`; il pool (tre liste di ref: equipaggiamenti, loot, pet) è persistito sulla città.
  2. Al boot una migrazione idempotente semina **solo le città senza pool** (campo assente) con le costanti di taglia (villaggio 10 equip + 12 loot, 75/25; città e città di mare 16 + 18, 50/35/15; capitale 24 + 24, 35/35/20/10; almeno 2 `hunger` e 1 `heal` in ogni pool; sorteggio deterministico per città) e i quattro pet di D-10 nelle loro due città; Necrorian riceve un pool vuoto esplicito; i pool presenti, anche vuoti, non vengono mai toccati (la cura è a DB). _(eseguito una sola volta il 2026-11-03 dal branch; semina e migrazioni rimosse prima della merge, D-25)_
  3. `cityShop(cityId)` restituisce il pool della città con i veti applicati in lettura (`legendary` e `sellable: false` mai serviti); `sellable` entra nello schema di `EquipmentItem`, `LootItem` e `Pet`; `equipmentAssetsQuantity` e `lootAssetsQuantity` sono deprecate (SDL additivo).
  4. `doTransaction` rifiuta con `ITEM_NOT_IN_SHOP` ogni acquisto (equip, loot, pet) fuori dal pool della città del marker o vietato, prima di qualsiasi scrittura e riaffermato dentro la transazione; `TransactionItems.petAssets` (quantità 1) compra e vende pet; un pet già posseduto è rifiutato (`PET_ALREADY_OWNED`); la vendita resta ammessa in ogni città anche per i leggendari posseduti (`SHOP_NOT_IN_CITY` invariato); vendere il pet equipaggiato svuota `assets.pet` nella stessa transazione; scorte infinite, prezzi del catalogo.
  5. `assets.ownedPets` è a schema e a DB; `equipPet` / `unequipPet` (owner o innkeeper con `@OwnsCharacter`, stile `equipItem`) equipaggiano solo un pet posseduto (`PET_NOT_OWNED`); comprare non equipaggia mai; la migrazione al boot copia l'`assets.pet` esistente fra i posseduti e valorizza `Pet.sellable` dove manca.
  6. Un report di sola lettura (log `WARN` al boot + query innkeeper) elenca per città gli oggetti fuori regola di taglia e i pool vuoti senza correggerli («la mano vince»).
  7. Integration: villaggio, città e capitale con tre pool diversi; acquisto fuori pool e di un pet doppione senza scritture; vendita fuori pool e di un leggendario; acquisto, equipaggiamento e vendita di un pet; real boot con SDL additivo; handoff `BACKEND-NOTES.md` per la FE Phase 13.
**Decisioni dell'utente (2026-10-29)**: campo esplicito `size` su `City`; pool curato a mano; vendita ovunque e scorte infinite; leggendari mai in vendita; prezzi identici in ogni città.
**Decisioni dell'utente (2026-11-02, `12-CONTEXT.md` D-01..D-21)**: semina server + cura a DB; mare = città; Necrorian senza negozio; «la mano vince» con veto su legendary e `sellable: false` e report di sola lettura; pool più ampi con cibo e cure sempre; pet nel pool in due città ciascuno per lore (Cavallo leggero, Cammello del Mar Sabbioso, Tartaruga gigante delle isole, Cavallo da viaggio; gli altri 9 solo da quest); i leggendari posseduti si vendono; pet posseduti vs compagno equipaggiato, niente equipaggiamento automatico; titolo FE «Compagno».
**Unblocks (FE)**: FE Phase 13 (SHOP-02/03/04).
**Branch**: `feat/12-negozi-per-citta` da `develop` → PR a `develop`.
**Plans**: 19 piani (pianificati il 2026-11-02; catena lineare, una wave per piano, esecuzione sequenziale sull'albero principale) — esecuzione completa il 2026-11-03
**Nota di chiusura (2026-11-03)**: PR `feat/12-negozi-per-citta` → `develop`; sblocca i piani gated della FE Phase 13; primo boot sul DB reale eseguito il 2026-11-03 (`BACKEND-NOTES.md` §9); semina e migrazioni rimosse dal branch prima della merge (D-25, §14).
- [x] 12-01-PLAN.md — VALIDATION compilata; `CitySize` e `citySizeOf` dal `CityType`; campi del pool su `City` senza default; `@ResolveField` `size` e `hasShop`
- [x] 12-02-PLAN.md — `sellable` nello schema di `AssetItem` (equip e loot) e `Pet`
- [x] 12-03-PLAN.md — `assets.ownedPets` a schema e a DB; `findOne` popola `assets.pet` e `ownedPets`; `Pet` registrato in `EconomyModule`
- [x] 12-04-PLAN.md — Codici `ITEM_NOT_IN_SHOP`, `PET_ALREADY_OWNED`, `PET_NOT_OWNED` con le factory
- [x] 12-05-PLAN.md — Costanti della semina (taglie, quote, cibo e cure, pet per città, versione del seme) e PRNG deterministico
- [x] 12-06-PLAN.md — Regole di scaffale (veto legendary / sellable false, fasce per taglia) e sorteggio deterministico dei pool
- [x] 12-07-PLAN.md — Migrazione `Pet.sellable` (4 in vendita, 9 solo da quest, solo dove manca)
- [x] 12-08-PLAN.md — Migrazione `assets.pet` → `assets.ownedPets`
- [x] 12-09-PLAN.md — Semina idempotente dei pool (solo dove il campo manca, Necrorian vuota) e mondo di prova condiviso
- [x] 12-10-PLAN.md — Report dei pool fuori regola, orchestratore di boot (`Pet.sellable` → `ownedPets` → semina → WARN), `ShopsModule` e modulo di manutenzione importato solo da `AppModule`
- [x] 12-11-PLAN.md — Query `cityShop(cityId)` con i veti applicati in lettura
- [x] 12-12-PLAN.md — Query innkeeper `shopPoolReport` (enumerazione del real boot aggiornata in RED)
- [x] 12-13-PLAN.md — Deprecazione di `equipmentAssetsQuantity` e `lootAssetsQuantity` (le due sole righe SDL riscritte)
- [x] 12-14-PLAN.md — `TransactionItems.petAssets`, righe `Pet` a quantità 1, prezzi e veti dal catalogo nel reader
- [x] 12-15-PLAN.md — Guard `ITEM_NOT_IN_SHOP`: pool della città del marker riletto in sessione, `placeInCity(pool)` nei test
- [x] 12-16-PLAN.md — Inventario dei pet nella transazione: doppione rifiutato, vendita del pet equipaggiato che svuota lo slot, guardie nel filtro
- [x] 12-17-PLAN.md — `equipPet` / `unequipPet` (`EquipPetRequest`, `UnequipPetRequest`, `@OwnsCharacter` come `equipItem`)
- [x] 12-18-PLAN.md — Gate BE-SHOP-05: integration end-to-end sul mondo seminato, contratto FE nel real boot, suite completa con coverage, gate SDL, requisiti completati
- [x] 12-19-PLAN.md — Handoff `BACKEND-NOTES.md` per la FE Phase 13 con il runbook del primo boot; chiusura ROADMAP/STATE/REQUIREMENTS

### Phase 13: Generazione quest
**Goal**: Il tabellone si rifornisce da solo: il server genera e posiziona le quest consumabili `enemy` e `boss` (le `hunt` e `dungeon` sono fisse, Phase 11) su un POI libero di una città, con al massimo 3 quest generate attive per città, una distribuzione casuale ma non concentrata sulla mappa (alcune città 0, altre 3), il nemico scelto dalla zona del POI, il rango dal rango meno coperto fra le quest generate attive di tutto il mondo, premi dalla fascia e oggetti consigliati dalle debolezze e dai danni del nemico; le quest portano più nemici e più tipi (`infos.enemies: [{ enemy, quantity }]` sostituisce `infos.enemy`).
**Depends on**: Phase 7 (corsie, accettazione, ripetibilità per tipo), Phase 9 (risoluzione, `concludedAt`, abbandono, `CombatResolver`), Phase 11 (nemici, POI, città popolati)
**Nota dell'utente (2026-11-02, dalla revisione della Phase 11, D-33):** le `dungeon` sono esplorazioni (rovine, templi abbandonati, città in rovina, grotte) con **più nemici** (`infos.enemies`), lunghe, con grandi ricompense di loot, oro e XP solo se esplorazione e battaglie riescono: l'algoritmo di risoluzione delle `dungeon` è diverso da quello delle altre quest e va progettato in questa fase insieme a `infos.enemies`; il `recommendedLoot` consiglia cibo e oggetti da esplorazione, più equipaggiamenti e pozioni contro i punti di forza e le debolezze dei nemici (già seminato dalla Phase 11 per le quest fisse).
**Requirements**: BE-QGEN-01, BE-QGEN-02, BE-QGEN-03, BE-QGEN-04, BE-QGEN-05, BE-QGEN-06, BE-QGEN-07, BE-QGEN-08, BE-QGEN-09, BE-QGEN-10, BE-QGEN-11
**Success Criteria** (what must be TRUE):
  1. `QuestInfos.enemies: [{ enemy, quantity }]` sostituisce `enemy` (modifica SDL non additiva, dichiarata nel real boot) nel populate, nel contesto del `CombatResolver` (più nemici: il segnaposto aggrega HP e danni), nel `QuestResult` (nemici affrontati), nella clone della aid e nei fixture; migrazione idempotente dei dati esistenti (`enemy` → `enemies` con `quantity: 1`).
  2. Il generatore gira (a) quando una quest generata si conclude o viene annullata, (b) con uno sweep periodico configurabile e al boot, (c) su mutation innkeeper `generateQuests` auditata; ogni corsa è idempotente, single-flight e deterministica dato un RNG iniettato.
  3. Tetto di 3 quest generate attive per città (le fisse hunt/dungeon/job/heal/crime/guard/study e le GM story/worldMission non contano); la città è sorteggiata con peso decrescente al crescere della densità di quest generate nelle città vicine (nessuna concentrazione) e non ogni città ne riceve.
  4. `minTitle` = rango meno coperto fra le quest generate attive di tutto il mondo (count a DB); POI = `pointsOfInterest` libero della città (nessuna quest non conclusa sul marker, marker della città escluso); nemici estratti fra quelli con `locations` compatibili con i `type` del POI (`all` di riserva) e XP nella fascia del rango, uno o più tipi con quantità; boss con `requiredAdventurers` per rango.
  5. Premi (`prizeCoins`, `xpPrize`, `randomLoot` per rarità) dalla tabella per fascia; `recommendedLoot` scelto fra equipaggiamento che colpisce `baseWeaknesses`/`energyWeaknesses` e consumabili contro i `damages` dei nemici; titolo da template (descrizione LLM resta v2).
  6. Integration: tetto rispettato, nessuna doppia quest sullo stesso POI sotto concorrenza, `hunt` e `dungeon` mai generate, distribuzione non concentrata su una mappa di prova, `generateQuests` `FORBIDDEN` per l'adventurer; handoff `BACKEND-NOTES.md` per la FE Phase 14 (contratto `enemies`, mutation, piani FE gated prima della merge).
  7. Le `dungeon` si risolvono a tappe (`enemies` in ordine, HP residui fra le tappe, porta `DungeonResolver` con segnaposto neutro per le prove di esplorazione), premi solo a fine percorso, tappe superate e totale nel `QuestResult`; le 40 dungeon fisse arricchite al boot una tantum (migratore poi rimosso) e curate a DB.
  8. `QuestPrizes.pet` additivo: tiro del 20% per vincitore, assegnazione dal generatore ai soli boss all'1%, pool = pet non vendibili; il pet ottenuto viaggia nel risultato.
  9. `EquipmentItem.accessoryUseTypes` (`attack` | `defense`) su anelli e collane, valorizzato a DB dalla tabella rivista dall'utente con un migratore una tantum poi rimosso; presente nel contesto del `CombatResolver`.
**Decisioni dell'utente (2026-10-29)**: trigger reattivo + sweep + GM; solo `enemy` e `boss`; rango meno coperto nel mondo, città da 0 a 3 quest, non concentrate; multi-nemico a sostituzione secca; `hunt` solo animali e `dungeon` fissa, entrambe seminate nella Phase 11.
**Decisioni dell'utente (2026-11-04, `13-CONTEXT.md` D-01..D-26, discuss congiunto con la FE Phase 14 dal repo FE)**: boss = un solo nemico di fascia superiore, posti = ⌈PE / media del rango⌉ (400/1500/4000/6000/15000) fra 2 e 6, 1 ogni 10; i 22 leggendari mai generati (worldMission del GM); enemy = nemico singolo della fascia o branco di nemici più deboli con somma xp nella fascia, pool = zona del POI + habitat `city`, un posto del rango; nessuna scadenza; riempimento fino a un target globale (default una per città); `generateQuests` = una corsa normale con il conteggio; premi da tabella (enemy 150+40, boss 600+120 × moltiplicatore) con pool di `randomLoot` ampi per rango tirati per partecipante, legendary solo da hero; `prizes.pet` con 1% sui boss e 20% per vincitore; titolo e annuncio da template; dungeon a tappe con porta e segnaposto (motore ed esplorazione restano dell'utente), 40 fisse arricchite al boot; regola nuova `accessoryUseTypes` sui gioielli con tabella rivista dall'utente. Anche `QuestResult.enemy` → `enemies` + `stagesCleared`/`stagesTotal`.
**Unblocks (FE)**: FE Phase 14 (QGEN-01..04); la Phase 15 imboscate combatte già con `enemies`.
**Branch**: `feat/13-generazione-quest` da `develop` → PR a `develop`.
**Plans**: 20 piani (pianificati il 2026-11-04; catena lineare, una wave per piano, esecuzione sequenziale sull'albero principale; i one-off dei piani 16–17 escono dal repo dopo il primo boot reale, Phase 12 D-25) — esecuzione completa il 2026-11-04
**Nota di chiusura (2026-11-04, aggiornata il 2026-11-05)**: PR #19 `feat/13-generazione-quest` → `develop` aperta in draft il 2026-11-05 dopo review → fix → verifica → security; primo boot reale dal branch eseguito il 2026-11-05 col runbook di `BACKEND-NOTES.md` §11 (log e conteggi conformi in §11 b–c), poi rimozione dei migratori una tantum (`enemy-legendary`, `jewel-accessory`, `dungeon-stages`, §11 d) con `f5d8134`; la merge sblocca i piani gated della FE Phase 14.
- [x] 13-01-PLAN.md — Campi additivi: flag `generated` + indice unico parziale, `Enemy.legendary`, `AccessoryUseType`/`accessoryUseTypes`, `QuestPrizes.pet`, `QuestRewards.pet`, real boot
- [x] 13-02-PLAN.md — Sostituzione non additiva `enemy` → `enemies` (`QuestEnemy`, `stagesCleared`/`stagesTotal`), populate + filtro orfani, inventario mixed-ref, real boot (SDL −2 righe)
- [x] 13-03-PLAN.md — Lettore tollerante `validQuestEnemiesOf`, `QuestEnemiesMigrator` permanente (quest + risultati), `QuestMaintenanceBoot`/`QuestMaintenanceModule` importato solo da AppModule
- [x] 13-04-PLAN.md — `CombatContext.enemies` multi-nemico, aggregazione del segnaposto, `readEnemies`, XP = premio + Σ xp × quantità, clone `enemies` nella aid, int-spec multi-nemico
- [x] 13-05-PLAN.md — Sweep di fixture e int-spec degli esiti che scrivono ancora `enemy`, controllo dell'intera suite
- [x] 13-06-PLAN.md — Aid: clone di `prizes.pet`, mai `generated`; int-spec soccorso e GM multi-nemico
- [x] 13-07-PLAN.md — Porta `DungeonResolver` + contesto (`recommendedLoot`, `recommendedOwned`) + segnaposto PROVVISORIO a tappe
- [x] 13-08-PLAN.md — Dispatch dungeon in `QuestResolutionService.fight`, tappe nel risultato, binding DI, `quest-dungeon.int-spec`
- [x] 13-09-PLAN.md — `SeededChanceSource`/`keyedChance` ripristinati; `generation-rules.ts` (fasce con legend 1098–3212, medie del party, `bossSeatsOf` con −0,5, `leastCoveredRank` su 6 ranghi)
- [x] 13-10-PLAN.md — Pool dei nemici (zona + `city`, `all` di riserva, `legendary === false`) e `composeQuest` (forme a/b, branchi legend di 2–4 hero, boss 1 su 10 con 2–6 posti, coerenza con il POI D-08)
- [x] 13-11-PLAN.md — Premi e pool di loot (tabella D-20, legend 1L+2U+4R, pet 1% sui boss), `recommendedLoot`, template di titolo (quantità solo se > 1) e annuncio
- [x] 13-12-PLAN.md — Scelta della città (kNN K=5, peso 1/(1+D)², tetto 3, POI libero senza il marker) + spec di distribuzione su una griglia di 30 città
- [x] 13-13-PLAN.md — Config `QUEST_GENERATION_TARGET`/`QUEST_GENERATION_SWEEP_INTERVAL_MS` + `.env.example`, draft builder puro, `QuestGenerator` (single-flight, rerun, E11000, ripiego sui ranghi), `QuestGenerationTriggerModule` leggero (D-30), fixture `generation-world`
- [x] 13-14-PLAN.md — Sweeper (corsa al boot + timer `unref`), hook `OutcomeWriter.deliver` via `regeneratesAfter`, mutation `generateQuests` (innkeeper, audit) + `EXPECTED_INNKEEPER_HANDLERS` + real boot
- [x] 13-15-PLAN.md — Premio pet alla vittoria (20% per vincitore, dopo loot e magie), scrittura idempotente in `ownedPets`, `rewards.pet` sul filo
- [x] 13-16-PLAN.md — `equipType`/`accessoryUseTypes` nel contesto di combattimento + `JewelAccessoryMigrator` una tantum (42 `_id` dalla tabella approvata)
- [x] 13-17-PLAN.md — `EnemyLegendaryMigrator` (22 id) e `DungeonStagesMigrator` (1–3 tappe, bande N × Bandito, deterministico per id) una tantum; ordine di boot con corsa finale del generatore
- [x] 13-18-PLAN.md — Integration BE-QGEN-08: tetto, distribuzione, hunt/dungeon mai generate, legend nel giro, seconda corsa idempotente, concorrenza sul POI, FORBIDDEN, audit
- [x] 13-19-PLAN.md — Gate: contratto FE nel real boot, `npm run test:cov` + soglia `src/quests/generation/`, diff SDL = esattamente le due righe `enemy: Enemy`, prettier/eslint sui file toccati, controlli segreti/trailer/isolamento one-off, VALIDATION firmata, `mark-complete` BE-QGEN-01..11
- [x] 13-20-PLAN.md — `BACKEND-NOTES.md` per la FE Phase 14 + runbook del primo boot reale dal branch (e rimozione dei one-off prima della merge), chiusura ROADMAP/STATE/REQUIREMENTS

### Phase 13.1: Correzioni generazione quest (INSERTED 2026-11-05)
**Goal**: Il generatore della Phase 13 e il tabellone rispettano le regole emerse dalla prima UAT reale: gli **animali** (nemici con una lore `type: animal`) non entrano mai nelle quest generate né nelle tappe delle dungeon; le **fasce di xp dei ranghi sono contigue e vanno solo da rookie a hero** (rookie 1–20, adventurer 21–69, paladin 70–224, mage 225–548, hero 549–803; legend è solo un titolo e gioca le hero); una quest `enemy` di rango R ha **un solo posto** e un **budget** Σ xp ∈ [lo, hi] (S = 1, D-09) con membri della fascia o inferiori e `requiredAdventurers` per rango; il **tetto e il peso di sorteggio** delle città dipendono dalla **taglia** (villaggio 1, città 2, capitale 4; target invariato); la query **`quests` è scopata sul personaggio corrente** del chiamante (POI della città in cui sta, story del suo titolo, le sue corsie; stessa SDL); al **primo boot reale** (dopo il popolamento del DB con i nemici nuovi dettati dall'utente) tre passi una tantum azzerano le generate, ri-estraggono le prede delle hunt per zona e fascia e ricompongono le tappe delle dungeon senza animali e nel budget, poi escono dal repo prima della merge.
**Depends on**: Phase 13 (generatore, `infos.enemies`, dungeon a tappe, `QuestMaintenanceBoot`), Phase 12 (`citySizeOf`), Phase 7 (regola «in città» D-10), Phase 11 (hunt e dungeon fisse, lore)
**Requirements**: BE-QGEN-12, BE-QGEN-13, BE-QGEN-14, BE-QGEN-15, BE-QGEN-16
**Why inserted**: UAT su device della FE Phase 14 (2026-11-05): «animali destinati alla caccia come coccodrillo o Serpente stritolatore gigante finiscono anche nelle quest normali», «io dovrei poter vedere solo le missioni presenti nella mia area (ovvero dei POI di competenza della città)», «le capitali dovrebbero avere più quest rispetto ai paesi più piccoli», «il numero di animali nelle isole di Liberia è troppo basso»; in revisione del piano l'utente ha aggiunto le fasce senza buchi e il budget per rango («se il rango ha range 200–400, i nemici 200 sono facili, i 400 difficili … il titolo legend è solo un titolo») e il reset con revisione di hunt e dungeon. Decisioni in `13.1-CONTEXT.md` (D-01..D-09); emendano le D-05, D-07, D-08, D-15, D-29 della Phase 13.
**Success Criteria** (what must be TRUE):
  1. Nessuna quest generata (singolo, branco, boss) e nessuna tappa di dungeon ricomposta contiene un nemico con una lore `type: animal`; nessun campo nuovo su `Enemy` (D-01).
  2. `RANK_XP_BANDS` ha cinque ranghi contigui (max + 1 = min del successivo) da rookie 1 a hero 803; il generatore non crea mai una quest `legend`; i legend accettano le hero (D-02).
  3. Ogni `enemy` generata porta `requiredAdventurers = [{ title: R, count: 1 }]` (S = 1) e Σ xp × quantità ∈ [lo, hi] della fascia di R, con ogni membro ≤ hi; solo boss e worldMission hanno più posti: il boss resta un singolo sopra hi con posti dalla formula (clamp a 2 sopra il massimo hero) (D-03, D-09).
  4. Tetto per taglia (villaggio 1, città 2, capitale 4) entro i POI liberi e peso = taglia × `1/(1+D)²`; target invariato; una città con `type` ignoto è saltata; prova su una griglia a taglie miste (D-04).
  5. `quests` restituisce al chiamante solo le quest aperte sui POI della città in cui sta il suo personaggio corrente (marker + `pointsOfInterest`), le `story` del suo titolo e le quest delle sue corsie; `[]` senza personaggio corrente o archiviato; SDL identico a `develop`; `quest(id)` e `questUpdated` invariate (D-05).
  6. Al boot, tre passi una tantum in `QuestMaintenanceBoot` prima della corsa del generatore: reset delle generate aperte (idempotente per marcatore, quest registrate o in corsia lasciate), prede delle hunt ri-estratte fra gli animali della zona con `minTitle` = fascia della preda, tappe delle dungeon ricomposte senza animali e nel budget; seconda corsa senza scritture; mai bloccanti; dopo il boot reale i tre migratori escono dal repo (D-06, D-07).
  7. Suite verde (`npm run test:cov` con la soglia della Phase 13), real boot con `src/schema.gql` identico a `develop`; emendamenti in `13-CONTEXT.md` e `BACKEND-NOTES.md` (§7, §9, §11) e handoff 13.1 per la FE (quick task di rilettura delle quest al cambio di posizione, UAT).
**Decisioni dell'utente (2026-11-05)**: lore `animal` come segnale (nessun campo nuovo); tetto 1/2/4 per taglia con target invariato; filtro lato BE del tabellone; fasce contigue solo rookie–hero e legend solo titolo; budget per posti con fasce inferiori ammesse; cancellare tutte le generate e rigenerarle da capo; rivedere hunt e dungeon con animali o fasce sbagliate dopo il popolamento del DB. Assunzioni tecniche correggibili: rookie da 1, hero max 803, clamp del boss a 2 posti sopra hero, posti delle `enemy` 1 o 2 (2/3–1/3; superata da D-09 dell'utente: sempre un posto), la caccia segue la preda, tappe delle dungeon in un solo budget.
**Unblocks (FE)**: quick task FE «rilettura delle quest al cambio di posizione» e UAT su device (Mappa per area); nessun piano FE gated.
**Branch**: `feat/13.1-correzioni-generazione-quest` da `develop` `162c1f5` → PR a `develop` in draft fino al primo boot reale (dopo il popolamento del DB) e alla rimozione dei one-off.
**Plans**: 8 plans
**Stato (2026-11-05)**: 8/8 piani eseguiti; PR in draft fino al primo boot reale dal branch dopo il popolamento del DB e alla rimozione dei one-off (runbook in `.planning/phases/13-generazione-quest/BACKEND-NOTES.md` §11 f)

Plans:

- [x] 13.1-01-PLAN.md — Cinque fasce contigue (rookie 1–20 … hero 549–803), legend fuori da generatore e tabelle, `enemy` a budget per posti (S 1 o 2, poi sempre 1 per D-09), boss sopra hi con clamp a 2 posti, legend sui posti hero (D-08)
- [x] 13.1-02-PLAN.md — Animali (lore `animal`) fuori dai pool del generatore, lettore condiviso `readEnemyCandidates`, `Lore` nel modulo leggero, fixture `animalXps`
- [x] 13.1-03-PLAN.md — Tetto e peso di sorteggio per taglia (1/2/4), `isCityType` fail-closed, fixture a taglie miste, distribuzione ri-derivata
- [x] 13.1-04-PLAN.md — `quests` scopata sul personaggio corrente (POI della città, story del titolo, corsie), filtro puro `quest-board.ts`, SDL identico
- [x] 13.1-05-PLAN.md — One-off di boot: reset delle generate (marcatore legend, protette lasciate) e prede delle hunt per zona e fascia, richiesta finale al generatore
- [x] 13.1-06-PLAN.md — One-off di boot: tappe delle dungeon v2 senza animali e in un solo budget, ordine nemici → reset → hunt → dungeon → generatore
- [x] 13.1-07-PLAN.md — Gate: `npm run test:cov`, real boot con `src/schema.gql` identico a `develop`, lint sui file toccati, invarianti, VALIDATION firmata, `mark-complete` BE-QGEN-12..16
- [x] 13.1-08-PLAN.md — Docs: emendamenti di `13-CONTEXT.md`, `BACKEND-NOTES.md` §7/§9/§11 col runbook del boot reale e la rimozione dei one-off, handoff FE 13.1

### Phase 14: Viaggio e cibo
**Goal**: Viaggiare consuma cibo: il fabbisogno è il tempo di marcia (1 power ogni 3 minuti della durata calcolata, che già somma terreno della strada, pet e ferite), il server sceglie fra gli oggetti `hunger` del personaggio quelli che coprono il fabbisogno con lo scarto minimo e li consuma alla partenza; i chilometri scoperti dal cibo costano vita (il km scoperto n-esimo costa n HP); se il personaggio non arriverebbe con almeno 1 HP la partenza — libera o automatica da quest — è rifiutata. Teleport e salto istantaneo esenti.
**Depends on**: Phase 8 (planner, durata, `travelPreview`), Phase 7 (accettazione con viaggio automatico nella transazione del claim), Phase 4 (inventario atomico), Phase 11 (cibo a catalogo)
**Requirements**: BE-FOOD-01, BE-FOOD-02, BE-FOOD-03, BE-FOOD-04, BE-FOOD-05, BE-FOOD-06
**Success Criteria** (what must be TRUE):
  1. Modulo puro del cibo con costanti configurabili (default 3 minuti per power; scala triangolare): fabbisogno = ⌈durata / 3 min⌉ power; selezione a scarto minimo fra gli `ownedItems` con `effect: hunger` (es. 60 richiesti con un 50 e tre 20 → i tre 20; tie-break documentato), un oggetto usato in parte è consumato intero; km scoperti = quota di fabbisogno non coperta × distanza, HP persi = n(n+1)/2 sui km scoperti arrotondati per eccesso (discuss 2026-11-05); HP risultante ≥ 1 altrimenti rifiuto.
  2. `travelPreview` espone in modo additivo cibo da consumare (item e quantità) e HP persi; una query owner-only dedicata, con la stessa forma e nullable senza viaggio, serve l'accettazione della quest standard (discuss 2026-11-05); le anteprime rispondono coi numeri e un flag «arrivi vivo», mai col codice di fame.
  3. `startTravel` e `acceptQuest` (corsia standard con viaggio) consumano il cibo e scalano gli HP nello stesso update condizionale della partenza o del claim (quantità e HP riaffermati nel filtro) e rifiutano con un codice stabile (es. `TRAVEL_STARVING`) senza scritture quando non si arriva con ≥ 1 HP; teleport e salto istantaneo non consumano nulla.
  4. Integration: viaggio coperto, parziale (HP scalati), rifiutato; pet ×2 dimezza il cibo, ferita che raddoppia il tempo lo raddoppia, strada lenta costa più della pianura; concorrenza fra due partenze con lo stesso cibo → una sola riesce; handoff `BACKEND-NOTES.md` per la FE Phase 15.
**Decisioni dell'utente (2026-10-29)**: cibo proporzionale al tempo di marcia totale (terreno compreso); scarto minimo; lineare assoluta n HP; alla partenza; vale anche per il viaggio automatico della quest.
**Decisioni del discuss (2026-11-05)**: 3 min/power e triangolare n(n+1)/2 confermati coi numeri reali (città vicina ≈ 55 power / 16 km, attraversata ≈ 1646 / 506 km); km scoperti per eccesso; cibo insufficiente → si mangia tutto e il resto è scoperto, rifiuto solo sotto 1 HP; scarto minimo, poi meno unità, poi minor valore di vendita; il server copre sempre se può (anche sprecando); anteprima della quest via query owner-only dedicata (nullable); anteprime coi numeri e `arrivesAlive`, mai col codice; la partenza ricalcola sul cibo del momento; codice unico `TRAVEL_STARVING` («Non hai cibo a sufficienza per il viaggio»). Dettagli in `14-CONTEXT.md` (D-01..D-15).
**Unblocks (FE)**: FE Phase 15 (FOOD-01..04).
**Branch**: `feat/14-viaggio-e-cibo` da `develop` → PR a `develop`.
**Plans**: 8 plans
- [x] 14-01-PLAN.md — Wave 1: modulo puro del cibo (`FOOD_RULES`, fabbisogno ⌈ms/180 000⌉, selezione a scarto minimo con bounded knapsack, km scoperti per eccesso, vita triangolare, `planTravelFood`) (BE-FOOD-01/02/03)
- [x] 14-02-PLAN.md — Wave 2: codice `TRAVEL_STARVING` con factory, guardie e set del pasto in `travel-food.updates.ts`, parametro opzionale finale sui builder di partenza e claim (BE-FOOD-03/05)
- [x] 14-03-PLAN.md — Wave 3: `TravelPantryReader` (dispensa in/fuori sessione, `LootItem` idratati), `TravelFoodItem` e tre campi additivi di `TravelPreview`, `travelPreview` col cibo, SDL (BE-FOOD-04/06)
- [x] 14-04-PLAN.md — Wave 4: `startTravel` transazionale con consumo e HP nello stesso update, `TRAVEL_STARVING` senza scritture, modificatori, concorrenza, acquisto concorrente (D-20), teleport esente (BE-FOOD-03/05/06)
- [x] 14-05-PLAN.md — Wave 5: `autoRoute` senza il WARN del salto, query owner-only nullable `questTravelPreview`, SDL e liste owner-only (BE-FOOD-04/06)
- [x] 14-06-PLAN.md — Wave 6: `acceptQuest` mangia nel claim (fame in pre-verifica e nel callback, codice della corsa prima della fame), esenzioni, concorrenza, D-20, rifiuto sul filo (BE-FOOD-03/05/06)
- [x] 14-07-PLAN.md — Wave 7: gate (`test:cov` con le soglie per cartella, boot reale con SDL additivo, lint mirato, invarianti, VALIDATION firmata, BE-FOOD-01..06 completi) (BE-FOOD-01..06)
- [x] 14-08-PLAN.md — Wave 8: handoff `BACKEND-NOTES.md` per la FE 15, emendamento in coda al handoff della Phase 8, nota nel CONTEXT, stato in ROADMAP e STATE (BE-FOOD-06)

**Stato (2026-11-05)**: 8/8 piani eseguiti; PR verso `develop` a cura dell'orchestratore; la FE Phase 15 parte dopo la merge (handoff in `.planning/phases/14-viaggio-e-cibo/BACKEND-NOTES.md`)

### Phase 15: Imboscate in viaggio
**Goal**: Un viaggio può essere teso da una o più imboscate: alla partenza il server percorre la rotta km per km con un rischio per km di giorno e di notte (22–06 nel fuso configurato) e fissa dove scatta la prima; un job la risolve a quell'istante con la porta `CombatResolver` contro nemici della zona del punto nella fascia [Facile, Medio] del livello del personaggio; vittoria → HP e ferite del motore, monete e XP come una quest `enemy` generata del rango, viaggio invariato e nuovo sorteggio per la strada residua; sconfitta → HP ≥ 1 e ferite, rotta riscritta dal punto verso la città più vicina per strada (meta compresa), quest della corsia standard abbandonata, cibo non rimborsato, push di sconfitta; i report restano trattenuti e arrivano a fine viaggio sulla pipeline dei risultati (mai persi, con conferma).
**Depends on**: Phase 14 (punti d'innesto della partenza), Phase 13 (`enemies`, contesto multi-nemico, composizione), Phase 9 (`QuestResult`, delivery, ack, abbandono), Phase 8 (job di completamento, polilinea, reconciler/sweep), Phase 5 (push)
**Requirements**: BE-AMBUSH-01, BE-AMBUSH-02, BE-AMBUSH-03, BE-AMBUSH-04, BE-AMBUSH-05, BE-AMBUSH-06, BE-AMBUSH-07
**Success Criteria** (what must be TRUE):
  1. Alla partenza il server sorteggia l'imboscata km per km con rischio 0,2%/km di giorno e 0,6%/km di notte (22–06 in `AMBUSH_TIMEZONE`, default Europe/Rome; costanti in codice), nessun sorteggio sotto 10 km, e la persiste in modo interno, mai sul filo; un job Bull scatta all'istante dell'imboscata, con reconciler al boot e sweep come i viaggi; dopo una vittoria risorteggia dal punto per la strada residua (mai se restano meno di 10 km, mai sulla deviazione); una sola imboscata pendente alla volta; job duplicato o obsoleto no-op.
  2. Il job estrae i nemici dal POI più vicino al punto (zona + animali della zona + habitat `city`, mai leggendari, `all` di riserva) nella fascia [Facile, Medio] del livello del personaggio (tabella del world building × `XP_SCALE`) con la composizione della Phase 13, risolve con `CombatResolver` e scrive in una sola transazione: vittoria → HP e ferite del motore, monete e XP come una quest `enemy` generata del rango più gli xp dei nemici, viaggio invariato; sconfitta → HP ≥ 1 e ferite, `activeTravel` riscritto dal punto (`kind: free`, `startTime` = istante dell'imboscata, polilinea punto → città più vicina per strada, meta compresa, `to` e `endTime` nuovi), `pendingQuest` abbandonata con posto liberato, cibo non rimborsato, nessun costo sulla deviazione, push di sconfitta di categoria nuova con il nome della città.
  3. Ogni imboscata produce un report trattenuto fino all'arrivo (o al teleport): il completamento inserisce nella stessa transazione un `QuestResult` per imboscata (`kind: ambush`, `quest` null, `ambush { at, nearCity, reachedCity }`, nemici, HP prima/dopo, ferite, monete e XP) con `resolvedAt` = istante dell'imboscata, consegnato come gli altri (subscription owner-only, `unacknowledgedQuestResults`, ack) senza push `questEnd`; `travelEnd` invariato.
  4. `travelPreview` e `questTravelPreview` non svelano nulla; il teleport del GM annulla l'imboscata pendente e consegna i report trattenuti; integration su vittoria con risorteggio, sconfitta con deviazione (meta compresa) e quest abbandonata, notte vs giorno, tratto sotto 10 km, job duplicato no-op, teleport; handoff `BACKEND-NOTES.md` per la FE Phase 16.
**Decisioni dell'utente (2026-10-29)**: fase separata dopo il cibo; tetto Medio; sconfitta = HP ≥ 1 + ferite + città più vicina + quest abbandonata; notte 22–06 nel fuso dello streamer.
**Decisioni del discuss (2026-11-06)**: calibrazione morbida (0,2%/0,6% per km) con soglia 10 km; più imboscate per viaggio con risorteggio dopo ogni vittoria e deviazione sicura; zona dal POI più vicino, animali inclusi, fascia [Facile, Medio] per livello (× `XP_SCALE`); ricompense come una quest `enemy` del rango; HP e ferite del motore applicati subito anche in vittoria; città più vicina per strada, meta compresa, senza costi sulla deviazione; push su ogni sconfitta; report tutti all'arrivo senza push in più (`travelEnd` come oggi); contratto `kind` / `quest` nullable / `ambush` come default tecnico (CONTEXT D-01..D-16).
**Unblocks (FE)**: FE Phase 16 (AMBUSH-01..03).
**Branch**: `feat/15-imboscate-in-viaggio` da `develop` → PR a `develop`.
**Plans**: 12 piani (wave sequenziali)
- [x] 15-01-PLAN.md — `AMBUSH_TIMEZONE` opzionale validata con drift di `.env.example`; `AMBUSH_RULES` e `AMBUSH_MAX_ATTEMPTS`; premi per titolo (legend come hero); `LEVEL_BANDS`/`xpBandOf`; ora locale via `Intl` (`hourCycle h23`, sonda DST)
- [x] 15-02-PLAN.md — `gameDistanceKm` estratta da `RoadsService`; `drawAmbush` km per km (mai `at ≥ endTime`, nessun tiro sotto i 10 km); `pointAtFraction` planare come il FE; `nearestPoi`
- [x] 15-03-PLAN.md — sotto-documenti interni `ambush { at, km, attempts }` e `ambushReports[]` senza `@Field`; job `ambush` con `ambushJobId`; `AmbushPlanner`; `scheduleAmbush`/`cancelAmbush`; sorteggio in `startTravel` e `movementTo` con anteprime mute; mondo di test ≥ 10 km
- [x] 15-04-PLAN.md — estrazione di `composeEnemies` (refactor con le spec a seme fisso verdi); pool con animali come parametro; composizione nella fascia del livello; `readCombatCatalog`; export degli helper di `outcome-plan.ts` e delle porte di `QuestOutcomesModule`
- [x] 15-05-PLAN.md — `RoadsService.nearestByTime` (un solo `singleSource`, parità per id, ripiego sui vertici, deviazione di lunghezza zero); `TravelPlanner.speedOfCharacter`
- [x] 15-06-PLAN.md — `ambushFilter`; piano puro della vittoria; `AmbushResolutionService` (composizione e risorteggio fuori dal callback, combattimento dentro, wallet, recuperi ancorati ad `at`, ri-accodo del `complete`, pool non componibile saltato); `AmbushModule` col solo servizio; `overrides` nell'harness
- [x] 15-07-PLAN.md — `PushEventType.ambushDefeat` con catalogo e builder (SDL additivo rigenerato); piano della sconfitta e della deviazione con ripiego sulla strada residua; sconfitta nel servizio con città più vicina, abbandono della corsia via `unstartedSeatReleaseOf`, push dopo il commit
- [x] 15-08-PLAN.md — indice `character_active_travel_ambush` (verifier RED prima); `AmbushProcessor`; `AmbushSweeper` con reconciler, single-flight e fail-open al terzo errore; montaggio in `AppModule`; prova su Redis reale accanto a `complete`
- [x] 15-09-PLAN.md — `QuestResultKind`, `AmbushReport`/`AmbushCity`, `quest` nullable (SDL con la sola riga tolta); `ambushResultDraftsOf`; `completionFilter` che aspetta l'imboscata e inserisce i report con `ordered: true`; teleport transazionale che annulla e consegna
- [x] 15-10-PLAN.md — suite d'integrazione di D-16 sul ciclo completo (mutation → subscription → ack) con concorrenza, DST, soglie, trigger, teleport e D-17
- [x] 15-11-PLAN.md — gate (`tsc`, `test:cov` con timeout 600000 ms e ripiego per cartella, boot reale, SDL con 1 riga tolta e 17 aggiunte, lint mirato, invarianti); firma della VALIDATION
- [x] 15-12-PLAN.md — handoff `BACKEND-NOTES.md` per la FE 16; emendamenti in coda agli handoff della Phase 8 e della 9.2; nota Executed nel CONTEXT; `requirements mark-complete`; stato in ROADMAP e STATE

**Stato (2026-11-06)**: 12/12 piani eseguiti; PR verso `develop` a cura dell'orchestratore; la FE Phase 16 parte dopo la merge (handoff in `.planning/phases/15-imboscate-in-viaggio/BACKEND-NOTES.md`)

### Phase 16: Lore sbloccabili
**Goal**: La conoscenza è per personaggio: due insiemi additivi sul `Character` (`status.unlockedLore`, con gli id esposti sul filo, e `status.knownEnemies`, interno), inizializzati con la geografia della città natale (lore della città, le sue regioni, il suo stato), arricchiti dall'arrivo sul marker di una città (completamento del viaggio libero o da quest, deviazione dopo un'imboscata, salto istantaneo, teleport) con la stessa geografia, dalla vittoria contro i nemici (tutti i partecipanti vincenti: lore dei nemici affrontati e id esatti) e, per le `study` vinte senza magia appresa, da un tiro al 50 % su una lore casuale ancora chiusa fra i tipi da studio; nessuna cascata sulle `relatedLore`; le query di lore filtrano per il personaggio del bearer, le quest espongono se ogni nemico esatto è conosciuto e gli esiti elencano le lore nuove.
**Depends on**: Phase 3 (ownership, `characterUpdated`), Phase 8 (arrivo, teleport), Phase 7/14 (salto istantaneo nel claim), Phase 9 (esiti, `study`), Phase 11 (lore e collegamenti), Phase 13 (`enemies`), Phase 15 (imboscata vinta)
**Requirements**: BE-LORE-01, BE-LORE-02, BE-LORE-03, BE-LORE-04, BE-LORE-05, BE-LORE-06
**Success Criteria** (what must be TRUE):
  1. `Character.status.unlockedLore: [ObjectId]` (sul filo `CharacterStatus.unlockedLore: [ID!]!`) e `Character.status.knownEnemies: [ObjectId]` (interno), additivi e idempotenti; alla creazione `unlockedLore` contiene la geografia della città natale: `City.relatedLore` più le lore `region` e `state` fra le sue `relatedLore` (1–3 regioni, 1 stato); nessun flag globale (`Lore.unlocked` non esiste dalla Phase 11 D-25); i 4 personaggi esistenti sono inizializzati da un backfill one-off al boot reale (posizione + esiti vinti) rimosso prima della merge.
  2. Sblocchi server-side idempotenti nella stessa transazione del movimento o dell'esito: arrivo su un POI che è `City.markerLocation` (completamento viaggio `free`/`quest`, deviazione d'imboscata, salto dell'accettazione, teleport) → geografia della città (i POI del territorio non contano); esito `success` con nemici → `Enemy.relatedLore` in `unlockedLore` e id dei nemici in `knownEnemies` per ogni partecipante vincente (individuale, party, dungeon, imboscata vinta); `study` vinta senza magia appresa → con probabilità `LORE_STUDY_CHANCE` (default 0,5) una lore casuale non sbloccata fra i tipi `knowledge`, `god`, `religion`, `ceremony`, `material`, `state`, `character`; nessuna cascata su `relatedLore`.
  3. `lores` e `lore(id)` restituiscono solo le lore sbloccate dal personaggio corrente del bearer (`relatedLore` filtrate allo stesso modo, `NOT_FOUND` per una lore chiusa come per una inesistente); `City.relatedLore` è null e `Enemy.relatedLore` filtrata per i giocatori finché chiuse; `Quest.infos.relatedLore` resta intera; l'innkeeper vede tutto; `characterUpdated` riemette quando l'insieme cambia (il documento cambia).
  4. Quest e risultati espongono per ogni voce di `enemies` se il nemico esatto è conosciuto dal personaggio del bearer (`QuestEnemy.known: Boolean!`, risolto per viewer; innkeeper → true), così il FE oscura il ritratto; `QuestResult.loreUnlocked: [Lore!]!` elenca le sole lore nuove di quell'esito (studio o prima vittoria) per le righe del foglio.
  5. Integration: nuovo personaggio con città + regioni + stato e nulla di più; arrivo libero/da quest/salto/teleport/deviazione → +geografia, idempotente, POI del territorio ignorato; vittoria individuale e di gruppo → tutti i vincitori, sconfitta nulla; study con e senza tiro; `loreUnlocked` solo novità; filtri per giocatore e innkeeper; `known` per viewer; cancellazione e nuovo personaggio → insieme nuovo; SDL verbatim della FE; handoff `BACKEND-NOTES.md` per la FE Phase 17 con l'identità di prova per la UAT.
**Decisioni dell'utente (2026-10-29)**: sblocco per personaggio; study → lore casuale ancora chiusa; nessuna cascata; nemico solo in vittoria per tutto il party vincente; lore chiuse invisibili (FE).
**Decisioni del discuss (2026-11-07, `16-CONTEXT.md` D-01..D-12)**: id sul filo (`CharacterStatus.unlockedLore`); geografia = città + regioni + stato alla nascita e a ogni arrivo sul marker; «conosciuto» = nemico esatto sconfitto (`knownEnemies`), non la specie; studio al 50 % (`LORE_STUDY_CHANCE`); `QuestResult.loreUnlocked`; `City.relatedLore` null per il giocatore finché chiusa, narrativa delle quest intera; backfill one-off dei personaggi esistenti; l'imboscata vinta segue la regola dei nemici (default tecnico).
**Unblocks (FE)**: FE Phase 17 (LORE-01..03).
**Branch**: `feat/16-lore-sbloccabili` da `develop` (`9103440`) → PR a `develop` (draft finché il backfill non è girato e rimosso).
**Plans**: 12 piani (wave sequenziali)
- [x] 16-01-PLAN.md — fondazioni pure: config opzionale `LORE_STUDY_CHANCE` (default 0,5), `STUDY_LORE_TYPES`/`BESTIARY_LORE_TYPES`, `geographyOf`, `knowledgeAdditionOf` (add-to-set solo se non vuoto), `LoreVisibility` (D-03, D-08, D-10, D-14)
- [x] 16-02-PLAN.md — modelli e SDL dal boot reale: `CharacterStatus.unlockedLore` sul filo, `status.knownEnemies` interno, `QuestResult.loreUnlocked` popolato (orfani scartati), `Lore` registrato nei moduli, asserzioni SDL RED, `characterUpdated` riemesso (D-01, D-09)
- [x] 16-03-PLAN.md — `LoreGeographyReader.ofMarker` + mondo di test delle lore; il nuovo personaggio nasce con la geografia della città natale (D-03, D-04)
- [x] 16-04-PLAN.md — arrivi con movimento: completamento del viaggio (secondo update nel callback, `COMPLETION_UPDATE` invariato), teleport, salto istantaneo dell'accettazione (D-05)
- [x] 16-05-PLAN.md — vittorie delle quest: `victoryKnowledgeOf`/`knowledgeUpdateOf` nel piano del partecipante, individuale, party, dungeon, soccorritori; `loreUnlocked` = sole novità (D-06, D-09, D-14)
- [x] 16-06-PLAN.md — completamento del GM con nemici, imboscata vinta con `loreUnlocked` nel report (snapshot) e deviazione sulla città raggiunta (D-05, D-06)
- [x] 16-07-PLAN.md — ritorno del soccorso con la geografia della città; studio al `LORE_STUDY_CHANCE` con tiri `gate`/`pick` accodati dopo il pet e pool filtrato (D-05, D-08)
- [x] 16-08-PLAN.md — filtri per il bearer: `ViewerKnowledgeService` con cache `WeakMap` su `rootValue`-o-context, `lores`/`lore(id)`, `relatedLore` di `Lore`, `City` ed `Enemy`; i due test «ciechi» aggiornati (D-07, D-10, D-13)
- [x] 16-09-PLAN.md — `QuestEnemy.known` per viewer su HTTP e su due eventi WS dello stesso socket (D-07)
- [x] 16-10-PLAN.md — backfill una tantum al boot (`src/migrations/lore-backfill/`), idempotente per unione, modulo importato solo da `AppModule`, log di soli conteggi; rimozione fuori fase dopo il boot reale (D-11)
- [x] 16-11-PLAN.md — gate: `tsc`, `test:cov` con ripiego per cartella, boot reale, SDL solo additivo (3 righe), invarianti; VALIDATION firmata (D-15)
- [x] 16-12-PLAN.md — chiusura: handoff `BACKEND-NOTES.md` per la FE Phase 17 (SDL finale, identità di prova, trucchi a DB, runbook del boot con il backfill), emendamenti in coda agli handoff 11 e 9.2, `requirements mark-complete BE-LORE-01..06` solo qui

**Stato (2026-11-07)**: 12/12 piani eseguiti; PR verso `develop` in draft a cura dell'orchestratore fino al boot reale col backfill e alla sua rimozione; la FE Phase 17 parte dopo la merge (handoff in `.planning/phases/16-lore-sbloccabili/BACKEND-NOTES.md`)

### Phase 17: Autorizzazione e sessioni
**Goal**: Il server prova la propria autorizzazione e governa le sessioni per device: una matrice table-driven alimentata dalle liste già enumerate dal boot reale (`EXPECTED_INNKEEPER_HANDLERS`, `EXPECTED_OWNERSHIP_HANDLERS`) prova `FORBIDDEN` per ogni handler innkeeper con JWT `adventurer` e `guard` e `UNAUTHENTICATED` senza bearer o con bearer invalido, e `FORBIDDEN` per ogni handler owner-only sul personaggio altrui (la prova richiesta dal requisito FE HARDEN-02); il login revoca le altre sessioni attive dell'utente e chiude subito le loro connessioni WS con un close code dedicato, mentre l'access JWT residuo resta valido fino alla scadenza (900 s, nessuna lookup per richiesta); il rifiuto del refresh resta `SESSION_REVOKED` e porta `extensions.reason` (la stessa stringa viaggia nella reason del close WS); un cambio di ruolo a DB revoca le sessioni dell'utente (`roleChanged`); il logout chiude solo la sessione corrente. Companion della FE Phase 12 Hardening (HARDEN-02, HARDEN-06). _(aggiunta 2026-11-09 nel discuss congiunto con la FE Phase 12)_
**Depends on**: Phase 2 (sessioni, rotazione, reuse detection, WS `connection_init`), Phase 3 (`@Roles`, ownership, audit), Phase 10 (sanitizzazione degli errori, coverage per cartella), boot reale di `test/app.int-spec.ts` (liste degli handler)
**Requirements**: BE-SESSION-01, BE-SESSION-02, BE-SESSION-03, BE-SESSION-04, BE-SESSION-05
**Success Criteria** (what must be TRUE):
  1. Un int-spec table-driven, alimentato dalle stesse liste di `test/app.int-spec.ts` (modulo di test condiviso), prova per ognuno degli 11 handler innkeeper `FORBIDDEN` con JWT `adventurer` e con JWT `guard` e `UNAUTHENTICATED` senza bearer e con bearer invalido, e per ognuno dei 19 handler owner-only `FORBIDDEN` sul personaggio di un altro utente (subscription comprese, via l'harness WS); un handler in lista senza riga di fixture fa fallire la spec.
  2. Il login revoca tutte le altre sessioni attive dell'utente (`revokedAt` + `revokeReason: newLogin`) nello stesso passo in cui crea la nuova, idempotente; le connessioni WS di una sessione revocata vengono chiuse subito con il close code dedicato e reason = motivo; una `connection_init` con un JWT di una sessione revocata è rifiutata con lo stesso close code (unica lettura della sessione ammessa, per connessione); le richieste HTTP col JWT residuo passano fino alla scadenza (documentato).
  3. Il refresh di una sessione revocata risponde `SESSION_REVOKED` con `extensions.reason` dall'enum (`newLogin`, `roleChanged`, `reuseDetected`, `userLogout`); la reuse detection scrive `reuseDetected`; `SESSION_EXPIRED` resta senza reason; `Session.revokeReason` è additivo e nullable, nessuna migrazione, SDL invariato al boot reale.
  4. Un cambio del `role` di un utente a DB (change stream di `users` filtrato sul campo, con backoff) o via `UsersService.upsertWithRole` revoca tutte le sue sessioni con `roleChanged`; il logout revoca la sola sessione corrente con `userLogout`.
  5. Integration: matrice completa verde; secondo login → prima sessione revocata, WS chiuso col codice dedicato, refresh rifiutato con `newLogin`, nuova sessione intatta; `connection_init` con JWT revocato → close dedicato; cambio ruolo → `roleChanged` su tutte le sessioni; reuse → `reuseDetected`; logout → `userLogout` solo sulla propria; gate `tsc`, `test:cov` con le soglie per cartella, boot reale con whitelist e SDL invariati; handoff `BACKEND-NOTES.md` per la FE Phase 12 (close code, enum, finestra del JWT, evidenza HARDEN-02, note per la UAT dual-device e per la UAT della release via tunnel TLS).
**Decisioni del discuss (2026-11-09, `17-CONTEXT.md` D-01..D-10)**: matrice innkeeper + ownership table-driven; l'ultimo login caccia l'altro con WS chiuso subito e JWT stateless fino a scadenza; `SESSION_REVOKED` + `reason`; cambio ruolo → revoca; logout invariato; nomi del contratto in `17-REPO-RULES.md` prima della ricerca.
**Unblocks (FE)**: FE Phase 12 (HARDEN-02 evidenza, HARDEN-06 e i notice specifici della revoca, piani gated + UAT dual-device).
**Branch**: `feat/17-autorizzazione-e-sessioni` da `develop` (`31dba96`, la merge della PR #26) → PR a `develop`.
**Plans**: 10 piani (wave sequenziali)
- [x] 17-01-PLAN.md — Contratto del motivo di revoca: enum `SessionRevokeReason`, `Session.revokeReason` nullable, `AuthException.sessionRevoked(reason)`, la sola chiave `reason` conservata da `formatDomainError` e `sanitizeFormattedError` (D-05, D-08, D-11, D-13)
- [x] 17-02-PLAN.md — `SessionService`: `revoke(id, reason | null)` con i sei chiamanti aggiornati, `reuseDetected` nella reuse detection, rifiuto del refresh col motivo memorizzato, `revokeOthersOf` (`_id` minore), `revokeAllOf`, `revokeReasonOf`, logout → `userLogout`, utente cancellato → `null`, reason sul filo HTTP in produzione (D-02, D-05, D-07, D-11, D-12)
- [x] 17-03-PLAN.md — `WS_SESSION_REVOKED_CLOSE_CODE = 4409`, `WsSessionRegistry` e `SessionRevocationService` (prima la revoca a DB, poi i socket), provider di `AuthModule` (D-03)
- [x] 17-04-PLAN.md — `WsConnectionAuthenticator`: costruttore nuovo, ordine bearer → `extra.closed` → registrazione → lettura, `close(4409, reason)` + `return false`, registro svuotato in `onClose`, casi sul filo in `ws-auth.int-spec.ts` (D-03)
- [x] 17-05-PLAN.md — Revoca al login in `issueForUser` (errore propagato) e spec di filo `test/auth/session-revocation.int-spec.ts`: secondo login, `connection_init` revocata, refresh `newLogin`, JWT residuo servito, nuova sessione intatta, logout senza chiusura, dev bypass senza effetto (D-02, D-03, D-04, D-12)
- [x] 17-06-PLAN.md — Watcher `UserRoleChangesPublisher` in `src/auth/session/` (provider di `AuthModule`, `forFeature User`) con helper di priming, int-spec D-06 (cambio a mano, stesso valore, `upsertWithRole`, WS `4409 roleChanged`), le due spec instabili di D-14 sistemate (D-06, D-14)
- [x] 17-07-PLAN.md — Liste condivise `test/authz/expected-handlers.ts`, helper `test/harness/real-app-boot.ts` con refactor di `test/app.int-spec.ts`, tabella `test/authz/handler-fixtures.ts` (30 righe) con la spec di completezza e validazione sullo SDL (D-01)
- [ ] 17-08-PLAN.md — Matrice `test/authz/authorization-matrix.int-spec.ts` sul boot reale con sessioni e vittime vere: righe HTTP innkeeper × ruoli e bearer, ownership × adventurer, owner-only × innkeeper, righe WS `FORBIDDEN` e `4403`, completezza (D-01)
- [ ] 17-09-PLAN.md — Gate: `tsc`, controllo di wave, `test:cov` con ripiego per cartella e soglie 97/84/98, boot reale con SDL invariato e whitelist invariate, lint sui file toccati, grep degli invarianti, VALIDATION firmata (D-10, D-15)
- [ ] 17-10-PLAN.md — Chiusura: handoff `BACKEND-NOTES.md` per la FE Phase 12 (contratto, matrice come evidenza HARDEN-02, note UAT dual-device e tunnel TLS, runbook), `requirements mark-complete BE-SESSION-01..05`, ROADMAP e STATE (D-09, D-16)

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
| FE Phase 13 (negozi per città) | Phase 12 (BE-SHOP) + Phase 11 (dati) | Pool, `City.size` e codice di rifiuto su `develop` prima della FE; aggiunta 2026-10-29 |
| FE Phase 14 (companion della generazione quest) | Phase 13 (BE-QGEN) | `infos.enemies` sostituisce `infos.enemy` (non additivo, dichiarato): i piani FE gated allineano i documenti prima della merge; `generateQuests` per la Locanda |
| FE Phase 15 (viaggio e cibo) | Phase 14 (BE-FOOD) | Preview additiva di cibo e HP su `travelPreview` + preview dell'accettazione + codice di rifiuto |
| FE Phase 16 (imboscate) | Phase 15 (BE-AMBUSH) | `activeTravel` riscritto alla sconfitta + `QuestResult` di imboscata sulla pipeline esistente |
| FE Phase 17 (lore sbloccabili) | Phase 16 (BE-LORE) + Phase 11 (lore) | Query di lore filtrate per personaggio + `known` sui nemici delle quest; additivi `CharacterStatus.unlockedLore`, `QuestResult.loreUnlocked`, `City.relatedLore` null se chiusa (discuss 2026-11-07) |
| FE Phase 12 (hardening) | Phase 17 (BE-SESSION) | Matrice di autorizzazione come evidenza di HARDEN-02; «l\'ultimo login caccia l\'altro» con close WS dedicato e `SESSION_REVOKED` + `reason`; revoca al cambio ruolo; i piani FE gated e la UAT dual-device partono dopo la merge (discuss 2026-11-09) |

Nota compatibilità: i contratti di schema aggiunti (QUEST-04, TRAVEL-01, combat, connection_init) devono arrivare su staging **prima** delle fasi FE che li consumano; i contratti GraphQL esistenti non si rompono. Le fasi FE 2–10 continuano a girare sullo stub `DEV_AUTH_ACCESS_TOKEN` grazie al dev bypass fail-closed di Phase 2.

## Progress

**Execution Order:**
Le fasi eseguono in ordine numerico: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 _(17 aggiunta il 2026-11-09 come companion della FE Phase 12 Hardening, eseguita per ultima; 11–16 aggiunte il 2026-10-29: il popolamento fornisce i dati, il multi-nemico della 13 precede l'imboscata della 15, il cibo della 14 lascia i punti d'innesto alla 15)_

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
| 9.1. Spell State and Recovery Contract | 10/10 | Complete | 2026-10-27 |
| 9.2. Quest Result Delivery Contract | 7/7 | Complete | 2026-10-28 |
| 10. Hardening Trasversale | 31/31 | Complete | 2026-10-30 |
| 11. Popolamento del mondo | 27/27 | Complete | 2026-11-02 |
| 12. Negozi per città | 19/19 | Complete | 2026-11-03 |
| 13. Generazione quest | 20/20 | Complete | 2026-11-04 |
| 13.1. Correzioni generazione quest | 8/8 | Complete | 2026-11-05 |
| 14. Viaggio e cibo | 8/8 | Complete | 2026-11-05 |
| 15. Imboscate in viaggio | 12/12 | Complete | 2026-11-06 |
| 16. Lore sbloccabili | 12/12 | Complete | 2026-11-07 |
| 17. Autorizzazione e sessioni | 7/10 | In Progress | - |
