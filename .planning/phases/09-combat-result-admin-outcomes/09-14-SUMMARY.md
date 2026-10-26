---
phase: 09-combat-result-admin-outcomes
plan: 14
subsystem: quests
tags: [outcomes, bull, processor, sweeper, reconciler, boot, tdd]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-10)
    provides: QUEST_RESOLUTION_QUEUE, RESOLVE_QUEST_JOB, AID_TIMEOUT_JOB, parser dei job, QuestResolutionScheduler, dueStandardQuestsPipeline, dueAidTimeoutsFilter, QUEST_CONFIG
  - phase: 09-combat-result-admin-outcomes (09-12)
    provides: createOutcomeHarness, QUIET_OUTCOME_OVERRIDES
  - phase: 09-combat-result-admin-outcomes (09-13)
    provides: QuestResolutionService.resolveStandard, RescueResolutionService.timeoutAid
provides:
  - QuestResolutionProcessor (@Process('resolve') e @Process('aid-timeout'))
  - QuestResolutionSweeper (reconciler al boot + sweep periodico, sweep() → { resolved, timedOut })
  - QuestOutcomesModule montato in AppModule (con questConfigProvider; export di QuestResolutionSweeper)
  - QUIET_SWEEP_CONFIG, IDLE_QUEST_SWEEPER, initOutcomeCollections esportati da test/quests/outcome-world.ts; opzione quiet di createOutcomeHarness
affects: [09-15, 09-16, FE Phase 9]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Trigger idempotenti sul modello Phase 8: processor (WARN se malformato, LOG se in anticipo, mai ri-accodato) + sweeper (boot mai atteso, timer unref, single-flight, in serie)"
    - "Harness degli esiti: QUIET_OUTCOME_OVERRIDES = sweep periodico spento + sweeper inerte; la suite dello sweeper passa quiet: [QUIET_SWEEP_CONFIG] e attende il reconciler del boot con sweep() (single-flight)"

key-files:
  created:
    - src/quests/outcomes/quest-resolution.processor.ts
    - src/quests/outcomes/quest-resolution.processor.int-spec.ts
    - src/quests/outcomes/quest-resolution.sweeper.ts
    - src/quests/outcomes/quest-resolution.sweeper.spec.ts
    - src/quests/outcomes/quest-resolution.sweeper.int-spec.ts
  modified:
    - src/quests/outcomes/quest-outcomes.module.ts
    - test/quests/outcome-world.ts
    - src/app.module.ts
    - test/app.int-spec.ts

key-decisions:
  - "Il processor vive dentro QuestOutcomesModule: RescueResolutionService non va esportato"
  - "Lo sweeper conta 'resolved' per entrambe le corsie; 'stale' e 'waiting' (C5) non contano"
  - "Una aid scaduta senza riferimento valido (refIdOf null) è saltata in silenzio: il filtro del DB la seleziona solo con since valorizzato"
  - "createOutcomeHarness accetta quiet (default QUIET_OUTCOME_OVERRIDES): la suite dello sweeper tiene lo sweeper vero senza duplicare l'harness"

patterns-established:
  - "Ogni harness che monta QuestOutcomesModule usa ...QUIET_OUTCOME_OVERRIDES (sweeper inerte), salvo la suite dello sweeper"

requirements-completed: []

# Metrics
duration: 11min
completed: 2026-10-24
---

# Phase 9 Plan 14: Processor, reconciler/sweep e montaggio nel boot reale Summary

**I job `resolve` e `aid-timeout` della coda `quest-resolution` chiamano `resolveStandard` e `timeoutAid` solo alla scadenza (malformato → WARN, in anticipo → LOG, mai ri-accodati). Il reconciler al boot e lo sweep periodico recuperano le corsie standard scadute e i soccorsi oltre i 7 giorni, single-flight e in serie, senza mai toccare story e worldMission. `QuestOutcomesModule` è montato nel boot reale, senza alcuna modifica allo schema.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-10-24T16:58:44Z
- **Completed:** 2026-10-24T17:10:00Z
- **Tasks:** 3 (3/3)
- **Files modified:** 9 (5 creati, 4 modificati)

