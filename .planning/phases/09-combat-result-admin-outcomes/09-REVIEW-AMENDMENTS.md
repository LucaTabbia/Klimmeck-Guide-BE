---
phase: 09-combat-result-admin-outcomes
scope: piani 09-17, 09-18, 09-19 (diff a6c7118..d16f01a, branch feat/09-combat-result-admin-outcomes)
reviewed: 2026-10-25T15:49:33Z
depth: deep
files_reviewed: 46
files_reviewed_list:
  - src/quests/party/party-rules.ts
  - src/quests/party/quest-start.service.ts
  - src/quests/party/party-abandon.service.ts
  - src/quests/party/party-timeout.service.ts
  - src/quests/party/party.resolver.ts
  - src/quests/party/party.module.ts
  - src/quests/party/party-lifecycle.module.ts
  - src/models/request/abandon-quest-request.model.ts
  - src/models/pending-quest.model.ts
  - src/models/quest/quest.model.ts
  - src/models/quest/quest-registration.model.ts
  - src/models/quest/quest-rescue.model.ts
  - src/models/quest-result/quest-result.model.ts
  - src/gameRules/game-rule-error-code.enum.ts
  - src/gameRules/game-rule.exception.ts
  - src/push/push-event-type.enum.ts
  - src/push/push-events.ts
  - src/app.module.ts
  - src/schema.gql
  - src/quests/acceptance/quest-acceptance.service.ts
  - src/quests/acceptance/quest-acceptance.updates.ts
  - src/quests/acceptance/quest-acceptance.module.ts
  - src/travel/travel-completion.service.ts
  - src/travel/travel.updates.ts
  - src/travel/travel.module.ts
  - src/quests/outcomes/quest-resolution.sweeper.ts
  - src/quests/outcomes/quest-resolution.processor.ts
  - src/quests/outcomes/quest-resolution.service.ts
  - src/quests/outcomes/quest-outcomes.module.ts
  - src/quests/outcomes/scheduling/quest-resolution.scheduler.ts
  - src/quests/outcomes/scheduling/quest-resolution-job.ts
  - src/quests/outcomes/scheduling/quest-resolution.updates.ts
  - src/quests/outcomes/rescue-resolution.service.ts
  - src/quests/outcomes/boss-resolution.service.ts
  - src/quests/outcomes/resolution-loader.service.ts
  - src/quests/outcomes/group-roster.ts
  - src/quests/outcomes/quest-outcome-plan.ts
  - src/quests/outcomes/combatant-plan.ts
  - src/quests/outcomes/outcome-plan.ts
  - src/quests/outcomes/gm-overrides.ts
  - src/quests/outcomes/rescue-plan.ts
  - src/quests/outcomes/resolution-kind.ts
  - src/quests/outcomes/aid/aid-quest.ts
  - src/quests/outcomes/aid/aid-timeout.ts
  - src/quests/outcomes/combat/combat-resolver.ts
  - src/quests/outcomes/combat/placeholder-combat-resolver.ts
  - src/characters/deletion/character-archiver.ts
tests_reviewed:
  - src/quests/party/quest-start.int-spec.ts
  - src/quests/party/party-abandon.int-spec.ts
  - src/quests/party/party-timeout.int-spec.ts
  - src/quests/party/party-rules.spec.ts
  - src/quests/outcomes/quest-resolution.sweeper.spec.ts
  - src/quests/outcomes/quest-resolution.sweeper.int-spec.ts
  - src/quests/outcomes/quest-resolution.processor.int-spec.ts
  - src/quests/outcomes/aid-timeout.int-spec.ts
  - src/quests/outcomes/aid-rescue.int-spec.ts
  - src/quests/outcomes/boss-resolution.int-spec.ts
  - src/quests/acceptance/quest-acceptance.service.int-spec.ts
  - src/travel/travel-completion.int-spec.ts
  - src/characters/deletion/character-archiver.int-spec.ts
  - test/app.int-spec.ts
  - test/quests/outcome-world.ts
  - test/quests/scripted-combat-resolver.ts
