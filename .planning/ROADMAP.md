# Roadmap: Klimmeck Guide — Backend (v1.0 Core Loop)

## Overview

Questa milestone porta il backend brownfield da "completamente aperto e con bug di concorrenza" a "fonte di verità sicura e atomica". Si parte dalla fondazione di test TDD (senza cui nulla è testabile) e dal consolidamento del WIP spell nel working tree, poi si posa il seam di autenticazione (JWT di sessione, guard globale HTTP + WS) e l'autorizzazione (ownership, ruoli, audit). Sopra le atomiche economiche — la fondazione trasversale che rende sicuri i crediti EventSub e il lifecycle viaggi — si innestano push FCM, sync punti Twitch, le corsie quest e il lifecycle viaggi (i due contratti che sbloccano le fasi FE 6 e 7 su staging), il contratto combat/admin, e infine l'hardening trasversale. Ogni fase consegna una capacità coerente e verificabile, e diverse fasi sbloccano deliberatamente in anticipo le rispettive fasi FE.

## Phases

**Phase Numbering:**
- Integer phases (1-10): Planned milestone work
- Decimal phases (N.1): Urgent insertions (marked INSERTED)

**Branch convention (per PROJECT.md):** ogni fase parte da `develop` con branch `feat/NN-<slug>` e chiude con PR verso `develop` (mai push diretto su `develop`/`main`).

- [ ] **Phase 1: Fondazione Test & Consolidamento Spell WIP** - Harness TDD (replica-set Mongo, Bull DI-mock + Redis effimero, fixture) e consolidamento del WIP spell con fix ordine-validazione
- [ ] **Phase 2: Auth & Identity Foundation** - JWT di sessione, guard globale HTTP + WS `onConnect`, dev bypass fail-closed, handoff FE
- [ ] **Phase 3: Autorizzazione: Ownership, Ruoli, Audit** - Ownership sulle mutation, role guard `@Roles(innkeeper)`, subscription filtrate per identità, audit log admin
- [ ] **Phase 4: Integrità Economica (Atomics)** - Operazioni atomiche su coins/twitchPoints/quest/equip/spell (no read-modify-write, no stato parziale)
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
**Plans**: 4 plans
Plans:
- [x] 01-01-PLAN.md — Harness test: MongoMemoryReplSet condiviso, split Jest unit/integration, helper Redis effimero (BE-TEST-01, BE-TEST-02)
- [x] 01-02-PLAN.md — Fixture/factory two-tier per User/Character/Quest/Spell/Road/POI (BE-TEST-03)
- [x] 01-03-PLAN.md — Consolidamento WIP spell TDD: unit Bull DI-mock, fix ordine validazione useSpell RED→GREEN, processor integration, change stream/PUB_SUB (BE-TEST-04, BE-TEST-01/02)
- [ ] 01-04-PLAN.md — Pipeline CI GitHub Actions (lint+unit+integration, Redis container, cache binari Mongo) + rimozione src/spellRecovery/ (BE-TEST-01)
**Unblocks (FE)**: nulla FE-side; prerequisito TDD per tutto il resto della milestone.
**Research flag**: mongodb-memory-server replica-set CI flakiness / binary caching (verificare prima di costruire il layer transazioni).
**Branch**: `feat/01-test-foundation` da `develop` → PR a `develop`.

