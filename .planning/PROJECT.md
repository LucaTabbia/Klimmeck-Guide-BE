# Klimmeck Guide — Backend

## What This Is

Backend **NestJS 11 + MongoDB (Mongoose 8) + GraphQL (Apollo code-first, HTTP + WS)** dell'app mobile Klimmeck Guide: un RPG persistente alimentato dai punti canale Twitch di un singolo canale. Il backend è la **fonte di verità** di tutto il gioco — progressione, combattimento, HP, slot magie, economia, viaggi — mentre il frontend Flutter è puramente reattivo. Lo streamer (role `innkeeper`) è il game master.

## Core Value

Il backend è la fonte di verità affidabile e sicura dello stato di gioco: nessun client può alterare uno stato che non gli appartiene, e ogni valore mostrato dal frontend è calcolato e garantito server-side.

## Current Milestone: v1.0 Core Loop (BE)

**Goal:** Chiudere i gap che separano il backend esistente dalla roadmap FE v1.0 Core Loop — autenticazione e autorizzazione (oggi il BE è completamente aperto), contratti bloccanti per le fasi FE (QUEST-04, TRAVEL-01, connection_init, combat result), sync punti canale via Twitch EventSub, infrastruttura push FCM, integrità/atomicità dei dati e fondazione di test TDD.

## Requirements

### Validated

<!-- Capacità già esistenti nel codebase, verificate dalla mappa in .planning/codebase/ -->

