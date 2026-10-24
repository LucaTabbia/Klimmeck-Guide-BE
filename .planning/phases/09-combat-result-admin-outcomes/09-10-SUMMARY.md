---
phase: 09-combat-result-admin-outcomes
plan: 10
subsystem: api
tags: [bull, scheduling, quests, travel, config, env, tdd]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-03)
    provides: AID_TIMEOUT_MS, aidTimeoutDueAt (timeout di soccorso a 7 giorni, D-10)
  - phase: 09-combat-result-admin-outcomes (09-08)
    provides: accettazione e completamento del viaggio aggiornati (guard awaitingAid, velocità con ferite)
  - phase: 08-travel-lifecycle
    provides: TravelScheduler, travel-job, queue-call-timeout (withinTimeout), travel-config, TravelPlanningModule, FakeTravelQueue
provides:
  - env opzionale fail-closed QUEST_SWEEP_INTERVAL_MS (vuota = 60 000, 0 = sweep spento) con parser condiviso col viaggio (src/config/sweep-interval.ts)
  - coda Bull 'quest-resolution' con job 'resolve' (jobId quest-<pqId>-<startMs>) e 'aid-timeout' (jobId aid-<aidQuestId>)
  - parser dei dati dei job come input non fidato (resolveQuestJobDataOf, aidTimeoutJobDataOf) e resolutionDueAt
  - dueStandardQuestsPipeline (sola corsia standard dei personaggi attivi) e dueAidTimeoutsFilter per lo sweep
  - QuestResolutionScheduler (scheduleResolution, scheduleAidTimeout) e QuestResolutionSchedulingModule senza Push
  - helper comune enqueueTrigger (best-effort, timeout, WARN, nessuna compensazione), usato anche da TravelScheduler
  - accodamento del job di scadenza dopo il commit in QuestAcceptanceService.accept (standard senza viaggio) e TravelCompletionService.complete (arrivo da quest)
affects: [09-12, 09-13, 09-14, 09-16]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Trigger Bull best-effort condiviso: enqueueTrigger(queue, { name, data, jobId, dueAt }, { clock, timeoutMs, logger, subject, fallback })"
    - "Esito raccolto nel callback della transazione (azzerato a ogni riesecuzione), job accodato solo dopo il commit"
    - "findOneAndUpdate con returnDocument 'after' sul filtro startDate: null: solo il countdown appena partito produce il trigger"

key-files:
  created:
    - src/config/sweep-interval.ts
    - src/config/quest-config.ts
    - src/config/quest-config.spec.ts
    - src/queues/enqueue-trigger.ts
    - src/quests/outcomes/scheduling/quest-resolution-job.ts
    - src/quests/outcomes/scheduling/quest-resolution-job.spec.ts
    - src/quests/outcomes/scheduling/quest-resolution.updates.ts
    - src/quests/outcomes/scheduling/quest-resolution.updates.spec.ts
    - src/quests/outcomes/scheduling/quest-resolution.scheduler.ts
    - src/quests/outcomes/scheduling/quest-resolution.scheduler.spec.ts
    - src/quests/outcomes/scheduling/quest-resolution-scheduling.module.ts
  modified:
    - src/config/travel-config.ts
    - src/config/env.validation.ts
    - src/config/env.validation.spec.ts
    - .env.example
    - src/travel/travel-job.ts
    - src/travel/travel-scheduler.service.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.module.ts
    - src/travel/travel-completion.service.ts
    - src/travel/travel.module.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/quests/acceptance/accept-quest.resolver.int-spec.ts
    - src/travel/travel-completion.int-spec.ts
    - src/travel/travel-completion.processor.int-spec.ts
    - src/travel/travel-planning.int-spec.ts
    - src/travel/travel.service.int-spec.ts
    - src/travel/travel.resolver.int-spec.ts
    - src/travel/teleport.resolver.int-spec.ts

key-decisions:
  - "TriggerContext ha un campo fallback: le spec del viaggio asseriscono letteralmente 'lo completerà lo sweep', quindi il viaggio conserva il suo testo e la risoluzione usa 'lo risolverà lo sweep'"
  - "Il job di risoluzione all'arrivo nasce dal findOneAndUpdate sul filtro startDate: null: un countdown già partito non produce un secondo trigger"
  - "startDate e waitingTime dell'accettazione calcolati una volta prima della transazione (un solo clock.now()), usati sia nel create sia nel trigger"

patterns-established:
  - "Modulo 'coda + scheduler senza Push' importabile da accettazione, viaggio ed esiti senza cicli"
  - "Override getQueueToken(QUEST_RESOLUTION_QUEUE) con FakeTravelQueue in ogni suite che monta accettazione o viaggio; queue.empty() nell'afterAll della suite con Redis reale"