## Accomplishments

- **`QuestResolutionProcessor`** (`@Processor(QUEST_RESOLUTION_QUEUE)`):
  - `resolve`: `resolveQuestJobDataOf` → se null, WARN `Job di risoluzione <id> malformato: ignorato`; se `resolutionDueAt(trigger) > clock.now()`, LOG `Job di risoluzione <jobId> in anticipo: lo risolverà lo sweep`; altrimenti `resolveStandard({ pendingQuestId, startDate })`.
  - `aid-timeout`: stessa forma con `aidTimeoutJobDataOf`, `aidTimeoutDueAt(since)` e `rescue.timeoutAid({ aidQuestId })`.
  - Nessuna chiamata a `queue.add` o allo scheduler (C10 Phase 8).
- **`QuestResolutionSweeper`:**
  - `onApplicationBootstrap` lancia il reconciler senza attenderlo; con `sweepIntervalMs > 0` avvia anche un `setInterval(...).unref()`. `onModuleDestroy` pulisce il timer.
  - `sweep()` è single-flight (`inFlight ??=`) e ritorna `{ resolved, timedOut }`.
  - `runOnce`: `now = clock.now()`; `aggregate(dueStandardQuestsPipeline(now))` → `resolveStandard` in serie; poi `find(dueAidTimeoutsFilter(now), DUE_AID_TIMEOUT_PROJECTION)` → `timeoutAid` in serie. Errori per elemento loggati con il solo id e `describeError`. LOG riassuntivo solo se c'è stato lavoro.
- **Montaggio:** `questConfigProvider`, `QuestResolutionProcessor` e `QuestResolutionSweeper` sono provider di `QuestOutcomesModule`. `AppModule` monta il modulo subito prima di `QuestResultsModule`.
- **Harness:** `QUIET_OUTCOME_OVERRIDES` = `QUIET_SWEEP_CONFIG` + `{ QuestResolutionSweeper → IDLE_QUEST_SWEEPER }`. Le suite di 09-12/09-13 e il processor test ereditano lo sweeper inerte.

## Task Commits

| # | Task | Commit | Tipo |
|---|------|--------|------|
| 1 | processor (RED) | `893272e` | test |
| 1 | processor (GREEN) | `3b5d478` | feat |
| 2 | sweeper (RED) | `1e9e6b3` | test |
| 2 | reconciler + sweep (GREEN) | `07e159e` | feat |
| 3 | boot reale (RED) | `3618371` | test |
| 3 | montaggio in AppModule (GREEN) | `cdf8cd2` | feat |

**Plan metadata:** commit `docs(phase-9): complete plan 09-14 ...` (SUMMARY, VALIDATION, deferred-items, STATE, ROADMAP)

## RED evidence

- **Task 1:** `quest-resolution.processor.int-spec.ts` → 4/4 falliti (processor vuoto: nessun job consumato, le attese con deadline scadono).
- **Task 2:**
  - `quest-resolution.sweeper.spec.ts` → 5/5 falliti (stub con `sweep()` che ritorna zero e hook vuoti).
  - `quest-resolution.sweeper.int-spec.ts` → 3 falliti / 6. I tre casi negativi (story/worldMission, viaggio, C5) passano già contro lo stub per costruzione.
- **Task 3:** `test/app.int-spec.ts` → 1 fallito / 41 (`mounts the quest outcome lifecycle`: modulo non montato).

## Verification

- `npx jest src/quests/outcomes --selectProjects unit` → 18 suite, 244/244.
- `npx jest src/quests/outcomes test/app.int-spec.ts --selectProjects integration --runInBand` → 8 suite, 98/98:
  - processor 4, sweeper 6, più resolution, combat, boss, rescue e timeout (09-12/09-13) invariati con lo sweeper inerte;
  - real boot 41.