- ✓ Moduli dominio completi: characters, cities, enemies, equipmentItems, lootItems, lore, pendingQuests, pets, pointsOfInterest, quests, roads, spells, users — existing
- ✓ GraphQL code-first (Apollo 13) con query, mutation e subscription su HTTP + WS (`graphql-ws`) — existing
- ✓ Real-time: MongoDB change stream su Character → PubSub → subscription `characterUpdated` filtrata per id — existing (dalla Phase 03 protetta da ownership, con snapshot su subscribe)
- ✓ Pathfinding stradale con graphology (grafo POI/strade, calcolo percorso e tempi con `speedFactor`) — existing
- ✓ Transazioni economiche di base (`doTransaction`: coins, item) e equip/unequip equipment — existing
- ✓ Equip/unequip/use spell con recovery asincrona via Bull + Redis, consolidato per concern con fix ordine-validazione `useSpell` — Validated in Phase 01: Fondazione Test & Consolidamento Spell WIP
- ✓ Fondazione test TDD: MongoMemoryReplSet condiviso (transazioni + change stream), split Jest unit/integration, Bull DI-mock + Redis effimero reale, fixture two-tier per 6 modelli, CI GitHub Actions (lint + unit + integration) — Validated in Phase 01: Fondazione Test & Consolidamento Spell WIP
- ✓ Sync punti canale via Twitch EventSub: webhook HMAC-verificato con challenge e replay window, credito 1:1 idempotente e atomico su `twitchPoints` (ledger `eventsub_messages`), subscription riconciliate con app access token, `stream.online` → push streamer-live — Phase 6 (2026-10-21; E2E con tunnel HTTPS e verifica C4 differiti a prima della produzione)
- ✓ Upload immagini via Cloudinary (REST) — existing
- ✓ Autenticazione a sessione propria: login Twitch mediato dal BE (authorization code lato server, ticket monouso legato a challenge S256), access JWT 15 min + refresh token rotante con reuse detection, guard globale deny-by-default su REST / GraphQL HTTP / subscription WS con whitelist `@Public()` di 5 handler, `@CurrentUser()`, `me`, `logout`, dev bypass fail-closed compatibile con lo stub FE — Validated in Phase 02: Auth & Identity Foundation (login Twitch reale da verificare all'arrivo delle chiavi)
- ✓ Contratto `connection_init` per subscription WS autenticate (`Authorization: Bearer <jwt>`, close 4403 al connect, 4401 alla scadenza) documentato nell'handoff `BACKEND-NOTES.md` — Validated in Phase 02
- ✓ Contratto di creazione personaggio: mutation `createCharacter(input): User!` sull'identità del bearer, stato iniziale backend-owned (livello 1, rookie, 5 argento, patria per razza dal lore), validazione autoritativa (nome 2–20 grafemi con tetto UTF-16, unicità case-insensitive via indice con collation, età per razza, background ≤ 500), transazione "un personaggio per utente" anche sotto concorrenza, codici d'errore stabili, query `raceTraits`, handoff `BACKEND-NOTES.md` — Validated in Phase 02.1: Character Creation Contract (inserita su richiesta della FE Phase 2; controlli umani su staging registrati in `02.1-HUMAN-UAT.md`)
- ✓ Autorizzazione basata sull'identità: ownership `@OwnsCharacter` sulle mutation e query del personaggio e `@OwnsPendingQuest` su `pendingQuest(id)` (`FORBIDDEN`/`NOT_FOUND` tipizzati con `extensions.code`, innkeeper esente e auditato), role guard `@Roles(innkeeper)` su `users`/`user`/`characters`/`pendingQuests` con CRUD utente legacy rimosso dallo schema, subscription `userUpdated: User!` (change stream su `users`) e `characterUpdated(id)` filtrate per identità con snapshot su subscribe e filtro per evento fail-closed, audit log `admin_audit_logs` (TTL 90 giorni) via interceptor globale best-effort, whitelist enumerate degli handler protetti nel boot reale, handoff `BACKEND-NOTES.md` — Validated in Phase 03: Autorizzazione: Ownership, Ruoli, Audit
- ✓ Cancellazione del personaggio come contratto identity-bound: mutation `deleteCharacter: User!` senza argomenti, soft delete (`deletedAt`/`deletionReason`, mai purge, campi fuori dallo schema GraphQL) e unlink di `User.currentCharacter` in una sola transazione (claim inverso, una sola archiviazione anche in concorrenza, `CHARACTER_NOT_FOUND` al perdente), archiviati invisibili su ogni percorso giocatore (`NOT_FOUND` per ogni ruolo, change stream filtrato, spell-recovery che li salta, `currentCharacter` popolato solo se attivo), nome liberato da un indice unico parziale `character_name_active_ci_unique` con verifier build-then-drop del legacy, `archiveCurrentCharacter(userId, reason)` riusabile dalla Phase 9, handoff `BACKEND-NOTES.md` — Validated in Phase 03.1: Character Deletion Contract (BE-CHAR-06..09)
- ✓ Integrità economica atomica: `WalletService` unico scrittore dei saldi (coins con `findOneAndUpdate` condizionale a pipeline sul rame totale, `twitchPoints` con `$inc` guardato, session-aware), `doTransaction` tutto-o-niente con prezzo ricalcolato dal catalogo e cross-check del totale client (`TRANSACTION_TOTAL_MISMATCH`), equip/unequip/`useSpell` come singoli update condizionali (capacità `maxActiveSpells` nello stesso update, `usages` dal catalogo, recovery Bull idempotente con tetto `maxUsages`, jobId `randomUUID()`), primitiva interna single-flight `QuestAcceptanceService.accept` per la Phase 7, 15 codici `GameRuleException` stabili, schema GraphQL byte-identico, handoff `BACKEND-NOTES.md` — Validated in Phase 4: Integrità Economica (Atomics) (BE-ATOM-01..05; teleport clear atomico resta in Phase 8)
- ✓ Modelli unificati GraphQL ObjectType + Mongoose Schema con `idTransformPlugin` globale — existing
- ✓ Infrastruttura push FCM domain-agnostic: registro `push_devices` per-device (una riga per `(userId, deviceId)`, indice unico sul token, TTL 270 giorni, claim idempotente che sposta il token tra account), `PushService` → porta `PushTransport` (`FcmPushTransport` su firebase-admin 14 / `NoopPushTransport` senza credenziali, mai contattato nei test), data message con `type`/`id`/`title`/`body`/`sentAt` (mai stato di gioco; Android high priority, iOS background push), catalogo tipizzato `travelEnd`/`questEnd`/`streamerLive` (topic `streamer-live`), pruning solo su `registration-token-not-registered`/`invalid-registration-token`, invio best-effort che non lancia mai, mutation `registerPushDevice`/`unregisterPushDevice` sul bearer e `sendTestPush` innkeeper-only auditata, config `FIREBASE_SERVICE_ACCOUNT` fail-closed in produzione — Validated in Phase 5: Infrastruttura Push FCM (verifica 4/4, consegna reale su device nella UAT FE Phase 5; sblocca FE Phase 5)

### Active

<!-- Gap da chiudere in questa milestone. IDs formali in REQUIREMENTS.md -->

- [ ] QUEST-04 (BE): `activeStoryQuest` / `activeWorldMissionQuest` su Character, esposti su schema e subscription — sblocca Phase 6 FE
- [ ] TRAVEL-01 (BE): `status.activeTravel { road, startTime, endTime, duration }` con lifecycle server-side (ETA, completamento, clear atomico su teleport) — sblocca Phase 7 FE
- [ ] Contratto combat result ibrido: entità `CombatResult` persistita, payload completo su subscription, ID su push FCM, query `combatResult(id)`
- [ ] Validazione input (class-validator + ValidationPipe globale) e hardening GraphQL (introspection off in prod, error sanitization, CORS esplicito)

### Out of Scope

- Gilde, arena, blog gilde — v2 (come da PROJECT.md FE)
- Generazione quest via LLM, audio quest, speech-to-text — v2
- Sistema allineamento crime/guard — v2 (enum presenti ma non usati)
- Multi-canale Twitch — il prodotto è single-channel per design
- Scaling orizzontale del PubSub (Redis pub/sub adapter) — un'istanza basta per v1.0; rivalutare se il deployment diventa multi-istanza
- Modifiche al repo FE — gli handoff avvengono via `BACKEND-NOTES.md` nel repo FE, il codice FE non si tocca da qui

## Context

- **Codebase brownfield funzionante**, mappato in `.planning/codebase/` (STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, INTEGRATIONS, CONCERNS).
- **Roadmap FE di riferimento**: `Klimmeck-Guide/.planning/ROADMAP.md` (repo FE) — 12 fasi, Phase 01 (dev auth stub) completa. Le fasi FE 6 e 7 sono bloccate da QUEST-04 e TRAVEL-01; la Phase 3 FE ha bisogno del contratto `connection_init`; la Phase 5 FE dipende da FCM; la Phase 10 FE vuole role guard + audit log in lockstep; la Phase 11 FE (auth reale) ha 5 plan pronti che andranno aggiornati alla decisione JWT (vedi Key Decisions).
- **Handoff FE→BE**: vivono in `.planning/phases/NN-<slug>/BACKEND-NOTES.md` nel repo FE. Il file della Phase 11 non esiste ancora; le due Open Question (contratto connection_init, scope OAuth) sono state estratte dal piano 11-05 e vengono chiuse dalle decisioni di questo progetto.
- **Working tree sporco al momento dell'init**: feature spell use/recovery (Bull + Redis) incompiuta e non committata, con bug noti (decremento usages prima della validazione della spell, race condition su read-modify-write). Va consolidata, testata e committata come parte della milestone.
- **CONCERNS.md** censisce 18 problemi: 5 critici (auth assente, subscription aperte, introspection, `useSpell` non atomico, `doTransaction` non atomico), il resto high/medium.
- **Vincolo dev FE**: le fasi FE 2–10 si sviluppano con lo stub `DEV_AUTH_ACCESS_TOKEN` da `.env`. L'auth BE deve prevedere una modalità dev che accetti quell'identità stub, altrimenti rompe lo sviluppo FE in corso.

## Constraints

- **Tech stack**: NestJS 11 + Mongoose 8 + Apollo GraphQL code-first + Bull/ioredis — già in uso, non negoziabile
- **API Twitch**: rate limit e disponibilità sono un constraint dichiarato — da qui la scelta JWT di sessione (una validazione Twitch al login, non per-request)
- **Compatibilità FE**: i contratti GraphQL esistenti consumati dal FE non si rompono; le aggiunte di schema devono arrivare su staging prima delle fasi FE che le consumano
- **Single channel**: un solo canale Twitch, lo streamer è l'unico `innkeeper`
- **TDD**: Red → Green → Refactor obbligatorio per ogni feature/bugfix
- **Workflow**: branch + PR verso `develop` per ogni fase; mai push diretto su `develop`/`main`; Conventional Commits
- **Security**: nessun secret in repo (`.env` fuori VCS, creare `.env.example`); backend fonte di verità
- **Principi**: Clean Code, SoC, Boy Scout Rule

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Auth: JWT di sessione proprio (in origine: scambio `twitchToken → JWT BE` al login) | Zero chiamate Twitch per-request (rate limit è un constraint); il BE controlla scadenze e claims (userId, twitchId, role). Richiede aggiornamento del contratto Phase 11 FE (che assumeva token Twitch come Bearer) — da comunicare via handoff | ✓ Good — realizzato in Phase 02 con un emendamento: lo scambio è mediato dal BE (authorization code + ticket monouso), perché Twitch non supporta PKCE e richiede `client_secret`; il FE non vede mai un token Twitch |
| Modalità dev auth compatibile con stub FE | Le fasi FE 2–10 usano `DEV_AUTH_ACCESS_TOKEN` statico; il guard BE in dev accetta quell'identità configurata, così l'auth BE può atterrare subito senza bloccare il FE | ✓ Good — realizzato in Phase 02: bypass fail-closed (flag esplicito + boot rifiutato in produzione), identico su HTTP, REST e WS; resta l'unico modo di autenticarsi finché le chiavi Twitch non sono disponibili |
| Creazione personaggio come contratto BE 02.1 inserito prima della Phase 3 | La FE Phase 2 non poteva procedere senza una mutation di creazione; il BE possiede stato iniziale (patria per razza dal lore, 5 argento), validazione e unicità del nome; nessun filtro NSFW per ora (debito BE-HARD) | ✓ Good — realizzato in Phase 02.1 (2026-10-09): transazione claim-then-insert, indice `character_name_ci_unique`, `raceTraits` |
| Autorizzazione in Phase 3 come guard di metodo (`@OwnsCharacter`/`@OwnsPendingQuest`, `@Roles`) dopo l'`AuthGuard` globale, con il contratto real-time (`userUpdated`, snapshot, `FORBIDDEN` alla subscribe) consegnato nelle prime wave | Un solo `APP_GUARD` deny-by-default resta la porta d'ingresso; ownership e ruoli sono decisioni di dominio esplicite per handler, verificabili con whitelist enumerate nel boot reale. L'innkeeper è esente dall'ownership ma ogni azione on-behalf e ogni mutation `@Roles` è auditata (`admin_audit_logs`, TTL 90 giorni) da un interceptor globale che non altera mai l'esito. Il FE Phase 3 dipendeva da `userUpdated` + snapshot, quindi il contratto è atterrato per primo (D-07) | ✓ Good — realizzato in Phase 03 (2026-10-14): 10 plan, schema senza drift, 450 unit + 321 integration verdi; le mutation admin future (quest/enemy/POI/road, teleport, approve/reject) dovranno applicare `@Roles` e vengono auditate automaticamente |
| Cancellazione personaggio come soft delete archiviato (Phase 03.1, inserita dal discuss della FE Phase 4) | Il documento resta a DB per audit e meccaniche future (morte in combattimento in Phase 9 riusa la stessa routine con `deletionReason: death`); l'invisibilità è una lista esplicita di filtri `ACTIVE_CHARACTER_FILTER` (niente middleware globale Mongoose, che nasconderebbe i documenti anche a chi deve vederli); il nome torna disponibile con un indice unico parziale su `{ deletedAt: null }`, che copre anche i documenti legacy senza campo (nessun backfill); archiviato = inesistente (`NOT_FOUND` per ogni ruolo) per non offrire un oracolo di esistenza | ✓ Good — realizzato in Phase 03.1 (2026-10-16): 6 plan, 484 unit + 382 integration verdi, schema senza drift, review WR-01 chiuso in TDD |
| Atomicità per costruzione: update condizionali a documento singolo ovunque possibile, transazioni solo multi-documento (negozio, accept quest), il BE è l'autorità del prezzo (Phase 4, discuss in modalità auto) | Il filtro è la regola: nessun read-modify-write, nessun retry applicativo, indipendenza dalla topologia per le scritture a documento singolo; il totale inviato dal client è solo un cross-check perché il client non può decidere i prezzi (core value); nessuna mutation quest finché la Phase 7 non definisce corsie e cost model | ✓ Good — realizzato in Phase 4 (2026-10-18): 9 plan, 645 unit + 479 integration verdi, schema senza diff, review 4 warning chiusi in TDD |
| Push come side-channel non autoritativo dietro una porta: data message con al massimo un id, registro per-device con invarianti imposte dagli indici, pruning solo sui codici FCM di token stale, credenziali fail-closed in produzione, firebase-admin 14 (Node ≥ 22) (Phase 5, discuss in modalità auto, D-01/D-05/D-08 riviste dopo la ricerca e WR-01) | La fonte di verità resta la subscription/query GraphQL; il FE applica le preferenze sul device (nessun contratto preferenze lato BE); la 13.x perde la gestione topic il 2027-09-29 e Node 18/20 sono EOL; `invalid-argument` è ambiguo tra token e payload e non deve mai svuotare il registro | ✓ Good — 8 piani, 221 unit + 53 integration sul modulo, schema additivo (+33/−0), handoff in `BACKEND-NOTES.md` |
| Combat result ibrido (payload su subscription + ID su push + query per requery) | COMBAT-01..07 FE: foreground riceve tutto in un evento, background riquera dall'ID del push; l'entità persistita supporta il queueing (COMBAT-07) | — Pending |
| Sync punti canale via Twitch EventSub webhook | L'API Twitch non espone il saldo punti dei viewer: le redemption di custom reward sono l'unico segnale. EventSub è real-time e non consuma rate limit; richiede endpoint HTTPS pubblico + verifica firma HMAC | ✓ Validated by Phase 6 (2026-10-21): webhook + credito idempotente + reconcile; E2E managed e C4 prima della produzione |
| Test: mongodb-memory-server (replica set); Bull mockato al confine DI negli unit test + Redis effimero reale nei test di integrazione dei processor | Il replica set supporta change stream e transazioni Mongo richieste dalle feature di atomicità. La scelta iniziale "ioredis-mock" è stata corretta dalla ricerca: non supporta i comandi bloccanti/Lua richiesti da Bull | — Pending |
| Bull + Redis per job differiti (spell recovery, e in prospettiva travel completion) | Già introdotto nel WIP; scheduling affidabile con delay, sopravvive al restart | — Pending |
| Backend fonte di verità (ETA viaggi, progressione, combat, slot magie) | Decisione di progetto FE-BE già consolidata; il FE è puramente reattivo | ✓ Good |

## Workflow Conventions

### Branching & PR (mandatory per ogni fase)

- **Inizio fase:** branch da `develop`: `git checkout develop && git pull && git checkout -b <prefix>/<phase-slug>`
- **Prefissi**: `feat/`, `fix/`, `refactor/` (Conventional Commits); slug = directory di fase `.planning/phases/NN-<slug>/`
- **Fine fase:** PR verso `develop` (mai verso `main`). Niente push diretti su `develop` o `main`.
- Gli artefatti di fase in `.planning/phases/NN-<slug>/` viaggiano nel branch della fase.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

*Last updated: 2026-10-18 after Phase 5 completion (infrastruttura push FCM: registro device per-utente, PushService dietro porta transport, data message tipizzati, pruning sicuro, sendTestPush innkeeper; sblocca FE Phase 5)*
