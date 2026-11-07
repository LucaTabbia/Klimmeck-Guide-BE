---
phase: 15-imboscate-in-viaggio
plan: 08
subsystem: travel/ambush (trigger: processor Bull, sweeper, indice) + AppModule
tags: [travel, ambush, bull, sweep, BE-AMBUSH-02, D-05, D-18, D-19]
requires: [15-03, 15-06, 15-07]
provides:
  - "`CHARACTER_ACTIVE_TRAVEL_AMBUSH_INDEX = 'character_active_travel_ambush'` su `{ deletedAt: 1, 'status.activeTravel.ambush.at': 1 }` (verificato al boot da `SweepIndexVerifier`)"
  - "`dueAmbushesFilter(now)`, `DUE_AMBUSH_PROJECTION`, `AMBUSH_ATTEMPT_UPDATE` in src/travel/ambush/ambush.updates.ts"
  - "`AmbushProcessor` (`@Processor(TRAVEL_QUEUE)`, `@Process(AMBUSH_JOB) handle(job)`)"
  - "`AmbushSweeper` (reconciler al boot, sweep single-flight in serie, fail-open al terzo errore) esportato da `AmbushModule`"
  - "`AmbushModule` montato in `AppModule` subito dopo `TravelModule`; `TravelModule` non lo importa"
affects: [15-09, 15-10, 15-11, 15-12]
tech-stack:
  added: []
  patterns:
    - "Gemello di `TravelSweeper`: `setInterval(...).unref()` su `TRAVEL_CONFIG.sweepIntervalMs`, reconciler mai atteso, `inFlight` single-flight"
    - "Fail-open con contatore persistito (`ambush.attempts`) e identità riaffermata da `ambushFilter`"
key-files:
  created:
    - src/travel/ambush/ambush.processor.ts
    - src/travel/ambush/ambush.processor.spec.ts
    - src/travel/ambush/ambush-sweeper.ts
    - src/travel/ambush/ambush-sweeper.int-spec.ts
    - src/travel/ambush/ambush.processor.int-spec.ts
  modified:
    - src/models/character/character.model.ts
    - src/mongo/sweep-index.verifier.int-spec.ts
    - src/models/sweep-indexes.schema.spec.ts
    - src/travel/ambush/ambush.updates.ts
    - src/travel/ambush/ambush.updates.spec.ts
    - src/travel/ambush/ambush.module.ts
    - src/app.module.ts
    - test/quests/outcome-world.ts
key-decisions:
  - "`sweep()` conta come risolte solo gli esiti `won` e `lost` (`skipped`/`stale` no)"
  - "Il fail-open usa l'`attempts` letto dalla proiezione dello sweep (+1): sotto `AMBUSH_MAX_ATTEMPTS` incrementa con `AMBUSH_ATTEMPT_UPDATE`, al terzo annulla con `ambushSkipUpdate(null)`; entrambi con `ambushFilter(identity, now)`"
  - "`createOutcomeHarness` con `travelQueue` spegne anche lo sweep periodico delle imboscate (`TRAVEL_CONFIG` a 0): senza, il timer reale da 60 s di `AmbushSweeper` correrebbe accanto ai test di risoluzione"
  - "La prova su Redis reale riusa `createOutcomeHarness` intero (non un modulo bare): `persistTraveller` vuole un `AuthTestApp`, e gli override del harness silenziano già code degli esiti, push e sweeper delle quest"
  - "STATE.md `Plan: 8 of 12` (formato del file e del brief), non `Plan: 08 of 12` del piano"
metrics:
  duration: "~15 min"
  completed: 2026-11-06
---

# Phase 15 Plan 08: trigger dell'imboscata Summary

Processor Bull `ambush` sulla coda `travel` accanto a `complete`, `AmbushSweeper` con reconciler al boot, sweep single-flight in serie e fail-open al terzo errore (D-18), indice `character_active_travel_ambush` verificato al boot (D-19), `AmbushModule` montato in `AppModule` senza cambi SDL; prova su Redis reale verde.

## Task

| Task | Nome | Commit |
| ---- | ---- | ------ |
| 1 RED | indice e filtri dello sweep | `d81b7d7` |
| 1 GREEN | indice e filtri dello sweep | `3cfff8c` |
| 2 RED | processor e sweeper | `8ffa1f0` |
| 2 GREEN | processor, sweeper, montaggio | `b2afa02` |
| 3 | prova su Redis reale | `343a09f` |

## Fallimenti RED osservati