- `git diff --exit-code src/schema.gql` → 0; whitelist invariate.
- `npm run build` → 0. Prettier e ESLint puliti sui 9 file.
- Grep di accettazione:
  - `@Process(` nel processor: 2; `queue.add|scheduleResolution|scheduleAidTimeout` nel processor: vuoto;
  - `queue.empty()` nel processor test: 1; `job.finished`: vuoto;
  - `.unref()` nello sweeper: 1; il letterale NOW di Mongo: vuoto; `dueStandardQuestsPipeline(` e `dueAidTimeoutsFilter(`: 1 ciascuno; `pendingQuestModel|pendingquests`: vuoto;
  - `IDLE_QUEST_SWEEPER` in `outcome-world.ts`: 2 righe;
  - `QuestOutcomesModule` in `app.module.ts`: 2; `QUEST_SWEEP_INTERVAL_MS: '0'` nel boot: 1.
- Nessun processo jest o redis residuo.

## Deviations from Plan

### Scostamenti minori (Rule 2/3, nessuna decisione utente toccata)

**1. `initOutcomeCollections` esportata** (`test/quests/outcome-world.ts`, commit RED del Task 1)
- Il processor test usa Redis reale e quindi `createAuthTestApp` con `BullModule.forRoot` invece di `createOutcomeHarness` (che sostituisce le code con quelle finte). Esportare l'helper evita di duplicare la pre-creazione delle collection.

**2. Opzione `quiet` di `createOutcomeHarness` e `QUIET_SWEEP_CONFIG`** (commit RED del Task 2)
- La sweeper int-spec deve tenere lo sweeper vero, ma `createOutcomeHarness` applicava sempre `QUIET_OUTCOME_OVERRIDES`. L'opzione `quiet` (default invariato) evita un secondo harness. La suite attende il reconciler del boot con `await sweeper.sweep()` (single-flight) prima del primo setup.

**3. Stub RED dello sweeper con `Promise.resolve` di zero**
- Uno stub che rigettava mandava in crash Jest (rigetto non gestito nel caso single-flight). Lo stub restituisce un conteggio a zero, e i test falliscono sulle asserzioni.

**4. Processor: helper privati `warnMalformed` / `isEarly`**
- Condivisi dai due `@Process` per non duplicare il controllo di anticipo e il WARN. I messaggi restano quelli del modello Phase 8.

**5. Progress Table della ROADMAP**
- Applicato `14/16 | In Progress`, come prescrive l'orchestratore.

Nessuna regola 4 attivata.

## Issues Encountered

- **Flake isolato del boot reale:** al primo run GREEN del Task 3, `global auth guard › rejects an existing query without a bearer or with a forged one` è fallito una volta (40/41). Non si è più riprodotto: 41/41 in tre run consecutivi e nel run finale. Il dettaglio del fallimento non è stato catturato. Registrato in `deferred-items.md` per il gate 09-16.

## Known Stubs

- `PlaceholderCombatResolver` resta l'implementazione di default della porta nel boot reale (D-02, regole di combattimento dell'utente), come già documentato in 09-12/09-13.

## Threat Flags

Nessuna superficie fuori dal threat model. T-09-67..T-09-71 mitigati:
- **T-09-67:** il parser è fail-closed e c'è il confronto con `clock.now()`. Coperto dal processor test (casi malformato e in anticipo, `getDelayed()` vuoto).
- **T-09-68:** la pipeline lavora solo sulla corsia standard. Coperto dalla sweeper int-spec (story e worldMission intatte, viaggio intatto).
- **T-09-69:** single-flight, esecuzione in serie, timer `unref`, 0 = spento. Coperto da `sweeper.spec`.
- **T-09-70:** reconciler al boot più sweep periodico.
- **T-09-71:** nei log solo id e `describeError` (un unit test verifica che il messaggio grezzo non compaia).

## Self-Check: PASSED

- FOUND: quest-resolution.processor.ts, quest-resolution.processor.int-spec.ts, quest-resolution.sweeper.ts, quest-resolution.sweeper.spec.ts, quest-resolution.sweeper.int-spec.ts
- FOUND: 893272e, 3b5d478, 1e9e6b3, 07e159e, 3618371, cdf8cd2
