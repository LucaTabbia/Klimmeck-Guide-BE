---
phase: 09-combat-result-admin-outcomes
plan: 19
subsystem: quest-party
tags: [party, boss, aid, abandon, timeout, push, schema, user-decisions]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-12, 09-13, 09-17, 09-18)
    provides: risoluzione standard/boss/soccorso, roster di gruppo, aid di gruppo con rescue.characters, CharacterArchiver, scheduler quest-resolution
provides:
  - PendingQuest.arrivedAt e QuestRegistration.registeredAt sul filo, Quest.startedAt interno
  - QuestStartService (unico scrittore di startDate della corsia standard e unico punto che accoda i job resolve)
  - abandonQuest(request: AbandonQuestRequest!): CommonResponse! owner-only, codice QUEST_NOT_WAITING
  - PartyTimeoutService (disband a 24 ore, releaseRegistered, backfillRegisteredAt), job party-timeout, push questCancelled
  - timer della aid sospeso solo dalla aid in corso (AID_TIMEOUT_NOT_IN_PROGRESS)
affects: [FE branch feat/party-waiting (etichetta, abbandono, questCancelled), BE Phase 10 (indici dello sweep), PR #13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Arrivo ≠ avvio: arrivedAt scritto da accettazione/viaggio, startDate scritto solo da QuestStartService"
    - "Claim per identità del party ($all + $size + startedAt: null) condiviso da avvio e scioglimento"
    - "PartyModule senza push (importabile dall'harness nudo dell'accettazione), PartyLifecycleModule con push e resolver"

key-files:
  created:
    - src/quests/party/party-rules.ts
    - src/quests/party/party-rules.spec.ts
    - src/quests/party/quest-start.service.ts
    - src/quests/party/quest-start.int-spec.ts
    - src/quests/party/party.module.ts
    - src/quests/party/party-lifecycle.module.ts
    - src/quests/party/party-abandon.service.ts
    - src/quests/party/party-abandon.int-spec.ts
    - src/quests/party/party.resolver.ts
    - src/quests/party/party-timeout.service.ts
    - src/quests/party/party-timeout.int-spec.ts
    - src/models/request/abandon-quest-request.model.ts
    - .planning/phases/09-combat-result-admin-outcomes/09-19-SUMMARY.md
  modified:
    - src/models/pending-quest.model.ts
    - src/models/quest/quest-registration.model.ts
    - src/models/quest/quest.model.ts
    - src/gameRules/game-rule-error-code.enum.ts
    - src/gameRules/game-rule.exception.ts
    - src/gameRules/game-rule.exception.spec.ts
    - src/push/push-event-type.enum.ts
    - src/push/push-events.ts
    - src/push/push-events.spec.ts
    - src/push/push.exception.spec.ts
    - src/app.module.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.updates.ts
    - src/quests/acceptance/quest-acceptance.updates.spec.ts
    - src/quests/acceptance/quest-acceptance.module.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/travel/travel-completion.service.ts
    - src/travel/travel.updates.ts
    - src/travel/travel.updates.spec.ts
    - src/travel/travel.module.ts
    - src/travel/travel-completion.int-spec.ts
    - src/quests/outcomes/scheduling/quest-resolution-job.ts
    - src/quests/outcomes/scheduling/quest-resolution-job.spec.ts
    - src/quests/outcomes/scheduling/quest-resolution.scheduler.ts
    - src/quests/outcomes/scheduling/quest-resolution.scheduler.spec.ts
    - src/quests/outcomes/scheduling/quest-resolution.updates.ts
    - src/quests/outcomes/scheduling/quest-resolution.updates.spec.ts
    - src/quests/outcomes/quest-resolution.processor.ts
    - src/quests/outcomes/quest-resolution.processor.int-spec.ts
    - src/quests/outcomes/quest-resolution.sweeper.ts
    - src/quests/outcomes/quest-resolution.sweeper.spec.ts
    - src/quests/outcomes/quest-resolution.sweeper.int-spec.ts
    - src/quests/outcomes/quest-outcomes.module.ts
    - src/quests/outcomes/quest-outcome-plan.ts
    - src/quests/outcomes/quest-outcome-plan.spec.ts
    - src/quests/outcomes/aid/aid-timeout.ts
    - src/quests/outcomes/aid/aid-timeout.spec.ts
    - src/quests/outcomes/aid-timeout.int-spec.ts
    - src/quests/outcomes/rescue-resolution.service.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/characters/deletion/character-archiver.ts
    - src/characters/deletion/character-archiver.int-spec.ts
    - src/schema.gql
    - test/app.int-spec.ts
    - test/quests/outcome-world.ts
    - .planning/phases/09-combat-result-admin-outcomes/09-CONTEXT.md
    - .planning/phases/09-combat-result-admin-outcomes/BACKEND-NOTES.md
    - .planning/phases/05-infrastruttura-push-fcm/BACKEND-NOTES.md
    - .planning/phases/09-combat-result-admin-outcomes/09-VALIDATION.md
    - .planning/phases/09-combat-result-admin-outcomes/09-VERIFICATION.md
    - .planning/ROADMAP.md
    - .planning/STATE.md

key-decisions:
  - "Decisioni dell'utente (2026-10-25): \"Per quanto riguarda le missioni boss: per poterle cominciare il party dev'essere al completo, quindi tutti restano in attesa. Lo stesso vale per le missioni aid legate a chi fallisce la missione boss.\"; \"bisogna dare la possibilità di abbandonare la quest boss durante il momento dell'attesa. Se entro 24 ore i posti non diventano pieni, allora la missione viene annullata in automatico per tutti. Il timer si cancella solo a party completo.\""
  - "startDate del gruppo = arrivo più tardo pianificato (max(arrivedAt)), mai l'ora di elaborazione: default tecnico proposto all'utente, 2026-10-25"
  - "Abbandono ammesso solo sul marker in attesa, non in viaggio: default tecnico proposto all'utente, 2026-10-25"
  - "Finestra delle 24 ore ancorata alla registrazione più vecchia del party corrente, non riavviata dopo un abbandono; registrazioni legacy retrodatate a now dallo sweep una volta: default tecnico proposto all'utente, 2026-10-25"
  - "Un party pieno con un membro ancora in viaggio non scade; un posto liberato dopo l'avvio non ferma la quest e nessuno può più entrare: default tecnico proposto all'utente, 2026-10-25"
  - "Chi era in viaggio verso una quest sciolta arriva come viaggio da quest senza countdown; tryStart su una quest inesistente ⇒ WARN con soli id: default tecnico proposto all'utente, 2026-10-25"
  - "Le push questCancelled vanno ai proprietari dei membri effettivamente liberati (PendingQuest cancellata), sia nello scioglimento sia nel timeout della aid"

patterns-established:
  - "Arrivo e avvio separati: un solo servizio scrive startDate e accoda i job resolve"
  - "Claim per identità della Quest per avvio e scioglimento: le due operazioni si escludono a vicenda"

requirements-completed: [BE-COMBAT-03]

# Metrics
duration: ~110min
completed: 2026-10-25
---

# Phase 9 Plan 19: avvio a party completo, abbandono, scioglimento a 24 ore Summary

**Boss, aid ed enemy cominciano solo con tutti i posti pieni e tutti sul marker. `PendingQuest.arrivedAt` segna l'arrivo, mentre `startDate` lo scrive soltanto `QuestStartService`: stesso istante per tutto il party, l'arrivo più tardo. Chi aspetta può abbandonare con `abandonQuest`. Se in 24 ore i posti non si riempiono il party viene sciolto e i membri ricevono la push `questCancelled`. Il timer della aid si sospende solo quando il soccorso è avviato e ha ancora soccorritori.**

## Performance

- **Duration:** ~110 min
- **Completed:** 2026-10-25
- **Tasks:** 6
- **Files modified:** 69 (12 creati, 57 modificati) più questo SUMMARY

## Accomplishments

- **Modelli:** `PendingQuest.arrivedAt` (sul filo, default null) e `QuestRegistration.registeredAt` (sul filo, senza default). `Quest.startedAt` resta interno e non compare nello schema; il boot reale lo tratta come letterale vietato.
- **`party-rules.ts` (puro):** `PARTY_TIMEOUT_MS`, `partyReadinessOf`, `partyFormingSinceOf`, `isPartyExpired`, `partyTimeoutDueAt`, `partyClaimFilter`, `abandonClaimFilter`, `initialLaneDatesOf`.
- **`QuestStartService.tryStart`:**
  - quest non registrate: `startDate = arrivedAt` con un update a pipeline;
  - quest registrate: legge il party con gli stessi filtri del roster di gruppo; se il party è pronto, claim per identità su `startedAt`, poi `updateMany` degli `startDate` nella stessa transazione e job `resolve` dopo il commit;
  - quest inesistente: WARN con soli id, esito `stale`.
- **Ricablaggio:**
  - l'accettazione scrive `arrivedAt` e `registeredAt` e chiama `tryStart` sul marker;
  - `registrationFilter` riafferma `startedAt: null`, quindi una quest avviata risponde `QUEST_FULL`;
  - l'arrivo del viaggio scrive `arrivedAt` (`questArrivalFilter`/`questArrivalUpdate`) e chiama `tryStart` dopo il commit;
  - lo sweep avvia le quest arrivate e non partite, una volta per quest;
  - un boss perso azzera `startedAt`.
- **Abbandono:** `PartyAbandonService` fa il claim con `deleteOne` sulla PendingQuest in attesa e usa la rilettura solo per scegliere il codice (`NOT_FOUND` o `QUEST_NOT_WAITING`). Svuota poi la corsia e libera il posto. `PartyResolver.abandonQuest` è owner-only. `PartyLifecycleModule` è montato in `AppModule`.
- **24 ore:**
  - `PartyTimeoutService.disband` fa il claim per identità con `returnDocument: 'before'` e libera solo i membri restituiti dal claim (PendingQuest non avviate di questa quest), poi invia `questCancelled` dopo il commit;
  - c'è anche `releaseRegistered(questId, session)` per il timeout della aid;
  - `backfillRegisteredAt` retrodata a `now` le registrazioni legacy;
  - il job `party-timeout` (jobId `party-<questId>-<sinceMs>`) parte alla prima registrazione che lascia posti liberi, con scheduler e processor dedicati;
  - ordine dello sweep: backfill → avvii → scioglimenti → risoluzioni → timeout delle aid.
- **Timer della aid:**
  - il claim è `AID_TIMEOUT_NOT_IN_PROGRESS` (`$or: [{ startedAt: null }, { registeredAdventurers: { $size: 0 } }]`);
  - `timeoutAid` segue l'ordine claim → morti → `releaseRegistered` nella stessa transazione, poi `questCancelled` ai liberati;
  - l'archivio rimette `startedAt` a null sulle quest aperte rimaste senza registrati.
- **Documenti:**
  - CONTEXT: D-05, D-06, D-08, D-10 (C5) e D-24 emendate, con le citazioni verbatim e i default tecnici;
  - BACKEND-NOTES Phase 9: §0, §1, §2, §4, §5, §6, §10, §12 (h/i/j), §13, §14, §15 e §16, compreso il follow-up del contatore del party live chiesto dall'orchestratore;
  - catalogo push della Phase 5;
  - VALIDATION, VERIFICATION, ROADMAP (19/19) e STATE.

## Task Commits

1. **Task 1 RED:** `b6c73ea` test(party): start a quest only when the party is complete (58)
2. **Task 1 GREEN:** `429389e` feat(party): add the party start service and the arrival fields (63)
3. **Task 2 RED:** `eca3110` test(party): wire the party start into acceptance, travel, sweep (64)
4. **Task 2 GREEN:** `c34747c` feat(party): start registered quests only with a full party (59)
5. **Task 3 RED:** `2d2df6f` test(party): abandon a quest while waiting for the party (56)
6. **Task 3 GREEN:** `0658fab` feat(party): let a waiting adventurer abandon the quest (55)
7. **Task 4 RED:** `9cdacae` test(party): disband a party not full after 24 hours (52)
8. **Task 4 GREEN:** `58bd74a` feat(party): disband a party whose seats stay open for 24 hours (63)
9. **Task 5 RED:** `017d629` test(outcomes): suspend the aid timer only while the rescue runs (64)
10. **Task 5 GREEN:** `96a3369` feat(outcomes): suspend the aid timer only while the rescue runs (64)
11. **Task 6:** `8bbdb2a` docs(phase-9): document the party start, abandon and 24h disband (64)

Non è servito alcun commit di refactor separato.

## Gate (Task 5)

- `npm run test:unit`: **122 suite / 1827 test** passati
- `npm run test:int`: **75 suite / 967 test** passati (foreground, `--runInBand`; il flaky noto del boot reale non si è presentato)
- `npm run build`: exit 0; `git diff --exit-code src/schema.gql` pulito
- `git diff origin/develop -- src/schema.gql`: nessuna riga rimossa. Righe aggiunte rispetto a 95c4045: `input AbandonQuestRequest { id: String! questId: String! }`, `abandonQuest(request: AbandonQuestRequest!): CommonResponse!`, `arrivedAt: DateTime` (PendingQuest), `registeredAt: DateTime` (QuestRegistration), `questCancelled` (PushEventType). `startedAt` compare 0 volte.
- `grep -rn 'AID_TIMEOUT_REQUIRES_NO_RESCUER' src test` vuoto; `grep -rn "un soccorritore è registrato" src` vuoto; `scheduleResolution(` si trova solo nello scheduler e in `quest-start.service.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `push.exception.spec.ts` enumera i valori di `PushEventType`**
- **Found during:** Task 4 GREEN
- **Issue:** la spec controlla con `toEqual` la lista dei valori dell'enum. Con `questCancelled` falliva, ma il file non era nella lista del piano.
- **Fix:** aggiunto `'questCancelled'` alla lista attesa.
- **Commit:** `58bd74a`

**2. [Rule 3 - Blocking] Costruttore di `QuestResolutionSweeper` e relativa spec unit**
- **Found during:** Task 2 RED e Task 4 RED
- **Issue:** lo sweeper ora riceve `QuestStartService`, `PartyTimeoutService` e il modello `Quest` (per `formingPartiesFilter`). La spec unit (`quest-resolution.sweeper.spec.ts`), che nella lista del piano compare solo per il Task 2, va aggiornata anche nel Task 4. Il test "runs a single sweep at a time" ora verifica il single-flight su `backfillRegisteredAt`, che è il primo passo dello sweep.
- **Commit:** `eca3110`, `9cdacae`

**3. [Rule 2] `game-rule.exception.spec.ts` copre `questNotWaiting`**
- **Found during:** Task 3 RED
- **Issue:** la tabella delle eccezioni nella spec copre ogni factory. Il codice nuovo non era coperto, e il file non era nella lista del piano.
- **Commit:** `2d2df6f`

**4. [Rule 2] Filtri di liberazione più stretti**
- `releaseMembers` cancella la PendingQuest solo se è di **questa** quest (`quest ∈ idForms(questId)`) oltre che `startDate: null`. Una corsia incoerente non può far cancellare la PendingQuest di un'altra quest.
- `backfillRegisteredAt` usa `registeredAdventurers: { $elemMatch: { registeredAt: null } }` invece di `'registeredAdventurers.registeredAt': null`, che matcherebbe anche gli array vuoti. Il comportamento resta quello del piano.
- **Commit:** `58bd74a`

**5. Push di `timeoutAid` tramite `PartyTimeoutService.notifyCancelled`**
- Il piano indicava `loader.ownersOf` + push in `rescue-resolution.service.ts`. Ho riusato il `notifyCancelled` pubblico del servizio del party, che usa lo stesso `ownersOf` dello scioglimento, per non duplicare la consegna (Clean Code). Il comportamento è identico: push best-effort dopo il commit ai proprietari dei liberati.
- **Commit:** `96a3369`

**6. Istruzione dell'orchestratore durante l'esecuzione (solo documentazione)**
- In BACKEND-NOTES §16, fra i punti aperti, c'è il «**Follow-up BE/FE — contatore del party live:** …» con il testo richiesto. In §10, dopo il paragrafo sull'etichetta, c'è la stessa nota in una riga.
- **Commit:** `8bbdb2a`

### Scelte minori

- `QuestSweepCounts` resta `{ resolved, timedOut }`: i conteggi nuovi (registrazioni retrodatate, avvii, scioglimenti) vanno solo nel log dello sweep, così il contratto delle int-spec esistenti non cambia.
- In `classifyUnregistered`, `startedAt` valorizzato ⇒ `QUEST_FULL` viene controllato prima del controllo "già registrato".
- `QuestStartService` non avvia mai story né worldMission (`laneOf !== standard` ⇒ `stale`), anche se worldMission è un tipo registrato.
- `ResolutionQuest` ora dichiara `startedAt?` (Boy Scout) e il commento di `resolveRescue` non parla più di risoluzione senza party completo.
- Nella sezione C5 di BACKEND-NOTES §6 e di CONTEXT D-10 il testo precedente è conservato come "superato da 09-19", per tracciabilità.
- In STATE sono aggiornati anche "Last session"/"Stopped at", che erano fermi a 09-16.
- Una run combinata di integration (`src/quests/party` + boot reale) è rimasta appesa una volta, senza output, ed è stata terminata. Rilanciata subito, è passata in 6,6 s (59/59), e anche le due suite da sole sono passate. Da lì in poi ho lanciato ogni run in foreground con un limite di tempo esplicito e il log su file. Il gate completo non ha avuto problemi.

## Known Stubs

Nessuno nuovo. Resolver di combattimento e tabelle restano segnaposto per scelta dell'utente (A2, BACKEND-NOTES §11).

## Threat Flags

Nessuna superficie fuori dal threat model: la mutation `abandonQuest` è T-09-91 (owner-only, claim sulla PendingQuest in attesa) ed è nell'enumerazione owner-only del boot reale.

## Next Phase Readiness

- Dopo il push dell'orchestratore, la PR #13 riceve gli undici commit di 09-19 più questo SUMMARY.
- Il branch FE `feat/party-waiting` può consumare `arrivedAt`, `abandonQuest` e `questCancelled` così come sono nello schema.
- Phase 10: indici per le query dello sweep e follow-up del contatore del party live (BACKEND-NOTES §14/§16).

## Self-Check: PASSED
