---
phase: 09-combat-result-admin-outcomes
reviewed: 2026-10-24T12:00:00Z
depth: standard
files_reviewed: 175
files_reviewed_list:
  - ".env.example"
  - "src/** (tutti i file non-spec sotto src/ toccati da develop..HEAD, letti per intero; elenco esatto: git diff --name-only develop..HEAD -- src test .env.example)"
  - "src/quests/outcomes/outcome-writer.service.ts"
  - "src/quests/outcomes/outcome-plan.ts"
  - "src/quests/outcomes/combatant-plan.ts"
  - "src/quests/outcomes/rescue-plan.ts"
  - "src/quests/outcomes/quest-outcome-plan.ts"
  - "src/quests/outcomes/quest-resolution.service.ts"
  - "src/quests/outcomes/boss-resolution.service.ts"
  - "src/quests/outcomes/rescue-resolution.service.ts"
  - "src/quests/outcomes/gm-completion.service.ts"
  - "src/quests/outcomes/gm-overrides.ts"
  - "src/quests/outcomes/resolution-loader.service.ts"
  - "src/quests/outcomes/resolution-kind.ts"
  - "src/quests/outcomes/quest-resolution.processor.ts"
  - "src/quests/outcomes/quest-resolution.sweeper.ts"
  - "src/quests/outcomes/quest-outcomes.module.ts"
  - "src/quests/outcomes/aid/aid-quest.ts"
  - "src/quests/outcomes/aid/aid-timeout.ts"
  - "src/quests/outcomes/combat/combat-context.ts"
  - "src/quests/outcomes/combat/combat-resolver.ts"
  - "src/quests/outcomes/combat/placeholder-combat-resolver.ts"
  - "src/quests/outcomes/injuries/injury-rules.ts"
  - "src/quests/outcomes/progression/level-table.ts"
  - "src/quests/outcomes/progression/title-progression.ts"
  - "src/quests/outcomes/rewards/cascading-loot.ts"
  - "src/quests/outcomes/rewards/quest-rewards.ts"
  - "src/quests/outcomes/scheduling/quest-resolution-job.ts"
  - "src/quests/outcomes/scheduling/quest-resolution.scheduler.ts"
  - "src/quests/outcomes/scheduling/quest-resolution.updates.ts"
  - "src/quests/outcomes/scheduling/quest-resolution-scheduling.module.ts"
  - "src/quests/outcomes/chance-source.ts"
  - "src/quests/acceptance/quest-acceptance.service.ts"
  - "src/quests/acceptance/quest-acceptance.updates.ts"
  - "src/quests/acceptance/quest-eligibility.ts"
  - "src/quests/pending-requests/pending-requests.resolver.ts"
  - "src/quests/pending-requests/pending-requests.service.ts"
  - "src/quests/pending-requests/pending-requests.builder.ts"
  - "src/quests/pending-requests/pending-requests.publisher.ts"
  - "src/quests/results/quest-results.resolver.ts"
  - "src/quests/results/quest-results.service.ts"
  - "src/quests/results/quest-results.publisher.ts"
  - "src/quests/results/quest-result.populate.ts"
  - "src/quests/quests.service.ts"
  - "src/quests/quest-catalog.populate.ts"
  - "src/characters/deletion/character-archiver.ts"
  - "src/characters/deletion/character-deletion.service.ts"
  - "src/characters/spells/active-spell.updates.ts"
  - "src/models/character/active-spell-slots.ts"
  - "src/economy/trade/shop-transaction.service.ts"
  - "src/travel/travel-completion.service.ts"
  - "src/travel/travel-planner.service.ts"
  - "src/travel/travel-scheduler.service.ts"
  - "src/travel/travel.service.ts"
  - "src/travel/travel.updates.ts"
  - "src/queues/enqueue-trigger.ts"
  - "src/config/quest-config.ts"
  - "src/config/sweep-interval.ts"
  - "src/config/env.validation.ts"
  - "src/authz/ownership/character-access.policy.ts"
  - "src/authz/ownership/ownership.decorators.ts"
  - "src/models/quest-result/quest-result.model.ts"
  - "src/models/request/complete-pending-request.model.ts"
  - "src/models/pending-request.model.ts"
  - "src/models/character/awaiting-aid.model.ts"
  - "src/gameRules/game-rule.exception.ts"
  - "src/schema.gql"
  - "test/quests/outcome-world.ts"
  - "test/quests/sequence-chance.ts"
  - "test/quests/scripted-combat-resolver.ts"
  - "73 file *.spec.ts / *.int-spec.ts (scansione dei pattern: fake, timer, attese, test vacui, override degli harness)"
