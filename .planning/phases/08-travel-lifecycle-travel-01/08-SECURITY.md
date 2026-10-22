---
phase: 08-travel-lifecycle-travel-01
audited: 2026-10-22
status: verified
asvs_level: 1
block_on: high
threats_total: 71
threats_mitigated: 64
threats_accepted: 4
threats_transferred: 3
threats_open: 0
threats_open_blocking: 0
open_ids: []
---

# Phase 08 - Security Audit (Travel lifecycle TRAVEL-01)

Verifica a posteriori dei blocchi `<threat_model>` dei piani 08-01 ... 08-14 sul codice finale del branch `feat/08-travel-lifecycle-travel-01` (HEAD `62599f4`), inclusi i fix di 08-REVIEW-FIX (WR-01 `06ce95b` orfani di catalogo, WR-02 `a19abb0` marker senza POI fail-closed, IN-01, IN-07). Unit rieseguite: `npx jest src/travel src/quests src/roads src/config src/models/character src/gameRules src/mongo --selectProjects unit` = 24 suite, 519 test verdi. Le int-spec citate sono state lette, non rieseguite (le esegue l'orchestratore: unit 95 suite / 1416 test, int 57 suite / 743 test, `--runInBand`).

Esito: 71/71 chiuse (64 mitigated, 4 closed accepted, 3 closed transferred). Nessuna minaccia aperta, nessuna bloccante.

Legenda: `mitigated` = mitigazione trovata nel codice e test che la esercita; `closed (accepted)` = rischio accettato e registrato sotto; `closed (transferred)` = trasferito, documentato.

## Trust Boundaries

| Boundary | Descrizione | Dati |
|----------|-------------|------|
| client -> `startTravel` / `travelPreview` | `id` e `poiId` sono input non fidati; meta, percorso, durata e ETA non arrivano mai dal client | id esadecimali |
| bearer JWT -> guard owner-only / `@Roles(innkeeper)` | solo il proprietario viaggia; solo il GM teletrasporta (con audit) | identita autenticata |
| Redis/Bull -> processor | i dati del job sono input non fidato; il job e solo un trigger, decide il DB | `characterId`, `startTime`, `endTime` |
| catalogo a DB (scritto dal GM) -> regole | slot, requiredPoints, marker, ref popolati; dati non fidati, fail-closed | catalogo quest |
| env -> boot | `TRAVEL_SWEEP_INTERVAL_MS` validata, messaggio senza valore | configurazione |
| servizio -> transazione Mongo | claim, registrazione, viaggio e debito nella stessa sessione; job e push solo dopo il commit | stato di gioco |
| DB -> payload GraphQL | `activeTravel.kind` e `registeredAdventurers` interni non escono sul filo | SDL |
| documentazione BE -> FE; CI -> branch | il handoff guida la FE e l'operatore; gli invarianti di CI proteggono contratto e whitelist | BACKEND-NOTES, schema.gql |

## Riepilogo (threat register)

| ID | Categoria | Sev. | Disp. | Status | Mitigazione (file:riga) | Test |
|----|-----------|------|-------|--------|-------------------------|------|
| T-08-01 | Tampering (client imposta `activeTravel`) | high | mitigate | mitigated | `src/models/character/character-status.model.ts:30` `activeTravel` solo sulla classe ObjectType, nessun `@InputType` lo espone | `active-travel.schema.spec.ts`; `test/app.int-spec.ts` SDL esatto |
| T-08-02 | Tampering (contratto GraphQL) | high | mitigate | mitigated | `git diff origin/develop -- src/schema.gql` = esattamente 5 righe rimosse (`startDate`, `registeredAdventurers: [String!]!`, `title`, `party`, `requiredAdventurers: Int!`), le eccezioni D-20 | `test/app.int-spec.ts:335` blocchi SDL esatti |
| T-08-03 | Info disclosure (`ActiveTravel.kind`) | low | mitigate | mitigated | `src/models/character/active-travel.model.ts:57` `kind` senza `@Field`; nessun `registerEnumType` | `test/app.int-spec.ts:380` `not.toMatch(/TravelKind\|\bkind\b/)` |
| T-08-04 | Tampering (slot `count` 0 / rango inesistente) | low | mitigate | mitigated | `src/models/quest/quest-party-slot.model.ts:10,14` `enum: Object.values(TitleType)`, `required`, `min: 1` | `src/models/quest-lanes.schema.spec.ts` validateSync |
| T-08-05 | Tampering (ref non castati) | med | mitigate | mitigated | `active-travel.model.ts:50-54` e `quest-registration.model.ts:12-16` `MongooseSchema.Types.ObjectId` | `active-travel.schema.spec.ts:35` `instance === 'ObjectId'` |
| T-08-06 | DoS (catalogo legacy numerico) | med | accept | closed (accepted) | Registro rischi accettati; fail-closed in `quest-capacity.ts:23-28` `slotsOf` => `invalid` | `quest-capacity.spec.ts`; BACKEND-NOTES §11 |
| T-08-07 | Info disclosure (messaggi di errore) | low | mitigate | mitigated | `src/gameRules/game-rule.exception.ts` messaggi fissi, nessun parametro | `game-rule.exception.spec.ts` (tabella) |
| T-08-08 | Tampering (overbooking, divergenza pre-check/filtro) | high | mitigate | mitigated | `quest-capacity.ts` `hasSeatFor` / `seatAvailableExpr` dalla stessa regola; usato in `quest-acceptance.updates.ts:96` | `quest-capacity.spec.ts`; `quest-acceptance.service.int-spec.ts` concorrenza |
| T-08-09 | Tampering (slot invalidi o legacy accettati) | high | mitigate | mitigated | `quest-capacity.ts:23-28` ogni forma non valida => `'invalid'`, nessuna coercizione | `quest-capacity.spec.ts` it.each `slotsOf` |
| T-08-10 | Tampering (id maiuscolo/malformato valido) | low | mitigate | mitigated | `src/mongo/document-id.ts` `refIdOf` delega a `objectIdFromHex` (esadecimale canonico a 24) | `src/mongo/document-id.spec.ts` |
| T-08-11 | DoS (ref orfano azzera la board) | med | mitigate | mitigated | `src/quests/quest-catalog.populate.ts:27-47` `dropOrphanCatalogRefs` con `isResolved` (WR-01: un ObjectId grezzo e un orfano); chiamato da `quests.service.ts:23,36` | `quest-catalog.populate.spec.ts`; `quests.resolver.int-spec.ts` 'keeps the list alive on orphan refs' |
| T-08-12 | Info disclosure (id malformato) | low | mitigate | mitigated | `quests.service.ts:29-30` `objectIdFromHex` + `ResourceNotFoundException.quest()` | `quests.resolver.int-spec.ts` 'answers NOT_FOUND for an unknown or malformed quest id' |
| T-08-13 | Spoofing (catalogo senza auth) | low | mitigate | mitigated | AuthGuard globale, nessun `@Public` in `src/quests`; `@Public` in produzione invariati vs `origin/develop` (diff = 0 righe) | `quests.resolver.int-spec.ts` 'requires a bearer'; whitelist `test/app.int-spec.ts:52` |
| T-08-14 | Tampering (regressione populate oggetti) | med | mitigate | mitigated | `AssetQuantitySchema` originale invariato con `refPath: 'itemType'`, il catalogo usa un clone | int-spec personaggi e negozio verdi (gate orchestratore) |
| T-08-15 | DoS (eccezione grezza su viaggio senza percorso) | med | mitigate | mitigated | `src/roads/roads.service.ts:200-210` `routeBetween` ritorna `null`, mai throw | `roads.service.int-spec.ts`, `road-route.spec.ts`, `travel-planning.int-spec.ts` 'answers null' |
| T-08-16 | Tampering (arco parallelo sbagliato) | low | mitigate | mitigated | `roads.service.ts:228` `lightestEdge` | `roads.service.int-spec.ts` 'prefers the lightest of parallel roads' |
| T-08-17 | DoS (preview amplificatore) | low | accept | closed (accepted) | Registro rischi accettati | n/a (accept) |
| T-08-18 | Tampering (regressione `getPath`) | low | mitigate | mitigated | `getShortestPath` (`roads.service.ts:138-166`) invariato | `roads.service.int-spec.ts` 'keeps getShortestPath unchanged' |
| T-08-19 | Tampering (ETA/durata dal client) | high | mitigate | mitigated | `src/travel/travel-timing.ts:37-49` durata da `RoadRoute.baseHours` e velocita del server; `TravelRequest` ha solo `id`, `poiId` | `travel-timing.spec.ts` |
| T-08-20 | Tampering (doppio avvio) | high | mitigate | mitigated | `travel.updates.ts:39-41` `activeTravel: null` + `pendingQuest: null` nel filtro dello stesso update | `travel.updates.spec.ts`; `travel.service.int-spec.ts` 'lets exactly one of two concurrent starts win' |
| T-08-21 | Tampering (job duplicato/anticipato) | high | mitigate | mitigated | `travel.updates.ts:66-68` identita `startTime`/`endTime` + `endTime $lte now`, nessun `$$NOW` | `travel.updates.spec.ts`; `travel-completion.int-spec.ts` 'is a no-op for a duplicate or replayed trigger' |
| T-08-22 | Tampering (dati job in Redis) | med | mitigate | mitigated | `src/travel/travel-job.ts:36-50` `travelJobDataOf`: esadecimale canonico, `isSafeInteger >= 0`, `startTime <= endTime` | `travel-job.spec.ts` |
| T-08-23 | Elevation (teleport durante quest) | high | mitigate | mitigated | `travel.updates.ts:104-105` `quests.pendingQuest: null` nel `teleportFilter` | `travel.updates.spec.ts`; `teleport.resolver.int-spec.ts` 'refuses during a pending quest and writes nothing' |
| T-08-24 | DoS (intervallo sweep malformato) | low | mitigate | mitigated | `src/config/travel-config.ts:21-29` `^\d+$` e max 2^31-1, altrimenti boot rifiutato | `travel-config.spec.ts` |
| T-08-25 | Info disclosure (valore env nei log) | low | mitigate | mitigated | `travel-config.ts:25-27` messaggio fisso senza valore | `travel-config.spec.ts` |
| T-08-26 | Tampering (overbooking sotto concorrenza) | high | mitigate | mitigated | `quest-acceptance.updates.ts:96` `$expr: seatAvailableExpr` + anti-duplicato nello stesso `findOneAndUpdate` | `quest-acceptance.service.int-spec.ts` 'registers an enemy with a wildcard slot', 'fills exact seats before wildcards' |
| T-08-27 | Tampering (quest durante un viaggio) | high | mitigate | mitigated | `quest-eligibility.ts:155` `TRAVEL_IN_PROGRESS` per primo; `quest-acceptance.updates.ts:52` `'status.activeTravel': null` nel claim, `:118` classificazione | `quest-acceptance.service.int-spec.ts:787,811` |
| T-08-28 | Elevation (catalogo difettoso => capienza illimitata) | high | mitigate | mitigated | `quest-acceptance.service.ts:242-250` `seatRuleOrReject` => `QUEST_NOT_ACCEPTABLE` prima della transazione | `quest-acceptance.service.int-spec.ts` it.each 'rejects an enemy whose requiredAdventurers is %p' |
| T-08-29 | Info disclosure (valori catalogo nei log) | low | mitigate | mitigated | `quest-acceptance.service.ts:235,245` WARN con solo id quest e corsia | spy su `Logger.prototype.warn` (int-spec) |
| T-08-30 | Tampering (stato parziale dopo rifiuto) | high | mitigate | mitigated | `quest-acceptance.service.ts:150-189` tutto dentro `connection.transaction`, eccezione => abort | casi di rifiuto `quest-acceptance.service.int-spec.ts` (corsia null, 0 PendingQuest, punti invariati) |
| T-08-31 | Tampering (corsia standard fuori citta) | med | mitigate | mitigated | `quest-acceptance.service.ts:129,263-268` `locationInQuestCity` solo per `QuestLane.standard`, verifica nel filtro | `quest-acceptance.service.int-spec.ts:1100` 'rejects a hunt from another city with QUEST_NOT_IN_CITY' |
| T-08-32 | Tampering (posti fantasma) | med | mitigate | mitigated | `src/characters/deletion/character-deletion.service.ts:81-93` `$pull` su `registeredAdventurers` nella stessa sessione dell'archivio | `character-deletion.resolver.int-spec.ts` 'frees the seats of the deleted character on every quest' |
| T-08-33 | Tampering (rimozione posti altrui) | med | mitigate | mitigated | `character-deletion.service.ts:84-92` filtro e `$pull` sul solo `character` archiviato | stesso int-spec, caso con `other` intatto |
| T-08-34 | Repudiation (rilascio senza archivio) | low | mitigate | mitigated | `character-deletion.service.ts:70-75` `return` prima del `$pull` se non archiviato; stessa session | `character-deletion.resolver.int-spec.ts` 'leaves the quests untouched when the deletion is rejected' |
| T-08-35 | Tampering (meta/percorso/ETA dal client) | high | mitigate | mitigated | `src/travel/travel-planner.service.ts:97-98` meta ammessa solo se `markerLocation` di una citta; cammino e durata dal grafo e dal pet del server | casi `TRAVEL_DESTINATION_NOT_ALLOWED`, durata attesa (`travel-planning.int-spec.ts`) |
| T-08-36 | Tampering (pet con modificatore abnorme) | med | mitigate | mitigated | `travel-timing.ts:24-33` `speedOf` => base + `invalid`; WARN con solo id in `travel-planner.service.ts:189` | `travel-timing.spec.ts`, `travel-planning.int-spec.ts` |
| T-08-37 | Spoofing (personaggio archiviato) | med | mitigate | mitigated | `travel-planner.service.ts:90` `activeCharacterById` | `travel-planning.int-spec.ts` caso archiviato => `NOT_FOUND` |
| T-08-38 | DoS (Redis giu blocca l'avvio) | med | mitigate | mitigated | `travel-scheduler.service.ts:39-49` `try/catch` con WARN, mai throw | `travel-planning.int-spec.ts` 'never throws when the queue is unavailable' |
| T-08-39 | Info disclosure (coordinate nei log) | low | mitigate | mitigated | WARN con soli id (`travel-planner.service.ts:135,145,189`, `travel-scheduler.service.ts:47`) | spy sui WARN (`travel-planning.int-spec.ts`) |
| T-08-40 | Tampering (job duplicato) | low | mitigate | mitigated | `travel-job.ts:15-25` `travelJobId` deterministico, `queue.add` con `jobId` | `travel-planning.int-spec.ts` 'enqueues the completion job with a deterministic id and delay' |
| T-08-41 | Tampering (doppio arrivo / countdown sbagliato) | high | mitigate | mitigated | `travel.updates.ts:66-77` filtro identita+scadenza+attivo; `:90-92` countdown con `startDate: null`; `travel-completion.service.ts:60-86` stessa transazione | `travel-completion.int-spec.ts` 'is a no-op for a duplicate or replayed trigger', 'keeps a countdown that already started' |
| T-08-42 | Repudiation (push duplicate) | med | mitigate | mitigated | `travel-completion.service.ts:93-95` push solo se questa chiamata ha matchato (`completed`), dopo il commit | `travel-completion.int-spec.ts` 'pushes once under concurrent completions', 'pushes once when the sweep races' |
| T-08-43 | DoS (viaggio eterno) | high | mitigate | mitigated | `travel-sweeper.ts:48-56` reconciler al boot + sweep periodico; `travel.updates.ts:132` filtro `endTime $lte now` | `travel-completion.int-spec.ts` 'covers a lost job', 'completes an expired travel at boot' |
| T-08-44 | Elevation (job su archiviato) | med | mitigate | mitigated | `travel.updates.ts:66` `activeCharacterById`; `travel-completion.service.ts:99-103` archiviato => `currentCharacter` assente => nessuna push | `travel-completion.int-spec.ts` 'skips an archived character' |
| T-08-45 | Info disclosure (push/log) | low | mitigate | mitigated | `travel-completion.service.ts:111` solo `travelEnd(characterId)`; log con soli id | asserzione su `push.sent` (`travel-completion.int-spec.ts`) |
| T-08-46 | DoS (boot bloccato) | low | mitigate | mitigated | `travel-sweeper.ts:49-56` `void this.sweepSafely()`, `setInterval(...).unref()` | `travel-sweeper.spec.ts` |
| T-08-47 | Tampering (job anticipato) | high | mitigate | mitigated | `travel-completion.processor.ts:35-40` `endTime > now` => nessuna scrittura; filtro `$lte now` seconda difesa (`travel.updates.ts:68`) | `travel-completion.processor.int-spec.ts` 'leaves an early job to the sweep' |
| T-08-48 | Tampering (dati job manipolati) | med | mitigate | mitigated | `travel-completion.processor.ts:27-33` `travelJobDataOf` prima di ogni uso, WARN col solo id job | `travel-completion.processor.int-spec.ts` 'skips malformed job data' |
| T-08-49 | DoS (ri-accodamento in loop) | med | mitigate | mitigated | nessun `add(` nel processor (grep vuoto); recupero via sweep | `travel-completion.processor.int-spec.ts`; grep di acceptance |
| T-08-50 | DoS (eviction delayed job Redis) | med | transfer | closed (transferred) | Trasferimenti: reconciler al boot + sweep; policy `maxmemory-policy` in BACKEND-NOTES §13 | BACKEND-NOTES §13 |
| T-08-51 | Tampering (viaggio senza quest dopo rifiuto) | high | mitigate | mitigated | `quest-acceptance.updates.ts:77` `activeTravel` nello stesso update del claim, dentro la transazione; `quest-acceptance.service.ts:192-193` job dopo il commit | `quest-acceptance.service.int-spec.ts:1000` 'leaves neither travel nor job when the claim is rejected in the transaction' |
| T-08-52 | Tampering (teleport implicito verso marker) | med | accept | closed (accepted) | Registro rischi accettati; WR-02 `a19abb0`: marker senza documento POI => `QUEST_NOT_ACCEPTABLE` prima della transazione | `quest-acceptance.service.int-spec.ts:913` 'jumps to the marker when no road reaches it', `:938` 'rejects a marker without a point of interest document' |
| T-08-53 | DoS (Redis giu blocca le accettazioni) | med | mitigate | mitigated | `quest-acceptance.service.ts:191-193` schedule dopo il commit; `TravelScheduler.schedule` non lancia | `quest-acceptance.service.int-spec.ts:1035` 'keeps the acceptance when the queue is unavailable' |
| T-08-54 | Tampering (seconda quest standard durante il viaggio) | high | mitigate | mitigated | `quest-eligibility.ts:155` + `quest-acceptance.updates.ts:52,118` + corsia occupata | `quest-acceptance.service.int-spec.ts:882` 'refuses a second standard quest while travelling to the first' |
| T-08-55 | Elevation (acceptance invia push) | low | mitigate | mitigated | `quest-acceptance.module.ts` nessun `PushModule` importato (grep) | grep di acceptance |
| T-08-56 | Elevation (innkeeper su personaggio altrui) | high | mitigate | mitigated | `src/travel/travel.resolver.ts:17-19,32-34` `@OwnsCharacter(..., { ownerOnly: true })` su entrambe; 3 `ownerOnly: true` in produzione (`quest-acceptance.resolver.ts:19` + 2) | `travel.resolver.int-spec.ts` 'forbids the innkeeper on another character without auditing'; whitelist real boot `test/app.int-spec.ts:81-88,606` |
| T-08-57 | Tampering (doppio click) | high | mitigate | mitigated | `travel.updates.ts:39-41` filtro `activeTravel: null`; `travel.service.ts:84` job solo dal vincitore | `travel.service.int-spec.ts` 'lets exactly one of two concurrent starts win' |
| T-08-58 | Tampering (avvio durante quest o viaggio) | high | mitigate | mitigated | `travel.updates.ts:40-41,53-55` filtro riaffermato e rilettura per il codice | casi di corsa `travel.service.int-spec.ts` |
| T-08-59 | Spoofing (senza bearer) | high | mitigate | mitigated | AuthGuard globale (`src/auth/guards/auth.guard.ts:15` deny-by-default); nessun `@Public` nuovo (diff vs `origin/develop` = 0) | `travel.resolver.int-spec.ts` 'rejects both operations without a bearer'; `test/app.int-spec.ts:52` whitelist |
| T-08-60 | Tampering (id malformati) | med | mitigate | mitigated | `travel.resolver.ts:44-48` `poiIdOf` + `requireCharacterObjectId` => `NOT_FOUND` | `travel.resolver.int-spec.ts` matrice `poiId: 'abc'`, `id: 'abc'` |
| T-08-61 | Info disclosure (polilinea nel payload) | low | accept | closed (accepted) | Registro rischi accettati; BACKEND-NOTES §5 | BACKEND-NOTES §5 |
| T-08-62 | Elevation (giocatore si teletrasporta) | high | mitigate | mitigated | `src/travel/travel-admin.resolver.ts:17` `@Roles(RoleType.innkeeper)`; whitelist `test/app.int-spec.ts:66` | `teleport.resolver.int-spec.ts` 'forbids a non-innkeeper' |
| T-08-63 | Repudiation (teleport non tracciato) | med | mitigate | mitigated | audit automatico dell'handler `@Roles(innkeeper)` (actor, args, outcome) | `teleport.resolver.int-spec.ts` 'lets the innkeeper teleport ... and audits it', 'audits a rejected teleport' |
| T-08-64 | Tampering (teleport con quest attiva) | high | mitigate | mitigated | `travel.updates.ts:104-105` `quests.pendingQuest: null`; `travel.service.ts:108-123` `classifyUnteleported` | `teleport.resolver.int-spec.ts` 'refuses during a pending quest and writes nothing' |
| T-08-65 | Tampering (job sopravvissuto riporta alla vecchia meta) | high | mitigate | mitigated | `travel.service.ts:115-116` `scheduler.cancel` best-effort (`travel-scheduler.service.ts:65-76`); filtro d'identita del completamento (`travel.updates.ts:66-68`) neutralizza il job | `teleport.resolver.int-spec.ts` 'neutralises the old job even when its removal fails' |
| T-08-66 | Tampering (stato intermedio location/viaggio) | med | mitigate | mitigated | `travel.updates.ts:111` `status.location` e `status.activeTravel: null` nello stesso `$set` di un solo `findOneAndUpdate` (`travel.service.ts:99-107`) | `teleport.resolver.int-spec.ts` 'teleports a free traveller and cancels the pending job' |
| T-08-67 | Tampering (regressione contratto) | high | mitigate | mitigated | verificato in questo audit: diff `src/schema.gql` vs `origin/develop` = 5 righe rimosse, le sole eccezioni dichiarate (08-14-SUMMARY:58) | `test/app.int-spec.ts` SDL esatti |
| T-08-68 | Elevation (handler owner-only/innkeeper mancanti o `@Public` nuovo) | high | mitigate | mitigated | 3 `ownerOnly: true`, 1 `@Roles(innkeeper)` in `src/travel`, `@Public` invariati (diff 0) | whitelist del real boot `test/app.int-spec.ts:52-88` |
| T-08-69 | Tampering lato FE (ETA sul clock del device) | med | transfer | closed (transferred) | Trasferimenti: BACKEND-NOTES §5 (offset `serverTime`) | BACKEND-NOTES §5 |
| T-08-70 | DoS (catalogo legacy non aggiornato) | med | transfer | closed (transferred) | Trasferimenti: BACKEND-NOTES §11 (comandi `updateOne` esatti) | BACKEND-NOTES §11 |
| T-08-71 | Info disclosure (segreti/id reali nel handoff) | low | mitigate | mitigated | BACKEND-NOTES solo placeholder; `.env.example` +5 righe (variabile documentata, nessun secret) | acceptance grep di 08-14 Task 2 |

## Threat Flags (SUMMARY)

Tutti i `## Threat Flags` presenti (08-03, 08-06, 08-08, 08-11, 08-12) dichiarano "None": nessuna superficie fuori dal threat model. Flag non registrati: nessuno.

## Registro dei rischi accettati

| ID | Rischio | Motivazione | Condizione di revisione |
|----|---------|-------------|--------------------------|
| T-08-06 | Un catalogo legacy con `requiredAdventurers` numerico rende `quests` `data: null` | Decisione utente C2: nessuna migrazione ne coercizione; le quest si aggiornano a mano con i comandi del handoff (§11); l'accettazione e fail-closed (`slotsOf` => `invalid`) | Se il catalogo viene popolato da un seed o da un tool |
| T-08-17 | La preview e un amplificatore di carico (Dijkstra in memoria) | ~2,5 k nodi, millisecondi; chiamata autenticata e owner-only | Se il grafo cresce di ordini di grandezza o arriva un rate limit (Phase 10) |
| T-08-52 | Salto implicito verso il marker se nessuna strada lo raggiunge | D-03: solo corsia standard, solo verso il marker della quest nella citta corrente (`locationInQuestCity`), POI esistente (WR-02), WARN con soli id | Se le corsie non standard iniziano a muoversi |
| T-08-61 | Polilinea nel payload di `characterUpdated` | Dato pubblico della mappa, non sensibile; nota di dimensione in §5 | Se la dimensione del payload diventa un problema di banda |

## Trasferimenti

| ID | Destinatario | Documento |
|----|--------------|-----------|
| T-08-50 | Operatore di deploy (Redis `maxmemory-policy`) | BACKEND-NOTES §13; mitigazione residua nel codice: reconciler + sweep |
| T-08-69 | FE Phase 7 | BACKEND-NOTES §5 |
| T-08-70 | Operatore (comandi DB post-deploy) | BACKEND-NOTES §11 |

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-22 | 71 | 71 | 0 | gsd-security-auditor (Claude) |

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter
