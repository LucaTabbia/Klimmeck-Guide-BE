---
phase: 08-travel-lifecycle-travel-01
plan: 11
subsystem: quests
tags: [quests, acceptance, travel, transactions, bull]
requires:
  - "08-06: laneClaimFilter con 'status.activeTravel': null, accept lane-aware con la città solo per QuestLane.standard"
  - "08-08: TravelPlanner.planAuto (null = salto istantaneo), TravelScheduler.schedule, TravelPlanningModule, FakeTravelQueue, persistTravelWorld"
provides:
  - "quest-acceptance.updates.ts: LaneMovement ({ kind: 'travel', travel } | { kind: 'jump', marker }) e laneClaimUpdate(lane, pendingQuestId, movement = null)"
  - "quest-acceptance.service.ts: accept esteso con movementTo (planAuto prima della transazione), activeTravel/salto nello stesso update del claim, startDate null in viaggio, scheduler.schedule dopo il commit"
  - "quest-acceptance.module.ts: importa TravelPlanningModule (mai PushModule, C6)"
affects: [08-12, 08-13, 08-14]
tech-stack:
  added: []
  patterns:
    - "movimento verso il marker come campo opzionale dello stesso $set del claim della corsia: un rifiuto in transazione annulla anche il viaggio"
    - "accodamento Bull solo dopo che connection.transaction ha risolto, best-effort"
key-files:
  created: []
  modified:
    - src/quests/acceptance/quest-acceptance.updates.ts
    - src/quests/acceptance/quest-acceptance.updates.spec.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.module.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/quests/acceptance/accept-quest.resolver.int-spec.ts
key-decisions:
  - "Il movimento si calcola solo quando c'è una location attesa (corsia standard): story e worldMission non si muovono mai (D-02)"
  - "Marker uguale alla posizione (sameId) o marker non leggibile ⇒ nessun movimento e startDate = clock.now() (D-02)"
  - "planAuto null ⇒ salto: status.location = marker nello stesso $set del claim, nessun activeTravel, startDate ora; il WARN coi soli id resta nel planner (D-03)"
  - "Il filtro del claim continua a riaffermare status.location = posizione di partenza: il salto è scritto dallo stesso update che verifica la partenza"
metrics:
  duration: 12 min
  completed: 2026-10-21
  tasks: 2
  files: 6
---

# Phase 8 Plan 11: Viaggio automatico dall'accettazione della quest Summary

`QuestAcceptanceService.accept` (esteso, un solo `async accept(`) calcola prima della transazione il movimento verso il marker della quest standard con `TravelPlanner.planAuto`, lo scrive nello stesso `findOneAndUpdate` del claim della corsia (`status.activeTravel` per il viaggio, `status.location` per il salto istantaneo), crea il `PendingQuest` con `startDate: null` quando c'è viaggio e accoda il job di completamento con `TravelScheduler.schedule` solo dopo il commit; `QuestAcceptanceModule` importa `TravelPlanningModule` e non `PushModule` (C6).

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Movimento nello stesso update del claim e accettazione estesa | 38364e1 (RED), 1699e03 (GREEN) |
| 2 | Filo: activeTravel e startDate null su characterUpdated dopo acceptQuest | ddb8c4e (test, caratterizzazione) |

## TDD evidence (RED)

- **Task 1 unit:** `npx jest src/quests/acceptance/quest-acceptance.updates.spec.ts --selectProjects unit` → `Tests: 2 failed, 20 passed, 22 total` (i casi `travel` e `jump` di `laneClaimUpdate`; i due casi senza movimento erano verdi, comportamento invariato).
- **Task 1 integration:** `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand` → `Tests: 7 failed, 53 passed, 60 total`: tutti e 7 i casi del describe `automatic travel to the quest marker (D-02, D-03, D-21)` con `Nest could not find RoadsService element` (modulo senza `TravelPlanningModule`). Le 53 esistenti restavano verdi con l'override della coda e le collection nuove.
- **Task 2:** il RED previsto dal piano (harness che non compila senza l'override della coda) **non si è verificato**: prima di toccare il file l'int-spec del resolver era già verde (20/20) dopo il Task 1, perché `BullModule.registerQueue` crea la coda pigramente e nessuna accettazione esistente accodava (marker non persistiti ⇒ salto). Il nuovo caso `streams the automatic travel and a null startDate on characterUpdated` è passato al primo run (21/21): è una **caratterizzazione sul filo** del codice del Task 1, nessun `fix(quests)` necessario. L'override `getQueueToken(TRAVEL_QUEUE) → FakeTravelQueue` è stato aggiunto comunque (nessun Redis reale nei test, `queue.added` verificato).

## Verification

- `npx jest src/quests/acceptance --selectProjects unit` → 4 suite, 162/162
- `npx jest src/quests/acceptance --selectProjects integration --runInBand` → 2 suite, 81/81
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 31/31 (real boot con il nuovo import)
- `npm run build` exit 0; `git diff --exit-code src/schema.gql` exit 0; `npx eslint` pulito sui 6 file
- Criteri di accettazione: `export type LaneMovement` ×1; `planAuto(` ×1 e `scheduler.schedule(` ×1 nel service; `async accept(` ×1; `TravelPlanningModule` presente nel modulo, nessun `import .*PushModule`, 0 `PushModule` nell'array `imports`; `automatic travel to the quest marker` ×1; `activeTravel { road { coordinates distance } startTime endTime duration to }` ×1 e `getQueueToken(TRAVEL_QUEUE)` ×1 nell'int-spec del resolver; nessun `Co-Authored-By`

## Casi esistenti toccati (effetto collaterale del salto)

Nessuna asserzione Phase 7/08-06 ha dovuto cambiare: nessun caso della corsia standard leggeva `status.location` dopo l'accettazione e i casi che contano i WARN (`requiredPoints` non valido, slot non validi) rifiutano prima del movimento. Le accettazioni standard esistenti con marker non persistito ora saltano sul marker ed emettono il WARN del planner nei log del test (atteso, D-03). Nessun caso rimosso.

## Deviations from Plan

None - plan executed exactly as written. Precisazioni:
- Il caso `refuses a second standard quest while travelling to the first` è un `it` autonomo subito dopo il primo caso (accetta la prima hunt e poi la seconda) invece di dipendere dallo stato del test precedente, perché `afterEach` svuota il DB.
- Il pre-create delle collection `pets`, `pointsofinterest`, `roads` usa `connection.createCollection(name).catch(() => undefined)` e la pulizia la collection nativa, così i casi esistenti restano verdi anche nel RED (prima che i modelli fossero registrati).

## Known Stubs

None.

## Threat Flags

None: nessuna superficie nuova oltre al threat model (T-08-51..T-08-55 coperti dai test indicati; nessun resolver o campo GraphQL nuovo).

## Self-Check: PASSED
