---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 13
subsystem: travel
tags: [ambush, mount, on-foot, food, jobs, sdl]
requires: ["23-10", "23-11", "23-12"]
provides:
  - "src/travel/ambush/ambush-on-foot.ts: isMountFallen, onFootTravelOf, onFootFoodOf"
  - "residualRoadOf condiviso fra ripiego della deviazione e strada a piedi"
  - "AmbushOutcomePlan.travelAfter.rewritten, AmbushOutcomePlan.onFootFood.arrivesAlive (per il piano 14)"
  - "AmbushReport.onFoot: Boolean! sul filo"
affects: ["23-14"]
tech-stack:
  added: []
  patterns: ["viaggio riscritto con la forma della deviazione", "rimappa per km senza tiri", "job riallineati dopo il commit"]
key-files:
  created:
    - src/travel/ambush/ambush-on-foot.ts
    - src/travel/ambush/ambush-on-foot.spec.ts
    - src/travel/ambush/ambush-on-foot.int-spec.ts
  modified:
    - src/travel/ambush/ambush-detour.ts
    - src/travel/ambush/ambush-detour.spec.ts
    - src/travel/ambush/ambush-plan.ts
    - src/travel/ambush/ambush-plan.spec.ts
    - src/travel/ambush/ambush-food.ts
    - src/travel/ambush/ambush-results.ts
    - src/travel/ambush/ambush-results.spec.ts
    - src/travel/ambush/ambush-resolution.service.ts
    - src/travel/ambush/ambush-resolution.int-spec.ts
    - src/models/quest-result/quest-result.model.ts
    - src/models/quest-result/quest-result.schema.spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Strada a piedi solo in un'imboscata VINTA in cui il compagno sconfitto è activeTravel.mount.pet; fattore illeggibile = 1 (nessun allungamento)"
  - "Il piano del cibo nuovo nasce solo se il viaggio ne aveva uno valido; la dispensa dopo lo stop si legge col catalogo che AmbushFood ora porta"
  - "Prossima imboscata rimappata solo se km' è in (0, residua); altrimenti nessuna"
metrics:
  duration: "~45 min"
  completed: 2026-11-14
---

# Phase 23 Plan 13: Strada residua a piedi Summary

