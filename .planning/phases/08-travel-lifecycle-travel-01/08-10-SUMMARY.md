---
phase: 08-travel-lifecycle-travel-01
plan: 10
subsystem: travel
tags: [travel, bull, processor, redis, real-boot]
requires:
  - "08-05: TRAVEL_QUEUE, TRAVEL_COMPLETE_JOB, TravelJobData, travelJobId, travelJobDataOf"
  - "08-08: TravelPlanningModule (registrazione della coda 'travel'), FakeTravelQueue"
  - "08-09: TravelCompletionService.complete, TravelSweeper, TravelModule"
provides:
  - "src/travel/travel-completion.processor.ts: TravelCompletionProcessor (@Processor('travel') @Process('complete'))"
  - "TravelModule importa TravelPlanningModule e registra il processor"
  - "AppModule monta TravelModule (reconciler al boot, coda, processor nel boot reale)"
affects: [08-11, 08-12, 08-13, 08-14]
tech-stack:
  added: []
  patterns:
    - "processor Bull come semplice trigger: dati validati con travelJobDataOf, endTime > clock ⇒ nessuna scrittura e LOG, mai add dal processor (C10)"
    - "int-spec di processor con Test.createTestingModule + BullModule.forRoot su Redis effimero, SystemClock reale, attesa a polling (documento o spia del Logger)"
key-files:
  created:
    - src/travel/travel-completion.processor.ts
    - src/travel/travel-completion.processor.int-spec.ts
  modified:
    - src/travel/travel.module.ts
    - src/travel/travel-completion.int-spec.ts
    - src/app.module.ts
    - test/app.int-spec.ts
key-decisions:
  - "Il processor non ri-accoda mai un job anticipato: logga `Job di viaggio <jobId> in anticipo: lo completerà lo sweep` e lascia il lavoro allo sweep (C10)"
  - "Job malformato: WARN `Job di viaggio <job.id> malformato: ignorato` con il solo id del job, nessun dato del payload nel log"
  - "TravelModule montato in AppModule subito dopo QuestAcceptanceModule; real boot con TRAVEL_SWEEP_INTERVAL_MS='0' ⇒ TRAVEL_CONFIG { sweepIntervalMs: 0 }; schema.gql invariato"
  - "Gli harness di travel-completion.int-spec.ts sovrascrivono getQueueToken(TRAVEL_QUEUE) con FakeTravelQueue: nessun Redis nei test del service"
metrics:
  duration: 7 min
  completed: 2026-10-21
  tasks: 2
  files: 6
---

# Phase 8 Plan 10: Processor Bull del completamento e boot reale Summary

`TravelCompletionProcessor` (`@Processor('travel')`, `@Process('complete')`) valida i dati del job con `travelJobDataOf`, scarta i job malformati con un WARN che riporta il solo id del job, lascia allo sweep i job arrivati prima di `endTime` (LOG, nessuna scrittura, mai ri-accodati: C10) e altrimenti delega a `TravelCompletionService.complete`, la stessa routine idempotente dello sweep. `TravelModule` ora importa `TravelPlanningModule` (coda) e registra il processor; `AppModule` monta `TravelModule` e il boot reale lo verifica senza cambiare lo SDL.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | TravelCompletionProcessor su Redis reale | 08c66bc (RED), 413e49f (GREEN), 6191f84 (refactor: commento) |
| 2 | TravelModule nel boot reale | 347765f (RED), aa8e788 (GREEN) |

## TDD evidence (RED)

- Task 1: `npx jest src/travel/travel-completion.processor.int-spec.ts --selectProjects integration --runInBand` → `Tests: 5 failed, 1 passed, 6 total` (handler stub: nessun completamento entro la deadline di 15 s, nessun LOG/WARN). `skips a stale or archived travel` era già verde con lo stub: è una guardia negativa (nessuna scrittura) che diventa significativa solo con il processor reale.
- Task 2: `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → `Tests: 1 failed, 30 passed, 31 total`, fallisce solo `mounts the travel lifecycle` (`TravelSweeper` non risolvibile: `TravelModule` non montato).

## Verification

- `npx jest src/travel/travel-completion.processor.int-spec.ts src/travel/travel-completion.int-spec.ts --selectProjects integration --runInBand` → 2 suite, 19/19 verdi
- `npx jest src/travel --selectProjects integration --runInBand` → 3 suite, 41/41; `npx jest src/travel --selectProjects unit` → 5 suite, 61/61
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 31/31
- `npm run build` exit 0; `git diff --exit-code src/schema.gql` exit 0 dopo il real boot; eslint pulito su tutti i file toccati
- Criteri di accettazione: `@Processor(TRAVEL_QUEUE)` e `@Process(TRAVEL_COMPLETE_JOB)` una riga ciascuno; nessun `.add(` nel processor; nessun `job.finished` nell'int-spec, `queue.empty()` ×1; `TravelPlanningModule` in `travel.module.ts`; `TravelModule` ×2 in `app.module.ts`; `TRAVEL_SWEEP_INTERVAL_MS: '0'` e `mounts the travel lifecycle` ×1 in `test/app.int-spec.ts`; nessun `Co-Authored-By`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Acceptance] Commento dell'int-spec che citava `job.finished`**
- **Found during:** Task 1, controllo dei criteri di accettazione dopo il GREEN
- **Issue:** il commento dell'helper `waitFor` ("mai job.finished()") faceva trovare una riga al grep che deve restituire nulla
- **Fix:** commento riformulato senza il nome dell'API
- **Files modified:** src/travel/travel-completion.processor.int-spec.ts
- **Commit:** 6191f84

### Note

- `travel-completion.int-spec.ts` (08-09) era già verde anche prima dell'override della coda; l'override `getQueueToken(TRAVEL_QUEUE) → FakeTravelQueue` è stato aggiunto comunque, come previsto dal piano, all'array `overrides` condiviso dall'harness principale e da quello del boot, così i test del service non dipendono da un Redis.
- Nell'int-spec del processor anche `PUSH_CONFIG` è sovrascritto (`{ serviceAccount: null }`), come in 08-09; il database `travel-processor-test` viene svuotato dopo ogni test e cancellato in `afterAll`.
- `leaves an early job to the sweep` e `skips malformed job data` attendono il messaggio esatto sulla spia di `Logger.prototype` invece di una pausa fissa; la pausa di 500 ms resta solo nelle asserzioni negative (duplicato, scrittura tardiva) con un commento.
- Il test dell'anticipo verifica anche che nessun job `delayed`/`waiting` con lo stesso id esista dopo il fire (mai ri-accodato).

## Known Stubs

None.

## Self-Check: PASSED