findings:
  critical: 0
  warning: 3
  info: 9
  total: 12
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-10-24T12:00:00Z
**Depth:** standard
**Files Reviewed:** 175 (git diff develop..HEAD, `src` + `test` + `.env.example`; i file non-spec sotto `src/` letti per intero, le spec per pattern)
**Status:** issues_found

## Summary

Revisione della fase 9 (esiti delle missioni, catena di soccorso, GM, sweep). L'impianto rispetta i pattern consolidati: una transazione per esito, `OutcomeWriter` che scrive solo in sessione e lancia `StaleResolution` quando un filtro non matcha, `deliver` (push, job `aid-timeout`, job `spell-recovery`) solo dopo il commit, stato di uscita azzerato all'inizio di ogni callback rieseguibile, claim del boss con `$all` + `$size`, job come semplici trigger con il DB come fonte di verita, autorizzazione dei risultati per utente con filtro per evento fail-closed, nessun `await` su `publish(`, nessun `Math.random` fuori da `chance-source.ts` (e dal `random-source.ts` preesistente, non sicuro-rilevante).

Non ci sono finding Critical. Tre Warning: una divergenza fra i default del contesto di combattimento e quelli del piano esiti sui documenti legacy (HP schiacciati a 1), lo spegnimento dello sweeper che non attende lo sweep in corso (candidato plausibile per il flaky del boot reale in `deferred-items.md`), e la lettura post-commit di `completePendingRequest` che puo trasformare un successo gia committato in errore. Nove Info (duplicazioni, codice morto, un oggetto condiviso mutabile, migrazione HP, accoppiamento con `travel/`, dettagli operativi).

Il bug noto `Enemy.locations` (deferred 09-04) e il flaky del boot reale non riprodotto non sono riportati come nuovi; WR-02 e solo un'ipotesi di causa per il secondo.

## Warnings

### WR-01: i default del contesto di combattimento divergono da `statusFactsOf` e schiacciano a 1 HP i documenti legacy

**File:** `src/quests/outcomes/combat/combat-context.ts:151-153` (confronto con `src/quests/outcomes/outcome-plan.ts:140-152`)
**Issue:** `participantOf` usa `currentLifePoints: numberOr(..., 1)` e `maxLifePoints: numberOr(..., 0)`, mentre `statusFactsOf` (unica fonte dei valori "prima" del foglio esiti) legge i campi mancanti dalla tabella livelli (`maxLifePoints` = riga del livello, `currentLifePoints` = massimo). Per un personaggio legacy senza `maxLifePoints` il resolver riceve `max = 0`: il placeholder fa `clampLifePoints(x, 0)` = `Math.max(1, Math.min(0, x))` = 1, quindi `hpAfter = 1` per qualunque scontro, e `potionThreshold * 0` rende la pozione irraggiungibile. Il piano poi accetta quel 1 come `hpFought`. Senza `currentLifePoints` il combattimento parte a 1 HP anziche al massimo, e `hpBefore` del foglio (dal piano) non coincide con quello che il resolver ha visto. Lo schema (`character-status.model.ts:54-60`) non ha default per i due campi, quindi i documenti incompleti sono possibili.
**Fix:** far costruire il partecipante dagli stessi fatti del piano, per esempio passando a `buildCombatContext` i `StatusFacts` gia calcolati:
```ts
// combatant-plan.ts / combat-context.ts: usare statusFactsOf(snapshot)
const facts = statusFactsOf(snapshot);
currentLifePoints: facts.currentLifePoints,
maxLifePoints: facts.maxLifePoints,
level: facts.level,
```
(spostare `statusFactsOf` e `levelRowFor` in un modulo che `combat-context.ts` possa importare senza ciclo) e aggiungere un test con snapshot privo di HP.

