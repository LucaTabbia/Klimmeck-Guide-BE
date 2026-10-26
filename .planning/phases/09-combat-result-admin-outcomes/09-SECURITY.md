---
phase: 09-combat-result-admin-outcomes
audited: 2026-10-24
status: verified
asvs_level: 1
block_on: high
threats_total: 82
threats_mitigated: 79
threats_accepted: 2
threats_transferred: 1
threats_open: 0
threats_open_blocking: 0
open_ids: []
---

# Phase 09 - Security Audit (Combat Result & Admin Outcomes)

Verifica a posteriori dei blocchi `<threat_model>` dei piani 09-01 ... 09-16 sul codice finale del branch `feat/09-combat-result-admin-outcomes` (HEAD `206f5fa`), inclusi i fix di 09-REVIEW-FIX (WR-01 `participantOf` dagli stessi `StatusFacts`, WR-02 sweeper che attende lo sweep in corso, WR-03 risposta di `completePendingRequest` dalle bozze in transazione, IN-03, IN-07, IN-08 tetto di 50 voci).

Verifiche eseguite in questo audit:
- `npm run build` exit 0; `grep -cw 'kind\|grade\|TravelKind' src/schema.gql` = 0; `git diff origin/develop -- src/schema.gql | grep '^-[^-]'` = vuoto (contratto solo additivo); `concludedAt` e `rescue` assenti dallo schema.
- Unit rieseguite: `npx jest src/quests src/queues src/models src/gameRules src/config src/travel src/characters src/economy src/mongo --selectProjects unit --runInBand` = 68 suite, 1110 test verdi.
- Integration rieseguite (`--runInBand`): `test/app.int-spec.ts` + `src/quests/results` + `src/quests/pending-requests` = 6 suite, 72 test verdi; `src/quests/outcomes` + `src/quests/acceptance` + `src/characters/deletion` + `src/economy` = 16 suite, 259 test verdi.
- Invarianti per grep: `@Public()` in produzione = 8, nessuna riga `@Public` nel diff vs `origin/develop`; 3 `@Roles(RoleType.innkeeper)` in `pending-requests.resolver.ts:24,31,45`; `Math.random` in produzione solo in `chance-source.ts:12` (e `random-source.ts:11`, scelta della citta di partenza preesistente, non di Phase 9); `$inc` sui saldi solo in `wallet.service.ts:83,107` (gli altri `$inc` sono gli usi delle magie, Phase 4); `PROVVISORIO|SEGNAPOSTO` in 2 file di produzione (`placeholder-combat-resolver.ts`, `injury-rules.ts`); unico scrittore di `status.level`/`status.maxLifePoints` = `outcome-plan.ts:309-310`; `.env` non letto, nessun segreto nel diff (`.env.example` +5 righe, variabile `QUEST_SWEEP_INTERVAL_MS` vuota e documentata).

Esito: 82/82 chiuse (79 mitigated, 2 closed accepted, 1 closed transferred). Nessuna minaccia aperta, nessuna bloccante.

Legenda: `mitigated` = mitigazione trovata nel codice e test che la esercita; `closed (accepted)` = rischio accettato e registrato sotto; `closed (transferred)` = trasferito, documentato.

## Trust Boundaries

| Boundary | Descrizione | Dati |
|----------|-------------|------|
| client -> GraphQL (`questResult`, `questResultReceived`) | owner-only per UTENTE del risultato, anche dopo la morte; l'innkeeper non ha bypass | id risultato, `characterId` |
| client -> `pendingRequests` / `pendingRequestsUpdated` / `completePendingRequest` | solo `@Roles(innkeeper)` con audit; override opzionali validati prima di ogni scrittura, tetto 50 voci | `pendingQuestId`, override HP/ferite/consumi/magie |
| bearer JWT -> whitelist del real boot | handler innkeeper, ownership e owner-only enumerati; nessun `@Public` nuovo | metadata dei resolver |
| Redis/Bull -> processor | i dati del job sono input non fidato; il job e solo un trigger, decide il DB | `pendingQuestId`, `startDate`, `waitingTime`, `aidQuestId`, `since` |
| sweep -> DB | single-flight, in serie, solo corsia standard, stop pulito allo shutdown | PendingQuest scadute, aid oltre 7 giorni |
| resolver segnaposto -> esito | HP in `1..max`, XP clamp 50 000, un solo scrittore di `level`/`maxLifePoints`, RNG solo da `ChanceSource` | `ParticipantOutcome` |
| servizio -> transazione Mongo | esito, archivio (morte), aid, risultati e cancellazione PendingQuest nella stessa sessione; push e job solo dopo il commit | stato di gioco |
| catalogo a DB (scritto a mano) -> regole | premi, nemico, magie, rarita, ref orfani: dati non fidati, tollerati, mai bloccanti per la corsia o per `quests` | catalogo |
| env -> boot | `QUEST_SWEEP_INTERVAL_MS` validata, messaggio senza valore | configurazione |
| `WalletService` -> saldi | unico scrittore dei saldi, nella stessa sessione dell'esito | coins del personaggio |
| documentazione BE -> FE; CI -> branch | BACKEND-NOTES guida la FE e l'operatore; gli invarianti di CI proteggono contratto e whitelist | BACKEND-NOTES, schema.gql |

