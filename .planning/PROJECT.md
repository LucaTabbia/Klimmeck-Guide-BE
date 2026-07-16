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
- ✓ Real-time: MongoDB change stream su Character → PubSub → subscription `characterUpdated` filtrata per id — existing
- ✓ Pathfinding stradale con graphology (grafo POI/strade, calcolo percorso e tempi con `speedFactor`) — existing
- ✓ Transazioni economiche di base (`doTransaction`: coins, item) e equip/unequip equipment — existing
- ✓ Equip/unequip/use spell con recovery asincrona via Bull + Redis (WIP nel working tree, da consolidare) — existing
- ✓ Upload immagini via Cloudinary (REST) — existing
- ✓ Modelli unificati GraphQL ObjectType + Mongoose Schema con `idTransformPlugin` globale — existing

### Active

<!-- Gap da chiudere in questa milestone. IDs formali in REQUIREMENTS.md -->

- [ ] Autenticazione: login `twitchToken → JWT di sessione BE` (validazione Twitch una tantum al login), guard globale su HTTP e WS, modalità dev compatibile con lo stub FE (`DEV_AUTH_ACCESS_TOKEN`)
- [ ] Autorizzazione: ownership (solo il proprietario muta il proprio character) + role guard `@Roles(innkeeper)` sulle operazioni admin + audit log admin (who/what/when)
- [ ] Contratto `connection_init` per subscription WS autenticate (chiude Open Question #1 della Phase 11 FE)
- [ ] QUEST-04 (BE): `activeStoryQuest` / `activeWorldMissionQuest` su Character, esposti su schema e subscription — sblocca Phase 6 FE
- [ ] TRAVEL-01 (BE): `status.activeTravel { road, startTime, endTime, duration }` con lifecycle server-side (ETA, completamento, clear atomico su teleport) — sblocca Phase 7 FE
- [ ] Sync punti canale: Twitch EventSub webhook per redemption custom reward → accredito `twitchPoints` (1:1)
- [ ] Infrastruttura push FCM: registrazione token per-device, invio notifiche travel-end / streamer-live / quest-end — sblocca Phase 5 FE
- [ ] Contratto combat result ibrido: entità `CombatResult` persistita, payload completo su subscription, ID su push FCM, query `combatResult(id)`
- [ ] Integrità dati: operazioni atomiche (transazioni Mongo/optimistic locking) su coins, twitchPoints, quest accept, spell usages, teleport
- [ ] Validazione input (class-validator + ValidationPipe globale) e hardening GraphQL (introspection off in prod, error sanitization, CORS esplicito)
- [ ] Fondazione test TDD: mongodb-memory-server (replica set), Bull mockato al confine DI (unit) + Redis effimero reale (integration), fixture/factory, coverage sulle aree critiche

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
| Auth: JWT di sessione proprio (scambio `twitchToken → JWT BE` al login) | Zero chiamate Twitch per-request (rate limit è un constraint); il BE controlla scadenze e claims (userId, twitchId, role). Richiede aggiornamento del contratto Phase 11 FE (che assumeva token Twitch come Bearer) — da comunicare via handoff | — Pending |
| Modalità dev auth compatibile con stub FE | Le fasi FE 2–10 usano `DEV_AUTH_ACCESS_TOKEN` statico; il guard BE in dev accetta quell'identità configurata, così l'auth BE può atterrare subito senza bloccare il FE | — Pending |
| Combat result ibrido (payload su subscription + ID su push + query per requery) | COMBAT-01..07 FE: foreground riceve tutto in un evento, background riquera dall'ID del push; l'entità persistita supporta il queueing (COMBAT-07) | — Pending |
| Sync punti canale via Twitch EventSub webhook | L'API Twitch non espone il saldo punti dei viewer: le redemption di custom reward sono l'unico segnale. EventSub è real-time e non consuma rate limit; richiede endpoint HTTPS pubblico + verifica firma HMAC | — Pending |
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

*Last updated: 2026-07-16 after initialization*