### WR-02: `QuestResolutionSweeper.onModuleDestroy` non attende lo sweep in corso

**File:** `src/quests/outcomes/quest-resolution.sweeper.ts:66-69` (avvio in `:56-64`)
**Issue:** `onApplicationBootstrap` lancia sempre `void this.sweepSafely()` (reconciler al boot, mai atteso) e `onModuleDestroy` si limita a fare `clearInterval`. Uno sweep gia partito continua a eseguire aggregate, transazioni e `deliver` mentre l'app chiude connessione Mongoose e code: in produzione e uno shutdown non pulito (transazione abortita a meta, errori loggati dopo la chiusura), nei test e un candidato concreto per il flaky 09-14 (`global auth guard` al primo run dopo il montaggio di `QuestOutcomesModule`, mai riprodotto) perche il reconciler gira concorrente con setup e teardown dell'harness. Ipotesi da verificare, non provata.
**Fix:** attendere il single-flight nello shutdown.
```ts
async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.inFlight?.catch(() => undefined);
}
```
Opzionale: un flag `stopping` controllato nei due cicli `for` di `resolveDueQuests`/`timeOutDueAids` per non iniziare nuove risoluzioni dopo lo shutdown.

### WR-03: `completePendingRequest` rilegge i risultati dopo il commit e puo restituire errore per un esito gia scritto

**File:** `src/quests/pending-requests/pending-requests.resolver.ts:49-55`
**Issue:** `GmCompletionService.complete` committa la transazione (PendingQuest cancellate, ricompense assegnate, `QuestResult` creati) e solo dopo il resolver esegue `Promise.all(resultIds.map(findOne))`. Se una `findOne` fallisce (populate, errore transitorio Mongo, `NOT_FOUND` per un risultato appena rimosso), la mutation risponde con errore e l'audit registra l'esito come fallito, ma la scrittura e avvenuta; un secondo tentativo del GM trova la richiesta sparita (`NOT_FOUND`) e non ha modo di rivedere cosa e stato assegnato.
**Fix:** rendere la lettura tollerante e non fatale, per esempio leggere i risultati con una sola query `find({ _id: { $in } })` e in caso di errore loggare e restituire comunque gli id gia noti, oppure far costruire a `complete` i `QuestResult` da restituire dalle bozze gia in memoria (`plan.result`) evitando la rilettura.

## Info

### IN-01: duplicazioni fra i piani e i moduli di supporto

**File:** `src/quests/outcomes/outcome-plan.ts:164-167` e `src/quests/outcomes/progression/level-table.ts:51-54` (`hpWithin` = `lifePointsWithin`); `outcome-plan.ts:169`, `gm-overrides.ts:23` e `injuries/injury-rules.ts:82` (`KNOWN_INJURIES`); `outcome-plan.ts:160-161` e `gm-overrides.ts:25-26` (`isPositiveInteger`); `boss-resolution.service.ts:35-37` e `gm-completion.service.ts:47-49` (`LaneCharacter`); `pending-requests.builder.ts:63` e `gm-completion.service.ts:72` (`GM_LANES`).
**Issue:** piccole duplicazioni che, per la Boy Scout Rule del progetto, vanno unificate (il clamp degli HP in particolare e una regola di gioco con due copie).
**Fix:** esportare `lifePointsWithin` da `level-table.ts` e usarlo in `outcome-plan.ts`; un solo `isKnownInjury`/`isPositiveInteger` in un modulo condiviso di `outcomes/`; un solo `GM_LANES`/`isGmLane` in `quest-lanes.ts`.

