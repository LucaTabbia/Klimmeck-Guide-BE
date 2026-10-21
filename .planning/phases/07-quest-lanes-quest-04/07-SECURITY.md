---
phase: 07-quest-lanes-quest-04
audited: 2026-10-21
status: verified
asvs_level: 1
block_on: high
threats_total: 39
threats_mitigated: 33
threats_accepted: 4
threats_transferred: 2
threats_open: 0
threats_open_blocking: 0
open_ids: []
---

# Phase 07 - Security Audit (Quest lanes + QUEST-04 acceptQuest)

Verifica a posteriori dei blocchi `<threat_model>` dei piani 07-01 ... 07-08 sul codice finale del branch `feat/07-quest-lanes-quest-04` (HEAD `e02f80b`), inclusi i fix di 07-REVIEW-FIX (`4c5e57c` WR-01, `c788407` IN-02, `5add7a3` IN-03, `51a7ee0` IN-04; IN-01 not_needed). Le unit test pertinenti passano (`npx jest src/quests/acceptance src/authz src/gameRules src/time src/models/quest-lanes.schema.spec.ts src/characters/characters.service.spec.ts --selectProjects unit`: 15 suite, 263 test). Le int-spec citate sono state lette, non rieseguite (le esegue l'orchestratore: 85 suite unit / 1264 test, 49 suite int / 610 test).

Esito: 39/39 chiuse (33 mitigated, 4 closed accepted, 2 closed transferred). Nessuna minaccia aperta.

Legenda: `mitigated` = mitigazione trovata nel codice e test che la esercita; `closed (accepted)` = rischio accettato e registrato sotto; `closed (transferred)` = trasferito, documentato.

## Trust Boundaries

| Boundary | Descrizione | Dati |
|----------|-------------|------|
| schema GraphQL -> client FE | ogni campo nuovo e leggibile dal client; lo stato interno della capienza non deve uscire | `Quest.registrations`, nomi interni |
| catalogo a DB (scritto dal GM) -> regole | `type`, `requiredPoints`, `minTitle`, `party`, marker decidono corsia, costo, posti | dati di catalogo non fidati |
| client -> `acceptQuest` / `serverTime` | `request.id` e `request.questId` sono input non fidati; corsia, costo e tempi non arrivano mai dal client | id esadecimali |
| bearer JWT -> guard owner-only | il ruolo `innkeeper` non apre il personaggio altrui in `acceptQuest` | identita autenticata |
| resolver -> service -> transazione | id gia autorizzati; Character, Quest, PendingQuest e User nella stessa sessione | saldi `twitchPoints` |
| DB -> payload GraphQL (query + subscription) | documenti popolati verso proprietario o innkeeper | corsie, `_id` quest |
| documentazione BE -> FE; CI -> branch | il handoff guida la FE; gli invarianti di CI proteggono contratto e regole | BACKEND-NOTES, schema |

## Riepilogo (threat register)

| ID | Categoria | Disp. | Status | Mitigazione (file:riga) | Test |
|----|-----------|-------|--------|-------------------------|------|
| T-07-01 | Info disclosure (`Quest.registrations`) | mitigate | mitigated | `src/models/quest/quest.model.ts:46-47` `registrations` senza `@Field`; `quest-registration.model.ts:1-20` nessun import `@nestjs/graphql` | `test/app.int-spec.ts:301` "writes the quest party into the generated schema" (`not.toContain('registrations')`) |
| T-07-02 | Tampering (contratto GraphQL) | mitigate | mitigated | `src/schema.gql`: `git diff origin/develop -- src/schema.gql` = 16 sole aggiunte, nessuna riga `^-` | `test/app.int-spec.ts:290,301,319` SDL esatti |
| T-07-03 | Tampering (catalogo `count`/titolo) | mitigate | mitigated | `src/models/quest/quest-party-slot.model.ts:9-15` `required`, `enum: Object.values(TitleType)`, `min: 1` | `src/models/quest-lanes.schema.spec.ts:61` "accepts only party slots with a known title and a positive count" |
| T-07-04 | Tampering (ref non castati) | mitigate | mitigated | `src/models/character/character-quests.model.ts:21,29` `MongooseSchema.Types.ObjectId` sulle corsie; `quest-registration.model.ts:9` su `registrations.character` | `quest-lanes.schema.spec.ts:10,78` (cast ObjectId) |
| T-07-05 | Tampering (corsia scelta dal client) | mitigate | mitigated | `src/quests/acceptance/quest-lanes.ts:18-22` `laneOf(type)` funzione del solo `QuestType`; `quest-acceptance.service.ts:111,214` nessuna firma riceve una corsia dal client; `AcceptQuestRequest` ha solo `id`, `questId` | `quest-lanes.spec.ts:20` "the lane table covers every QuestType" |
| T-07-06 | Elevation economica (costo assente) | mitigate | mitigated | `quest-eligibility.ts:103-120` `pointsCostOf`: non intero sicuro, <= 0 o > `MAX_QUEST_POINTS` = `'invalid'`; `quest-acceptance.service.ts:166-176` `costOrReject` lancia `QUEST_NOT_ACCEPTABLE` prima della transazione | `quest-eligibility.spec.ts:88-136` (null/0/-1/1.5/2**53/2147483648/NaN); `quest-acceptance.service.int-spec.ts:372` |
| T-07-07 | Tampering (overbooking party) | mitigate | mitigated | `quest-acceptance.updates.ts:72-110` `takenCountExpr` + `registrationFilter` con `$expr` e anti-duplicato nello stesso `findOneAndUpdate`; `quest-eligibility.ts:131-142` slot esatti, rango assente = 0; legacy contati con `$max` (fix WR-01 `4c5e57c`) | `quest-acceptance.updates.spec.ts:70,88,99`; `quest-acceptance.service.int-spec.ts:763,789,809,850,870` |
| T-07-08 | Tampering (personaggio spostato/archiviato fra lettura e scrittura) | mitigate | mitigated | `quest-acceptance.updates.ts:47-63` `laneClaimFilter`: `activeCharacterById`, corsia `null`, `status.title`, `status.location $in idForms`, `completedQuests $nin` | `quest-acceptance.updates.spec.ts:30,50`; `quest-acceptance.service.int-spec.ts:477` (claim rifiutato dal solo filtro, dopo la pre-verifica) |
| T-07-09 | Repudiation (codice di rifiuto non deterministico) | mitigate | mitigated | `quest-eligibility.ts:179-201` ordine fisso ripetibilita, titolo, corsia, capienza; `quest-acceptance.updates.ts:125-144` `classifyUnclaimed` con `meetsTitle` (fix IN-02 `c788407`) | `quest-eligibility.spec.ts:385,430,443`; `quest-acceptance.updates.spec.ts:164-250` |
| T-07-10 | Info disclosure (dettagli quest nel personaggio) | mitigate | mitigated | `src/characters/character-quests.populate.ts:7-20` `select: '_id'` su `quest` e su `completedQuests` | `src/characters/characters.service.spec.ts:428-449` `toEqual(CHARACTER_QUESTS_POPULATE)` |
| T-07-11 | Info disclosure (corsie altrui via `characterUpdated`) | accept | closed (accepted) | Rischio accettato, vedi registro: filtro per evento `mayReceiveCharacterEvent` (`character-access.policy.ts:121-137`) e guard di ownership invariati (Phase 3 D-04); il piano non tocca il resolver | `src/characters/character-updated.subscription.int-spec.ts:146,186` (nessuna consegna ad altri) |
| T-07-12 | DoS (ref orfano azzera il personaggio) | mitigate | mitigated | `character-quests.populate.ts:13-20` populate di path con ref orfano = `null`/scartato senza errore | `src/characters/character-quest-lanes.int-spec.ts:230` "turns a dangling lane into null and drops a dangling completed quest without errors" |
| T-07-13 | EoP (GM accetta e spende per altri) | mitigate | mitigated | `character-access.policy.ts:92-95` ramo innkeeper saltato con `ownerOnly`, poi `assertCharacterExists` + `notOwner`; `ownership.decorators.ts:35-39` opzione nei metadata; `ownership.guard.ts:43` la inoltra | `character-access.policy.spec.ts:100,114,126`; `ownership.guard.spec.ts:114,135`; `accept-quest.resolver.int-spec.ts:460` |
| T-07-14 | EoP (regressione bypass innkeeper) | mitigate | mitigated | `ownership.decorators.ts:39` default `options.ownerOnly ?? false`; `character-access.policy.ts:62,92` default `{}` = bypass invariato | `character-access.policy.spec.ts:80`; `ownership.guard.spec.ts:109` (`ownerOnly: false`); `src/authz` unit verdi |
| T-07-15 | Info disclosure (oracolo esistenza) | mitigate | mitigated | `character-access.policy.ts:94,167-176` il rifiuto passa da `assertCharacterExists` con `activeCharacterById` (archiviato = NOT_FOUND per tutti) | `character-access.policy.spec.ts:114` "reports a missing foreign character as not found...", `:169` |
| T-07-16 | DoS funz./Info disclosure (`pendingQuest(id)`) | mitigate | mitigated | `character-access.policy.ts:37-40,152-165` proprieta estesa alle tre corsie del solo personaggio del bearer (`QUEST_LANES`); altrui = `pendingQuestNotOwned` (`:117`) | `src/pendingQuests/pending-quests-authz.int-spec.ts:110,145,163`; `character-access.policy.spec.ts:235` |
| T-07-17 | EoP (nuova operazione pubblica per errore) | mitigate | mitigated | `src/time/server-time.resolver.ts:9-12` nessun `@Public`; conteggio `@Public()` produzione: `app.controller` 1, `auth.resolver` 2, `twitch-auth.controller` 3, `eventsub.controller` 1 (e `auth.guard` = lettura del metadata), nessuno in `src/time` o `src/quests` | `src/time/server-time.int-spec.ts:56`; `test/app.int-spec.ts:449` "rejects serverTime without a bearer", `:479` whitelist `@Public` |
| T-07-18 | Tampering (orologio client sposta la scadenza) | accept | closed (accepted) | Registro rischi accettati. `startDate` scritto dal server con `Clock` (`quest-acceptance.service.ts:137`, fix IN-03), `waitingTime` dal catalogo (`:138-141`) | `quest-acceptance.service.int-spec.ts:205` (startDate = `FixedClock`) |
| T-07-19 | Info disclosure (ora del server) | accept | closed (accepted) | Registro rischi accettati. `serverTime` autenticata, dato non sensibile | `server-time.int-spec.ts:39` |
| T-07-20 | Tampering (doppio click, doppio debito/corsia) | mitigate | mitigated | `quest-acceptance.service.ts:126-150` claim condizionale `[lane]: null` (`:210-236`), `pendingQuestModel.create` e debito come ultima scrittura nella stessa `connection.transaction` | `quest-acceptance.service.int-spec.ts:541` "lets exactly one of three concurrent story accepts win"; `:477` |
| T-07-21 | Tampering (overbooking party) | mitigate | mitigated | `quest-acceptance.service.ts:238-260` `register`: `registrationFilter` con `$expr` + anti-duplicato in un solo `findOneAndUpdate` nella sessione | `quest-acceptance.service.int-spec.ts:763,809,504` (rango pieno dopo la pre-verifica = `QUEST_FULL`) |
| T-07-22 | Elevation economica (quest a pagamento gratis) | mitigate | mitigated | `quest-eligibility.ts:107` standard sempre 0; `:108-111` story/worldMission `'invalid'` = rifiuto; `quest-acceptance.service.ts:112,148-149` costo da `pointsCostOf`, debito via `WalletService.debitUserPoints` (`wallet.service.ts:74-96`, `$gte` + `$inc` atomico); nessun `coins`/`$inc`/`twitchPoints` nel codice di produzione di `src/quests` (grep vuoto) | `quest-acceptance.service.int-spec.ts:372,326,251` |
| T-07-23 | Tampering (fuori citta, titolo sbagliato, non ripetibile gia fatta) | mitigate | mitigated | `quest-eligibility.ts:179-201`; `quest-acceptance.service.ts:189-208` `locationInQuestCity` fail-closed; `quest-acceptance.updates.ts:57-61` guard riaffermate nel claim | `quest-acceptance.service.int-spec.ts:590-690` (describe `eligibility`), `:692-741` (`city of the marker`) |
| T-07-24 | Tampering (stato parziale dopo rifiuto) | mitigate | mitigated | `quest-acceptance.service.ts:126-150` eccezioni di dominio (`claimLane`, `register`, debito) dentro il callback = abort; `:165` rifiuto del costo prima della transazione | `quest-acceptance.service.int-spec.ts:302,326,372,886` (corsia null, 0 PendingQuest, 0 registrazioni, punti invariati); `:477,504` |
| T-07-25 | Info disclosure (catalogo/id utente nei log) | mitigate | mitigated | `quest-acceptance.service.ts:172-174` WARN con il solo id quest e nome corsia; nessun altro log nel service | `quest-acceptance.service.int-spec.ts:346-367` (spy `Logger.prototype.warn`, 1 chiamata, messaggio verificato) |
| T-07-26 | Spoofing (debito su utente diverso) | transfer | closed (transferred) | Trasferito al guard owner-only (07-04/07-07): `quest-acceptance.resolver.ts:29-35` `ownerId` = `identity.userId` (bearer autenticato), mai dal client; ownership = `users.currentCharacter === request.id` (`character-access.policy.ts:87-91`); `currentCharacter` cambia solo con creazione/cancellazione transazionali (RESEARCH Q2) | `accept-quest.resolver.int-spec.ts:258` (debito sull'utente proprietario), `:495` |
| T-07-27 | EoP (innkeeper/altro giocatore accetta per altri) | mitigate | mitigated | `quest-acceptance.resolver.ts:17-20` `@OwnsCharacter(..., { ownerOnly: true })`; `ownerOnly: true` compare una sola volta in produzione (grep) | `accept-quest.resolver.int-spec.ts:460,495`; `test/app.int-spec.ts:500` "exposes exactly the enumerated owner-only handlers" |
| T-07-28 | Tampering (id malformati verso Mongo) | mitigate | mitigated | `quest-acceptance.resolver.ts:27-30` `objectIdFromHex` -> `ResourceNotFoundException`; `:33` `requireCharacterObjectId`; guard `character-access.policy.ts:85-86` `isObjectIdHex` | `accept-quest.resolver.int-spec.ts:449` (`it.each(REJECTIONS)` con quest e personaggio malformati = NOT_FOUND) |
| T-07-29 | Tampering (corsia/costo scelti dal client) | mitigate | mitigated | `src/models/request/accept-quest-request.model.ts:4-10` solo `id` e `questId` | `test/app.int-spec.ts:319` blocco `input AcceptQuestRequest` esatto |
| T-07-30 | Spoofing (mutation senza autenticazione) | mitigate | mitigated | `quest-acceptance.resolver.ts` nessun `@Public`; guard globale | `accept-quest.resolver.int-spec.ts:509` (UNAUTHENTICATED, 0 PendingQuest); `test/app.int-spec.ts:443`, whitelist `:479` |
| T-07-31 | Info disclosure (nomi interni nello schema) | mitigate | mitigated | `src/schema.gql`: grep `QuestAcceptance|twitchPointsDebit|INSUFFICIENT_FUNDS|registrations` = 0 | `test/app.int-spec.ts:319-334` `not.toMatch(...)` |
| T-07-32 | Repudiation (azione innkeeper non tracciata) | accept | closed (accepted) | Registro rischi accettati. Con `ownerOnly` l'innkeeper agisce solo sul proprio personaggio (`ResourceAccess.owner`), nessun on-behalf da tracciare | `accept-quest.resolver.int-spec.ts:460,482` (conteggio `AdminAuditLog` invariato) |
| T-07-33 | Info disclosure (corsia altrui via subscription) | mitigate | mitigated | Filtro per evento invariato: `character-access.policy.ts:121-137` `mayReceiveCharacterEvent` (fail-closed su errore); il resolver di subscription non e toccato dalla fase | `character-updated.subscription.int-spec.ts:146,186,198`; `accept-quest.resolver.int-spec.ts:524` (solo il proprietario riceve la corsia) |
| T-07-34 | Tampering (regressione contratto GraphQL) | mitigate | mitigated | `git diff origin/develop -- src/schema.gql`: 16 inserzioni, 0 righe rimosse (verificato in audit) | `test/app.int-spec.ts:290-334` SDL esatti |
| T-07-35 | EoP (secondo owner-only mancante / `@Public` aggiunto) | mitigate | mitigated | un solo `ownerOnly: true` in produzione (`quest-acceptance.resolver.ts:19`); `@Public()` invariati (vedi T-07-17) | `test/app.int-spec.ts:479,500` |
| T-07-36 | Elevation economica (monete/`$inc` diretto) | mitigate | mitigated | grep `coins|\$inc|costCopper|applyCharacterCoinsDelta|twitchPoints` su `src/quests` (esclusi spec) = vuoto; l'unico debito passa da `WalletService.debitUserPoints` (`quest-acceptance.service.ts:149`) | invariante di codice + `quest-acceptance.service.int-spec.ts:205,231` |
| T-07-37 | Info disclosure (stato interno nello schema) | mitigate | mitigated | come T-07-31 (grep = 0 su `src/schema.gql`) | `test/app.int-spec.ts:319-334` |
| T-07-38 | Tampering lato FE (costo per tipi che non costano, countdown su clock device) | transfer | closed (transferred) | `BACKEND-NOTES.md` §5 (offset `serverTime`, riga 172-177), §6 (`requiredPoints` solo story/worldMission, riga 187), §7 (emendamento FE QUEST-05); l'applicazione e della FE Phase 6. Il BE ignora comunque `requiredPoints` sui tipi standard (`quest-eligibility.ts:107`) | n/a (processo FE); `quest-acceptance.service.int-spec.ts:251` |
| T-07-39 | Info disclosure (segreti/dati reali nel handoff) | mitigate | mitigated | grep su `BACKEND-NOTES.md` di stringhe di connessione `mongodb://`, `Bearer ...`, JWT `eyJ`, `secret` = vuoto; solo nomi, placeholder e conteggi del catalogo | acceptance grep (rieseguito in audit) |

## Residui e note

- **WR-01 (capienza legacy)**: il fix `4c5e57c` ha chiuso un gap di T-07-07/T-07-21 (overbooking sui `registeredAdventurers` legacy). Verificato sia nel guard `$expr` (`quest-acceptance.updates.ts:76-82`) sia nella pre-verifica (`quest-eligibility.ts:153-156`), con test unit e int (`quest-acceptance.service.int-spec.ts:850,870`).
- **IN-02/IN-03/IN-04**: `classifyUnclaimed` usa `meetsTitle` (codice di rifiuto coerente, T-07-09); `startDate` dal `Clock` iniettato (`quest-acceptance.module.ts:34`); i due test di transazione (`quest-acceptance.service.int-spec.ts:477,504`) provano che il filtro, non la pre-verifica, regge la corsa (T-07-08, T-07-20, T-07-21).
- **IN-01 not_needed**: `City.pointsOfInterest` e un array castato a ObjectId, nessun rischio di mancato match; nessuna azione.
- **Residuo `perRank` con legacy**: nei dati legacy senza `registrations` una quest con `party` non conta gli id legacy per rango (hanno nessun titolo). Comportamento voluto e documentato (`quest-eligibility.ts:144`, `quest-eligibility.spec.ts:284`); mitigato dal fatto che il catalogo reale ha party vuoti o quest nuove. Nessuna azione.
- **Rate limit** su `acceptQuest`: fuori ambito della fase (Phase 10); l'anti-abuso dell'azione poggia sulla transazione atomica e sul costo in punti.

## Registro dei rischi accettati

| ID | Rischio | Motivazione | Condizione di revisione |
|----|---------|-------------|--------------------------|
| T-07-11 | Le corsie nel payload di `characterUpdated` potrebbero raggiungere un altro utente | Il filtro per evento `mayReceiveCharacterEvent` e il guard di ownership della subscription sono invariati dalla Phase 3 (D-04) e sono coperti dalle int-spec esistenti; la fase aggiunge solo campi `_id` per quest (T-07-10) | Se il resolver di `characterUpdated` viene modificato |
| T-07-18 | Un client che manipola l'orologio sposta il countdown visualizzato | Il countdown e solo visuale; `startDate` e `waitingTime` li scrive il server (Clock iniettato) e nessuna azione dipende dalla scadenza in questa fase (D-17) | Quando una fase futura rende la scadenza vincolante (Phase 8/9) |
| T-07-19 | Esposizione dell'ora del server | Dato non sensibile, gia deducibile dagli header HTTP; query autenticata | Mai, salvo cambio di natura del dato |
| T-07-32 | Azione dell'innkeeper non tracciata in `admin_audit_logs` | Con `ownerOnly` l'innkeeper agisce solo sul proprio personaggio: non esiste un'azione on-behalf da tracciare (D-11) | Se `acceptQuest` torna accessibile on-behalf |

## Trasferimenti

| ID | Destinatario | Documento |
|----|--------------|-----------|
| T-07-26 | Guard owner-only (07-04, 07-07), stessa fase | `quest-acceptance.resolver.ts:17-35`, RESEARCH Q2 |
| T-07-38 | FE Phase 6 | `BACKEND-NOTES.md` §5-§7 |

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-21 | 39 | 39 | 0 | gsd-security-auditor (Claude) |

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter
