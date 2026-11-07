---
phase: 15-imboscate-in-viaggio
plan: 09
subsystem: results (contratto SDL) + travel (completamento, teleport)
tags: [results, travel, ambush, graphql, BE-AMBUSH-02, BE-AMBUSH-06, D-02, D-13, D-14, D-23]
requires: [15-03, 15-06, 15-07, 15-08]
provides:
  - "`QuestResultKind { quest, ambush }` registrato su GraphQL (src/models/enums/quest-result-kind.enum.ts)"
  - "`AmbushCity`, `AmbushCitySchema`, `AmbushReport`, `AmbushReportSchema` e `QuestResult.kind`/`ambush`/`quest` nullable in src/models/quest-result/quest-result.model.ts"
  - "`AmbushResultDraft`, `ambushResultDraftsOf(reports, characterId)` in src/travel/ambush/ambush-results.ts"
  - "`completionFilter` che aspetta l'imboscata pendente; `COMPLETION_PROJECTION`/`TELEPORT_PROJECTION` estese"
  - "`TravelCompletionService` e `TravelService.teleport` che inseriscono i report trattenuti nella stessa transazione"
  - "fixture `buildAmbushReport(overrides)` in test/travel/ambush-report.fixture.ts"
affects: [15-10, 15-11, 15-12]
tech-stack:
  added: []
  patterns:
    - "`required` condizionale legato a `kind` con funzioni nominate `isQuestResult`/`isAmbushResult`"
    - "`create(drafts, { session, ordered: true })` per gli inserimenti multipli in sessione (Pitfall 4)"
    - "teleport transazionale con esito in variabile esterna azzerata a ogni retry"
key-files:
  created:
    - src/models/enums/quest-result-kind.enum.ts
    - src/travel/ambush/ambush-results.ts
    - src/travel/ambush/ambush-results.spec.ts
    - test/travel/ambush-report.fixture.ts
  modified:
    - src/models/quest-result/quest-result.model.ts
    - src/models/quest-result/quest-result.schema.spec.ts
    - src/quests/results/quest-result.populate.ts
    - src/quests/results/quest-result.populate.spec.ts
    - test/quests/quest-result.fixture.ts
    - test/app.int-spec.ts
    - src/schema.gql
    - src/travel/travel.updates.ts
    - src/travel/travel.updates.spec.ts
    - src/travel/travel-completion.service.ts
    - src/travel/travel-completion.int-spec.ts
    - src/travel/travel.module.ts
    - src/travel/travel.service.ts
    - src/travel/teleport.resolver.int-spec.ts
key-decisions:
  - "Le tre guardie `not.toMatch(/\\bkind\\b/)` di test/app.int-spec.ts diventano `kindLinesOf(schema)` uguale a `['  kind: QuestResultKind!']`: l'unico `kind` sul filo è quello dei risultati, il kind interno del viaggio resta fuori"
  - "`unpopulatedResultOf` risponde `kind: quest` e `ambush: null`: senza, il campo non nullo `kind` sarebbe mancato sul filo per le risposte senza populate"
  - "`ambushResultDraftsOf` ordina per `at`, a parità per `resultId` esadecimale"
  - "Il completamento consegna i report in un metodo privato `deliverHeldReports` chiamato subito dopo il `before` (prima di `arriveOnMarker`)"
  - "STATE.md `Plan: 9 of 12` (formato del file e del brief), non `Plan: 09 of 12` del piano"
metrics:
  duration: ~20 min
  completed: 2026-11-06
---

# Phase 15 Plan 09: contratto dei report d'imboscata e consegna all'arrivo e al teleport Summary

`QuestResult` guadagna `kind` (`quest` | `ambush`), `ambush { at nearCity reachedCity }` e `quest` nullable (l'unica riga tolta dallo SDL rispetto a `develop`); i report trattenuti nel viaggio diventano `QuestResult` di tipo `ambush` nella stessa transazione del completamento (che ora aspetta l'imboscata pendente) e del teleport del GM, diventato transazionale, che rimuove anche il job dell'imboscata.

