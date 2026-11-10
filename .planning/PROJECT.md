# Klimmeck Guide — Backend

## What This Is

Backend **NestJS 11 + MongoDB (Mongoose 8) + GraphQL (Apollo code-first, HTTP + WS) + Bull/Redis** dell'app mobile Klimmeck Guide: un RPG persistente alimentato dai punti canale Twitch di un singolo canale. Il backend è la **fonte di verità** di tutto il gioco — sessione e autorizzazione, progressione, combattimento, HP, slot magie, economia, viaggi con cibo e imboscate, generazione delle quest, negozi, lore — mentre il frontend Flutter è puramente reattivo. Il mondo (città, strade, nemici, oggetti, lore, pool, quest fisse) vive solo nel DB, seminato al boot e curato a DB dallo streamer (ruolo `innkeeper`), che è il game master.

## Core Value

Il backend è la fonte di verità affidabile e sicura dello stato di gioco: nessun client può alterare uno stato che non gli appartiene, e ogni valore mostrato dal frontend è calcolato e garantito server-side.

_Confermato alla chiusura della v1.0 (2026-11-10): guard deny-by-default, matrice di autorizzazione provata sul boot reale, economia atomica, timer con il DB come verità e regole di gioco tutte server-side._

## Current State: v1.0 Core Loop (BE) — SHIPPED 2026-11-10