### IN-02: `QuestResolutionService.resolveIndividual` e codice morto in produzione

**File:** `src/quests/outcomes/quest-resolution.service.ts:66-74`
**Issue:** nessun chiamante fuori dalle spec (processor e sweeper passano da `resolveStandard`, che smista gia sul ramo individuale).
**Fix:** rimuoverlo e far usare alle spec `resolveStandard`, oppure renderlo `private` se serve solo come corpo condiviso.

### IN-03: `EMPTY_COMMITTED` condivide array mutabili fra gli esiti

**File:** `src/quests/outcomes/outcome-writer.service.ts:54-58` (uso in `src/quests/outcomes/rescue-resolution.service.ts:246-249`)
**Issue:** `{ ...EMPTY_COMMITTED, results }` copia per riferimento `aids` e `spellRecoveries`; oggi `deliver` non muta nulla, ma un futuro `push` su quegli array contaminerebbe la costante per tutti i timeout successivi.
**Fix:** sostituire la costante con una factory `emptyCommitted(): CommittedOutcome` oppure congelare gli array (`Object.freeze`) e tipizzarli `readonly`.

### IN-04: nessuna migrazione dei personaggi esistenti dopo il passaggio degli HP iniziali da 100 a 1000

**File:** `src/characters/creation/starting-character.ts:5-8`, `src/quests/outcomes/outcome-plan.ts:296-305`
**Issue:** i personaggi creati prima della fase hanno `maxLifePoints = 100`; al primo esito `progressionAfter` riscrive `maxLifePoints` dalla tabella (1000) lasciando `currentLifePoints` invariato (corretto per la regola "nessuna cura al level up", ma qui non e un level up): il giocatore vede 100/1000 senza aver ricevuto danni. Il codice e coerente con D-12; il rischio e solo sui dati esistenti.
**Fix:** script di migrazione una tantum (portare `maxLifePoints` e `currentLifePoints` ai valori della riga del livello) oppure nota esplicita in `BACKEND-NOTES.md` che i dati di sviluppo vanno ricreati.

### IN-05: accoppiamento dei moduli `quests/` e `queues/` con `travel/`

**File:** `src/quests/outcomes/scheduling/quest-resolution-job.ts:3` (`isEpochMs` da `src/travel/travel-job`), `src/quests/outcomes/outcome-writer.service.ts:28-32`, `src/queues/enqueue-trigger.ts:4-7` (`withinTimeout`, `QUEUE_CALL_TIMEOUT` da `src/travel/queue-call-timeout`).
**Issue:** utilita generiche delle code vivono sotto `travel/` e sono importate dal nuovo dominio; `queues/enqueue-trigger.ts` dipende a sua volta da `travel/`. Nessun ciclo oggi, ma la direzione di dipendenza e invertita.
**Fix:** spostare `queue-call-timeout.ts` e `isEpochMs` in `src/queues/` e ri-esportarli da `travel/` solo se serve.

### IN-06: i change stream non si riaprono dopo un errore e la coda del GM non reagisce a tutte le variazioni che espone

**File:** `src/quests/results/quest-results.publisher.ts:43-48`, `src/quests/pending-requests/pending-requests.publisher.ts:44-52` e `:14`
**Issue:** (a) su `error` il publisher logga e basta: lo stream resta chiuso e le subscription smettono di ricevere eventi fino al riavvio (stesso comportamento dei publisher preesistenti, quindi coerente, ma resta un punto cieco); per i risultati la push `questEnd` + `questResult(id)` copre il buco, per la coda del GM no. (b) `PENDING_QUEST_CHANGES` filtra su `insert`/`delete` delle PendingQuest, ma `PendingRequest` espone anche `character.activeTravel`, `character.awaitingAid` e `quest.registeredAdventurers`, che cambiano senza toccare le PendingQuest: l'elenco del GM puo restare stantio fino al prossimo insert/delete.
**Fix:** (a) riaprire lo stream con backoff nel handler `error` oppure riavviare il publisher; (b) documentare la scelta in `BACKEND-NOTES.md` (la lista resta eventualmente consistente alla successiva richiesta) o aggiungere un secondo trigger sul change stream dei Character limitato a quei campi.

