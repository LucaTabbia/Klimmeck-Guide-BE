---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 14
subsystem: travel
tags: [ambush, travel, food, companion, hunger]
requires: ["23-13"]
provides:
  - "AmbushOutcomePlan.redirected: deviazione per fame verso la città più vicina dopo il ricalcolo a piedi"
  - "deviazione a piedi in sconfitta col compagno caduto (BASE_SPEED, ripiego × factor)"
affects: [ambush-resolution, ambush-push, quest-result]
tech-stack:
  added: []
  patterns: ["piano puro con ramo nuovo, nessuna I/O nel callback, nessun tiro"]
key-files:
  created: []
  modified:
    - src/travel/ambush/ambush-plan.ts
    - src/travel/ambush/ambush-plan.spec.ts
    - src/travel/ambush/ambush-on-foot.ts
    - src/travel/ambush/ambush-resolution.service.ts
    - src/travel/ambush/ambush-on-foot.int-spec.ts
decisions:
  - "In sconfitta `report.onFoot` = compagno equipaggiato sconfitto (la deviazione passa a BASE_SPEED); in vittoria resta la cavalcatura della partenza caduta (piano 13)"
  - "Senza deviazione nell'input (`detour` null, solo nelle spec unitarie) nessun ridirezionamento: si prosegue a piedi verso la meta"
  - "Il piano ridiretto espone `onFootFood: { arrivesAlive: false }` e `travelAfter.rewritten: true` (job riallineati da `moveTravelJobs`, nessuna imboscata)"
metrics:
  duration: "~35 min"
  completed: 2026-11-14
---

# Phase 23 Plan 14: Fame dopo il ricalcolo e deviazione a piedi Summary

Un'imboscata vinta in cui cade la cavalcatura della partenza e dopo la quale, a piedi, il personaggio non arriverebbe vivo (`planTravelFood(...).arrivesAlive === false`) riscrive il viaggio verso la città più vicina per strada (`fight.detour`), senza cibo né imboscate, con la corsia standard abbandonata nella stessa transazione, `reachedCity` nel report e la push «; la fame ti porta verso <città>»; in un'imboscata persa col compagno caduto la deviazione va a piedi.

## Cosa è cambiato

- `ambush-plan.ts`: `AmbushOutcomePlan.redirected: boolean`. Helper privati `companionFell`, `residualDurationOf`, `detourTravelOf` (ex `defeatTravelOf`: velocità `BASE_SPEED` se il compagno equipaggiato è sconfitto, altrimenti `detour.petSpeed`, sempre × `travelSpeedFactorOf(ferite)`; ripiego `residualMs × paceFactorOf(mount)` se `isMountFallen`), `detourWriteOf` (filtro con `defeatSettlementOf`, `$set` comune + viaggio + corsia liberata) condiviso da `defeatPlanOf` e dal nuovo `redirectPlanOf` (premi, `$addToSet` e monete della vittoria; pasto dello stop già mangiato; `report.reachedCity = detour.reachedCity`; `travelAfter = { at, endTime, ambush: null, rewritten: true }`).
- `onFootPlanOf`: se `input.detour && meal && !meal.plan.arrivesAlive` → `redirectPlanOf`.
- `planAmbushOutcome`: `onFoot = won ? mountFallenIn(...) : companionFell(fought)`.
- `ambush-on-foot.ts`: `paceFactorOf(mount)` esportato (fuori da files_modified, Rule 3).
- `AmbushResolutionService.fight`: `abandonLane` anche con `plan.redirected`; log `Imboscata <jobId> risolta: won, ridiretto verso <città>` (privato `wonMessageOf`). I job passano dal ramo `rewritten` del piano 13.

## TDD

- RED Task 1 (`efc7d37c`): 6 casi falliti come atteso (`redirected` assente, deviazione a `petSpeed`, ripiego non allungato, `onFoot` false in sconfitta); verde al primo colpo `keeps the pet speed on a detour when the companion survives (D-29)` (comportamento già vero: è il controllo positivo).
- RED Task 2 (`0cc0733a`): fallito solo `redirects to the nearest city and abandons the quest ...` (PendingQuest non cancellata: 1 invece di 0). Verdi al primo colpo, perché il piano puro del Task 1 era già committato: `moves the jobs ...` (rewritten true → `moveTravelJobs` con `ambush: null`), `tells the hunger redirection in the push` (`reachedCity` nel report vinto accende il testo da sé, piano 11), `walks the detour ...`, `rides the detour ...` (controllo positivo), `goes on foot to the goal ...` (controllo positivo).

## Deviazioni dal piano

1. **[Rule 1] caso «writes onFoot false on every other ambush (D-28)» del piano 13**: la sconfitta del terzo input aveva il compagno caduto, che ora (C-11, punto fermo dell'orchestratore) vale `onFoot` true; il compagno ora resta in piedi (`companionLifeAfter: 4`) e il caso controlla anche `redirected` false.
2. **[Rule 3] `paceFactorOf` esportato** da `ambush-on-foot.ts` per il ripiego della deviazione (stessa lettura del fattore della strada a piedi).
3. Caso int in più rispetto al piano: `rides the detour of a lost ambush whose companion stands (D-29, C-11)` (controllo positivo della velocità della cavalcatura).

## Verifica

- Unit `src/travel/ambush`: 16 suite / 131 test verdi. Int `src/travel/ambush`: 5 suite / 76 test verdi (`ambush-on-foot.int-spec` 11). `tsc` 0. `git diff --exit-code src/schema.gql` pulito. `pgrep -fl 'bin/jest'` vuoto.
- Grep: `redirected` in ambush-plan.ts 5, `BASE_SPEED` 3; `D-16)` nella spec 5, `C-11)` 2; `plan.redirected` nel servizio 2; `D-16` nell'int-spec 5.
- STATE: `Plan: 14 of 18` (senza zero iniziale, come i piani precedenti).

## Self-Check: PASSED