requirements-completed: []

# Metrics
duration: 10min
completed: 2026-10-24
---

# Phase 9 Plan 10: Quest resolution scheduling Summary

**La coda Bull 'quest-resolution' riceve trigger deterministici (`quest-<pqId>-<startMs>`, `aid-<aidQuestId>`) dopo il commit, sia quando un'accettazione standard senza viaggio scrive `startDate` sia quando l'arrivo di un viaggio da quest la scrive. Lo scheduler è best-effort con timeout. L'env `QUEST_SWEEP_INTERVAL_MS` è opzionale e fail-closed, e condivide il parser con il viaggio.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-10-24T16:15:49Z
- **Completed:** 2026-10-24T16:25:00Z
- **Tasks:** 3
- **Files modified:** 29 (11 creati, 18 modificati)

## Accomplishments

- Config: `parseSweepIntervalMs(name, raw)` condiviso; `travel-config` lo usa senza cambiare comportamento (`travel-config.spec.ts` verde e invariato). `quest-config.ts` aggiunge `QUEST_CONFIG`, `parseQuestConfig`, `readQuestEnv` e `questConfigProvider`. `validateEnv` rifiuta un valore malformato. `.env.example` dichiara `QUEST_SWEEP_INTERVAL_MS=` vuota.
- Job: nomi della coda e dei job, jobId senza `:`. I parser rifiutano id non esadecimali, istanti negativi o non interi e `waitingTime` negativo. `isEpochMs` di `travel-job.ts` è ora esportata.
- Query dello sweep: `dueStandardQuestsPipeline(now)` (match sui personaggi attivi con `pendingQuest`, `$lookup` su `pendingquests`, `startDate` non nulla, `$expr` con `now` preso dal Clock) e `dueAidTimeoutsFilter(now)` (`status.awaitingAid.since` ≤ now − 7 giorni).
- `QuestResolutionScheduler` con un WARN Redis unico senza dettagli di connessione, più `QuestResolutionSchedulingModule` (coda + scheduler + Clock + timeout, nessun PushModule).
- `enqueueTrigger` (`src/queues/enqueue-trigger.ts`): `removeOnComplete: true`, `removeOnFail: false`, `withinTimeout`, un WARN in caso di timeout o errore. `TravelScheduler.schedule` ora passa dall'helper (refactor).
- C8: `QuestAcceptanceService.accept` accoda `resolve` solo per la corsia standard con `startDate` (marker = posizione o salto senza strada). Nessun job per viaggio, story, worldMission o rifiuto. `TravelCompletionService.complete` accoda `resolve` con `startDate = endTime` pianificato solo quando il countdown è appena partito. Coda irraggiungibile: l'accettazione o l'arrivo vanno a buon fine comunque, con un WARN.

## Task Commits

1. **Task 1: env opzionale, job e filtri puri delle scadenze**
   - `e3f3299` test(config): specify the quest sweep interval and resolution jobs (RED)
   - `88e73ae` feat(config): add the quest sweep interval and resolution jobs (GREEN)
   - `eca40b4` refactor(outcomes): keep the Mongo NOW literal out of the pipeline
2. **Task 2: QuestResolutionScheduler, modulo e helper comune**
   - `ca03f41` test(outcomes): specify the quest resolution scheduler (RED)
   - `f739413` test(outcomes): import the scheduler fakes by relative path (RED corretto)
   - `67b4556` feat(outcomes): add the quest resolution scheduler (GREEN)
   - `9c22a4f` refactor(travel): share the best-effort trigger enqueue
   - `dbe0fcf` refactor(outcomes): infer the trigger job data type
3. **Task 3: accodamento dopo il commit, override nelle suite (C8)**
   - `3d7fe3d` test(quests): specify resolution jobs after acceptance and arrival (RED)
   - `88d8908` feat(quests): schedule quest resolution when the countdown starts (GREEN)

## RED evidence

- Task 1: `npx jest src/config src/quests/outcomes/scheduling --selectProjects unit` → 4 suite fallite (`Cannot find module './quest-resolution.updates'`, `'./quest-resolution-job'`, quest-config assente; 2 test di `env.validation.spec.ts` falliti: validazione e `.env.example`).
- Task 2: `npx jest src/quests/outcomes/scheduling/quest-resolution.scheduler.spec.ts --selectProjects unit` → `Cannot find module './quest-resolution.scheduler'` (dopo la correzione degli import dei fake).
- Task 3: `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts src/travel/travel-completion.int-spec.ts --selectProjects integration --runInBand` → 7 falliti / 85 passati: i 4 casi positivi dell'accettazione e i 3 dell'arrivo (i casi "nessun job" passano già, come atteso).

## Verification

