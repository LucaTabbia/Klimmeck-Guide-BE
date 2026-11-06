---
phase: 15-imboscate-in-viaggio
plan: 10
subsystem: travel/ambush (suite d'integrazione del ciclo completo)
tags: [travel, ambush, integration, BE-AMBUSH-07, D-01, D-02, D-03, D-05, D-08, D-11, D-12, D-13, D-15, D-16, D-17]
requires: [15-09]
provides:
  - "suite `describe('ambush lifecycle (replSet)'` in src/travel/ambush/ambush-lifecycle.int-spec.ts (16 casi, 6 + 10 nel describe annidato `defeats, thresholds and triggers`)"
  - "helper dei tiri `AMBUSH_MISS`, `AMBUSH_HIT`, `SINGLE_FIRST_CANDIDATE`, `rollsHittingKm(km, fromKm = 0)` in test/travel/ambush-world.ts"
  - "opzione `createApp` di `createOutcomeHarness` (default `createAuthTestApp`) in test/quests/outcome-world.ts"
affects: [15-11, 15-12]
tech-stack:
  added: []
  patterns:
    - "harness del ciclo completo: `createOutcomeHarness({ createApp: createCharactersTestApp, imports: [TravelModule, AmbushModule, QuestAcceptanceModule, QuestResultsModule], travelQueue })`"
    - "trigger a mano: `AmbushSweeper.sweep()`, `TravelSweeper.sweep()`, `AmbushProcessor.handle({ id, data })` col job preso da `FakeTravelQueue.added`, `AmbushSweeper.onApplicationBootstrap()` + polling"
key-files:
  created:
    - src/travel/ambush/ambush-lifecycle.int-spec.ts
  modified:
    - test/travel/ambush-world.ts
    - test/quests/outcome-world.ts
key-decisions:
  - "La query del personaggio (D-17, D-15) richiede `CharactersResolver`: `createOutcomeHarness` accetta `createApp` invece di duplicare gli override in un harness nuovo"
  - "Il viaggiatore del ciclo parte con `xp: 0, level: 1`: lo xp del fixture (20 000) farebbe salire il livello alla prima vittoria, fuori dalla fascia dei nemici del mondo"
duration: ~25 min
completed: 2026-11-06
---

# Phase 15 Plan 10: suite d'integrazione del ciclo delle imboscate — Summary

Sedici casi su replica set coprono D-16 dalla mutation `startTravel`/`acceptQuest` fino a `unacknowledgedQuestResults`, `questResultReceived` e `acknowledgeQuestResult`. Usano `FixedClock`, `SequenceChance` e `ScriptedCombatResolver`. Nessun difetto di produzione: tutti i casi sono verdi al primo colpo, una volta corretto l'harness.

## Performance

- Durata: ~25 min (2026-11-06)
- Task: 3 (2 di spec + bookkeeping)
- File: 1 creato, 2 modificati (più i documenti di bookkeeping)

## Accomplishments

- **Task 1** (`550df43`), 6 casi: due vittorie con risorteggio e due report consegnati in ordine di `at` prima di un risultato di quest successivo (D-02, D-13); effetti subito e report trattenuto (D-17); `ActiveTravel` sul filo identico in ogni passo, introspezione compresa (D-15); subscription solo al proprietario e conferma (D-13); completamento che aspetta l'imboscata e viene ri-accodato (D-13); due `resolve` concorrenti che danno `won` e `stale`, un solo report e il rame accreditato una volta sola (D-05).
- **Task 2** (`3ede6d8`), 10 casi: sconfitta su un viaggio di quest con `PendingQuest` cancellata, posto liberato, deviazione e push verso Crocevia, report `failure` con `reachedCity` all'arrivo e push `travelEnd` (D-11, D-12, D-13); sconfitta al km 16 che prosegue verso la meta Borgo (D-11, D-12); un solo push per una vittoria seguita da una sconfitta (D-12); notte contro giorno a Roma (D-01); cambio d'ora del 2026-03-29 (D-01); niente sorteggio sotto i 10 km né risorteggio con meno di 10 km residui (D-03); job duplicato, in anticipo e obsoleto dopo il teleport senza effetti (D-05); reconciler al boot e sweep (D-05); teleport che consegna e annulla l'imboscata pendente (D-02, D-13); pool non componibile al livello 20 (D-08).

## Sequenze di tiri usate (fallback 0.99 = nessun colpo)

- Partenza: `rollsHittingKm(k)` = k−1 mancati poi `0` (colpo al km k). Risoluzione: `SINGLE_FIRST_CANDIDATE` = `[0, 0]` (forma singola, primo candidato), poi il risorteggio `rollsHittingKm(m, k)` = m−k−1 mancati poi `0`.
- Due vittorie: `[...rollsHittingKm(3), 0, 0, ...rollsHittingKm(9, 3), 0, 0]`. Km 3: bandito, nearCity Alba. Km 9: lupo, nearCity Crocevia. Sugli 11 km residui nessun colpo.
- Sconfitta sulla quest: `[...rollsHittingKm(10), 0, 0]` con `willEnd('failure')`. Sconfitta verso la meta e completamento ritardato: `[...rollsHittingKm(16), 0, 0]`.
- Notte/giorno e DST: `[0.004]`, compreso fra il rischio del giorno 0.002 e quello della notte 0.006. 2026-10-21T20:00Z (22:00 a Roma): imboscata al km 1. 10:00Z: nessuna. 2026-03-28T03:30Z: km 1 alle 05:30 locali. 2026-03-29T03:30Z: nessuna (06:30 locali).
- Soglia: Alba → Erta nessun tiro (`chance.drawn` vuoto). Km 11: dopo la vittoria i tiri sono esattamente 11 + 2.
- Livello 20: si caricano solo i tiri della partenza, perché con il fallback nessun branco di draghi si compone (TRAPPOLA DEL DRAGO). Lo sweep conta 0 (skipped), il viaggio resta invariato e all'arrivo non c'è nessun risultato.

## Fallimenti osservati (RED)

- Primo run del Task 1: 3 casi rossi, `sweep()` restituiva 0 alla seconda imboscata. La diagnosi con `resolve` diretto ha dato `skipped` e centinaia di tiri della composizione. Causa: `buildCharacter().status.xp` è 20 000 con `level: 1`; la progressione della prima vittoria ricalcola il livello dallo xp e lo porta fuori dalla fascia 4–7. È un problema dell'harness, non un bug di produzione: il servizio applica la progressione come prescrive D-10. Correzione: `xp: 0, level: 1` nel viaggiatore del ciclo.
- Task 2: verde al primo colpo. I comportamenti esistono dai piani 03–09 e questa suite li prova insieme.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `createOutcomeHarness` con l'opzione `createApp`**
- **Found during:** Task 1
- **Issue:** la query `character(id)` di D-17/D-15 vive in `CharactersResolver`, montato solo da `createCharactersTestApp`; `createOutcomeHarness` usava sempre `createAuthTestApp`.
- **Fix:** opzione `createApp?: (options: AuthTestAppOptions) => Promise<AuthTestApp>` (default invariato) in test/quests/outcome-world.ts, fuori da `files_modified` del piano.
- **Commit:** `550df43`

**2. [Rule 3 - Blocking] xp del viaggiatore**: vedi «Fallimenti osservati». La correzione sta solo nella spec.

Nessun fix di produzione: lo SDL non cambia.

## Next Phase Readiness

La suite gira in ~8,5 s. Il gate 15-11 la include nella suite completa.

## Self-Check: PASSED
- src/travel/ambush/ambush-lifecycle.int-spec.ts presente; commit `550df43` e `3ede6d8` presenti in `git log`.