- **21 fasi** (1–17 più le inserite 2.1, 3.1, 9.1, 9.2, 13.1), **261 piani, 195 task**, 5 quick task; archivio in `.planning/milestones/v1.0-ROADMAP.md` e `v1.0-REQUIREMENTS.md`, riepilogo in `.planning/MILESTONES.md`.
- **Requisiti:** 118/118 completi, nessun orfano.
- **Codebase:** 81 411 righe TypeScript in `src/` (631 file non spec), 87 939 righe di spec (381 file); 381 suite / 4 872 test alla Phase 17, coverage per cartella come gate (`src/auth` 99,86 % righe); CI GitHub Actions (lint, unit, integration, build con diff di `src/schema.gql` dal boot reale, secret scan gitleaks) verde; 2 188 commit, 27 PR mergiate (ultime #27 Phase 17 e #28 taglie delle città).
- **Produzione:** processo di sviluppo dell'utente su `develop` `9973fcb1` (porta 3001); migrazione dei ref `Mixed` fatta con il runbook della Phase 10; secret scan eseguito il 2026-10-30.
- **Companion FE:** milestone v1.0 Core Loop chiusa lo stesso giorno (17 fasi, 180 piani, FE PR #45/#46).

## Next Milestone: v1.1 (da definire con `/gsd-new-milestone`)

Candidati già discussi su branch (i branch toccano `ROADMAP.md`, `REQUIREMENTS.md` e `STATE.md` e vanno ribasati sulla chiusura):

- **Phase 18 — Quest heal per taglia** (`feat/18-quest-heal-per-taglia` ↔ FE 18): HP guariti separati dalle ferite guarite, liste di ferite per taglia (≤20/≤40/tutte + lore), tetto 50/80/100, 2/5/8 ore, gratuite, a Necrorian solo enemy/boss/dungeon; pozioni dal Diario con ricarica globale `recovery { time, turns }` 30 min–24 h e lore «Il limite del corpo».
- **Phase 19 — Revisione dei modelli** (`feat/19-revisione-dei-modelli` ↔ FE 19): weaknesses, magie per ref, pet con stato sul personaggio e 10 % xp dei nemici al compagno (tetto `maxXp`), attack/defense piatti, `wornEquipment/feet`, una sola lista di magie, via `POI.quest`, `City.shop`, `Lore.imagePath`.
- **Phase 20 — Cibo e vita progressivi** (`feat/20-cibo-e-vita-progressivi`, solo BE): piano salvato alla partenza, vita incrementale allo sweep nel tratto scoperto, cibo in blocco a confine/arrivo/sconfitta, deviazione senza costi.

## Requirements

### Validated

- ✓ Moduli dominio completi (characters, cities, enemies, equipmentItems, lootItems, lore, pendingQuests, pets, pointsOfInterest, quests, roads, spells, users), GraphQL code-first HTTP + WS, pathfinding stradale con graphology, upload Cloudinary, modelli unificati ObjectType + Schema con `idTransformPlugin` — existing (brownfield mappato in `.planning/codebase/`)
- ✓ Fondazione TDD e CI: `MongoMemoryReplSet` condiviso (transazioni + change stream), split Jest unit/integration, Bull DI-mock + Redis effimero reale, fixture two-tier, GitHub Actions lint + unit + integration; `useSpell` consolidato con fix ordine-validazione — v1.0 Phase 1 (2026-07-23)
- ✓ Autenticazione a sessione propria: login Twitch mediato dal BE (authorization code lato server, ticket monouso legato a challenge S256), access JWT 15 min + refresh rotante con grazia 30 s e reuse detection, guard globale deny-by-default su REST / GraphQL HTTP / WS con whitelist `@Public()` di 5 handler, `me`, `logout`, dev bypass fail-closed, contratto `connection_init` (4403/4401) — v1.0 Phase 2 (2026-10-06; login reale provato dalla FE il 2026-10-20 e sulla release firmata il 2026-11-09)
- ✓ Creazione personaggio: `createCharacter(input): User!` sull'identità del bearer, stato iniziale backend-owned, validazione autoritativa (nome 2–20 grafemi unico case-insensitive, età per razza, background ≤ 500), transazione claim-then-insert, `raceTraits` — v1.0 Phase 2.1 (2026-10-09)
- ✓ Autorizzazione per identità: `@OwnsCharacter` / `@OwnsPendingQuest` (`FORBIDDEN`/`NOT_FOUND` tipizzati, innkeeper esente e auditato), `@Roles(innkeeper)` sulle liste, `userUpdated` + `characterUpdated(id)` filtrate per identità con snapshot e filtro fail-closed, audit log `admin_audit_logs` TTL 90 giorni — v1.0 Phase 3 (2026-10-14)
- ✓ Cancellazione del personaggio identity-bound: `deleteCharacter: User!`, soft delete con `deletedAt`/`deletionReason`, unlink atomico, archiviati invisibili su ogni percorso giocatore, nome liberato da indice unico parziale — v1.0 Phase 3.1 (2026-10-16)
- ✓ Integrità economica atomica: `WalletService` unico scrittore dei saldi, `doTransaction` tutto-o-niente con prezzo dal catalogo e `TRANSACTION_TOTAL_MISMATCH`, equip/unequip/`useSpell` come update condizionali, recovery Bull idempotente, `QuestAcceptanceService.accept` single-flight — v1.0 Phase 4 (2026-10-18)
- ✓ Push FCM domain-agnostic: registro `push_devices` per device, `PushService` → `PushTransport` (firebase-admin 14 / noop senza credenziali), data message con `type`/`id`/`title`/`body`/`sentAt`, catalogo tipizzato (`travelEnd`, `questEnd`, `questCancelled`, `streamerLive`, `ambushDefeat`), pruning sui soli token stale — v1.0 Phase 5 (2026-10-18)
- ✓ Sync punti canale via Twitch EventSub: webhook HMAC-verificato con challenge e replay window, credito 1:1 idempotente (`eventsub_messages`), subscription riconciliate con app access token, `stream.online` → push streamer-live — v1.0 Phase 6 (2026-10-21; E2E managed e C4 prima della produzione)
- ✓ Corsie quest parallele (QUEST-04): `activeStoryQuest`/`activeWorldMissionQuest`, `acceptQuest` owner-only e lane-aware in transazione (claim, registrazione con capienza per rango, debito di `requiredPoints`), eleggibilità server-side (città del marker, titolo esatto, party per rango, worldMission solo nella sua città), `serverTime` — v1.0 Phase 7 (2026-10-21)
- ✓ Viaggio server-autoritativo (TRAVEL-01): `status.activeTravel`, `startTravel`/`travelPreview` città → città dal grafo con `speedFactor` e `Pet.speedModifier`, viaggio automatico all'accettazione, completamento con il DB come verità (job Bull come trigger, reconciler al boot, sweep), teleport GM atomico — v1.0 Phase 8 (2026-10-21)
- ✓ Esiti di combattimento e outcome del GM: `QuestResult` persistito per i cinque esiti con `CombatResolver`, delivery ibrida (subscription `questResultReceived` owner-only + push `questEnd` + query), catena aid/morte, coda live dell'innkeeper e `completePendingRequest` con override, `SHOP_NOT_IN_CITY` — v1.0 Phase 9 (2026-10-26)
- ✓ Stato per magia conosciuta: `status.spellStates { spell, usages, recoveries }`, recupero che non si interrompe mai, processor idempotente + reconciler/sweep, migrazione al boot — v1.0 Phase 9.1 (2026-10-27)
- ✓ Consegna dei risultati mai persa: `unacknowledgedQuestResults`, `acknowledgeQuestResult(id)` idempotente, `acknowledgedAt` con backfill, posti delle quest avviate tenuti dall'archivio, il morto resta corrente fino all'ack — v1.0 Phase 9.2 (2026-10-28)
- ✓ Hardening trasversale: class-validator su tutti i 17 input (`BAD_USER_INPUT`), introspection off e sanitization con `requestId`, `.env.example` con drift test, gitleaks, coverage per cartella come gate, throttling, moderazione Sightengine prima di Cloudinary (`IMAGE_REJECTED` / `IMAGE_MODERATION_UNAVAILABLE`), change stream riaperti, indici dello sweep, ritipizzazione dei 34 ref `Mixed` con migrazione e runbook, segnaposto dei partecipanti archiviati, avvio da soli, `pendingQuest` nella coda del GM con `QUEST_IN_PROGRESS` — v1.0 Phase 10 (2026-10-30)
- ✓ Popolamento del mondo dal documento di world building: ~300 lore, 99 creature + voci dell'utente, pet, magie, equipaggiamento, cibo e consumabili, quest fisse per città e dungeon sui POI; semina idempotente al boot e cura a DB (D-36: nessun file di contenuto né CLI nel repo dopo il boot), ritratti dei nemici su Cloudinary — v1.0 Phase 11 (2026-11-02)
- ✓ Negozi per città: `City.size` (capital / city / village) e `City.hasShop`, pool per città seminato al boot e curato a DB, `cityShop(cityId)` con equipaggiamento, loot e compagni (mai leggendari), `ITEM_NOT_IN_SHOP`, `equipPet`/`unequipPet`, `assets.ownedPets`, Necrorian senza negozio — v1.0 Phase 12 (2026-11-03)
- ✓ Generazione server-side delle quest: `infos.enemies [{ enemy, quantity }]` sostituisce `infos.enemy`, generatore `enemy`/`boss` reattivo + sweep + mutation GM `generateQuests`, boss singolo di fascia superiore, branco di deboli, premi per fascia e pool di loot per rango, pet 1 %/20 %, dungeon a tappe, gioielli `accessoryUseTypes`; correzioni dalla UAT: animali fuori, fasce di xp contigue a cinque ranghi con budget per posti, tetto e peso per taglia, tabellone per area, quest di studio dal grado rookie — v1.0 Phase 13 + 13.1 (2026-11-04/05)
- ✓ Viaggio e cibo: consumo di oggetti `hunger` dal tempo di marcia (1 power = 3 min) a scarto minimo, km scoperti → vita persa (il km n-esimo costa n HP), `TRAVEL_STARVING` su partenza libera e da quest, preview additiva su `travelPreview` e `questTravelPreview`, teleport e salto esenti — v1.0 Phase 14 (2026-11-05)
- ✓ Imboscate in viaggio: rischio per km di giorno e di notte (`AMBUSH_TIMEZONE`), più imboscate con risorteggio, nemici del POI più vicino nella fascia [Facile, Medio], `CombatResolver` al momento dell'imboscata, sconfitta → `activeTravel` riscritto verso la città più vicina + push `ambushDefeat`, report `QuestResult.kind = ambush` trattenuti all'arrivo — v1.0 Phase 15 (2026-11-06)
- ✓ Lore sbloccabili per personaggio: `status.unlockedLore` (id sul filo) e `status.knownEnemies` (interno), geografia della città alla nascita e a ogni arrivo, nemici alla vittoria, studio al 50 %, `known` sui nemici delle quest, `QuestResult.loreUnlocked`, query di lore filtrate — v1.0 Phase 16 (2026-11-07)
- ✓ Autorizzazione e sessioni: matrice table-driven sulle liste enumerate dal boot reale (11 handler innkeeper, 19 owner-only, 89 casi), «l'ultimo login caccia l'altro» con `WsSessionRegistry` e close `4409`, `SESSION_REVOKED` + `extensions.reason` (`newLogin`, `roleChanged`, `reuseDetected`, `userLogout`), revoca al cambio ruolo via `UserRoleChangesPublisher` (change stream serializzato, bounded by `clusterTime`), JWT stateless 15 min — v1.0 Phase 17 (2026-11-09)

### Active

**Post v1.0 (candidati v1.1, da confermare nel `/gsd-new-milestone`):**

- [ ] Quest heal per taglia e pozioni dal Diario con ricarica globale (Phase 18 ↔ FE 18, contesto su `feat/18-quest-heal-per-taglia`)
- [ ] Revisione dei modelli condivisa BE/FE (Phase 19 ↔ FE 19, contesto su `feat/19-revisione-dei-modelli`)
- [ ] Cibo e vita progressivi in viaggio (Phase 20, solo BE, contesto su `feat/20-cibo-e-vita-progressivi`)
- [ ] «Esci da tutti i dispositivi»: mutation che revoca ogni sessione dell'utente (backlog dalla Phase 2)
- [ ] E2E EventSub managed con tunnel HTTPS e verifica C4 prima della produzione (Phase 6)
- [ ] Promemoria operativi di produzione: policy Sightengine e default del throttler da confermare, una chiamata Sightengine reale, `THROTTLE_TRUST_PROXY`, topologia Mongo (replica set) e Redis (eviction dei delayed job)

### Out of Scope

- Gilde, arena, blog gilde — v2 (come da PROJECT.md FE)
- Descrizioni delle quest via LLM, audio quest, speech-to-text — v2; la generazione server-side delle quest `enemy`/`boss` è stata consegnata (Phase 13) con titoli a template
- Sistema allineamento crime/guard — v2 (le quest fisse crime/guard esistono senza logica di allineamento)
- Multi-canale Twitch — il prodotto è single-channel per design
- Scaling orizzontale del PubSub (Redis pub/sub adapter) — un'istanza basta per v1.0; rivalutare se il deployment diventa multi-istanza
- Validazione della sessione a ogni richiesta (kick immediato del device sostituito dall'HTTP) — rifiutata nella Phase 17: JWT stateless, finestra di 15 min accettata
- File di contenuto, CLI di semina e migrazioni one-shot nel repo — mai: il mondo vive nel DB (D-36), i one-off escono dal repo dopo il boot reale
- Modifiche al repo FE — gli handoff avvengono via `BACKEND-NOTES.md` nel repo FE, il codice FE non si tocca da qui

## Context

- **Stato del codice (2026-11-10):** 81 411 righe TypeScript in `src/` (631 file), 87 939 righe di spec (381 file), 381 suite / 4 872 test, coverage per cartella come gate; 2 188 commit, 27 PR mergiate su `develop`.
- **Stack:** NestJS 11, Mongoose 8, Apollo code-first (HTTP + `graphql-ws`), Bull + ioredis, firebase-admin 14, class-validator, Sightengine + Cloudinary, graphology; Jest con `mongodb-memory-server` (replica set) e Redis effimero; GitHub Actions (lint, unit, integration, build + diff dello schema, secret scan).
- **Dati:** il mondo vive solo nel DB (D-36) — città con taglia, POI, strade con `speedFactor`, 99+ nemici con lore e ritratti, pet, magie, equipaggiamento, cibo, pool dei negozi, quest fisse e generate; cura a DB da parte dello streamer («la mano vince»); nessun seeder nel repo dopo il boot.
- **Roadmap FE di riferimento:** `Klimmeck-Guide/.planning/milestones/v1.0-ROADMAP.md` (17 fasi complete); i contratti sono stati consegnati su `develop` prima di ogni fase FE (tabella di allineamento nell'archivio).
- **Handoff FE→BE / BE→FE:** `.planning/phases/NN-<slug>/BACKEND-NOTES.md` nei due repo; le regole di gioco dette dall'utente diventano D-NN della fase BE.
- **Ambiente dev:** `.env` fuori VCS (`.env.example` con drift test), `DEV_AUTH_ENABLED` vietato in produzione, `JWT_SECRET` ≥ 32 caratteri obbligatoria; il processo dell'utente gira da `dist/` (`npm run build` vietato mentre gira).
- **Debito tecnico noto:** `test:cov` ≈ 630 s (solo in background), intersezioni di interfacce negli update Mongoose (da ripulire nella Phase 19), harness bare delle int-spec che non chiude Mongoose, PubSub a istanza singola.

## Constraints

- **Tech stack**: NestJS 11 + Mongoose 8 + Apollo GraphQL code-first + Bull/ioredis — già in uso, non negoziabile
- **API Twitch**: rate limit e disponibilità sono un constraint dichiarato — da qui il JWT di sessione (una validazione Twitch al login, non per-request) e EventSub per i punti
- **Compatibilità FE**: i contratti GraphQL consumati dal FE non si rompono; le aggiunte di schema arrivano su `develop` prima delle fasi FE che le consumano; i cambi non additivi (come `infos.enemies`) si dichiarano e si allineano con i piani FE gated
- **Single channel**: un solo canale Twitch, lo streamer è l'unico `innkeeper`
- **TDD**: Red → Green → Refactor obbligatorio per ogni feature/bugfix
- **Workflow**: branch + PR verso `develop` per ogni fase; mai push diretto su `develop`/`main`; Conventional Commits; nessun trailer nei commit
- **Security**: nessun secret in repo (`.env` fuori VCS, `.env.example`); backend fonte di verità; gitleaks in CI
- **Principi**: Clean Code, SoC, Boy Scout Rule

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Auth: JWT di sessione proprio, login Twitch mediato dal BE | Zero chiamate Twitch per-request; il BE controlla scadenze e claims; Twitch non supporta PKCE e richiede `client_secret` | ✓ Good — Phase 2 (2026-10-06); login reale provato su device (2026-10-20) e sulla release FE (2026-11-09) |
| Modalità dev auth compatibile con stub FE | Le fasi FE 2–10 usano `DEV_AUTH_ACCESS_TOKEN`; bypass fail-closed (flag esplicito, boot rifiutato in produzione) | ✓ Good — Phase 2; usato in ogni UAT fino alla FE Phase 12 |
| Creazione personaggio come contratto 2.1 inserito prima della Phase 3 | La FE Phase 2 non poteva procedere senza una mutation; il BE possiede stato iniziale, validazione e unicità | ✓ Good — Phase 2.1 (2026-10-09) |
| Autorizzazione come guard di metodo dopo l'`APP_GUARD` globale, contratto real-time filtrato per identità, audit on-behalf | Un solo guard deny-by-default come porta; ownership e ruoli espliciti per handler, verificabili sul boot reale | ✓ Good — Phase 3 (2026-10-14); la matrice della Phase 17 li prova tutti (89 casi) |
| Cancellazione personaggio come soft delete archiviato (3.1) | Documento a DB per audit e morte in combattimento; invisibilità con filtri espliciti, nome liberato da indice parziale | ✓ Good — Phase 3.1 (2026-10-16); riusato dalla morte (Phase 9) e dal ripristino nelle UAT |
| Atomicità per costruzione: update condizionali, transazioni solo multi-documento, BE autorità del prezzo | Nessun read-modify-write né retry applicativo; il totale del client è un cross-check | ✓ Good — Phase 4 (2026-10-18); nessun bug di concorrenza emerso nelle UAT |
| Push come side-channel non autoritativo dietro una porta, firebase-admin 14, data-only | La fonte di verità resta GraphQL; il FE applica le preferenze sul device | ✓ Good — Phase 5 (2026-10-18); topic v1 con il ruolo IAM `firebasecloudmessaging.admin` |
| Sync punti canale via Twitch EventSub webhook | L'API Twitch non espone il saldo: le redemption sono l'unico segnale; real-time senza rate limit | ✓ Good — Phase 6 (2026-10-21); E2E managed e C4 prima della produzione |
| Corsie quest parallele con cost model in punti canale | Tre corsie indipendenti; solo story/worldMission costano punti; party per rango; worldMission solo nella sua città | ✓ Good — Phase 7 (2026-10-21) + quick task 261022-f0n |
| Viaggio server-autoritativo con il DB come fonte di verità dei timer | Il job Bull è un trigger idempotente; `endTime` decide; reconciler + sweep coprono eviction e skew | ✓ Good — Phase 8 (2026-10-21); stesso pattern per recuperi (9.1) e imboscate (15) |
| Combat result ibrido (subscription + push con id + query) e ack esplicito; il morto resta corrente fino all'ack; posti delle quest avviate mai liberati | Nessun esito perso in foreground, background o a app uccisa; «prima il foglio, poi la creazione» | ✓ Good — Phase 9 (2026-10-26) + 9.2 (PR #15 mergiata il 2026-10-29) |
| Usi e recuperi per magia conosciuta, non per slot; il timer non si interrompe mai | Regola dell'utente (2026-10-27); equip/disequip neutri | ✓ Good — Phase 9.1 (2026-10-27) |
| Test: `mongodb-memory-server` replica set; Bull mockato al confine DI negli unit + Redis effimero reale nei processor test | Change stream e transazioni richiedono il replica set; `ioredis-mock` non supporta i comandi di Bull | ✓ Good — Phase 1; 4 872 test alla Phase 17 senza flakiness strutturale |
| Bull + Redis per job differiti | Scheduling con delay che sopravvive al restart; il DB resta la verità | ✓ Good — Phases 8, 9.1, 15; coda con timeout 2 s (quick task 261022-rhs) |
| Hardening trasversale: validazione input, superficie di produzione, coverage per cartella, gitleaks, Sightengine prima di Cloudinary, ritipizzazione dei ref `Mixed` con migrazione a driver nativo | Chiudere i debiti prima dell'estensione; la moderazione server-side sostituisce il pre-screen client CHAR-06 | ✓ Good — Phase 10 (2026-10-30); migrazione in produzione con runbook, secret scan 2026-10-30 |
| Il mondo vive solo nel DB (D-36): semina idempotente al boot + cura a DB, nessun file di contenuto né CLI nel repo | La PR con `content/` era rumore; lo streamer cura i dati a mano e «la mano vince» | ✓ Good — Phases 11, 12 (2026-11-02/03); one-off rimossi dopo ogni boot reale (13.1, 16) |
| Negozi per taglia con pool a DB, Necrorian senza negozio, compagni acquistabili solo per lore | Il negozio è un luogo della città; i leggendari non si vendono | ✓ Good — Phase 12 (2026-11-03) |
| Generazione quest: boss singolo di fascia superiore, enemy singolo o branco di deboli, nessuna scadenza, tetto 3 per città, rango meno coperto, animali fuori, fasce contigue a budget, tabellone per area | Quest sempre disponibili senza lo streamer; regole dell'utente dalla revisione e dalla UAT (13.1) | ✓ Good — Phases 13 + 13.1 (2026-11-04/05) |
| Cibo e vita decisi alla partenza (1 power = 3 min, km scoperti → HP), rifiuto per fame, nessun costo in monete | Preview onesta prima di «Parti»; scelta a scarto minimo | ✓ Good — Phase 14 (2026-11-05); ⚠️ Revisit in Phase 20 (consumo progressivo) |
| Imboscate per km giorno/notte con risorteggio, nemici del POI più vicino nella fascia [Facile, Medio], deviazione alla sconfitta verso la città più vicina, report trattenuti all'arrivo | Il viaggio resta silenzioso fino all'arrivo salvo la sconfitta (push); nessuna imboscata sulla deviazione | ✓ Good — Phase 15 (2026-11-06) |
| Lore per personaggio: geografia alla nascita e all'arrivo, nemici alla vittoria, studio al 50 %, id sul filo, nessun `Lore.unlocked` globale | La Biblioteca cresce con il viaggio del personaggio; il BE non traccia il «visto» | ✓ Good — Phase 16 (2026-11-07) |
| «L'ultimo login caccia l'altro» con close WS `4409`, `SESSION_REVOKED` + `reason`, revoca al cambio ruolo; JWT stateless 15 min accettato (nessuna validazione per richiesta) | Semplicità e nessuna riconciliazione multi-device; l'HTTP del device sostituito scade da solo | ✓ Good — Phase 17 (2026-11-09), provato con Samsung + emulatore nella UAT FE 12 |
| Ferrion e Necrorian capitali, Talmvere villaggio sempre visibile (lato FE); a Necrorian solo quest enemy/boss/dungeon | Regola dell'utente nella UAT FE 12 (DB-1); pool a DB non rigenerati («la mano vince») | ✓ Good — quick task 261109-cap (PR #28, 2026-11-10); regola per le heal quest della Phase 18 |
| Backend fonte di verità (ETA viaggi, progressione, combat, slot magie, prezzi, cibo, imboscate, lore) | Decisione di progetto FE-BE consolidata; il FE è puramente reattivo | ✓ Good — confermata da tutte le 21 fasi |

## Workflow Conventions

### Branching & PR (mandatory per ogni fase)

- **Inizio fase:** branch da `develop`: `git checkout develop && git pull && git checkout -b <prefix>/<phase-slug>`
- **Prefissi**: `feat/`, `fix/`, `refactor/`, `docs/` (chiusure di milestone e sole modifiche a `.planning/`); slug = directory di fase `.planning/phases/NN-<slug>/`
- **Fine fase:** PR verso `develop` (mai verso `main`), draft finché il boot reale non è stato fatto quando la fase porta migrazioni o semine. Niente push diretti su `develop` o `main`.
- Gli artefatti di fase in `.planning/phases/NN-<slug>/` viaggiano nel branch della fase; i one-off (migratori, seeder) escono dal repo prima della merge, resta il report nell'handoff.
- **Companion FE:** i nomi del contratto si fissano in `NN-REPO-RULES.md` nei due repo prima dei planner; la FE verifica lo schema mergiato con `tool/schema_check`.

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

*Last updated: 2026-11-10 after the v1.0 Core Loop (BE) milestone (21 fasi consegnate; revisione completa di What This Is, Core Value, requisiti, Out of Scope, Context e Key Decisions; storia dei footer precedenti in `milestones/v1.0-ROADMAP.md` e in git)*