- `npx jest src/config src/quests src/travel --selectProjects unit` → 35 suite, 642 test verdi
- `npx jest src/quests/acceptance src/travel --selectProjects integration --runInBand` → 8 suite, 193 test verdi (inclusa la suite del processor con Redis reale)
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 40 test verdi; `git diff --exit-code src/schema.gql` pulito
- `npm run build` pulito; prettier + eslint puliti su tutti i file toccati
- Criteri di accettazione: `grep -c "^QUEST_SWEEP_INTERVAL_MS=$" .env.example` = 1; `scheduleResolution(` 1 volta per servizio; `this.clock.now()` 1 volta nell'accettazione; 8 int-spec con `getQueueToken(QUEST_RESOLUTION_QUEUE)`; awk sulla transazione del completamento = 0; `enqueueTrigger(` 3 righe; nessun `PushModule` nel modulo di scheduling

## Decisions Made

- `TriggerContext.fallback`: il piano permetteva di uniformare i WARN del viaggio solo se nessuna spec li asseriva. Tre int-spec del viaggio e una dell'accettazione asseriscono "lo completerà lo sweep", quindi ho conservato quel testo con un campo `fallback`, come prevede il piano stesso.
- Il trigger all'arrivo usa `findOneAndUpdate` (`returnDocument: 'after'`, projection `startDate`/`waitingTime`), come prescritto: `waitingTime` mancante vale 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Il criterio `grep -rnF '$$NOW' src/quests/outcomes` contraddiceva il commento prescritto**
- **Found during:** Task 1
- **Issue:** il piano imponeva il commento "now dal Clock, mai $$NOW" nel file della pipeline e l'asserzione `not.toContain('$$NOW')` nella spec, mentre il criterio di accettazione richiede un grep vuoto.
- **Fix:** il commento ora dice "mai la variabile NOW del server Mongo". Il letterale resta solo nell'asserzione negativa della spec, che il piano prescrive: il grep sui file non-spec è vuoto.
- **Files modified:** src/quests/outcomes/scheduling/quest-resolution.updates.ts
- **Commit:** eca40b4

**2. [Rule 3 - Blocking] Import `test/...` non risolvibile nel progetto unit di Jest**
- **Found during:** Task 2 (RED)
- **Issue:** la prima spec dello scheduler importava `test/auth/fixed-clock` come modulo assoluto, quindi il RED falliva per il motivo sbagliato.
- **Fix:** percorsi relativi (`../../../../test/...`), come nelle altre suite; commit `test` aggiuntivo, nessuna riscrittura della storia.
- **Files modified:** src/quests/outcomes/scheduling/quest-resolution.scheduler.spec.ts
- **Commit:** f739413

**3. [Rule 1 - Criterio] `enqueueTrigger<QuestResolutionJobData>(` non era visto dal grep `enqueueTrigger(`**
- **Found during:** Task 2
- **Fix:** ho tolto il generico esplicito, che il compilatore inferisce dalla coda tipata. Build e test restano verdi.
- **Files modified:** src/quests/outcomes/scheduling/quest-resolution.scheduler.ts
- **Commit:** dbe0fcf

**4. [Nota] Export aggiuntivo `DEFAULT_QUEST_SWEEP_INTERVAL_MS`**
- Simmetrico a `DEFAULT_TRAVEL_SWEEP_INTERVAL_MS`, usato dalla spec; nessun impatto sui consumatori.

**5. [Nota] Riga della Progress Table del ROADMAP**
- Il piano indicava `10/16`. Seguo l'istruzione dell'orchestratore: `11/16` (09-01..09-11).

---

**Total deviations:** 3 auto-fixed (2 di criterio/bug, 1 bloccante) e 2 note
**Impact on plan:** nessun cambio di scope né di decisioni utente.

## Issues Encountered

- Fino a 09-14 i job della coda `quest-resolution` si accumulano senza consumatore: è atteso sul branch, come dichiarato dal piano.

## Known Stubs

Nessuno.

## User Setup Required

Nessuno: `QUEST_SWEEP_INTERVAL_MS` è opzionale (vuota = 60 000 ms).

## Next Phase Readiness

- 09-12/09-13 possono usare `scheduleAidTimeout` alla creazione di una aid; 09-14 registra il processor sulla coda `quest-resolution` (`resolveQuestJobDataOf` / `aidTimeoutJobDataOf`), lo sweeper (`dueStandardQuestsPipeline`, `dueAidTimeoutsFilter`, `questConfigProvider`) e il reconciler al boot.

## Self-Check: PASSED

- File creati: tutti presenti (verificati con `test -f`)
- Commit: e3f3299, 88e73ae, eca40b4, ca03f41, f739413, 67b4556, 9c22a4f, dbe0fcf, 3d7fe3d, 88d8908 presenti in `git log`
