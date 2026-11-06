---
phase: 15-imboscate-in-viaggio
plan: 07
subsystem: travel/ambush (ramo di sconfitta) + push (categoria `ambushDefeat`)
tags: [travel, ambush, push, BE-AMBUSH-05, D-03, D-11, D-12, D-13, D-25]
requires: [15-02, 15-05, 15-06]
provides:
  - "`PushEventType.ambushDefeat` (ultimo membro dell'enum), voce di catalogo e builder `ambushDefeat(characterId, cityName)` in src/push/push-events.ts; SDL additivo"
  - "`detourFallbacksOf(coordinates, segment)` e `residualDetourOf({ travel, point, segment, reachedCity, petSpeed })` in src/travel/ambush/ambush-detour.ts"
  - "`DetourDraft` nella forma definitiva `{ road; to; reachedCity; baseHours: number | null; residualMs: number | null; petSpeed }`"
  - "ramo `failure` di `planAmbushOutcome` e di `AmbushResolutionService.resolve` (esito `'lost'`)"
affects: [15-08, 15-09, 15-10, 15-12]
tech-stack:
  added: []
  patterns:
    - "Rotta della deviazione calcolata fuori dal callback della transazione, prima del combattimento (Pitfall 10)"
    - "Abbandono della corsia standard nella stessa sessione con `unstartedSeatReleaseOf`"
key-files:
  created:
    - src/travel/ambush/ambush-detour.ts
    - src/travel/ambush/ambush-detour.spec.ts
  modified:
    - src/push/push-event-type.enum.ts
    - src/push/push-events.ts
    - src/push/push-events.spec.ts
    - src/push/push.exception.spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
    - src/travel/ambush/ambush-plan.ts
    - src/travel/ambush/ambush-plan.spec.ts
    - src/travel/ambush/ambush-resolution.service.ts
    - src/travel/ambush/ambush-resolution.int-spec.ts
key-decisions:
  - "La deviazione si calcola per ogni combattimento prima della transazione (il verdetto non è noto fuori dal callback): un `nearestByTime` (~ms) per imboscata combattuta"
  - "Ripiego D-25: `reachedCity` = città del POI della meta (`nearCityOf` sul POI di `travel.to`), altrimenti la `nearCity` dell'imboscata"
  - "Il push di prova di `ambushDefeat` tiene il corpo generico del catalogo: lo spec `testPushMessage(%s) reuses the catalog copy` non confronta il corpo per i tipi con corpo composto (`COMPOSED_BODY_TYPES`)"
  - "Un combattimento senza esito (`battleOf` null) lancia `ambush combat without a verdict` (prima cadeva nel throw del ramo non cablato)"
  - "STATE.md `Plan: 7 of 12` (formato del file e del brief), non `Plan: 07 of 12` del piano"
metrics:
  duration: "~30 min"
  completed: 2026-11-06
---

# Phase 15 Plan 07: ramo di sconfitta dell'imboscata Summary

Sconfitta in una sola transazione (HP ≥ 1, ferite, nessun premio né `awaitingAid`), viaggio riscritto dal punto verso la città più vicina per strada (`RoadsService.nearestByTime` dai vertici della polilinea, ripiego sulla strada residua verso la meta per D-25), corsia standard abbandonata in sessione e push `ambushDefeat` col nome della città dopo il commit; `PushEventType.ambushDefeat` additivo nello SDL.

## Task

| Task | Nome | Commit |
| ---- | ---- | ------ |
| 1 | categoria push `ambushDefeat` e SDL additivo (D-12) | `fe6ff00` (RED), `8ffea76` (GREEN + schema) |
| 2 | piano puro della sconfitta e della deviazione | `8645c52` (RED), `e461b80` (GREEN) |
| 3 | sconfitta nel servizio: rotta, corsia, push | `06bde6b` (RED), `2bf561d` (GREEN) |
| 4 | bookkeeping | commit `docs(phase-15): record plan 07 progress` |

## RED osservati

- Task 1: `push-events.spec.ts` non carica (`TypeError: (0 , push_events_1.ambushDefeat) is not a function`); `push.exception.spec.ts` rosso sulla lista dell'enum. Il boot reale non è stato lanciato in RED (avrebbe rigenerato lo schema identico): la riga `'  ambushDefeat\n'` è verde dal GREEN.
- Task 2: `Cannot find module './ambush-detour'`; 7 casi del piano rossi su `ambush defeat not planned yet`.
- Task 3: 10 casi nuovi rossi su `ambush defeat not wired`; gli 11 casi del piano 06 verdi.

## Firme create