findings:
  critical: 0
  warning: 3
  info: 15
  total: 18
issues_found:
  critical: 0
  warning: 3
  info: 15
status: issues_found
---

# Phase 9 (emendamenti 09-17/18/19): Code Review Report

**Reviewed:** 2026-10-25T15:49:33Z
**Depth:** deep (analisi per file più tracciamento delle catene claim/transazione/consegna fra accettazione, viaggio, party, esiti e archivio)
**Files Reviewed:** 46 sorgenti + 16 file di test
**Status:** issues_found (0 critical, 3 warning, 15 info)

## Summary

I tre piani cambiano il modello di gioco su tre assi: un verdetto unico per combattimento (09-17), una sola aid di gruppo per combattimento perso con soccorso sul roster condiviso (09-18), e arrivo ≠ avvio con `QuestStartService` unico scrittore di `startDate`, abbandono, scioglimento a 24 ore e timer della aid sospeso solo dal soccorso in corso (09-19).

**Valutazione complessiva: solida.** I pattern del repo sono rispettati in tutti i percorsi nuovi:

- **Transazioni:** stato azzerato in testa al callback (`commitStart`, `disband`, `timeoutAid`, `resolveRescue`, `complete`, `accept`), solo letture in sessione e scritture in serie, claim con 0 match ⇒ `StaleResolution`/no-op, nessun `$$NOW`.
- **Claim per identità del party** (`partyClaimFilter`: `$all` + `$size` + `startedAt: null` + `concludedAt: null`) condiviso da avvio e scioglimento: le due operazioni si escludono a vicenda e si serializzano con registrazione (`registrationFilter` con `startedAt: null`), abbandono (`$pull` sulla Quest) e archivio (`$pull` sulla Quest) tramite WriteConflict sullo stesso documento. Ho tracciato le corse avvio/scioglimento/abbandono/registrazione/archivio/arrivo e non ho trovato finestre in cui resti una PendingQuest viva con corsia nulla, una corsia orfana su una PendingQuest cancellata, o uno `startedAt` scritto senza roster (il boss perso lo azzera, l'archivio lo azzera a roster vuoto, il timeout conclude).
- **Timeout della aid:** ordine claim (`AID_TIMEOUT_NOT_IN_PROGRESS`) → morti (`dieWithin` → `archiveWithin`) → `releaseRegistered` nella stessa transazione, poi `deliver` e `questCancelled` dopo il commit. Il claim precede l'archivio, quindi `releaseQuestsOf` non tocca né `rescue.characters` né `concludedAt` della aid appena conclusa (letta in sessione): il caso 4 dello spec lo verifica.
- **Consegna dopo il commit:** push `questCancelled` e job `resolve`/`party-timeout`/`aid-timeout` sono tutti fuori dalle transazioni; jobId deterministici (`quest-<pq>-<startMs>`, `party-<quest>-<sinceMs>`, `aid-<aid>`); job in anticipo ⇒ log + no-op senza ri-accodamento; `enqueueTrigger` e `sendToUser` sono best-effort.
- **Sicurezza:** `abandonQuest` è `@OwnsCharacter(ownerOnly)` ed è nell'enumerazione owner-only del boot reale; `questId` passa da `objectIdFromHex`, `id` da `requireCharacterObjectId`; i payload dei job sono validati (`partyTimeoutJobDataOf`); nei log solo id. Contratto SDL additivo rispetto a `origin/develop` (nessuna riga rimossa), letterali vietati assenti (`startedAt` 0 volte).
- **Commenti stantii:** nessuna occorrenza di «un soccorritore è registrato», «una aid per ferito», «transitorio», `AID_TIMEOUT_REQUIRES_NO_RESCUER`, `rescue.character`, `rescuedCharacter`, `ParticipantOutcome` in `src`/`test`; resta una frase da aggiornare nell'accettazione (IN-07).

I tre warning riguardano la **robustezza del percorso post-commit** (`tryStart` non è best-effort come il commento promette), un **errore di scope del dedupe** dello sweep sugli avvii (penalizza le quest non registrate) e uno **stato morto** (party pieno con un registrato incoerente) che né l'avvio né lo scioglimento sanano, con un WARN ripetuto a ogni tick. Gli info sono duplicazioni annunciate (`ownersOf`, lettura del roster), un provider morto, un commento stantio, lacune di test mirate e il costo delle query non indicizzate.

## Warnings

### WR-01: `tryStart` dopo il commit non è best-effort (un errore post-commit arriva al client come fallimento dell'accettazione)

**Piano:** 09-19
**File:** `src/quests/acceptance/quest-acceptance.service.ts:205-220`; `src/travel/travel-completion.service.ts:103-104`
**Issue:** Il commento in `accept` dice «job e avvio dopo il commit (D-21): best-effort, lo sweep copre un accodamento fallito», ma solo `scheduler.schedule` e `schedulePartyTimeout` lo sono (passano da `enqueueTrigger`, che cattura). `questStart.tryStart` esegue letture e una transazione (`commitStart`) e può lanciare (errore Mongo oltre i retry, connessione caduta). Se lancia:
- l'accettazione è **già committata** (corsia claimata, PendingQuest creata, punti scalati, registrazione scritta) ma la mutation `acceptQuest` risponde con un errore: il FE mostra un fallimento e un retry riceve `QUEST_SLOT_BUSY`;
- la riga successiva `schedulePartyTimeout` **non viene eseguita**: la finestra delle 24 ore resta affidata al solo sweep (`disbandExpiredParties`), che con `QUEST_SWEEP_INTERVAL_MS = 0` non gira mai.
In `TravelCompletionService.complete` lo stesso lancio fa fallire il job di viaggio (già completato a DB) senza ri-accodamento; qui l'effetto è solo un job in `failed`, perché la push `travelEnd` riguarda solo i viaggi liberi.
**Fix:** rendere `tryStart` non lanciante per i chiamanti post-commit, in un solo punto. Opzione minima in `QuestStartService`:

```ts
// unico ingresso post-commit: un errore qui non deve annullare un'accettazione o un arrivo già committati (lo sweep riprova)
async tryStart(trigger: StartTrigger): Promise<StartOutcome> {
    try {
        return await this.start(trigger); // l'attuale corpo di tryStart
    } catch (error) {
        this.logger.error(
            `Avvio della missione ${trigger.questId.toHexString()} fallito: ${describeError(error)}; lo sweep riprova`,
        );
        return 'stale';
    }
}
```

e nello sweeper togliere il `try/catch` ora ridondante attorno a `tryStart` (oppure lasciare il catch nello sweeper e aggiungere un wrapper `startBestEffort` in accettazione e viaggio). In entrambi i casi `schedulePartyTimeout` deve girare anche se l'avvio è fallito. Test da aggiungere: `tryStart` che rigetta ⇒ `accept` risolve con il `pendingQuestId`, la PendingQuest esiste, il job `party-timeout` è accodato.

### WR-02: lo sweep avvia una sola PendingQuest per quest, anche per le quest non registrate

**Piano:** 09-19
**File:** `src/quests/outcomes/quest-resolution.sweeper.ts:129-135`; test che lo fissa: `src/quests/outcomes/quest-resolution.sweeper.spec.ts:207-233`
**Issue:** `startPendingQuests` deduplica con `seen` per `questId` («un solo tryStart per quest, il party parte tutto insieme»). La regola è giusta per boss/aid/enemy, dove `tryStart` ignora il `pendingQuestId` e avvia tutto il party. Per hunt, dungeon, job, heal e study (ripetibili, una PendingQuest per avventuriero sulla stessa quest) `startSingle` avvia **solo** la PendingQuest passata nel trigger: se k personaggi hanno `arrivedAt` scritto e `startDate` nullo sulla stessa hunt (k avvii mancati dopo un crash o un errore come in WR-01), lo sweep ne avvia uno per tick e gli altri aspettano un intervallo ciascuno. `startDate = arrivedAt` quindi il countdown non si accorcia, ma finché `startDate` è nullo né il job `resolve` né `resolveDueQuests` possono risolverli: l'esito slitta di (k−1) × `QUEST_SWEEP_INTERVAL_MS`. Il test unit «starts the arrived quests first, once per quest» codifica il comportamento anche per la voce hunt, quindi va aggiornato insieme al fix.
**Fix:** deduplicare solo per le quest registrate. Due strade:
1. far portare il tipo alla pipeline (`$lookup` su `quests` in `arrivedUnstartedPipeline`, proiettando `type: '$quest.infos.type'`) e usare `seen` con chiave `isRegistered(type) ? questId : pendingQuestId`;
2. togliere il dedupe: per un party già avviato il secondo `tryStart` costa una `findById` e risponde `'stale'` (`quest.startedAt != null`), per un party in attesa risponde `'waiting'` senza scrivere; il costo è limitato dalla dimensione del party.

La 2 è la più semplice e lascia a `QuestStartService` tutta la regola; la 1 mantiene il risparmio di query. In entrambi i casi aggiungere un int-spec allo sweeper con due hunt arrivate e non avviate sulla stessa quest ⇒ entrambe con `startDate` e due job `resolve` dopo un solo `sweep()`.

### WR-03: party pieno con un registrato senza PendingQuest coerente: né avvio né scioglimento, WARN a ogni tick

**Piano:** 09-19
**File:** `src/quests/party/quest-start.service.ts:139-145`; `src/quests/party/party-timeout.service.ts:95-98`
**Issue:** `readParty` mette in `dropped` i registrati senza una PendingQuest di questa quest in corsia e, se `dropped.length > 0`, `startParty` risponde `'waiting'` con un WARN. `disband`, però, conta i registrati **dalla Quest** (`members.length >= rule.total` ⇒ `'waiting'`), quindi un party con tutti i posti occupati di cui uno incoerente non viene mai sciolto. La risoluzione di gruppo gestisce lo stesso caso (Pitfall 8) facendo `$pull` dei `dropped` in `questUpdateOf`, l'avvio invece lo lascia com'è: lo stato è permanente finché un operatore non interviene, e il WARN «registrati senza una missione in attesa coerente» si ripete a ogni sweep (`startPendingQuests` passa da lì ogni tick): la stessa categoria di rumore per cui il timeout sospeso della aid è stato portato a `debug`. Lo stesso vale, in silenzio, per `rule === 'invalid'` in `disband` (catalogo corretto dopo la registrazione). Serve un difetto di dati per entrarci (nessun percorso di gioco lo produce: abbandono, scioglimento, archivio e timeout rimuovono la registrazione insieme alla corsia), ma la regola del repo è che un difetto di dati non blocchi il gruppo.
**Fix:** allineare l'avvio alla risoluzione: nel ramo `dropped.length > 0` di `startParty`, togliere le registrazioni incoerenti nella stessa transazione del claim (un `updateOne` con `partyClaimFilter(questId, registeredIds)` + `$pull: { registeredAdventurers: { character: { $in: dropped } } }`, senza scrivere `startedAt`), poi rispondere `'waiting'`: il posto torna libero, il party può riempirsi o scadere con le regole normali, e il WARN scatta una volta sola. In alternativa, più conservativa: far contare a `disband` solo i membri coerenti (riusando `readParty` tramite `QuestStartService`, che `PartyLifecycleModule` già importa) e portare il WARN ripetuto a `debug` dopo la prima occorrenza. Test: party 2/2 con una PendingQuest cancellata a mano ⇒ dopo `tryStart` la registrazione incoerente è sparita (o, nella variante, `disband` scioglie a 24 ore).

## Info

### IN-01: `startedAt` azzerato con un `updateMany` non limitato alle quest del personaggio archiviato

**Piano:** 09-18 / 09-19
**File:** `src/characters/deletion/character-archiver.ts:77-99`
**Issue:** Il secondo `updateMany` (`concludedAt: null, startedAt: {$ne: null}, registeredAdventurers: {$size: 0}` ⇒ `startedAt: null`) gira su tutta la collection, non sulle quest da cui il personaggio è appena stato tolto: dentro la transazione del chiamante (morte nel soccorso, cancellazione volontaria) è una scansione senza indice (`$size` non ne usa) e può toccare documenti estranei. Oggi matcha solo stati già incoerenti, quindi non produce bug, ma è un pattern da non replicare. Inoltre il filtro `'registeredAdventurers.character': characterId` usa il solo ObjectId mentre lo stesso path altrove è interrogato con `idForms` (`party-abandon.service.ts:73`, `readParty`): coerente con lo schema (ObjectId con `required`), incoerente con la regola dichiarata nel repo.
**Fix:** leggere prima gli id (`find({ 'registeredAdventurers.character': ..., concludedAt: null }, { _id: 1 })`, come già si fa per le aid), poi `$pull` e azzeramento di `startedAt` con `_id: { $in: ids }`; scegliere una sola convenzione per `registeredAdventurers.character` (dato lo schema ObjectId, semplificare le varianti `idForms` è l'opzione meno invasiva).

### IN-02: dopo l'abbandono del primo registrato lo scioglimento dipende dal solo sweep

**Piano:** 09-19
**File:** `src/quests/acceptance/quest-acceptance.service.ts:210-220`; `src/quests/outcomes/quest-resolution.processor.ts:80-98`
**Issue:** Il job `party-timeout` nasce solo alla prima registrazione (`registration.before === 0`). Se quel membro abbandona, la finestra si àncora alla registrazione più vecchia rimasta (`partyFormingSinceOf`), il job vecchio scatta in anticipo e `disband` risponde `'waiting'`: nessun job copre il nuovo istante e lo scioglimento arriva solo dallo sweep (fino a un intervallo di ritardo; mai con `sweepIntervalMs = 0`). È il default tecnico documentato («non riavviata dopo un abbandono... + sweep»), quindi solo da segnalare.
**Fix:** quando `disband` risponde `'waiting'` perché la finestra si è spostata, ri-accodare `party-<questId>-<nuovoSinceMs>` dal processor (jobId idempotente), oppure accodare il job a ogni registrazione (uno per `registeredAt`, ciascuno no-op se il party è pieno).

### IN-03: `ownersOf` duplicato fra `PartyTimeoutService` e `ResolutionLoader`

**Piano:** 09-19
**File:** `src/quests/party/party-timeout.service.ts:241-264`; `src/quests/outcomes/resolution-loader.service.ts:261-281`
**Issue:** Stessa query e stessa mappa, con il commento «come ResolutionLoader.ownersOf, non importabile qui» (il loader vive in `QuestOutcomesModule`, che importa `PartyLifecycleModule`).
**Fix:** estrarre una funzione pura `ownersByCharacter(userModel, characterIds)` in un file senza dipendenze da moduli (es. `src/models/user/owners-of.ts`), usata da entrambi i servizi.

### IN-04: lettura del roster duplicata (`readParty` vs `readGroupRoster`) e quattro copie di `registeredIdsOf`

**Piano:** 09-18 / 09-19
**File:** `src/quests/party/quest-start.service.ts:152-201`; `src/quests/outcomes/resolution-loader.service.ts:211-259`; copie dell'estrazione degli id: `quest-start.service.ts:153`, `boss-resolution.service.ts:51`, `rescue-resolution.service.ts:167`, `party-timeout.service.ts:62-65`
**Issue:** `readParty` replica il doppio passo di `readGroupRoster` (personaggi attivi in corsia standard → PendingQuest della quest → accoppiamento per corsia → `dropped`), cambiano solo proiezione e campi mappati. L'espressione `(registeredAdventurers ?? []).flatMap(({character}) => refIdOf(character) ?? [])` compare quattro volte (una già estratta in `registeredIdsOf`).
**Fix:** un helper condiviso `laneMembersOf(characterModel, pendingQuestModel, questId, registered, projection)` che restituisca `{ character, pendingQuest }[]` e `dropped`; `readGroupRoster` vi aggiunge proprietari e `waiting`, `readParty` mappa `arrivedAt`/`waitingTime`. Spostare `registeredIdsOf` in `party-rules.ts` (o `quest-eligibility.ts`) e usarlo ovunque.

### IN-05: `PARTY_TYPES` duplica `REGISTERED_TYPES` meno la worldMission

**Piano:** 09-19
**File:** `src/quests/outcomes/scheduling/quest-resolution.updates.ts:13-17`
**Issue:** L'elenco boss/aid/enemy è «tipi registrati della corsia standard»; `isRegistered` e `laneOf` già lo esprimono. Un nuovo tipo registrato standard verrebbe avviato da `tryStart` ma ignorato da `formingPartiesFilter` (mai sciolto dallo sweep).
**Fix:** `const PARTY_TYPES = Object.values(QuestType).filter((type) => isRegistered(type) && laneOf(type) === QuestLane.standard);` (o un `export` dedicato in `quest-eligibility.ts`).

### IN-06: `StaleResolution` importata da `outcomes/outcome-writer.service` nei servizi del party

**Piano:** 09-19
**File:** `src/quests/party/quest-start.service.ts:26`; `src/quests/party/party-timeout.service.ts:27`
**Issue:** Nessun ciclo di moduli Nest (verificato: `PartyModule` → scheduling; `PartyLifecycleModule` → party, push, authz; outcomes/acceptance/travel → party), ma a livello di file `party → outcomes` convive con `outcomes → party` (sweeper, processor, rescue). Funziona perché la classe è usata solo a runtime, resta un accoppiamento inutile verso un file che trascina scheduler, wallet e push.
**Fix:** spostare la sentinella in un file foglia (`src/quests/outcomes/stale-resolution.ts` o `src/mongo/stale-claim.ts`) ed esportarla da lì (re-export in `outcome-writer.service.ts` per i chiamanti esistenti).

### IN-07: commento stantio «marker = posizione ⇒ countdown subito»

**Piano:** 09-19
**File:** `src/quests/acceptance/quest-acceptance.service.ts:224`
**Issue:** Con arrivo ≠ avvio, chi accetta sul marker una boss/aid/enemy non parte subito: `initialLaneDatesOf` scrive solo `arrivedAt` e `tryStart` decide.
**Fix:** «marker = posizione ⇒ arrivo immediato (l'avvio lo decide QuestStartService)».

### IN-08: condizione della finestra delle 24 ore ridondante

**Piano:** 09-19
**File:** `src/quests/acceptance/quest-acceptance.service.ts:211-216`
**Issue:** `registration.before === 0 && registration.before + 1 < rule.total` equivale a `registration.before === 0 && rule.total > 1`.
**Fix:** estrarre `const opensPartyWindow = lane === QuestLane.standard && rule !== null && registration.before === 0 && rule.total > 1;`.

### IN-09: provider `Clock` senza consumatori in `PartyModule`; campi proiettati e mai letti in `PartyAbandonService`

**Piano:** 09-19
**File:** `src/quests/party/party.module.ts:26`; `src/quests/party/party-abandon.service.ts:24-28,106`
**Issue:** `QuestStartService` non inietta `Clock` (gli istanti vengono da `arrivedAt`), quindi `{ provide: Clock, useClass: SystemClock }` in `PartyModule` è morto. `WaitingSnapshot.startDate`/`arrivedAt` sono proiettati da `refusalOf` ma solo `quest` viene letto (il codice è deciso dal filtro).
**Fix:** togliere il provider da `PartyModule`; ridurre `WaitingSnapshot` e la proiezione a `{ quest: 1 }` (o usare i due campi per distinguere «in viaggio» da «già avviata» con due codici, se il FE lo vuole).

### IN-10: nome del metodo `partyTimeoutJob` disallineato dai fratelli

**Piano:** 09-19
**File:** `src/quests/outcomes/quest-resolution.processor.ts:81`
**Issue:** `resolve`, `aidTimeout`, `partyTimeoutJob`: il suffisso serve solo a evitare il clash con il campo iniettato `partyTimeout`.
**Fix:** rinominare il campo (`parties` / `partyTimeouts`) e il metodo `partyTimeout`, oppure `disbandParty`.

### IN-11: il conteggio del backfill è di quest, il log parla di registrazioni

**Piano:** 09-19
**File:** `src/quests/party/party-timeout.service.ts:174`; `src/quests/outcomes/quest-resolution.sweeper.ts:118`
**Issue:** `backfillRegisteredAt` ritorna `modifiedCount` (documenti Quest), lo sweep lo stampa come «registrazioni retrodatate».
**Fix:** «quest con registrazioni retrodatate» (o contare le registrazioni con una pre-lettura, se il numero serve davvero).

### IN-12: membro legacy con `startDate` scritto saltato in silenzio dallo scioglimento

**Piano:** 09-19
**File:** `src/quests/party/party-timeout.service.ts:189-239`
**Issue:** `releaseMembers` cancella solo le PendingQuest con `startDate: null`, ma il claim azzera comunque `registeredAdventurers`: un membro pre-09-19 resta con PendingQuest e corsia senza registrazione, e alla scadenza il ramo boss trova `registered = []` ⇒ `seats = []` ⇒ `'stale'` muto a ogni tick. La nota di deploy in BACKEND-NOTES §16 prevede la pulizia a mano, ma il codice non la rende osservabile.
**Fix:** loggare a WARN (soli id) i membri saltati in `releaseMembers`, così la pulizia manuale ha una traccia; in alternativa escludere dal claim di `disband` i party con un membro a `startDate` scritto.

### IN-13: `commitRescue` oltre le 50 righe

**Piano:** 09-18
**File:** `src/quests/outcomes/rescue-resolution.service.ts:326-413`
**Issue:** Snapshot dei soccorritori, feriti in sessione, combattimento, piani e scritture per soccorritore, claim, liberazione/morte, nuova aid: ~90 righe in un metodo.
**Fix:** estrarre `fightRescuers(context, session)` (snapshot + combattimento + piani + scritture ⇒ `{ committed, verdicts, fallen }`) e `settleWounded(step, fallen)` (claim già fatto ⇒ `liberate`/`kill` + `createAid`).

### IN-14: lacune di test mirate

**Piano:** 09-19
**File:** `src/travel/travel-completion.int-spec.ts`; `src/quests/party/quest-start.int-spec.ts`; `src/quests/outcomes/quest-resolution.sweeper.int-spec.ts`
**Issue:**
- `travel-completion.service.ts:81` documenta l'arrivo dopo uno scioglimento (PendingQuest assente ⇒ viaggio da quest senza countdown, nessun job, nessuna push), ma nessun test lo copre: il test «quest is gone» copre una Quest mancante con PendingQuest presente.
- `quest-start.int-spec.ts` ha la corsa simmetrica (due `tryStart` concorrenti) ma non la corsa asimmetrica con spy su `connection.transaction` (abbandono o archivio fra `readParty` e il claim ⇒ `'stale'`, nessun `startDate` scritto, nessun job), che `party-timeout.int-spec.ts:266-295` modella bene.
- nessun test con due PendingQuest non registrate arrivate sulla stessa quest nello sweep (vedi WR-02).
Fixture coerenti: `persistQuester` scrive `arrivedAt` (default `startDate ?? OUTCOME_START`, `null` = in viaggio) e `startedAt` sulla quest quando il membro ha `startDate`; le registrazioni nascono senza `registeredAt` (forma legacy) e gli spec le datano con `registeredSince`.
**Fix:** aggiungere i tre casi; nel primo verificare anche `activeTravel` nullo e `status.location` = marker.

### IN-15: query dello sweep e dell'archivio senza indici (solo segnalazione, Phase 10)

**Piano:** 09-19 (già in BACKEND-NOTES §14/§16)
**File:** `src/quests/outcomes/scheduling/quest-resolution.updates.ts:71-105`; `src/quests/party/party-timeout.service.ts:161-175`; `src/characters/deletion/character-archiver.ts:89-99`
**Issue:** A ogni tick: `arrivedUnstartedPipeline` (scan dei personaggi attivi con corsia + `$lookup`), `dueStandardQuestsPipeline` (idem), `formingPartiesFilter` (quest per tipo/`concludedAt`/`startedAt`/`registeredAdventurers.0`), `backfillRegisteredAt` (`updateMany` con `$elemMatch` su tutte le quest aperte), `dueAidTimeoutsFilter` (`status.awaitingAid.since`). Più la scansione dell'archivio di IN-01 a ogni morte/cancellazione.
**Fix:** indici candidati per la Phase 10: `characters { deletedAt: 1, 'quests.pendingQuest': 1 }`, `characters { deletedAt: 1, 'status.awaitingAid.since': 1 }`, `quests { 'infos.type': 1, concludedAt: 1, startedAt: 1 }`, `pendingquests { quest: 1, startDate: 1, arrivedAt: 1 }`; valutare se il backfill debba restare in ogni tick o girare una volta sola dopo il deploy (flag o migrazione).

---

## Verifiche puntuali richieste (esito)

| # | Punto | Esito |
|---|-------|-------|
| 1 | Corse avvio/scioglimento/abbandono/registrazione/archivio | Nessuna finestra trovata: tutte le scritture sulla Quest si serializzano per WriteConflict e i claim per identità falliscono a 0 match. Stato morto possibile solo con dati incoerenti (WR-03). |
| 2 | Timeout della aid: claim → morti → liberazione, interazione con l'archivio | Corretto: il claim conclude la aid prima che `releaseQuestsOf` passi; l'archivio tocca solo aid aperte; `releaseRegistered` rilegge in sessione. |
| 3 | Consegna dopo il commit, jobId, job in anticipo | Corretto in tutti i punti; unica eccezione il post-commit non best-effort di `tryStart` (WR-01). |
| 4 | `tryStart` non registrate (pipeline `startDate = '$arrivedAt'`) e registrate (`max(arrivedAt)`), WARN con soli id, dedupe, costo | Corretto; dedupe troppo largo (WR-02); costo segnalato (IN-15). |
| 5 | `registrationFilter` con `startedAt: null` ⇒ `QUEST_FULL`; `initialLaneDatesOf` story/worldMission | Corretto (`classifyUnregistered` controlla `startedAt` prima di «già registrato»; GM lanes `startDate = arrivedAt = now`). |
| 6 | `abandonQuest` owner-only, id validati, log | Corretto (`@OwnsCharacter ownerOnly`, enumerato in `test/app.int-spec.ts`, `objectIdFromHex`, `requireCharacterObjectId`, soli id nei log). |
| 7 | Duplicazioni, nomi, commenti stantii, codice morto | IN-03, IN-04, IN-05, IN-07, IN-09, IN-10. Nessun letterale vietato nello SDL; nessun `$$NOW`, `console.log`, `TODO`. |
| 8 | Test: rami coperti, concorrenza con spy su `connection.transaction`, fixture | Rami principali coperti (avvio, attesa, viaggio, concorrenza, stale, abbandono con 5 codici, scioglimento 7 casi, timeout 11 casi, soccorso di gruppo 6 casi); spy presente nel timeout, assente nell'avvio (IN-14); fixture coerenti. |

---

_Reviewed: 2026-10-25T15:49:33Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