## Riepilogo (threat register)

| ID | Categoria | Sev. | Disp. | Status | Mitigazione (file:riga) | Test |
|----|-----------|------|-------|--------|-------------------------|------|
| T-09-01 | Tampering (client imposta `awaitingAid`) | high | mitigate | mitigated | `src/models/character/character-status.model.ts:34-36` `awaitingAid` solo sulla classe ObjectType; l'`@InputType` (righe 76-102) non lo contiene | `awaiting-aid.schema.spec.ts`; SDL esatto `test/app.int-spec.ts:394` |
| T-09-02 | Info disclosure (`concludedAt`, `rescue`) | med | mitigate | mitigated | `quest.model.ts` `concludedAt`/`rescue` solo `@Prop`, nessun `@Field`; `grep` su `src/schema.gql` vuoto | `test/app.int-spec.ts:443` `not.toMatch(/concludedAt\|\brescue\b\|\bgrade\b/)`; `quest-outcome-fields.schema.spec.ts` |
| T-09-03 | Tampering (contratto GraphQL) | high | mitigate | mitigated | verificato in questo audit: `git diff origin/develop -- src/schema.gql` senza righe rimosse | blocchi SDL esatti `test/app.int-spec.ts:436-470` |
| T-09-04 | Tampering (ref non castati) | med | mitigate | mitigated | `quest-rescue.model.ts`, `awaiting-aid.model.ts`, `quest-result.model.ts:20,77,86` `MongooseSchema.Types.ObjectId` | `awaiting-aid.schema.spec.ts`, `quest-outcome-fields.schema.spec.ts`, `quest-result.schema.spec.ts` (`instance === 'ObjectId'`) |
| T-09-05 | Elevation (slot magia oltre il rango) | med | mitigate | mitigated | `active-spell-slots.ts` `isSpellCaster` + `maxActiveSpellsExpression` usata nel filtro (`active-spell.updates.ts:25`) e `maxActiveSpellsFor` nel virtual (`character-status.model.ts:70`) | `equip-spell.int-spec.ts:252` 'rejects equipSpell below the mage rank', `:384` parita espressione xp x titolo |
| T-09-06 | Tampering (enum di esito non valido) | low | mitigate | mitigated | `quest-result.model.ts:94` `enum: Object.values(QuestOutcome)`, `required: true` | `quest-result.schema.spec.ts` |
| T-09-07 | Tampering (XP fuori tetto / negativa) | high | mitigate | mitigated | `level-table.ts:63` `Math.min(MAX_XP, nonNegative(...))`, `:52` `lifePointsWithin` | `level-table.spec.ts` |
| T-09-08 | Tampering (HP iniziali divergenti) | med | mitigate | mitigated | `starting-character.ts:9` `STARTING_LIFE_POINTS = LEVEL_TABLE[0].maxLifePoints` | `starting-character.spec.ts` |
| T-09-09 | Elevation (titolo saltato) | med | mitigate | mitigated | `title-progression.ts:14` avanza solo con titolo esatto; ordine da `TITLE_RANK` | `title-progression.spec.ts` |
| T-09-10 | Info disclosure (messaggi con dati) | low | mitigate | mitigated | `game-rule.exception.ts` messaggi costanti senza parametri (factory statiche) | `game-rule.exception.spec.ts` (tabella) |
| T-09-11 | Tampering (premio malformato) | high | mitigate | mitigated | `quest-rewards.ts:68-85` `rewardItemOf` (itemType dell'enum, ref valido, quantita intera >= 1), `:144` `drawRewards` con presenza nel catalogo e coins interi >= 0 | `quest-rewards.spec.ts` |
| T-09-12 | DoS (ref orfani bloccano l'esito) | med | mitigate | mitigated | `quest-rewards.ts:106-115` `catalogued` scarta gli orfani, nessuna eccezione | `quest-rewards.spec.ts` (orfano) |
| T-09-13 | Tampering (piu di un oggetto dal loot) | med | mitigate | mitigated | `cascading-loot.ts:31` ritorna al primo successo, al massimo un oggetto | `cascading-loot.spec.ts` |
| T-09-14 | Tampering (aid ripetibile o con costo) | med | mitigate | mitigated | `aid-quest.ts:78` `requiredPoints: null`, un posto jolly, `registeredAdventurers: []`, `concludedAt: null` | `aid-quest.spec.ts` |
| T-09-15 | Repudiation (morte con soccorso in corso) | med | mitigate | mitigated | `aid-timeout.ts:8` `AID_TIMEOUT_REQUIRES_NO_RESCUER` nel claim `aidTimeoutClaimFilter` | `aid-timeout.spec.ts`; `aid-timeout.int-spec.ts:162` '(C5)' |
| T-09-16 | Tampering (malus che azzerano) | low | mitigate | mitigated | `injury-rules.ts:80` `MIN_INJURY_FACTOR = 0.1`, `Math.max` su ogni fattore | `injury-rules.spec.ts` |
| T-09-17 | Tampering (resolver uccide o cura oltre il massimo) | high | mitigate | mitigated | `placeholder-combat-resolver.ts:37` `clampLifePoints` (1..max) e di nuovo `outcome-plan.ts` `lifePointsWithin(battle.hpAfter, ...)` | `placeholder-combat-resolver.spec.ts` (proprieta su sequenze) |
| T-09-18 | DoS (danni malformati) | med | mitigate | mitigated | `combat-context.ts:90` `normalizeDamages` (singolo -> array, power non numerico scartato) | `combat-context.spec.ts` |
| T-09-19 | Tampering (esito non deterministico) | low | mitigate | mitigated | RNG solo da `ChanceSource` (`chance-source.ts:12` unico `Math.random`) | grep di audit; spec con `SequenceChance` |
| T-09-20 | Elevation (regole nascoste altrove) | low | mitigate | mitigated | `grep -rlE 'PROVVISORIO\|SEGNAPOSTO' src` = 2 file di produzione | grep di audit |
| T-09-21 | Tampering (doppia ricompensa) | high | mitigate | mitigated | `outcome-plan.ts:238-249` `participantFilter` (corsia = PendingQuest attesa + `status.xp` snapshot); `outcome-writer.service.ts:97-99` 0 match => `StaleResolution` | `outcome-plan.spec.ts`; `quest-resolution.service.int-spec.ts` (duplicato/concorrente) |
| T-09-22 | Tampering (HP a 0 / XP oltre tetto) | high | mitigate | mitigated | `outcome-plan.ts:267-275` `lifePointsWithin` + `progressionAfter`; `level-table.ts:52,63` | `outcome-plan.spec.ts` caso 3 |
| T-09-23 | Tampering (consumi/usi oltre il posseduto) | med | mitigate | mitigated | `outcome-plan.ts:147` `consumablesSpent`, `:189` `spellsSpent` clamp al posseduto; `applyTradeToInventory` | `outcome-plan.spec.ts` casi 8, 9 |
| T-09-24 | Elevation (titolo senza story) | med | mitigate | mitigated | `outcome-plan.ts:278-282` solo `won && type === story`, titolo esatto | `outcome-plan.spec.ts` caso 11 |
| T-09-25 | Tampering (premi al fallito) | med | mitigate | mitigated | `outcome-plan.ts:252` `won`; premi, XP e `completedQuests` condizionati a `won`; `combatant-plan.ts` `NO_REWARDS` se perde | `outcome-plan.spec.ts` caso 4 |
| T-09-26 | Tampering (aid riproposta / vinta sulla board) | med | mitigate | mitigated | `quest-outcome-plan.ts:14-41` `questUpdateOf`: aid sempre conclusa, registrata conclusa con >= 1 vincitore | `quest-outcome-plan.spec.ts` |
| T-09-27 | Info disclosure (IDOR su `questResult`) | high | mitigate | mitigated | `quest-results.resolver.ts:23` `@OwnsQuestResult`; `character-access.policy.ts:133-147` `authorizeQuestResult` confronta `result.user` con l'identita, nessun bypass innkeeper; 404 id malformato/inesistente, 403 altrui | `quest-result.resolver.int-spec.ts` (proprietario, dopo la morte, senza bearer); `character-access.policy.spec.ts`; whitelist `test/app.int-spec.ts:100` |
| T-09-28 | Info disclosure (subscription che fa trapelare risultati) | high | mitigate | mitigated | `quest-results.resolver.ts:30-47` `@OwnsCharacter(..., { ownerOnly: true })` alla subscribe + filtro per evento su `user` E `character` (confronto stringa, fail-closed) | `quest-result-received.subscription.int-spec.ts:170,180,188` |
| T-09-29 | DoS (ref orfani azzerano il risultato) | med | mitigate | mitigated | `quest-result.populate.ts` `dropOrphanResultRefs`, `spellLearned`/`enemy`/`spell` nullable (`quest-result.model.ts:39,157,165`) | `quest-result.resolver.int-spec.ts:211` 'drops orphan items and nulls orphan spells and enemy' |
| T-09-30 | Repudiation (risultato di morte non consegnato) | med | mitigate | mitigated | filtro su `result.user` (non su `currentCharacter`), `quest-results.resolver.ts:41-46` | `quest-result-received.subscription.int-spec.ts:196`; `quest-result.resolver.int-spec.ts:256` |
| T-09-31 | Elevation (handler non enumerato o pubblico) | high | mitigate | mitigated | whitelist `test/app.int-spec.ts:62-103` (innkeeper 9, ownership 14, owner-only 5, public 6); `@Public` invariati (8, diff 0) | `test/app.int-spec.ts` (verde) |
| T-09-32 | Info disclosure (log con documenti) | low | mitigate | mitigated | `quest-results.publisher.ts` log con solo id e `error.name` | revisione del codice |
| T-09-33 | Info disclosure (adventurer legge la coda) | high | mitigate | mitigated | `pending-requests.resolver.ts:24,31` `@Roles(RoleType.innkeeper)` su query e subscription; whitelist `test/app.int-spec.ts:73-75` | `pending-requests.resolver.int-spec.ts` (FORBIDDEN HTTP e WS); `test/app.int-spec.ts` |
| T-09-34 | DoS (raffica di delete) | med | mitigate | mitigated | `pending-requests.publisher.ts:62-70` `requestRefresh` single-flight con rerun (`dirty`/`draining`) | `pending-requests.publisher.spec.ts` |
| T-09-35 | DoS (dato incompleto rompe la lista) | med | mitigate | mitigated | `pending-requests.builder.ts:114` `buildPendingRequests` salta le voci incomplete (`skipped`), WARN con soli id in `pending-requests.service.ts` | `pending-requests.builder.spec.ts`; `pending-requests.service.int-spec.ts` |
| T-09-36 | Info disclosure (twitchId/nomi nei log) | low | mitigate | mitigated | `pending-requests.service.ts` WARN con `characterId` e `pendingQuestId` | `pending-requests.service.int-spec.ts` (spia warn) |
| T-09-37 | Elevation (ferito che viaggia o accetta in corsa) | high | mitigate | mitigated | `travel.updates.ts:44` e `quest-acceptance.updates.ts:53` `'status.awaitingAid': null` nel filtro; pre-verifica `quest-eligibility.ts:155-156`; rilettura solo per il codice (`classifyUnstarted`, `classifyUnclaimed`) | `travel.updates.spec.ts`, `quest-acceptance.updates.spec.ts`, `quest-acceptance.service.int-spec.ts`, `travel.service.int-spec.ts` |
| T-09-38 | Tampering (registrazione su quest conclusa) | high | mitigate | mitigated | `quest-acceptance.updates.ts:98` `concludedAt: null` in `registrationFilter`; `quest-acceptance.service.ts:232` `readQuest` con lo stesso filtro | `quest-acceptance.service.int-spec.ts` (quest conclusa) |
| T-09-39 | Info disclosure (quest concluse visibili) | low | mitigate | mitigated | `quests.service.ts:19-21` `find({ concludedAt: null })` e `findOne` con lo stesso filtro | `quests.resolver.int-spec.ts` |
| T-09-40 | DoS (`prizes.spell` orfana annulla `quests`) | med | mitigate | mitigated | `quest-prizes.model.ts` `spell` nullable; `quest-catalog.populate.ts` ref orfano -> null | `quests.resolver.int-spec.ts` |
| T-09-41 | Elevation (teleport del GM bloccato) | low | accept | closed (accepted) | Registro rischi accettati; `teleportFilter` non modificato (D-07) | `teleport.resolver.int-spec.ts` |
| T-09-42 | Tampering (negozio fuori citta) | high | mitigate | mitigated | `shop-transaction.service.ts:126-143` `shopLocationOrReject` (marker di citta, niente viaggio, niente `awaitingAid`), invocata in sessione (`:162`); filtro di scrittura `:196` | `shop-transaction.service.int-spec.ts`; `do-transaction.int-spec.ts` (SHOP_NOT_IN_CITY) |
| T-09-43 | Tampering (corsa fra pre-verifica e scrittura) | med | mitigate | mitigated | `shop-transaction.service.ts:190-198` `writeInventory` con `status.location`, `activeTravel: null`, `awaitingAid: null` nel filtro, stessa sessione | `shop-transaction.service.int-spec.ts`; acceptance grep di 09-09 |
| T-09-44 | Info disclosure (oracolo di esistenza via codici) | low | accept | closed (accepted) | Registro rischi accettati; ordine catalogo -> personaggio -> citta come Phase 4 | caso `ITEM_NOT_FOUND` fuori citta |
| T-09-45 | DoS (Redis giu blocca accettazione o arrivo) | high | mitigate | mitigated | `enqueue-trigger.ts:27-52` `withinTimeout` + catch, nessuna compensazione; `queue-call-timeout.ts` timer `unref` | `quest-resolution.scheduler.spec.ts` (failAdd, hangAdd); `travel-completion.int-spec.ts` (failAdd) |
| T-09-46 | Tampering (dati job manipolati) | med | mitigate | mitigated | `quest-resolution-job.ts:45-75` `resolveQuestJobDataOf`/`aidTimeoutJobDataOf` (id esadecimale canonico, `isEpochMs` = `isSafeInteger >= 0`) | `quest-resolution-job.spec.ts` |
| T-09-47 | Tampering (story/worldMission risolte da sole) | high | mitigate | mitigated | `quest-acceptance.service.ts:197-198` accodamento solo per `QuestLane.standard`; `quest-resolution.updates.ts:13` pipeline sulla sola corsia standard | `quest-resolution.updates.spec.ts`; `quest-acceptance.service.int-spec.ts` |
| T-09-48 | DoS (env malformata) | low | mitigate | mitigated | `sweep-interval.ts:7-20` `^\d+$` e max 2^31-1, boot rifiutato; messaggio senza valore; `env.validation.ts:17` | `quest-config.spec.ts` |
| T-09-49 | Tampering (job dentro la transazione duplicati ai WriteConflict) | med | mitigate | mitigated | `quest-acceptance.service.ts:196-199` accodamento dopo il commit; stato di uscita azzerato a ogni riesecuzione nei servizi (`outcome.committed = null`) | acceptance criteria 09-10; `quest-acceptance.service.int-spec.ts` |
| T-09-50 | Tampering (archivio senza esito: transazione annidata) | high | mitigate | mitigated | `character-archiver.ts:36` `archiveWithin(session, ...)` senza transazione propria | `character-archiver.int-spec.ts:188` 'writes nothing when the caller transaction aborts after archiving' |
| T-09-51 | Tampering (archivio del personaggio sbagliato) | high | mitigate | mitigated | `character-archiver.ts:41-51` `currentCharacter: { $in: idForms(characterId) }`, altrimenti `'not-linked'` senza scritture | `character-archiver.int-spec.ts:209,229` |
| T-09-52 | DoS (aid orfane dopo cancellazione) | low | mitigate | mitigated | `character-archiver.ts:72-96` `releaseQuestsOf` chiude le aid con `rescue.character` | `character-archiver.int-spec.ts:148`; `character-deletion.resolver.int-spec.ts` |
| T-09-53 | Repudiation (regressione del contratto 03.1) | med | mitigate | mitigated | `character-deletion.service.ts` `archiveCurrentCharacter` mantiene `CHARACTER_NOT_FOUND`/`UNAUTHENTICATED` (`rejectUnlinked`) | `character-deletion.resolver.int-spec.ts` (verde) |
| T-09-54 | Tampering (doppia ricompensa individuale) | high | mitigate | mitigated | `resolution-loader.service.ts:201-217` `snapshotInSession` con filtro di corsia; `outcome-writer.service.ts:131` `deletePendingQuest` con `deletedCount`; `StaleResolution` => no-op (`quest-resolution.service.ts`); `resolveIndividual` rimosso, unico ingresso `resolveStandard` | `quest-resolution.service.int-spec.ts` (duplicato, concorrente) |
| T-09-55 | Tampering (risoluzione prima della scadenza) | high | mitigate | mitigated | `resolution-loader.service.ts:159-176` `startDate` del trigger = persistita, `dueAt > now` dal `Clock` => `waiting` | `quest-resolution.service.int-spec.ts` (in anticipo, obsoleto) |
| T-09-56 | Repudiation (push duplicate / transazione abortita) | med | mitigate | mitigated | `quest-resolution.service.ts:149` `deliver` solo dopo il commit e solo da chi ha committato | `quest-resolution.service.int-spec.ts` (una sola push sotto concorrenza) |
| T-09-57 | Info disclosure (push al proprietario sbagliato) | med | mitigate | mitigated | `outcome-writer.service.ts:156` push a `result.user`, payload `questEnd(resultId)` solo id; proprietario letto da `ownersOf` e verificato dal filtro del personaggio | `quest-resolution.service.int-spec.ts` caso 1 |
| T-09-58 | DoS (nemico orfano blocca la corsia) | med | mitigate | mitigated | `resolution-loader.service.ts` `readEnemy` => missione senza nemico + WARN di soli id; `combatant-plan.ts:45` contesto null => successo | `quest-resolution.service.int-spec.ts` caso 2 |
| T-09-59 | DoS (Redis giu blocca l'esito) | med | mitigate | mitigated | `outcome-writer.service.ts:171-195` `scheduleSpellRecovery` e `scheduler.scheduleAidTimeout` con `withinTimeout`, solo dopo il commit, senza compensazione | `quest-resolution.service.int-spec.ts` caso 7; `aid-timeout.int-spec.ts` |
| T-09-60 | Tampering (HP a 0 dal resolver) | high | mitigate | mitigated | `outcome-plan.ts:267` `lifePointsWithin` (>= 1) sul piano dell'esito | `outcome-plan.spec.ts`; `quest-combat.int-spec.ts` caso 3 |
| T-09-61 | Tampering (boss risolto due volte o a meta) | high | mitigate | mitigated | `boss-resolution.service.ts:197-262` una transazione per gruppo; claim `questClaimFilter` (`$all` + `$size`, `quest-outcome-plan.ts:45`) e corsia di ogni partecipante nello snapshot in sessione | `boss-resolution.int-spec.ts` casi 2, 4 |
| T-09-62 | DoS (registrato incoerente blocca il gruppo) | med | mitigate | mitigated | `boss-resolution.service.ts` `readRoster` + `dropped`, `$pull` nello stesso update (`questUpdateOf`), WARN con soli id | `boss-resolution.int-spec.ts` caso 5 |
| T-09-63 | Tampering (morte senza esito) | high | mitigate | mitigated | `rescue-resolution.service.ts:412` `dieWithin` => `archiver.archiveWithin(session, ...)` nella stessa sessione; `timeoutAid` (`:190`) idem | `aid-rescue.int-spec.ts` caso 3; `aid-timeout.int-spec.ts:117` |
| T-09-64 | Tampering (morte di personaggio non collegato) | high | mitigate | mitigated | `rescue-resolution.service.ts` `ownerInSession` + `archiveWithin` con filtro utente `currentCharacter ∈ idForms`; `'not-linked'` => nessun risultato, no-op loggato | `aid-rescue.int-spec.ts` caso 4; `aid-timeout.int-spec.ts:247` |
| T-09-65 | Repudiation (timeout con soccorso in corso) | med | mitigate | mitigated | `rescue-resolution.service.ts` `aidTimeoutSuspended` + claim `aidTimeoutClaimFilter` con `registeredAdventurers: { $size: 0 }` | `aid-timeout.int-spec.ts:162`; `quest-resolution.sweeper.int-spec.ts:223` |
| T-09-66 | Tampering (cura indebita al soccorso) | low | mitigate | mitigated | `rescue-plan.ts:74-90` `planRescued` imposta solo `status.awaitingAid: null` e la posizione, HP invariati | `aid-rescue.int-spec.ts` caso 1; `rescue-plan.spec.ts` |
| T-09-67 | Tampering (job manipolato o anticipato) | high | mitigate | mitigated | `quest-resolution.processor.ts:35-52,79-85` parser fail-closed, `isEarly` contro `clock.now()`, il servizio rilegge il DB | `quest-resolution.processor.int-spec.ts` (malformato, in anticipo) |
| T-09-68 | Tampering (sweep risolve story/worldMission) | high | mitigate | mitigated | `quest-resolution.updates.ts:13-43` pipeline `$match` su `quests.pendingQuest` (corsia standard) | `quest-resolution.sweeper.int-spec.ts` (story e worldMission intatte) |
| T-09-69 | DoS (tempesta di sweep) | med | mitigate | mitigated | `quest-resolution.sweeper.ts` single-flight (`inFlight ??=`), cicli in serie, `setInterval(...).unref()`, `0` = spento; WR-02: `onModuleDestroy` `:68-73` attende lo sweep e `stopping` ferma i cicli | `quest-resolution.sweeper.spec.ts` (3 casi WR-02) |
| T-09-70 | DoS (job persi per eviction Redis) | med | mitigate | mitigated | `quest-resolution.sweeper.ts` reconciler al boot (`onApplicationBootstrap`) + sweep periodico; `quest-resolution.updates.ts:46-52` `dueAidTimeoutsFilter` | `quest-resolution.sweeper.int-spec.ts` ('covers a lost job') |
| T-09-71 | Info disclosure (log con documenti o messaggi) | low | mitigate | mitigated | `mongo-errors.ts:21-25` `describeError` (nome e codice); log con soli id | revisione del codice |
| T-09-72 | Elevation (adventurer completa le richieste) | high | mitigate | mitigated | `pending-requests.resolver.ts:45` `@Roles(RoleType.innkeeper)`; whitelist `test/app.int-spec.ts:71` | `complete-pending-request.resolver.int-spec.ts` (FORBIDDEN); `test/app.int-spec.ts:62-103` |
| T-09-73 | Tampering (override crea oggetti, XP, premi) | high | mitigate | mitigated | `complete-pending-request.model.ts` input con soli HP/ferite/consumi/magie; `gm-overrides.ts:127-137` consumi e magie entro lo snapshot; premi sempre `drawRewards` dal catalogo (`gm-completion.service.ts`) | `gm-overrides.spec.ts`; acceptance grep sull'input |
| T-09-74 | Tampering (scritture parziali con override non valido) | high | mitigate | mitigated | `gm-completion.service.ts:112,252` `validateOverrides` prima della transazione e di nuovo sugli snapshot in sessione, errore tipizzato => abort; tetto `gm-overrides.ts:27` `MAX_OVERRIDE_ENTRIES = 50` (IN-08) | `gm-completion.service.int-spec.ts` caso 3; `gm-overrides.spec.ts:188` 'caps every override list' |
| T-09-75 | Repudiation (completamento non tracciato) | med | mitigate | mitigated | audit automatico dell'handler `@Roles(innkeeper)` (actor, args, outcome); target `QuestResult` con id null documentato (BACKEND-NOTES §9), `pendingQuestId` in `args.input` | `complete-pending-request.resolver.int-spec.ts` (audit `ok`, anche WR-03) |
| T-09-76 | Tampering (doppio completamento) | med | mitigate | mitigated | `gm-completion.service.ts:127` perdente => `ResourceNotFoundException.pendingQuest()`; `deletePendingQuest` con `deletedCount` e filtri di corsia in transazione | `gm-completion.service.int-spec.ts` caso 6 |
| T-09-77 | Info disclosure (corsia standard o id indovinati) | low | mitigate | mitigated | `gm-completion.service.ts:132-166` `readRequest`: solo PendingQuest delle corsie GM (`isGmLane`), id malformato/inesistente/standard => `NOT_FOUND` | `gm-completion.service.int-spec.ts` caso 4; `complete-pending-request.resolver.int-spec.ts` |
| T-09-78 | Tampering (regressione contratto GraphQL) | high | mitigate | mitigated | verificato in questo audit: diff `src/schema.gql` vs `origin/develop` senza righe rimosse, `kind\|grade\|TravelKind` = 0 | `test/app.int-spec.ts:436-470` SDL esatti |
| T-09-79 | Elevation (handler mancanti o `@Public` aggiunto) | high | mitigate | mitigated | `@Public()` invariati (8, diff 0), 3 `@Roles` nella coda, whitelist del real boot verde | `test/app.int-spec.ts:62-103` |
| T-09-80 | Tampering (formula sparsa fuori dai segnaposto) | med | mitigate | mitigated | grep `PROVVISORIO\|SEGNAPOSTO` = 2 file; unico scrittore di `level`/`maxLifePoints` = `outcome-plan.ts:309-310` | grep di audit |
| T-09-81 | Info disclosure (segreti/id reali nel handoff) | low | mitigate | mitigated | BACKEND-NOTES: nessuna stringa ObjectId a 24 esadecimali, nessuna URI, solo placeholder `<...>`; `.env.example` +5 righe con variabile vuota | grep di audit |
| T-09-82 | DoS (dati di catalogo non adattati) | med | transfer | closed (transferred) | Trasferimenti: BACKEND-NOTES §12 (comandi `mongosh` esatti con placeholder); il codice tollera gli orfani (C6, `resolution-loader.service.ts` `readEnemy`) | BACKEND-NOTES §12 |

## Threat Flags (SUMMARY)

Tutti i `## Threat Flags` presenti (09-01, 09-02, 09-04, 09-05, 09-07, 09-08, 09-09, 09-11, 09-12, 09-13, 09-14, 09-15, 09-16) dichiarano "None"/"Nessuna superficie fuori dal threat model" e rimandano a id registrati. Flag non registrati (`unregistered_flag`): nessuno.

## Osservazioni non bloccanti (fuori dal threat model)

Rilievi gia noti, tracciati in `deferred-items.md` e 09-REVIEW-FIX, severita bassa o informativa, nessuno apre una minaccia registrata:
- IN-06 (a): i change stream dei publisher (`quest-results.publisher.ts`, `pending-requests.publisher.ts`) non si riaprono dopo un `error` (pattern preesistente); per i risultati la push `questEnd` + `questResult(id)` copre il buco. Riapertura con backoff rinviata alla Phase 10 (hardening).
- IN-07 (b): `removeOnFail: false` in `enqueue-trigger.ts` lascia i job falliti in Redis senza ripulitura (stesso criterio della Phase 8). Rinviato alla Phase 10.
- IN-08 (a): il target dell'audit di `completePendingRequest` e `{ type: 'QuestResult', id: null }`; l'id della PendingQuest e in `args.input.pendingQuestId`, quindi il record resta ricostruibile (T-09-75 chiusa). Estensione dell'interceptor rinviata alla Phase 10.
- `questResult(id)`: 404 per id inesistente e 403 per id altrui sono distinti (dichiarato in T-09-27); gli id sono ObjectId non indovinabili e la risposta non espone dati.
- Flaky singolo del boot reale (09-14), non riprodotto; ipotesi WR-02 documentata. In questo audit `test/app.int-spec.ts` e verde.
- Bug `Enemy.locations` (09-04) aperto e riportato in BACKEND-NOTES §14: integrita dati, non un controllo di sicurezza.

## Registro dei rischi accettati

| ID | Rischio | Motivazione | Condizione di revisione |
|----|---------|-------------|--------------------------|
| T-09-41 | Il teleport del GM resta ammesso anche per un personaggio in `awaitingAid` | D-07: il teleport e un'azione del GM con `@Roles(innkeeper)` e audit; non e un canale per il giocatore; `teleportFilter` invariato | Se il teleport diventa disponibile ai giocatori |
| T-09-44 | Ordine dei rifiuti del negozio (catalogo -> personaggio -> citta) rivela se una voce esiste anche fuori citta | Stesso ordine documentato di Phase 4; il catalogo e pubblico per il giocatore autenticato (nessun dato sensibile), chiamata owner-only | Se il catalogo contiene voci riservate |

## Trasferimenti

| ID | Destinatario | Documento |
|----|--------------|-----------|
| T-09-82 | Operatore (comandi DB post-deploy: HP, nemici riscalati, ref orfani) | BACKEND-NOTES §12; mitigazione residua nel codice: ref orfani tollerati (C6) |

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-24 | 82 | 82 | 0 | gsd-security-auditor (Claude) |

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter
