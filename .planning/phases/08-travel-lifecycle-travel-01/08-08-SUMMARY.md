---
phase: 08-travel-lifecycle-travel-01
plan: 08
subsystem: travel
tags: [travel, planner, bull, scheduler, roads, test-harness]
requires:
  - "08-01: ActiveTravel/TravelKind, Pet.speedModifier"
  - "08-02: codici TRAVEL_*/QUEST_IN_PROGRESS, ResourceNotFoundException.pointOfInterest, refIdOf"
  - "08-04: RoadsService.routeBetween, RoadsModule con PointOfInterest (C3)"
  - "08-05: travel-timing, travel-rules, travel-job"
provides:
  - "src/travel/travel-planner.service.ts: TravelPlanner.planFree / planAuto, FreeTravelPlan, AutoTravelRequest"
  - "src/travel/travel-scheduler.service.ts: TravelScheduler.schedule / cancel"
  - "src/travel/travel-planning.module.ts: TravelPlanningModule (coda 'travel' esportata, RoadsModule, planner, scheduler, Clock locale, niente Push)"
  - "test/travel/travel-world.ts: persistTravelWorld, TravelWorld, TRAVEL_WORLD_ROAD_SPEED"
  - "test/travel/fake-travel-queue.ts: FakeTravelQueue (add, getJob, process, on, reset, failAdd, failRemove)"
  - "test/fixtures/pet.fixture.ts: buildPet / persistPet"
affects: [08-09, 08-10, 08-11, 08-12, 08-13]
tech-stack:
  added: []
  patterns:
    - "letture lean con proiezione e tipi snapshot fuori dalla scrittura; il planner non scrive mai"
    - "accodamento Bull best-effort: WARN e nessun throw, lo sweep è la rete di sicurezza"
    - "modulo con coda Bull compilato nei test sovrascrivendo getQueueToken con un fake"
key-files:
  created:
    - src/travel/travel-planner.service.ts
    - src/travel/travel-scheduler.service.ts
    - src/travel/travel-planning.module.ts
    - src/travel/travel-planning.int-spec.ts
    - test/travel/travel-world.ts
    - test/travel/fake-travel-queue.ts
    - test/fixtures/pet.fixture.ts
  modified:
    - test/fixtures/index.ts
key-decisions:
  - "planFree: la posizione di partenza è letta con refIdOf; senza posizione o senza POI di partenza non c'è percorso ⇒ TRAVEL_NO_PATH (dopo meta, viaggio e quest)"
  - "planAuto: POI di partenza o di arrivo assente vale come nessuna strada ⇒ null + WARN coi soli id"
  - "speedFor: pet assente o documento non trovato ⇒ BASE_SPEED senza WARN; WARN solo per modificatore non valido"
  - "TravelScheduler.cancel: getJob null ⇒ nessun WARN; remove che lancia ⇒ WARN, mai throw"
  - "FakeTravelQueue con jest.fn che restituiscono Promise (non async) per tenere eslint pulito (require-await)"
metrics:
  duration: 6 min
  completed: 2026-10-21
  tasks: 2
  files: 8
---

# Phase 8 Plan 08: Travel planner e scheduler Summary

`TravelPlanner` calcola in un solo punto meta ammessa, percorso dal grafo in memoria, velocità del pet e durata (letture lean, nessuna scrittura), `TravelScheduler` accoda il job `complete` con jobId deterministico `travel-<id>-<startMs>` senza mai lanciare, e `TravelPlanningModule` li espone con la coda `travel` senza il modulo push (C6); in più mappa di prova, fake della coda e fixture del pet per le int-spec del viaggio.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Strumenti di test condivisi (mappa di prova, fake della coda, fixture del pet) | a842d27 |
| 2 | TravelPlanner, TravelScheduler e TravelPlanningModule | 13474c9 (RED), 0cbc680 (GREEN) |

## TDD evidence (RED)

- Task 1: helper di test senza comportamento di produzione, **nessun RED dedicato** (come previsto dal piano): li esercita l'int-spec del Task 2. Verificati con `npx jest test/fixtures/fixtures.spec.ts --selectProjects unit` (15/15), `npm run build`, eslint pulito.
- Task 2: `npx jest src/travel/travel-planning.int-spec.ts --selectProjects integration --runInBand` → `Test Suites: 1 failed; Tests: 22 failed, 22 total`, ogni caso con `not implemented` (modulo già cablato, corpi dei service stub).

## Verification

- `npx jest src/travel/travel-planning.int-spec.ts --selectProjects integration --runInBand` → 22/22 verdi
- `npx jest src/travel --selectProjects unit` → 4 suite, 57/57 verdi
- `npm run build` exit 0; `git diff --exit-code src/schema.gql` exit 0; eslint sui file toccati pulito
- Criteri di accettazione: nessun import di `PushModule` (0 nell'array `imports`), commento "senza il modulo push (C6)" presente; `routeBetween(` ×2 e `classifyFreeTravel(` ×1 nel planner; nessun `findById` sul personaggio (solo `activeCharacterById`); `travelJobId(` ×2 e `removeOnComplete: true` ×1 nello scheduler; nessun `new Date()`/`Date.now(` nei service
- Nessun `Co-Authored-By` nei commit

## Deviations from Plan

None - plan executed exactly as written.

### Note

- Il test opzionale `builds a complete pet` in `test/fixtures/fixtures.spec.ts` non è stato aggiunto (file fuori dalla lista `files_modified`).
- Nel RED il modulo è stato scritto già completo (forFeature, RoadsModule, registrazione della coda): serviva per poter sovrascrivere `getQueueToken('travel')` e far fallire i test sui corpi stub invece che sulla compilazione del modulo.
- `rejects a %s character` copre in un `it.each` i casi archiviato e inesistente.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova oltre al threat model (nessun resolver, nessun endpoint: i service sono consumati da 08-10..08-12).

## Self-Check: PASSED