### IN-07: rumore operativo da timeout sospesi e job falliti che si accumulano

**File:** `src/quests/outcomes/rescue-resolution.service.ts:201-206`, `src/quests/outcomes/quest-resolution.sweeper.ts:114-134`, `src/queues/enqueue-trigger.ts:39-40`
**Issue:** finche una aid ha un soccorritore registrato (C5) lo sweep chiama `timeoutAid` a ogni giro (60 s di default) e ogni volta scrive un log `Soccorso ...: un soccorritore è registrato, timeout sospeso` per ciascuna aid sospesa. Inoltre `removeOnFail: false` lascia in Redis ogni job fallito senza ripulitura (stesso criterio della fase 8, coerente).
**Fix:** loggare la sospensione a livello `debug`, oppure farla scartare a monte con `registeredAdventurers: { $size: 0 }` nella query dello sweep; valutare un limite `removeOnFail: { count: N }`.

### IN-08: audit di `completePendingRequest` senza target identificativo e input GM senza tetto

**File:** `src/authz/audit/admin-audit.interceptor.ts:76-79` (effetto su `src/quests/pending-requests/pending-requests.resolver.ts:46-55`), `src/models/request/complete-pending-request.model.ts`
**Issue:** il target dell'audit e `{ type: 'QuestResult', id: null }` perche `args.id` non esiste (l'id della PendingQuest e in `args.input.pendingQuestId`); il record resta ricostruibile dagli args, ma la ricerca per target non funziona. Gli array `outcomes`, `consumablesUsed`, `spellsUsed` non hanno limiti di lunghezza (la mutation e `@Roles(innkeeper)`, quindi rischio basso).
**Fix:** estendere l'interceptor per leggere `input.pendingQuestId`, oppure dichiarare il target nel decoratore; aggiungere `@ArrayMaxSize` (class-validator) sugli array di input se la pipeline di validazione e attiva sui GraphQL input.

### IN-09: l'accodamento del countdown ritarda la push di fine viaggio quando Redis non risponde

**File:** `src/travel/travel-completion.service.ts` (dopo il commit: `await this.questScheduler.scheduleResolution(...)` prima di `notifyOwner`)
**Issue:** `enqueueTrigger` e best-effort ma attende fino a `QUEUE_CALL_TIMEOUT_MS`; con Redis lento la notifica `travelEnd` slitta per quel tempo.
**Fix:** inviare prima la push e accodare dopo, oppure non attendere l'accodamento (`void`) dato che lo sweep copre il mancato job.

## Verificato senza problemi

