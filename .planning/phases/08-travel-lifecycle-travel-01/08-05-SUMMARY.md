---
phase: 08-travel-lifecycle-travel-01
plan: 05
subsystem: travel
tags: [travel, pure, bull, config, fail-closed]
requires:
  - "08-01: ActiveTravel/TravelPath/TravelKind, Pet.speedModifier"
  - "08-02: codici TRAVEL_*/QUEST_IN_PROGRESS, ResourceNotFoundException.character"
  - "08-04: RoadRoute/LonLat"
provides:
  - "src/travel/travel-timing.ts: BASE_SPEED, speedOf, durationMsOf, buildActiveTravel, ActiveTravelDraft"
  - "src/travel/travel-rules.ts: FreeTravelFacts, classifyFreeTravel (ordine fisso dei rifiuti)"
  - "src/travel/travel.updates.ts: filtri/update/classificatori di avvio, completamento (pipeline), countdown quest, teleport, scaduti + proiezioni"
  - "src/travel/travel-job.ts: TRAVEL_QUEUE 'travel', TRAVEL_COMPLETE_JOB 'complete', travelJobId, travelJobDataOf"
  - "src/config/travel-config.ts: TRAVEL_CONFIG, parseTravelConfig, readTravelEnv, travelConfigProvider (TRAVEL_SWEEP_INTERVAL_MS, default 60 000, 0 = off)"
affects: [08-08, 08-09, 08-10, 08-12, 08-13]
tech-stack:
  added: []
  patterns:
    - "regole del viaggio come funzioni pure asserite con toEqual, istante sempre passato dal chiamante (mai Date.now/$$NOW)"
    - "update a pipeline che legge la meta dal documento stesso"
    - "jobId Bull deterministico ricostruibile senza persistenza"
key-files:
  created:
    - src/travel/travel-timing.ts
    - src/travel/travel-timing.spec.ts
    - src/travel/travel-rules.ts
    - src/travel/travel-rules.spec.ts
    - src/travel/travel.updates.ts
    - src/travel/travel.updates.spec.ts
    - src/travel/travel-job.ts
    - src/travel/travel-job.spec.ts
    - src/config/travel-config.ts
    - src/config/travel-config.spec.ts
  modified:
    - src/config/env.validation.ts
    - src/config/env.validation.spec.ts
    - .env.example
key-decisions:
  - "classifyUnstarted dopo un avvio fallito: NOT_FOUND → TRAVEL_IN_PROGRESS (activeTravel presente) → QUEST_IN_PROGRESS (pendingQuest presente) → TRAVEL_IN_PROGRESS (posizione cambiata da un movimento concorrente)"
  - "classifyUnteleported: personaggio assente ⇒ NOT_FOUND, altrimenti sempre QUEST_IN_PROGRESS (la quest c'era al momento della scrittura)"
  - "travelJobDataOf: esadecimale canonico via objectIdFromHex, startTime/endTime interi sicuri ≥ 0 e startTime ≤ endTime, altrimenti null"
  - "buildActiveTravel copia le coordinate della rotta e crea startTime/endTime da getTime(): mutare now o la rotta dopo non cambia il viaggio"
  - "TRAVEL_SWEEP_INTERVAL_MS: trim, vuota ⇒ 60 000, /^\\d+$/ e ≤ 2147483647, altrimenti boot rifiutato con messaggio fisso senza valore"
metrics:
  duration: 6 min
  completed: 2026-10-21
  tasks: 3
  files: 13
---

# Phase 8 Plan 05: Regole pure del viaggio Summary

Velocità e durata dal pet (10 × speedModifier, fallback 10 con flag `invalid`), `buildActiveTravel` con `duration === endTime − startTime`, ordine fisso dei rifiuti del viaggio libero, filtri/update puri di avvio, completamento a pipeline, countdown della quest, teleport e sweep, identità deterministica del job Bull `travel-<id>-<startMs>` con dati validati, e `TRAVEL_SWEEP_INTERVAL_MS` opzionale fail-closed nel boot.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Velocità, durata, `activeTravel` e ordine dei rifiuti | b5e2dd7 (RED), 5051bbf (GREEN) |
| 2 | Filtri, update, classificatori del viaggio; identità del job | cb8c9e2 (RED), 79884b3 (GREEN) |
| 3 | Configurazione fail-closed dell'intervallo dello sweep | 5f3926c (RED), 7aa6756 (GREEN) |

## TDD evidence (RED)

- Task 1: `npx jest src/travel/travel-timing.spec.ts src/travel/travel-rules.spec.ts --selectProjects unit` → `Test Suites: 2 failed, 2 total; Tests: 25 failed, 1 passed, 26 total` (corpi `throw new Error('not implemented')`; passava solo `BASE_SPEED`).
- Task 2: `npx jest src/travel/travel.updates.spec.ts src/travel/travel-job.spec.ts --selectProjects unit` → `Test Suites: 2 failed; Tests: 31 failed, 31 total`.
- Task 3: `npx jest src/config/travel-config.spec.ts src/config/env.validation.spec.ts --selectProjects unit` → `Tests: 16 failed, 16 passed, 32 total` (parseTravelConfig/readTravelEnv, `validateEnv › travel sweep › throws…`, `.env.example › declares an empty TRAVEL_SWEEP_INTERVAL_MS`).

## Verification

- `npx jest src/travel src/config --selectProjects unit` → 210/210 verdi
- `npm run build` ok; `npx eslint` sui file toccati pulito; `git diff --exit-code src/schema.gql` → 0
- `grep -c activeCharacterById src/travel/travel.updates.ts` = 4 (import + avvio, completamento, teleport); `ACTIVE_CHARACTER_FILTER` nello sweep; nessun `$$NOW`, nessun `Date.now`/`new Date()` nei moduli puri
- Nessun `Co-Authored-By` nei commit

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Commento con `$$NOW` riformulato**
- **Found during:** Task 2
- **Issue:** il commento su `dueTravelsFilter` citava `$$NOW`, e il criterio `grep -n "\$\$NOW" src/travel/travel.updates.ts` deve restituire nulla
- **Fix:** commento riformulato ("mai l'ora del server Mongo")
- **Commit:** 79884b3

### Note

- Il criterio `grep -n "'\$status.activeTravel.to'"` su macOS (BSD grep) non trova la riga perché `$` viene letto come ancora; con `grep -nF` la riga c'è (riga 76 di `travel.updates.ts`).
- `env.validation.spec.ts` non ha una variabile `validEnv`: la base usata è `{ JWT_SECRET: VALID_SECRET }`, come negli altri casi del file. Aggiunto anche il caso `.env.example › declares an empty TRAVEL_SWEEP_INTERVAL_MS` (stesso stile dei controlli già presenti).
- `TELEPORT_PROJECTION` (`{ 'status.activeTravel.startTime': 1 }`) esportato come richiesto da <behavior>/<action>, anche se non era nella lista `exports` del frontmatter.

## Known Stubs

Nessuno: i moduli sono puri e completi; il cablaggio I/O (planner, scheduler, processor, service) arriva in 08-08..08-13 come previsto.

## Self-Check: PASSED
