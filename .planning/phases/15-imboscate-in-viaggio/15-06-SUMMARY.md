---
phase: 15-imboscate-in-viaggio
plan: 06
subsystem: travel/ambush (risoluzione dell'imboscata, ramo vittoria)
tags: [travel, ambush, BE-AMBUSH-02, BE-AMBUSH-03, BE-AMBUSH-04, D-02, D-03, D-05, D-08, D-10, D-12, D-13, D-20, D-24]
requires: [15-01, 15-02, 15-03, 15-04, 15-05]
provides:
  - "`ambushFilter(identity, now)`, `ambushSkipUpdate(next)`, `nextAmbushEntry(next)` in src/travel/ambush/ambush.updates.ts"
  - "`planAmbushOutcome(input)` e i tipi `AmbushCity`, `AmbushTravelSnapshot`, `AmbushCharacterSnapshot`, `AmbushReportDraft`, `DetourDraft`, `AmbushPlanInput`, `AmbushOutcomePlan` in src/travel/ambush/ambush-plan.ts"
  - "`AmbushResolutionService.resolve(identity): Promise<AmbushOutcome>` (`'won' | 'lost' | 'skipped' | 'stale'`)"
  - "`AmbushModule` (solo il servizio, non montato)"
  - "`createOutcomeHarness` con `travelQueue` e `overrides`; `persistAmbushEnemies`, `persistTraveller`, `AMBUSH_ROUTE_KM`, `AMBUSH_ROUTE_DURATION_MS` nel mondo delle imboscate"
affects: [15-07, 15-08, 15-10]
tech-stack:
  added: []
  patterns:
    - "Composizione, risorteggio e proprietario fuori dal callback; combattimento e scritture dentro (Pitfall 10)"
    - "Esito in variabile esterna azzerata a ogni retry, `StaleResolution` come no-op"
key-files:
  created:
    - src/travel/ambush/ambush.updates.ts
    - src/travel/ambush/ambush.updates.spec.ts
    - src/travel/ambush/ambush-plan.ts
    - src/travel/ambush/ambush-plan.spec.ts
    - src/travel/ambush/ambush-resolution.service.ts
    - src/travel/ambush/ambush-resolution.int-spec.ts
    - src/travel/ambush/ambush.module.ts
  modified:
    - test/quests/outcome-world.ts
    - test/travel/ambush-world.ts
key-decisions:
  - "Il servizio scrive l'update del personaggio con `OutcomeWriter.writeCharacterUpdate` (lancia `StaleResolution` se il filtro non combacia) invece di un `findOneAndUpdate` a mano: stessa semantica, nessuna duplicazione"
  - "Senza proprietario, con pool non componibile, senza città vicina o con catalogo vuoto: stesso ramo `skip` (update condizionale con `ambushFilter`, poi `afterCommit`), proprietario mancante ⇒ prossima imboscata `null`"
  - "`afterCommit` gira anche dopo un salto: senza imboscate pendenti e con `endTime` passato ri-accoda il `complete` (Pitfall 1)"
  - "STATE.md `Plan: 6 of 12` (formato del file e del brief), non `Plan: 06 of 12` del piano"
metrics:
  duration: "~35 min"
  completed: 2026-11-06
---

# Phase 15 Plan 06: risoluzione dell'imboscata, ramo vittoria Summary

`AmbushResolutionService` risolve un'imboscata una sola volta: POI più vicino, città, composizione degli assalitori, risorteggio e proprietario fuori dalla transazione; snapshot in sessione, combattimento con la porta `CombatResolver`, piano puro `planAmbushOutcome` e monete via `WalletService` dentro; dopo il commit job della prossima imboscata o ri-accodo del completamento, e recuperi delle magie ancorati ad `at`. Nessun push in vittoria.

## Task

| Task | Commit | Descrizione |
| ---- | ------ | ----------- |
| 1 | eaf2487, 3ac748b | RED/GREEN `ambushFilter`, `ambushSkipUpdate`, `planAmbushOutcome` |
| 2 | d89806e, 00d3e3c | RED/GREEN harness + mondo, `AmbushResolutionService`, `AmbushModule` |
| 3 | (questo commit) | bookkeeping |

## RED osservati

- Task 1: 2 suite rosse con `Cannot find module './ambush.updates'` / `'./ambush-plan'` (nessun test eseguito).
- Task 2: 1 suite rossa con `Cannot find module './ambush-resolution.service'`.
- Tutti gli 11 casi integration verdi alla prima esecuzione dopo il GREEN; aggiunta a posteriori l'asserzione `chance.drawn` = `[0, 0, 0]` nel caso del risorteggio per fissare l'ordine dei tiri.

## Firme create

```typescript
// src/travel/ambush/ambush.updates.ts
export function ambushFilter(identity: AmbushIdentity, now: Date): Record<string, unknown>;
export function ambushSkipUpdate(next: DrawnAmbush | null): { $set: Record<string, unknown> };
export const nextAmbushEntry: (next: DrawnAmbush | null) => { at: Date; km: number; attempts: number } | null;

// src/travel/ambush/ambush-plan.ts (tipi come nell'interfaces del piano)
export function planAmbushOutcome(input: AmbushPlanInput): AmbushOutcomePlan;

// src/travel/ambush/ambush-resolution.service.ts
export type AmbushOutcome = 'won' | 'lost' | 'skipped' | 'stale';
export class AmbushResolutionService { resolve(identity: AmbushIdentity): Promise<AmbushOutcome> }
```

## Sequenze di `SequenceChance` (fallback 0.99)

- Ordine dei tiri: 1. composizione (`composeAmbushEnemies`: forma, `< 0.5` singolo, poi la scelta nel pool ordinato per id); 2. risorteggio (`drawFrom` dal km: un tiro per km residuo, colpo sotto 0.002/0.006); 3. proprietario e combattimento scriptato senza tiri.
- `[0, 0]`: singolo, primo candidato (km 10 → lupo, pool zona forest = lupo + bandito; km 1 → bandito, pool zona city); nessun colpo dopo.
- `[0, 0, 0]`: come sopra più il colpo al km 11 (nuovo `ambush.km` 11).
- Livello 20 (`xp` 50000, fascia 394–803): nessuna sequenza caricata; tutto 0.99 ⇒ branco a 3 tipi mai nella fascia (massimo 5 + 6 + 6 × 50 = 311), nessun singolo ⇒ `skipped`, risorteggio a vuoto ⇒ `ambush` `null`.

## Numeri misurati

- R1 Alba → Borgo: `AMBUSH_ROUTE_KM` ≈ 20.015, `AMBUSH_ROUTE_DURATION_MS` = `durationMsOf(km, 10)`; partenza 10:00Z, imboscata al km 10 alle ≈ 20:00Z.
- Vittoria rookie: rame +150, xp 0 → 45 (40 + lupo 5); legend: rame +3750, xp 1005; xp 249 → 294, livello 2, titolo fermo.
- Km 10 → `nearCity` Crocevia (forestPoi); km 1 → Alba (marker).

## Gate

- `npx jest src/travel/ambush --selectProjects unit`: 10 suite / 47 test verdi.
- `npx jest src/travel/ambush src/quests/outcomes --selectProjects integration --runInBand`: 12 suite / 128 test verdi (~44 s).
- `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts src/travel/travel.service.int-spec.ts --selectProjects integration --runInBand` (utenti di ambush-world.ts): 2 suite / 124 test verdi.
- `npx tsc --noEmit -p tsconfig.json`: 0. Prettier ed eslint puliti sui nove file.
- `git diff --exit-code src/schema.gql`: 0; nessuna riga cambiata rispetto a `origin/develop`.

## Deviations from Plan

**1. [Rule 2 - Guardia] Sconfitta con deviazione rifiutata dal piano puro**
- **Found during:** Task 1
- **Issue:** con la sola guardia «sconfitta senza deviazione» una sconfitta con `detour` avrebbe prodotto l'update della vittoria.
- **Fix:** seconda guardia `throw new Error('ambush defeat not planned yet')` per ogni verdetto diverso da `success`; il piano 07 la sostituisce col ramo `failure`.
- **Files modified:** src/travel/ambush/ambush-plan.ts — **Commit:** 3ac748b

**2. [Rule 2 - Casi limite] Ramo `skip` unico**
- **Found during:** Task 2
- **Issue:** il piano non copriva città vicina assente né catalogo vuoto (nemico cancellato fra composizione e lettura), e il salto senza proprietario non ri-accodava il completamento scaduto.
- **Fix:** città assente o catalogo vuoto ⇒ salto con risorteggio come D-08; ogni salto passa da `afterCommit` (prossima imboscata o `complete` se `endTime` è passato).
- **Files modified:** src/travel/ambush/ambush-resolution.service.ts — **Commit:** 00d3e3c

**3. [Rule 3 - Harness] `travelQueue` come opzione dell'harness**
- `createOutcomeHarness` accetta `travelQueue` (aggiunge da sé l'override di `getQueueToken(TRAVEL_QUEUE)`, la espone e la azzera in `reset`) oltre a `overrides` generici in coda.

Altro: `pgrep -fl jest` mostra solo lo script di sorveglianza dell'orchestratore (`watch-jest.sh` nello scratchpad), nessun processo jest.

## Known Stubs

- `planAmbushOutcome` e `AmbushResolutionService.fight` lanciano sulla sconfitta (`ambush defeat not planned yet` / `ambush defeat not wired`): intenzionale, il ramo `failure` è del piano 07.

## Threat Flags

Nessuna superficie nuova: il servizio non è esposto al client né montato (piano 08). T-15-15..T-15-19 mitigati come da piano (filtro d'identità con `StaleResolution`, HP clampati, monete solo via wallet in sessione, caso fuori dal callback, log con soli id e nomi di città).

## Self-Check: PASSED

- File creati presenti; commit eaf2487, 3ac748b, d89806e, 00d3e3c presenti in `git log`.