## Task

| Task | Nome | Commit |
| ---- | ---- | ------ |
| 1 RED | contratto SDL e schema dei risultati | d3303f4 |
| 1 GREEN | `QuestResultKind`, `AmbushCity`/`AmbushReport`, `quest` nullable, SDL rigenerato | 664129f |
| 2 RED | consegna all'arrivo | 91cdf75 |
| 2 GREEN | `ambushResultDraftsOf`, filtro e proiezione, inserimento in transazione | d0b090f |
| 3 RED | consegna e annullamento al teleport | fd7667e |
| 3 GREEN | teleport transazionale | e3181d3 |

## SDL contro `origin/develop`

Riga tolta (l'unica): `  quest: QuestResultQuest!`.

Righe aggiunte: `type AmbushCity { id: ID! name: String! }`, `type AmbushReport { at: DateTime! nearCity: AmbushCity! reachedCity: AmbushCity }`, in `type QuestResult` `  ambush: AmbushReport`, `  kind: QuestResultKind!`, `  quest: QuestResultQuest`, `enum QuestResultKind { ambush quest }` (più `  ambushDefeat` del piano 07). Ordine dei valori dell'enum al boot: alfabetico, `ambush` poi `quest` (A1 confermata). `type ActiveTravel` e `type QuestResultQuest` identici.

## Fallimenti RED osservati

- Task 1: `quest-result.schema.spec.ts` 3 rossi (`kind` undefined sul legacy idratato; `quest` richiesto anche per `kind: ambush`; `ambush` non richiesto); `test/app.int-spec.ts` 3 rossi (blocco `type QuestResult`, tipi nuovi assenti; le guardie del `kind` nei test del viaggio e della coda dell'oste rosse per costruzione dopo il cambio dell'helper, verdi col nuovo SDL).
- Task 1 (deviazione): `quest-result.populate.spec.ts` `answers a quest kind without an ambush block (D-14)` rosso (`kind` undefined) prima della correzione di `unpopulatedResultOf`.
- Task 2: `ambush-results.spec.ts` rosso per modulo mancante; `travel.updates.spec.ts` 2 rossi (filtro e proiezioni); `travel-completion.int-spec.ts` 3 rossi (nessun risultato inserito; completamento con imboscata pendente; nessun risultato col push). `completes a travel in flight before the deploy without ambush fields (D-13)` verde al primo colpo: è una regressione che fissa il comportamento esistente (un viaggio senza chiavi d'imboscata completava già).
- Task 3: `teleport.resolver.int-spec.ts` 2 rossi (nessun risultato; job dell'imboscata non rimosso). `still refuses the teleport during a standard quest and keeps the reports (D-13)` verde al primo colpo: il filtro del teleport rifiutava già a corsia occupata senza scrivere nulla.

## Nomi e firme creati

- `export enum QuestResultKind { quest = 'quest', ambush = 'ambush' }` + `registerEnumType(QuestResultKind, { name: 'QuestResultKind' })`.
- `quest-result.model.ts`: `AmbushCity { id: Types.ObjectId (ref City); name: string }`, `AmbushCitySchema`; `AmbushReport { at: Date; nearCity: AmbushCity; reachedCity: AmbushCity | null }`, `AmbushReportSchema`; `QuestResult.kind: QuestResultKind` (default `quest`), `QuestResult.quest: QuestResultQuest | null` (default null, `required: isQuestResult`), `QuestResult.ambush: AmbushReport | null` (default null, `required: isAmbushResult`).
- `ambush-results.ts`: `interface AmbushResultDraft` (28 chiavi, forma dell'interfaccia del piano), `ambushResultDraftsOf(reports: readonly AmbushReportDraft[], characterId: Types.ObjectId): AmbushResultDraft[]`.
- `travel.updates.ts`: `CompletedSnapshot.status.activeTravel.ambushReports?: AmbushReportDraft[]`; `completionFilter` con `'status.activeTravel.ambush': null`; `COMPLETION_PROJECTION` + `'status.activeTravel.ambushReports': 1`; `TELEPORT_PROJECTION` + `'status.activeTravel.ambush': 1`, `'status.activeTravel.ambushReports': 1`.
- `TravelCompletionService`: costruttore + `@InjectModel(QuestResult.name) questResultModel` dopo `userModel`; privato `deliverHeldReports(before, characterId, session)`.
- `TravelService`: costruttore + `@InjectModel(QuestResult.name) questResultModel` dopo `poiModel` (`ambushPlanner` resta ultimo); privati `teleportInSession`, `unteleportedError`, `cancelTravelJobs`.
- `TravelModule` `forFeature` + `{ name: QuestResult.name, schema: QuestResultSchema }`.
- `test/travel/ambush-report.fixture.ts`: `buildAmbushReport(overrides: Partial<AmbushReportDraft> = {}): AmbushReportDraft` (vittoria presso Crocevia alle 08:30Z, un lupo, 1 argento e 50 rame, 47 xp, rookie).

## Lettori TypeScript di `quest`

Nessun lettore di produzione legge `result.quest`; le due int-spec (`aid-timeout.int-spec.ts`, `quest-generation-trigger.int-spec.ts`) leggono via `lean<any>` e compilano senza modifiche. L'unico punto rotto da tsc è stato `unpopulatedResultOf` (mancavano `kind` e `ambush`), corretto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `unpopulatedResultOf` senza `kind`/`ambush`**
- **Found during:** Task 1 (tsc TS2739)
- **Issue:** la risposta senza populate non avrebbe avuto `kind` (non nullo sul filo)
- **Fix:** `kind: QuestResultKind.quest`, `ambush: null` + test `(D-14)` rosso prima
- **Files modified:** src/quests/results/quest-result.populate.ts, src/quests/results/quest-result.populate.spec.ts
- **Commit:** 664129f

**2. [Rule 3 - Blocking] guardie `\bkind\b` in test/app.int-spec.ts**
- **Found during:** Task 1 RED
- **Issue:** tre asserzioni vietavano qualsiasi `kind` nello SDL (pensate per il kind interno del viaggio); il contratto ne aggiunge uno
- **Fix:** helper `kindLinesOf` + `ONLY_RESULT_KIND`: l'unica riga con `kind` è `  kind: QuestResultKind!`
- **Commit:** d3303f4

**3. [Rule 3 - Fixture] `test/travel/ambush-report.fixture.ts` fuori da `files_modified`**
- **Issue:** nessun builder di report trattenuti esisteva; serve alle tre spec del piano
- **Commit:** 91cdf75

**4. Casi in più:** `keeps the reached city of a defeat (D-13, D-14)` e `answers no drafts without held reports (D-13)` in ambush-results.spec.ts; titoli dei test esistenti di filtro/proiezioni estesi con `(D-13)`.

Nessuna modifica a `aid-timeout.int-spec.ts` e `quest-generation-trigger.int-spec.ts` (non necessaria). `mixed-ref-paths.spec.ts` verde senza modifiche.

## Gates

- `npx tsc --noEmit -p tsconfig.json` 0 dopo ogni task.
- unit: `src/migrations src/models src/quests/results` 19 suite / 182 test; `src/travel` 22 / 184.
- integration: `test/app.int-spec.ts` 76/76; `src/quests/results src/quests/outcomes src/quests/generation` 20 / 201; `src/travel` 10 / 169; `test/app.int-spec.ts src/quests/results` 7 / 131.
- prettier e eslint puliti sui file toccati (warning pre-esistente `no-base-to-string` a test/app.int-spec.ts:977, non toccato).
- `git diff --exit-code src/schema.gql` 0; `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` = `-  quest: QuestResultQuest!`.
- `EXPECTED_OWNER_ONLY_HANDLERS` invariato (nessuna query/mutation nuova).

## Threat Flags

Nessuna superficie nuova oltre al threat model (T-15-29..T-15-33): la consegna passa dalla pipeline owner-only esistente.

## Known Stubs

Nessuno.

## Self-Check: PASSED