- **Atomicita e idempotenza (D-21):** `QuestResolutionService.resolveLoadedIndividual`, `BossResolutionService.commitGroup`, `RescueResolutionService.resolveRescue`/`timeoutAid` e `GmCompletionService.commit` azzerano lo stato di uscita all'inizio del callback, rileggono gli snapshot in sessione (isolamento a snapshot: un trade concorrente produce WriteConflict, non lost update) e fanno `deliver` solo dopo il commit; `StaleResolution` esce come no-op `'stale'`; i log del ramo soccorso sono raccolti nel callback e scritti dopo il commit.
- **Claim del boss:** `questClaimFilter` con `$all` sugli id dei partecipanti piu `$size: registeredCount` e `concludedAt: null`; un secondo trigger, un nuovo iscritto o un uscito danno 0 match e quindi `'claim'` -> `StaleResolution`; i registrati incoerenti escono con i falliti (`dropped`).
- **Sweep solo corsia standard:** `dueStandardQuestsPipeline` parte da `quests.pendingQuest` (le PendingQuest GM con `waitingTime: 0` non sono raggiungibili); `now` dal `Clock`, mai dalla variabile del server Mongo; single-flight con `finally`, `unref()`, `sweepIntervalMs: 0` spegne solo il timer.
- **Catena di soccorso:** `dieWithin` legge il proprietario in sessione prima di `archiveWithin(session, ...)`, utente gia scollegato = no-op loggato (C1), aid clonata dall'originale con titolo mai raddoppiato, `awaitingAid` scritto sul fallimento e azzerato da `planRescued`, ferito riportato al marker della citta senza cura, timeout sospeso con un soccorritore registrato (C5) sia nel pre-controllo sia nel filtro di claim (`registeredAdventurers: { $size: 0 }`), `CharacterArchiver.releaseQuestsOf` chiude le aid del morto.
- **Progressione e premi:** `progressionAfter` unico scrittore di `level`/`maxLifePoints` con clamp a 50 000, nessuna cura al level up, `xpGained = xpAfter - xpBefore` (guadagno effettivo dopo il clamp), `heal` vinta azzera le ferite e porta gli HP al nuovo massimo, `prizes.spell` filtrata con `minXpToLearn` valido e valutata sull'XP finale, cascading rolls solo via `ChanceSource` (una estrazione per rarita, indice di pool clampato), consumi e usi magia clampati al posseduto, inventario via `applyTradeToInventory`, monete solo via `WalletService.applyCharacterCoinsDelta(..., session)`.
- **Autorizzazione e consegna:** `questResult` e `questResultReceived` owner-only per utente (`OwnsQuestResult`/`OwnsCharacter ownerOnly`), innkeeper senza bypass, filtro per evento fail-closed su `user` e `character` (un campo mancante non uguaglia mai l'identita), nessuno snapshot; `pendingRequests`/`pendingRequestsUpdated` `@Roles(innkeeper)` con snapshot (`subscribeWithSnapshot`) e lista completa, ricalcolo single-flight con rerun senza finestra di perdita; nessun `await` su `publish(`; `completePendingRequest` valida gli override (`OUTCOME_NOT_PARTICIPANT`/`OUTCOME_OVERRIDE_INVALID`/`NOT_FOUND`) prima di qualunque scrittura e li rivalida sugli snapshot in sessione.
- **Guard:** `AWAITING_AID` in viaggio, preview e accettazione (pre-verifica `classifyEligibility` + filtro `laneClaimFilter` + `classifyUnclaimed`), non sul teleport; `SHOP_NOT_IN_CITY` nei tre casi (scambio vuoto, transazione, filtro di `writeInventory`); quest concluse fuori da `quests`/`quest(id)` e dalla registrazione (`concludedAt: null` nel filtro); slot magia solo da `mage` in su con virtual e filtro derivati dalla stessa tabella.
- **Scheduler/processor:** jobId deterministici senza `:` (`quest-<id>-<ms>`, `aid-<id>`), dati del job validati come input non fidato, job in anticipo ignorati senza ri-accodamento, `enqueueTrigger`/`withinTimeout` best-effort che non lanciano mai, un solo punto di accodamento condiviso con il viaggio.
- **Config:** `QUEST_SWEEP_INTERVAL_MS` parsata fail-closed (`parseSweepIntervalMs`, messaggio senza il valore), richiamata da `validateEnv`, presente e documentata in `.env.example` come non segreta; nessun secret nel diff.
- **Test:** harness con `QUIET_OUTCOME_OVERRIDES`/`IDLE_QUEST_SWEEPER`, code finte (`FakeTravelQueue`) negli harness che non usano Redis, attese con polling e deadline (`waitFor`), nessun `job.finished`, nessun `.only`/`.skip`/`xit` nelle 73 spec scansionate, le uniche attese negative sono finestre esplicite e commentate (`NO_SNAPSHOT_WINDOW_MS`, `NEGATIVE_WAIT_MS`), `queue.empty()` presente dove si usa Redis reale (processor).
- **Letterali vietati sul filo:** il campo del risultato si chiama `outcome` (mai `kind`/`grade`), nessun `TravelKind` nuovo nel codice di fase 9.

---

_Reviewed: 2026-10-24T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