Quando la cavalcatura fotografata alla partenza cade in un'imboscata vinta, il viaggio si riscrive dal punto dell'imboscata (`startTime` = istante dell'imboscata, durata residua × `factor`), si mangia come a uno stop, si ripianifica il cibo a piedi, si rimappa per km la prossima imboscata senza tiri e i job si riallineano al nuovo `startTime`; `AmbushReport.onFoot: Boolean!` lo dice al filo e la push aggiunge «, prosegui a piedi».

## Task

| Task | Esito | Commit |
|------|-------|--------|
| 1 modulo puro + sonda A3 | RED → GREEN | f45fee1a, 87f23739 |
| 2 ramo a piedi nel piano + `onFoot` | RED → GREEN | 1b72a87f, 0e93fe0c |
| 3 job riallineati, int-spec, SDL | RED → GREEN | de70bf9c, ab26b78c |
| 4 bookkeeping | docs | (commit `docs(phase-23): record plan 13 progress`) |

## Esito della sonda A3

**Superata, nessun pasto doppio né fame contata due volte.** Unit (`ambush-on-foot.spec.ts`, «settles the new leg at arrival with one meal and the hunger counted once (A3)»): `settlementOf` all'arrivo sul tratto riscritto dà `lifeAfter = hpBefore − plan.hpLost` e `consumed = plan.consumed`. A DB (`ambush-on-foot.int-spec.ts`, «arrives on foot and settles the new food plan once (D-13, A3)»): 73 cibi da 20, 3 mangiati allo stop del km 30, 70 all'arrivo, fame 210 contata una volta (vita dopo lo scontro − 210), dispensa vuota.
Osservazione: se il pasto del confine era già avvenuto prima del punto (imboscata nel tratto scoperto), la dispensa è già esaurita (selectFood mangia tutto quando non copre), quindi il piano a piedi non trova cibo da ricontare: coerente con «arrivare al punto e ripartire».

## Fallimenti RED attesi

- Task 1: modulo `./ambush-on-foot` assente; `residualRoadOf is not a function`.
- Task 2: 13 fallimenti (9 casi del ramo a piedi e `travelAfter`/report senza `rewritten`/`onFoot` nella spec del piano, 2 in ambush-results.spec, 1 nello schema di QuestResult).
- Task 3: solo «moves the completion job and the next ambush job to the new travel (Pitfall 5)» (`travelQueue.removed` vuoto).

## Casi verdi al primo colpo (motivo)

- Int-spec del Task 3 «rewrites the travel on foot…», «tells the rest of the road on foot in the push», «keeps the travel of a journey without a departure mount», «arrives on foot…»: il ramo a piedi, il campo `onFoot` e il testo della push esistono già dal Task 2 / piano 11; l'int-spec li prova a DB.
- Pin SDL di `type AmbushReport` in `test/app.int-spec.ts`: il boot reale rigenera `src/schema.gql` prima di leggerlo e il `@Field` era già nel codice dal Task 2 (trappola nota del piano 11). Lo SDL rigenerato (+1 riga `onFoot: Boolean!`) è committato in ab26b78c.
- Sonda A3 (vedi sopra).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `AmbushFood.catalog`**
- **Found during:** Task 2
- **Issue:** il piano puro non aveva il catalogo del cibo per costruire le pile della dispensa dopo lo stop (`stacksOf`).
- **Fix:** `AmbushFood` porta `catalog: readonly FoodCatalogEntry[]` (quello già letto in sessione da `ambushFoodOf`); nessuna I/O nuova.
- **Files modified:** src/travel/ambush/ambush-food.ts (fuori da `files_modified`)
- **Commit:** 0e93fe0c

**2. [Rule 3 - Blocking] attese esistenti col blocco `ambush`**
- `ambush-results.spec.ts` (draft con `onFoot: false`, +1 caso) e `ambush-resolution.int-spec.ts:312` (blocco `ambush` con `onFoot: false`) aggiornati; il secondo nel commit RED del Task 3 (fuori da `files_modified`). `quest-result.schema.spec.ts` +1 caso sul default.

**3. Firma di `onFootTravelOf`**
- `travel: AmbushTravelSnapshot & { mount?: unknown }` invece di `{ pet?; factor? } | null`: lo snapshot letto dal DB è `unknown` (`AmbushTravelSnapshot.mount?: unknown`), la lettura del fattore è difensiva nel modulo.

**4. `afterCommit` accetta `Pick<travelAfter, 'startTime' | 'endTime' | 'ambush'>`** così `skip` non deve inventare `rewritten`.

## Note per il piano 14

- `plan.onFootFood?.arrivesAlive === false` = il personaggio non arriverebbe vivo a piedi (D-16); null senza piano del cibo o fuori dal ramo a piedi.
- `plan.travelAfter.rewritten === true` attiva `moveTravelJobs` (cancel vecchio `startTime`, schedule, scheduleAmbush della rimappata).
- La sconfitta con cavalcatura caduta usa ancora `detour.petSpeed` (deviazione a piedi = piano 14, C-11); `report.onFoot` resta `false` in sconfitta.
- Grep di bookkeeping: `Plan: 13 of 18` (senza zero iniziale, come da brief).

## Test eseguiti

- Unit: `src/travel` 26 suite / 287 test; `src/travel/ambush` + `src/models/quest-result` 17 / 149.
- Integration: `src/travel/ambush` + `test/app.int-spec.ts` 6 suite / 172 (boot reale incluso); travel-completion + travel.service + schema quest-result 3 / 103.
- `tsc` 0; SDL solo additivo (righe tolte vs `2c462cbe` = solo `useItem`), `mount` assente dallo SDL.

## Self-Check: PASSED

- File creati presenti: ambush-on-foot.ts, ambush-on-foot.spec.ts, ambush-on-foot.int-spec.ts.
- Commit presenti: f45fee1a, 87f23739, 1b72a87f, 0e93fe0c, de70bf9c, ab26b78c.