### Phase 2: Auth & Identity Foundation
**Goal**: Il backend ha un seam di autenticazione a JWT di sessione che protegge ogni operazione GraphQL (HTTP + WS) e REST, con dev bypass fail-closed compatibile con lo stub FE e un handoff documentato.
**Depends on**: Phase 1
**Requirements**: BE-AUTH-01, BE-AUTH-02, BE-AUTH-03, BE-AUTH-04, BE-AUTH-05, BE-AUTH-06
**Success Criteria** (what must be TRUE):
  1. La mutation di login scambia un token Twitch (validato una tantum su `id.twitch.tv/oauth2/validate`) per un JWT BE a TTL breve con claims `{userId, twitchId, role}`, risolvendo/creando lo User per `twitchId`.
  2. Una mutation chiamata senza JWT valido restituisce un errore di auth; un'operazione `@Public()` (es. login) riesce senza JWT — enforced da un `APP_GUARD` globale che copre HTTP e l'endpoint REST Cloudinary.
  3. Una connessione subscription WS con JWT assente/invalido in `connection_init` (`Authorization: Bearer <jwt>`) è rifiutata in `onConnect`; una valida connette e l'identità è disponibile ai resolver (verificato con test di integrazione, non context mockato).
  4. Con `DEV_AUTH_ENABLED=true` il guard accetta l'identità stub FE da `DEV_AUTH_ACCESS_TOKEN`; il bypass è impossibile con `NODE_ENV=production` (test fail-closed).
  5. Un handoff `BACKEND-NOTES` documenta login, header, `connection_init`, comportamento post-refresh e scope Twitch richiesti — chiude Open Questions #1 e #2 della Phase 11 FE.
**Plans**: TBD
**Unblocks (FE)**: FE Phase 3 (contratto `connection_init`) e FE Phase 11 (contratto JWT; l'auth BE atterra deliberatamente prima della Phase 11 FE — rationale in PROJECT.md Key Decisions e REQUIREMENTS.md).
**Research flag**: propagazione del context graphql-ws / @nestjs/apollo@13 (nestjs/graphql#1756) — MEDIUM confidence, fissare con integration test reale.
**Branch**: `feat/02-auth-foundation` da `develop` → PR a `develop`.

### Phase 3: Autorizzazione: Ownership, Ruoli, Audit
**Goal**: L'autorizzazione è basata sull'identità autenticata: ownership sulle mutation, role guard sulle operazioni admin, subscription filtrate per identità, audit log admin persistente.
**Depends on**: Phase 2
**Requirements**: BE-AUTHZ-01, BE-AUTHZ-02, BE-AUTHZ-03, BE-AUTHZ-04
**Success Criteria** (what must be TRUE):
  1. Una mutation su un character non posseduto dal chiamante (equip/spell/transazione/quest/travel) restituisce 403; il proprietario riesce.
  2. Un'operazione admin (CRUD quest/enemy/POI/road, teleport, outcome, approve/reject) chiamata da un non-innkeeper restituisce 403; `@Roles(innkeeper)` la consente.
  3. `characterUpdated` (e lo user stream) emette solo al proprietario/innkeeper autenticato: un subscriber non riceve gli eventi del character altrui nemmeno passando l'id della vittima come argomento.
  4. Ogni azione admin scrive un record di audit persistente (who, what, when, target, payload sintetico) interrogabile a posteriori.
**Plans**: TBD
**Unblocks (FE)**: FE Phase 10 in lockstep (role guard + audit log consegnati in anticipo, non deferiti) → FE ADMIN-07/08, HARDEN-02.
**Branch**: `feat/03-authorization-audit` da `develop` → PR a `develop`.

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
**Plans**: TBD
**Unblocks (FE)**: nessuna fase FE diretta; prerequisito interno per Phase 6 (credito EventSub), Phase 7 (accept atomico) e Phase 8 (teleport/clear atomico). Supporta FE QUEST-06.
**Branch**: `feat/04-atomic-operations` da `develop` → PR a `develop`.

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
**Branch**: `feat/05-fcm-infrastructure` da `develop` → PR a `develop`.

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
| 2. Auth & Identity Foundation | 0/TBD | Not started | - |
| 3. Autorizzazione: Ownership, Ruoli, Audit | 0/TBD | Not started | - |
| 4. Integrità Economica (Atomics) | 0/TBD | Not started | - |
| 5. Infrastruttura Push FCM | 0/TBD | Not started | - |
| 6. EventSub: Punti Canale & Streamer Live | 0/TBD | Not started | - |
| 7. Quest Lanes (QUEST-04) | 0/TBD | Not started | - |
| 8. Travel Lifecycle (TRAVEL-01) | 0/TBD | Not started | - |
| 9. Combat Result & Admin Outcomes | 0/TBD | Not started | - |
| 10. Hardening Trasversale | 0/TBD | Not started | - |