- `src/push/push-event-type.enum.ts`: `ambushDefeat = 'ambushDefeat'` dopo `questCancelled`.
- `src/push/push-events.ts`: `CATALOG[ambushDefeat] = { type, title: 'Imboscata!', body: 'Sei stato sconfitto: la via torna verso la città più vicina.', ttlSeconds: PERSONAL_TTL_SECONDS }`; `IDENTIFIED_TYPES` + `ambushDefeat`; `export const ambushDefeat = (characterId: string, cityName: string): PushMessage` (corpo `Sei stato sconfitto: la via torna verso ${cityName}`).
- `src/travel/ambush/ambush-detour.ts`: `detourFallbacksOf(coordinates: readonly LonLat[], segment: number): LonLat[]` (`[coordinates[segment], coordinates[segment − 1]]` esistenti, senza duplicati); `residualDetourOf(input: { travel: AmbushTravelSnapshot; point: LonLat; segment: number; reachedCity: AmbushCity; petSpeed: number }): DetourDraft`.
- `src/travel/ambush/ambush-plan.ts`: `DetourDraft { road; to; reachedCity; baseHours: number | null; residualMs: number | null; petSpeed: number }`; privati `defeatTravelOf`, `defeatPlanOf`; il primo statement di `planAmbushOutcome` lancia ora `ambush defeat needs the reached city` (sconfitta senza `detour`). Sconfitta: `$set` = comune + `'status.activeTravel'` intero (`road, startTime: at, endTime, duration, to, kind: free, ambushReports: [...trattenuti, report]`) + `'quests.pendingQuest': null` solo se lo snapshot ne ha una; nessun `$push`; `travelAfter = { startTime: at, endTime, ambush: null }`; velocità `petSpeed × travelSpeedFactorOf(ferite dopo il combattimento)`.
- `src/travel/ambush/ambush-resolution.service.ts`: costruttore con in più `@InjectModel(PendingQuest.name)`, `@InjectModel(Quest.name)` (dopo `User`), `RoadsService`, `TravelPlanner`, `PushService` (dopo `TravelScheduler`, prima di `Clock`); `AmbushPlace` porta anche `point`, `segment`, `pois`, `cities`; `Fight.detour: DetourDraft`; privati `detourOf(snapshot, place, nearCity, jobId)`, `abandonLane(snapshot, session)`, `afterDefeat(fight, plan)`; funzione pura `markerTargetsOf(cities, pois): RouteTarget[]`.

## Numeri misurati

- km 10: punto `[0, 4.496608…]`, deviazione `[[0, 4.4966…], [0, 4.5], [2, 4.5]]`, 4.434085 km, durata 15 962 705 ms a velocità 10; con `brokenLeftLeg` 19 953 381 ms (× 1/0.8); `at` 19:59:59.999Z → `endTime` 2026-10-22T00:26:02.704Z.
- km 16: punto `[0, 7.19457…]` aggancia `[0, 6.75]`: rotta `[[0, 7.1946], [0, 6.75], [0, 9]]` (torna indietro al nodo), 5.003772 km, 18 013 578 ms, meta Borgo.
- km 1: deviazione di lunghezza zero verso il marker di Alba, `duration` 0, `endTime = at`, job `complete` con `delay` 0.

## Gate

- `npx tsc --noEmit -p tsconfig.json` 0 a fine di ogni task.
- `npx jest src/push src/travel/ambush --selectProjects unit`: 21 suite, 208 test verdi.
- `npx jest src/travel/ambush src/push test/app.int-spec.ts --selectProjects integration --runInBand`: 4 suite, 132 test verdi (ambush-resolution 21).
- prettier + eslint puliti sui file `.ts` toccati; `git diff --exit-code src/schema.gql` 0; `git diff origin/develop -- src/schema.gql`: una riga aggiunta (`  ambushDefeat`), nessuna tolta.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Lo spec `testPushMessage(%s) reuses the catalog copy` confrontava il corpo col builder**
- **Found during:** Task 1 (GREEN)
- **Issue:** il builder `ambushDefeat(id, 'Crocevia')` compone il corpo con la città, il push di prova tiene quello generico (D-12): il confronto del corpo non può valere per questo tipo.
- **Fix:** `COMPOSED_BODY_TYPES = [PushEventType.ambushDefeat]`; il corpo si confronta solo per gli altri tipi (il corpo generico è pinnato dal caso `keeps a generic ambush defeat body for the test push (D-12)`).
- **Files modified:** src/push/push-events.spec.ts
- **Commit:** `8ffea76`

**2. [Rule 1 - Numeri di fixture] Nessuna ferita reale vale 0.5**
- **Found during:** Task 2 e 3
- **Issue:** il piano chiedeva una ferita con `speedFactor` 0.5 («durata doppia»); i fattori reali sono `movementImpairment` 0.8 e `paralysis` 0.9 (fatti del piano 05).
- **Fix:** `brokenLeftLeg` (0.8): unit `durationMsOf(4.434, 8)`; int-spec `woundedDuration ≈ soundDuration / 0.8`.
- **Commit:** `8645c52`, `06bde6b`

**3. [Rule 1] Messaggio dell'errore di guardia rinominato**
- **Issue:** il gate vuole `ambush defeat requires a detour` assente ma la guardia «sconfitta senza deviazione» resta utile.
- **Fix:** messaggio `ambush defeat needs the reached city`.
- **Commit:** `e461b80`

**4. [Rule 2] Combattimento senza esito**
- **Issue:** togliendo il throw del ramo non cablato, `battleOf` null non aveva più un ramo.
- **Fix:** `throw new Error('ambush combat without a verdict')` (il job ritenta; il fail-open al terzo errore è del piano 08).
- **Commit:** `2bf561d`

Nessun'altra deviazione; nessun subject oltre i 72 caratteri.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova oltre al registro del piano (T-15-20..T-15-24): push al solo `userId` risolto da `ownersOf`, corpo col solo nome della città; posto liberato con `startedAt: null` in sessione; WARN del ripiego coi soli id.

## Self-Check: PASSED

- File: `src/travel/ambush/ambush-detour.ts`, `src/travel/ambush/ambush-detour.spec.ts` presenti.
- Commit: `fe6ff00`, `8ffea76`, `8645c52`, `e461b80`, `06bde6b`, `2bf561d` in `git log`.
