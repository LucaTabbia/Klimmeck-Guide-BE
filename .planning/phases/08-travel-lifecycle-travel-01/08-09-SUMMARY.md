---
phase: 08-travel-lifecycle-travel-01
plan: 09
subsystem: travel
tags: [travel, completion, transaction, push, sweeper, reconciler]
requires:
  - "08-05: completionFilter, COMPLETION_UPDATE, COMPLETION_PROJECTION, questCountdownFilter/Update, dueTravelsFilter, DUE_TRAVEL_PROJECTION, travelJobId, travelConfigProvider"
  - "Phase 5: PushModule, PushService.sendToUser, travelEnd"
provides:
  - "src/travel/travel-completion.service.ts: TravelCompletionService.complete(identity): Promise<CompletionOutcome>, CompletionOutcome"
  - "src/travel/travel-sweeper.ts: TravelSweeper (reconciler al boot + sweep periodico single-flight, sweep(): Promise<number>)"
  - "src/travel/travel.module.ts: TravelModule (Character/PendingQuest/User, PushModule, TRAVEL_CONFIG, Clock locale; esporta TravelCompletionService e TravelSweeper) — non ancora in AppModule"
  - "test/travel/active-travel.fixture.ts: buildActiveTravelDoc"
affects: [08-10, 08-12, 08-13]
tech-stack:
  added: []
  patterns:
    - "completamento come unico findOneAndUpdate condizionale con pipeline in connection.transaction, esito azzerato all'inizio del callback (retry WriteConflict)"
    - "effetti collaterali (push) solo dopo il commit e solo per la chiamata il cui update ha matchato"
    - "reconciler di boot + setInterval unref single-flight (modello EventSubSubscriptionManager)"
key-files:
  created:
    - src/travel/travel-completion.service.ts
    - src/travel/travel-sweeper.ts
    - src/travel/travel-sweeper.spec.ts
    - src/travel/travel.module.ts
    - src/travel/travel-completion.int-spec.ts
    - test/travel/active-travel.fixture.ts
  modified: []
key-decisions:
  - "Completamento sempre in connection.transaction: il documento before (proiezione kind + pendingQuest) decide countdown della quest (stessa session) e push"
  - "Esito della transazione in un holder { completed } azzerato a inizio callback: niente narrowing a never e niente esiti fantasma dopo un retry"
  - "TravelSweeper: completamenti in serie, errore di un personaggio loggato con solo id + codice (code string/number, altrimenti error.name) e lo sweep continua"
  - "TravelModule esporta anche TravelSweeper (test del boot di 08-10); PUSH_CONFIG sovrascritto nei test con serviceAccount null"
metrics:
  duration: 12 min
  completed: 2026-10-21
  tasks: 2
  files: 6
---

# Phase 8 Plan 09: Completamento idempotente del viaggio e sweeper Summary

`TravelCompletionService.complete` completa un viaggio scaduto con un solo update condizionale (identità `startTime`+`endTime`, `endTime ≤ clock.now()`, personaggio attivo) dentro `connection.transaction`, avvia nella stessa transazione il countdown della quest a `endTime` pianificato se `startDate` è ancora null e, solo per `kind: free` e solo se il proprio update ha matchato, invia `travelEnd(characterId)` al proprietario dopo il commit; `TravelSweeper` riusa la stessa routine al boot (mai atteso) e periodicamente (`setInterval` unref, single-flight, `0` = off). `TravelModule` nasce qui, non ancora montato in `AppModule`.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | TravelCompletionService (update condizionale, countdown quest, push solo viaggio libero) | fe03953 (RED), 78ba10d (GREEN) |
| 2 | TravelSweeper (reconciler al boot, sweep periodico single-flight) | d0b3b8d (RED), d94804c (GREEN) |

## TDD evidence (RED)

- Task 1: `npx jest src/travel/travel-completion.int-spec.ts --selectProjects integration --runInBand` → `Tests: 9 failed, 9 total`, ogni caso con `not implemented` (modulo cablato, corpo del service stub).
- Task 2: `npx jest src/travel/travel-sweeper.spec.ts --selectProjects unit` → `Tests: 4 failed, 4 total`; int-spec → `Tests: 3 failed, 10 passed, 13 total` (sweep restituisce 0, boot non completa entro la deadline). `pushes once when the sweep races a job trigger` era già verde nel RED: con lo sweep stub l'unico a completare è il trigger del job, quindi il test resta una guardia di regressione contro la doppia push piuttosto che una prova del RED.

## Verification

- `npx jest src/travel --selectProjects unit` → 5 suite, 61/61 verdi
- `npx jest src/travel/travel-completion.int-spec.ts --selectProjects integration --runInBand` → 13/13 verdi (boot reconciler in ~200 ms)
- `npm run build` exit 0; `git diff --exit-code src/schema.gql` exit 0; eslint pulito sui 6 file
- Criteri di accettazione Task 1: `completionFilter(` riga 57, `returnDocument: 'before'` riga 61, `travelEnd(` riga 111 (una ciascuno); `sendToUser` ×1 (solo in `notifyOwner`); la `connection.transaction` si apre alla riga 52 e si chiude alla riga 83, `notifyOwner(` è chiamato alla riga 94 (dopo il commit); nessun `publish(`; 9 casi `it(` nel describe principale
- Criteri di accettazione Task 2: `.unref()` ×1, `void this.sweepSafely()` ×2, `dueTravelsFilter(` ×1, nessun `$$NOW`; `TravelSweeper` presente in `travel.module.ts`; test `completes an expired travel at boot` presente
- `AppModule` e `test/app.int-spec.ts` non toccati; nessun `Co-Authored-By` nei commit

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `import type` per `TravelConfig` nel costruttore decorato**
- **Found during:** Task 2 GREEN (`npm run build`)
- **Issue:** TS1272 (`isolatedModules` + `emitDecoratorMetadata`): un tipo in una firma decorata va importato con `import type`. Il commit RED d0b3b8d compila sotto ts-jest ma non con `nest build`.
- **Fix:** `import type { TravelConfig }` separato da `TRAVEL_CONFIG`.
- **Files modified:** src/travel/travel-sweeper.ts
- **Commit:** d94804c

**2. [Rule 1 - Lint] `codeOf` senza stringificazione di oggetti**
- **Issue:** `String(code ?? …)` segnalato da `@typescript-eslint/no-base-to-string`.
- **Fix:** il codice viene usato solo se stringa o numero, altrimenti `error.name` / `'unknown'`.
- **Commit:** d94804c

### Note

- Nel RED del Task 2 `TravelSweeper` è stato registrato già nei providers ed export di `TravelModule` (come in 08-08): serviva per far fallire l'int-spec sul comportamento e non sulla risoluzione DI. Lo stub di `sweep()` restituisce `Promise.resolve(0)` (un `Promise.reject` lasciava una rejection non gestita che faceva cadere Jest nel test single-flight).
- Il test di boot ha un timeout esplicito di 30 s (deadline di polling 10 s, oltre il default di Jest di 5 s).
- Nell'int-spec anche `PUSH_CONFIG` è sovrascritto (`{ serviceAccount: null }`) come in `push.resolver.int-spec.ts`, così `firebase-admin` non viene mai coinvolto.
- Il test `completes every expired travel and leaves the others` avanza il `FixedClock` condiviso di un'ora e lo riporta indietro in un `finally`.

## Known Stubs

None.

## Self-Check: PASSED