- Task 1: `sweep-index.verifier.int-spec.ts` `builds the sweep indexes at boot (D-17b)` rosso (atteso `undefined` in coda all'array: la costante non esisteva); `sweep-indexes.schema.spec.ts` rosso sulla voce nuova; `ambush.updates.spec.ts` `(0 , ambush_updates_1.dueAmbushesFilter) is not a function` e `Cannot convert undefined or null to object` (proiezione assente). 4 unit rossi su 15.
- Task 2: `Cannot find module './ambush.processor'` e `Cannot find module './ambush-sweeper'` (suite rosse, 0 test).
- Task 3: verde al primo colpo, come previsto dal piano (il codice è del Task 2): prova d'integrazione.

## Nomi e firme creati

- `src/models/character/character.model.ts`: `export const CHARACTER_ACTIVE_TRAVEL_AMBUSH_INDEX = 'character_active_travel_ambush'` + `CharacterSchema.index({ deletedAt: 1, 'status.activeTravel.ambush.at': 1 }, { name })`.
- `src/travel/ambush/ambush.updates.ts`: `dueAmbushesFilter(now: Date): Record<string, unknown>` = `{ ...ACTIVE_CHARACTER_FILTER, 'status.activeTravel.ambush.at': { $lte: now } }`; `DUE_AMBUSH_PROJECTION` (`startTime`, `endTime`, `ambush` di `status.activeTravel`); `AMBUSH_ATTEMPT_UPDATE = { $inc: { 'status.activeTravel.ambush.attempts': 1 } }`.
- `src/travel/ambush/ambush.processor.ts`: `AmbushProcessor(resolution: AmbushResolutionService, clock: Clock)`, `handle(job: Job<AmbushJobData>): Promise<void>`; WARN `Job d'imboscata <id> malformato: ignorato`; log `Job <ambushJobId> in anticipo: lo risolverà lo sweep`.
- `src/travel/ambush/ambush-sweeper.ts`: `AmbushSweeper(@Inject(TRAVEL_CONFIG) config, @InjectModel(Character.name) characterModel, resolution: AmbushResolutionService, scheduler: TravelScheduler, clock: Clock)`; `onApplicationBootstrap()`, `onModuleDestroy()`, `sweep(): Promise<number>`; ERROR `Imboscata <jobId> fallita (tentativo <n>): <describeError>` e `Imboscata <jobId> annullata dopo <n> errori: <describeError>`; log `Sweep delle imboscate: <n> risolte`; ERROR `Sweep delle imboscate fallito: <describeError>`. All'annullamento, se `endTime ≤ now`, `scheduler.schedule(id, { startTime, endTime })`.
- `AmbushModule`: providers `Clock→SystemClock`, `travelConfigProvider`, `AmbushResolutionService`, `AmbushProcessor`, `AmbushSweeper`; exports `AmbushResolutionService`, `AmbushSweeper`.

## Esito su Redis reale

`ambush.processor.int-spec.ts` (createOutcomeHarness + `BullModule.forRoot` sul Redis effimero + `TravelModule` + `AmbushModule`, `SystemClock`, `TRAVEL_CONFIG` a 0, `SequenceChance([], 0.99)` caricata con `[0, 0]`):
- `processes the ambush job beside the travel completion on the same queue (D-05)` verde in ~1,3 s: imboscata al km 16 a `now + 1 s`, report trattenuto e `ambush` cambiato; un `complete` per un altro viaggio scaduto completa sulla stessa coda (posizione = marker di Borgo).
- `ignores a duplicated ambush job id on the real queue (D-05)` verde in ~2,8 s: due `scheduleAmbush` con la stessa identità prima dell'istante → un solo report, un solo combattimento.
- Polling 100 ms, deadline 15 s, finestra negativa 1,5 s; suite ~7 s.

## Montaggio senza cambi SDL

Boot reale (`test/app.int-spec.ts`) verde con `AmbushModule` in `AppModule`; `git diff --exit-code src/schema.gql` 0; rispetto a `origin/develop` resta la sola riga `+  ambushDefeat`. `grep -c AmbushModule src/travel/travel.module.ts` = 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Sweep periodico delle imboscate nei harness con coda finta**
- **Found during:** Task 2
- **Issue:** con `AmbushSweeper` dentro `AmbushModule`, `ambush-resolution.int-spec.ts` (e la spec nuova) avrebbero avuto il timer reale da 60 s (`DEFAULT_SWEEP_INTERVAL_MS`) che risolve imboscate in parallelo ai test.
- **Fix:** `createOutcomeHarness` aggiunge `{ token: TRAVEL_CONFIG, useValue: { sweepIntervalMs: 0 } }` quando riceve `travelQueue` (unico chiamante: le spec delle imboscate). Il reconciler al boot gira ancora.
- **Files modified:** test/quests/outcome-world.ts (fuori da `files_modified`)
- **Commit:** `b2afa02`

**2. [Rule 3 - Blocking] tsc sulla spec RED dello sweeper**
- **Found during:** Task 2 GREEN
- **Issue:** `Traveller.travel.endTime` è `unknown` per tsc (TS18046).
- **Fix:** istante d'arrivo calcolato come `START + AMBUSH_ROUTE_DURATION_MS` (`ARRIVAL`); modifica alla spec nel commit GREEN.
- **Commit:** `b2afa02`

**3. Harness della prova Redis**
- Il piano descriveva un `Test.createTestingModule` bare con gli override; `persistTraveller`/`createPlayer` richiedono un `AuthTestApp`, quindi la spec usa `createOutcomeHarness` (stessi override, riusati e non ricopiati) con `BullModule.forRoot` negli `imports`. `QUIET_GENERATION_OVERRIDES` non serve: il harness degli esiti non monta lo sweeper della generazione. Nessun `process.env` nella spec (lo gestisce il harness).

**4. STATE.md** `Plan: 8 of 12` come da brief dell'orchestratore e formato del file (il verify del Task 4 cercava `Plan: 08 of 12`).

## Gates

- `npx jest src/travel/ambush src/models/character --selectProjects unit`: 120/120.
- `npx jest src/travel/ambush src/mongo/sweep-index.verifier.int-spec.ts src/travel/travel-completion.processor.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand`: 6 suite, 111/111.
- `npx tsc --noEmit -p tsconfig.json`: 0. Prettier + eslint puliti sui file toccati.

## Known Stubs

Nessuno.

## Self-Check: PASSED

File creati presenti; commit `d81b7d7`, `3cfff8c`, `8ffa1f0`, `b2afa02`, `343a09f` presenti nel log.
